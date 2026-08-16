# CineAgent Studio 🎬🤖

> **Autonomous Multi-Agent AI Film Crew powered by Gemini Enterprise, Google Cloud Log Analytics & ClickHouse Vector Engine.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Gemini%20Enterprise-4285F4)](https://cloud.google.com/vertex-ai)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-Vector%20Search%20%26%20Telemetry-FFCC00)](https://clickhouse.com/)
[![Log Analytics](https://img.shields.io/badge/GCP-Cloud%20Log%20Analytics-34A853)](https://cloud.google.com/logging)

---

## 🌟 Overview & Hackathon Submission

**CineAgent Studio** is an autonomous multi-agent film production suite created for **Agentic Cinema: The Blockbuster Hackathon**. 

It transforms a raw movie premise into a complete, production-ready film Bible:
- **Progressive Real-Time Streaming (SSE)**: Streams film bibles, screenplay scenes, and visual frames incrementally as agents complete.
- **Screenplay & Scene Breakdown**: Formatted dialogues, action blocks, and scene sluglines in standard industry format.
- **Multi-Modal Visual Storyboards**: Generates 16:9 cinematic shot concepts with real-time frame generation.
- **Actor Voice Vault & Speech Synthesis**: Integrated Cloud TTS voice synthesizer with casting archetypes and dynamic voice ingestion.
- **Production Design & Audio Soundscapes**: Automated set architecture, hero prop designs, and orchestral soundtrack themes.
- **Full ClickHouse Cloud Persistence**: 8 normalized tables indexing projects, scenes, dialogues, storyboards, designs, audio cues, generated images, and actor voices.
- **ClickHouse Vector Search**: High-performance semantic vector search over screenplay scene embeddings (`text-embedding-004`).
- **GCP Log Analytics & Model Thinking Telemetry**: End-to-end observability shipping structured logs directly to Google Cloud Logging & BigQuery Log Analytics with Gemini 2.5 thinking token metrics.

---

## 🏆 Partner Track & Architecture

- **Google Cloud & Gemini Enterprise**: Built using the official `@google/genai` Python SDK (`from google import genai`) on Vertex AI / Gemini Enterprise with Gemini 2.5 Flash, Cloud Text-to-Speech, and Cloud Logging.
- **Partner Track**: **ClickHouse Track** ($15,000 Prize Bucket). Actively uses ClickHouse at runtime via the official **ClickHouse MCP Server (`mcp-clickhouse`)** and `clickhouse-connect`, serving as the vector database, asset vault, and analytics telemetry engine for indexing scene embeddings, dialogue lines, storyboard cards, production designs, and dramatic pacing curves.

```
+-----------------------------------------------------------------------------------+
|                                 USER / DIRECTOR                                   |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        CineAgent Studio Web UI (FastAPI)                          |
+-----------------------------------------------------------------------------------+
                                          |
                     [ Stage 1: Executive Producer (Gemini 2.5) ]
                                          |
                     [ Stage 2: Screenwriter Agent (Gemini 2.5) ]
                                          |
            +-----------------------------+-----------------------------+
            |                             |                             |
            v (Parallel Stage 3)          v (Parallel Stage 3)          v (Parallel Stage 3)
+------------------------+   +------------------------+   +------------------------+
|  Storyboard Director   |   |  Production Designer   |   |    Audio Department    |
| (Cinematography/Shots) |   | (Sets, Props, Costume) |   | (Score, Foley, Voices) |
+------------------------+   +------------------------+   +------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      ClickHouse Vector & Asset Vault                             |
|  - Table: `projects` (Production metadata & status)                               |
|  - Table: `scenes` (768-dim Vector Embeddings for Semantic Search)               |
|  - Table: `dialogues` (Dialogue lines, character tags & emotion)                  |
|  - Table: `storyboards` (Visual camera shots & lighting prompts)                  |
|  - Table: `production_design` (Set architecture, hero props & costumes)           |
|  - Table: `audio_post` (Soundtracks, foley effects & audio cues)                  |
|  - Table: `generated_images` (Persisted AI concept frames; excludes SVGs)         |
|  - Table: `actor_voice_vault` (Synthetic & real voice profiles & accents)        |
|  - Table: `dialogue_audio` (Generated audio takes & voice line history)           |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                 Google Cloud Logging & Log Analytics (BigQuery)                   |
|  - Non-blocking Background Transport shipping structured JSON telemetry           |
|  - Model Thinking Telemetry (`thoughts_token_count`, prompt/candidate tokens)     |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.13+
- Google Cloud Project with Vertex AI / Gemini API access
- ClickHouse (Cloud or Local instance, or fallback to Embedded Engine)

### 1. Clone & Setup Virtual Environment
```bash
git clone https://github.com/your-username/Agentic-Cinema.git
cd Agentic-Cinema

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```bash
# ClickHouse Cloud Connection Details
CLICKHOUSE_HOST="your-clickhouse-host.clickhouse.cloud"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD="your-password"
CLICKHOUSE_PORT="8443"
CLICKHOUSE_SECURE=true

# GCP Project ID for Vertex AI & Cloud Logging
GCP_PROJECT_ID=your-gcp-project-id
```
*(If no ClickHouse environment variables are provided, CineAgent Studio automatically activates the **Embedded ClickHouse Vector Engine** for seamless offline testing.)*

### 3. Production Observability & Log Analytics

The API features direct integration with **Google Cloud Logging & Log Analytics**:
- **Dual Dispatch**: Emits structured JSON to `stdout` and simultaneously ships logs over the network directly to the GCP Cloud Logging API using non-blocking background transport.
- **Universal Telemetry**: Transmits logs whether the code runs on your **local Mac**, **Docker**, **CI/CD**, or **Cloud Run**.
- **Model Thinking Telemetry**: Automatically records Gemini 2.5 `thoughts_token_count`, `prompt_token_count`, `candidates_token_count`, and reasoning duration.
- **Distributed Tracing**: Every request carries an `X-Request-ID` to correlate HTTP requests, Gemini agent calls, image/TTS generations, and ClickHouse inserts.

```bash
# Observability Settings in .env
LOG_LEVEL=INFO
CINEAGENT_LOG_CONTENT=false  # Set to true only in access-controlled debugging
CINEAGENT_LOG_CONTENT_MAX_CHARS=2000
```

#### Querying Logs with BigQuery SQL in GCP Log Analytics:
```sql
SELECT
  timestamp,
  jsonPayload.event,
  jsonPayload.agent,
  jsonPayload.model,
  jsonPayload.latency_ms,
  jsonPayload.thoughts_token_count,
  jsonPayload.total_token_count
FROM
  `YOUR_PROJECT_ID.global._Default._AllLogs`
WHERE
  log_name LIKE '%cineagent-api%'
ORDER BY
  timestamp DESC
LIMIT 50;
```

### 4. Run Automated Tests & Diagnostics

CineAgent Studio includes a production-grade test suite with 17 automated unit, integration, and API tests:

```bash
# Run the complete test suite
pytest tests/ -v

# Run standalone environment & MCP diagnostics
python3 scripts/verify_environment.py
```

### 5. Run Application Server
```bash
source venv/bin/activate
python3 app.py
```
Open your browser and navigate to: **`http://localhost:8000`**

- **ClickHouse MCP Status**: `GET http://localhost:8000/api/clickhouse/mcp/status`
- **ClickHouse MCP Query Console**: `POST http://localhost:8000/api/clickhouse/mcp/query`

---

### 6. Deploy to Cloud Run

The repository includes a `Dockerfile` and `.dockerignore` for Cloud Run deployment:

```bash
# Authenticate and choose your target project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com \
  texttospeech.googleapis.com logging.googleapis.com secretmanager.googleapis.com

# Create ClickHouse password secret
printf %s "YOUR_CLICKHOUSE_PASSWORD" | gcloud secrets create cineagent-clickhouse-password \
  --data-file=-

# Deploy to Cloud Run
gcloud run deploy cineagent-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=YOUR_PROJECT_ID,CLICKHOUSE_HOST=YOUR_HOST,CLICKHOUSE_USER=default,CLICKHOUSE_PORT=8443,CLICKHOUSE_SECURE=true \
  --set-secrets CLICKHOUSE_PASSWORD=cineagent-clickhouse-password:1
```

---

## 📊 Features & Walkthrough

1. **AI Director Studio Backlot**: Input any film premise, genre, and narrative tone or upload an existing screenplay for RAG grounding.
2. **Server-Sent Events (SSE) Streaming**: Progressive rendering displaying the Film Bible in ~3 seconds while downstream departments execute concurrently.
3. **Parallel Department Execution**: Storyboard Director, Production Designer, Audio Department, and Market Analyst run in parallel via `asyncio.as_completed()`, cutting generation latency by >50%.
4. **Interactive Director's Cut (Scene Revision)**: Request specific revisions on individual scenes and immediately rewrite them.
5. **Actor Voice Vault & Speech Synthesis**: Play lines in synthetic character voices or browse the persistent voice vault.
6. **ClickHouse Semantic Vector Search**: Search scene embeddings by mood, tension, or plot points in sub-15ms.
7. **Dramatic Tension Telemetry**: View real-time tension curves, dialogue density, and box office metrics rendered via Chart.js.
8. **Persistent Project Library**: Browse, search, reload, and manage all saved film productions stored in ClickHouse Cloud.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
