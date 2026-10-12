from dotenv import find_dotenv, load_dotenv
from pydantic_settings import BaseSettings

load_dotenv(find_dotenv(usecwd=True))


class Settings(BaseSettings):
    database_url: str = ""
    voyage_api_key: str = ""
    voyage_model: str = "voyage-law-2"
    anthropic_api_key: str = ""


settings = Settings()
