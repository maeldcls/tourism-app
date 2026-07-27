"""add custom points and icon/color/is_hidden overrides

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trip_monuments', sa.Column('icon', sa.String(length=50), nullable=True))
    op.add_column('trip_monuments', sa.Column('color', sa.String(length=20), nullable=True))
    op.add_column('trip_monuments', sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        'custom_points',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('trip_id', sa.BigInteger(), sa.ForeignKey('trips.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('icon', sa.String(length=50), nullable=False, server_default='pin'),
        sa.Column('color', sa.String(length=20), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('order', sa.BigInteger(), server_default='0'),
        sa.Column('day', sa.Integer(), nullable=True),
        sa.Column('is_visited', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
    )
    op.create_index('ix_custom_points_user_id', 'custom_points', ['user_id'])
    op.create_index('ix_custom_points_trip_id', 'custom_points', ['trip_id'])


def downgrade() -> None:
    op.drop_index('ix_custom_points_trip_id', table_name='custom_points')
    op.drop_index('ix_custom_points_user_id', table_name='custom_points')
    op.drop_table('custom_points')

    op.drop_column('trip_monuments', 'is_hidden')
    op.drop_column('trip_monuments', 'color')
    op.drop_column('trip_monuments', 'icon')
