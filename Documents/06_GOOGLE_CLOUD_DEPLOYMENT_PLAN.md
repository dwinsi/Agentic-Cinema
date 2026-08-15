# CineAgent Studio — Google Cloud Deployment Plan

This runbook deploys CineAgent Studio as a public web application on **Cloud Run** in Google Cloud project `project-2154682a-9280-4a32-a72`. It uses Vertex AI for Gemini/Imagen, Cloud Text-to-Speech, Artifact Registry for images, Cloud Build for builds, and Cloud Logging for structured application logs & Log Analytics.

> Recommended region: `us-central1`. It matches the application's configured Vertex AI location.

---

## 0. Security prerequisites

Before deploying, rotate any service-account key and ClickHouse password that have ever been placed in the repository, `.env.example`, screenshots, or chat history. Do not put credentials in Git, Dockerfiles, environment-variable files that are uploaded to Cloud Build, or command history.

Use Secret Manager for passwords and Cloud Run service identities for Google API authentication.

Confirm that these files exclude sensitive values from the build source and container image:
- `.gcloudignore`
- `.dockerignore`

---

## 1. Authenticate and select the project

```bash
gcloud auth login
gcloud config set project project-2154682a-9280-4a32-a72
gcloud config set run/region us-central1
gcloud auth list
```

---

## 2. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com
```

---

## 3. Create the runtime identity

Cloud Run uses this service account through Application Default Credentials; do not upload a service-account key into the container.

```bash
gcloud iam service-accounts create cineagent-runtime \
  --display-name="CineAgent Cloud Run runtime"

# Grant Vertex AI access (Gemini & text-embedding-004)
gcloud projects add-iam-policy-binding project-2154682a-9280-4a32-a72 \
  --member="serviceAccount:cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Grant Cloud Logging Writer access
gcloud projects add-iam-policy-binding project-2154682a-9280-4a32-a72 \
  --member="serviceAccount:cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

---

## 4. Store ClickHouse credentials in Secret Manager

```bash
printf %s "YOUR_CLICKHOUSE_PASSWORD" | \
  gcloud secrets create cineagent-clickhouse-password --data-file=-

gcloud secrets add-iam-policy-binding cineagent-clickhouse-password \
  --member="serviceAccount:cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 5. Build and Deploy to Cloud Run

```bash
gcloud run deploy cineagent-api \
  --source . \
  --region us-central1 \
  --service-account cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=project-2154682a-9280-4a32-a72,CLICKHOUSE_HOST=eobvth7u0q.asia-southeast1.gcp.clickhouse.cloud,CLICKHOUSE_USER=default,CLICKHOUSE_PORT=8443,CLICKHOUSE_SECURE=true \
  --set-secrets CLICKHOUSE_PASSWORD=cineagent-clickhouse-password:latest
```

---

## 6. Verify Log Analytics in GCP Console

Once deployed and invoked, query the structured telemetry and thinking tokens in **GCP Log Analytics**:

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
  `project-2154682a-9280-4a32-a72.global._Default._AllLogs`
WHERE
  log_name LIKE '%cineagent-api%'
ORDER BY
  timestamp DESC
LIMIT 50;
```
