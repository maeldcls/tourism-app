from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware  # type: ignore[import]
import models  # noqa: F401 — nécessaire pour que SQLAlchemy détecte les modèles
from routes_test import router as test_router
from routes.auth import router as auth_router
from routes.monuments import router as monuments_router
from routes.visits import router as visits_router
from routes.profile import router as profile_router
from routes.stats import router as stats_router
from routes.trips import router as trips_router
from routes.recommendations import router as recommendations_router
from routes.comments import router as comments_router
from routes.admin import router as admin_router
from routes.ratings import router as ratings_router
from routes.admin_tags import router as admin_tags_router
from routes.monument_tags import router as monument_tags_router

app = FastAPI(title="Tourism API")

# CORS — permet au front React (localhost:3000) d'appeler l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://tourism-app.projets-cda.garage404.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes métier
app.include_router(auth_router)
app.include_router(monuments_router)
app.include_router(visits_router)
app.include_router(profile_router)
app.include_router(stats_router)
app.include_router(trips_router)
app.include_router(recommendations_router)
app.include_router(comments_router)
app.include_router(admin_router)
app.include_router(ratings_router)
app.include_router(admin_tags_router)
app.include_router(monument_tags_router)

# Routes de test temporaires — à supprimer avant la prod
app.include_router(test_router)


@app.get("/")
def root():
    return {"message": "API is runningggggggggggg"}
