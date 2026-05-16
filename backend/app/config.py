from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = ""
    anthropic_api_key: str = ""
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"
    user_state: str = "PA"
    user_filing_status: str = "single"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        # SQLite fallback so the app runs without Postgres.
        sqlite_path = Path(__file__).resolve().parent.parent / "gigledger.db"
        return f"sqlite:///{sqlite_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
