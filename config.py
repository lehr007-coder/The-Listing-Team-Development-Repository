import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Central configuration loaded from environment variables."""

    # Anthropic
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # Squarespace
    SQUARESPACE_API_KEY = os.getenv("SQUARESPACE_API_KEY", "")
    SQUARESPACE_SITE_ID = os.getenv("SQUARESPACE_SITE_ID", "")
    SQUARESPACE_BLOG_COLLECTION_ID = os.getenv("SQUARESPACE_BLOG_COLLECTION_ID", "")

    # Go High Level
    GHL_API_KEY = os.getenv("GHL_API_KEY", "")
    GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "")
    GHL_BLOG_ID = os.getenv("GHL_BLOG_ID", "")

    @classmethod
    def validate_anthropic(cls):
        if not cls.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is not set. Add it to your .env file.")

    @classmethod
    def validate_squarespace(cls):
        missing = []
        if not cls.SQUARESPACE_API_KEY:
            missing.append("SQUARESPACE_API_KEY")
        if not cls.SQUARESPACE_SITE_ID:
            missing.append("SQUARESPACE_SITE_ID")
        if not cls.SQUARESPACE_BLOG_COLLECTION_ID:
            missing.append("SQUARESPACE_BLOG_COLLECTION_ID")
        if missing:
            raise ValueError(f"Missing Squarespace config: {', '.join(missing)}")

    @classmethod
    def validate_ghl(cls):
        missing = []
        if not cls.GHL_API_KEY:
            missing.append("GHL_API_KEY")
        if not cls.GHL_LOCATION_ID:
            missing.append("GHL_LOCATION_ID")
        if missing:
            raise ValueError(f"Missing Go High Level config: {', '.join(missing)}")
