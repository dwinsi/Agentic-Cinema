# CineAgent Studio — Project Documentation Hub 📚

Welcome to the official documentation hub for **CineAgent Studio**! This directory contains comprehensive documentation explaining the project's vision, system architecture, technology stack, GCP + ClickHouse integration, model thinking telemetry, and production deployment runbooks.

---

## 📄 Documentation Directory

| Document | Title & Description | Audience |
| :--- | :--- | :--- |
| [01_PROJECT_OVERVIEW.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/01_PROJECT_OVERVIEW.md) | **Project Overview & Capabilities**<br>Explains CineAgent Studio, real-time SSE streaming, the 7 specialist agents, and full ClickHouse asset vault persistence. | Beginners & Stakeholders |
| [02_SYSTEM_ARCHITECTURE.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/02_SYSTEM_ARCHITECTURE.md) | **System Architecture & Workflow**<br>Diagrams and explanations of sequential & parallel agent pipelines (`asyncio.as_completed`), 8 ClickHouse table schemas, and GCP Log Analytics. | Engineers & Architects |
| [03_TECHNOLOGY_STACK.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/03_TECHNOLOGY_STACK.md) | **Technology Stack & Integration Breakdown**<br>Detailing every tool used (FastAPI, `@google/genai`, ClickHouse Connect, `google-cloud-logging`, Chart.js) and how they communicate. | Developers & Integrators |
| [04_GCP_AND_CLICKHOUSE_INTEGRATION_GUIDE.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/04_GCP_AND_CLICKHOUSE_INTEGRATION_GUIDE.md) | **Step-by-Step GCP & ClickHouse Integration Guide**<br>Comprehensive reference for connecting Vertex AI, Cloud TTS, 768-dim vector embeddings, and ClickHouse Cloud. | Newcomers to GCP / ClickHouse |
| [05_RUNNING_THE_APP_AND_MODEL_CONFIG.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/05_RUNNING_THE_APP_AND_MODEL_CONFIG.md) | **App Quickstart & Gemini Model Configuration Guide**<br>Complete guide on running the app, setting up `.env`, monitoring model thinking tokens, and switching Gemini models. | Developers & Operators |
| [06_GOOGLE_CLOUD_DEPLOYMENT_PLAN.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/06_GOOGLE_CLOUD_DEPLOYMENT_PLAN.md) | **Cloud Run Deployment Runbook & Observability**<br>Production deployment guide with Secret Manager, least-privileged IAM roles, and GCP Log Analytics BigQuery SQL verification. | DevOps & Cloud Engineers |

---

## 🎯 Quick Links to Key Source Files

- **Application & Streaming Controller**: [app.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/app.py)
- **Multi-Agent AI Film Crew**: [agents/film_crew.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/agents/film_crew.py)
- **ClickHouse Vector & Asset Vault**: [database/clickhouse_client.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/database/clickhouse_client.py)
- **Direct GCP Logging & Telemetry**: [observability.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/observability.py)
