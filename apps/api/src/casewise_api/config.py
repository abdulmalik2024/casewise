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
    building_facts_url: str = ""
    building_facts_path: str = "/tmp/buildingfacts.sqlite"
    # needed only when the key is org-scoped rather than workspace-scoped
    anthropic_workspace_id: str = ""
    # Supabase Auth (token validation): project URL + anon/publishable key
    supabase_url: str = ""
    supabase_anon_key: str = ""
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_monthly: str = ""
    stripe_price_yearly: str = ""
    stripe_price_starter: str = ""


settings = Settings()
