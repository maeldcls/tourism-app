"""
Admin routes — modération des photos proposées par les utilisateurs.

GET  /admin/photos?status=pending   → file de modération (défaut : pending)
POST /admin/photos/{id}/approve     → valide la photo (devient visible sur la fiche monument)
POST /admin/photos/{id}/reject      → rejette la photo (reste masquée)
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from deps import require_admin
import models

router = APIRouter(prefix="/admin/photos", tags=["Admin — Photos"])


def _photo_to_dict(p: models.MonumentImage) -> dict:
    return {
        "id": p.id,
        "monument_id": p.monument_id,
        "monument_name": p.monument.name if p.monument else None,
        "image_url": p.image_url,
        "status": p.status,
        "submitter_username": p.submitter.username if p.submitter else None,
        "created_at": p.created_at,
    }


# ── GET /admin/photos ─────────────────────────────────────────────────────────────
@router.get("")
def list_photo_queue(
    status: str = Query("pending", description="pending | approved | rejected"),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photos = (
        db.query(models.MonumentImage)
        .filter(models.MonumentImage.source == "user", models.MonumentImage.status == status)
        .order_by(models.MonumentImage.created_at.desc())
        .all()
    )
    return [_photo_to_dict(p) for p in photos]


def _moderate(photo_id: int, new_status: str, admin: models.User, db: Session) -> dict:
    photo = db.query(models.MonumentImage).filter(models.MonumentImage.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo introuvable")

    photo.status = new_status
    photo.moderated_by = admin.id
    photo.moderated_at = datetime.utcnow()
    db.commit()
    return _photo_to_dict(photo)


# ── POST /admin/photos/{id}/approve ────────────────────────────────────────────────
@router.post("/{photo_id}/approve")
def approve_photo(photo_id: int, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return _moderate(photo_id, "approved", admin, db)


# ── POST /admin/photos/{id}/reject ─────────────────────────────────────────────────
@router.post("/{photo_id}/reject")
def reject_photo(photo_id: int, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return _moderate(photo_id, "rejected", admin, db)
