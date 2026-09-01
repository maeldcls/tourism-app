"""
Profile routes — page Profile.

GET   /profile/{user_id} → infos user : username, XP, level, badges (limité si profil privé et pas le propriétaire)
PATCH /profile/me        → modifier son propre profil (username, avatar, public/privé)
"""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, get_current_user_optional
from services.friend_utils import find_friendship, relation_status
from services.image_processor import ImageProcessor
import models

router = APIRouter(prefix="/profile", tags=["Profil"])

AVATAR_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "avatars")

MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 Mo
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
AVATAR_DIMENSION = 512
JPEG_QUALITY = 85

avatar_processor = ImageProcessor(
    AVATAR_UPLOAD_DIR, max_dimension=AVATAR_DIMENSION, jpeg_quality=JPEG_QUALITY, square_crop=True
)


# ── GET /profile/{user_id} ─────────────────────────────────────────────────────
@router.get("/{user_id}")
def get_profile(
    user_id: int,
    db: Session = Depends(get_db),
    viewer: Optional[models.User] = Depends(get_current_user_optional),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User introuvable")

    is_owner = viewer is not None and viewer.id == user.id
    relation = None
    if viewer is not None and not is_owner:
        relation = relation_status(find_friendship(db, viewer.id, user.id), viewer.id)

    if not user.is_public and not is_owner:
        return {
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "is_public": False,
            "relation": relation,
        }

    badges = [
        {
            "badge_id": ub.badge_id,
            "name": ub.badge.name if ub.badge else None,
            "description": ub.badge.description if ub.badge else None,
            "icon_url": ub.badge.icon_url if ub.badge else None,
            "earned_at": ub.earned_at,
        }
        for ub in user.user_badges
    ]

    total_visits = db.query(models.Visit).filter(models.Visit.user_id == user_id).count()

    return {
        "id": user.id,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "is_public": user.is_public,
        "relation": relation,
        "email": user.email if is_owner else None,
        "xp": user.xp,
        "level": user.level,
        "member_since": user.created_at,
        "total_visits": total_visits,
        "badges": badges,
    }


# ── PATCH /profile/me ───────────────────────────────────────────────────────────
@router.patch("/me")
async def update_my_profile(
    username: Optional[str] = Form(None),
    is_public: Optional[bool] = Form(None),
    avatar: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if username is not None:
        username = username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="Username invalide")
        existing = db.query(models.User).filter(
            models.User.username == username, models.User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Username déjà utilisé")
        current_user.username = username

    if is_public is not None:
        current_user.is_public = is_public

    if avatar is not None:
        if avatar.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Format d'image non supporté")
        file_bytes = await avatar.read()
        if len(file_bytes) > MAX_AVATAR_SIZE:
            raise HTTPException(status_code=400, detail="Image trop volumineuse (max 5 Mo)")
        filename = avatar_processor.process_and_save(file_bytes)
        current_user.avatar_url = f"/uploads/avatars/{filename}"

    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "xp": current_user.xp,
        "level": current_user.level,
        "is_admin": current_user.is_admin,
        "avatar_url": current_user.avatar_url,
        "is_public": current_user.is_public,
        "friend_code": current_user.friend_code,
    }
