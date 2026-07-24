"""
Trips routes — gestion des trajets utilisateur.

GET    /trips/user/{user_id}                      → lister les trajets avec monuments
POST   /trips                                     → créer un trajet
POST   /trips/{trip_id}/monuments                 → ajouter un monument au trajet
PATCH  /trips/{trip_id}/monuments/{monument_id}   → marquer un monument comme visité (ou non)
DELETE /trips/{trip_id}/monuments/{monument_id}   → retirer un monument du trajet
DELETE /trips/{trip_id}                           → supprimer un trajet
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import requests
from database import get_db
from deps import get_current_user
import models

router = APIRouter(prefix="/trips", tags=["Trajets"])

ORS_API_KEY = os.getenv("ORS_API_KEY", "")
ORS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"


class TripCreate(BaseModel):
    user_id: int
    name: str
    description: Optional[str] = None


class TripMonumentAdd(BaseModel):
    monument_id: int


class TripMonumentUpdate(BaseModel):
    is_visited: bool


# ── GET /trips/user/{user_id} ──────────────────────────────────────────────────
@router.get("/user/{user_id}")
def get_user_trips(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    trips = (
        db.query(models.Trip)
        .filter(models.Trip.user_id == user_id)
        .order_by(models.Trip.created_at.desc())
        .all()
    )

    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "start_date": t.start_date,
            "end_date": t.end_date,
            "status": t.status,
            "created_at": t.created_at,
            "monuments": [
                {
                    "monument_id": tm.monument_id,
                    "name": tm.monument.name if tm.monument else None,
                    "city": tm.monument.city if tm.monument else None,
                    "latitude": tm.monument.latitude if tm.monument else None,
                    "longitude": tm.monument.longitude if tm.monument else None,
                    "category": tm.monument.category if tm.monument else None,
                    "is_visited": tm.is_visited,
                    "order": tm.order,
                }
                for tm in sorted(t.trip_monuments, key=lambda x: x.order)
            ],
        }
        for t in trips
    ]


# ── POST /trips ────────────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_trip(body: TripCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    trip = models.Trip(
        user_id=body.user_id,
        name=body.name,
        description=body.description,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return {"id": trip.id, "name": trip.name, "status": trip.status, "created_at": trip.created_at}


# ── POST /trips/{trip_id}/monuments ───────────────────────────────────────────
@router.post("/{trip_id}/monuments", status_code=201)
def add_monument_to_trip(trip_id: int, body: TripMonumentAdd, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")

    monument = db.query(models.Monument).filter(models.Monument.id == body.monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    existing = db.query(models.TripMonument).filter(
        models.TripMonument.trip_id == trip_id,
        models.TripMonument.monument_id == body.monument_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Monument déjà dans ce trajet")

    count = db.query(models.TripMonument).filter(models.TripMonument.trip_id == trip_id).count()
    tm = models.TripMonument(
        trip_id=trip_id,
        monument_id=body.monument_id,
        order=count,
    )
    db.add(tm)
    db.commit()
    return {"trip_id": trip_id, "monument_id": body.monument_id}


# ── PATCH /trips/{trip_id}/monuments/{monument_id} ────────────────────────────
@router.patch("/{trip_id}/monuments/{monument_id}", status_code=200)
def update_trip_monument(trip_id: int, monument_id: int, body: TripMonumentUpdate, db: Session = Depends(get_db)):
    tm = db.query(models.TripMonument).filter(
        models.TripMonument.trip_id == trip_id,
        models.TripMonument.monument_id == monument_id,
    ).first()
    if not tm:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans ce trajet")
    tm.is_visited = body.is_visited
    db.commit()
    return {"trip_id": trip_id, "monument_id": monument_id, "is_visited": tm.is_visited}


# ── DELETE /trips/{trip_id}/monuments/{monument_id} ───────────────────────────
@router.delete("/{trip_id}/monuments/{monument_id}", status_code=200)
def remove_monument_from_trip(trip_id: int, monument_id: int, db: Session = Depends(get_db)):
    tm = db.query(models.TripMonument).filter(
        models.TripMonument.trip_id == trip_id,
        models.TripMonument.monument_id == monument_id,
    ).first()
    if not tm:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans ce trajet")
    db.delete(tm)
    db.commit()
    return {"detail": "Monument retiré du trajet"}


# ── DELETE /trips/{trip_id} ────────────────────────────────────────────────────
@router.delete("/{trip_id}", status_code=200)
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    db.delete(trip)
    db.commit()
    return {"detail": "Trajet supprimé"}


# ── GET /trips/{trip_id}/route ─────────────────────────────────────────────────
@router.get("/{trip_id}/route")
def get_trip_route(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if trip.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")

    ordered = sorted(trip.trip_monuments, key=lambda tm: tm.order)
    coords = [
        [tm.monument.longitude, tm.monument.latitude]
        for tm in ordered
        if tm.monument and tm.monument.latitude is not None and tm.monument.longitude is not None
    ]

    if len(coords) < 2:
        return {"coordinates": [], "distance": None, "duration": None}

    if not ORS_API_KEY:
        raise HTTPException(status_code=503, detail="Service d'itinéraire non configuré")

    try:
        resp = requests.post(
            ORS_URL,
            headers={"Authorization": ORS_API_KEY, "Content-Type": "application/json"},
            json={"coordinates": coords},
            timeout=10,
        )
        resp.raise_for_status()
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Impossible de calculer l'itinéraire")

    feature = resp.json()["features"][0]
    summary = feature["properties"]["summary"]

    return {
        "coordinates": [[lat, lon] for lon, lat in feature["geometry"]["coordinates"]],
        "distance": summary.get("distance"),
        "duration": summary.get("duration"),
    }
