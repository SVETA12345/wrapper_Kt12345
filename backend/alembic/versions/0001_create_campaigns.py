"""create campaigns table

Revision ID: 0001
Revises:
Create Date: 2026-11-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("keitaro_id", sa.Integer(), unique=True, index=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("alias", sa.String(255), nullable=False),
        sa.Column("geo_code", sa.String(10), nullable=True),
        sa.Column("domain_id", sa.Integer(), nullable=True),
        sa.Column("domain_name", sa.String(255), nullable=True),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("group_name", sa.String(255), nullable=True),
        sa.Column("traffic_source_id", sa.Integer(), nullable=True),
        sa.Column("traffic_source_name", sa.String(255), nullable=True),
        sa.Column("initial_offer_id", sa.Integer(), nullable=True),
        sa.Column("google_stream_id", sa.Integer(), nullable=True),
        sa.Column("offers_stream_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("campaigns")
