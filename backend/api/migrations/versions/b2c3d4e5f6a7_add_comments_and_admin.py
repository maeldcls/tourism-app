"""add comments and admin role

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        'comments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('monument_id', sa.BigInteger(), sa.ForeignKey('monuments.id'), nullable=False),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='visible'),
        sa.Column('ai_score', sa.Float(), nullable=True),
        sa.Column('ai_flagged_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('moderated_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('moderated_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
    )
    op.create_index('ix_comments_monument_status', 'comments', ['monument_id', 'status'])
    op.create_index('ix_comments_status', 'comments', ['status'])


def downgrade() -> None:
    op.drop_index('ix_comments_status', table_name='comments')
    op.drop_index('ix_comments_monument_status', table_name='comments')
    op.drop_table('comments')
    op.drop_column('users', 'is_admin')
