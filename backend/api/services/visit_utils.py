"""Logique de visite partagée entre routes/visits.py et routes/trips.py."""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models

XP_PAR_VISITE = 50
XP_PAR_NIVEAU = 500  # source unique : réutilisé par routes/stats.py pour la progression affichée


def record_visit(
    db: Session,
    user: models.User,
    monument_id: int,
    gpt_lat: Optional[float] = None,
    gps_lon: Optional[float] = None,
) -> tuple[models.Visit, bool]:
    """Marque un monument comme visité pour un user (upsert, un seul Visit par
    couple user/monument). Retourne (visit, first_visit) ; attribue l'XP
    uniquement à la toute première visite."""
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    visit = db.query(models.Visit).filter(
        models.Visit.user_id == user.id,
        models.Visit.monument_id == monument_id,
    ).first()

    first_visit = visit is None
    if visit is None:
        visit = models.Visit(user_id=user.id, monument_id=monument_id)
        db.add(visit)

    visit.visited_at = datetime.utcnow()
    if gpt_lat is not None:
        visit.gpt_lat = gpt_lat
    if gps_lon is not None:
        visit.gps_lon = gps_lon

    if first_visit:
        user.xp = (user.xp or 0) + XP_PAR_VISITE
        user.level = max(1, user.xp // XP_PAR_NIVEAU + 1)
        db.add(models.XpHistory(user_id=user.id, action=f"Visite : {monument.name}", xp=XP_PAR_VISITE))

    try:
        db.flush()
    except IntegrityError:
        # Une requête concurrente a créé la même visite (user_id+monument_id) entre
        # la lecture ci-dessus et ce flush : on relit l'état réel plutôt que d'échouer,
        # le résultat pour l'appelant ("ce monument est visité") reste correct.
        db.rollback()
        visit = db.query(models.Visit).filter(
            models.Visit.user_id == user.id,
            models.Visit.monument_id == monument_id,
        ).first()
        first_visit = False

    return visit, first_visit
