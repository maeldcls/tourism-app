"""
Friends routes — recherche, demandes d'ami, liste d'amis.

GET    /friends                       → liste des amis (status=accepted)
GET    /friends/requests              → demandes en attente (reçues + envoyées)
GET    /friends/search?q=             → recherche par username
GET    /friends/by-code/{code}        → recherche par code ami
POST   /friends/request               → envoyer une demande { user_id }
POST   /friends/requests/{id}/accept  → accepter une demande reçue
POST   /friends/requests/{id}/decline → refuser une demande reçue
DELETE /friends/{user_id}             → supprimer un ami / annuler une demande envoyée
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from database import get_db
from deps import get_current_user
from services.friend_utils import find_friendship, relation_status
import models

router = APIRouter(prefix="/friends", tags=["Amis"])


class FriendRequestBody(BaseModel):
    user_id: int


def _user_brief(u: models.User) -> dict:
    return {"id": u.id, "username": u.username, "avatar_url": u.avatar_url}


# ── GET /friends ────────────────────────────────────────────────────────────────
@router.get("")
def list_friends(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    friendships = db.query(models.Friendship).filter(
        models.Friendship.status == "accepted",
        or_(
            models.Friendship.requester_id == current_user.id,
            models.Friendship.addressee_id == current_user.id,
        ),
    ).all()

    friends = []
    for f in friendships:
        other = f.addressee if f.requester_id == current_user.id else f.requester
        friends.append(_user_brief(other))
    return friends


# ── GET /friends/requests ───────────────────────────────────────────────────────
@router.get("/requests")
def list_friend_requests(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    incoming = db.query(models.Friendship).filter(
        models.Friendship.addressee_id == current_user.id,
        models.Friendship.status == "pending",
    ).all()
    outgoing = db.query(models.Friendship).filter(
        models.Friendship.requester_id == current_user.id,
        models.Friendship.status == "pending",
    ).all()

    return {
        "incoming": [
            {"id": f.id, "user": _user_brief(f.requester), "created_at": f.created_at}
            for f in incoming
        ],
        "outgoing": [
            {"id": f.id, "user": _user_brief(f.addressee), "created_at": f.created_at}
            for f in outgoing
        ],
    }


# ── GET /friends/search ──────────────────────────────────────────────────────────
@router.get("/search")
def search_users(
    q: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = q.strip()
    if len(q) < 2:
        return []

    users = (
        db.query(models.User)
        .filter(models.User.username.ilike(f"%{q}%"), models.User.id != current_user.id)
        .order_by(models.User.username)
        .limit(20)
        .all()
    )

    results = []
    for u in users:
        friendship = find_friendship(db, current_user.id, u.id)
        results.append({**_user_brief(u), "relation": relation_status(friendship, current_user.id)})
    return results


# ── GET /friends/by-code/{code} ──────────────────────────────────────────────────
@router.get("/by-code/{code}")
def find_by_code(
    code: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    u = db.query(models.User).filter(models.User.friend_code == code.strip().upper()).first()
    if not u:
        raise HTTPException(status_code=404, detail="Aucun utilisateur avec ce code")
    if u.id == current_user.id:
        raise HTTPException(status_code=400, detail="C'est votre propre code")

    friendship = find_friendship(db, current_user.id, u.id)
    return {**_user_brief(u), "relation": relation_status(friendship, current_user.id)}


# ── POST /friends/request ────────────────────────────────────────────────────────
@router.post("/request", status_code=201)
def send_friend_request(
    body: FriendRequestBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de s'ajouter soi-même")

    target = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    existing = find_friendship(db, current_user.id, target.id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=409, detail="Déjà amis")
        if existing.status == "pending":
            if existing.requester_id == current_user.id:
                raise HTTPException(status_code=409, detail="Demande déjà envoyée")
            # L'autre m'avait déjà envoyé une demande : on l'accepte directement.
            existing.status = "accepted"
            existing.responded_at = datetime.utcnow()
            db.commit()
            return {"detail": "Demande acceptée (déjà envoyée par cet utilisateur)", "status": "accepted"}
        # declined précédemment : on relance une nouvelle demande
        existing.requester_id = current_user.id
        existing.addressee_id = target.id
        existing.status = "pending"
        existing.created_at = datetime.utcnow()
        existing.responded_at = None
        db.commit()
        return {"detail": "Demande envoyée", "status": "pending"}

    friendship = models.Friendship(requester_id=current_user.id, addressee_id=target.id)
    db.add(friendship)
    db.commit()
    return {"detail": "Demande envoyée", "status": "pending"}


# ── POST /friends/requests/{id}/accept ───────────────────────────────────────────
@router.post("/requests/{friendship_id}/accept")
def accept_friend_request(
    friendship_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    f = db.query(models.Friendship).filter(models.Friendship.id == friendship_id).first()
    if not f or f.addressee_id != current_user.id:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if f.status != "pending":
        raise HTTPException(status_code=409, detail="Demande déjà traitée")

    f.status = "accepted"
    f.responded_at = datetime.utcnow()
    db.commit()
    return {"detail": "Demande acceptée"}


# ── POST /friends/requests/{id}/decline ──────────────────────────────────────────
@router.post("/requests/{friendship_id}/decline")
def decline_friend_request(
    friendship_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    f = db.query(models.Friendship).filter(models.Friendship.id == friendship_id).first()
    if not f or f.addressee_id != current_user.id:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if f.status != "pending":
        raise HTTPException(status_code=409, detail="Demande déjà traitée")

    f.status = "declined"
    f.responded_at = datetime.utcnow()
    db.commit()
    return {"detail": "Demande refusée"}


# ── DELETE /friends/{user_id} ────────────────────────────────────────────────────
# Supprime un ami accepté, ou annule une demande (envoyée ou reçue) en attente.
@router.delete("/{user_id}")
def remove_friend(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    f = find_friendship(db, current_user.id, user_id)
    if not f:
        raise HTTPException(status_code=404, detail="Aucune relation avec cet utilisateur")
    db.delete(f)
    db.commit()
    return {"detail": "Relation supprimée"}
