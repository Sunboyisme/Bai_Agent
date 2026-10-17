"""Provider profiles and a per-run model snapshot; no credentials in SQLite."""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade():
    op.add_column("settings", sa.Column("model_providers", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("settings", sa.Column("default_provider", sa.String(30), nullable=False, server_default="custom"))
    op.add_column("runs", sa.Column("model_config", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("messages", sa.Column("provider_context", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("messages", "provider_context")
    op.drop_column("runs", "model_config")
    op.drop_column("settings", "default_provider")
    op.drop_column("settings", "model_providers")
