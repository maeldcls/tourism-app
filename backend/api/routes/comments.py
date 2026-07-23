"""
Comments routes — commentaires communautaires sur les monuments, avec pré-modération IA.

GET    /monuments/{monument_id}/comments   → commentaires visibles d'un monument
POST   /monuments/{monument_id}/comments   → poster un commentaire (auth) — passe par le filtre IA
DELETE /comments/{id}                      → supprimer son propre commentaire (auth)
"""
import os
from datetime import datetime

import requests
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db
from deps import get_current_user
import models

router = APIRouter(tags=["Commentaires"])

AI_URL = os.getenv("AI_SERVICE_URL", "http://ai:8001")
TOXICITY_THRESHOLD = 0.5


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def _comment_to_dict(c: models.Comment, include_status: bool = False) -> dict:
    d = {
        "id": c.id,
        "monument_id": c.monument_id,
        "user_id": c.user_id,
        "username": c.user.username if c.user else None,
        "body": c.body,
        "created_at": c.created_at,
    }
    if include_status:
        d["status"] = c.status
    return d


def _moderate(text: str) -> tuple[float | None, bool]:
    """Interroge le service IA. Si indisponible, on met en attente par précaution plutôt que de publier en aveugle."""
    try:
        resp = requests.post(f"{AI_URL}/moderate-comment", json={"text": text}, timeout=8)
        resp.raise_for_status()
        score = float(resp.json()["score"])
        return score, score >= TOXICITY_THRESHOLD
    except Exception:
        return None, True


# ── GET /monuments/{monument_id}/comments ──────────────────────────────────────
@router.get("/monuments/{monument_id}/comments")
def list_comments(monument_id: int, db: Session = Depends(get_db)):
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.monument_id == monument_id, models.Comment.status == "visible")
        .order_by(models.Comment.created_at.desc())
        .all()
    )
    return [_comment_to_dict(c) for c in comments]


# ── POST /monuments/{monument_id}/comments ──────────────────────────────────────
@router.post("/monuments/{monument_id}/comments", status_code=201)
def create_comment(
    monument_id: int,
    body: CommentCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    score, flagged = _moderate(body.body)
    comment = models.Comment(
        monument_id=monument_id,
        user_id=user.id,
        body=body.body,
        status="pending_review" if flagged else "visible",
        ai_score=score,
        ai_flagged_at=datetime.utcnow() if flagged else None,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_to_dict(comment, include_status=True)


# ── DELETE /comments/{id} ────────────────────────────────────────────────────────
@router.delete("/comments/{comment_id}")
def delete_own_comment(
    comment_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire introuvable")
    if comment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que vos propres commentaires")

    db.delete(comment)
    db.commit()
    return {"detail": "Commentaire supprimé"}
