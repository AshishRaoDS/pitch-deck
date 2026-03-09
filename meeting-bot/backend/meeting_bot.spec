# -*- mode: python ; coding: utf-8 -*-
import glob
import os
import PIL
from PyInstaller.utils.hooks import collect_all

datas = []

# Explicitly collect PIL/Pillow .so extensions (collect_all misses them on Python 3.14)
_pil_dir = os.path.dirname(PIL.__file__)
binaries = [(so, 'PIL') for so in glob.glob(os.path.join(_pil_dir, '*.so'))]
hiddenimports = [
    # uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # anyio
    "anyio",
    "anyio._backends._asyncio",
    "anyio._backends._trio",
    # httpx / httpcore
    "httpx",
    "httpcore",
    # starlette
    "starlette.routing",
    "starlette.middleware",
    "starlette.middleware.cors",
    # email (used by httpx)
    "email.mime.text",
    "email.mime.multipart",
]

for pkg in ["fastapi", "uvicorn", "pydantic", "pydantic_settings", "pydantic_core",
            "openai", "pptx", "duckduckgo_search", "pypdf", "starlette", "anyio",
            "httpx", "httpcore", "PIL", "lxml", "primp", "python_multipart",
            "sniffio", "distro", "dotenv", "annotated_types", "idna", "click",
            "typing_extensions", "typing_inspection"]:
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["run_server.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "torch", "PIL",
              "IPython", "jupyter"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="meeting-bot-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="meeting-bot-server",
)
