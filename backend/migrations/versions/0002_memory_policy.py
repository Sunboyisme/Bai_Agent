"""Memory policy, provenance and revision-safe undo. Existing memories stay unchanged."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade():
    op.add_column(
        "settings",
        sa.Column("memory_mode", sa.String(20), nullable=False, server_default="auto"),
    )
    for column in (
        sa.Column("evidence", sa.Text(), nullable=False, server_default=""),
        sa.Column("review_reason", sa.String(300), nullable=False, server_default=""),
        sa.Column("source_conversation_id", sa.String(36), nullable=True),
        sa.Column("source_message_id", sa.String(36), nullable=True),
        sa.Column("replaces_id", sa.String(36), nullable=True),
        sa.Column("replaces_revision", sa.Integer(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
    ):
        op.add_column("memories", column)
    op.create_table(
        "memory_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("memory_id", sa.String(36), nullable=False),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("source_message_id", sa.String(36), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=False),
        sa.Column("undone", sa.Boolean(), nullable=False),
    )
    for field in ("profile_id", "memory_id", "run_id", "source_message_id"):
        op.create_index(f"ix_memory_changes_{field}", "memory_changes", [field])


def downgrade():
    op.drop_table("memory_changes")
    with op.batch_alter_table("memories") as batch:
        for field in (
            "evidence",
            "review_reason",
            "source_conversation_id",
            "source_message_id",
            "replaces_id",
            "replaces_revision",
            "revision",
        ):
            batch.drop_column(field)
    with op.batch_alter_table("settings") as batch:
        batch.drop_column("memory_mode")
