from google.cloud import texttospeech
import os
os.environ["GCP_PROJECT_ID"] = "project-2154682a-9280-4a32-a72"
client = texttospeech.TextToSpeechClient()
synthesis_input = texttospeech.SynthesisInput(text="Testing audio")
voice = texttospeech.VoiceSelectionParams(language_code="en-US", name="en-US-Journey-F", ssml_gender=texttospeech.SsmlVoiceGender.FEMALE)
audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
try:
    response = client.synthesize_speech(input=synthesis_input, voice=voice, audio_config=audio_config)
    print("SUCCESS")
except Exception as e:
    print("FAILED:", e)
