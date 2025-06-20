"""
Vercel用 PDF File Renamer Web API
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import json
import tempfile
import logging
from pathlib import Path
from typing import Dict, Any
import zipfile
import io

# 相対インポート用にパスを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.dify_client import DifyClient
from src.file_renamer import FileRenamer

app = FastAPI(
    title="PDF File Renamer API",
    description="PDFファイルをDify APIで処理して自動リネームするAPIです",
    version="1.0.0"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# グローバル設定
CONFIG = {
    "app": {
        "name": "PDF File Renamer",
        "version": "1.0.0",
        "debug": False
    },
    "dify": {
        "api_url": os.getenv("DIFY_API_URL", "https://api.dify.ai/v1/workflows/run"),
        "api_key": os.getenv("DIFY_API_KEY"),
        "upload_url": "https://api.dify.ai/v1/files/upload",
        "user_id": "pdf-renamer-web-user"
    },
    "file_processing": {
        "max_file_size_mb": 15,
        "allowed_extensions": [".pdf", ".PDF"]
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

@app.get("/")
async def root():
    """API情報を返す"""
    return {
        "name": "PDF File Renamer API",
        "version": "1.0.0",
        "description": "PDFファイルをDify APIで処理して自動リネームします",
        "endpoints": {
            "/process": "POST - PDFファイルを処理してリネーム",
            "/health": "GET - ヘルスチェック"
        }
    }

@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    try:
        # Dify API接続確認
        dify_client = DifyClient(CONFIG)
        
        return {
            "status": "healthy",
            "dify_api": "connected",
            "timestamp": "2025-06-20"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": "2025-06-20"
        }

@app.post("/process")
async def process_pdf(file: UploadFile = File(...)):
    """
    PDFファイルを処理してリネーム
    """
    try:
        # ファイル検証
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="PDFファイルのみ対応しています")
        
        if file.size > CONFIG["file_processing"]["max_file_size_mb"] * 1024 * 1024:
            raise HTTPException(status_code=400, detail="ファイルサイズが大きすぎます")
        
        # 一時ファイルに保存
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        try:
            # PDFを処理
            dify_client = DifyClient(CONFIG)
            file_renamer = FileRenamer(CONFIG)
            
            # Difyで情報抽出
            result = dify_client.process_pdf(temp_file_path)
            
            if not result:
                raise HTTPException(status_code=500, detail="Dify処理に失敗しました")
            
            # 情報を抽出
            extracted_info = dify_client.extract_info_from_result(result)
            extracted_info['original_filename'] = file.filename
            
            # 新しいファイル名を生成
            new_filename = file_renamer.generate_filename(extracted_info, file.filename)
            
            # ファイル内容を読み込み
            with open(temp_file_path, 'rb') as processed_file:
                file_content = processed_file.read()
            
            return {
                "success": True,
                "original_filename": file.filename,
                "new_filename": new_filename,
                "extracted_info": {
                    "issuer": extracted_info.get('issuer', ''),
                    "document_type": extracted_info.get('document_type', ''),
                    "date": extracted_info.get('date', '')
                },
                "download_url": f"/download/{new_filename}",
                "file_size": len(file_content)
            }
            
        finally:
            # 一時ファイルを削除
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"処理エラー: {str(e)}")

@app.post("/process-multiple")
async def process_multiple_pdfs(files: list[UploadFile] = File(...)):
    """
    複数のPDFファイルを一括処理
    """
    try:
        if len(files) > 10:
            raise HTTPException(status_code=400, detail="一度に処理できるファイルは10個までです")
        
        results = []
        dify_client = DifyClient(CONFIG)
        file_renamer = FileRenamer(CONFIG)
        
        for file in files:
            try:
                # ファイル検証
                if not file.filename.lower().endswith('.pdf'):
                    continue
                
                # 一時ファイルに保存
                with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                    content = await file.read()
                    temp_file.write(content)
                    temp_file_path = temp_file.name
                
                try:
                    # Difyで情報抽出
                    result = dify_client.process_pdf(temp_file_path)
                    
                    if result:
                        # 情報を抽出
                        extracted_info = dify_client.extract_info_from_result(result)
                        extracted_info['original_filename'] = file.filename
                        
                        # 新しいファイル名を生成
                        new_filename = file_renamer.generate_filename(extracted_info, file.filename)
                        
                        results.append({
                            "success": True,
                            "original_filename": file.filename,
                            "new_filename": new_filename,
                            "extracted_info": {
                                "issuer": extracted_info.get('issuer', ''),
                                "document_type": extracted_info.get('document_type', ''),
                                "date": extracted_info.get('date', '')
                            }
                        })
                    else:
                        results.append({
                            "success": False,
                            "original_filename": file.filename,
                            "error": "Dify処理に失敗しました"
                        })
                        
                finally:
                    # 一時ファイルを削除
                    if os.path.exists(temp_file_path):
                        os.unlink(temp_file_path)
                        
            except Exception as e:
                results.append({
                    "success": False,
                    "original_filename": file.filename,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "total_files": len(files),
            "processed_files": len([r for r in results if r["success"]]),
            "failed_files": len([r for r in results if not r["success"]]),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"一括処理エラー: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)