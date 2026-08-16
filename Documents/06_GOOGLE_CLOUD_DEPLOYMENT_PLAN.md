# CineAgent Studio — Google Cloud Deployment & Automated CI/CD Plan

This runbook documents the complete lifecycle for **CineAgent Studio** in Google Cloud project `project-2154682a-9280-4a32-a72`: manual deployments, automated **CI/CD pipelines** (via **GitHub Actions** and **Cloud Build Triggers**), secret management, IAM permissions, and observability.

> **Target Region**: `us-central1` (matches Vertex AI Gemini & Imagen location).

---

## 0. Prerequisites & Security

- Ensure `.gcloudignore` and `.dockerignore` exclude `.env`, `.git`, credentials, and local build artifacts from being uploaded.
- Store sensitive values (such as the ClickHouse password) in **Secret Manager** instead of passing plain text environment variables.
- Cloud Run uses its assigned runtime Service Account with Application Default Credentials (ADC) to interact with Vertex AI and Cloud Logging—no service account JSON keys inside the container.

---

## 1. Project Setup & Authentication

```bash
export PROJECT_ID="project-2154682a-9280-4a32-a72"
export REGION="us-central1"

gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
gcloud auth list
```

---

## 2. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
```

---

## 3. Configure IAM & Service Accounts

### A. Runtime Identity (`cineagent-runtime`)
Cloud Run runs with this identity:

```bash
# Create runtime service account (skip if already exists)
gcloud iam service-accounts create cineagent-runtime \
  --display-name="CineAgent Cloud Run runtime" || true

# Grant Vertex AI user role (Gemini & text-embedding-004)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Grant Cloud Logging Writer access
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"
```

### B. Cloud Build & Artifact Registry Roles
Cloud Build builds the container image and pushes it to Artifact Registry during source deployment:

```bash
PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

# Grant Compute Engine default service account Artifact Registry, Logging, and Cloud Run Admin access
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/run.admin"

# Allow Compute SA to act as the runtime service account
gcloud iam service-accounts add-iam-policy-binding "cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Grant Cloud Build service account Artifact Registry writer & Cloud Run Admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUM}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUM}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding "cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:${PROJECT_NUM}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

---

## 4. Store ClickHouse Password in Secret Manager

```bash
# Replace YOUR_CLICKHOUSE_PASSWORD with your ClickHouse instance password
printf %s "YOUR_CLICKHOUSE_PASSWORD" | \
  gcloud secrets create cineagent-clickhouse-password --data-file=- || \
  printf %s "YOUR_CLICKHOUSE_PASSWORD" | \
  gcloud secrets versions add cineagent-clickhouse-password --data-file=-

# Grant Secret Accessor to the Cloud Run runtime service account
gcloud secrets add-iam-policy-binding cineagent-clickhouse-password \
  --member="serviceAccount:cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 5. Automated CI/CD Setup

We provide two production-ready options to automatically build and deploy whenever you push code changes to the `main` branch.

### Option A: GitHub Actions with Workload Identity Federation (Configured & Recommended)

GitHub Actions uses **Google Cloud Workload Identity Federation** (keyless OIDC authentication). No long-lived service account keys or secrets are needed.

The workflow is pre-configured at `.github/workflows/deploy.yml`.

#### One-Time GCP Setup (Already Done):
```bash
PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

# 1. Create CI/CD Service Account
gcloud iam service-accounts create cineagent-cicd \
  --display-name="CineAgent GitHub Actions CI/CD" || true

# 2. Grant Artifact Registry Writer and Cloud Run Admin
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:cineagent-cicd@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:cineagent-cicd@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Allow CI/CD SA to act as the runtime service account
gcloud iam service-accounts add-iam-policy-binding "cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:cineagent-cicd@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# 3. Create Workload Identity Pool and Provider for GitHub Actions
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool" || true

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == 'dwinsi/Agentic-Cinema'" || true

# 4. Authorize repository to impersonate cineagent-cicd
gcloud iam service-accounts add-iam-policy-binding "cineagent-cicd@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github-pool/attribute.repository/dwinsi/Agentic-Cinema"
```

Now, every `git push` or `pull_request` triggers the automated `pytest` test suite (17 tests) on Python 3.13. Deployments only proceed to Cloud Run if all unit, integration, and MCP tests pass.

---

### Option B: Google Cloud Build Triggers (Native GCP)

A Cloud Build configuration is pre-configured at `cloudbuild.yaml` with automated `pytest` execution on `python:3.13-slim` prior to container compilation.

To connect your GitHub repository directly to Cloud Build:

```bash
# Create a build trigger that listens to push events on the main branch
gcloud builds triggers create github \
  --repo-name=Agentic-Cinema \
  --repo-owner=dwinsi \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --region="$REGION"
```

*(If this is the first time connecting GitHub to Cloud Build in this project, open [Cloud Build Triggers Console](https://console.cloud.google.com/cloud-build/triggers?project=project-2154682a-9280-4a32-a72) to complete the one-time OAuth link).*

---

## 6. Manual Deploy Command (Fallback)

If you ever need to deploy directly from your local terminal:

```bash
gcloud run deploy cineagent-api \
  --source . \
  --region "$REGION" \
  --service-account "cineagent-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID="$PROJECT_ID",CLICKHOUSE_HOST=eobvth7u0q.asia-southeast1.gcp.clickhouse.cloud,CLICKHOUSE_USER=default,CLICKHOUSE_PORT=8443,CLICKHOUSE_SECURE=true \
  --set-secrets CLICKHOUSE_PASSWORD=cineagent-clickhouse-password:latest
```

---

## 7. Verify Deployment & Observability

### Health Check
```bash
SERVICE_URL=$(gcloud run services describe cineagent-api --region "$REGION" --format="value(status.url)")
curl -s "${SERVICE_URL}/health" | jq .
```

### Telemetry in GCP Log Analytics
Query structured telemetry and thinking token counts in **GCP Log Analytics**:

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

---

## 8. Common Troubleshooting

| Issue | Root Cause | Fix |
|---|---|---|
| `denied: Permission 'artifactregistry.repositories.uploadArtifacts' denied` | Cloud Build / GitHub runner lacks `roles/artifactregistry.writer` | Run Section 3B / Section 5 to grant `artifactregistry.writer` to the build runner. |
| `Service account cineagent-runtime does not have permission to act as...` | Runner lacks `roles/iam.serviceAccountUser` | Run `gcloud iam service-accounts add-iam-policy-binding ... --role="roles/iam.serviceAccountUser"`. |
| `PermissionDenied: Secret cineagent-clickhouse-password` | Runtime SA cannot read secret | Verify `roles/secretmanager.secretAccessor` is bound on the secret for `cineagent-runtime`. |
| `Container failed to start and listen on PORT 8080` | Startup error or dependency issue | Run `gcloud run services logs read cineagent-api --region us-central1 --limit 50`. |
