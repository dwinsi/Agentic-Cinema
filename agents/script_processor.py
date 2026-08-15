"""
Script Processor Agent — Phase 2 RAG & Grounding Pipeline

Responsibilities:
  1. Parse PDF / plain-text scripts using Gemini multimodal API
  2. Chunk raw text and generate real text-embedding-004 embeddings
  3. Index documents into Vertex AI Search (Agent Builder) data store
  4. Retrieve grounding passages from Vertex AI Search for the EP agent
"""
import json
import math
import os
import time
import uuid
from typing import Any, Dict, List

from google import genai
from google.genai import types
from observability import get_logger, log_event

logger = get_logger("CineAgent.ScriptProcessor")

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "project-2154682a-9280-4a32-a72")
LOCATION = "us-central1"
DATASTORE_ID = os.getenv("VERTEX_SEARCH_DATASTORE_ID", "cineagent-scripts")
DATASTORE_LOCATION = "global"  # Vertex AI Search data stores use global location

# Chunk configuration
CHUNK_SIZE = 500        # characters per chunk
CHUNK_OVERLAP = 80      # overlap between chunks
EMBED_MODEL = "text-embedding-004"


def _get_client() -> genai.Client:
    """Returns the Vertex AI Gemini client (reuses film_crew pattern)."""
    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ and not os.path.exists(
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
    ):
        del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
    return genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)


