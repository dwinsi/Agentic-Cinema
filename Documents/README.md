# CineAgent Studio — Project Documentation Hub 📚

Welcome to the official documentation hub for **CineAgent Studio**! This directory contains comprehensive documentation explaining the project's vision, system architecture, technology stack, GCP + ClickHouse integration, and a guide on running the app and upgrading Gemini models.

---

## 📄 Documentation Directory

| Document | Title & Description | Audience |
| :--- | :--- | :--- |
| [01_PROJECT_OVERVIEW.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/01_PROJECT_OVERVIEW.md) | **Project Overview & Capabilities**<br>Explains what CineAgent Studio is, the problem it solves, and the multi-agent AI film crew roles. | Beginners & Stakeholders |
| [02_SYSTEM_ARCHITECTURE.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/02_SYSTEM_ARCHITECTURE.md) | **System Architecture & Workflow**<br>Diagrams and explanations of how data flows from user prompts down to Gemini AI agents and ClickHouse vector storage. | Engineers & Architects |
| [03_TECHNOLOGY_STACK.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/03_TECHNOLOGY_STACK.md) | **Technology Stack & Integration Breakdown**<br>Detailing every tool used (FastAPI, Google GenAI SDK, ClickHouse Connect, Chart.js) and how they communicate. | Developers & Integrators |
| [04_GCP_AND_CLICKHOUSE_INTEGRATION_GUIDE.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/04_GCP_AND_CLICKHOUSE_INTEGRATION_GUIDE.md) | **Step-by-Step GCP & ClickHouse Integration Guide**<br>A beginner-friendly hands-on guide explaining how to connect GCP Vertex AI / Gemini with ClickHouse for vector search and script telemetry. | Newcomers to GCP / ClickHouse |
| [05_RUNNING_THE_APP_AND_MODEL_CONFIG.md](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/Documents/05_RUNNING_THE_APP_AND_MODEL_CONFIG.md) | **App Quickstart & Gemini Model Configuration Guide**<br>Complete guide on running the app, setting up `.env`, and upgrading Gemini models (from `gemini-2.5-flash` to `gemini-2.5-pro`). | Developers & Operators |

---

## 🎯 Quick Links to Key Source Files

- **Application Controller**: [app.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/app.py)
- **Multi-Agent AI Film Crew**: [agents/film_crew.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/agents/film_crew.py)
- **ClickHouse Vector & Telemetry Engine**: [database/clickhouse_client.py](file:///Users/ashwinsingh/Downloads/Agentic-Cinema/database/clickhouse_client.py)
