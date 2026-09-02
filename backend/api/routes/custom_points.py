"""Custom points routes — points créés librement par l'utilisateur sur la carte
(hors monuments OSM), à la manière de Google My Maps.

POST   /custom-points                 → créer un point (rattaché à un trajet ou non)
GET    /custom-points/user/{user_id}  → lister les points custom de l'utilisateur
PATCH  /custom-points/{id}            → modifier (nom, icône, couleur, trajet, visibilité...)
DELETE /custom-points/{id}            → supprimer
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from deps import get_current_user, get_current_user_optional
from services.trip_utils import require_trip_role, load_trip_or_404
import models

router = APIRouter(prefix="/custom-points", tags=["Points personnalisés"])


class CustomPointCreate(BaseModel):
    name: str
    latitude: float
    longitude: float
    icon: str = "pin"
    color: Optional[str] = None
    trip_id: Optional[int] = None


class CustomPointUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    trip_id: Optional[int] = None
    unassign_trip: bool = False  # nécessaire pour distinguer "ne pas toucher" de "retirer du trajet"
    order: Optional[int] = None
    day: Optional[int] = None
    is_visited: Optional[bool] = None
    is_hidden: Optional[bool] = None
    is_public: Optional[bool] = None


def _serialize(p: models.CustomPoint, include_images: bool = False, include_owner: bool = False) -> dict:
    d = {
        "id": p.id,
        "user_id": p.user_id,
        "trip_id": p.trip_id,
        "name": p.name,
        "icon": p.icon,
        "color": p.color,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "order": p.order,
        "day": p.day,
        "is_visited": p.is_visited,
        "is_hidden": p.is_hidden,
        "is_public": p.is_public,
        "created_at": p.created_at,
    }
    if include_images:
        d["images"] = [{"id": img.id, "url": img.image_url} for img in p.images]
    if include_owner:
        d["owner"] = {"id": p.user.id, "username": p.user.username, "avatar_url": p.user.avatar_url}
    return d


# ── POST /custom-points ────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_custom_point(
    body: CustomPointCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.trip_id is not None:
        trip = load_trip_or_404(db, body.trip_id)
        require_trip_role(db, trip, current_user, "write")
        count = db.query(models.CustomPoint).filter(models.CustomPoint.trip_id == body.trip_id).count()
    else:
        count = 0

    point = models.CustomPoint(
        user_id=current_user.id,
        trip_id=body.trip_id,
        name=body.name,
        icon=body.icon,
        color=body.color,
        latitude=body.latitude,
        longitude=body.longitude,
        order=count,
    )
    db.add(point)
    db.commit()
    db.refresh(point)
    return _serialize(point)


# ── GET /custom-points/user/{user_id} ──────────────────────────────────────────
@router.get("/user/{user_id}")
def get_user_custom_points(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    points = (
        db.query(models.CustomPoint)
        .filter(models.CustomPoint.user_id == user_id)
        .order_by(models.CustomPoint.order)
        .all()
    )
    return [_serialize(p) for p in points]


# ── GET /custom-points/public ──────────────────────────────────────────────────
# Points publics d'AUTRES utilisateurs visibles dans une bbox de la carte (exclut
# les points de l'utilisateur courant, déjà couverts par /custom-points/user/{id}).
@router.get("/public")
def get_public_custom_points(
    south: float = Query(...),
    west:  float = Query(...),
    north: float = Query(...),
    east:  float = Query(...),
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    query = db.query(models.CustomPoint).filter(
        models.CustomPoint.is_public.is_(True),
        models.CustomPoint.latitude.between(south, north),
        models.CustomPoint.longitude.between(west, east),
    )
    if user:
        query = query.filter(models.CustomPoint.user_id != user.id)
    return [_serialize(p, include_owner=True) for p in query.all()]


# ── GET /custom-points/{id} ────────────────────────────────────────────────────
# Détail complet (photos + propriétaire) — accessible au propriétaire ou si public.
@router.get("/{point_id}")
def get_custom_point(
    point_id: int,
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    point = db.query(models.CustomPoint).filter(models.CustomPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point introuvable")
    is_owner = user is not None and point.user_id == user.id
    if not point.is_public and not is_owner:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return _serialize(point, include_images=True, include_owner=True)


# ── PATCH /custom-points/{id} ──────────────────────────────────────────────────
@router.patch("/{point_id}")
def update_custom_point(
    point_id: int,
    body: CustomPointUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    point = db.query(models.CustomPoint).filter(models.CustomPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point introuvable")

    if point.trip_id is not None:
        current_trip = load_trip_or_404(db, point.trip_id)
        require_trip_role(db, current_trip, current_user, "write")
    elif point.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")

    if body.is_public is not None:
        # Rendre public expose le point à toute l'application : réservé au créateur
        # réel, même si un collaborateur de trajet a par ailleurs le droit "write".
        if point.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Seul le créateur du point peut changer sa visibilité")
        point.is_public = body.is_public

    if body.name is not None:
        point.name = body.name
    if body.icon is not None:
        point.icon = body.icon
    if body.color is not None:
        point.color = body.color
    if body.unassign_trip:
        point.trip_id = None
        point.day = None
    elif body.trip_id is not None:
        trip = load_trip_or_404(db, body.trip_id)
        require_trip_role(db, trip, current_user, "write")
        point.trip_id = body.trip_id
    if body.order is not None:
        point.order = body.order
    if body.day is not None:
        point.day = body.day
    if body.is_visited is not None:
        point.is_visited = body.is_visited
    if body.is_hidden is not None:
        point.is_hidden = body.is_hidden

    db.commit()
    db.refresh(point)
    return _serialize(point)


# ── DELETE /custom-points/{id} ─────────────────────────────────────────────────
@router.delete("/{point_id}")
def delete_custom_point(
    point_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    point = db.query(models.CustomPoint).filter(models.CustomPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point introuvable")

    if point.trip_id is not None:
        trip = load_trip_or_404(db, point.trip_id)
        require_trip_role(db, trip, current_user, "write")
    elif point.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")

    db.delete(point)
    db.commit()
    return {"detail": "Point supprimé"}
