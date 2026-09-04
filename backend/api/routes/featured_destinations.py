"""
Featured destinations routes — page Home (public, pas d'authentification requise).

GET /featured-destinations → destinations actives choisies par un admin, avec
                              leurs monuments incontournables (voir routes/admin_featured.py
                              pour la gestion CRUD).
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models

router = APIRouter(prefix="/featured-destinations", tags=["Destinations en avant"])


def _monument_summary(m: models.Monument) -> dict:
    images = [img.image_url for img in m.images[:1]]
    return {
        "id": m.id,
        "name": m.name,
        "city": m.city,
        "category": m.category or "monument",
        "image_url": images[0] if images else None,
    }


@router.get("")
def list_active_featured_destinations(db: Session = Depends(get_db)):
    destinations = (
        db.query(models.FeaturedDestination)
        .filter(models.FeaturedDestination.is_active.is_(True))
        .order_by(models.FeaturedDestination.created_at.asc())
        .all()
    )
    return [
        {
            "id": d.id,
            "name": d.name,
            "country": d.country,
            "tagline": d.tagline,
            "cover_image_url": d.cover_image_url,
            "latitude": d.latitude,
            "longitude": d.longitude,
            "monuments": [_monument_summary(fm.monument) for fm in d.monuments if fm.monument],
        }
        for d in destinations
    ]
