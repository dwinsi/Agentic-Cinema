import os
import logging
import time
import asyncio
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
import json

import uuid

from observability import configure_logging, content_metadata, get_logger, log_event, request_id_ctx
configure_logging()

from agents.film_crew import film_crew
from agents.script_processor import script_processor
from database.clickhouse_client import ch_manager

logger = get_logger("CineAgent.App")

app = FastAPI(
    title="CineAgent Studio API",
    description="Multi-Agent AI Film Production Engine with Gemini & ClickHouse",
    version="1.0.0"
)


@app.middleware("http")
async def request_observability(request: Request, call_next):
    """Attach a request id and emit one event for every API request."""
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    token = request_id_ctx.set(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception:
        status_code = 500
        logger.exception("Unhandled request failure")
        raise
    finally:
        log_event(
            logger,
            "http_request_completed",
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        request_id_ctx.reset(token)

# Mount static files directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

class FilmConceptRequest(BaseModel):
    premise: str
    genre: str = "Sci-Fi Thriller"
    tone: str = "Cinematic & High Tension"
    doc_id: str = ""  # Optional: uploaded script document ID for RAG grounding

class ReviseSceneRequest(BaseModel):
    film_bible: dict
    scene: dict
    notes: str

class VectorSearchRequest(BaseModel):
    query: str
    limit: int = 3

class TTSRequest(BaseModel):
    text: str
    character: str
    voice_id: str = "en-US-Journey-D"
    gender: str = "MALE"
    project_id: str = ""

class GenerateImageRequest(BaseModel):
    prompt: str
    project_id: str = ""
    storyboard_id: str = ""
    title: str = ""

@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>CineAgent Studio API Server Running</h1><p>Static index.html not found.</p>"

@app.post("/api/generate-film-project")
async def generate_film_project(req: FilmConceptRequest):
    """
    Executes multi-agent film production workflow:
    1. Executive Producer Agent -> Film Bible & Characters
    2. Screenwriter Agent -> Screenplay Scenes & Dialogues
    3. Storyboard Director Agent -> Visual Shot Prompts
    4. Market Analyst Agent -> Box Office Telemetry
    5. ClickHouse Storage -> Vector Indexing
    """
    try:
        log_event(logger, "film_project_requested", genre=req.genre, tone=req.tone,
                  doc_id=req.doc_id or None, **content_metadata(req.premise, "premise"))

        # Step 0 (optional): Retrieve grounding passages from Vertex AI Search
        script_context = ""
        if req.doc_id:
            passages = script_processor.retrieve_from_vertex_search(req.premise, top_k=3)
            if passages:
                script_context = "\n\n".join(passages)
                log_event(logger, "rag_grounding_applied", doc_id=req.doc_id,
                          passage_count=len(passages))

        # Step 1: Run Executive Producer Agent (with optional script grounding)
        film_bible = film_crew.run_executive_producer(
            req.premise, req.genre, req.tone, script_context=script_context
        )

        # Step 2: Run Screenwriter Agent
        scenes = film_crew.run_screenwriter(film_bible)

        # Steps 3-6: Run Storyboard, Production Designer, Audio, and Market Analyst in PARALLEL
        res_storyboards, res_production, res_audio, res_analytics = await asyncio.gather(
            asyncio.to_thread(film_crew.run_storyboard_director, scenes),
            asyncio.to_thread(film_crew.run_production_designer, film_bible, scenes),
            asyncio.to_thread(film_crew.run_audio_department, scenes),
            asyncio.to_thread(film_crew.run_market_analyst, film_bible, scenes),
        )
        storyboards: List[Dict[str, Any]] = res_storyboards if isinstance(res_storyboards, list) else []
        production_design: List[Dict[str, Any]] = res_production if isinstance(res_production, list) else []
        audio_post: List[Dict[str, Any]] = res_audio if isinstance(res_audio, list) else []
        analytics: Dict[str, Any] = res_analytics if isinstance(res_analytics, dict) else {}

        # Step 7: Index Scenes and Dialogues into ClickHouse
        all_dialogues = []
        for idx, scene in enumerate(scenes):
            scene_id = scene.get("scene_id") or f"sc-{idx+1}"
            title    = scene.get("title") or f"Scene {idx+1}"
            heading  = scene.get("heading") or "INT. SET - DAY"
            desc     = scene.get("description") or title  # fall back to title, never None
            pacing   = scene.get("pacing_tag") or "BUILD"
            tension  = float(scene.get("tension_score") or 5.0)

            vector = script_processor.embed_text(desc)
            ch_manager.insert_scene(
                scene_id=scene_id,
                title=title,
                heading=heading,
                description=desc,
                tension=tension,
                pacing=pacing,
                vector=vector
            )

            # Collect dialogues for ClickHouse dialogues table
            for d in scene.get("dialogue", []):
                all_dialogues.append({
                    "dialogue_id": f"diag-{uuid.uuid4().hex[:8]}",
                    "scene_id": scene_id,
                    "character": d.get("character") or "UNKNOWN",
                    "line": d.get("line") or "",
                    "emotion": d.get("emotion") or ""
                })

        project_id = uuid.uuid4().hex

        # Step 8: Persist all department assets to ClickHouse tables
        ch_manager.insert_dialogues(all_dialogues, project_id=project_id)
        ch_manager.insert_storyboards(storyboards, project_id=project_id)
        ch_manager.insert_production_designs(production_design, project_id=project_id)
        ch_manager.insert_audio_posts(audio_post, project_id=project_id)

        # Step 9: Auto-register character voices into ClickHouse Voice Vault
        for c in film_bible.get("characters", []):
            ch_manager.register_character_voice(
                name=c.get("name") or "Unnamed Character",
                gender=c.get("gender") or "MALE",
                gcp_voice_name=c.get("voice_id") or "en-US-Journey-D",
                archetype=c.get("role") or c.get("archetype_description") or "Cast Member",
                sample_text=f"Dialogue track for {c.get('name')} in {film_bible.get('title', 'Film')}."
            )

        log_event(logger, "film_project_completed", scene_count=len(scenes),
                  grounded=bool(script_context))

        project_payload = {
            "film_bible": film_bible,
            "scenes": scenes,
            "storyboards": storyboards,
            "production_design": production_design,
            "audio_post": audio_post,
            "analytics": analytics,
            "clickhouse_indexed_scenes": len(scenes),
            "grounded": bool(script_context),
        }

        # Auto-save full project state to projects table
        ch_manager.save_project(
            project_id=project_id,
            title=film_bible.get("title") or "Untitled",
            genre=req.genre,
            tone=req.tone,
            premise=req.premise,
            grounded=bool(script_context),
            doc_id=req.doc_id or "",
            project_json=json.dumps(project_payload),
        )

        return JSONResponse({
            "status": "success",
            "project_id": project_id,
            "project": project_payload,
        })
    except Exception:
        logger.exception("Film project generation failed")
        raise HTTPException(status_code=500, detail="Film project generation failed")


@app.post("/api/generate-film-project-stream")
async def generate_film_project_stream(req: FilmConceptRequest):
    """
    Executes multi-agent film production workflow and streams results incrementally via Server-Sent Events (SSE).
    """
    async def event_generator():
        try:
            log_event(logger, "film_project_stream_requested", genre=req.genre, tone=req.tone,
                      doc_id=req.doc_id or None, **content_metadata(req.premise, "premise"))

            # Step 0: RAG Grounding
            script_context = ""
            if req.doc_id:
                yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'rag', 'message': 'Retrieving screenplay canon from Vertex AI Search...'})}\n\n"
                passages = script_processor.retrieve_from_vertex_search(req.premise, top_k=3)
                if passages:
                    script_context = "\n\n".join(passages)
                    log_event(logger, "rag_grounding_applied", doc_id=req.doc_id, passage_count=len(passages))

            # Step 1: Executive Producer / Showrunner Agent
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'showrunner', 'message': 'Showrunner conceiving Film Bible & World Rules...'})}\n\n"
            film_bible = await asyncio.to_thread(
                film_crew.run_executive_producer,
                req.premise, req.genre, req.tone, script_context=script_context
            )
            yield f"data: {json.dumps({'type': 'film_bible', 'data': film_bible})}\n\n"

            # Step 2: Screenwriter Agent
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'screenwriter', 'message': 'Screenwriter drafting authentic 3-act scenes and dialogue...'})}\n\n"
            scenes = await asyncio.to_thread(film_crew.run_screenwriter, film_bible)
            yield f"data: {json.dumps({'type': 'scenes', 'data': scenes})}\n\n"

            # Steps 3-6: Run all 4 specialist departments in PARALLEL and stream results as each completes!
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'storyboard', 'message': 'Parallel: Storyboard framing camera shots...'})}\n\n"
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'production_design', 'message': 'Parallel: Production Designer drafting sets & costumes...'})}\n\n"
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'audio', 'message': 'Parallel: Audio composing soundtrack & foley cues...'})}\n\n"
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'analyst', 'message': 'Parallel: Market Analyst calculating metrics...'})}\n\n"

            async def task_storyboard():
                res = await asyncio.to_thread(film_crew.run_storyboard_director, scenes)
                return ("storyboards", res)

            async def task_production():
                res = await asyncio.to_thread(film_crew.run_production_designer, film_bible, scenes)
                return ("production_design", res)

            async def task_audio():
                res = await asyncio.to_thread(film_crew.run_audio_department, scenes)
                return ("audio_post", res)

            async def task_analyst():
                res = await asyncio.to_thread(film_crew.run_market_analyst, film_bible, scenes)
                return ("analytics", res)

            storyboards: List[Dict[str, Any]] = []
            production_design: List[Dict[str, Any]] = []
            audio_post: List[Dict[str, Any]] = []
            analytics: Dict[str, Any] = {}

            tasks = [
                asyncio.create_task(task_storyboard()),
                asyncio.create_task(task_production()),
                asyncio.create_task(task_audio()),
                asyncio.create_task(task_analyst()),
            ]

            # Yield each department the instant it finishes!
            for future in asyncio.as_completed(tasks):
                event_type, result_data = await future
                if event_type == "storyboards" and isinstance(result_data, list):
                    storyboards = result_data
                elif event_type == "production_design" and isinstance(result_data, list):
                    production_design = result_data
                elif event_type == "audio_post" and isinstance(result_data, list):
                    audio_post = result_data
                elif event_type == "analytics" and isinstance(result_data, dict):
                    analytics = result_data
                yield f"data: {json.dumps({'type': event_type, 'data': result_data})}\n\n"

            # Step 7: ClickHouse Persistence & Indexing
            yield f"data: {json.dumps({'type': 'agent_start', 'agent': 'database', 'message': 'Indexing scenes and persisting assets to ClickHouse Cloud...'})}\n\n"
            all_dialogues = []
            for idx, scene in enumerate(scenes):
                scene_id = scene.get("scene_id") or f"sc-{idx+1}"
                title    = scene.get("title") or f"Scene {idx+1}"
                heading  = scene.get("heading") or "INT. SET - DAY"
                desc     = scene.get("description") or title
                pacing   = scene.get("pacing_tag") or "BUILD"
                tension  = float(scene.get("tension_score") or 5.0)

                vector = script_processor.embed_text(desc)
                ch_manager.insert_scene(
                    scene_id=scene_id,
                    title=title,
                    heading=heading,
                    description=desc,
                    tension=tension,
                    pacing=pacing,
                    vector=vector
                )

                for d in scene.get("dialogue", []):
                    all_dialogues.append({
                        "dialogue_id": f"diag-{uuid.uuid4().hex[:8]}",
                        "scene_id": scene_id,
                        "character": d.get("character") or "UNKNOWN",
                        "line": d.get("line") or "",
                        "emotion": d.get("emotion") or ""
                    })

            project_id = uuid.uuid4().hex
            ch_manager.insert_dialogues(all_dialogues, project_id=project_id)
            ch_manager.insert_storyboards(storyboards, project_id=project_id)
            ch_manager.insert_production_designs(production_design, project_id=project_id)
            ch_manager.insert_audio_posts(audio_post, project_id=project_id)

            for c in film_bible.get("characters", []):
                ch_manager.register_character_voice(
                    name=c.get("name") or "Unnamed Character",
                    gender=c.get("gender") or "MALE",
                    gcp_voice_name=c.get("voice_id") or "en-US-Journey-D",
                    archetype=c.get("role") or c.get("archetype_description") or "Cast Member",
                    sample_text=f"Dialogue track for {c.get('name')} in {film_bible.get('title', 'Film')}."
                )

            project_payload = {
                "film_bible": film_bible,
                "scenes": scenes,
                "storyboards": storyboards,
                "production_design": production_design,
                "audio_post": audio_post,
                "analytics": analytics,
                "clickhouse_indexed_scenes": len(scenes),
                "grounded": bool(script_context),
            }

            ch_manager.save_project(
                project_id=project_id,
                title=film_bible.get("title") or "Untitled",
                genre=req.genre,
                tone=req.tone,
                premise=req.premise,
                grounded=bool(script_context),
                doc_id=req.doc_id or "",
                project_json=json.dumps(project_payload),
            )

            yield f"data: {json.dumps({'type': 'complete', 'project_id': project_id, 'project': project_payload})}\n\n"
        except Exception as err:
            logger.exception("Streaming film project generation failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(err)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/upload-script")
