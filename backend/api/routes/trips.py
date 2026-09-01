"""
Trips routes — gestion des trajets utilisateur.

GET    /trips/user/{user_id}                      → lister les trajets avec monuments
POST   /trips                                     → créer un trajet
POST   /trips/{trip_id}/monuments                 → ajouter un monument au trajet
PATCH  /trips/{trip_id}/monuments/{monument_id}   → marquer un monument comme visité (ou non)
DELETE /trips/{trip_id}/monuments/{monument_id}   → retirer un monument du trajet
DELETE /trips/{trip_id}                           → supprimer un trajet

L'accès aux données passe par TripRepository/MonumentRepository (repositories/) :
les handlers ci-dessous se limitent à valider la requête, vérifier les permissions
(via trip_utils) et orchestrer/sérialiser — aucun db.query direct.
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import requests
from database import get_db
from deps import get_current_user
from trip_utils import get_trip_role, require_trip_role, load_trip_or_404, get_trip, accessible_trip_ids
from visit_utils import record_visit
from repositories.trip_repository import TripRepository
from repositories.monument_repository import MonumentRepository
import models

router = APIRouter(prefix="/trips", tags=["Trajets"])

ORS_API_KEY = os.getenv("ORS_API_KEY", "")
ORS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"


class TripCreate(BaseModel):
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

    repo = TripRepository(db)
    trip_ids = accessible_trip_ids(db, user_id)
    trips = repo.list_by_ids(trip_ids)

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

    repo = TripRepository(db)
    trip_ids = accessible_trip_ids(db, user_id)

    tms = repo.list_trip_monuments_for_trips(trip_ids)
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

    custom = repo.list_custom_points_for_trips_or_user(trip_ids, user_id)
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
def create_trip(
    body: TripCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = TripRepository(db).create(current_user.id, body.name, body.description)
    return {"id": trip.id, "name": trip.name, "status": trip.status, "created_at": trip.created_at}


# ── POST /trips/{trip_id}/monuments ───────────────────────────────────────────
@router.post("/{trip_id}/monuments", status_code=201)
def add_monument_to_trip(
    trip_id: int,
    body: TripMonumentAdd,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("write")),
):
    repo = TripRepository(db)

    monument = MonumentRepository(db).get_by_id(body.monument_id)
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    if repo.get_trip_monument(trip_id, body.monument_id):
        raise HTTPException(status_code=409, detail="Monument déjà dans ce trajet")

    repo.add_monument(trip_id, body.monument_id)
    return {"trip_id": trip_id, "monument_id": body.monument_id}


# ── PATCH /trips/{trip_id}/monuments/{monument_id} ────────────────────────────
@router.patch("/{trip_id}/monuments/{monument_id}", status_code=200)
def update_trip_monument(
    trip_id: int,
    monument_id: int,
    body: TripMonumentUpdate,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("write")),
    current_user: models.User = Depends(get_current_user),
):
    tm = TripRepository(db).get_trip_monument(trip_id, monument_id)
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
    trip: models.Trip = Depends(get_trip("write")),
    current_user: models.User = Depends(get_current_user),
):
    target_trip = load_trip_or_404(db, body.target_trip_id)
    require_trip_role(db, target_trip, current_user, "write")

    repo = TripRepository(db)
    tm = repo.get_trip_monument(trip_id, monument_id)
    if not tm:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans ce trajet")

    if trip_id == body.target_trip_id:
        return {"trip_id": trip_id, "monument_id": monument_id}

    if repo.get_trip_monument(body.target_trip_id, monument_id):
        raise HTTPException(status_code=409, detail="Monument déjà dans le trajet cible")

    repo.move_trip_monument(tm, body.target_trip_id)
    return {"trip_id": body.target_trip_id, "monument_id": monument_id}


# ── DELETE /trips/{trip_id}/monuments/{monument_id} ───────────────────────────
@router.delete("/{trip_id}/monuments/{monument_id}", status_code=200)
def remove_monument_from_trip(
    trip_id: int,
    monument_id: int,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("write")),
):
    repo = TripRepository(db)
    tm = repo.get_trip_monument(trip_id, monument_id)
    if not tm:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans ce trajet")
    repo.remove_trip_monument(tm)
    return {"detail": "Monument retiré du trajet"}


# ── DELETE /trips/{trip_id} ────────────────────────────────────────────────────
# Suppression du trajet entier : réservée au host (action irréversible pour tous les collaborateurs).
@router.delete("/{trip_id}", status_code=200)
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("host")),
):
    TripRepository(db).delete(trip)
    return {"detail": "Trajet supprimé"}


# ── PATCH /trips/{trip_id} ─────────────────────────────────────────────────────
@router.patch("/{trip_id}", status_code=200)
def update_trip_settings(
    trip_id: int,
    body: TripSettingsUpdate,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("write")),
):
    trip = TripRepository(db).update_settings(trip, body.use_days, body.day_count)
    return {"id": trip.id, "use_days": trip.use_days, "day_count": trip.day_count}


# ── PATCH /trips/{trip_id}/reorder ─────────────────────────────────────────────
@router.patch("/{trip_id}/reorder", status_code=200)
def reorder_trip_monuments(
    trip_id: int,
    body: TripReorder,
    db: Session = Depends(get_db),
    trip: models.Trip = Depends(get_trip("write")),
):
    repo = TripRepository(db)
    tms = repo.trip_monuments_map(trip_id)
    points = repo.custom_points_map(trip_id)
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
    trip: models.Trip = Depends(get_trip("read")),
):
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
            # radiuses=-1 : pas de limite de recherche autour d'un point (au lieu des 350m
            # par défaut d'ORS) — un point isolé (ex. un point custom sans sentier connu à
            # proximité) est relié au point routable le plus proche plutôt que de faire
            # échouer tout le trajet, comme le fait Google Maps pour un lieu hors-piste.
            json={"coordinates": coords, "radiuses": [-1] * len(coords)},
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
