from dotenv import find_dotenv, load_dotenv
from pydantic_settings import BaseSettings

load_dotenv(find_dotenv(usecwd=True))


class Settings(BaseSettings):
    database_url: str = ""
    voyage_api_key: str = ""
    voyage_model: str = "voyage-law-2"
    anthropic_api_key: str = ""
    courtlistener_api_token: str = ""
    # offline citation catalog (SQLite built from CourtListener bulk data)
    catalog_url: str = ""  # e.g. public R2 object URL
    catalog_path: str = "/tmp/catalog.sqlite"
    # needed only when the key is org-scoped rather than workspace-scoped
    anthropic_workspace_id: str = ""


settings = Settings()
