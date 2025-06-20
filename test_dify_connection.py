"""
Dify API接続テスト（修正版）
"""

import os
import sys
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

# パスを追加
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_env_loading():
    """環境変数の読み込みテスト"""
    print("🔍 環境変数読み込み確認...")
    
    # .envファイルのパスを確認
    env_path = Path('config/.env')
    if not env_path.exists():
        print(f"❌ .envファイルが見つかりません: {env_path.absolute()}")
        return False
    
    print(f"✅ .envファイル確認: {env_path.absolute()}")
    
    # .envファイルの内容を確認
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            content = f.read()
        print("✅ .envファイル読み込み成功")
        
        # APIキーが含まれているか確認
        if 'DIFY_API_KEY=' in content:
            api_key_line = [line for line in content.split('\n') if line.startswith('DIFY_API_KEY=')]
            if api_key_line:
                api_key = api_key_line[0].split('=', 1)[1].strip()
                if api_key and api_key != 'your_dify_api_key_here':
                    print(f"✅ APIキー確認: {api_key[:20]}...")
                    return True
                else:
                    print("❌ APIキーが設定されていません")
                    return False
            else:
                print("❌ DIFY_API_KEY行が見つかりません")
                return False
        else:
            print("❌ .envファイルにDIFY_API_KEYが含まれていません")
            return False
            
    except Exception as e:
        print(f"❌ .envファイル読み込みエラー: {e}")
        return False

def test_dify_api():
    """Dify API接続をテスト"""
    
    # 環境変数読み込み
    env_path = 'config/.env'
    load_dotenv(env_path)
    
    # ログ設定
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # 設定読み込み
    try:
        with open('config/settings.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
    except Exception as e:
        print(f"❌ 設定ファイル読み込みエラー: {e}")
        return False
    
    # 環境変数からAPIキーを再確認
    api_key = os.getenv('DIFY_API_KEY')
    if not api_key:
        print("❌ 環境変数からAPIキーを読み込めませんでした")
        print("config/.envファイルの内容を確認してください")
        return False
    
    print(f"✅ 環境変数からAPIキー読み込み成功: {api_key[:20]}...")
    
    # Difyクライアント初期化
    try:
        from src.dify_client import DifyClient
        
        dify_client = DifyClient(config)
        
        # 接続テスト
        print("🔍 Dify API接続テスト中...")
        
        if dify_client.test_connection():
            print("✅ Dify API接続成功！")
            return True
        else:
            print("❌ Dify API接続失敗")
            return False
            
    except Exception as e:
        print(f"❌ Dify API接続エラー: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """メイン関数"""
    print("🧪 PDF File Renamer - Dify API接続テスト")
    print("=" * 50)
    
    # 環境変数読み込みテスト
    if not test_env_loading():
        print("\n❌ 環境変数の設定に問題があります")
        print("config/.envファイルを確認してください:")
        print("DIFY_API_KEY=app-SX5RYtfXNxE8kG7FKShngxsp")
        return
    
    # API接続テスト実行
    success = test_dify_api()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 すべてのテストが成功しました！")
        print("次は実際のPDFファイルでテストしてみましょう。")
        print("\n使用方法:")
        print("1. input_pdfs/ フォルダにPDFファイルを配置")
        print("2. python src/main.py --input input_pdfs --debug")
    else:
        print("❌ テストが失敗しました。設定を確認してください。")

if __name__ == "__main__":
    main()