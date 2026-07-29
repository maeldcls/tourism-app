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
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import requests
from database import get_db
from deps import get_current_user
from trip_utils import get_trip_role, require_trip_role, accessible_trip_ids
from visit_utils import record_visit
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
    is_visited: Optional[bool] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_hidden: Optional[bool] = None


class TripMonumentMove(BaseModel):
    target_trip_id: int


class TripSettingsUpdate(BaseModel):
    use_days: Optional[bool] = None
    day_count: Optional[int] = None


class ReorderItem(BaseModel):
    kind: str = "monument"  # "monument" | "custom"
    monument_id: Optional[int] = None
    custom_point_id: Optional[int] = None
    order: int
    day: Optional[int] = None


class TripReorder(BaseModel):
    items: list[ReorderItem]


# ── GET /trips/user/{user_id} ──────────────────────────────────────────────────
# Renvoie les trajets possédés par l'utilisateur ET ceux partagés avec lui
# (collaboration acceptée), avec son rôle sur chacun.
@router.get("/user/{user_id}")
def get_user_trips(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")

    trip_ids = accessible_trip_ids(db, user_id)
    trips = (
        db.query(models.Trip)
        .filter(models.Trip.id.in_(trip_ids))
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
            "use_days": t.use_days,
            "day_count": t.day_count,
            "role": get_trip_role(db, t, current_user),
            "host": {"id": t.user.id, "username": t.user.username} if t.user_id != user_id else None,
            "members": [
                {
                    "collaborator_id": None,
                    "id": t.user.id,
                    "username": t.user.username,
                    "avatar_url": t.user.avatar_url,
                    "role": "host",
                },
                *[
                    {
                        "collaborator_id": c.id,
                        "id": c.user.id,
                        "username": c.user.username,
                        "avatar_url": c.user.avatar_url,
                        "role": c.role,
                    }
                    for c in t.collaborators
                    if c.status == "accepted"
                ],
            ],
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
                    "day": tm.day,
                    "icon": tm.icon,
                    "color": tm.color,
                    "is_hidden": tm.is_hidden,
                }
                for tm in sorted(t.trip_monuments, key=lambda x: x.order)
            ],
            "custom_points": [
                {
                    "custom_point_id": p.id,
                    "name": p.name,
                    "latitude": p.latitude,
                    "longitude": p.longitude,
                    "is_visited": p.is_visited,
                    "order": p.order,
                    "day": p.day,
                    "icon": p.icon,
                    "color": p.color,
                    "is_hidden": p.is_hidden,
                }
                for p in sorted(t.custom_points, key=lambda x: x.order)
            ],
        }
        for t in trips
    ]


