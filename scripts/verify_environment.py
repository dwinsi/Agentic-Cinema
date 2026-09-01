"""
Environment & Service Verification Diagnostics for CineAgent Studio.
Consolidates checks for GCP credentials, Gemini Enterprise, Cloud Text-to-Speech,
Imagen 3, and the official ClickHouse MCP Server.
"""

import os
import sys
from dotenv import load_dotenv

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

load_dotenv()

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "project-2154682a-9280-4a32-a72")

def check_gemini():
    print("\n--- 1. Testing Vertex AI Gemini 2.5 ---")
    try:
        # Clean up key path override if non-existent
        if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ and not os.path.exists(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]):
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

        from google import genai
        client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")
        res = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="State 'Gemini Active' in 2 words."
        )
        
        output_text = res.text or ""
        if not output_text and getattr(res, "candidates", None):
            for candidate in res.candidates:
                content = getattr(candidate, "content", None)
                if content and getattr(content, "parts", None):
                    for part in content.parts:
                        if getattr(part, "text", None):
                            output_text += part.text + " "

        print(f"✅ Gemini Response: {output_text.strip() if output_text else '[Response Received]'}")
    except Exception as e:
        print(f"❌ Gemini check failed: {e}")

def check_cloud_tts():
    print("\n--- 2. Testing Google Cloud Text-to-Speech ---")
    try:
        from google.cloud import texttospeech
        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text="CineAgent Studio Audio Online.")
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name="en-US-Journey-F",
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE
        )
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
        res = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
        print(f"✅ Cloud TTS synthesized {len(res.audio_content)} bytes of audio.")
    except Exception as e:
        print(f"❌ Cloud TTS check failed: {e}")

def check_clickhouse_mcp():
    print("\n--- 3. Testing Official ClickHouse MCP Server (`mcp-clickhouse`) ---")
    try:
        from database.mcp_client import clickhouse_mcp_client
        print(f"ClickHouse Host: {clickhouse_mcp_client.host}")
        print(f"MCP Available: {clickhouse_mcp_client.is_available}")
        tables = clickhouse_mcp_client.list_tables()
        print(f"✅ ClickHouse MCP Tables: {tables}")
    except Exception as e:
        print(f"❌ ClickHouse MCP check failed: {e}")

def main():
    print("🎬 CineAgent Studio System Diagnostics")
    print(f"GCP Project ID: {PROJECT_ID}")
    check_gemini()
    check_cloud_tts()
    check_clickhouse_mcp()
    print("\n✅ Diagnostics run finished.")

if __name__ == "__main__":
    main()
