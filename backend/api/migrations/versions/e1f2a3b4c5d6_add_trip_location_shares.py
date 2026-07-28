"""add trip_location_shares (live position sharing per trip)

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trip_location_shares',
        sa.Column('trip_id', sa.BigInteger(), sa.ForeignKey('trips.id'), primary_key=True),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('trip_location_shares')
