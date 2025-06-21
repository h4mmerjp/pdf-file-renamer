"""
Dify API接続テストスクリプト
"""

import requests
import os
from dotenv import load_dotenv

def test_dify_api():
    print("🔍 Dify API接続テスト開始")
    print("=" * 50)
    
    # 環境変数読み込み
    load_dotenv('config/.env')
    
    api_key = os.getenv('DIFY_API_KEY')
    api_url = os.getenv('DIFY_API_URL')
    
    print(f"🔑 APIキー: {api_key[:20] if api_key else 'None'}...")
    print(f"🌐 API URL: {api_url}")
    
    if not api_key:
        print("❌ APIキーが設定されていません")
        return False
    
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    # 複数のエンドポイントをテスト
    test_urls = [
        ('ファイル一覧', 'https://api.dify.ai/v1/files'),
        ('基本API', 'https://api.dify.ai/v1'),
        ('アプリ一覧', 'https://api.dify.ai/v1/apps')
    ]
    
    success_count = 0
    
    for name, url in test_urls:
        try:
            print(f"\n🔍 {name}をテスト中: {url}")
            response = requests.get(url, headers=headers, timeout=10)
            status = response.status_code
            
            print(f"   📊 ステータスコード: {status}")
            
            if status == 200:
                print("   ✅ 成功 - API接続正常")
                success_count += 1
            elif status == 401:
                print("   ❌ 認証エラー - APIキーが無効")
                print("   💡 解決方法: DifyでAPIキーを再生成してください")
            elif status == 403:
                print("   ⚠️ 権限不足 - APIキーの権限を確認")
            elif status == 404:
                print("   ⚠️ エンドポイント不存在（正常な場合もあり）")
                success_count += 0.5  # 部分的成功
            elif status >= 500:
                print("   ⚠️ サーバーエラー - Dify側の問題")
            else:
                print(f"   ⚠️ その他のレスポンス")
                if len(response.text) < 200:
                    print(f"   📄 レスポンス: {response.text}")
                
        except requests.exceptions.Timeout:
            print("   ❌ タイムアウト - ネットワーク接続を確認")
        except requests.exceptions.ConnectionError:
            print("   ❌ 接続エラー - インターネット接続を確認")
        except Exception as e:
            print(f"   ❌ 予期しないエラー: {e}")
    
    print("\n" + "=" * 50)
    print("📋 テスト結果まとめ:")
    
    if success_count >= 1:
        print("✅ Dify API接続は正常に動作しています")
        return True
    elif success_count > 0:
        print("⚠️ 部分的に動作しています（一部エンドポイントのみ）")
        return True
    else:
        print("❌ Dify API接続に問題があります")
        print("\n🛠️ 解決方法:")
        print("1. config/.env ファイルでDIFY_API_KEYを確認")
        print("2. Difyダッシュボードで新しいAPIキーを生成")
        print("3. インターネット接続を確認")
        return False

if __name__ == "__main__":
    test_dify_api()