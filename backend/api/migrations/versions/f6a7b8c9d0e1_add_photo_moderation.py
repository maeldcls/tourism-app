"""add photo moderation fields to monument_images

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('monument_images', sa.Column('source', sa.String(length=20), nullable=False, server_default='api'))
    op.add_column('monument_images', sa.Column('status', sa.String(length=20), nullable=False, server_default='approved'))
    op.add_column('monument_images', sa.Column('submitted_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('monument_images', sa.Column('moderated_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('monument_images', sa.Column('moderated_at', sa.TIMESTAMP(), nullable=True))
    op.add_column('monument_images', sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True))


def downgrade() -> None:
    op.drop_column('monument_images', 'created_at')
    op.drop_column('monument_images', 'moderated_at')
    op.drop_column('monument_images', 'moderated_by')
    op.drop_column('monument_images', 'submitted_by')
    op.drop_column('monument_images', 'status')
    op.drop_column('monument_images', 'source')
