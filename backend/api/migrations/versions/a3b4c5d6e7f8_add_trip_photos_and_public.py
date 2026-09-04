"""add trip photos, public trip visibility and cover photo

Revision ID: a3b4c5d6e7f8
Revises: c5d6e7f8a9b0
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trip_photos',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('trip_id', sa.BigInteger(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('uploaded_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('image_url', sa.Text(), nullable=False),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
    )

    op.add_column('trips', sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('trips', sa.Column('show_photos_publicly', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column(
        'trips',
        sa.Column('cover_photo_id', sa.Integer(), sa.ForeignKey('trip_photos.id', ondelete='SET NULL'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('trips', 'cover_photo_id')
    op.drop_column('trips', 'show_photos_publicly')
    op.drop_column('trips', 'is_public')
    op.drop_table('trip_photos')