async def upload_script(file: UploadFile = File(...)):
    """
    Upload a screenplay or treatment (PDF or TXT).

    Pipeline:
      1. Validate MIME type
      2. Parse with Gemini multimodal API → extract structured Film Bible
      3. Chunk raw text → embed each chunk with text-embedding-004
      4. Store chunks in ClickHouse script_documents table
      5. Index full document in Vertex AI Search data store

    Returns the parsed Film Bible preview and the doc_id to be passed
    back to /api/generate-film-project for RAG-grounded generation.
    """
    ALLOWED_MIME = {"application/pdf", "text/plain"}
    MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {content_type}. Upload PDF or plain-text files."
        )

    try:
        file_bytes = await file.read()
        if len(file_bytes) > MAX_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")

        started = time.perf_counter()
        log_event(logger, "script_upload_started", filename=file.filename,
                  mime_type=content_type, file_bytes=len(file_bytes))

        # 1. Parse with Gemini
        parsed = script_processor.parse_script(file_bytes, content_type, file.filename or "script")
        doc_id = parsed["doc_id"]
        raw_text = parsed.get("raw_text_excerpt", "")

        # 2. Chunk & embed → ClickHouse
        chunks = script_processor.chunk_script(raw_text) if raw_text else []
        chunks_indexed = 0
        for i, chunk in enumerate(chunks):
            embedding = script_processor.embed_text(chunk)
            ch_manager.insert_script_document(
                doc_id=doc_id,
                title=parsed.get("title", file.filename or "Untitled"),
                chunk_index=i,
                chunk_text=chunk,
                embedding=embedding,
            )
            chunks_indexed += 1

        # 3. Index in Vertex AI Search (best-effort, non-blocking)
        full_content = raw_text or parsed.get("logline", "")
        vertex_indexed = script_processor.index_in_vertex_search(
            doc_id=doc_id,
            title=parsed.get("title", file.filename or "Untitled"),
            content=full_content,
        )

        # 3. Persist metadata to uploaded_scripts table
        ch_manager.save_uploaded_script(
            doc_id=doc_id,
            filename=file.filename or "script",
            mime_type=content_type,
            title=parsed.get("title") or file.filename or "Untitled",
            logline=parsed.get("logline") or "",
            genre=parsed.get("genre") or "Drama",
            tone=parsed.get("tone") or "Cinematic & Epic",
            characters=parsed.get("characters") or [],
            themes=parsed.get("themes") or [],
            chunk_count=chunks_indexed,
            vertex_indexed=vertex_indexed,
        )

        log_event(logger, "script_upload_completed", doc_id=doc_id,
                  title=parsed.get("title"), chunks_indexed=chunks_indexed,
                  vertex_indexed=vertex_indexed,
                  latency_ms=round((time.perf_counter() - started) * 1000, 2))

        return JSONResponse({
            "status": "success",
            "doc_id": doc_id,
            "parsed_bible": {
                "title": parsed.get("title"),
                "logline": parsed.get("logline"),
                "genre": parsed.get("genre"),
                "tone": parsed.get("tone"),
                "character_count": len(parsed.get("characters", [])),
                "characters": parsed.get("characters", []),
                "themes": parsed.get("themes", []),
            },
            "chunks_indexed": chunks_indexed,
            "vertex_search_indexed": vertex_indexed,
        })
    except HTTPException:
        raise
    except Exception:
        logger.exception("Script upload failed")
        raise HTTPException(status_code=500, detail="Script upload and parsing failed")


