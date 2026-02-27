# backend/api/main.py
from fastapi import FastAPI
from api.routes import destinations, users

app = FastAPI(title="Tourism API")
app.include_router(destinations.router, prefix="/home")
app.include_router(users.router, prefix="/users")