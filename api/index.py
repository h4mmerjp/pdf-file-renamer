"""
Vercel用 PDF File Renamer Web API
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import sys
import json
import tempfile
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import zipfile
import io
import traceback
import shutil
from datetime import datetime

# 環境変数を最初に読み込み
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# 相対インポート用にパスを追加
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

# srcモジュールのインポート（エラーハンドリング付き）
try:
    from src.dify_client import DifyClient
    from src.file_renamer import FileRenamer
    MODULES_AVAILABLE = True
except ImportError as e:
    logging.error(f"モジュールインポートエラー: {e}")
    DifyClient = None
    FileRenamer = None
    MODULES_AVAILABLE = False

app = FastAPI(
    title="PDF File Renamer API",
    description="PDFファイルをDify APIで処理して自動リネームするAPIです",
    version="1.2.0"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# グローバル設定（Vercel対応）
CONFIG = {
    "app": {
        "name": "PDF File Renamer",
        "version": "1.2.0",
        "debug": True
    },
    "dify": {
        "api_url": os.getenv("DIFY_API_URL", "https://api.dify.ai/v1/workflows/run"),
        "api_key": os.getenv("DIFY_API_KEY"),
        "upload_url": "https://api.dify.ai/v1/files/upload",
        "user_id": "pdf-renamer-web-user"
    },
    "file_processing": {
        "max_file_size_mb": 10,
        "allowed_extensions": [".pdf", ".PDF"],
        "input_folder": "/tmp/input_pdfs",
        "output_folder": "/tmp/downloads",
        "temp_folder": "/tmp/temp"
    },
    "naming_rules": {
        "pattern": "{date}_{issuer}_{document_type}",
        "date_format": "%Y%m%d",
        "max_filename_length": 255,
        "invalid_chars": ["<", ">", ":", "\"", "/", "\\", "|", "?", "*"],
        "replacement_char": "_",
        "use_japanese_names": True
    },
    "issuers": {
        "国民健康保険団体連合会": "国民健康保険団体連合会",
        "社会保険診療報酬支払基金": "社会保険診療報酬支払基金",
        "厚生労働省": "厚生労働省",
        "保険者": "保険者",
        "医療機関": "医療機関",
        "その他": "その他"
    },
    "document_types": {
        "診療報酬明細書": "診療報酬明細書",
        "医療費通知": "医療費通知",
        "保険証": "保険証",
        "診断書": "診断書",
        "処方箋": "処方箋",
        "返戻内訳書": "返戻内訳書",
        "増減点連絡書": "増減点連絡書",
        "過誤・再審査結果通知書": "過誤・再審査結果通知書",
        "保険過誤調整結果通知書": "保険過誤調整結果通知書",
        "資格確認結果連絡書": "資格確認結果連絡書",
        "当座口振込通知書": "当座口振込通知書",
        "その他": "その他"
    }
}

# ログ設定（Vercel対応）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# 必要なディレクトリを作成（Vercel対応）
def create_required_directories():
    """起動時に必要なディレクトリを作成"""
    required_dirs = [
        CONFIG["file_processing"]["output_folder"],
        CONFIG["file_processing"]["temp_folder"], 
        CONFIG["file_processing"]["input_folder"]
    ]
    
    for dir_path in required_dirs:
        try:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
            logger.info(f"ディレクトリ確認/作成: {dir_path}")
        except Exception as e:
            logger.warning(f"ディレクトリ作成エラー {dir_path}: {e}")

# 起動時にディレクトリを作成
create_required_directories()

class ProcessResult(BaseModel):
    success: bool
    original_filename: str
    new_filename: Optional[str] = None
    extracted_info: Optional[Dict[str, str]] = None
    error: Optional[str] = None

class MultipleProcessResult(BaseModel):
    success: bool
    total_files: int
    processed_files: int
    failed_files: int
    results: List[ProcessResult]

def validate_file(file: UploadFile) -> None:
    """ファイルのバリデーション"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="ファイル名が指定されていません")
    
    if not file.filename.lower().endswith(('.pdf', '.PDF')):
        raise HTTPException(
            status_code=400, 
            detail=f"PDFファイルのみ対応しています。アップロードされたファイル: {file.filename}"
        )

