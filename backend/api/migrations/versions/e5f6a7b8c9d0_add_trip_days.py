"""add trip days

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trips', sa.Column('use_days', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('trips', sa.Column('day_count', sa.Integer(), nullable=True))
    op.add_column('trip_monuments', sa.Column('day', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('trip_monuments', 'day')
    op.drop_column('trips', 'day_count')
    op.drop_column('trips', 'use_days')
