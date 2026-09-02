"""add custom point photos, public visibility and hide-others preference

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('custom_points', sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('hide_others_public_points', sa.Boolean(), nullable=False, server_default='false'))

    op.create_table(
        'custom_point_images',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('custom_point_id', sa.Integer(), sa.ForeignKey('custom_points.id', ondelete='CASCADE'), nullable=False),
        sa.Column('image_url', sa.Text(), nullable=False),
        sa.Column('submitted_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('custom_point_images')
    op.drop_column('users', 'hide_others_public_points')
    op.drop_column('custom_points', 'is_public')
