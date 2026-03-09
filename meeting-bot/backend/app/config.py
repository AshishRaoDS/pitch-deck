import os

from pydantic_settings import BaseSettings


def _env_file_path() -> str | None:
    path = os.path.join(os.path.dirname(__file__), "..", ".env")
    return path if os.path.exists(path) else None


class Settings(BaseSettings):
    openai_api_key: str = ""
    cors_origins: str = "*"

    class Config:
        env_file = _env_file_path()
        env_file_encoding = "utf-8"


settings = Settings()
