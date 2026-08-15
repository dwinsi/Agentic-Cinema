# 📘 04. GCP & ClickHouse Integration Guide

> **Comprehensive Integration Reference** for **Google Cloud Platform (Vertex AI, Cloud TTS, Cloud Logging)** and **ClickHouse Cloud Vector Database**.

---

## 📑 Table of Contents

1. [Architecture & Ecosystem Overview](#1-architecture--ecosystem-overview)
2. [Google Cloud Platform (GCP) Setup](#2-google-cloud-platform-gcp-setup)
3. [ClickHouse Cloud Cluster Setup](#3-clickhouse-cloud-cluster-setup)
4. [Python SDK Integration & Schema Setup](#4-python-sdk-integration--schema-setup)
5. [768-Dimensional Vector Search Implementation](#5-768-dimensional-vector-search-implementation)
6. [GCP Log Analytics & SQL Observability](#6-gcp-log-analytics--sql-observability)
7. [Full Standalone Code Example](#7-full-standalone-code-example)

---

## 1. Architecture & Ecosystem Overview

CineAgent Studio pairs Google Cloud's AI suite with ClickHouse Cloud's analytical horsepower:

```
┌──────────────────────────────────────────────┐
│           GOOGLE CLOUD PLATFORM              │
│  - Gemini 2.5 Flash (Multimodal & Thinking)  │
│  - text-embedding-004 (768-dim Dense Vectors)│
│  - Cloud Text-to-Speech (Neural2 & Journey)  │
│  - Cloud Logging & Log Analytics (BigQuery)  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│             CLICKHOUSE CLOUD                 │
│  - 8 Normalized ReplacingMergeTree Tables     │
│  - Instant Cosine Distance Vector Search     │
│  - Real-Time Script Pacing Telemetry         │
│  - Actor Voice Vault & Audio Takes Storage   │
└──────────────────────────────────────────────┘
```

---

## 2. Google Cloud Platform (GCP) Setup

### A. Required Services
Enable the following APIs in your GCP project:
```bash
gcloud services enable aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  logging.googleapis.com \
  run.googleapis.com
```

### B. Authentication
Authenticate your workstation with Application Default Credentials:
```bash
gcloud auth application-default login
export GCP_PROJECT_ID="your-gcp-project-id"
```

---

## 3. ClickHouse Cloud Cluster Setup

### A. Environment Configuration
Add your credentials to `.env`:
```ini
CLICKHOUSE_HOST="your-cluster.clickhouse.cloud"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD="your-secure-password"
CLICKHOUSE_PORT="8443"
CLICKHOUSE_SECURE=true
```

---

## 4. Python SDK Integration & Schema Setup

### A. Initializing Clients
```python
from google import genai
import clickhouse_connect

# 1. Google GenAI Client
genai_client = genai.Client(vertexai=True, project="your-project-id", location="us-central1")

# 2. ClickHouse Client
ch_client = clickhouse_connect.get_client(
    host="your-cluster.clickhouse.cloud",
    port=8443,
    user="default",
    password="your-password",
    secure=True
)
```

### B. The 8 Normalized Tables in ClickHouse Cloud

```sql
-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    project_id String, title String, genre String, tone String,
    logline String, status String DEFAULT 'active',
    created_at DateTime DEFAULT now(), updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY project_id;

-- 2. Scenes Table (768-dim Vector Embeddings)
CREATE TABLE IF NOT EXISTS scenes (
    scene_id String, project_id String DEFAULT '', title String, heading String,
    description String, tension_score Float32, pacing_tag String,
    embedding Array(Float32), created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY scene_id;

-- 3. Dialogues Table
CREATE TABLE IF NOT EXISTS dialogues (
    dialogue_id String, project_id String DEFAULT '', scene_id String,
    character String, line String, emotion String, created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY (project_id, dialogue_id);

-- 4. Storyboards Table
CREATE TABLE IF NOT EXISTS storyboards (
    storyboard_id String, project_id String, scene_id String DEFAULT '',
    title String, shot_type String, image_prompt String, image_url String DEFAULT '',
    created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY (project_id, storyboard_id);

-- 5. Production Design Table
CREATE TABLE IF NOT EXISTS production_design (
    design_id String, project_id String, scene_id String DEFAULT '',
    set_design String, key_prop String, costume_notes String,
    created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY (project_id, design_id);

-- 6. Audio Post Table
CREATE TABLE IF NOT EXISTS audio_post (
    audio_id String, project_id String, scene_id String DEFAULT '',
    soundtrack_theme String, foley_effects String, audio_cue String,
    created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY (project_id, audio_id);

-- 7. Generated Images Table (Excludes Fallback SVGs)
CREATE TABLE IF NOT EXISTS generated_images (
    image_id String, project_id String DEFAULT '', storyboard_id String DEFAULT '',
    prompt String, model String, image_url String, created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY (project_id, image_id);

-- 8. Actor Voice Vault Table
CREATE TABLE IF NOT EXISTS actor_voice_vault (
    voice_id String, name String, gender String, accent String,
    archetype String, voice_type String DEFAULT 'synthetic', sample_text String,
    sample_audio_url String DEFAULT '', gcp_voice_name String,
    created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at) ORDER BY voice_id;
```

---

## 5. 768-Dimensional Vector Search Implementation

### A. Generating Embeddings via Vertex AI
```python
def embed_text(text: str) -> list[float]:
    response = genai_client.models.embed_content(
        model="text-embedding-004",
        contents=text
    )
    return response.embedding.values
```

### B. Running Vector Similarity Query in ClickHouse
```python
def search_similar_scenes(query_text: str, top_k: int = 5):
    query_vector = embed_text(query_text)
    sql = """
    SELECT
        scene_id, title, heading, description, tension_score, pacing_tag,
        cosineDistance(embedding, {query_vec:Array(Float32)}) AS distance
    FROM scenes
    WHERE length(embedding) = 768
    ORDER BY distance ASC
    LIMIT {limit:UInt32}
    """
    results = ch_client.query(sql, parameters={"query_vec": query_vector, "limit": top_k})
    return results.result_rows
```

---

## 6. GCP Log Analytics & SQL Observability

Logs are shipped over the network via `google-cloud-logging` with `BackgroundThreadTransport`.

### Querying Logs with BigQuery SQL in GCP Console:
```sql
SELECT
  timestamp,
  jsonPayload.event,
  jsonPayload.agent,
  jsonPayload.model,
  jsonPayload.latency_ms,
  jsonPayload.thoughts_token_count,
  jsonPayload.candidates_token_count
FROM
  `YOUR_PROJECT_ID.global._Default._AllLogs`
WHERE
  log_name LIKE '%cineagent-api%'
ORDER BY
  timestamp DESC
LIMIT 50;
```
