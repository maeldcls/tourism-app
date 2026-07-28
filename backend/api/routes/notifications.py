"""
Notifications routes — agrège les événements nécessitant une action de l'utilisateur.

GET /notifications → { count, items: [{ type, id, ... , created_at }] }

Deux types remontés pour l'instant : demandes d'ami reçues et invitations à
collaborer sur un trajet, toutes deux en attente (status == "pending").
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
import models

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def get_notifications(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    incoming_friend_requests = (
        db.query(models.Friendship)
        .filter(models.Friendship.addressee_id == current_user.id, models.Friendship.status == "pending")
        .order_by(models.Friendship.created_at.desc())
        .all()
    )
    incoming_trip_invites = (
        db.query(models.TripCollaborator)
        .filter(models.TripCollaborator.user_id == current_user.id, models.TripCollaborator.status == "pending")
        .order_by(models.TripCollaborator.created_at.desc())
        .all()
    )

    items = [
        {
            "type": "friend_request",
            "id": f.id,
            "user": {"id": f.requester.id, "username": f.requester.username, "avatar_url": f.requester.avatar_url},
            "created_at": f.created_at,
        }
        for f in incoming_friend_requests
    ] + [
        {
            "type": "trip_invite",
            "id": c.id,
            "trip": {"id": c.trip_id, "name": c.trip.name},
            "role": c.role,
            "user": {"id": c.trip.user.id, "username": c.trip.user.username, "avatar_url": c.trip.user.avatar_url},
            "created_at": c.created_at,
        }
        for c in incoming_trip_invites
    ]

    return {"count": len(items), "items": items}
