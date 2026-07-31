"""
Ratings routes — notation communautaire des monuments (recommandé / pas recommandé), style Steam.

GET  /monuments/{monument_id}/rating   → note globale + note récente (30j) + vote de l'utilisateur courant
POST /monuments/{monument_id}/rating   → voter (auth). Upsert pour un utilisateur normal,
                                          insertion libre à chaque appel pour un compte admin.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from deps import get_current_user, get_current_user_optional
import models

router = APIRouter(tags=["Notation"])

RECENT_WINDOW_DAYS = 30
MIN_VOTES_FOR_SCORE = 10


class RatingCreate(BaseModel):
    is_positive: bool


def _score(total: int, positive: int) -> dict:
    if total < MIN_VOTES_FOR_SCORE:
        return {"percent": None, "label": "Pas assez d'avis", "total": total}

    percent = round(positive / total * 100)

    if percent >= 95:
        label = "Incontournable"
    elif percent >= 80:
        label = "Vivement recommandé"
    elif percent >= 70:
        label = "Recommandé"
    elif percent >= 40:
        label = "Avis partagés"
    elif percent >= 20:
        label = "Peu recommandé"
    else:
        label = "Déconseillé"

    return {"percent": percent, "label": label, "total": total}


# ── GET /monuments/{monument_id}/rating ──────────────────────────────────────────
@router.get("/monuments/{monument_id}/rating")
def get_rating(
    monument_id: int,
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    ratings = db.query(models.Rating).filter(models.Rating.monument_id == monument_id).all()

    recent_cutoff = datetime.utcnow() - timedelta(days=RECENT_WINDOW_DAYS)
    recent_ratings = [r for r in ratings if r.updated_at and r.updated_at >= recent_cutoff]

    user_vote = None
    if user:
        own = (
            db.query(models.Rating)
            .filter(models.Rating.monument_id == monument_id, models.Rating.user_id == user.id)
            .order_by(models.Rating.updated_at.desc())
            .first()
        )
        if own:
            user_vote = own.is_positive

    return {
        "global": _score(len(ratings), sum(1 for r in ratings if r.is_positive)),
        "recent": _score(len(recent_ratings), sum(1 for r in recent_ratings if r.is_positive)),
        "user_vote": user_vote,
    }


# ── POST /monuments/{monument_id}/rating ─────────────────────────────────────────
@router.post("/monuments/{monument_id}/rating", status_code=201)
def cast_rating(
    monument_id: int,
    body: RatingCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    if user.is_admin:
        rating = models.Rating(monument_id=monument_id, user_id=user.id, is_positive=body.is_positive)
        db.add(rating)
    else:
        rating = (
            db.query(models.Rating)
            .filter(models.Rating.monument_id == monument_id, models.Rating.user_id == user.id)
            .first()
        )
        if rating:
            rating.is_positive = body.is_positive
        else:
            rating = models.Rating(monument_id=monument_id, user_id=user.id, is_positive=body.is_positive)
            db.add(rating)

    db.commit()
    return {"is_positive": body.is_positive}
