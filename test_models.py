from google import genai
import os
os.environ["GCP_PROJECT_ID"] = "project-2154682a-9280-4a32-a72"
client = genai.Client(enterprise=True, project="project-2154682a-9280-4a32-a72", location="us-central1")
try:
    models = client.models.list()
    for m in models:
        if 'image' in m.name.lower() or 'imagen' in m.name.lower():
            print(m.name)
except Exception as e:
    print(e)
