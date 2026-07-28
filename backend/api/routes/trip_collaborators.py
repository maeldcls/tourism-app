"""
Trip collaborators routes — partage d'un trajet, avec rôle read/write.

GET    /trips/{trip_id}/collaborators                    → liste des membres (host inclus)
POST   /trips/{trip_id}/collaborators                    → inviter un utilisateur { user_id, role } (host uniquement)
PATCH  /trips/{trip_id}/collaborators/{collab_id}         → changer le rôle d'un membre (host uniquement)
DELETE /trips/{trip_id}/collaborators/{collab_id}         → retirer un membre (host, ou le membre lui-même)
POST   /trips/{trip_id}/collaborators/{collab_id}/accept  → accepter une invitation reçue
POST   /trips/{trip_id}/collaborators/{collab_id}/decline → refuser une invitation reçue
POST   /trips/{trip_id}/leave                             → quitter un trajet partagé (collaborateur uniquement)
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from deps import get_current_user
from trip_utils import require_trip_role
import models

router = APIRouter(prefix="/trips", tags=["Collaborateurs trajet"])

VALID_ROLES = {"read", "write"}


class CollaboratorAdd(BaseModel):
    user_id: int
    role: str = "read"


class CollaboratorRoleUpdate(BaseModel):
    role: str


def _user_brief(u: models.User) -> dict:
    return {"id": u.id, "username": u.username, "avatar_url": u.avatar_url}


def _get_trip_or_404(db: Session, trip_id: int) -> models.Trip:
    trip = db.query(models.Trip).filter(models.Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    return trip


# ── GET /trips/{trip_id}/collaborators ────────────────────────────────────────
@router.get("/{trip_id}/collaborators")
def list_collaborators(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = _get_trip_or_404(db, trip_id)
    require_trip_role(db, trip, current_user, "read")

    collaborators = db.query(models.TripCollaborator).filter(models.TripCollaborator.trip_id == trip_id).all()
    return {
        "host": _user_brief(trip.user),
        "collaborators": [
            {
                "id": c.id,
                "user": _user_brief(c.user),
                "role": c.role,
                "status": c.status,
                "invited_by": c.invited_by,
                "created_at": c.created_at,
            }
            for c in collaborators
        ],
    }


# ── POST /trips/{trip_id}/collaborators ───────────────────────────────────────
@router.post("/{trip_id}/collaborators", status_code=201)
def add_collaborator(
    trip_id: int,
    body: CollaboratorAdd,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide (read ou write)")

    trip = _get_trip_or_404(db, trip_id)
    if trip.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul le host peut inviter des membres")

    if body.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de s'inviter soi-même")

    target = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    existing = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.trip_id == trip_id,
        models.TripCollaborator.user_id == target.id,
    ).first()
    if existing:
        if existing.status in ("pending", "accepted"):
            raise HTTPException(status_code=409, detail="Cet utilisateur est déjà invité sur ce trajet")
        existing.role = body.role
        existing.status = "pending"
        existing.invited_by = current_user.id
        existing.created_at = datetime.utcnow()
        db.commit()
        return {"detail": "Invitation envoyée"}

    collab = models.TripCollaborator(
        trip_id=trip_id, user_id=target.id, role=body.role, invited_by=current_user.id
    )
    db.add(collab)
    db.commit()
    return {"detail": "Invitation envoyée"}


# ── PATCH /trips/{trip_id}/collaborators/{collab_id} ──────────────────────────
@router.patch("/{trip_id}/collaborators/{collab_id}")
def update_collaborator_role(
    trip_id: int,
    collab_id: int,
    body: CollaboratorRoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide (read ou write)")

    trip = _get_trip_or_404(db, trip_id)
    if trip.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Seul le host peut modifier les rôles")

    collab = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.id == collab_id, models.TripCollaborator.trip_id == trip_id
    ).first()
    if not collab:
        raise HTTPException(status_code=404, detail="Membre introuvable")

    collab.role = body.role
    db.commit()
    return {"id": collab.id, "role": collab.role}


# ── DELETE /trips/{trip_id}/collaborators/{collab_id} ─────────────────────────
@router.delete("/{trip_id}/collaborators/{collab_id}")
def remove_collaborator(
    trip_id: int,
    collab_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = _get_trip_or_404(db, trip_id)
    collab = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.id == collab_id, models.TripCollaborator.trip_id == trip_id
    ).first()
    if not collab:
        raise HTTPException(status_code=404, detail="Membre introuvable")

    is_host = trip.user_id == current_user.id
    is_self = collab.user_id == current_user.id
    if not is_host and not is_self:
        raise HTTPException(status_code=403, detail="Accès refusé")

    db.query(models.TripLocationShare).filter(
        models.TripLocationShare.trip_id == trip_id,
        models.TripLocationShare.user_id == collab.user_id,
    ).delete()
    db.delete(collab)
    db.commit()
    return {"detail": "Membre retiré"}


# ── POST /trips/{trip_id}/collaborators/{collab_id}/accept ────────────────────
@router.post("/{trip_id}/collaborators/{collab_id}/accept")
def accept_collaboration(
    trip_id: int,
    collab_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    collab = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.id == collab_id, models.TripCollaborator.trip_id == trip_id
    ).first()
    if not collab or collab.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invitation introuvable")
    if collab.status != "pending":
        raise HTTPException(status_code=409, detail="Invitation déjà traitée")

    collab.status = "accepted"
    db.commit()
    return {"detail": "Invitation acceptée"}


# ── POST /trips/{trip_id}/collaborators/{collab_id}/decline ───────────────────
@router.post("/{trip_id}/collaborators/{collab_id}/decline")
def decline_collaboration(
    trip_id: int,
    collab_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    collab = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.id == collab_id, models.TripCollaborator.trip_id == trip_id
    ).first()
    if not collab or collab.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invitation introuvable")
    if collab.status != "pending":
        raise HTTPException(status_code=409, detail="Invitation déjà traitée")

    db.delete(collab)
    db.commit()
    return {"detail": "Invitation refusée"}


# ── POST /trips/{trip_id}/leave ────────────────────────────────────────────────
# Un collaborateur quitte un trajet partagé (le host ne peut pas "quitter" son propre trajet).
@router.post("/{trip_id}/leave")
def leave_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trip = _get_trip_or_404(db, trip_id)
    if trip.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Le host ne peut pas quitter son propre trajet")

    collab = db.query(models.TripCollaborator).filter(
        models.TripCollaborator.trip_id == trip_id,
        models.TripCollaborator.user_id == current_user.id,
    ).first()
    if not collab:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas membre de ce trajet")

    db.query(models.TripLocationShare).filter(
        models.TripLocationShare.trip_id == trip_id,
        models.TripLocationShare.user_id == current_user.id,
    ).delete()
    db.delete(collab)
    db.commit()
    return {"detail": "Vous avez quitté le trajet"}
