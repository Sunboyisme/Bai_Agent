from pathlib import Path
import os
import secrets
import hashlib

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("BAI_DATA_DIR", ROOT / ".local-data" / "dev")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
ATTACHMENTS_DIR = DATA_DIR / "attachments"
ATTACHMENTS_DIR.mkdir(exist_ok=True)
TOKEN_PATH = DATA_DIR / "auth-token"
if not TOKEN_PATH.exists():
    TOKEN_PATH.write_text(secrets.token_urlsafe(40), encoding="utf-8")
AUTH_TOKEN = TOKEN_PATH.read_text(encoding="utf-8").strip()
DATABASE_URL = os.getenv(
    "BAI_DATABASE_URL", f"sqlite:///{(DATA_DIR / 'bai.sqlite').as_posix()}"
)
VAULT_SERVICE = "BaiAgent-" + hashlib.sha256(str(DATA_DIR).encode()).hexdigest()[:16]
PROFILE_ID = "local"


def secret_get(name: str) -> str:
    # Environment overrides are useful for isolated tests and future server deployments.
    override = os.getenv(f"BAI_{name.upper()}_API_KEY")
    if override:
        return override
    import keyring

    return keyring.get_password(VAULT_SERVICE, name) or ""


def secret_set(name: str, value: str | None) -> None:
    if value is None:
        return
    import keyring

    if value.strip():
        keyring.set_password(VAULT_SERVICE, name, value.strip())
    else:
        try:
            keyring.delete_password(VAULT_SERVICE, name)
        except keyring.errors.PasswordDeleteError:
            pass
