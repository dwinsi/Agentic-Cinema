# 🏗️ 02. CineAgent Studio — System Architecture

This document details the architectural design, multi-agent state flow, data schema, and database engine strategy used in **CineAgent Studio**.

---

## 📐 System Architecture Diagram

```mermaid
flowchart TD
    classDef clientStyle fill:#4f46e5,stroke:#818cf8,stroke-width:2px,color:#ffffff;
    classDef apiStyle fill:#0284c7,stroke:#38bdf8,stroke-width:2px,color:#ffffff;
    classDef agentStyle fill:#7c3aed,stroke:#c084fc,stroke-width:2px,color:#ffffff;
    classDef gcpStyle fill:#2563eb,stroke:#60a5fa,stroke-width:2px,color:#ffffff;
    classDef dbStyle fill:#d97706,stroke:#fbbf24,stroke-width:2px,color:#ffffff;
    classDef liveStyle fill:#059669,stroke:#34d399,stroke-width:2px,color:#ffffff;

    Client["Director / User Browser UI<br/>(Real-Time Progressive SSE Consumer)"]:::clientStyle

    subgraph Layer1["1. Application & API Layer (FastAPI app.py)"]
        direction TB
        API_STREAM["POST /api/generate-film-project-stream<br/>(SSE Event Stream: Film Bible ➔ Script ➔ Parallel Depts)"]:::apiStyle
        API_REV["POST /api/revise-scene<br/>(Director's Cut Scene Rewriting)"]:::apiStyle
        API_VOICE["POST /api/tts & GET /api/voice-vault<br/>(Voice Synthesis & Casting Library)"]:::apiStyle
        API_IMG["POST /api/generate-image<br/>(16:9 Concept Frame Rendering)"]:::apiStyle
        API_VEC["POST /api/vector-search<br/>(Queries 768-dim Scene Vectors)"]:::apiStyle
    end

    subgraph Layer2["2. Intelligence & Agentic Layer (agents/film_crew.py)"]
        direction TB
        EP["Stage 1: Executive Producer Agent<br/>(Film Bible & World Rules)"]:::agentStyle
        SW["Stage 2: Screenwriter Agent<br/>(3-Act Scenes, Dialogues & Tension)"]:::agentStyle
        
        subgraph Stage3["Stage 3: Parallel Specialist Departments (asyncio.as_completed)"]
            SD["Storyboard Director<br/>(Shot Framing & Prompts)"]:::agentStyle
            PD["Production Designer<br/>(Sets, Props & Wardrobe)"]:::agentStyle
            AU["Audio Department<br/>(Score, Foley & Audio Cues)"]:::agentStyle
            MA["Market Analyst<br/>(Pacing & Box Office)"]:::agentStyle
        end

        Gemini["Google Vertex AI: Gemini Enterprise (gemini-2.5-flash)"]:::gcpStyle

        EP --> SW --> Stage3
        EP -.-> Gemini
        SW -.-> Gemini
        Stage3 -.-> Gemini
    end

    subgraph Layer3["3. Database & Storage Layer (database/clickhouse_client.py)"]
        direction TB
        ClientLib["clickhouse-connect Driver"]:::dbStyle
        LiveCloud["Live ClickHouse Cloud Cluster"]:::liveStyle
        Tables[("8 ClickHouse Cloud Tables:<br/>projects, scenes (768d vectors), dialogues,<br/>storyboards, production_design, audio_post,<br/>generated_images, actor_voice_vault")]:::dbStyle

        ClientLib --> LiveCloud --> Tables
    end

    subgraph Layer4["4. Observability & Log Analytics (observability.py)"]
        direction TB
        CloudLog["Google Cloud Logging API<br/>(Non-blocking Background Thread Transport)"]:::gcpStyle
        LogAnalytics["GCP Log Analytics & BigQuery SQL<br/>(Thinking Tokens & Telemetry Querying)"]:::gcpStyle
        CloudLog --> LogAnalytics
    end

    Client -->|Connect SSE Stream| Layer1
    Layer1 -->|Orchestrate Agent Pipeline| Layer2
    Layer1 -->|Persist Complete Production Assets| Layer3
    Layer1 -.->|Ship Structured JSON Logs| Layer4

    style Layer1 fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    style Layer2 fill:#1e1b4b,stroke:#c084fc,stroke-width:2px,color:#f8fafc;
    style Layer3 fill:#451a03,stroke:#fbbf24,stroke-width:2px,color:#f8fafc;
    style Layer4 fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#f8fafc;
```

---

