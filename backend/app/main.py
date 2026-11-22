from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .middleware import SecurityMiddleware
from .routers import campaigns, offers, reference

app = FastAPI(title="Adrobot", version="1.0.0")

app.add_middleware(SecurityMiddleware)

origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or [],
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(campaigns.router)
app.include_router(offers.router)
app.include_router(reference.router)


@app.get("/health")
def health():
    return {"status": "ok"}
