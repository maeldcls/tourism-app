"""
Recommendations routes — recommandations personnalisées NLP.

GET /recommendations?user_id=X&lat=Y&lon=Z&offset=0&limit=10
"""
import json
import math
import os
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter(prefix="/recommendations", tags=["Recommandations"])

AI_URL = os.getenv("AI_SERVICE_URL", "http://ai:8001")
TASTE_CACHE_VERSION = 1  # incrémenter pour invalider tous les caches user


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _get_user_history(user_id: int, db: Session) -> list[models.Monument]:
    """Retourne les monuments visités + ajoutés à un trajet (dédupliqués)."""
    visited_ids = {v.monument_id for v in db.query(models.Visit).filter(models.Visit.user_id == user_id).all()}
    trip_ids = set()
    for trip in db.query(models.Trip).filter(models.Trip.user_id == user_id).all():
        for tm in trip.trip_monuments:
            trip_ids.add(tm.monument_id)

    all_ids = visited_ids | trip_ids
    if not all_ids:
        return []

    return db.query(models.Monument).filter(models.Monument.id.in_(all_ids)).all()


def _build_taste_profile(user: models.User, history: list[models.Monument], db: Session) -> dict | None:
    """Calcule ou lit depuis le cache le profil de goûts utilisateur."""
    if user.taste_profile:
        try:
            cached = json.loads(user.taste_profile)
            if cached.get("v") == TASTE_CACHE_VERSION and cached.get("monument_count") == len(history):
                return cached
        except (json.JSONDecodeError, KeyError):
            pass

    if not history:
        return None

    payload = []
    for m in history:
        themes = [{"theme": t.theme, "confidence": t.confidence} for t in m.themes]
        payload.append({
            "monument_id": m.id,
            "name": m.name or "",
            "description": m.description or "",
            "category": m.category or "",
            "themes": themes,
        })

    try:
        resp = requests.post(f"{AI_URL}/user-taste", json=payload, timeout=15)
        resp.raise_for_status()
        result = resp.json()
    except Exception:
        return None

    profile = {
        "v": TASTE_CACHE_VERSION,
        "monument_count": len(history),
        "themes": result["themes"],
        "embedding": result["embedding"],
    }
    user.taste_profile = json.dumps(profile)
    db.commit()
    return profile


def _score_monument(monument: models.Monument, profile: dict, user_theme_map: dict[str, float]) -> float:
    """Score hybride : 60% thèmes, 40% embedding."""
    # Score thématique
    tag_score = 0.0
    for mt in monument.themes:
        if mt.theme in user_theme_map:
            tag_score += mt.confidence * user_theme_map[mt.theme]

    # Score embedding (uniquement si disponible des deux côtés)
    embed_score = 0.0
    if monument.embedding and profile.get("embedding"):
        try:
            m_emb = json.loads(monument.embedding)
            embed_score = max(0.0, _cosine(profile["embedding"], m_emb))
        except (json.JSONDecodeError, ValueError):
            pass

    return 0.6 * tag_score + 0.4 * embed_score


@router.get("")
def get_recommendations(
    user_id: int = Query(...),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    max_km: Optional[float] = Query(None, description="Rayon de recherche en km (optionnel)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    history = _get_user_history(user_id, db)
    known_ids = {m.id for m in history}

    profile = _build_taste_profile(user, history, db)

    # Sans historique : renvoie des monuments populaires triés par proximité
    if not profile:
        query = db.query(models.Monument)
        candidates = query.all()
        if lat is not None and lon is not None:
            candidates = [
                m for m in candidates
                if m.latitude is not None and m.longitude is not None
            ]
            candidates.sort(key=lambda m: _haversine_km(lat, lon, m.latitude, m.longitude))
        results = candidates[offset: offset + limit]
        return _format_results(results, profile=None, user_theme_map={}, lat=lat, lon=lon)

    user_theme_map = {t["theme"]: t["confidence"] for t in profile["themes"]}

    # Candidats : tous sauf déjà connus
    all_monuments = (
        db.query(models.Monument)
        .filter(models.Monument.id.notin_(known_ids) if known_ids else True)
        .all()
    )

    # Filtre géographique optionnel
    if lat is not None and lon is not None and max_km is not None:
        all_monuments = [
            m for m in all_monuments
            if m.latitude is not None and m.longitude is not None
            and _haversine_km(lat, lon, m.latitude, m.longitude) <= max_km
        ]

    # Scoring
    scored = [(m, _score_monument(m, profile, user_theme_map)) for m in all_monuments]
    scored.sort(key=lambda x: x[1], reverse=True)

    page = scored[offset: offset + limit]
    monuments = [m for m, _ in page]
    scores = {m.id: s for m, s in page}

    return _format_results(monuments, profile, user_theme_map, lat, lon, scores)


def _format_results(
    monuments: list[models.Monument],
    profile: dict | None,
    user_theme_map: dict[str, float],
    lat: Optional[float],
    lon: Optional[float],
    scores: dict[int, float] | None = None,
) -> dict:
    items = []
    for m in monuments:
        sorted_themes = sorted(m.themes, key=lambda t: t.confidence, reverse=True)
        top_themes = [t.theme for t in sorted_themes[:3]]

        matched_themes = []
        if user_theme_map:
            matched_themes = [t.theme for t in sorted_themes if t.theme in user_theme_map][:2]

        distance_km = None
        if lat is not None and lon is not None and m.latitude and m.longitude:
            distance_km = round(_haversine_km(lat, lon, m.latitude, m.longitude), 1)

        images = [img.image_url for img in m.images[:1]]

        items.append({
            "id": m.id,
            "name": m.name,
            "city": m.city,
            "category": m.category,
            "latitude": m.latitude,
            "longitude": m.longitude,
            "image_url": images[0] if images else None,
            "themes": top_themes,
            "matched_themes": matched_themes,
            "score": round(scores[m.id], 4) if scores and m.id in scores else None,
            "distance_km": distance_km,
        })

    return {
        "items": items,
        "has_history": profile is not None,
        "top_user_themes": list(user_theme_map.keys())[:5] if user_theme_map else [],
    }
