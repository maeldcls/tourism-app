"""
Stats routes — page Stats.

GET /stats/{user_id}   → statistiques complètes :
                          - historique XP
                          - nombre de visites par ville
                          - progression niveau
                          - badges gagnés dans le temps
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from collections import Counter
from database import get_db
import models

router = APIRouter(prefix="/stats", tags=["Statistiques"])

XP_PAR_NIVEAU = 500


# ── GET /stats/{user_id} ───────────────────────────────────────────────────────
# Page : Stats — tout ce qui s'affiche sur la page statistiques
@router.get("/{user_id}")
def get_stats(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    # Historique XP
    xp_history = (
        db.query(models.XpHistory)
        .filter(models.XpHistory.user_id == user_id)
        .order_by(models.XpHistory.created_at.asc())
        .all()
    )
    xp_history_list = [
        {"action": e.action, "xp": e.xp, "date": e.created_at}
        for e in xp_history
    ]

    # Visites
    visits = db.query(models.Visit).filter(models.Visit.user_id == user_id).all()
    total_visits = len(visits)

    # Visites par ville
    cities = [v.monument.city for v in visits if v.monument and v.monument.city]
    visits_by_city = [
        {"city": city, "count": count}
        for city, count in Counter(cities).most_common()
    ]

    # Progression vers le niveau suivant
    xp_current_level = (user.level - 1) * XP_PAR_NIVEAU
    xp_next_level = user.level * XP_PAR_NIVEAU
    xp_in_level = (user.xp or 0) - xp_current_level
    xp_needed = xp_next_level - xp_current_level
    progress_pct = round((xp_in_level / xp_needed) * 100, 1) if xp_needed > 0 else 100

    # Badges
    badges = [
        {
            "name": ub.badge.name if ub.badge else None,
            "earned_at": ub.earned_at,
        }
        for ub in user.user_badges
    ]

    return {
        "user_id": user.id,
        "username": user.username,
        "xp": user.xp,
        "level": user.level,
        "level_progress_pct": progress_pct,
        "xp_to_next_level": max(0, xp_next_level - (user.xp or 0)),
        "total_visits": total_visits,
        "visits_by_city": visits_by_city,
        "badges_count": len(badges),
        "badges": badges,
        "xp_history": xp_history_list,
    }
