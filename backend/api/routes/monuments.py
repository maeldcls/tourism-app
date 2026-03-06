"""
Monuments routes — pages Destinations, MapPage, Monument.

GET  /monuments              → page Destinations : liste tous les monuments
                               ?city=Paris         → filtre par ville
                               ?theme=histoire     → filtre par thème
GET  /monuments/nearby       → page MapPage : monuments proches d'une position GPS
                               ?lat=48.8&lon=2.3&radius_km=5
GET  /monuments/{id}         → page Monument : détail d'un monument
"""
from math import radians, cos, sin, asin, sqrt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/monuments", tags=["Monuments"])


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en km entre deux points GPS (formule de Haversine)."""
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _monument_to_dict(m: models.Monument) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "city": m.city,
        "latitude": m.latitude,
        "longitude": m.longitude,
    }


# ── GET /monuments ─────────────────────────────────────────────────────────────
# Page : Destinations
@router.get("")
def get_monuments(
    city: Optional[str] = Query(None, description="Filtrer par ville"),
    theme: Optional[str] = Query(None, description="Filtrer par thème"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Monument)
    if city:
        query = query.filter(models.Monument.city.ilike(f"%{city}%"))
    monuments = query.all()
    return [_monument_to_dict(m) for m in monuments]


# ── GET /monuments/nearby ──────────────────────────────────────────────────────
# Page : MapPage — monuments dans un rayon autour de la position GPS du user
@router.get("/nearby")
def get_nearby_monuments(
    lat: float = Query(..., description="Latitude du user"),
    lon: float = Query(..., description="Longitude du user"),
    radius_km: float = Query(5.0, description="Rayon de recherche en km"),
    db: Session = Depends(get_db),
):
    monuments = db.query(models.Monument).filter(
        models.Monument.latitude.isnot(None),
        models.Monument.longitude.isnot(None),
    ).all()

    nearby = []
    for m in monuments:
        distance = _haversine_km(lat, lon, m.latitude, m.longitude)
        if distance <= radius_km:
            data = _monument_to_dict(m)
            data["distance_km"] = round(distance, 2)
            nearby.append(data)

    nearby.sort(key=lambda x: x["distance_km"])
    return nearby


# ── GET /monuments/{id} ────────────────────────────────────────────────────────
# Page : Monument — détail complet d'un monument
@router.get("/{monument_id}")
def get_monument(monument_id: int, db: Session = Depends(get_db)):
    m = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    visit_count = len(m.visits)
    return {
        **_monument_to_dict(m),
        "visit_count": visit_count,
    }
