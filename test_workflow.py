"""
Difyワークフロー実行テスト
"""

import os
import sys
import json
import logging
from dotenv import load_dotenv

# パスを追加
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_workflow():
    """ワークフロー実行をテスト"""
    
    # 環境変数読み込み
    load_dotenv('config/.env')
    
    # ログ設定
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # 設定読み込み
    try:
        with open('config/settings.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
    except Exception as e:
        print(f"❌ 設定ファイル読み込みエラー: {e}")
        return False
    
    # Difyクライアント初期化
    try:
        from src.dify_client import DifyClient
        
        dify_client = DifyClient(config)
        
        # テスト用のファイルを作成
        test_content = """
医療書類テスト

発行機関: 社会保険診療報酬支払基金
書類種別: 診療報酬明細書
患者名: テスト太郎
日付: 2024年12月1日

これはワークフローテスト用の医療書類です。
保険番号: 12345678
診療内容: 定期検診
金額: 5,000円
"""
        
        test_file = 'test_medical_doc.txt'
        with open(test_file, 'w', encoding='utf-8') as f:
            f.write(test_content)
        
        print(f"テストファイル作成: {test_file}")
        
        # ワークフロー実行
        print("🔍 ワークフロー実行テスト中...")
        result = dify_client.process_pdf(test_file)
        
        if result:
            print("✅ ワークフロー実行成功！")
            print("結果:")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            
            # 情報抽出テスト
            print("\n🔍 情報抽出テスト...")
            extracted_info = dify_client.extract_info_from_result(result)
            print("抽出された情報:")
            for key, value in extracted_info.items():
                print(f"  {key}: {value}")
            
            # テストファイル削除
            try:
                os.remove(test_file)
                print(f"テストファイル削除: {test_file}")
            except Exception as e:
                print(f"ファイル削除エラー: {e}")
            
            return True
        else:
            print("❌ ワークフロー実行失敗")
            
            # テストファイル削除
            try:
                os.remove(test_file)
            except Exception as e:
                print(f"ファイル削除エラー: {e}")
            
            return False
            
    except Exception as e:
        print(f"❌ ワークフローテストエラー: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """メイン関数"""
    print("🧪 Difyワークフロー実行テスト")
    print("=" * 50)
    
    success = test_workflow()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 ワークフローテストが成功しました！")
        print("次は実際のPDFファイルでテストしてみましょう。")
        print("\n使用方法:")
        print("1. input_pdfs/ フォルダにPDFファイルを配置")
        print("2. python src/main.py --input input_pdfs --debug")
    else:
        print("❌ ワークフローテストが失敗しました。")
        print("設定とワークフローを確認してください。")

if __name__ == "__main__":
    main()