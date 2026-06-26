import sys
from app.config import settings
from supabase import create_client

def main():
    if len(sys.argv) < 4:
        print("Usage: ./venv/bin/python3 create_staff.py <email> <password> <name>")
        sys.exit(1)
        
    email = sys.argv[1]
    password = sys.argv[2]
    name = sys.argv[3]
    
    print(f"Connecting to Supabase at: {settings.supabase_url}")
    supabase = create_client(settings.supabase_url, settings.supabase_service_key)
    
    try:
        user = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name}
        })
        print("\n✅ Staff user created successfully in Supabase!")
        print(f"ID: {user.user.id}")
        print(f"Email: {user.user.email}")
        print(f"Name: {name}")
    except Exception as e:
        print(f"\n❌ Failed to create user: {e}")

if __name__ == "__main__":
    main()
