"""Strategy pattern pour les modes de recommandation.

Avant : routes/recommendations.py dispatchait sur `mode` avec un if/elif
(recommended/popular/rated), chacun avec sa propre fonction _get_xxx. Ajouter
un 4ᵉ mode obligeait à modifier get_recommendations() (violation Open/Closed).

Chaque mode devient une implémentation de RecommendationStrategy ; la route
sélectionne la stratégie via un dict (STRATEGIES, en bas de fichier) et se
contente de l'appeler. Ajouter un mode = ajouter une classe + une entrée dans
le dict, sans toucher au code existant.
"""
import json
import math
import os
from abc import ABC, abstractmethod
from typing import Optional

import requests
from sqlalchemy import case, func
from sqlalchemy.orm import Session

import models
from routes.ratings import MIN_VOTES_FOR_SCORE, _score as _rating_score

AI_URL = os.getenv("AI_SERVICE_URL", "http://ai:8001")
TASTE_CACHE_VERSION = 1  # incrémenter pour invalider tous les caches user


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _apply_geo_filter(monuments: list[models.Monument], lat, lon, max_km) -> list[models.Monument]:
    if lat is None or lon is None or max_km is None:
        return monuments
    return [
        m for m in monuments
        if m.latitude is not None and m.longitude is not None
        and _haversine_km(lat, lon, m.latitude, m.longitude) <= max_km
    ]


