from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    keitaro_api_key: str = ""
    keitaro_base_url: str = "https://tlgk.host/admin_api/v1"
    database_url: str = "postgresql+psycopg2://adrobot:adrobot@db:5432/adrobot"

    # Защита API: количество запросов с одного IP в минуту.
    rate_limit_per_minute: int = 120
    # Разрешённые origins для CORS (через запятую).
    cors_allow_origins: str = "http://localhost:8080,http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
