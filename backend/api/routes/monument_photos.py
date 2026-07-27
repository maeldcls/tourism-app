"""
Photos communautaires — contributions des utilisateurs aux fiches monuments.

POST /monuments/{id}/photos → propose jusqu'à 3 photos par monument (auth requise)
                               stockées en "pending", visibles après validation admin
"""
import os
import uuid
from io import BytesIO
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
import models

router = APIRouter(prefix="/monuments", tags=["Monument Photos"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "monument_photos")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_PHOTOS_PER_USER = 3
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 Mo
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_DIMENSION = 1600
JPEG_QUALITY = 82


def _save_and_process(file_bytes: bytes) -> str:
    """Redimensionne, applique la rotation EXIF puis supprime les métadonnées, enregistre en JPEG."""
    try:
        img = Image.open(BytesIO(file_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier image invalide")

    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION))

    filename = f"{uuid.uuid4().hex}.jpg"
    img.save(os.path.join(UPLOAD_DIR, filename), "JPEG", quality=JPEG_QUALITY)
    return filename


# ── POST /monuments/{id}/photos ──────────────────────────────────────────────────
@router.post("/{monument_id}/photos", status_code=201)
async def submit_monument_photos(
    monument_id: int,
    files: List[UploadFile] = File(...),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    if not files:
        raise HTTPException(status_code=400, detail="Aucune photo reçue")

    existing_count = (
        db.query(models.MonumentImage)
        .filter(
            models.MonumentImage.monument_id == monument_id,
            models.MonumentImage.submitted_by == user.id,
            models.MonumentImage.status.in_(["pending", "approved"]),
        )
        .count()
    )
    if existing_count + len(files) > MAX_PHOTOS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PHOTOS_PER_USER} photos par monument ({existing_count} déjà envoyée(s)).",
        )

    created = []
    for f in files:
        if f.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail=f"Format non supporté : {f.content_type}")
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Photo trop volumineuse (max 8 Mo)")

        filename = _save_and_process(content)
        created.append(
            models.MonumentImage(
                monument_id=monument_id,
                image_url=f"/uploads/monument_photos/{filename}",
                source="user",
                status="pending",
                submitted_by=user.id,
            )
        )

    db.add_all(created)
    db.commit()
    return {"detail": f"{len(created)} photo(s) envoyée(s), en attente de validation."}
