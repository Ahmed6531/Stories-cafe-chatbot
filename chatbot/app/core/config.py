from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Stories Cafe Chatbot Service"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    express_api_base_url: str = "http://localhost:5000"

    openai_provider: str = "azure"

    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_api_version: str = "2024-02-15-preview"
    azure_openai_deployment: str = "gpt-4o-mini"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    groq_api_key: str = ""
    stt_model: str = "whisper-large-v3-turbo"
    stt_language: str = "en"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()