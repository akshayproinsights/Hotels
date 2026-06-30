from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, rooms, customers, bookings, inventory, calendar, documents, reports

app = FastAPI(
    title="Santosh Palace API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Secure HTTP Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Mitigate XSS attacks by checking content-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Mitigate clickjacking attacks
    response.headers["X-Frame-Options"] = "DENY"
    # Content Security Policy (strict API defaults)
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    # Disable unused browser features
    response.headers["Permission-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

# Register routers
app.include_router(auth.router,      prefix="/auth",      tags=["auth"])
app.include_router(rooms.router,     prefix="/rooms",     tags=["rooms"])
app.include_router(customers.router, prefix="/customers", tags=["customers"])
app.include_router(bookings.router,  prefix="/bookings",  tags=["bookings"])
app.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
app.include_router(calendar.router,  prefix="/calendar",  tags=["calendar"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(reports.router,   prefix="/reports",   tags=["reports"])

@app.get("/health")
def health():
    return {"status": "ok", "service": "santosh-palace-api"}
