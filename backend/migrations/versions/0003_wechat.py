"""Opt-in local WeChat channel and durable message delivery."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"


def upgrade():
    op.create_table(
        "wechat_state",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_table(
        "wechat_inbox",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("run_id", sa.String(36), nullable=False),
    )
    op.create_table(
        "wechat_deliveries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("source_key", sa.Text(), nullable=False, unique=True),
        sa.Column("account_id", sa.Text(), nullable=False),
        sa.Column("notification_id", sa.String(36), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("error", sa.Text(), nullable=False),
    )
    op.create_index(
        "ix_wechat_deliveries_profile_id", "wechat_deliveries", ["profile_id"]
    )


def downgrade():
    op.drop_table("wechat_deliveries")
    op.drop_table("wechat_inbox")
    op.drop_table("wechat_state")
