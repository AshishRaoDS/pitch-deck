import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str
    serper_api_key: str
    cors_origins: str = "http://localhost:5173"
    kb_persist_dir: str = os.path.join(
        os.path.expanduser("~"), ".meeting-bot", "kb"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
