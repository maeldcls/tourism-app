"""
Mur de photos partagé d'un trajet — tout membre (host/write/read) peut contribuer,
le nom de l'auteur reste toujours affiché. Suppression réservée à l'auteur de la
photo ou au host du trajet (modération).

POST   /trips/{id}/photos           → ajoute jusqu'à 10 photos (tout membre)
GET    /trips/{id}/photos           → liste les photos (tout membre)
DELETE /trips/{id}/photos/{photo_id} → supprime une photo (auteur ou host)
"""
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from services.image_processor import ImageProcessor
from services.trip_utils import get_trip
import models

router = APIRouter(prefix="/trips", tags=["Photos de trajet"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "trip_photos")

MAX_PHOTOS_PER_UPLOAD = 10
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 Mo
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_DIMENSION = 1600
JPEG_QUALITY = 82

photo_processor = ImageProcessor(
    UPLOAD_DIR, max_dimension=MAX_DIMENSION, jpeg_quality=JPEG_QUALITY, square_crop=False
)


def _serialize(photo: models.TripPhoto) -> dict:
    return {
        "id": photo.id,
        "trip_id": photo.trip_id,
        "image_url": photo.image_url,
        "caption": photo.caption,
        "created_at": photo.created_at,
        "uploaded_by": photo.uploaded_by,
        "uploader_username": photo.uploader.username if photo.uploader else None,
        "uploader_avatar_url": photo.uploader.avatar_url if photo.uploader else None,
    }


# ── POST /trips/{id}/photos ──────────────────────────────────────────────────────
@router.post("/{trip_id}/photos", status_code=201)
async def add_trip_photos(
    files: List[UploadFile] = File(...),
    captions: Optional[List[str]] = Form(None),
    trip: models.Trip = Depends(get_trip("read")),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="Aucune photo reçue")
    if len(files) > MAX_PHOTOS_PER_UPLOAD:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_PHOTOS_PER_UPLOAD} photos par envoi")
    if captions is not None and len(captions) != len(files):
        raise HTTPException(status_code=400, detail="Le nombre de légendes ne correspond pas au nombre de photos")

    created = []
    for i, f in enumerate(files):
        if f.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail=f"Format non supporté : {f.content_type}")
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Photo trop volumineuse (max 8 Mo)")

        filename = photo_processor.process_and_save(content)
        caption = captions[i].strip() if captions and captions[i] and captions[i].strip() else None
        created.append(
            models.TripPhoto(
                trip_id=trip.id,
                uploaded_by=user.id,
                image_url=f"/uploads/trip_photos/{filename}",
                caption=caption,
            )
        )

    db.add_all(created)
    db.commit()
    for photo in created:
        db.refresh(photo)
    return {"photos": [_serialize(p) for p in created]}


# ── GET /trips/{id}/photos ───────────────────────────────────────────────────────
@router.get("/{trip_id}/photos")
def list_trip_photos(
    trip: models.Trip = Depends(get_trip("read")),
    db: Session = Depends(get_db),
):
    photos = (
        db.query(models.TripPhoto)
        .filter(models.TripPhoto.trip_id == trip.id)
        .order_by(models.TripPhoto.created_at.desc())
        .all()
    )
    return {"photos": [_serialize(p) for p in photos]}


# ── DELETE /trips/{id}/photos/{photo_id} ─────────────────────────────────────────
@router.delete("/{trip_id}/photos/{photo_id}")
def delete_trip_photo(
    photo_id: int,
    trip: models.Trip = Depends(get_trip("read")),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    photo = (
        db.query(models.TripPhoto)
        .filter(models.TripPhoto.id == photo_id, models.TripPhoto.trip_id == trip.id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo introuvable")

    is_author = photo.uploaded_by == user.id
    is_host = trip.user_id == user.id
    if not is_author and not is_host:
        raise HTTPException(status_code=403, detail="Accès refusé")

    if trip.cover_photo_id == photo.id:
        trip.cover_photo_id = None

    filepath = os.path.join(UPLOAD_DIR, os.path.basename(photo.image_url))
    db.delete(photo)
    db.commit()
    if os.path.exists(filepath):
        os.remove(filepath)

    return {"detail": "Photo supprimée"}
