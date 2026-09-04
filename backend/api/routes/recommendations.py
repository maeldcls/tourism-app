"""
Recommendations routes — recommandations personnalisées NLP.

GET /recommendations?user_id=X&lat=Y&lon=Z&offset=0&limit=10

Les 3 modes (recommended/popular/rated) sont des implémentations de
RecommendationStrategy (voir recommendation_strategies.py — Strategy pattern) :
la route se contente de valider la requête et de déléguer à la stratégie
sélectionnée, sans connaître le détail de chaque algorithme.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from recommendation_strategies import STRATEGIES

router = APIRouter(prefix="/recommendations", tags=["Recommandations"])


@router.get("")
def get_recommendations(
    user_id: int = Query(...),
    mode: str = Query("recommended", pattern="^(recommended|popular|rated)$"),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    max_km: Optional[float] = Query(None, description="Rayon de recherche en km (optionnel)"),
    category: Optional[str] = Query(None, description="Filtrer par catégorie (monument, musee, parc...)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    strategy = STRATEGIES[mode]
    return strategy.get_recommendations(db, user, lat, lon, max_km, category, offset, limit)