def format_results(
    monuments: list[models.Monument],
    profile: Optional[dict],
    user_theme_map: dict[str, float],
    lat: Optional[float],
    lon: Optional[float],
    scores: Optional[dict[int, float]] = None,
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


class RecommendationStrategy(ABC):
    """Une stratégie reçoit les paramètres de la requête et renvoie le payload
    attendu par le frontend : {"items": [...], "has_history": bool, "top_user_themes": [...]}."""

    @abstractmethod
    def get_recommendations(
        self,
        db: Session,
        user: models.User,
        lat: Optional[float],
        lon: Optional[float],
        max_km: Optional[float],
        offset: int,
        limit: int,
    ) -> dict:
        raise NotImplementedError


class PopularStrategy(RecommendationStrategy):
    """Trie par popularité (ajouts à un trajet + visites), tous utilisateurs confondus."""

    def _popularity_counts(self, db: Session) -> dict[int, int]:
        counts: dict[int, int] = {}
        for monument_id, cnt in (
            db.query(models.TripMonument.monument_id, func.count().label("cnt"))
            .group_by(models.TripMonument.monument_id)
            .all()
        ):
            counts[monument_id] = counts.get(monument_id, 0) + cnt
        for monument_id, cnt in (
            db.query(models.Visit.monument_id, func.count().label("cnt"))
            .group_by(models.Visit.monument_id)
            .all()
        ):
            counts[monument_id] = counts.get(monument_id, 0) + cnt
        return counts

    def get_recommendations(self, db, user, lat, lon, max_km, offset, limit) -> dict:
        counts = self._popularity_counts(db)

        monuments = db.query(models.Monument).all()
        monuments = _apply_geo_filter(monuments, lat, lon, max_km)
        monuments.sort(key=lambda m: counts.get(m.id, 0), reverse=True)
        page = monuments[offset: offset + limit]

        result = format_results(page, profile=None, user_theme_map={}, lat=lat, lon=lon)
        for item in result["items"]:
            item["popularity_count"] = counts.get(item["id"], 0)
        result["has_history"] = True
        return result


class RatedStrategy(RecommendationStrategy):
    """Trie par taux d'avis positifs, parmi les monuments ayant assez de votes."""

    def _rating_stats(self, db: Session) -> dict[int, tuple[int, int]]:
        rows = (
            db.query(
                models.Rating.monument_id,
                func.count().label("total"),
                func.sum(case((models.Rating.is_positive, 1), else_=0)).label("positive"),
            )
            .group_by(models.Rating.monument_id)
            .all()
        )
        return {monument_id: (total, positive or 0) for monument_id, total, positive in rows}

    def get_recommendations(self, db, user, lat, lon, max_km, offset, limit) -> dict:
        stats = self._rating_stats(db)
        eligible_ids = [mid for mid, (total, _) in stats.items() if total >= MIN_VOTES_FOR_SCORE]
        if not eligible_ids:
            return {"items": [], "has_history": True, "top_user_themes": []}

        monuments = db.query(models.Monument).filter(models.Monument.id.in_(eligible_ids)).all()
        monuments = _apply_geo_filter(monuments, lat, lon, max_km)

        def percent_of(m: models.Monument) -> float:
            total, positive = stats[m.id]
            return positive / total

        monuments.sort(key=percent_of, reverse=True)
        page = monuments[offset: offset + limit]

        result = format_results(page, profile=None, user_theme_map={}, lat=lat, lon=lon)
        for item in result["items"]:
            total, positive = stats[item["id"]]
            score = _rating_score(total, positive)
            item["rating_percent"] = score["percent"]
            item["rating_label"] = score["label"]
            item["rating_total"] = total
        result["has_history"] = True
        return result


class PersonalizedStrategy(RecommendationStrategy):
    """Score hybride (60% thèmes, 40% embedding) basé sur le profil de goûts de
    l'utilisateur, calculé via le service IA à partir de son historique
    (visites + trajets). Sans historique : repli sur la proximité géographique."""

    TAG_WEIGHT = 0.6
    EMBEDDING_WEIGHT = 0.4

    def _get_user_history(self, user_id: int, db: Session) -> list[models.Monument]:
        """Monuments visités + ajoutés à un trajet (dédupliqués)."""
        visited_ids = {v.monument_id for v in db.query(models.Visit).filter(models.Visit.user_id == user_id).all()}
        trip_ids = set()
        for trip in db.query(models.Trip).filter(models.Trip.user_id == user_id).all():
            for tm in trip.trip_monuments:
                trip_ids.add(tm.monument_id)

        all_ids = visited_ids | trip_ids
        if not all_ids:
            return []
        return db.query(models.Monument).filter(models.Monument.id.in_(all_ids)).all()

    def _build_taste_profile(self, user: models.User, history: list[models.Monument], db: Session) -> Optional[dict]:
        """Calcule (via le service IA) ou lit depuis le cache le profil de goûts utilisateur."""
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

    def _cosine(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    def _score_monument(self, monument: models.Monument, profile: dict, user_theme_map: dict[str, float]) -> float:
        tag_score = 0.0
        for mt in monument.themes:
            if mt.theme in user_theme_map:
                tag_score += mt.confidence * user_theme_map[mt.theme]

        embed_score = 0.0
        if monument.embedding and profile.get("embedding"):
            try:
                m_emb = json.loads(monument.embedding)
                embed_score = max(0.0, self._cosine(profile["embedding"], m_emb))
            except (json.JSONDecodeError, ValueError):
                pass

        return self.TAG_WEIGHT * tag_score + self.EMBEDDING_WEIGHT * embed_score

    def get_recommendations(self, db, user, lat, lon, max_km, offset, limit) -> dict:
        history = self._get_user_history(user.id, db)
        known_ids = {m.id for m in history}
        profile = self._build_taste_profile(user, history, db)

        if not profile:
            candidates = db.query(models.Monument).all()
            if lat is not None and lon is not None:
                candidates = [m for m in candidates if m.latitude is not None and m.longitude is not None]
                candidates.sort(key=lambda m: _haversine_km(lat, lon, m.latitude, m.longitude))
            results = candidates[offset: offset + limit]
            return format_results(results, profile=None, user_theme_map={}, lat=lat, lon=lon)

        user_theme_map = {t["theme"]: t["confidence"] for t in profile["themes"]}

        all_monuments = (
            db.query(models.Monument)
            .filter(models.Monument.id.notin_(known_ids) if known_ids else True)
            .all()
        )
        all_monuments = _apply_geo_filter(all_monuments, lat, lon, max_km)

        scored = [(m, self._score_monument(m, profile, user_theme_map)) for m in all_monuments]
        scored.sort(key=lambda x: x[1], reverse=True)

        page = scored[offset: offset + limit]
        monuments = [m for m, _ in page]
        scores = {m.id: s for m, s in page}

        return format_results(monuments, profile, user_theme_map, lat, lon, scores)


STRATEGIES: dict[str, RecommendationStrategy] = {
    "recommended": PersonalizedStrategy(),
    "popular": PopularStrategy(),
    "rated": RatedStrategy(),
}