# ── Uploaded Scripts Management ──────────────────────────────────────────────

@app.get("/api/scripts")
async def list_scripts():
    """List all uploaded screenplay/treatment metadata records."""
    try:
        scripts = ch_manager.list_uploaded_scripts()
        return JSONResponse({"status": "success", "scripts": scripts, "count": len(scripts)})
    except Exception:
        logger.exception("list_scripts failed")
        raise HTTPException(status_code=500, detail="Failed to list uploaded scripts")


@app.get("/api/scripts/{doc_id}")
async def get_script(doc_id: str):
    """Fetch metadata for a single uploaded script by doc_id."""
    try:
        script = ch_manager.get_uploaded_script(doc_id)
        if script is None:
            raise HTTPException(status_code=404, detail=f"Script '{doc_id}' not found")
        return JSONResponse({"status": "success", "script": script})
    except HTTPException:
        raise
    except Exception:
        logger.exception("get_script failed")
        raise HTTPException(status_code=500, detail="Failed to fetch script")


@app.delete("/api/scripts/{doc_id}")
async def delete_script(doc_id: str):
    """
    Delete an uploaded script and all its embedded chunks.
    Also removes the doc_id from any projects that reference it (soft — projects remain).
    """
    try:
        deleted = ch_manager.delete_uploaded_script(doc_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Script '{doc_id}' not found")
        log_event(logger, "script_deleted_via_api", doc_id=doc_id)
        return JSONResponse({"status": "success", "deleted_doc_id": doc_id})
    except HTTPException:
        raise
    except Exception:
        logger.exception("delete_script failed")
        raise HTTPException(status_code=500, detail="Failed to delete script")


# ── Saved Projects Management ─────────────────────────────────────────────────

@app.get("/api/projects")
async def list_projects():
    """List all saved film projects (metadata only, no full JSON)."""
    try:
        projects = ch_manager.list_projects()
        return JSONResponse({"status": "success", "projects": projects, "count": len(projects)})
    except Exception:
        logger.exception("list_projects failed")
        raise HTTPException(status_code=500, detail="Failed to list projects")


@app.get("/api/projects/{project_id}")
async def load_project(project_id: str):
    """Load a complete saved project by ID."""
    try:
        project = ch_manager.load_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        return JSONResponse({"status": "success", "project": project})
    except HTTPException:
        raise
    except Exception:
        logger.exception("load_project failed")
        raise HTTPException(status_code=500, detail="Failed to load project")


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Permanently delete a saved project."""
    try:
        deleted = ch_manager.delete_project(project_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        log_event(logger, "project_deleted_via_api", project_id=project_id)
        return JSONResponse({"status": "success", "deleted_project_id": project_id})
    except HTTPException:
        raise
    except Exception:
        logger.exception("delete_project failed")
        raise HTTPException(status_code=500, detail="Failed to delete project")


@app.post("/api/revise-scene")

async def revise_scene_endpoint(req: ReviseSceneRequest):
    """
    Interactive Storytelling: Rewrites a specific scene and regenerates its assets.
    """
    try:
        log_event(logger, "scene_revision_requested", scene_id=req.scene.get("scene_id"),
                  **content_metadata(req.notes, "director_notes"))
        # 1. Rewrite the scene
        revised_scene = film_crew.revise_scene(req.film_bible, req.scene, req.notes)
        
        # 2. Regenerate assets for this single scene
        single_scene_list = [revised_scene]
        storyboards = film_crew.run_storyboard_director(single_scene_list)
        production_design = film_crew.run_production_designer(req.film_bible, single_scene_list)
        audio_post = film_crew.run_audio_department(single_scene_list)

        # 3. Re-index in ClickHouse
        idx = int(revised_scene.get("scene_id", "1").split("-")[-1]) if "-" in revised_scene.get("scene_id", "") else 1
        vector = [0.1 * (idx + 1), 0.25, 0.45, 0.85, 0.35, 0.90, 0.15, 0.70]
        ch_manager.insert_scene(
            scene_id=revised_scene.get("scene_id", f"sc-{idx}"),
            title=revised_scene.get("title", f"Scene {idx}"),
            heading=revised_scene.get("heading", "INT. SET - DAY"),
            description=revised_scene.get("description", ""),
            tension=float(revised_scene.get("tension_score", 5.0)),
            pacing=revised_scene.get("pacing_tag", "BUILD"),
            vector=vector
        )

        log_event(logger, "scene_revision_completed", scene_id=revised_scene.get("scene_id"))
        return JSONResponse({
            "status": "success",
            "revised_scene": revised_scene,
            "storyboard": storyboards[0] if storyboards else {},
            "production_design": production_design[0] if production_design else {},
            "audio_post": audio_post[0] if audio_post else {}
        })
    except Exception:
        logger.exception("Scene revision failed")
        raise HTTPException(status_code=500, detail="Scene revision failed")

@app.post("/api/tts")
async def generate_tts(req: TTSRequest):
    """Generates Text-to-Speech audio for dialogue using GCP TTS."""
    try:
        from google.cloud import texttospeech
        
        safe_char = "".join([c for c in req.character.lower() if c.isalnum() or c == ' ']).replace(' ', '_')
        filename = f"{safe_char}_{uuid.uuid4().hex[:8]}.mp3"
        
        audio_dir = os.path.join(static_dir, "audio")
        os.makedirs(audio_dir, exist_ok=True)
        filepath = os.path.join(audio_dir, filename)
        
        started = time.perf_counter()
        log_event(logger, "tts_generation_started", voice_id=req.voice_id, gender=req.gender,
                  **content_metadata(req.text, "tts_text"))
        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=req.text)
        
        ssml_gender = texttospeech.SsmlVoiceGender.MALE
        if req.gender.upper() == "FEMALE":
            ssml_gender = texttospeech.SsmlVoiceGender.FEMALE
            
        language_code = "-".join(req.voice_id.split("-")[:2]) if "-" in req.voice_id else "en-US"
            
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            name=req.voice_id,
            ssml_gender=ssml_gender
        )
        
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        
        with open(filepath, "wb") as out:
            out.write(response.audio_content)

        audio_url = f"/static/audio/{filename}"

        # Persist dialogue audio performance to ClickHouse
        audio_id = f"aud-{uuid.uuid4().hex[:8]}"
        ch_manager.insert_dialogue_audio(
            audio_id=audio_id,
            character=req.character,
            voice_id=req.voice_id,
            text=req.text,
            audio_url=audio_url,
            project_id=req.project_id
        )

        log_event(logger, "tts_generation_completed", voice_id=req.voice_id,
                  latency_ms=round((time.perf_counter() - started) * 1000, 2),
                  audio_bytes=len(response.audio_content))
        return JSONResponse({"status": "success", "audio_url": audio_url})
    except Exception:
        logger.exception("TTS generation failed")
        raise HTTPException(status_code=500, detail="TTS generation failed")

@app.get("/api/voice-vault")
async def get_voice_vault():
    """Returns available actor and synthetic voice profiles from ClickHouse Voice Vault."""
    try:
        voices = ch_manager.list_voice_vault()
        return JSONResponse({"status": "success", "voices": voices})
    except Exception:
        logger.exception("Failed to retrieve voice vault")
        raise HTTPException(status_code=500, detail="Failed to fetch voice vault")

@app.post("/api/generate-image")
async def generate_image(req: GenerateImageRequest):
    """Generates a storyboard image using GCP Vertex AI Image Generation (Gemini Image & Imagen with graceful fallback)."""
    try:
        from agents.film_crew import get_gemini_client
        from google.genai import types
        
        image_bytes = None
        image_provider = "vertex_ai_image"
        model_used = None
        ext = "jpg"
        started = time.perf_counter()
        
        models_to_try = [
            "gemini-2.5-flash-image",
            "gemini-3.1-flash-image",
            "imagen-3.0-generate-002",
            "imagen-3.0-generate-001"
        ]
        
        log_event(logger, "image_generation_started", models_tried=models_to_try,
                  **content_metadata(req.prompt, "image_prompt"))

        client = get_gemini_client()

        for model_candidate in models_to_try:
            try:
                if "gemini" in model_candidate:
                    # Native Gemini multimodal image model via generate_content
                    response = client.models.generate_content(
                        model=model_candidate,
                        contents=req.prompt + ", cinematic 16:9 widescreen movie storyboard frame, highly detailed concept art, film still",
                    )
                    if response and response.candidates:
                        candidate = response.candidates[0]
                        content = getattr(candidate, "content", None)
                        parts = getattr(content, "parts", None) if content else None
                        for part in (parts or []):
                            inline_data = getattr(part, "inline_data", None)
                            if inline_data and getattr(inline_data, "data", None):
                                image_bytes = inline_data.data
                                model_used = model_candidate
                                mime = getattr(inline_data, "mime_type", "") or ""
                                ext = "png" if "png" in mime else "jpg"
                                break
                else:
                    # Legacy Imagen model endpoint via generate_images
                    response = client.models.generate_images(
                        model=model_candidate,
                        prompt=req.prompt + ", highly detailed cinematic storyboard sketch, masterpiece",
                        config=types.GenerateImagesConfig(
                            number_of_images=1,
                            output_mime_type="image/jpeg",
                            aspect_ratio="16:9"
                        )
                    )
                    if response and response.generated_images:
                        image_bytes = response.generated_images[0].image.image_bytes
                        model_used = model_candidate
                        ext = "jpg"
                
                if image_bytes:
                    break
            except Exception:
                logger.warning("Image model %s failed, trying next", model_candidate, exc_info=True)

        if not image_bytes:
            log_event(logger, "image_generation_unavailable", level=logging.WARNING,
                      provider="vertex_ai_image", reason="all_models_failed")

        if not image_bytes:
            svg = f'''<svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#0f172a"/>
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#64748b">Vertex Image Generation unavailable</text>
            </svg>'''
            image_bytes = svg.encode('utf-8')
            filename = f"img_fallback_{uuid.uuid4().hex[:8]}.svg"
            image_provider = "svg_fallback"
        else:
            safe_prompt = "".join([c for c in req.prompt[:20].lower() if c.isalnum()]).replace(' ', '_')
            filename = f"img_{safe_prompt}_{uuid.uuid4().hex[:8]}.{ext}"
            image_provider = "vertex_ai_image"
        
        img_dir = os.path.join(static_dir, "images", "storyboards")
        os.makedirs(img_dir, exist_ok=True)
        filepath = os.path.join(img_dir, filename)
        
        with open(filepath, "wb") as f:
            f.write(image_bytes)
            
        image_url = f"/static/images/storyboards/{filename}"

        # Persist real generated AI images to ClickHouse (fallback SVG is strictly NOT persisted)
        if image_provider != "svg_fallback":
            image_id = f"img-{uuid.uuid4().hex[:8]}"
            ch_manager.insert_generated_image(
                image_id=image_id,
                prompt=req.prompt,
                model=model_used or "gemini-2.5-flash-image",
                image_url=image_url,
                project_id=req.project_id,
                storyboard_id=req.storyboard_id
            )

        log_event(logger, "image_generation_completed", provider=image_provider, model=model_used,
                  latency_ms=round((time.perf_counter() - started) * 1000, 2), image_bytes=len(image_bytes))
        return JSONResponse({"status": "success", "image_url": image_url})
    except Exception:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail="Image generation failed")

@app.post("/api/vector-search")
async def vector_search(req: VectorSearchRequest):
    """Performs semantic vector search across ClickHouse scene embeddings."""
    try:
        log_event(logger, "vector_search_requested", limit=req.limit,
                  **content_metadata(req.query, "search_query"))
        # Embed the search query with the same model used when indexing scenes
        query_vector = script_processor.embed_text(req.query)
        results = ch_manager.vector_search_scenes(query_vector, req.limit)
        log_event(logger, "vector_search_completed", limit=req.limit, result_count=len(results))
        return JSONResponse({
            "status": "success",
            "query": req.query,
            "vector_dimension": len(query_vector),
            "results": results
        })
    except Exception:
        logger.exception("Vector search failed")
        raise HTTPException(status_code=500, detail="Vector search failed")


@app.get("/api/analytics")
async def get_analytics():
    """Fetches real-time script pacing and ClickHouse engine telemetry."""
    try:
        data = ch_manager.get_telemetry_analytics()
        return JSONResponse({
            "status": "success",
            "telemetry": data
        })
    except Exception:
        logger.exception("Analytics endpoint failed")
        raise HTTPException(status_code=500, detail="Analytics endpoint failed")


@app.get("/api/clickhouse/mcp/status")
async def get_clickhouse_mcp_status():
    """Returns runtime status and tool schema of the official ClickHouse MCP server (`mcp-clickhouse`)."""
    try:
        tables = ch_manager.mcp.list_tables()
        databases = ch_manager.mcp.list_databases()
        summary = ch_manager.mcp.get_film_telemetry_summary()
        return JSONResponse({
            "status": "success",
            "mcp_server": "io.github.ClickHouse/mcp-clickhouse",
            "is_available": ch_manager.mcp.is_available,
            "host": ch_manager.mcp.host,
            "database": ch_manager.mcp.database,
            "tools": ["run_query", "list_tables", "list_databases", "vector_search_scenes"],
            "indexed_tables": tables,
            "databases": databases,
            "telemetry_summary": summary
        })
    except Exception as e:
        logger.exception("MCP status endpoint failed")
        return JSONResponse({
            "status": "error",
            "error": str(e),
            "mcp_server": "io.github.ClickHouse/mcp-clickhouse"
        }, status_code=500)


class MCPQueryRequest(BaseModel):
    query: str


@app.post("/api/clickhouse/mcp/query")
async def execute_clickhouse_mcp_query(payload: MCPQueryRequest):
    """Executes a SQL query via the official ClickHouse MCP server `run_query` tool."""
    try:
        res = ch_manager.mcp.run_query(payload.query)
        return JSONResponse({
            "status": "success",
            "mcp_server": "io.github.ClickHouse/mcp-clickhouse",
            "response": res
        })
    except Exception as e:
        logger.exception(f"MCP query endpoint failed: {e}")
        return JSONResponse({
            "status": "error",
            "error": str(e)
        }, status_code=500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
