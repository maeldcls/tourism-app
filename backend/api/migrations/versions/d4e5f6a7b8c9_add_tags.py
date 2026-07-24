"""add tags

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-24 00:00:00.000000

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED_TAGS = [
    # positifs
    ("Magnifique", "😍", "positive"),
    ("Vue imprenable", "🌄", "positive"),
    ("Incontournable", "⭐", "positive"),
    ("Bien entretenu", "✨", "positive"),
    ("Calme et paisible", "🕊️", "positive"),
    ("Idéal en famille", "👨‍👩‍👧‍👦", "positive"),
    ("Riche en histoire", "📜", "positive"),
    # moyens / neutres
    ("Correct sans plus", "😐", "neutral"),
    ("À voir une fois", "👀", "neutral"),
    ("Petit mais sympa", "🤏", "neutral"),
    ("Un peu touristique", "📸", "neutral"),
    ("Accès difficile", "🥾", "neutral"),
    ("Signalétique insuffisante", "🧭", "neutral"),
    # négatifs
    ("Trop de monde", "🥵", "negative"),
    ("Cher pour ce que c'est", "💸", "negative"),
    ("Mal entretenu", "🧹", "negative"),
    ("Bruyant", "🔊", "negative"),
    ("Sale / détritus", "🗑️", "negative"),
    ("Peu accessible PMR", "♿", "negative"),
    ("Décevant", "👎", "negative"),
]


def upgrade() -> None:
    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('label', sa.String(length=100), nullable=False, unique=True),
        sa.Column('emoji', sa.String(length=10), nullable=False),
        sa.Column('sentiment', sa.String(length=20), nullable=False, server_default='neutral'),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
    )

    op.create_table(
        'monument_tags',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('monument_id', sa.BigInteger(), sa.ForeignKey('monuments.id'), nullable=False),
        sa.Column('tag_id', sa.BigInteger(), sa.ForeignKey('tags.id'), nullable=False),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=True),
    )
    op.create_index('ix_monument_tags_monument_id', 'monument_tags', ['monument_id'])
    op.create_index('ix_monument_tags_user_monument', 'monument_tags', ['user_id', 'monument_id'])

    tags_table = sa.table(
        'tags',
        sa.column('label', sa.String),
        sa.column('emoji', sa.String),
        sa.column('sentiment', sa.String),
        sa.column('created_at', sa.TIMESTAMP),
    )
    now = datetime.utcnow()
    op.bulk_insert(tags_table, [
        {"label": label, "emoji": emoji, "sentiment": sentiment, "created_at": now}
        for label, emoji, sentiment in SEED_TAGS
    ])


def downgrade() -> None:
    op.drop_index('ix_monument_tags_user_monument', table_name='monument_tags')
    op.drop_index('ix_monument_tags_monument_id', table_name='monument_tags')
    op.drop_table('monument_tags')
    op.drop_table('tags')
