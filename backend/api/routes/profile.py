"""
Profile routes — page Profile.

GET /profile/{user_id}   → infos user : username, email, XP, level, badges obtenus
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/profile", tags=["Profil"])


# ── GET /profile/{user_id} ─────────────────────────────────────────────────────
# Page : Profile — tout ce qui s'affiche sur la page profil
@router.get("/{user_id}")
def get_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    badges = [
        {
            "badge_id": ub.badge_id,
            "name": ub.badge.name if ub.badge else None,
            "description": ub.badge.description if ub.badge else None,
            "icon_url": ub.badge.icon_url if ub.badge else None,
            "earned_at": ub.earned_at,
        }
        for ub in user.user_badges
    ]

    total_visits = db.query(models.Visit).filter(models.Visit.user_id == user_id).count()

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "xp": user.xp,
        "level": user.level,
        "member_since": user.created_at,
        "total_visits": total_visits,
        "badges": badges,
    }
