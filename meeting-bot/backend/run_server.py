import os
import sys

if hasattr(sys, "_MEIPASS"):
    sys.path.insert(0, sys._MEIPASS)

if __name__ == "__main__":
    import uvicorn
    from app.main import app as fastapi_app

    uvicorn.run(
        fastapi_app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        log_level="info",
    )
