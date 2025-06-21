"""
Dify APIクライアント（修正版）
"""

import os
import json
import requests
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class DifyClient:
    def __init__(self, config: Dict[str, Any]):
        # 設定から取得
        self.api_key = config['dify']['api_key']
        self.base_url = "https://api.dify.ai/v1"
        self.upload_url = f"{self.base_url}/files/upload"
        
        # 環境変数から取得（優先）
        self.api_key = os.getenv('DIFY_API_KEY', self.api_key)
        workflow_url = os.getenv('DIFY_API_URL', 'https://api.dify.ai/v1/workflows/run')
        
        # 既存の設定に合わせてワークフローURLを設定
        self.workflow_url = workflow_url
        
        self.user_id = config['dify']['user_id']
        
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
        }
        
        logger.info(f"Dify Client初期化完了")
        logger.info(f"API Key: {self.api_key[:20]}...")
        logger.info(f"Workflow URL: {self.workflow_url}")
    
    def test_connection(self) -> bool:
        """
        Dify API接続テスト
        """
        try:
            if not self.api_key:
                logger.error("APIキーが設定されていません")
                return False
                
            # 基本APIエンドポイントでテスト（200ステータスを返すことが確認済み）
            logger.info("Dify API接続テスト開始...")
            test_url = "https://api.dify.ai/v1"
            
            response = requests.get(
                test_url,
                headers=self.headers,
                timeout=15
            )
            
            logger.info(f"Dify APIレスポンス: {response.status_code}")
            
            if response.status_code == 200:
                logger.info("✅ Dify API接続成功")
                return True
            elif response.status_code == 401:
                logger.error("❌ APIキーが無効です")
                return False
            elif response.status_code == 403:
                logger.error("❌ APIキーの権限が不足しています")
                return False
            else:
                logger.warning(f"⚠️ 予期しないレスポンス: {response.status_code}")
                # 404以外で4xx、5xxでなければ接続成功とみなす
                return response.status_code < 400
                
        except requests.exceptions.Timeout:
            logger.error("❌ Dify API接続タイムアウト")
            return False
        except requests.exceptions.ConnectionError:
            logger.error("❌ Dify APIへの接続に失敗（ネットワークエラー）")
            return False
        except Exception as e:
            logger.error(f"❌ Dify API接続テストエラー: {str(e)}")
            return False
    
    def upload_file(self, file_path: str) -> Optional[str]:
        """
        DifyにPDFファイルをアップロード
        """
        try:
            file_path = Path(file_path)
            
            with open(file_path, 'rb') as file:
                files = {
                    'file': (file_path.name, file, 'application/pdf')
                }
                data = {
                    'user': self.user_id
                }
                
                logger.info(f"ファイルアップロード開始: {file_path.name}")
                
                response = requests.post(
                    self.upload_url,
                    headers=self.headers,
                    files=files,
                    data=data,
                    timeout=30
                )
                
                logger.debug(f"アップロードレスポンス: {response.status_code}")
                logger.debug(f"アップロードレスポンス内容: {response.text}")
                
                if response.status_code in [200, 201]:  # 200と201両方を成功とする
                    result = response.json()
                    file_id = result.get('id')
                    logger.info(f"ファイルアップロード成功: {file_id}")
                    return file_id
                else:
                    logger.error(f"ファイルアップロード失敗: {response.status_code} - {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"ファイルアップロードエラー: {str(e)}")
            return None
    
    def process_pdf(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        PDFファイルを既存のDifyワークフローで処理
        """
        try:
            file_path = Path(file_path)
            logger.info(f"PDF処理開始: {file_path.name}")
            
            # 1. ファイルをアップロード
            file_id = self.upload_file(file_path)
            if not file_id:
                logger.error("ファイルアップロードに失敗しました")
                return None
            
            # 2. ワークフローを実行
            workflow_data = {
                'inputs': {
                    'file': [{
                        'transfer_method': 'local_file',
                        'upload_file_id': file_id,
                        'type': 'document'
                    }]
                },
                'response_mode': 'blocking',
                'user': self.user_id
            }
            
            logger.info("ワークフロー実行中...")
            logger.debug(f"ワークフローURL: {self.workflow_url}")
            logger.debug(f"ワークフローデータ: {json.dumps(workflow_data, indent=2)}")
            
            response = requests.post(
                self.workflow_url,
                headers={
                    **self.headers,
                    'Content-Type': 'application/json'
                },
                json=workflow_data,
                timeout=120
            )
            
            logger.debug(f"ワークフローレスポンス: {response.status_code}")
            logger.debug(f"ワークフローレスポンス内容: {response.text}")
            
            if response.status_code in [200, 201]:  # 200と201両方を成功とする
                result = response.json()
                logger.info(f"ワークフロー実行成功: {file_path.name}")
                return result
            else:
                logger.error(f"ワークフロー実行失敗: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"PDF処理エラー: {str(e)}")
            return None
    
    def extract_info_from_result(self, result: Dict[str, Any]) -> Dict[str, str]:
        """
        既存のDifyワークフロー結果から情報を抽出
        """
        try:
            logger.info("ワークフロー結果から情報抽出開始")
            
            # 初期化
            extracted_info = {
                'issuer': '',
                'document_type': '',
                'date': '',
                'patient_name': '',
                'institution_name': '',
                'original_filename': ''
            }
            
            # ワークフローの出力データを取得
            if 'data' in result and 'outputs' in result['data']:
                outputs = result['data']['outputs']
                logger.debug(f"ワークフロー出力: {outputs}")
                
                # notion_responseからNotionページの情報を抽出
                if 'notion_response' in outputs:
                    import json as json_lib
                    try:
                        notion_data = json_lib.loads(outputs['notion_response'])
                        properties = notion_data.get('properties', {})
                        
                        # 発行機関を抽出
                        if '発行機関' in properties:
                            issuer_data = properties['発行機関']
                            if 'select' in issuer_data and issuer_data['select']:
                                extracted_info['issuer'] = issuer_data['select']['name']
                        
                        # 書類種別を抽出
                        if '書類種別' in properties:
                            doc_type_data = properties['書類種別']
                            if 'select' in doc_type_data and doc_type_data['select']:
                                extracted_info['document_type'] = doc_type_data['select']['name']
                        
                        # 書類名からも情報を取得
                        if '書類名' in properties:
                            title_data = properties['書類名']
                            if 'title' in title_data and title_data['title']:
                                title_text = title_data['title'][0]['plain_text']
                                if not extracted_info['document_type']:
                                    extracted_info['document_type'] = title_text
                        
                        logger.info(f"Notionデータから抽出: 発行機関={extracted_info['issuer']}, 書類種別={extracted_info['document_type']}")
                        
                    except Exception as e:
                        logger.error(f"Notionレスポンス解析エラー: {e}")
            
            # デフォルト値の設定
            if not extracted_info['issuer']:
                extracted_info['issuer'] = 'その他'
            if not extracted_info['document_type']:
                extracted_info['document_type'] = 'その他'
            if not extracted_info['date']:
                from datetime import datetime
                extracted_info['date'] = datetime.now().strftime('%Y%m%d')
            
            logger.info(f"情報抽出完了: {extracted_info}")
            return extracted_info
            
        except Exception as e:
            logger.error(f"情報抽出エラー: {str(e)}")
            return {
                'issuer': 'その他',
                'document_type': 'その他', 
                'date': '',
                'patient_name': '',
                'institution_name': '',
                'original_filename': ''
            }