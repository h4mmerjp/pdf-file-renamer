"""
Difyファイルアップロードテスト
"""

import requests
import os
from dotenv import load_dotenv
from pathlib import Path

# 環境変数読み込み
load_dotenv('config/.env')

def create_test_pdf():
    """テスト用の簡単なPDFファイルを作成"""
    test_content = """
テスト用PDF文書

発行機関: 社会保険診療報酬支払基金
書類種別: 診療報酬明細書
日付: 2024年12月1日

これはテスト用の文書です。
"""
    
    # シンプルなテキストファイルを作成（PDFの代用）
    test_file = Path('test_document.txt')
    with open(test_file, 'w', encoding='utf-8') as f:
        f.write(test_content)
    
    return test_file

def test_dify_upload():
    """Difyファイルアップロードテスト"""
    
    api_key = os.getenv('DIFY_API_KEY')
    upload_url = "https://api.dify.ai/v1/files/upload"
    
    print(f"APIキー: {api_key[:20]}...")
    print(f"アップロードURL: {upload_url}")
    
    # テストファイル作成
    test_file = create_test_pdf()
    print(f"テストファイル作成: {test_file}")
    
    try:
        headers = {
            'Authorization': f'Bearer {api_key}',
        }
        
        # ファイルをアップロード
        with open(test_file, 'rb') as file:
            files = {
                'file': (test_file.name, file, 'text/plain')
            }
            data = {
                'user': 'pdf-renamer-user'
            }
            
            print("\n🔍 ファイルアップロードテスト...")
            response = requests.post(
                upload_url,
                headers=headers,
                files=files,
                data=data,
                timeout=30
            )
            
            print(f"レスポンスコード: {response.status_code}")
            print(f"レスポンス内容: {response.text}")
            
            if response.status_code in [200, 201]:  # 200と201両方を成功とする
                result = response.json()
                file_id = result.get('id')
                print(f"✅ ファイルアップロード成功！")
                print(f"ファイルID: {file_id}")
                print(f"ファイル名: {result.get('name')}")
                print(f"ファイルサイズ: {result.get('size')} bytes")
                
                # テストファイルを削除
                try:
                    test_file.unlink()
                except Exception as e:
                    print(f"ファイル削除エラー: {e}")
                
                return file_id
            else:
                print(f"❌ ファイルアップロード失敗: {response.status_code}")
                print(f"エラー詳細: {response.text}")
                
                # テストファイルを削除
                try:
                    test_file.unlink()
                except Exception as e:
                    print(f"ファイル削除エラー: {e}")
                
                return None
                
    except Exception as e:
        print(f"❌ ファイルアップロードエラー: {e}")
        
        # テストファイルを削除
        if test_file.exists():
            test_file.unlink()
        
        return None

if __name__ == "__main__":
    print("🧪 Difyファイルアップロードテスト")
    print("=" * 40)
    
    file_id = test_dify_upload()
    
    if file_id:
        print(f"\n✅ ファイルアップロード機能は正常に動作しています！")
        print(f"取得したファイルID: {file_id}")
        print("\n次はワークフロー実行のテストが必要です。")
        print("そのために、正確なワークフローIDが必要です。")
    else:
        print("\n❌ ファイルアップロードに問題があります。")
        print("APIキーとエンドポイントを再確認してください。")