def get_disk_usage():
    """ディスク使用量を取得（Vercel対応）"""
    try:
        total, used, free = shutil.disk_usage("/tmp")
        return {
            "total_gb": round(total / (1024**3), 2),
            "free_gb": round(free / (1024**3), 2),
            "used_percent": round(used / total * 100, 2)
        }
    except Exception as e:
        logger.warning(f"ディスク使用量取得エラー: {e}")
        return {"total_gb": 0, "free_gb": 0, "used_percent": 0}

@app.get("/")
async def root():
    """ルートエンドポイント"""
    return {
        "name": "PDF File Renamer API",
        "version": "1.2.0",
        "description": "PDFファイルをDify APIで処理して自動リネームします",
        "status": "running",
        "environment": "vercel",
        "modules_available": MODULES_AVAILABLE,
        "timestamp": datetime.now().isoformat(),
        "endpoints": [
            "GET /api/health - ヘルスチェック",
            "POST /api/process - 単一ファイル処理",
            "POST /api/process-multiple - 複数ファイル処理",
            "GET /api/files - ファイル一覧",
            "GET /api/download/{filename} - ファイルダウンロード"
        ]
    }

@app.get("/api/health")
async def health_check():
    """ヘルスチェック"""
    try:
        env_status = {
            "DIFY_API_KEY": "set" if os.getenv('DIFY_API_KEY') else "missing",
            "DIFY_API_URL": "set" if os.getenv('DIFY_API_URL') else "missing"
        }
        
        dify_status = "unknown"
        if MODULES_AVAILABLE:
            try:
                if CONFIG["dify"]["api_key"]:
                    dify_client = DifyClient(CONFIG)
                    if hasattr(dify_client, 'test_connection') and callable(dify_client.test_connection):
                        if dify_client.test_connection():
                            dify_status = "connected"
                        else:
                            dify_status = "connection_failed"
                    else:
                        dify_status = "test_method_unavailable"
                else:
                    dify_status = "api_key_missing"
            except Exception as e:
                dify_status = f"error: {str(e)}"
                logger.error(f"Dify接続テストエラー: {e}")
        else:
            dify_status = "modules_not_available"
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "version": CONFIG["app"]["version"],
            "environment": "vercel",
            "modules_available": MODULES_AVAILABLE,
            "debug_mode": CONFIG["app"]["debug"],
            "dify_api": dify_status,
            "disk_space": get_disk_usage(),
            "environment_vars": env_status,
            "directories": {
                "output_folder": CONFIG["file_processing"]["output_folder"],
                "temp_folder": CONFIG["file_processing"]["temp_folder"],
                "input_folder": CONFIG["file_processing"]["input_folder"]
            },
            "sys_path": sys.path[:3]  # 最初の3つのパスを表示
        }
    except Exception as e:
        logger.error(f"ヘルスチェックエラー: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "modules_available": MODULES_AVAILABLE
        }

