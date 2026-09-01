"""Helpers partagés pour déterminer la relation d'amitié entre deux utilisateurs."""
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

import models


def find_friendship(db: Session, user_a_id: int, user_b_id: int):
    return db.query(models.Friendship).filter(
        or_(
            and_(models.Friendship.requester_id == user_a_id, models.Friendship.addressee_id == user_b_id),
            and_(models.Friendship.requester_id == user_b_id, models.Friendship.addressee_id == user_a_id),
        )
    ).first()


def relation_status(friendship, me_id: int) -> str:
    if not friendship or friendship.status == "declined":
        return "none"
    if friendship.status == "accepted":
        return "friends"
    return "pending_outgoing" if friendship.requester_id == me_id else "pending_incoming"
