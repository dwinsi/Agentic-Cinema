import os
from google import genai

project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "project-2154682a-9280-4a32-a72")
adc_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

print(f"✅ ADC Credential Path: {adc_path}")
print(f"🚀 Connecting to GCP Project: {project_id}")

# Initialize Vertex AI client using the explicit credentials
client = genai.Client(
    vertexai=True,
    project=project_id,
    location="us-central1"
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Generate 3 short, compelling movie loglines for sci-fi films.",
)

print("\n--- ✅ Connection Successful! Gemini Output: ---")
print(response.text)