"""
Vercel用エントリーポイント
"""

from main import app

# Vercel用のハンドラー
def handler(request):
    return app(request)

# 直接実行時の処理
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)