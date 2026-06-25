from supabase import create_client, Client
from app.config import settings

# Initialize the Supabase Client with the configuration settings
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_key)
