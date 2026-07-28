"""
Visits routes — suivi des monuments visités par un utilisateur (page Monument
et section "Lieux visités" du profil), indépendamment des trajets.

POST   /visits                        → marquer un monument comme visité (upsert, XP à la 1ère fois)
DELETE /visits/monument/{monument_id} → retirer un monument des lieux visités
GET    /visits/status/{monument_id}   → l'utilisateur courant a-t-il déjà visité ce monument ?
GET    /visits/user/{user_id}         → historique paginé (plus récent en premier)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from deps import get_current_user
from visit_utils import record_visit
import models

router = APIRouter(prefix="/visits", tags=["Visites"])


class VisitBody(BaseModel):
    monument_id: int
    gpt_lat: Optional[float] = None
    gps_lon: Optional[float] = None


# ── POST /visits ───────────────────────────────────────────────────────────────
# Page Monument : bouton "J'ai visité ce lieu" (marquage manuel, hors trajet)
@router.post("", status_code=201)
def log_visit(
    body: VisitBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    visit, first_visit = record_visit(db, current_user, body.monument_id, body.gpt_lat, body.gps_lon)
    db.commit()

    return {
        "visit_id": visit.id,
        "monument_id": body.monument_id,
        "first_visit": first_visit,
        "xp_gained": 50 if first_visit else 0,
        "user_xp_total": current_user.xp,
        "user_level": current_user.level,
    }


# ── DELETE /visits/monument/{monument_id} ──────────────────────────────────────
# Page Monument : bouton "J'ai visité ce lieu" pressé une seconde fois (annulation)
@router.delete("/monument/{monument_id}", status_code=200)
def unlog_visit(
    monument_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    visit = db.query(models.Visit).filter(
        models.Visit.user_id == current_user.id,
        models.Visit.monument_id == monument_id,
    ).first()
    if visit:
        db.delete(visit)
        db.commit()

    return {"monument_id": monument_id, "visited": False}


# ── GET /visits/status/{monument_id} ───────────────────────────────────────────
# Page Monument : état initial du bouton "J'ai visité ce lieu" au chargement
@router.get("/status/{monument_id}")
def get_visit_status(
    monument_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    visit = db.query(models.Visit).filter(
        models.Visit.user_id == current_user.id,
        models.Visit.monument_id == monument_id,
    ).first()
    return {"visited": visit is not None, "visited_at": visit.visited_at if visit else None}


# ── GET /visits/user/{user_id} ─────────────────────────────────────────────────
# Profil : section "Lieux visités" (limit réduit) + page dédiée (infinite scroll)
@router.get("/user/{user_id}")
def get_user_visits(
    user_id: int,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")

    limit = max(1, min(limit, 50))

    query = (
        db.query(models.Visit)
        .filter(models.Visit.user_id == user_id)
        .order_by(models.Visit.visited_at.desc())
    )
    total = query.count()
    visits = query.offset(offset).limit(limit).all()

    # Vote "recommandé / pas recommandé" de l'utilisateur sur ces monuments (pour
    # le badge check/croix affiché sur la carte) — un seul aller-retour DB, pas
    # un appel par monument. setdefault + tri desc par updated_at → on garde le
    # vote le plus récent en cas de lignes multiples (comptes admin).
    monument_ids = [v.monument_id for v in visits]
    user_ratings: dict[int, bool] = {}
    if monument_ids:
        rating_rows = (
            db.query(models.Rating)
            .filter(models.Rating.user_id == user_id, models.Rating.monument_id.in_(monument_ids))
            .order_by(models.Rating.updated_at.desc())
            .all()
        )
        for r in rating_rows:
            user_ratings.setdefault(r.monument_id, r.is_positive)

    return {
        "total": total,
        "has_more": offset + len(visits) < total,
        "items": [
            {
                "visit_id": v.id,
                "monument_id": v.monument_id,
                "monument_name": v.monument.name if v.monument else None,
                "city": v.monument.city if v.monument else None,
                "latitude": v.monument.latitude if v.monument else None,
                "longitude": v.monument.longitude if v.monument else None,
                "category": v.monument.category if v.monument else None,
                "visited_at": v.visited_at,
                "user_rating": user_ratings.get(v.monument_id),
            }
            for v in visits
        ],
    }