# ── GET /trips/user/{user_id}/points ───────────────────────────────────────────
# Vue combinée pour la carte : tous les points de l'utilisateur (monuments ajoutés
# à un trajet + points personnalisés), qu'ils soient rattachés à un trajet ou non.
@router.get("/user/{user_id}/points")
def get_user_points(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")

    trip_ids = accessible_trip_ids(db, user_id)
    tms = (
        db.query(models.TripMonument)
        .filter(models.TripMonument.trip_id.in_(trip_ids))
        .all()
    )
    monument_points = [
        {
            "kind": "monument",
            "trip_id": tm.trip_id,
            "trip_name": tm.trip.name if tm.trip else None,
            "monument_id": tm.monument_id,
            "name": tm.monument.name if tm.monument else None,
            "category": tm.monument.category if tm.monument else None,
            "latitude": tm.monument.latitude if tm.monument else None,
            "longitude": tm.monument.longitude if tm.monument else None,
            "icon": tm.icon,
            "color": tm.color,
            "is_visited": tm.is_visited,
            "is_hidden": tm.is_hidden,
            "day": tm.day,
            "order": tm.order,
        }
        for tm in tms
        if tm.monument and tm.monument.latitude is not None and tm.monument.longitude is not None
    ]

    custom = (
        db.query(models.CustomPoint)
        .filter(
            or_(
                models.CustomPoint.trip_id.in_(trip_ids),
                and_(models.CustomPoint.user_id == user_id, models.CustomPoint.trip_id.is_(None)),
            )
        )
        .all()
    )
    custom_points = [
        {
            "kind": "custom",
            "trip_id": p.trip_id,
            "trip_name": p.trip.name if p.trip else None,
            "custom_point_id": p.id,
            "name": p.name,
            "category": None,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "icon": p.icon,
            "color": p.color,
            "is_visited": p.is_visited,
            "is_hidden": p.is_hidden,
            "day": p.day,
            "order": p.order,
        }
        for p in custom
    ]

    return monument_points + custom_points


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
def add_monument_to_trip(
    trip_id: int,
    body: TripMonumentAdd,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    require_trip_role(db, trip, current_user, "write")

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
def update_trip_monument(
    trip_id: int,
    monument_id: int,
    body: TripMonumentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    require_trip_role(db, trip, current_user, "write")

    tm = db.query(models.TripMonument).filter(
        models.TripMonument.trip_id == trip_id,
        models.TripMonument.monument_id == monument_id,
    ).first()
    if not tm:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans ce trajet")

    if body.is_visited is not None:
        tm.is_visited = body.is_visited
        if body.is_visited:
            # Un monument validé comme visité dans un trajet doit aussi apparaître
            # comme visité sur sa fiche et dans la liste globale des lieux visités.
            record_visit(db, current_user, monument_id)
    if body.icon is not None:
        tm.icon = body.icon
    if body.color is not None:
        tm.color = body.color
    if body.is_hidden is not None:
        tm.is_hidden = body.is_hidden

    db.commit()
    return {
        "trip_id": trip_id, "monument_id": monument_id,
        "is_visited": tm.is_visited, "icon": tm.icon, "color": tm.color, "is_hidden": tm.is_hidden,
    }


# ── PATCH /trips/{trip_id}/monuments/{monument_id}/move ───────────────────────
# Réassigne un monument d'un trajet vers un autre (conserve icône/couleur/statut
# visité, réinitialise l'ordre en fin de liste du trajet cible et le jour car la
# numérotation des jours est propre à chaque trajet).
@router.patch("/{trip_id}/monuments/{monument_id}/move", status_code=200)
def move_monument_to_trip(
    trip_id: int,
    monument_id: int,
    body: TripMonumentMove,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    require_trip_role(db, trip, current_user, "write")

    target_trip = db.query(models.Trip).filter(models.Trip.id == body.target_trip_id).first()
    if not target_trip:
        raise HTTPException(status_code=404, detail="Trajet cible introuvable")
    require_trip_role(db, target_trip, current_user, "write")

    tm = db.query(models.TripMonument).filter(
        models.TripMonument.trip_id == trip_id,
        models.TripMonument.monument_id == monument_id,
    ).first()
    if not tm:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans ce trajet")

    if trip_id == body.target_trip_id:
        return {"trip_id": trip_id, "monument_id": monument_id}

    existing = db.query(models.TripMonument).filter(
        models.TripMonument.trip_id == body.target_trip_id,
        models.TripMonument.monument_id == monument_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Monument déjà dans le trajet cible")

    count = db.query(models.TripMonument).filter(models.TripMonument.trip_id == body.target_trip_id).count()
    new_tm = models.TripMonument(
        trip_id=body.target_trip_id,
        monument_id=monument_id,
        order=count,
        day=None,
        is_visited=tm.is_visited,
        icon=tm.icon,
        color=tm.color,
        is_hidden=tm.is_hidden,
    )
    db.delete(tm)
    db.add(new_tm)
    db.commit()
    return {"trip_id": body.target_trip_id, "monument_id": monument_id}


# ── DELETE /trips/{trip_id}/monuments/{monument_id} ───────────────────────────
@router.delete("/{trip_id}/monuments/{monument_id}", status_code=200)
def remove_monument_from_trip(
    trip_id: int,
    monument_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    require_trip_role(db, trip, current_user, "write")

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
# Suppression du trajet entier : réservée au host (action irréversible pour tous les collaborateurs).
@router.delete("/{trip_id}", status_code=200)
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    if trip.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul le host peut supprimer le trajet")
    db.delete(trip)
    db.commit()
    return {"detail": "Trajet supprimé"}


# ── PATCH /trips/{trip_id} ─────────────────────────────────────────────────────
@router.patch("/{trip_id}", status_code=200)
def update_trip_settings(
    trip_id: int,
    body: TripSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    require_trip_role(db, trip, current_user, "write")

    if body.use_days is not None:
        trip.use_days = body.use_days
    if body.day_count is not None:
        trip.day_count = body.day_count
    db.commit()
    return {"id": trip.id, "use_days": trip.use_days, "day_count": trip.day_count}


# ── PATCH /trips/{trip_id}/reorder ─────────────────────────────────────────────
@router.patch("/{trip_id}/reorder", status_code=200)
def reorder_trip_monuments(
    trip_id: int,
    body: TripReorder,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    require_trip_role(db, trip, current_user, "write")

    tms = {
        tm.monument_id: tm
        for tm in db.query(models.TripMonument).filter(models.TripMonument.trip_id == trip_id).all()
    }
    points = {
        p.id: p
        for p in db.query(models.CustomPoint).filter(models.CustomPoint.trip_id == trip_id).all()
    }
    for item in body.items:
        if item.kind == "custom":
            point = points.get(item.custom_point_id)
            if not point:
                continue
            point.order = item.order
            point.day = item.day
        else:
            tm = tms.get(item.monument_id)
            if not tm:
                continue
            tm.order = item.order
            tm.day = item.day
    db.commit()
    return {"detail": "Ordre mis à jour"}


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
    require_trip_role(db, trip, current_user, "read")

    # Les monuments et points personnalisés partagent un même espace d'`order`
    # (voir /reorder) : on les fusionne et on trie sur ce champ commun pour que
    # le tracé et la numérotation suivent l'ordre réel de la timeline.
    stops = sorted(
        [
            *[
                {"order": tm.order, "longitude": tm.monument.longitude, "latitude": tm.monument.latitude}
                for tm in trip.trip_monuments
                if tm.monument and tm.monument.latitude is not None and tm.monument.longitude is not None
            ],
            *[
                {"order": p.order, "longitude": p.longitude, "latitude": p.latitude}
                for p in trip.custom_points
                if p.latitude is not None and p.longitude is not None
            ],
        ],
        key=lambda s: s["order"],
    )
    coords = [[s["longitude"], s["latitude"]] for s in stops]

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
