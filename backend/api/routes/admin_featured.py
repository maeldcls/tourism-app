"""
Admin featured destinations routes — gestion (CRUD) des destinations mises en
avant sur la Home, réservée aux admins.

GET    /admin/featured-destinations                       → liste tout (actives + inactives)
POST   /admin/featured-destinations                        → crée une destination
PATCH  /admin/featured-destinations/{id}                   → modifie une destination
DELETE /admin/featured-destinations/{id}                   → supprime une destination
POST   /admin/featured-destinations/{id}/monuments         → ajoute un monument incontournable
DELETE /admin/featured-destinations/{id}/monuments/{mid}   → retire un monument
"""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from deps import require_admin
from services.image_processor import ImageProcessor
import models

router = APIRouter(prefix="/admin/featured-destinations", tags=["Admin — Destinations en avant"])

COVER_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "featured")
MAX_COVER_SIZE = 8 * 1024 * 1024  # 8 Mo
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

cover_processor = ImageProcessor(COVER_UPLOAD_DIR, max_dimension=1600, jpeg_quality=85, square_crop=False)


def _monument_summary(m: models.Monument) -> dict:
    return {"id": m.id, "name": m.name, "city": m.city, "category": m.category}


def _destination_to_dict(d: models.FeaturedDestination) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "country": d.country,
        "tagline": d.tagline,
        "cover_image_url": d.cover_image_url,
        "latitude": d.latitude,
        "longitude": d.longitude,
        "is_active": d.is_active,
        "created_at": d.created_at,
        "monuments": [_monument_summary(fm.monument) for fm in d.monuments if fm.monument],
    }


async def _process_cover(cover_image: Optional[UploadFile]) -> Optional[str]:
    if cover_image is None:
        return None
    if cover_image.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Format d'image non supporté")
    file_bytes = await cover_image.read()
    if len(file_bytes) > MAX_COVER_SIZE:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 8 Mo)")
    filename = cover_processor.process_and_save(file_bytes)
    return f"/uploads/featured/{filename}"


# ── GET /admin/featured-destinations ────────────────────────────────────────────
@router.get("")
def list_featured_destinations(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    destinations = db.query(models.FeaturedDestination).order_by(models.FeaturedDestination.created_at.desc()).all()
    return [_destination_to_dict(d) for d in destinations]


# ── POST /admin/featured-destinations ───────────────────────────────────────────
@router.post("", status_code=201)
async def create_featured_destination(
    name: str = Form(...),
    country: Optional[str] = Form(None),
    tagline: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    is_active: bool = Form(True),
    cover_image: Optional[UploadFile] = File(None),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    destination = models.FeaturedDestination(
        name=name.strip(),
        country=country.strip() if country else None,
        tagline=tagline.strip() if tagline else None,
        latitude=latitude,
        longitude=longitude,
        is_active=is_active,
        cover_image_url=await _process_cover(cover_image),
    )
    db.add(destination)
    db.commit()
    db.refresh(destination)
    return _destination_to_dict(destination)


# ── PATCH /admin/featured-destinations/{id} ─────────────────────────────────────
@router.patch("/{destination_id}")
async def update_featured_destination(
    destination_id: int,
    name: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    tagline: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    is_active: Optional[bool] = Form(None),
    cover_image: Optional[UploadFile] = File(None),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    destination = db.query(models.FeaturedDestination).filter(models.FeaturedDestination.id == destination_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Destination introuvable")

    if name is not None:
        destination.name = name.strip()
    if country is not None:
        destination.country = country.strip() or None
    if tagline is not None:
        destination.tagline = tagline.strip() or None
    if latitude is not None:
        destination.latitude = latitude
    if longitude is not None:
        destination.longitude = longitude
    if is_active is not None:
        destination.is_active = is_active

    new_cover = await _process_cover(cover_image)
    if new_cover:
        destination.cover_image_url = new_cover

    db.commit()
    db.refresh(destination)
    return _destination_to_dict(destination)


# ── DELETE /admin/featured-destinations/{id} ────────────────────────────────────
@router.delete("/{destination_id}")
def delete_featured_destination(destination_id: int, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    destination = db.query(models.FeaturedDestination).filter(models.FeaturedDestination.id == destination_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Destination introuvable")

    db.delete(destination)
    db.commit()
    return {"detail": "Destination supprimée"}


# ── POST /admin/featured-destinations/{id}/monuments ────────────────────────────
class AddMonumentBody(BaseModel):
    monument_id: int


@router.post("/{destination_id}/monuments", status_code=201)
def add_featured_monument(
    destination_id: int,
    body: AddMonumentBody,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    destination = db.query(models.FeaturedDestination).filter(models.FeaturedDestination.id == destination_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Destination introuvable")

    monument = db.query(models.Monument).filter(models.Monument.id == body.monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    link = models.FeaturedDestinationMonument(featured_destination_id=destination_id, monument_id=body.monument_id)
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce monument est déjà dans la liste")

    db.refresh(destination)
    return _destination_to_dict(destination)


# ── DELETE /admin/featured-destinations/{id}/monuments/{monument_id} ────────────
@router.delete("/{destination_id}/monuments/{monument_id}")
def remove_featured_monument(
    destination_id: int,
    monument_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    link = (
        db.query(models.FeaturedDestinationMonument)
        .filter(
            models.FeaturedDestinationMonument.featured_destination_id == destination_id,
            models.FeaturedDestinationMonument.monument_id == monument_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Monument non trouvé dans cette destination")

    db.delete(link)
    db.commit()
    return {"detail": "Monument retiré"}
