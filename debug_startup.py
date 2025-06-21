"""
PDF File Renamer デバッグ用スタートアップスクリプト
環境のチェックとサーバー起動を行う
"""

import os
import sys
import json
import subprocess
import time
import webbrowser
from pathlib import Path
from dotenv import load_dotenv

def check_environment():
    """環境をチェック"""
    print("🔍 環境チェック開始...")
    
    issues = []
    
    # Python バージョンチェック
    if sys.version_info < (3, 8):
        issues.append(f"Pythonバージョンが古すぎます: {sys.version}")
    else:
        print(f"✅ Python: {sys.version}")
    
    # 必要ディレクトリの存在確認
    required_dirs = ['api', 'src', 'config', 'temp', 'downloads', 'logs']
    for dir_name in required_dirs:
        dir_path = Path(dir_name)
        if not dir_path.exists():
            dir_path.mkdir(exist_ok=True, parents=True)
            print(f"📁 ディレクトリ作成: {dir_name}")
        else:
            print(f"✅ ディレクトリ存在: {dir_name}")
    
    # 環境変数ファイルチェック
    env_file = Path('config/.env')
    if not env_file.exists():
        print("⚠️ .envファイルが見つかりません")
        create_env_file()
    else:
        print("✅ .envファイル存在")
        load_dotenv(env_file)
        
        # APIキーの存在確認
        api_key = os.getenv('DIFY_API_KEY')
        if not api_key or api_key == 'your_dify_api_key_here':
            issues.append("DIFY_API_KEYが設定されていません")
        else:
            print(f"✅ DIFY_API_KEY: {api_key[:20]}...")
    
    # 必要ファイルのチェック
    required_files = [
        'src/__init__.py',
        'src/dify_client.py', 
        'src/file_renamer.py',
        'src/main.py',
        'api/main.py',
        'index.html'
    ]
    
    for file_path in required_files:
        if not Path(file_path).exists():
            issues.append(f"必要ファイル不足: {file_path}")
        else:
            print(f"✅ ファイル存在: {file_path}")
    
    # requirements.txt のチェック
    if Path('requirements.txt').exists():
        print("✅ requirements.txt存在")
        try:
            # パッケージがインストールされているかチェック
            import fastapi, requests, PyPDF2
            print("✅ 必要パッケージインストール済み")
        except ImportError as e:
            issues.append(f"パッケージ不足: {e}")
    else:
        issues.append("requirements.txtが見つかりません")
    
    if issues:
        print("\n❌ 環境に問題があります:")
        for issue in issues:
            print(f"  - {issue}")
        return False
    else:
        print("\n✅ 環境チェック完了!")
        return True

def create_env_file():
    """環境変数ファイルを作成"""
    env_content = """# PDF File Renamer 環境設定
# Dify API 設定
DIFY_API_KEY=app-SX5RYtfXNxE8kG7FKShngxsp
DIFY_API_URL=https://api.dify.ai/v1/workflows/run

# デバッグ設定
DEBUG=true
LOG_LEVEL=DEBUG
"""
    
    config_dir = Path('config')
    config_dir.mkdir(exist_ok=True)
    
    env_file = config_dir / '.env'
    with open(env_file, 'w', encoding='utf-8') as f:
        f.write(env_content)
    
    print(f"📝 環境設定ファイル作成: {env_file}")
    print("⚠️ DIFY_API_KEYを実際のAPIキーに変更してください")

