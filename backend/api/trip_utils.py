"""Helpers partagés pour déterminer le rôle d'un utilisateur sur un trajet
(host = propriétaire, write/read = collaborateur accepté)."""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

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
