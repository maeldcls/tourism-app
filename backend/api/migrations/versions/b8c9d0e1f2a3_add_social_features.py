"""add social features: avatar/is_public/friend_code on users, friendships, trip_collaborators

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-28 00:00:00.000000

"""
import secrets
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_CODE_LENGTH = 8


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_url', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('users', sa.Column('friend_code', sa.String(length=12), nullable=True))

    # Backfill un code unique pour les utilisateurs existants avant de rendre la colonne NOT NULL.
    connection = op.get_bind()
    users = connection.execute(sa.text('SELECT id FROM users')).fetchall()
    used_codes = set()
    for (user_id,) in users:
        code = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))
        while code in used_codes:
            code = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))
        used_codes.add(code)
        connection.execute(
            sa.text('UPDATE users SET friend_code = :code WHERE id = :user_id'),
            {"code": code, "user_id": user_id},
        )

    op.alter_column('users', 'friend_code', nullable=False)
    op.create_unique_constraint('uq_users_friend_code', 'users', ['friend_code'])
    op.create_index('ix_users_friend_code', 'users', ['friend_code'])

    op.create_table(
        'friendships',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('requester_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('addressee_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
        sa.Column('responded_at', sa.TIMESTAMP(), nullable=True),
        sa.UniqueConstraint('requester_id', 'addressee_id', name='uq_friendship_pair'),
    )
    op.create_index('ix_friendships_requester_id', 'friendships', ['requester_id'])
    op.create_index('ix_friendships_addressee_id', 'friendships', ['addressee_id'])

    op.create_table(
        'trip_collaborators',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('trip_id', sa.BigInteger(), sa.ForeignKey('trips.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='read'),
        sa.Column('invited_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.func.now(), nullable=True),
        sa.UniqueConstraint('trip_id', 'user_id', name='uq_trip_collaborator'),
    )
    op.create_index('ix_trip_collaborators_trip_id', 'trip_collaborators', ['trip_id'])
    op.create_index('ix_trip_collaborators_user_id', 'trip_collaborators', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_trip_collaborators_user_id', table_name='trip_collaborators')
    op.drop_index('ix_trip_collaborators_trip_id', table_name='trip_collaborators')
    op.drop_table('trip_collaborators')

    op.drop_index('ix_friendships_addressee_id', table_name='friendships')
    op.drop_index('ix_friendships_requester_id', table_name='friendships')
    op.drop_table('friendships')

    op.drop_index('ix_users_friend_code', table_name='users')
    op.drop_constraint('uq_users_friend_code', 'users', type_='unique')
    op.drop_column('users', 'friend_code')
    op.drop_column('users', 'is_public')
    op.drop_column('users', 'avatar_url')
