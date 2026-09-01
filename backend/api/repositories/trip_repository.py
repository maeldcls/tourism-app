"""Repository pour l'agrégat Trip (trajet) et ses TripMonument associés.

Avant : routes/trips.py construisait ses requêtes SQLAlchemy directement dans
chaque handler, mélangeant HTTP (validation, codes de statut) et accès aux
données. Cette classe isole tous les `db.query(models.Trip / TripMonument)`
pour que les routes se limitent à orchestrer (valider → appeler le repository
→ sérialiser), et pour que la logique de requêtage soit testable indépendamment
de FastAPI.
"""
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

import models


class TripRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Trip ──────────────────────────────────────────────────────────────
    def get_by_id(self, trip_id: int) -> Optional[models.Trip]:
        return self.db.query(models.Trip).filter(models.Trip.id == trip_id).first()

    def list_by_ids(self, trip_ids: list[int]) -> list[models.Trip]:
        return (
            self.db.query(models.Trip)
            .filter(models.Trip.id.in_(trip_ids))
            .order_by(models.Trip.created_at.desc())
            .all()
        )

    def create(self, user_id: int, name: str, description: Optional[str]) -> models.Trip:
        trip = models.Trip(user_id=user_id, name=name, description=description)
        self.db.add(trip)
        self.db.commit()
        self.db.refresh(trip)
        return trip

    def delete(self, trip: models.Trip) -> None:
        self.db.delete(trip)
        self.db.commit()

    def update_settings(
        self, trip: models.Trip, use_days: Optional[bool], day_count: Optional[int]
    ) -> models.Trip:
        if use_days is not None:
            trip.use_days = use_days
        if day_count is not None:
            trip.day_count = day_count
        self.db.commit()
        return trip

    # ── TripMonument ─────────────────────────────────────────────────────
    def get_trip_monument(self, trip_id: int, monument_id: int) -> Optional[models.TripMonument]:
        return self.db.query(models.TripMonument).filter(
            models.TripMonument.trip_id == trip_id,
            models.TripMonument.monument_id == monument_id,
        ).first()

    def count_trip_monuments(self, trip_id: int) -> int:
        return self.db.query(models.TripMonument).filter(models.TripMonument.trip_id == trip_id).count()

    def add_monument(self, trip_id: int, monument_id: int) -> models.TripMonument:
        tm = models.TripMonument(
            trip_id=trip_id, monument_id=monument_id, order=self.count_trip_monuments(trip_id)
        )
        self.db.add(tm)
        self.db.commit()
        return tm

    def remove_trip_monument(self, tm: models.TripMonument) -> None:
        self.db.delete(tm)
        self.db.commit()

    def move_trip_monument(self, tm: models.TripMonument, target_trip_id: int) -> models.TripMonument:
        new_tm = models.TripMonument(
            trip_id=target_trip_id,
            monument_id=tm.monument_id,
            order=self.count_trip_monuments(target_trip_id),
            day=None,
            is_visited=tm.is_visited,
            icon=tm.icon,
            color=tm.color,
            is_hidden=tm.is_hidden,
        )
        self.db.delete(tm)
        self.db.add(new_tm)
        self.db.commit()
        return new_tm

    def list_trip_monuments_for_trips(self, trip_ids: list[int]) -> list[models.TripMonument]:
        return (
            self.db.query(models.TripMonument)
            .filter(models.TripMonument.trip_id.in_(trip_ids))
            .all()
        )

    def trip_monuments_map(self, trip_id: int) -> dict[int, models.TripMonument]:
        return {
            tm.monument_id: tm
            for tm in self.db.query(models.TripMonument).filter(models.TripMonument.trip_id == trip_id).all()
        }

    # ── CustomPoint (points personnalisés rattachés à un trajet) ───────────
    def list_custom_points_for_trips_or_user(self, trip_ids: list[int], user_id: int) -> list[models.CustomPoint]:
        return (
            self.db.query(models.CustomPoint)
            .filter(
                or_(
                    models.CustomPoint.trip_id.in_(trip_ids),
                    and_(models.CustomPoint.user_id == user_id, models.CustomPoint.trip_id.is_(None)),
                )
            )
            .all()
        )

    def custom_points_map(self, trip_id: int) -> dict[int, models.CustomPoint]:
        return {
            p.id: p
            for p in self.db.query(models.CustomPoint).filter(models.CustomPoint.trip_id == trip_id).all()
        }
