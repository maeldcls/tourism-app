"""
Admin tags routes — gestion du référentiel de tags (CRUD), réservée aux admins.

GET    /admin/tags        → liste tous les tags
POST   /admin/tags        → crée un tag
PUT    /admin/tags/{id}   → modifie un tag
DELETE /admin/tags/{id}   → supprime un tag (cascade sur les assignations)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
from deps import require_admin
import models

router = APIRouter(prefix="/admin/tags", tags=["Admin — Tags"])


class TagBody(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    emoji: str = Field(min_length=1, max_length=10)
    sentiment: str = Field(default="neutral", pattern="^(positive|neutral|negative)$")


def _tag_to_dict(t: models.Tag) -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "emoji": t.emoji,
        "sentiment": t.sentiment,
        "usage_count": len(t.monument_tags),
    }


# ── GET /admin/tags ────────────────────────────────────────────────────────────
@router.get("")
def list_tags(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    tags = db.query(models.Tag).order_by(models.Tag.sentiment, models.Tag.label).all()
    return [_tag_to_dict(t) for t in tags]


# ── POST /admin/tags ───────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_tag(body: TagBody, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    tag = models.Tag(label=body.label.strip(), emoji=body.emoji.strip(), sentiment=body.sentiment)
    db.add(tag)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce tag existe déjà")
    db.refresh(tag)
    return _tag_to_dict(tag)


# ── PUT /admin/tags/{id} ───────────────────────────────────────────────────────
@router.put("/{tag_id}")
def update_tag(
    tag_id: int, body: TagBody, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)
):
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag introuvable")

    tag.label = body.label.strip()
    tag.emoji = body.emoji.strip()
    tag.sentiment = body.sentiment
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce tag existe déjà")
    db.refresh(tag)
    return _tag_to_dict(tag)


# ── DELETE /admin/tags/{id} ─────────────────────────────────────────────────────
@router.delete("/{tag_id}")
def delete_tag(tag_id: int, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag introuvable")

    db.delete(tag)
    db.commit()
    return {"detail": "Tag supprimé"}
