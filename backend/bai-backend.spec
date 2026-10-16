# PyInstaller onedir bundle: Python, dependencies and migration sources only.
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

backend = Path(SPECPATH)
datas = [(str(backend / "migrations"), "migrations"), (str(backend / "alembic.ini"), ".")]
hiddenimports = []
for package in ("uvicorn", "langchain", "langchain_core", "langchain_openai", "langgraph", "keyring.backends", "tiktoken_ext"):
    hiddenimports += collect_submodules(package)
for package in ("langchain_core", "tzdata", "certifi"):
    datas += collect_data_files(package)
for distribution in ("langchain", "langchain-core", "langchain-openai", "langgraph", "langgraph-checkpoint", "langgraph-checkpoint-sqlite", "langgraph-prebuilt", "keyring", "APScheduler", "tiktoken"):
    datas += copy_metadata(distribution)

a = Analysis(
    [str(backend / "desktop_backend.py")], pathex=[str(backend)],
    binaries=[], datas=datas, hiddenimports=hiddenimports,
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=["pytest", "PyInstaller", "tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="bai-backend",
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          console=True, icon=str(backend.parent / "src-tauri/icons/icon.ico"))
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="bai-backend")
