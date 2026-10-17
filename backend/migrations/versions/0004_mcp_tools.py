"""MCP connections, discovered tools and explicit tool switches."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"


def upgrade():
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("transport", sa.String(30), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("tested_at", sa.String(40), nullable=True),
        sa.UniqueConstraint("profile_id", "name"),
    )
    op.create_index("ix_mcp_servers_profile_id", "mcp_servers", ["profile_id"])
    op.create_table(
        "mcp_tools",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "server_id",
            sa.String(36),
            sa.ForeignKey("mcp_servers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("remote_name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("input_schema", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("present", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_mcp_tools_server_id", "mcp_tools", ["server_id"])
    op.create_table(
        "builtin_tool_states",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
    )


def downgrade():
    op.drop_table("builtin_tool_states")
    op.drop_table("mcp_tools")
    op.drop_table("mcp_servers")