class ScriptProcessorAgent:
    """
    End-to-end agent for script ingestion, embedding, and RAG retrieval.

    All public methods are safe to call even when GCP services are unavailable —
    they log a warning and return a safe fallback value rather than raising.
    """

    def __init__(self):
        self.client = _get_client()
        self.model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")

    # ──────────────────────────────────────────────
    # 1. PDF / Text Parsing via Gemini Multimodal
    # ──────────────────────────────────────────────

    def parse_script(self, file_bytes: bytes, mime_type: str, filename: str) -> Dict[str, Any]:
        """
        Parse a screenplay / treatment document using Gemini multimodal API.

        Sends the file inline as a Part. Returns a dict compatible with the
        film bible schema so it can be displayed immediately in the UI.

        Args:
            file_bytes: Raw bytes of the uploaded file.
            mime_type:  "application/pdf" or "text/plain".
            filename:   Original filename for logging.

        Returns:
            {
                "title": str,
                "logline": str,
                "genre": str,
                "tone": str,
                "characters": [...],
                "themes": [...],
                "raw_text_excerpt": str,   # first 3000 chars of extracted text
                "doc_id": str              # unique ID for this document
            }
        """
        started = time.perf_counter()
        doc_id = f"doc-{uuid.uuid4().hex[:12]}"
        log_event(logger, "script_parse_started", filename=filename, mime_type=mime_type,
                  file_bytes=len(file_bytes), doc_id=doc_id)

        prompt = """You are a professional script analyst.
Analyse the attached screenplay or treatment document and extract the following in JSON format:
- "title": The title of the film/script (or "Untitled" if not found)
- "logline": A one-to-two sentence summary of the central story
- "genre": Most fitting film genre (e.g. "Sci-Fi Thriller", "Drama", "Action")
- "tone": Emotional tone (e.g. "Dark & Gritty", "Cinematic & Epic", "Grounded & Realistic")
- "characters": Array of character objects, each with:
    - "name": Character name (UPPERCASE as in the script)
    - "role": "Protagonist" / "Antagonist" / "Supporting" / "Deuteragonist"
    - "archetype_description": Brief psychological profile from the script
    - "costume_design": Any described visual appearance, or "As written in script"
    - "gender": "MALE" or "FEMALE" (infer from pronouns if not stated)
    - "voice_id": "en-US-Journey-D" for MALE, "en-US-Journey-F" for FEMALE
- "themes": Array of 3-5 key thematic strings (e.g. "redemption", "corporate greed")
- "raw_text_excerpt": The first 3000 characters of the document's main text content

Respond ONLY with a valid JSON object. No markdown formatting."""

        try:
            inline_part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt, inline_part],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3,
                ),
            )
            # response.text is None when the model returns an empty/blocked response
            raw = (response.text or "").strip()
            if not raw:
                raise ValueError("Gemini returned an empty response for the script parse")
            text = raw
            if text.startswith("```"):
                parts = text.split("```")
                text = parts[1]
                if text.startswith("json"):
                    text = text[4:]

            parsed = json.loads(text)
            parsed["doc_id"] = doc_id
            parsed.setdefault("title", filename)
            parsed.setdefault("logline", "")
            parsed.setdefault("genre", "Drama")
            parsed.setdefault("tone", "Cinematic & Epic")
            parsed.setdefault("characters", [])
            parsed.setdefault("themes", [])
            parsed.setdefault("raw_text_excerpt", "")

            log_event(logger, "script_parse_completed", doc_id=doc_id, title=parsed.get("title"),
                      character_count=len(parsed.get("characters", [])),
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return parsed

        except Exception:
            logger.exception("Script parse via Gemini failed; returning fallback")
            log_event(logger, "script_parse_failed", doc_id=doc_id,
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return {
                "doc_id": doc_id,
                "title": filename,
                "logline": "Script uploaded — content could not be automatically extracted.",
                "genre": "Drama",
                "tone": "Cinematic & Epic",
                "characters": [],
                "themes": [],
                "raw_text_excerpt": "",
            }

    # ──────────────────────────────────────────────
    # 2. Real Embeddings via text-embedding-004
    # ──────────────────────────────────────────────

    def embed_text(self, text: str) -> List[float]:
        """
        Generate a real 768-dim text embedding using text-embedding-004.

        Falls back to a deterministic pseudo-random 768-dim vector if the
        API call fails, so downstream ClickHouse inserts always succeed.
        Accepts None gracefully — coerces to empty string before embedding.
        """
        import hashlib
        text = (text or "").strip()  # guard against None from callers
        if not text:
            # Empty text — return a zero-ish unit vector rather than crashing
            seed_bytes = hashlib.sha256(b"__empty__").digest()
            rng = [seed_bytes[i % 32] / 255.0 for i in range(768)]
            norm = math.sqrt(sum(v * v for v in rng)) + 1e-9
            return [v / norm for v in rng]
        try:
            result = self.client.models.embed_content(
                model=EMBED_MODEL,
                contents=text,
            )
            # result.embeddings can be None or empty if the API returns no vectors
            if result.embeddings and len(result.embeddings) > 0:
                values = result.embeddings[0].values
                if values is not None:
                    return list(values)
            raise ValueError("embed_content returned no embeddings")

        except Exception:
            logger.warning("text-embedding-004 failed; using fallback pseudo-embedding")
            seed_bytes = hashlib.sha256(text.encode()).digest()
            rng = [seed_bytes[i % 32] / 255.0 for i in range(768)]
            norm = math.sqrt(sum(v * v for v in rng)) + 1e-9
            return [v / norm for v in rng]

    def chunk_script(self, text: str) -> List[str]:
        """
        Splits script text into overlapping chunks for embedding.
        Returns at most 50 chunks to stay within reasonable API quota.
        Accepts None gracefully — returns [] for empty/None input.
        """
        text = (text or "").strip()
        if not text:
            return []
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + CHUNK_SIZE, len(text))
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start += CHUNK_SIZE - CHUNK_OVERLAP
            if len(chunks) >= 50:
                break
        return chunks

    # ──────────────────────────────────────────────
    # 3. Vertex AI Search — Index & Retrieve
    # ──────────────────────────────────────────────

    @staticmethod
    def _import_discoveryengine():
        """
        Import google-cloud-discoveryengine, trying sub-version modules in order:
          discoveryengine_v1alpha  (preferred — richer API surface)
          discoveryengine_v1       (stable GA)
          discoveryengine          (bare top-level, some older package layouts)

        Raises ImportError with a clear message if none are found so the
        caller's except block can log and return a safe fallback value.
        """
        for module_name in (
            "discoveryengine_v1alpha",
            "discoveryengine_v1",
            "discoveryengine",
        ):
            try:
                import importlib
                mod = importlib.import_module(f"google.cloud.{module_name}")
                return mod
            except ImportError:
                continue
        raise ImportError(
            "google-cloud-discoveryengine is not installed or has no usable sub-module. "
            "Run: pip install google-cloud-discoveryengine>=0.11.0"
        )

    def index_in_vertex_search(self, doc_id: str, title: str, content: str) -> bool:
        """
        Import a document into the Vertex AI Search (Discovery Engine) data store.

        The data store must be pre-created via gcloud (see deployment plan Step 2a).
        Returns True on success, False if the API or package is unavailable.
        """
        started = time.perf_counter()
        log_event(logger, "vertex_search_index_started", doc_id=doc_id, title=title)
        try:
            discoveryengine = self._import_discoveryengine()

            client = discoveryengine.DocumentServiceClient()
            parent = (
                f"projects/{PROJECT_ID}/locations/{DATASTORE_LOCATION}"
                f"/collections/default_collection/dataStores/{DATASTORE_ID}/branches/default_branch"
            )

            document = discoveryengine.Document(
                id=doc_id,
                content=discoveryengine.Document.Content(
                    raw_bytes=content.encode("utf-8"),
                    mime_type="text/plain",
                ),
                json_data=json.dumps({"title": title}),
            )

            client.create_document(
                parent=parent,
                document=document,
                document_id=doc_id,
            )
            log_event(logger, "vertex_search_index_completed", doc_id=doc_id,
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return True

        except ImportError as ie:
            logger.warning("Vertex AI Search SDK not available: %s", ie)
            log_event(logger, "vertex_search_index_skipped", doc_id=doc_id, reason="sdk_missing",
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return False
        except Exception:
            logger.warning(
                "Vertex AI Search indexing failed — data store may not be created yet. "
                "Run: gcloud services enable discoveryengine.googleapis.com",
                exc_info=True,
            )
            log_event(logger, "vertex_search_index_failed", doc_id=doc_id,
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return False

    def retrieve_from_vertex_search(self, query: str, top_k: int = 3) -> List[str]:
        """
        Query the Vertex AI Search data store for passages relevant to the query.

        Returns a list of text passage strings. Falls back to empty list if the
        SDK is missing or the data store is unavailable, so the EP agent still
        runs without grounding — zero regression on existing flow.
        """
        started = time.perf_counter()
        log_event(logger, "vertex_search_retrieve_started", top_k=top_k)
        try:
            discoveryengine = self._import_discoveryengine()

            client = discoveryengine.SearchServiceClient()
            serving_config = (
                f"projects/{PROJECT_ID}/locations/{DATASTORE_LOCATION}"
                f"/collections/default_collection/dataStores/{DATASTORE_ID}"
                f"/servingConfigs/default_config"
            )

            request = discoveryengine.SearchRequest(
                serving_config=serving_config,
                query=query,
                page_size=top_k,
                content_search_spec=discoveryengine.SearchRequest.ContentSearchSpec(
                    snippet_spec=discoveryengine.SearchRequest.ContentSearchSpec.SnippetSpec(
                        return_snippet=True,
                        max_snippet_count=2,
                    ),
                    extractive_content_spec=discoveryengine.SearchRequest.ContentSearchSpec.ExtractiveContentSpec(
                        max_extractive_answer_count=top_k,
                    ),
                ),
            )

            response = client.search(request)
            passages: List[str] = []
            for result in response.results:
                doc = result.document
                # Prefer extractive answers (higher fidelity), fall back to snippets
                for chunk in doc.derived_struct_data.get("extractive_answers", []):
                    text = chunk.get("content", "").strip()
                    if text:
                        passages.append(text)
                if not passages:
                    for snippet in doc.derived_struct_data.get("snippets", []):
                        text = snippet.get("snippet", "").strip()
                        if text:
                            passages.append(text)

            log_event(logger, "vertex_search_retrieve_completed", passage_count=len(passages),
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return passages[:top_k]

        except ImportError as ie:
            logger.warning("Vertex AI Search SDK not available: %s", ie)
            log_event(logger, "vertex_search_retrieve_skipped", reason="sdk_missing",
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return []
        except Exception:
            logger.warning("Vertex AI Search retrieval failed; proceeding without grounding",
                           exc_info=True)
            log_event(logger, "vertex_search_retrieve_failed",
                      latency_ms=round((time.perf_counter() - started) * 1000, 2))
            return []


# Global singleton
script_processor = ScriptProcessorAgent()

