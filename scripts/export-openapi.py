from pathlib import Path
import sys
import json

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))
from app.main import app

target = root / ".local-data" / "openapi.json"
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(app.openapi(), ensure_ascii=False), encoding="utf-8")
print("OpenAPI schema exported")
