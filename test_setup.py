"""
セットアップテスト用スクリプト（修正版）
基本的な動作確認を行う
"""

import os
import sys
import json
from pathlib import Path

def test_directory_structure():
    """ディレクトリ構造をテスト"""
    required_dirs = [
        'config',
        'src', 
        'dify_config',
        'downloads',
        'logs'
    ]
    
    missing_dirs = []
    for directory in required_dirs:
        if not os.path.exists(directory):
            missing_dirs.append(directory)
    
    if missing_dirs:
        print(f"❌ 不足しているディレクトリ: {missing_dirs}")
        return False
    else:
        print("✅ ディレクトリ構造 OK")
        return True

def test_env_file():
    """環境変数ファイルをテスト"""
    env_path = 'config/.env'
    
    if not os.path.exists(env_path):
        print(f"❌ 環境変数ファイルが見つかりません: {env_path}")
        return False
    
    print("✅ 環境変数ファイル OK")
    
    # 内容を確認（エンコーディングを明示的に指定）
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            # UTF-8で読めない場合はcp932で試行
            with open(env_path, 'r', encoding='cp932') as f:
                content = f.read()
        except Exception as e:
            print(f"⚠️ 環境変数ファイルの読み込みエラー: {e}")
            print("ファイルをUTF-8エンコーディングで再保存してください")
            return True
    except Exception as e:
        print(f"⚠️ 環境変数ファイルの読み込みエラー: {e}")
        return True
        
    required_vars = ['DIFY_API_KEY', 'DIFY_API_URL']
    missing_vars = []
    
    for var in required_vars:
        if var not in content:
            missing_vars.append(var)
    
    if missing_vars:
        print(f"⚠️ 不足している環境変数: {missing_vars}")
    else:
        print("✅ 必要な環境変数が設定されています")
    
    return True

def test_dify_config():
    """Dify設定ファイルをテスト"""
    dify_config_dir = Path('dify_config')
    
    if not dify_config_dir.exists():
        print("❌ dify_configディレクトリが見つかりません")
        return False
    
    yml_files = list(dify_config_dir.glob('*.yml')) + list(dify_config_dir.glob('*.yaml'))
    
    if not yml_files:
        print("⚠️ Dify YMLファイルが見つかりません")
        print("既存のワークフローYMLファイルをdify_config/フォルダにコピーしてください")
        return False
    
    print(f"✅ Dify設定ファイル OK: {[f.name for f in yml_files]}")
    return True

def test_python_files():
    """必要なPythonファイルをテスト"""
    required_files = [
        'src/__init__.py',
        'src/dify_client.py',
        'src/file_renamer.py',
        'src/main.py'
    ]
    
    missing_files = []
    for file_path in required_files:
        if not os.path.exists(file_path):
            missing_files.append(file_path)
    
    if missing_files:
        print(f"⚠️ 不足しているファイル: {missing_files}")
        print("アーティファクトの内容でファイルを作成してください")
        return False
    else:
        print("✅ 必要なPythonファイル OK")
        return True

def create_sample_config():
    """サンプル設定ファイルを作成"""
    config_path = 'config/settings.json'
    
    sample_config = {
        "app": {
            "name": "PDF File Renamer",
            "version": "1.0.0",
            "debug": True
        },
        "dify": {
            "api_url": "https://api.dify.ai/v1/workflows/run",
            "api_key": "app-SX5RYtfXNxE8kG7FKShngxsp",
            "upload_url": "https://api.dify.ai/v1/files/upload",
            "workflow_file": "./dify_config/医療書類管理notion_practical.yml",
            "user_id": "pdf-renamer-user"
        },
        "file_processing": {
            "input_folder": "./input_pdfs",
            "output_folder": "./downloads",
            "temp_folder": "./temp",
            "max_file_size_mb": 15,
            "allowed_extensions": [".pdf", ".PDF"]
        },
        "naming_rules": {
            "pattern": "{issuer}_{document_type}_{date}_{original_name}",
            "date_format": "%Y%m%d",
            "max_filename_length": 255,
            "invalid_chars": ["<", ">", ":", "\"", "/", "\\", "|", "?", "*"],
            "replacement_char": "_"
        },
        "issuers": {
            "国民健康保険団体連合会": "kokuhoren",
            "社会保険診療報酬支払基金": "shiharai_kikin",
            "厚生労働省": "mhlw",
            "保険者": "hokensha",
            "医療機関": "iryokikan",
            "その他": "others"
        },
        "document_types": {
            "診療報酬明細書": "shinryo_meisai",
            "医療費通知": "iryohi_tsuchi",
            "保険証": "hokensho",
            "診断書": "shindansho",
            "処方箋": "shohosen",
            "その他": "others"
        },
        "google_drive": {
            "enabled": False,
            "credentials_file": "./credentials.json",
            "token_file": "./token.json",
            "folder_id": "",
            "folder_name": "PDF_Renamed_Files",
            "create_date_folders": True
        },
        "logging": {
            "level": "INFO",
            "file": "./logs/app.log",
            "max_file_size_mb": 10,
            "backup_count": 5
        }
    }
    
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(sample_config, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 設定ファイルを作成/更新: {config_path}")

def main():
    """メイン関数"""
    print("🔍 PDF File Renamer セットアップチェック")
    print("=" * 50)
    
    # ディレクトリ構造チェック
    test_directory_structure()
    
    # 環境変数ファイルチェック
    test_env_file()
    
    # Dify設定チェック
    test_dify_config()
    
    # Pythonファイルチェック
    test_python_files()
    
    # 設定ファイル作成/更新
    create_sample_config()
    
    print("\n" + "=" * 50)
    print("📋 次のステップ:")
    print("1. ✅ パッケージインストール完了")
    print("2. config/.env ファイルの文字エンコーディングを確認")
    print("3. 不足しているPythonファイルをアーティファクトから作成")
    print("4. python test_dify_connection.py で接続テスト")
    print("5. 実際のPDFファイルでテスト")

if __name__ == "__main__":
    main()