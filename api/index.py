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
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from src.dify_client import DifyClient
    from src.file_renamer import FileRenamer
except ImportError as e:
    logging.error(f"モジュールインポートエラー: {e}")
    # Vercel環境での代替処理
    DifyClient = None
    FileRenamer = None

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
    },
    "logging": {
        "level": "INFO",
        "file": "/tmp/app.log"
    }
}

# ログ設定（Vercel対応）
def setup_logging():
    """ログ設定を初期化（Vercel対応）"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler()
        ]
    )
    return logging.getLogger(__name__)

logger = setup_logging()

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

@app.get("/api/")
async def api_root():
    """API情報を返す（Vercel用）"""
    return {
        "name": "PDF File Renamer API",
        "version": "1.2.0",
        "description": "PDFファイルをDify APIで処理して自動リネームします",
        "status": "running",
        "environment": "vercel",
        "timestamp": datetime.now().isoformat(),
        "endpoints": {
            "/api/process": "POST - 単一PDFファイルを処理してリネーム",
            "/api/process-multiple": "POST - 複数PDFファイルを一括処理",
            "/api/health": "GET - ヘルスチェック",
            "/api/download/{filename}": "GET - ファイルダウンロード",
            "/api/files": "GET - ファイル一覧"
        },
        "supported_formats": ["PDF"],
        "max_file_size_mb": CONFIG["file_processing"]["max_file_size_mb"]
    }

@app.get("/")
async def root():
    """API情報を返す"""
    return {
        "name": "PDF File Renamer API",
        "version": "1.2.0",
        "description": "PDFファイルをDify APIで処理して自動リネームします",
        "status": "running",
        "environment": "vercel",
        "endpoints": {
            "/api/process": "POST - 単一PDFファイルを処理してリネーム",
            "/api/process-multiple": "POST - 複数PDFファイルを一括処理",
            "/api/health": "GET - ヘルスチェック",
            "/api/download/{filename}": "GET - ファイルダウンロード",
            "/api/files": "GET - ファイル一覧"
        },
        "supported_formats": ["PDF"],
        "max_file_size_mb": CONFIG["file_processing"]["max_file_size_mb"]
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
        try:
            if CONFIG["dify"]["api_key"] and DifyClient:
                dify_client = DifyClient(CONFIG)
                if dify_client.test_connection():
                    dify_status = "connected"
                else:
                    dify_status = "connection_failed"
            else:
                dify_status = "api_key_missing" if not CONFIG["dify"]["api_key"] else "module_missing"
        except Exception as e:
            dify_status = f"error: {str(e)}"
            logger.error(f"Dify接続テストエラー: {e}")
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "version": CONFIG["app"]["version"],
            "environment": "vercel",
            "debug_mode": CONFIG["app"]["debug"],
            "dify_api": dify_status,
            "disk_space": get_disk_usage(),
            "environment_vars": env_status,
            "directories": {
                "output_folder": CONFIG["file_processing"]["output_folder"],
                "temp_folder": CONFIG["file_processing"]["temp_folder"],
                "input_folder": CONFIG["file_processing"]["input_folder"]
            }
        }
    except Exception as e:
        logger.error(f"ヘルスチェックエラー: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.post("/api/process", response_model=ProcessResult)
async def process_pdf(file: UploadFile = File(...)):
    """単一PDFファイルを処理してリネーム"""
    logger.info(f"単一ファイル処理開始: {file.filename}")
    
    if not DifyClient or not FileRenamer:
        raise HTTPException(
            status_code=500, 
            detail="必要なモジュールが見つかりません。デプロイ設定を確認してください。"
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
                raise HTTPException(
                    status_code=500, 
                    detail="Dify APIキーが設定されていません。環境変数を確認してください。"
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

@app.post("/api/process-multiple", response_model=MultipleProcessResult)
async def process_multiple_pdfs(files: List[UploadFile] = File(...)):
    """複数のPDFファイルを一括処理"""
    logger.info(f"複数ファイル処理開始: {len(files)}個のファイル")
    
    if not DifyClient or not FileRenamer:
        raise HTTPException(
            status_code=500, 
            detail="必要なモジュールが見つかりません。デプロイ設定を確認してください。"
        )
    
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="一度に処理できるファイルは10個までです")
    
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="処理するファイルが指定されていません")
    
    results = []
    
    try:
        if not CONFIG["dify"]["api_key"]:
            raise HTTPException(
                status_code=500, 
                detail="Dify APIキーが設定されていません。環境変数を確認してください。"
            )
        
        dify_client = DifyClient(CONFIG)
        file_renamer = FileRenamer(CONFIG)
    except Exception as e:
        logger.error(f"クライアント初期化エラー: {e}")
        raise HTTPException(status_code=500, detail=f"サーバー初期化エラー: {str(e)}")
    
    for i, file in enumerate(files):
        logger.info(f"ファイル処理 ({i+1}/{len(files)}): {file.filename}")
        
        file_result = ProcessResult(
            success=False,
            original_filename=file.filename if file.filename else f"file_{i+1}",
            error="未処理"
        )
        
        try:
            validate_file(file)
            
            temp_dir = Path(CONFIG["file_processing"]["temp_folder"])
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', dir=temp_dir) as temp_file:
                content = await file.read()
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            try:
                result = dify_client.process_pdf(temp_file_path)
                
                if result:
                    extracted_info = dify_client.extract_info_from_result(result)
                    extracted_info['original_filename'] = file.filename
                    
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
                    
                    file_result = ProcessResult(
                        success=True,
                        original_filename=file.filename,
                        new_filename=output_path.name,
                        extracted_info={
                            "issuer": extracted_info.get('issuer', ''),
                            "document_type": extracted_info.get('document_type', ''),
                            "date": extracted_info.get('date', '')
                        }
                    )
                else:
                    file_result.error = "Dify処理に失敗しました"
                    
            finally:
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                        
        except HTTPException as e:
            file_result.error = e.detail
        except Exception as e:
            logger.error(f"ファイル処理エラー ({file.filename}): {str(e)}")
            file_result.error = f"処理エラー: {str(e)}"
        
        results.append(file_result)
    
    successful_count = len([r for r in results if r.success])
    failed_count = len(results) - successful_count
    
    logger.info(f"複数ファイル処理完了: {successful_count}/{len(results)} 成功")
    
    return MultipleProcessResult(
        success=True,
        total_files=len(files),
        processed_files=successful_count,
        failed_files=failed_count,
        results=results
    )

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """リネームされたファイルをダウンロード"""
    try:
        output_dir = Path(CONFIG["file_processing"]["output_folder"])
        file_path = output_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="ファイルが見つかりません")
        
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="指定されたパスはファイルではありません")
        
        if not str(file_path.resolve()).startswith(str(output_dir.resolve())):
            raise HTTPException(status_code=403, detail="アクセスが拒否されました")
        
        logger.info(f"ファイルダウンロード: {filename}")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type='application/pdf'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ダウンロードエラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ダウンロードエラー: {str(e)}")

@app.get("/api/download-all")
async def download_all_files():
    """すべてのリネームされたファイルをZIPでダウンロード"""
    try:
        output_dir = Path(CONFIG["file_processing"]["output_folder"])
        pdf_files = list(output_dir.glob("*.pdf"))
        
        if not pdf_files:
            raise HTTPException(status_code=404, detail="ダウンロード可能なファイルがありません")
        
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for pdf_file in pdf_files:
                zip_file.write(pdf_file, pdf_file.name)
        
        zip_buffer.seek(0)
        
        logger.info(f"一括ダウンロード: {len(pdf_files)}個のファイル")
        
        def iter_zip():
            yield zip_buffer.getvalue()
        
        return StreamingResponse(
            iter_zip(),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=renamed_pdfs.zip"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"一括ダウンロードエラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"一括ダウンロードエラー: {str(e)}")

@app.get("/api/files")
async def list_files():
    """ダウンロード可能なファイル一覧を取得"""
    try:
        output_dir = Path(CONFIG["file_processing"]["output_folder"])
        pdf_files = list(output_dir.glob("*.pdf"))
        
        file_list = []
        for pdf_file in pdf_files:
            stat = pdf_file.stat()
            file_list.append({
                "filename": pdf_file.name,
                "size": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "created": stat.st_ctime,
                "download_url": f"/api/download/{pdf_file.name}"
            })
        
        file_list.sort(key=lambda x: x["created"], reverse=True)
        
        return {
            "files": file_list,
            "total_count": len(file_list),
            "total_size_mb": round(sum(f["size"] for f in file_list) / (1024 * 1024), 2)
        }
        
    except Exception as e:
        logger.error(f"ファイル一覧取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"ファイル一覧取得エラー: {str(e)}")

@app.delete("/api/files/{filename}")
async def delete_file(filename: str):
    """指定されたファイルを削除"""
    try:
        output_dir = Path(CONFIG["file_processing"]["output_folder"])
        file_path = output_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="ファイルが見つかりません")
        
        if not str(file_path.resolve()).startswith(str(output_dir.resolve())):
            raise HTTPException(status_code=403, detail="アクセスが拒否されました")
        
        file_path.unlink()
        logger.info(f"ファイル削除: {filename}")
        
        return {"success": True, "message": f"{filename} を削除しました"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ファイル削除エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"削除エラー: {str(e)}")

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

# Vercel用のハンドラー
def handler(request):
    """Vercel用のリクエストハンドラー"""
    return app(request)

if __name__ == "__main__":
    import uvicorn
    logger.info("PDF File Renamer API を起動中...")
    uvicorn.run(app, host="0.0.0.0", port=8000)