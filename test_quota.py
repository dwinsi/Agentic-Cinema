from google import genai
import os
os.environ["GCP_PROJECT_ID"] = "project-2154682a-9280-4a32-a72"
os.environ["GOOGLE_CLOUD_QUOTA_PROJECT"] = "project-2154682a-9280-4a32-a72"
client = genai.Client(enterprise=True, project="project-2154682a-9280-4a32-a72", location="us-central1")
try:
    response = client.models.generate_images(
        model='imagen-3.0-generate-001',
        prompt='test image',
        config={'number_of_images': 1, 'output_mime_type': 'image/jpeg'}
    )
    print("SUCCESS")
except Exception as e:
    print("FAILED:", e)
