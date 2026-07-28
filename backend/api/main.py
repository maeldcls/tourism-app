import datetime

from fastapi import FastAPI
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware  # type: ignore[import]
from fastapi.staticfiles import StaticFiles
import models  # noqa: F401 — nécessaire pour que SQLAlchemy détecte les modèles

# Toutes les colonnes datetime du projet sont des TIMESTAMP (sans fuseau) remplies
# via datetime.utcnow() — donc toujours des instants UTC, mais Python les renvoie
# "naïfs" (sans tzinfo). Sans ce correctif, .isoformat() produit une chaîne du
# genre "2026-07-28T14:29:01" sans indication de fuseau, que le JS du frontend
# interprète comme une heure LOCALE (pas UTC) : ça décale chaque heure affichée
# de l'offset du fuseau du navigateur (ex. +2h en France l'été, d'où les écarts
# du type "il y a 120 minutes" pour un événement qui vient de se produire).
def _isoformat_assume_utc(dt: datetime.datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.isoformat()


ENCODERS_BY_TYPE[datetime.datetime] = _isoformat_assume_utc
from routes_test import router as test_router
from routes.auth import router as auth_router
from routes.monuments import router as monuments_router
from routes.monument_photos import router as monument_photos_router
from routes.visits import router as visits_router
from routes.profile import router as profile_router
from routes.stats import router as stats_router
from routes.trips import router as trips_router
from routes.custom_points import router as custom_points_router
from routes.recommendations import router as recommendations_router
from routes.comments import router as comments_router
from routes.admin import router as admin_router
from routes.admin_photos import router as admin_photos_router
from routes.ratings import router as ratings_router
from routes.admin_tags import router as admin_tags_router
from routes.monument_tags import router as monument_tags_router
from routes.friends import router as friends_router
from routes.notifications import router as notifications_router
from routes.trip_collaborators import router as trip_collaborators_router
from routes.trip_locations import router as trip_locations_router

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
app.include_router(monument_photos_router)
app.include_router(visits_router)
app.include_router(profile_router)
app.include_router(stats_router)
app.include_router(trips_router)
app.include_router(custom_points_router)
app.include_router(recommendations_router)
app.include_router(comments_router)
app.include_router(admin_router)
app.include_router(admin_photos_router)
app.include_router(ratings_router)
app.include_router(admin_tags_router)
app.include_router(monument_tags_router)
app.include_router(friends_router)
app.include_router(notifications_router)
app.include_router(trip_collaborators_router)
app.include_router(trip_locations_router)

# Routes de test temporaires — à supprimer avant la prod
app.include_router(test_router)

# Fichiers statiques — photos communautaires uploadées (créé par routes.monument_photos à l'import)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
def root():
    return {"message": "API is runningggggggggggg"}
