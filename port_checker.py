"""
ポート使用状況確認と自動修正スクリプト
"""

import socket
import subprocess
import sys
import os
import json
from pathlib import Path

def check_port_usage(port):
    """指定されたポートが使用中かチェック"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('localhost', port))
            return False  # ポートは空いている
    except OSError:
        return True  # ポートは使用中

def find_process_using_port(port):
    """ポートを使用しているプロセスを特定"""
    try:
        # Windowsの場合
        if os.name == 'nt':
            result = subprocess.run(
                ['netstat', '-ano', '|', 'findstr', f':{port}'],
                shell=True,
                capture_output=True,
                text=True
            )
            
            if result.stdout:
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if f':{port}' in line and 'LISTENING' in line:
                        parts = line.split()
                        if len(parts) > 4:
                            pid = parts[-1]
                            
                            # プロセス名を取得
                            try:
                                process_result = subprocess.run(
                                    ['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV'],
                                    capture_output=True,
                                    text=True
                                )
                                if process_result.stdout:
                                    process_lines = process_result.stdout.strip().split('\n')
                                    if len(process_lines) > 1:
                                        process_info = process_lines[1].replace('"', '').split(',')
                                        return {
                                            'pid': pid,
                                            'name': process_info[0] if process_info else 'Unknown',
                                            'memory': process_info[4] if len(process_info) > 4 else 'Unknown'
                                        }
                            except:
                                return {'pid': pid, 'name': 'Unknown', 'memory': 'Unknown'}
                                
        # Linuxの場合
        else:
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True,
                text=True
            )
            if result.stdout:
                pid = result.stdout.strip()
                return {'pid': pid, 'name': 'Unknown', 'memory': 'Unknown'}
                
    except Exception as e:
        print(f"プロセス確認エラー: {e}")
    
    return None

def find_available_port(start_port=8000, end_port=8100):
    """利用可能なポートを見つける"""
    for port in range(start_port, end_port):
        if not check_port_usage(port):
            return port
    return None

def kill_process_on_port(port):
    """ポートを使用しているプロセスを終了"""
    process_info = find_process_using_port(port)
    if process_info:
        try:
            pid = process_info['pid']
            if os.name == 'nt':
                # Windowsの場合
                result = subprocess.run(['taskkill', '/F', '/PID', pid], 
                                      capture_output=True, text=True)
                return result.returncode == 0
            else:
                # Linuxの場合
                result = subprocess.run(['kill', '-9', pid], 
                                      capture_output=True, text=True)
                return result.returncode == 0
        except Exception as e:
            print(f"プロセス終了エラー: {e}")
            return False
    return False

def update_config_port(new_port):
    """設定ファイルのポートを更新"""
    config_files = [
        'config/settings.json',
        'config/.env'
    ]
    
    updated = []
    
    # settings.json を更新
    settings_file = Path('config/settings.json')
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            if 'api' not in config:
                config['api'] = {}
            config['api']['port'] = new_port
            
            with open(settings_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            
            updated.append('settings.json')
        except Exception as e:
            print(f"settings.json更新エラー: {e}")
    
    # .env を更新
    env_file = Path('config/.env')
    if env_file.exists():
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            updated_lines = []
            port_line_found = False
            
            for line in lines:
                if line.startswith('API_PORT='):
                    updated_lines.append(f'API_PORT={new_port}\n')
                    port_line_found = True
                else:
                    updated_lines.append(line)
            
            # API_PORT行が存在しない場合は追加
            if not port_line_found:
                updated_lines.append(f'\n# API Server Port\nAPI_PORT={new_port}\n')
            
            with open(env_file, 'w', encoding='utf-8') as f:
                f.writelines(updated_lines)
            
            updated.append('.env')
        except Exception as e:
            print(f".env更新エラー: {e}")
    
    return updated

def main():
    print("🔍 ポート使用状況チェック")
    print("=" * 50)
    
    default_port = 8000
    
    # ポート8000の使用状況確認
    if check_port_usage(default_port):
        print(f"❌ ポート {default_port} は使用中です")
        
        # 使用プロセスを特定
        process_info = find_process_using_port(default_port)
        if process_info:
            print(f"📋 使用プロセス情報:")
            print(f"   PID: {process_info['pid']}")
            print(f"   プロセス名: {process_info['name']}")
            print(f"   メモリ使用量: {process_info['memory']}")
            
            # プロセス終了の選択肢を提供
            print(f"\n🎯 解決方法:")
            print(f"1. プロセス {process_info['pid']} を終了してポート {default_port} を解放")
            print(f"2. 別のポートを使用")
            print(f"3. 手動で解決")
            
            choice = input("\n選択してください (1-3): ").strip()
            
            if choice == "1":
                print(f"🔄 プロセス {process_info['pid']} を終了中...")
                if kill_process_on_port(default_port):
                    print(f"✅ プロセス終了成功!")
                    if not check_port_usage(default_port):
                        print(f"✅ ポート {default_port} が利用可能になりました")
                        return default_port
                    else:
                        print(f"⚠️ ポート {default_port} がまだ使用中です")
                else:
                    print(f"❌ プロセス終了失敗")
            
            elif choice == "3":
                print("手動でプロセスを終了してから再実行してください")
                print(f"Windows: taskkill /F /PID {process_info['pid']}")
                print(f"または タスクマネージャーでプロセスを終了")
                return None
        
        # 利用可能なポートを検索
        print(f"\n🔍 利用可能なポートを検索中...")
        available_port = find_available_port()
        
        if available_port:
            print(f"✅ 利用可能なポート発見: {available_port}")
            
            # 設定ファイルを更新するか確認
            update_choice = input(f"\n設定ファイルをポート {available_port} に更新しますか? (y/n): ").strip().lower()
            
            if update_choice == 'y':
                updated_files = update_config_port(available_port)
                if updated_files:
                    print(f"✅ 設定ファイル更新完了: {', '.join(updated_files)}")
                else:
                    print("⚠️ 設定ファイルの更新に失敗しました")
                
                return available_port
            else:
                print(f"ポート {available_port} を使用する場合は、手動で設定を変更してください")
                return available_port
        else:
            print("❌ 利用可能なポートが見つかりませんでした")
            return None
    
    else:
        print(f"✅ ポート {default_port} は利用可能です")
        return default_port

if __name__ == "__main__":
    result_port = main()
    
    print("\n" + "=" * 50)
    if result_port:
        print(f"🎉 ポート {result_port} でサーバーを起動できます")
        print(f"\n次のコマンドで起動:")
        print(f"python api/main.py")
        print(f"\nブラウザでアクセス:")
        print(f"http://localhost:{result_port}")
    else:
        print("❌ ポートの問題を解決してから再実行してください")