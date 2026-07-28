"""dedupe visits and add unique constraint on (user_id, monument_id)

Revision ID: d0e1f2a3b4c5
Revises: b8c9d0e1f2a3
Create Date: 2026-07-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ne garder que la visite la plus récente par (user_id, monument_id) avant
    # de poser la contrainte unique — le endpoint devient un upsert.
    op.execute(
        """
        DELETE FROM visits v
        USING visits v2
        WHERE v.user_id = v2.user_id
          AND v.monument_id = v2.monument_id
          AND v.id < v2.id
        """
    )
    op.create_unique_constraint("uq_visit_user_monument", "visits", ["user_id", "monument_id"])


def downgrade() -> None:
    op.drop_constraint("uq_visit_user_monument", "visits", type_="unique")
