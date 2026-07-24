"""
Monument tags routes — assignation communautaire de tags prédéfinis aux monuments.

GET    /tags                          → référentiel complet des tags disponibles
GET    /monuments/{monument_id}/tags  → top 6 tags les plus utilisés + tags choisis par l'utilisateur courant
POST   /monuments/{monument_id}/tags  → assigner un tag (auth). Max 3 tags distincts pour un utilisateur normal,
                                         illimité pour un admin (comptes et tags distincts).
DELETE /monuments/{monument_id}/tags/{tag_id} → retirer ses propres assignations de ce tag sur ce monument
"""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from deps import get_current_user, get_current_user_optional
import models

router = APIRouter(tags=["Tags monuments"])

MAX_TAGS_PER_USER = 3
TOP_TAGS_LIMIT = 6


class TagAssign(BaseModel):
    tag_id: int


# ── GET /tags ──────────────────────────────────────────────────────────────────
@router.get("/tags")
def list_all_tags(db: Session = Depends(get_db)):
    tags = db.query(models.Tag).order_by(models.Tag.sentiment, models.Tag.label).all()
    return [
        {"id": t.id, "label": t.label, "emoji": t.emoji, "sentiment": t.sentiment}
        for t in tags
    ]


# ── GET /monuments/{monument_id}/tags ────────────────────────────────────────────
@router.get("/monuments/{monument_id}/tags")
def get_monument_tags(
    monument_id: int,
    user: Optional[models.User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    assignments = (
        db.query(models.MonumentTag)
        .filter(models.MonumentTag.monument_id == monument_id)
        .all()
    )

    counts = Counter(a.tag_id for a in assignments)
    user_tag_ids = sorted({a.tag_id for a in assignments if user and a.user_id == user.id})

    top = counts.most_common(TOP_TAGS_LIMIT)
    tag_ids = [tag_id for tag_id, _ in top]
    tags_by_id = {t.id: t for t in db.query(models.Tag).filter(models.Tag.id.in_(tag_ids)).all()}

    top_tags = [
        {
            "tag_id": tag_id,
            "label": tags_by_id[tag_id].label,
            "emoji": tags_by_id[tag_id].emoji,
            "sentiment": tags_by_id[tag_id].sentiment,
            "count": count,
            "voted": tag_id in user_tag_ids,
        }
        for tag_id, count in top if tag_id in tags_by_id
    ]

    return {"top_tags": top_tags, "user_tag_ids": user_tag_ids}


# ── POST /monuments/{monument_id}/tags ───────────────────────────────────────────
@router.post("/monuments/{monument_id}/tags", status_code=201)
def assign_tag(
    monument_id: int,
    body: TagAssign,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    tag = db.query(models.Tag).filter(models.Tag.id == body.tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag introuvable")

    if not user.is_admin:
        already = (
            db.query(models.MonumentTag)
            .filter(
                models.MonumentTag.monument_id == monument_id,
                models.MonumentTag.user_id == user.id,
                models.MonumentTag.tag_id == body.tag_id,
            )
            .first()
        )
        if already:
            raise HTTPException(status_code=409, detail="Vous avez déjà ajouté ce tag")

        distinct_count = (
            db.query(models.MonumentTag.tag_id)
            .filter(models.MonumentTag.monument_id == monument_id, models.MonumentTag.user_id == user.id)
            .distinct()
            .count()
        )
        if distinct_count >= MAX_TAGS_PER_USER:
            raise HTTPException(status_code=400, detail=f"Maximum {MAX_TAGS_PER_USER} tags par monument")

    db.add(models.MonumentTag(monument_id=monument_id, tag_id=body.tag_id, user_id=user.id))
    db.commit()
    return {"detail": "Tag ajouté"}


# ── DELETE /monuments/{monument_id}/tags/{tag_id} ────────────────────────────────
@router.delete("/monuments/{monument_id}/tags/{tag_id}")
def unassign_tag(
    monument_id: int,
    tag_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignments = (
        db.query(models.MonumentTag)
        .filter(
            models.MonumentTag.monument_id == monument_id,
            models.MonumentTag.tag_id == tag_id,
            models.MonumentTag.user_id == user.id,
        )
        .all()
    )
    for a in assignments:
        db.delete(a)
    db.commit()
    return {"detail": "Tag retiré"}
