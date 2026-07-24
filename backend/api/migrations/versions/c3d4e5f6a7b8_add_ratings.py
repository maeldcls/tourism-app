"""add ratings

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ratings',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('monument_id', sa.BigInteger(), sa.ForeignKey('monuments.id'), nullable=False),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('is_positive', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True),
    )
    op.create_index('ix_ratings_monument_id', 'ratings', ['monument_id'])
    op.create_index('ix_ratings_user_monument', 'ratings', ['user_id', 'monument_id'])


def downgrade() -> None:
    op.drop_index('ix_ratings_user_monument', table_name='ratings')
    op.drop_index('ix_ratings_monument_id', table_name='ratings')
    op.drop_table('ratings')
