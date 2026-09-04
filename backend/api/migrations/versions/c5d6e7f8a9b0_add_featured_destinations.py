"""add featured destinations (home page admin curation)

Revision ID: c5d6e7f8a9b0
Revises: f2a3b4c5d6e7
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'featured_destinations',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('country', sa.String(length=255), nullable=True),
        sa.Column('tagline', sa.String(length=500), nullable=True),
        sa.Column('cover_image_url', sa.Text(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
    )

    op.create_table(
        'featured_destination_monuments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('featured_destination_id', sa.BigInteger(), sa.ForeignKey('featured_destinations.id'), nullable=False),
        sa.Column('monument_id', sa.BigInteger(), sa.ForeignKey('monuments.id'), nullable=False),
        sa.Column('added_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
        sa.UniqueConstraint('featured_destination_id', 'monument_id', name='uq_featured_dest_monument'),
    )


def downgrade() -> None:
    op.drop_table('featured_destination_monuments')
    op.drop_table('featured_destinations')
