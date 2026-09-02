import datetime
import logging

from fastapi import FastAPI, Request
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware  # type: ignore[import]
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import models  # noqa: F401 — nécessaire pour que SQLAlchemy détecte les modèles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

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
from routes.auth import router as auth_router
from routes.monuments import router as monuments_router
from routes.monument_photos import router as monument_photos_router
from routes.visits import router as visits_router
from routes.profile import router as profile_router
from routes.stats import router as stats_router
from routes.trips import router as trips_router
from routes.custom_points import router as custom_points_router
from routes.custom_point_photos import router as custom_point_photos_router
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
app.include_router(custom_point_photos_router)
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

# Fichiers statiques — photos communautaires uploadées (créé par routes.monument_photos à l'import)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# Filet de sécurité : toute exception non prévue (bug, panne d'un service externe non
# catchée...) atterrissait auparavant en 500 brut de FastAPI, sans trace exploitable.
# Les HTTPException levées volontairement par les routes ne passent PAS par ce handler
# (Starlette les route vers son propre handler, plus spécifique).
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Erreur non gérée sur %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Erreur interne du serveur"})


@app.get("/")
def root():
    return {"message": "API is runningggggggggggg"}
