"""
Vercel用 PDF File Renamer API（最小版）
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from datetime import datetime

# FastAPIアプリ作成
app = FastAPI(title="PDF File Renamer API", version="1.0.0")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.get("/")
async def root():
    """ルートエンドポイント"""
    return {
        "name": "PDF File Renamer API",
        "version": "1.0.0",
        "status": "running",
        "environment": "vercel",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/health")
async def health_check():
    """ヘルスチェック"""
    try:
        env_vars = {
            "DIFY_API_KEY": "set" if os.getenv('DIFY_API_KEY') else "missing",
            "DIFY_API_URL": "set" if os.getenv('DIFY_API_URL') else "missing"
        }
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0",
            "environment": "vercel",
            "environment_vars": env_vars,
            "python_version": os.sys.version,
            "working_directory": os.getcwd()
        }
    except Exception as e:
        logger.error(f"ヘルスチェックエラー: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.get("/api/test")
async def test_endpoint():
    """テスト用エンドポイント"""
    return {
        "message": "テスト成功",
        "timestamp": datetime.now().isoformat(),
        "environment": "vercel"
    }

# Vercel用のメインハンドラー
def handler(event, context):
    """Vercel用のイベントハンドラー"""
    return app

# 標準的なASGIハンドラー
app_handler = app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)