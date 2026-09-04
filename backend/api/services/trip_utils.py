"""Helpers partagés pour déterminer le rôle d'un utilisateur sur un trajet
(host = propriétaire, write/read = collaborateur accepté)."""
from typing import Callable, Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
import models

ROLE_RANK = {"read": 1, "write": 2, "host": 3}


def get_trip_role(db: Session, trip: models.Trip, user: models.User) -> Optional[str]:
    if trip.user_id == user.id:
        return "host"
    collab = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.trip_id == trip.id,
        models.TripCollaborator.user_id == user.id,
        models.TripCollaborator.status == "accepted",
    ).first()
    return collab.role if collab else None


def require_trip_role(db: Session, trip: models.Trip, user: models.User, min_role: str = "read") -> str:
    role = get_trip_role(db, trip, user)
    if role is None or ROLE_RANK[role] < ROLE_RANK[min_role]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return role


def load_trip_or_404(db: Session, trip_id: int) -> models.Trip:
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    return trip


def get_trip(min_role: str = "read") -> Callable[..., models.Trip]:
    """Factory de dépendance FastAPI : charge le trajet depuis {trip_id} dans l'URL et
    vérifie que l'utilisateur courant a au moins le rôle `min_role` dessus.

    Remplace le motif répété manuellement dans chaque route :
        trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
        if not trip: raise HTTPException(404, ...)
        require_trip_role(db, trip, current_user, min_role)

    Usage : trip: models.Trip = Depends(get_trip("write"))
    """

    def _dependency(
        trip_id: int,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user),
    ) -> models.Trip:
        trip = load_trip_or_404(db, trip_id)
        require_trip_role(db, trip, current_user, min_role)
        return trip

    return _dependency


def can_view_trip_publicly(db: Session, trip: models.Trip, viewer: Optional[models.User]) -> bool:
    """Un non-membre peut consulter l'itinéraire d'un trajet marqué public si, en plus,
    le profil de son propriétaire l'autorise : profil public → tout le monde, profil
    privé → amis uniquement (même règle que la consultation du profil lui-même)."""
    if not trip.is_public:
        return False
    if trip.user.is_public:
        return True
    if viewer is None:
        return False
    from services.friend_utils import find_friendship, relation_status
    return relation_status(find_friendship(db, viewer.id, trip.user_id), viewer.id) == "friends"


def accessible_trip_ids(db: Session, user_id: int) -> list:
    """Liste des ids de trajets possédés OU partagés (collaboration acceptée) avec l'utilisateur."""
    owned = [row[0] for row in db.query(models.Trip.id).filter(models.Trip.user_id == user_id).all()]
    shared = [
        row[0]
        for row in db.query(models.TripCollaborator.trip_id)
        .filter(models.TripCollaborator.user_id == user_id, models.TripCollaborator.status == "accepted")
        .all()
    ]
    return list(set(owned) | set(shared))
