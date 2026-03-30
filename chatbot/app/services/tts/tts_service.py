import base64
import json

from google.cloud import texttospeech
from google.oauth2 import service_account
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from .ssml_builder import build_ssml


FALLBACK_VOICE = "en-US-Neural2-F"

VOICE_PERSONALITIES = {
    "default": {
        "voice": "en-US-Journey-F",
        "speaking_rate": 1.0,
        "pitch": 0.0,
    },
    "fun_demo": {
        "voice": "en-US-Journey-F",
        "speaking_rate": 1.08,
        "pitch": 2.0,
    },
}


class TTSService:
    """
    Converts reply text to MP3 audio via Google Cloud Text-to-Speech.

    Voice configuration:
    - Language: en-US
    - Preferred voice: settings.tts_voice (default en-US-Journey-F)
    - Fallback voice: en-US-Neural2-F
    - Audio encoding: MP3

    Personality profiles:
    - default: balanced and natural
    - fun_demo: slightly faster and brighter for a more engaging demo feel
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client

        creds_json = settings.google_credentials_json
        if not creds_json:
            raise ValueError("GOOGLE_CREDENTIALS_JSON is not set")

        try:
            creds_dict = json.loads(creds_json)
        except (json.JSONDecodeError, TypeError):
            with open(creds_json, encoding="utf-8") as handle:
                creds_dict = json.load(handle)

        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        self._client = texttospeech.TextToSpeechClient(credentials=credentials)
        return self._client

    def _get_personality_profile(self) -> dict:
        """
        Returns the active personality profile.
        For this task, default to fun_demo so the chatbot sounds more engaging in demos.
        
        """
        personality_name = (settings.tts_personality or "fun_demo").strip().lower()
        profile = VOICE_PERSONALITIES.get(
        personality_name,
        VOICE_PERSONALITIES["fun_demo"],
    ).copy()

        custom_voice = settings.tts_voice.strip() if settings.tts_voice else ""

        if custom_voice:
            profile["voice"] = custom_voice

        return profile

    async def synthesize(self, text: str) -> str | None:
        """
        Convert text to base64 MP3 data URI.
        Returns None on any error so chat stays non-blocking.
        """
        if not settings.tts_enabled:
            return None
        if not text or not text.strip():
            return None

        try:
            ssml = build_ssml(text)
            client = self._get_client()
            profile = self._get_personality_profile()

            response = await self._synthesize_with_voice(
                client=client,
                ssml=ssml,
                voice_name=profile["voice"],
                speaking_rate=profile["speaking_rate"],
                pitch=profile["pitch"],
            )

            encoded = base64.b64encode(response.audio_content).decode("utf-8")
            return f"data:audio/mp3;base64,{encoded}"
        except Exception as exc:
            print(f"[TTS] synthesis failed: {exc}")
            return None

    async def _synthesize_with_voice(
        self,
        client,
        ssml: str,
        voice_name: str,
        speaking_rate: float,
        pitch: float,
    ):
        synthesis_input = texttospeech.SynthesisInput(ssml=ssml)
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=speaking_rate,
            pitch=pitch,
        )

        async def run_request(selected_voice: str):
            voice = texttospeech.VoiceSelectionParams(
                language_code="en-US",
                name=selected_voice,
            )
            return await run_in_threadpool(
                client.synthesize_speech,
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )

        try:
            return await run_request(voice_name)
        except Exception:
            if voice_name == FALLBACK_VOICE:
                raise
            return await run_request(FALLBACK_VOICE)


tts_service = TTSService()