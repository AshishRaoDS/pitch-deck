from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str
    serper_api_key: str
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
