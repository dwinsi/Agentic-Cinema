# CineAgent Studio — Google Cloud Deployment Plan

This runbook deploys CineAgent Studio as a public web application on **Cloud Run** in Google Cloud project `project-2154682a-9280-4a32-a72`. It uses Vertex AI for Gemini/Imagen, Cloud Text-to-Speech, Artifact Registry for images, Cloud Build for builds, and Cloud Logging for structured application logs.

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

Your deployer needs Cloud Run Admin, Cloud Build access, Artifact Registry access, Service Account User, and permission to enable services and manage IAM roles. A project Owner has these permissions, but use narrower roles in a team environment.

---

## 2. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  secretmanager.googleapis.com
```

---

## 3. Create the runtime identity

Cloud Run uses this service account through Application Default Credentials; do not upload a service-account key into the container.

```bash
gcloud iam service-accounts create cineagent-runtime \
  --display-name="CineAgent Cloud Run runtime"

gcloud projects add-iam-policy-binding project-2154682a-9280-4a32-a72 \
  --member="serviceAccount:cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

`roles/aiplatform.user` enables the runtime to call Vertex AI Gemini and Imagen. Keep the identity least-privileged; add only the exact roles required for new integrations.

---

## 4. Store ClickHouse credentials in Secret Manager

Create the secret from a secure terminal input. Never paste its value into a committed file.

```bash
printf %s "YOUR_ROTATED_CLICKHOUSE_PASSWORD" | \
  gcloud secrets create cineagent-clickhouse-password --data-file=-

gcloud secrets add-iam-policy-binding cineagent-clickhouse-password \
  --member="serviceAccount:cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Use a numbered secret version such as `:1` in the Cloud Run deployment. Update the version deliberately during secret rotation.

---

## 5. Create an Artifact Registry repository

```bash
gcloud artifacts repositories create cineagent \
  --repository-format=docker \
  --location=us-central1 \
  --description="CineAgent Cloud Run container images"
```

Allow the Cloud Build service account to push only to this repository. First obtain the project number:

```bash
gcloud projects describe project-2154682a-9280-4a32-a72 --format="value(projectNumber)"
```

Then replace `PROJECT_NUMBER` below:

```bash
gcloud artifacts repositories add-iam-policy-binding cineagent \
  --location=us-central1 \
  --member="serviceAccount:PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

---

## 6. Build and publish the container

Run this from the repository root. The supplied `.gcloudignore` prevents local credentials and generated artifacts from entering the Cloud Build source archive.

```bash
gcloud builds submit . \
  --tag=us-central1-docker.pkg.dev/project-2154682a-9280-4a32-a72/cineagent/cineagent-api:v1 \
  --ignore-file=.gcloudignore
```

Verify the image exists:

```bash
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/project-2154682a-9280-4a32-a72/cineagent
```

---

## 7. Deploy the image to Cloud Run

Set your ClickHouse hostname and username, but do not put the password in this command.

```bash
gcloud run deploy cineagent-api \
  --image=us-central1-docker.pkg.dev/project-2154682a-9280-4a32-a72/cineagent/cineagent-api:v1 \
  --region=us-central1 \
  --service-account=cineagent-runtime@project-2154682a-9280-4a32-a72.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars=GCP_PROJECT_ID=project-2154682a-9280-4a32-a72,CLICKHOUSE_HOST=YOUR_CLICKHOUSE_HOST,CLICKHOUSE_USER=default,CLICKHOUSE_PORT=8443,CLICKHOUSE_SECURE=true,LOG_LEVEL=INFO,CINEAGENT_LOG_CONTENT=false \
  --set-secrets=CLICKHOUSE_PASSWORD=cineagent-clickhouse-password:1
```

Cloud Run prints the deployed service URL. Retrieve it later with:

```bash
gcloud run services describe cineagent-api \
  --region=us-central1 \
  --format="value(status.url)"
```

---

## 8. Smoke-test the deployed service

Replace `SERVICE_URL` with the output from the prior command.

```bash
curl -i "SERVICE_URL/"

curl -i -X POST "SERVICE_URL/api/vector-search" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: cloud-run-smoke-001" \
  -d '{"query":"high tension space station", "limit":2}'
```

Expect HTTP `200`, a JSON payload, and the `X-Request-ID` response header.

Test Gemini, Imagen, and TTS separately after confirming billing, API enablement, and the runtime identity permissions.

---

## 9. Verify logs in Google Cloud Console

1. Open **Cloud Run** in Google Cloud Console.
2. Select **cineagent-api**.
3. Open the **Logs** tab.
4. Search for `cloud-run-smoke-001`.

For more precise querying, open **Logging → Logs Explorer** and use:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="cineagent-api"
jsonPayload.request_id="cloud-run-smoke-001"
```

LLM telemetry:

```text
resource.type="cloud_run_revision"
jsonPayload.event=("llm_request_completed" OR "llm_request_failed")
```

The app writes structured JSON to stdout, which Cloud Run automatically stores in Cloud Logging. Raw user prompts and model responses are disabled by default; only hashes and sizes are logged unless `CINEAGENT_LOG_CONTENT=true` is deliberately enabled for a short, access-controlled debugging session.

---

## 10. Post-deployment production tasks

1. Move generated MP3 and storyboard files to Cloud Storage. Cloud Run local disk is ephemeral and cannot be used as durable media storage.
2. Add Firestore or Cloud SQL for projects, users, revisions, and approval state.
3. Add the Google ADK / Agent Builder workflow, IBM Bob evidence, and Confluent event topics required by the hackathon plan.
4. Configure Cloud Logging retention, alerts for `llm_request_failed`, and Error Reporting.
5. Use a custom domain and managed TLS if the app will be presented publicly.
6. Keep a known-good image tag for rollback.

### Roll back a Cloud Run revision

```bash
gcloud run revisions list --service=cineagent-api --region=us-central1

gcloud run services update-traffic cineagent-api \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

