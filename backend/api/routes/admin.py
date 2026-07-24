"""
Admin routes — modération des commentaires.

GET    /admin/comments?status=pending_review   → file de modération (défaut : pending_review)
POST   /admin/comments/{id}/restore            → réafficher un commentaire (faux positif IA)
DELETE /admin/comments/{id}                    → supprimer définitivement un commentaire offensant
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from deps import require_admin
import models

router = APIRouter(prefix="/admin", tags=["Admin"])


def _comment_to_dict(c: models.Comment) -> dict:
    return {
        "id": c.id,
        "monument_id": c.monument_id,
        "monument_name": c.monument.name if c.monument else None,
        "user_id": c.user_id,
        "username": c.user.username if c.user else None,
        "body": c.body,
        "status": c.status,
        "ai_score": c.ai_score,
        "ai_flagged_at": c.ai_flagged_at,
        "created_at": c.created_at,
    }


# ── GET /admin/comments ──────────────────────────────────────────────────────────
@router.get("/comments")
def list_moderation_queue(
    status: str = Query("pending_review", description="visible | pending_review | removed"),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    comments = (
        db.query(models.Comment)
        .filter(models.Comment.status == status)
        .order_by(models.Comment.created_at.desc())
        .all()
    )
    return [_comment_to_dict(c) for c in comments]


# ── POST /admin/comments/{id}/restore ────────────────────────────────────────────
@router.post("/comments/{comment_id}/restore")
def restore_comment(
    comment_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire introuvable")

    comment.status = "visible"
    comment.moderated_by = admin.id
    comment.moderated_at = datetime.utcnow()
    db.commit()
    return _comment_to_dict(comment)


# ── DELETE /admin/comments/{id} ──────────────────────────────────────────────────
@router.delete("/comments/{comment_id}")
def remove_comment(
    comment_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire introuvable")

    comment.status = "removed"
    comment.moderated_by = admin.id
    comment.moderated_at = datetime.utcnow()
    db.commit()
    return {"detail": "Commentaire supprimé."}
