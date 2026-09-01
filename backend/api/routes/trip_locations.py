"""
Partage de position en direct entre membres d'un trajet.

V1 volontairement limité : partage uniquement pendant que l'app est ouverte au
premier plan (le client renvoie sa position à intervalle régulier via
watchPosition + heartbeat), dernière position connue uniquement (pas
d'historique de tracé stocké). Opt-in par trajet, révocable à tout moment.

PUT    /trips/{trip_id}/location   → démarrer/mettre à jour son propre partage
DELETE /trips/{trip_id}/location   → arrêter son propre partage sur ce trajet
GET    /trips/{trip_id}/locations  → positions actives (non périmées) des membres, soi-même inclus
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from trip_utils import get_trip
import models

router = APIRouter(prefix="/trips", tags=["Position en direct"])

# Au-delà de ce délai sans mise à jour, on considère que le partage s'est arrêté
# (app fermée/onglet perdu/crash) même si le client n'a pas pu appeler DELETE.
STALE_AFTER_SECONDS = 120


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float


# ── PUT /trips/{trip_id}/location ──────────────────────────────────────────────
@router.put("/{trip_id}/location")
def update_location(
    trip_id: int,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    trip: models.Trip = Depends(get_trip("read")),
):
    share = db.query(models.TripLocationShare).filter(
        models.TripLocationShare.trip_id == trip_id,
        models.TripLocationShare.user_id == current_user.id,
    ).first()
    if share is None:
        share = models.TripLocationShare(trip_id=trip_id, user_id=current_user.id)
        db.add(share)

    share.latitude = body.latitude
    share.longitude = body.longitude
    share.updated_at = datetime.utcnow()
    db.commit()
    return {"trip_id": trip_id, "updated_at": share.updated_at}


# ── DELETE /trips/{trip_id}/location ───────────────────────────────────────────
@router.delete("/{trip_id}/location", status_code=200)
def stop_sharing_location(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    trip: models.Trip = Depends(get_trip("read")),
):
    share = db.query(models.TripLocationShare).filter(
        models.TripLocationShare.trip_id == trip_id,
        models.TripLocationShare.user_id == current_user.id,
    ).first()
    if share:
        db.delete(share)
        db.commit()
    return {"trip_id": trip_id, "sharing": False}


# ── GET /trips/{trip_id}/locations ─────────────────────────────────────────────
# Inclut la position de l'appelant (utile pour resynchroniser l'état "je partage"
# côté client après un rechargement de page) — le frontend filtre son propre id
# pour l'affichage des marqueurs des autres membres.
@router.get("/{trip_id}/locations")
def list_locations(
    trip_id: int,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("read")),
):
    cutoff = datetime.utcnow() - timedelta(seconds=STALE_AFTER_SECONDS)
    shares = db.query(models.TripLocationShare).filter(
        models.TripLocationShare.trip_id == trip_id,
        models.TripLocationShare.updated_at >= cutoff,
    ).all()

    return [
        {
            "user_id": s.user_id,
            "username": s.user.username,
            "avatar_url": s.user.avatar_url,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "updated_at": s.updated_at,
        }
        for s in shares
    ]
