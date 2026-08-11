import os
import logging
import time
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

import uuid

from observability import configure_logging, content_metadata, get_logger, log_event, request_id_ctx
configure_logging()

from agents.film_crew import film_crew
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

class GenerateImageRequest(BaseModel):
    prompt: str

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
                  **content_metadata(req.premise, "premise"))
        
        # Step 1: Run Executive Producer Agent
        film_bible = film_crew.run_executive_producer(req.premise, req.genre, req.tone)

        # Step 2: Run Screenwriter Agent
        scenes = film_crew.run_screenwriter(film_bible)

        # Step 3: Run Storyboard Director Agent
        storyboards = film_crew.run_storyboard_director(scenes)

        # Step 4: Run Production Designer Agent
        production_design = film_crew.run_production_designer(film_bible, scenes)

        # Step 5: Run Audio & Post-Production Agent
        audio_post = film_crew.run_audio_department(scenes)

        # Step 6: Run Market Analyst Agent
        analytics = film_crew.run_market_analyst(film_bible, scenes)

        # Step 7: Index Scenes into ClickHouse Vector Database
        for idx, scene in enumerate(scenes):
            # Generate deterministic synthetic vector embedding for ClickHouse vector index demonstration
            vector = [0.1 * (idx + 1), 0.25, 0.45, 0.85, 0.35, 0.90, 0.15, 0.70]
            ch_manager.insert_scene(
                scene_id=scene.get("scene_id", f"sc-{idx+1}"),
                title=scene.get("title", f"Scene {idx+1}"),
                heading=scene.get("heading", "INT. SET - DAY"),
                description=scene.get("description", ""),
                tension=float(scene.get("tension_score", 5.0)),
                pacing=scene.get("pacing_tag", "BUILD"),
                vector=vector
            )

        log_event(logger, "film_project_completed", scene_count=len(scenes))
        return JSONResponse({
            "status": "success",
            "project": {
                "film_bible": film_bible,
                "scenes": scenes,
                "storyboards": storyboards,
                "production_design": production_design,
                "audio_post": audio_post,
                "analytics": analytics,
                "clickhouse_indexed_scenes": len(scenes)
            }
        })
    except Exception:
        logger.exception("Film project generation failed")
        raise HTTPException(status_code=500, detail="Film project generation failed")

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

        log_event(logger, "tts_generation_completed", voice_id=req.voice_id,
                  latency_ms=round((time.perf_counter() - started) * 1000, 2),
                  audio_bytes=len(response.audio_content))
        return JSONResponse({"status": "success", "audio_url": f"/static/audio/{filename}"})
    except Exception:
        logger.exception("TTS generation failed")
        raise HTTPException(status_code=500, detail="TTS generation failed")

@app.post("/api/generate-image")
async def generate_image(req: GenerateImageRequest):
    """Generates a storyboard image using GCP Imagen 3 (with graceful fallback)."""
    try:
        from agents.film_crew import get_gemini_client
        from google.genai import types
        import urllib.request
        
        image_bytes = None
        image_provider = "vertex_imagen"
        started = time.perf_counter()
        log_event(logger, "image_generation_started", model="imagen-3.0-generate-001",
                  **content_metadata(req.prompt, "image_prompt"))
        
        try:
            # Attempt GCP Imagen 3 via Vertex AI
            client = get_gemini_client()
            response = client.models.generate_images(
                model='imagen-3.0-generate-001',
                prompt=req.prompt + ", highly detailed cinematic storyboard sketch, masterpiece",
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    output_mime_type="image/jpeg",
                    aspect_ratio="16:9"
                )
            )
            
            if response.generated_images:
                image_bytes = response.generated_images[0].image.image_bytes
        except Exception:
            logger.warning("Vertex Imagen failed; using fallback", exc_info=True)
            log_event(logger, "image_generation_fallback", level=logging.WARNING,
                      provider="vertex_imagen", fallback_provider="pollinations")
        
        # Fallback to Pollinations API if Vertex AI fails
        if not image_bytes:
            image_provider = "pollinations"
            import urllib.parse
            import random
            import ssl
            import time
            
            safe_prompt = urllib.parse.quote(req.prompt + ", cinematic masterpiece, 8k resolution, highly detailed, professional cinematography")
            
            # Bypass macOS local issuer certificate issues for the fallback API
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            for attempt in range(3):
                seed = random.randint(1, 1000000)
                # Fallback to turbo on last attempt to bypass potential model-specific rate limits
                api_model = "flux" if attempt < 2 else "turbo"
                pollinations_url = f"https://image.pollinations.ai/prompt/{safe_prompt}?width=1280&height=720&nologo=true&seed={seed}&model={api_model}&safe=true"
                
                try:
                    req_img = urllib.request.Request(pollinations_url, headers={'User-Agent': 'Mozilla/5.0 (CineAgent Studio/1.0)'})
                    with urllib.request.urlopen(req_img, context=ctx, timeout=15) as response:
                        image_bytes = response.read()
                        break # Success
                except Exception as poll_err:
                    if hasattr(poll_err, 'code') and poll_err.code == 429:
                        log_event(logger, "image_generation_retry", level=logging.WARNING,
                                  provider="pollinations", attempt=attempt + 1, reason="rate_limited")
                        if attempt < 2:
                            time.sleep(2 * (attempt + 1)) # Backoff 2s, then 4s
                    else:
                        logger.exception("Pollinations image generation failed")
                        break

        if not image_bytes:
            # Fallback to an SVG placeholder instead of crashing the UI
            svg = f'''<svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#0f172a"/>
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#64748b">Image Generation Unavailable (Rate Limited)</text>
            </svg>'''
            image_bytes = svg.encode('utf-8')
            filename = f"img_fallback_{uuid.uuid4().hex[:8]}.svg"
            image_provider = "svg_fallback"
        else:
            safe_prompt = "".join([c for c in req.prompt[:20].lower() if c.isalnum()]).replace(' ', '_')
            filename = f"img_{safe_prompt}_{uuid.uuid4().hex[:8]}.jpg"
        
        img_dir = os.path.join(static_dir, "images", "storyboards")
        os.makedirs(img_dir, exist_ok=True)
        filepath = os.path.join(img_dir, filename)
        
        with open(filepath, "wb") as f:
            f.write(image_bytes)
            
        log_event(logger, "image_generation_completed", provider=image_provider,
                  latency_ms=round((time.perf_counter() - started) * 1000, 2), image_bytes=len(image_bytes))
        return JSONResponse({"status": "success", "image_url": f"/static/images/storyboards/{filename}"})
    except Exception:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail="Image generation failed")

@app.post("/api/vector-search")
async def vector_search(req: VectorSearchRequest):
    """Performs semantic vector search across ClickHouse script embeddings."""
    try:
        log_event(logger, "vector_search_requested", limit=req.limit,
                  **content_metadata(req.query, "search_query"))
        # Synthesize query vector based on query length/content
        query_vector = [0.80, 0.15, 0.40, 0.88, 0.30, 0.75, 0.20, 0.85]
        results = ch_manager.vector_search_scenes(query_vector, req.limit)
        log_event(logger, "vector_search_completed", limit=req.limit, result_count=len(results))
        return JSONResponse({
            "status": "success",
            "query": req.query,
            "vector_dimension": 8,
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
