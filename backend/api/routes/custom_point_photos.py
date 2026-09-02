"""
Photos d'un point personnalisé — contenu appartenant exclusivement au créateur du
point (pas de modération : contrairement aux photos de monuments, ce n'est pas
une contribution communautaire, juste la galerie du propriétaire).

POST   /custom-points/{id}/photos           → ajoute jusqu'à 6 photos (owner only)
DELETE /custom-points/{id}/photos/{photo_id} → supprime une photo (owner only)
"""
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from services.image_processor import ImageProcessor
import models

router = APIRouter(prefix="/custom-points", tags=["Photos points personnalisés"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "custom_point_photos")

MAX_PHOTOS_PER_POINT = 6
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 Mo
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_DIMENSION = 1600
JPEG_QUALITY = 82

photo_processor = ImageProcessor(
    UPLOAD_DIR, max_dimension=MAX_DIMENSION, jpeg_quality=JPEG_QUALITY, square_crop=False
)


def _load_owned_point(db: Session, point_id: int, user: models.User) -> models.CustomPoint:
    point = db.query(models.CustomPoint).filter(models.CustomPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point introuvable")
    if point.user_id != user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return point


# ── POST /custom-points/{id}/photos ──────────────────────────────────────────────
@router.post("/{point_id}/photos", status_code=201)
async def add_custom_point_photos(
    point_id: int,
    files: List[UploadFile] = File(...),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    point = _load_owned_point(db, point_id, user)

    if not files:
        raise HTTPException(status_code=400, detail="Aucune photo reçue")

    existing_count = len(point.images)
    if existing_count + len(files) > MAX_PHOTOS_PER_POINT:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PHOTOS_PER_POINT} photos par point ({existing_count} déjà présente(s)).",
        )

    created = []
    for f in files:
        if f.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail=f"Format non supporté : {f.content_type}")
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Photo trop volumineuse (max 8 Mo)")

        filename = photo_processor.process_and_save(content)
        created.append(
            models.CustomPointImage(
                custom_point_id=point_id,
                image_url=f"/uploads/custom_point_photos/{filename}",
                submitted_by=user.id,
            )
        )

    db.add_all(created)
    db.commit()
    db.refresh(point)
    return {"images": [{"id": img.id, "url": img.image_url} for img in point.images]}


# ── DELETE /custom-points/{id}/photos/{photo_id} ─────────────────────────────────
@router.delete("/{point_id}/photos/{photo_id}")
def delete_custom_point_photo(
    point_id: int,
    photo_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _load_owned_point(db, point_id, user)

    image = (
        db.query(models.CustomPointImage)
        .filter(models.CustomPointImage.id == photo_id, models.CustomPointImage.custom_point_id == point_id)
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Photo introuvable")

    filepath = os.path.join(UPLOAD_DIR, os.path.basename(image.image_url))
    db.delete(image)
    db.commit()
    if os.path.exists(filepath):
        os.remove(filepath)

    return {"detail": "Photo supprimée"}
