from pydantic import BaseModel


class VoiceTranscriptionResponse(BaseModel):
    transcript: str
    status: str = "ok"