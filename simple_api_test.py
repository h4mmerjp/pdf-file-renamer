"""
シンプルなDify API接続テスト
"""

import requests
import os
from dotenv import load_dotenv

# 環境変数読み込み
load_dotenv('config/.env')

def simple_dify_test():
    """シンプルなAPI接続テスト"""
    
    api_key = os.getenv('DIFY_API_KEY')
    base_url = "https://api.dify.ai/v1"
    
    print(f"APIキー: {api_key[:20] if api_key else 'None'}...")
    print(f"ベースURL: {base_url}")
    
    if not api_key:
        print("❌ APIキーが設定されていません")
        return False
    
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    # テスト1: ファイルアップロードエンドポイント（実際に存在するエンドポイント）
    try:
        print("\n🔍 ファイルアップロードエンドポイント接続テスト...")
        
        # 既存のアプリで実際に使用されているエンドポイントをテスト
        upload_url = f"{base_url}/files/upload"
        response = requests.options(  # OPTIONSリクエストで接続確認
            upload_url,
            headers=headers,
            timeout=10
        )
        
        print(f"レスポンスコード: {response.status_code}")
        print(f"レスポンス内容: {response.text[:200]}...")
        
        if response.status_code in [200, 405]:  # 405 Method Not Allowedでも接続は成功
            print("✅ ファイルアップロードエンドポイント接続成功！")
            return True
        else:
            print(f"⚠️ 予期しないレスポンス: {response.status_code}")
        
    except Exception as e:
        print(f"❌ ファイルアップロードエンドポイント接続エラー: {e}")
    
    # テスト2: 基本的な接続確認
    try:
        print("\n🔍 基本的なDify API接続テスト...")
        
        # シンプルなGETリクエストでサーバーの生存確認
        response = requests.get(
            base_url,
            headers=headers,
            timeout=10
        )
        
        print(f"レスポンスコード: {response.status_code}")
        print(f"レスポンス内容: {response.text[:200]}...")
        
        if response.status_code in [200, 404, 401, 403]:
            print("✅ Dify APIサーバーに接続できています！")
            print("（404は正常 - エンドポイントが存在しないだけ）")
            return True
        else:
            print(f"⚠️ 予期しないレスポンス: {response.status_code}")
        
    except Exception as e:
        print(f"❌ 基本接続エラー: {e}")
    
    return False

if __name__ == "__main__":
    print("🧪 シンプルDify API接続テスト")
    print("=" * 40)
    success = simple_dify_test()
    
    if success:
        print("\n✅ 基本的なAPI接続は正常です！")
        print("次はワークフローの設定を確認しましょう。")
    else:
        print("\n⚠️ API接続に問題があります。")
        print("APIキーとエンドポイントを確認してください。")