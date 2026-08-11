# CineAgent Studio 🎬🤖

> **Autonomous Multi-Agent AI Film Crew powered by Gemini Enterprise & ClickHouse Vector Analytics.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Gemini%20Enterprise-4285F4)](https://cloud.google.com/vertex-ai)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-Vector%20Search%20%26%20Telemetry-FFCC00)](https://clickhouse.com/)

---

## 🌟 Overview & Hackathon Submission

**CineAgent Studio** is an autonomous multi-agent film production suite created for **Agentic Cinema: The Blockbuster Hackathon**. 

It transforms a raw movie premise into a complete, production-ready film Bible:
- **Screenplay & Scene Breakdown**: Formatted dialogues, action blocks, and scene sluglines.
- **Multi-Modal Visual Storyboards**: Generated image prompts and shot layouts.
- **ClickHouse Vector Search**: High-performance semantic vector search over screenplay scene embeddings.
- **Box Office Telemetry & Script Pacing**: Real-time script dramatic tension analytics and market predictions.

---

## 🏆 Partner Track & Architecture

- **Google Cloud & Gemini Enterprise**: Built using the official `@google/genai` Python SDK (`from google import genai`) on Vertex AI / Gemini Enterprise.
- **Partner Track**: **ClickHouse Track** ($15,000 Prize Bucket). ClickHouse serves as the vector database and analytics telemetry engine for indexing scene embeddings, dialogue lines, and dramatic pacing curves.

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
       +----------------------------------+----------------------------------+
       |                                  |                                  |
       v                                  v                                  v
+------------------+             +------------------+               +------------------+
|Executive Producer|             |Screenwriter Agent|               |Storyboard Director|
| (Gemini 2.5)     |             | (Gemini 2.5)     |               | (Gemini 2.5)     |
+------------------+             +------------------+               +------------------+
       |                                  |                                  |
       +----------------------------------+----------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      ClickHouse Vector & Telemetry Engine                        |
|  - Table: `scenes` (Vector Indexing for Semantic Search)                          |
|  - Table: `dialogues` (Dialogue & Character Telemetry)                            |
|  - Real-Time Dramatic Tension Analytics                                           |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.10+
- Google Cloud Project with Gemini API / Vertex AI access
- ClickHouse (Cloud or Local instance, or fallback to Embedded Engine)

### 1. Clone & Setup Virtual Environment
```bash
git clone https://github.com/your-username/Agentic-Cinema.git
cd Agentic-Cinema

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Variables (Optional)
If connecting to ClickHouse Cloud:
```bash
export CLICKHOUSE_HOST="your-clickhouse-host.clickhouse.cloud"
export CLICKHOUSE_USER="default"
export CLICKHOUSE_PASSWORD="your-password"
export CLICKHOUSE_PORT="8443"
```
*(If no ClickHouse environment variables are provided, CineAgent Studio automatically activates the **Embedded ClickHouse Vector Engine** for seamless offline testing.)*

### 2a. Production Observability

The API writes one JSON object per event to standard output. Cloud Run and GKE
automatically ingest these records into **Cloud Logging**; no service-account key
or separate logging transport is needed. Every request carries an `X-Request-ID`
(generated when absent), allowing you to correlate its HTTP, Gemini, image/TTS,
and ClickHouse events.

By default, logs store only a SHA-256 digest and character count for user input,
LLM prompts, and LLM responses. This makes it possible to correlate repeated
inputs and monitor payload size without putting creative content or personal data
in Cloud Logging. Raw content is never needed for normal production monitoring.

```bash
# Recommended production settings
export LOG_LEVEL=INFO
export CINEAGENT_LOG_CONTENT=false

# Only in a short-lived, access-controlled debugging environment:
export CINEAGENT_LOG_CONTENT=true
export CINEAGENT_LOG_CONTENT_MAX_CHARS=2000
```

The LLM events include `agent`, `provider`, `model`, `response_model_version`,
latency, token counts when returned by Vertex AI, finish metadata, and an opaque
response identifier. The system does **not** capture or request model
chain-of-thought / thinking; it is not an application observability signal and
should not be retained. Logs also record unavailable Imagen requests, embedded
ClickHouse use, API latency/status, TTS voice, and database operation timing.

Example Logs Explorer query:

```
jsonPayload.event=("llm_request_completed" OR "llm_request_failed")
jsonPayload.model="gemini-2.5-flash"
```

Set Cloud Logging retention, IAM access, and (if content capture is ever enabled)
an exclusion/sink policy to meet your data-retention requirements.

### 3. Run Application Server
```bash
source venv/bin/activate
python3 app.py
```
Open your browser and navigate to: **`http://localhost:8000`**

### 4. Deploy to Cloud Run

The repository includes a `Dockerfile` and `.dockerignore` for Cloud Run. The
image deliberately excludes `.env` files and service-account keys. Do not copy
credentials into the image or commit them to Git; use a Cloud Run service account
for Google APIs and Secret Manager for ClickHouse credentials.

```bash
# Authenticate and choose your target project (once per workstation)
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable the required managed services (once per project)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com \
  texttospeech.googleapis.com secretmanager.googleapis.com

# Create the ClickHouse password secret once, without putting its value in a command history.
printf %s "YOUR_CLICKHOUSE_PASSWORD" | gcloud secrets create cineagent-clickhouse-password \
  --data-file=-

# Build from this repository and deploy a Cloud Run service.
gcloud run deploy cineagent-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=YOUR_PROJECT_ID,CLICKHOUSE_HOST=YOUR_HOST,CLICKHOUSE_USER=default,CLICKHOUSE_PORT=8443,CLICKHOUSE_SECURE=true \
  --set-secrets CLICKHOUSE_PASSWORD=cineagent-clickhouse-password:1
```

Grant the Cloud Run runtime service account the **Vertex AI User** role so Gemini,
Imagen, and Cloud Text-to-Speech can use Application Default Credentials; also
grant it **Secret Manager Secret Accessor** for the ClickHouse password. The
Cloud Run service's standard-output JSON is automatically stored in Cloud Logging;
open **Cloud Run → cineagent-api → Logs** after invoking an endpoint.

---

## 📊 Features & Walkthrough

1. **AI Director Studio Backlot**: Input any film premise, genre, and narrative tone.
2. **Executive Producer Agent**: Automatically structures loglines, act outlines, and character bibles.
3. **Screenwriter Agent**: Generates formatted screenplay scenes complete with character emotional cues and dialogues.
4. **ClickHouse Semantic Vector Search**: Query scene embeddings by mood, tension, or plot points in milliseconds.
5. **Dramatic Tension Telemetry**: View real-time tension curves and script density analytics rendered via Chart.js.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