def install_requirements():
    """必要パッケージをインストール"""
    print("📦 パッケージインストール中...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
        print("✅ パッケージインストール完了")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ パッケージインストール失敗: {e}")
        return False

def start_api_server():
    """APIサーバーを起動"""
    print("🚀 APIサーバー起動中...")
    
    try:
        # まずポートチェックを実行
        print("🔍 ポート使用状況確認中...")
        port_result = subprocess.run([
            sys.executable, 
            'port_checker.py'
        ], capture_output=True, text=True, cwd=os.getcwd())
        
        if port_result.returncode != 0:
            print("⚠️ ポートチェックでエラーが発生しました")
            print(port_result.stderr)
        
        # APIサーバーを別プロセスで起動
        api_process = subprocess.Popen([
            sys.executable, 
            'api/main.py'
        ], cwd=os.getcwd())
        
        print("⏳ サーバー起動待機中...")
        time.sleep(5)  # 起動時間を延長
        
        # 複数のポートでサーバーが起動したかチェック
        import requests
        for port in [8000, 8001, 8002, 8003]:
            try:
                response = requests.get(f'http://localhost:{port}/health', timeout=3)
                if response.status_code == 200:
                    print(f"✅ APIサーバー起動成功! (ポート: {port})")
                    print(f"🌐 APIサーバー: http://localhost:{port}")
                    
                    # 環境変数を更新
                    os.environ['API_PORT'] = str(port)
                    
                    return api_process, port
            except requests.exceptions.RequestException:
                continue
        
        print("❌ サーバー起動の確認に失敗しました")
        return api_process, None
            
    except Exception as e:
        print(f"❌ サーバー起動失敗: {e}")
    
    return None, None

def open_browser(port=8000):
    """ブラウザでUIを開く"""
    html_file = Path('index.html').absolute()
    if html_file.exists():
        # HTMLファイルにポート情報を動的に設定
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # デフォルトのAPIURLを更新
            updated_content = content.replace(
                'value="http://localhost:8000"',
                f'value="http://localhost:{port}"'
            )
            
            # 一時的な更新版HTMLファイルを作成
            temp_html = Path('index_temp.html')
            with open(temp_html, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            
            print(f"🌐 ブラウザでUIを開きます: {temp_html}")
            webbrowser.open(f'file://{temp_html.absolute()}')
            
            # 3秒後に一時ファイルを削除
            import threading
            def cleanup():
                time.sleep(3)
                try:
                    temp_html.unlink()
                except:
                    pass
            threading.Thread(target=cleanup).start()
            
        except Exception as e:
            print(f"HTML更新エラー: {e}")
            print(f"🌐 ブラウザでUIを開きます: {html_file}")
            webbrowser.open(f'file://{html_file}')
    else:
        print("❌ index.htmlが見つかりません")

def main():
    """メイン関数"""
    print("🚀 PDF File Renamer デバッグ起動")
    print("=" * 50)
    
    # 環境チェック
    if not check_environment():
        print("\n修正が必要な項目があります。")
        
        # パッケージインストールを試行
        if Path('requirements.txt').exists():
            if input("\nパッケージをインストールしますか? (y/n): ").lower() == 'y':
                if install_requirements():
                    print("パッケージインストール完了。再度実行してください。")
                else:
                    print("パッケージインストールに失敗しました。")
        return
    
    print("\n🎯 起動オプション:")
    print("1. APIサーバーのみ起動")
    print("2. APIサーバー + ブラウザでUI表示")
    print("3. 環境チェックのみ（終了）")
    
    choice = input("\n選択してください (1-3): ").strip()
    
    if choice == "3":
        print("終了します。")
        return
    
    # APIサーバー起動
    api_process, server_port = start_api_server()
    
    if api_process and server_port:
        if choice == "2":
            time.sleep(2)  # サーバー起動待機
            open_browser(server_port)
        
        print("\n" + "=" * 50)
        print("🎉 起動完了!")
        print("📱 Web UI: index.htmlをブラウザで開いてください")
        print(f"🔗 API: http://localhost:{server_port}")
        print(f"📊 ヘルスチェック: http://localhost:{server_port}/health")
        print(f"🐛 デバッグ情報: http://localhost:{server_port}/debug")
        print("\n⏹️ 停止するには Ctrl+C を押してください")
        
        try:
            # サーバープロセスを待機
            api_process.wait()
        except KeyboardInterrupt:
            print("\n🛑 サーバーを停止中...")
            api_process.terminate()
            try:
                api_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api_process.kill()
            print("✅ サーバー停止完了")
    else:
        print("❌ APIサーバーの起動に失敗しました")
        print("\n手動起動方法:")
        print("1. python port_checker.py でポート確認")
        print("2. cd api")
        print("3. python main.py")

if __name__ == "__main__":
    main()