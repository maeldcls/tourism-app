"""
Visits routes — page Travel.

POST /visits                    → page Travel : enregistrer une visite
GET  /visits/user/{user_id}     → page Travel : historique des visites d'un user
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models

router = APIRouter(prefix="/visits", tags=["Visites"])

XP_PAR_VISITE = 50


class VisitBody(BaseModel):
    user_id: int
    monument_id: int
    gpt_lat: Optional[float] = None
    gps_lon: Optional[float] = None


# ── POST /visits ───────────────────────────────────────────────────────────────
# Page : Travel — l'utilisateur enregistre qu'il a visité un monument
@router.post("", status_code=201)
def log_visit(body: VisitBody, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    monument = db.query(models.Monument).filter(models.Monument.id == body.monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    # Vérifier si ce monument a déjà été visité par ce user
    existing = db.query(models.Visit).filter(
        models.Visit.user_id == body.user_id,
        models.Visit.monument_id == body.monument_id,
    ).first()

    visit = models.Visit(
        user_id=body.user_id,
        monument_id=body.monument_id,
        gpt_lat=body.gpt_lat,
        gps_lon=body.gps_lon,
    )
    db.add(visit)

    xp_gained = 0
    if not existing:
        # Première visite : on attribue l'XP
        xp_gained = XP_PAR_VISITE
        user.xp = (user.xp or 0) + xp_gained
        user.level = max(1, user.xp // 500 + 1)

        xp_entry = models.XpHistory(
            user_id=body.user_id,
            action=f"Visite : {monument.name}",
            xp=xp_gained,
        )
        db.add(xp_entry)

    db.commit()
    db.refresh(visit)

    return {
        "visit_id": visit.id,
        "monument": monument.name,
        "first_visit": not existing,
        "xp_gained": xp_gained,
        "user_xp_total": user.xp,
        "user_level": user.level,
    }


# ── GET /visits/user/{user_id} ─────────────────────────────────────────────────
# Page : Travel — liste les visites d'un user avec le nom du monument
@router.get("/user/{user_id}")
def get_user_visits(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    visits = (
        db.query(models.Visit)
        .filter(models.Visit.user_id == user_id)
        .order_by(models.Visit.visited_at.desc())
        .all()
    )

    return [
        {
            "visit_id": v.id,
            "monument_id": v.monument_id,
            "monument_name": v.monument.name if v.monument else None,
            "city": v.monument.city if v.monument else None,
            "visited_at": v.visited_at,
        }
        for v in visits
    ]
