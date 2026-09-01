"""Repository pour l'agrégat Monument.

Isole les requêtes SQLAlchemy utilisées par routes/monuments.py (recherche,
filtrage géographique, création/upsert) pour que les handlers HTTP se limitent
à la validation et à la sérialisation.
"""
from typing import Optional

from sqlalchemy.orm import Session

import models


class MonumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, monument_id: int) -> Optional[models.Monument]:
        return self.db.query(models.Monument).filter(models.Monument.id == monument_id).first()

    def get_by_osm_id(self, osm_id: str) -> Optional[models.Monument]:
        return self.db.query(models.Monument).filter(models.Monument.osm_id == osm_id).first()

    def find_by_name_and_coords(self, name: str, latitude, longitude) -> Optional[models.Monument]:
        return self.db.query(models.Monument).filter(
            models.Monument.name == name,
            models.Monument.latitude == latitude,
            models.Monument.longitude == longitude,
        ).first()

    def create(
        self,
        name: str,
        city: Optional[str],
        description: Optional[str],
        category: Optional[str],
        latitude: Optional[float],
        longitude: Optional[float],
        osm_id: Optional[str] = None,
    ) -> models.Monument:
        m = models.Monument(
            osm_id=osm_id, name=name, city=city, description=description,
            category=category, latitude=latitude, longitude=longitude,
        )
        self.db.add(m)
        self.db.commit()
        self.db.refresh(m)
        return m

    def add_images(self, monument: models.Monument, image_urls: list[str]) -> None:
        if not image_urls:
            return
        for url in image_urls:
            self.db.add(models.MonumentImage(monument_id=monument.id, image_url=url))
        self.db.commit()
        self.db.refresh(monument)

    def list_filtered(self, city: Optional[str], q: Optional[str]) -> list[models.Monument]:
        query = self.db.query(models.Monument)
        if city:
            query = query.filter(models.Monument.city.ilike(f"%{city}%"))
        if q:
            query = query.filter(models.Monument.name.ilike(f"%{q}%")).limit(8)
        return query.all()

    def list_in_bbox(self, south: float, west: float, north: float, east: float, limit: int = 500) -> list[models.Monument]:
        return (
            self.db.query(models.Monument)
            .filter(
                models.Monument.latitude.between(south, north),
                models.Monument.longitude.between(west, east),
            )
            .limit(limit)
            .all()
        )

    def list_with_coords(self) -> list[models.Monument]:
        return self.db.query(models.Monument).filter(
            models.Monument.latitude.isnot(None),
            models.Monument.longitude.isnot(None),
        ).all()