## 🔄 End-to-End Real-Time Streaming Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Director / User
    participant App as FastAPI Server
    participant EP as Executive Producer (Stage 1)
    participant SW as Screenwriter (Stage 2)
    participant P as Parallel Stage 3 (SD, PD, AU, MA)
    participant CH as ClickHouse Cloud
    participant GCP as Cloud Logging API

    User->>App: POST /api/generate-film-project-stream
    App-->>User: HTTP 200 (text/event-stream)
    
    App->>EP: run_executive_producer()
    EP-->>App: Film Bible JSON
    App-->>User: data: {"type": "film_bible", "data": {...}} (renders in ~3s)

    App->>SW: run_screenwriter(Film Bible)
    SW-->>App: Screenplay Scenes JSON (with tension scores)
    App-->>User: data: {"type": "scenes", "data": [...]}

    Note over App,P: Launch all 4 downstream departments in PARALLEL
    par Parallel Execution
        App->>P: run_storyboard_director(scenes)
    and
        App->>P: run_production_designer(film_bible, scenes)
    and
        App->>P: run_audio_department(scenes)
    and
        App->>P: run_market_analyst(film_bible, scenes)
    end

    P-->>User: Stream packets as each finishes (asyncio.as_completed)

    App->>CH: Batch insert projects, scenes, dialogues, storyboards, designs, audio
    CH-->>App: Insert Confirmed
    App-->>User: data: {"type": "complete", "project_id": "..."}
    App->>GCP: Ship structured telemetry + thoughts_token_count
```

---

## 🗄️ ClickHouse Cloud Schema Design

CineAgent Studio uses **ReplacingMergeTree** tables in ClickHouse Cloud for normalized storage, version updates, and sub-millisecond analytical queries.

### 1. `projects` Table
```sql
CREATE TABLE IF NOT EXISTS projects (
    project_id   String,
    title        String,
    genre        String,
    tone         String,
    logline      String,
    status       String DEFAULT 'active',
    created_at   DateTime DEFAULT now(),
    updated_at   DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY project_id;
```

### 2. `scenes` Table (768-dim Vector Embeddings)
```sql
CREATE TABLE IF NOT EXISTS scenes (
    scene_id      String,
    project_id    String DEFAULT '',
    title         String,
    heading       String,
    description   String,
    tension_score Float32,
    pacing_tag    String,
    embedding     Array(Float32),
    created_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY scene_id;
```

### 3. `dialogues` Table
```sql
CREATE TABLE IF NOT EXISTS dialogues (
    dialogue_id String,
    project_id  String DEFAULT '',
    scene_id    String,
    character   String,
    line        String,
    emotion     String,
    created_at  DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, dialogue_id);
```

### 4. `storyboards` Table
```sql
CREATE TABLE IF NOT EXISTS storyboards (
    storyboard_id String,
    project_id    String,
    scene_id      String DEFAULT '',
    title         String,
    shot_type     String,
    image_prompt  String,
    image_url     String DEFAULT '',
    created_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, storyboard_id);
```

### 5. `production_design` Table
```sql
CREATE TABLE IF NOT EXISTS production_design (
    design_id     String,
    project_id    String,
    scene_id      String DEFAULT '',
    set_design    String,
    key_prop      String,
    costume_notes String,
    created_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, design_id);
```

### 6. `audio_post` Table
```sql
CREATE TABLE IF NOT EXISTS audio_post (
    audio_id         String,
    project_id       String,
    scene_id         String DEFAULT '',
    soundtrack_theme String,
    foley_effects    String,
    audio_cue        String,
    created_at       DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, audio_id);
```

### 7. `generated_images` Table
```sql
CREATE TABLE IF NOT EXISTS generated_images (
    image_id      String,
    project_id    String DEFAULT '',
    storyboard_id String DEFAULT '',
    prompt        String,
    model         String,
    image_url     String,
    created_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, image_id);
```

### 8. `actor_voice_vault` & `dialogue_audio` Tables
```sql
CREATE TABLE IF NOT EXISTS actor_voice_vault (
    voice_id         String,
    name             String,
    gender           String,
    accent           String,
    archetype        String,
    voice_type       String DEFAULT 'synthetic',
    sample_text      String,
    sample_audio_url String DEFAULT '',
    gcp_voice_name   String,
    created_at       DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY voice_id;

CREATE TABLE IF NOT EXISTS dialogue_audio (
    audio_id   String,
    project_id String DEFAULT '',
    character  String,
    voice_id   String,
    text       String,
    audio_url  String,
    created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, audio_id);
```

---

## 📊 Observability & Model Thinking Telemetry

Every request emitted to Google Cloud Logging includes Gemini 2.5 thinking token metrics:
- **`thoughts_token_count`**: Number of internal reasoning tokens spent before JSON generation.
- **`prompt_token_count`** & **`candidates_token_count`**: Exact input/output token usage.
- **`latency_ms`**: Millisecond-accurate request duration.
- **`request_id`**: Distributed trace ID linking HTTP requests, LLM calls, and ClickHouse operations.