@app.post("/api/process", response_model=ProcessResult)
async def process_pdf(file: UploadFile = File(...)):
    """単一PDFファイルを処理してリネーム"""
    logger.info(f"単一ファイル処理開始: {file.filename}")
    
    if not MODULES_AVAILABLE:
        return ProcessResult(
            success=False,
            original_filename=file.filename,
            error="必要なモジュール（src.dify_client, src.file_renamer）が見つかりません。"
        )
    
    try:
        validate_file(file)
        
        temp_dir = Path(CONFIG["file_processing"]["temp_folder"])
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', dir=temp_dir) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        logger.info(f"一時ファイル作成: {temp_file_path} ({len(content)} bytes)")
        
        try:
            if not CONFIG["dify"]["api_key"]:
                return ProcessResult(
                    success=False,
                    original_filename=file.filename,
                    error="Dify APIキーが設定されていません。環境変数を確認してください。"
                )
            
            dify_client = DifyClient(CONFIG)
            file_renamer = FileRenamer(CONFIG)
            
            logger.info("Difyで情報抽出開始")
            result = dify_client.process_pdf(temp_file_path)
            
            if not result:
                logger.error("Dify処理に失敗")
                return ProcessResult(
                    success=False,
                    original_filename=file.filename,
                    error="Dify処理に失敗しました。APIキーとワークフロー設定を確認してください。"
                )
            
            extracted_info = dify_client.extract_info_from_result(result)
            extracted_info['original_filename'] = file.filename
            
            logger.info(f"抽出された情報: {extracted_info}")
            
            new_filename = file_renamer.generate_filename(extracted_info, file.filename)
            
            output_dir = Path(CONFIG["file_processing"]["output_folder"])
            output_path = output_dir / new_filename
            
            counter = 1
            original_output_path = output_path
            while output_path.exists():
                name_parts = original_output_path.stem, counter, original_output_path.suffix
                output_path = output_dir / f"{name_parts[0]}_{name_parts[1]:02d}{name_parts[2]}"
                counter += 1
            
            shutil.copy2(temp_file_path, output_path)
            
            logger.info(f"処理完了: {file.filename} -> {output_path.name}")
            
            return ProcessResult(
                success=True,
                original_filename=file.filename,
                new_filename=output_path.name,
                extracted_info={
                    "issuer": extracted_info.get('issuer', ''),
                    "document_type": extracted_info.get('document_type', ''),
                    "date": extracted_info.get('date', '')
                }
            )
            
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                logger.info(f"一時ファイル削除: {temp_file_path}")
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"予期しないエラー: {str(e)}")
        logger.error(traceback.format_exc())
        return ProcessResult(
            success=False,
            original_filename=file.filename if file.filename else "unknown",
            error=f"処理エラー: {str(e)}"
        )

@app.get("/api/files")
async def list_files():
    """ダウンロード可能なファイル一覧を取得"""
    try:
        output_dir = Path(CONFIG["file_processing"]["output_folder"])
        
        if not output_dir.exists():
            return {
                "files": [],
                "total_count": 0,
                "total_size_mb": 0,
                "message": "出力ディレクトリが存在しません"
            }
        
        pdf_files = list(output_dir.glob("*.pdf"))
        
        file_list = []
        for pdf_file in pdf_files:
            try:
                stat = pdf_file.stat()
                file_list.append({
                    "filename": pdf_file.name,
                    "size": stat.st_size,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created": stat.st_ctime,
                    "download_url": f"/api/download/{pdf_file.name}"
                })
            except Exception as e:
                logger.warning(f"ファイル情報取得エラー {pdf_file.name}: {e}")
        
        file_list.sort(key=lambda x: x["created"], reverse=True)
        
        return {
            "files": file_list,
            "total_count": len(file_list),
            "total_size_mb": round(sum(f["size"] for f in file_list) / (1024 * 1024), 2) if file_list else 0
        }
        
    except Exception as e:
        logger.error(f"ファイル一覧取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ファイル一覧取得エラー: {str(e)}")

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTPExceptionのカスタムハンドラー"""
    logger.error(f"HTTP Exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """一般的な例外のハンドラー"""
    logger.error(f"Unhandled Exception: {str(exc)}")
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            "error": "内部サーバーエラーが発生しました",
            "details": str(exc) if CONFIG["app"]["debug"] else "サーバー管理者に連絡してください",
            "status_code": 500,
            "timestamp": datetime.now().isoformat()
        }
    )

# Vercel用のメインハンドラー
def handler(request):
    """Vercel用のリクエストハンドラー"""
    return app(request)

if __name__ == "__main__":
    import uvicorn
    logger.info("PDF File Renamer API を起動中...")
    uvicorn.run(app, host="0.0.0.0", port=8000)