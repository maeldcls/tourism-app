from fastapi import FastAPI
from database import Base, engine
import models  # noqa: F401 — nécessaire pour que SQLAlchemy détecte les modèles
from routes_test import router as test_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tourism API")
app.include_router(test_router)

@app.get("/")
def root():
    return {"message": "API is running"}
