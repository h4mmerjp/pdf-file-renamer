"""
PDFファイルリネーマー メインアプリケーション
既存のDify APIを使用してファイルリネーム機能を提供
"""

import os
import sys
import json
import logging
import argparse
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv

# 相対インポート用にパスを追加
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.dify_client import DifyClient
from src.file_renamer import FileRenamer

class PDFFileRenamer:
    def __init__(self, config_path: str = 'config/settings.json'):
        """
        PDFファイルリネーマーを初期化
        
        Args:
            config_path: 設定ファイルのパス
        """
        self.config = self.load_config(config_path)
        self.setup_logging()
        
        # 各コンポーネントを初期化
        self.dify_client = DifyClient(self.config)
        self.file_renamer = FileRenamer(self.config)
        
        # Google Drive機能（今回は無効）
        self.google_drive = None
        logging.info("Google Drive機能は無効です")
    
    def load_config(self, config_path: str) -> Dict[str, Any]:
        """
        設定ファイルを読み込む
        
        Args:
            config_path: 設定ファイルのパス
            
        Returns:
            設定辞書
        """
        # 環境変数を読み込み
        load_dotenv('config/.env')
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 環境変数で設定を上書き
            if os.getenv('DIFY_API_KEY'):
                config['dify']['api_key'] = os.getenv('DIFY_API_KEY')
            if os.getenv('DIFY_API_URL'):
                config['dify']['api_url'] = os.getenv('DIFY_API_URL')
            
            return config
            
        except FileNotFoundError:
            print(f"設定ファイルが見つかりません: {config_path}")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"設定ファイルの形式が正しくありません: {str(e)}")
            sys.exit(1)
    
    def setup_logging(self):
        """
        ログ設定を初期化
        """
        log_config = self.config['logging']
        
        # ログディレクトリを作成
        log_path = Path(log_config['file'])
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # ログレベルを設定
        level = getattr(logging, log_config['level'])
        
        # ログフォーマットを設定
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # ファイルハンドラー
        file_handler = logging.FileHandler(log_config['file'], encoding='utf-8')
        file_handler.setFormatter(formatter)
        file_handler.setLevel(level)
        
        # コンソールハンドラー
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        console_handler.setLevel(level)
        
        # ルートロガーを設定
        logging.basicConfig(
            level=level,
            handlers=[file_handler, console_handler],
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    def get_pdf_files(self, input_path: str) -> List[Path]:
        """
        指定されたパスからPDFファイルを取得（重複排除）
        
        Args:
            input_path: 入力パス（ファイルまたはディレクトリ）
            
        Returns:
            PDFファイルのパスリスト（重複なし）
        """
        input_path = Path(input_path)
        pdf_files = []
        
        if input_path.is_file():
            if input_path.suffix.lower() == '.pdf':
                pdf_files.append(input_path)
        elif input_path.is_dir():
            # rglob を使用して再帰的に検索し、重複を避ける
            pdf_files_set = set()
            for pattern in ['*.pdf', '*.PDF']:
                for file in input_path.glob(pattern):
                    pdf_files_set.add(file.resolve())  # 絶対パスで重複チェック
            
            pdf_files = list(pdf_files_set)
        
        unique_files = sorted(pdf_files)
        logging.info(f"検出されたPDFファイル数: {len(unique_files)}")
        for file in unique_files:
            logging.info(f"  - {file.name}")
        
        return unique_files
    
    def process_single_file(self, file_path: Path) -> bool:
        """
        単一のPDFファイルを処理
        
        Args:
            file_path: 処理するPDFファイルのパス
            
        Returns:
            処理成功時True
        """
        try:
            logging.info(f"処理開始: {file_path.name}")
            
            # Difyで情報抽出
            logging.info("Difyで情報抽出中...")
            result = self.dify_client.process_pdf(str(file_path))
            
            if not result:
                logging.error(f"Dify処理に失敗しました: {file_path.name}")
                return False
            
            # 情報を抽出
            extracted_info = self.dify_client.extract_info_from_result(result)
            extracted_info['original_filename'] = file_path.name
            
            logging.info(f"抽出された情報: {extracted_info}")
            
            # ファイルをリネーム
            logging.info("ファイルをリネーム中...")
            renamed_path = self.file_renamer.rename_file(str(file_path), extracted_info)
            
            logging.info(f"処理完了: {file_path.name} -> {Path(renamed_path).name}")
            return True
            
        except Exception as e:
            logging.error(f"ファイル処理エラー ({file_path.name}): {str(e)}")
            return False
    
    def process_files(self, input_path: str) -> Dict[str, int]:
        """
        複数のPDFファイルを処理
        
        Args:
            input_path: 入力パス
            
        Returns:
            処理結果の統計
        """
        pdf_files = self.get_pdf_files(input_path)
        
        if not pdf_files:
            logging.warning(f"PDFファイルが見つかりませんでした: {input_path}")
            return {'total': 0, 'success': 0, 'failed': 0}
        
        logging.info(f"{len(pdf_files)}個のPDFファイルを処理します")
        
        stats = {'total': len(pdf_files), 'success': 0, 'failed': 0}
        
        for i, file_path in enumerate(pdf_files, 1):
            logging.info(f"[{i}/{len(pdf_files)}] 処理中: {file_path.name}")
            
            if self.process_single_file(file_path):
                stats['success'] += 1
            else:
                stats['failed'] += 1
            
            # 進捗表示
            progress = (i / len(pdf_files)) * 100
            logging.info(f"進捗: {progress:.1f}% ({i}/{len(pdf_files)})")
        
        return stats


def main():
    """
    メイン関数
    """
    parser = argparse.ArgumentParser(description='PDF File Renamer')
    parser.add_argument('--input', '-i', type=str, help='入力ファイルまたはディレクトリ')
    parser.add_argument('--config', '-c', type=str, default='config/settings.json', help='設定ファイルのパス')
    parser.add_argument('--debug', action='store_true', help='デバッグモードで実行')
    
    args = parser.parse_args()
    
    try:
        # アプリケーションを初期化
        app = PDFFileRenamer(args.config)
        
        if args.debug:
            logging.getLogger().setLevel(logging.DEBUG)
            logging.debug("デバッグモードで実行中")
        
        if args.input:
            # コマンドライン版を実行
            logging.info("PDF File Renamer を開始します")
            
            stats = app.process_files(args.input)
            
            # 結果を表示
            logging.info("=" * 50)
            logging.info("処理結果:")
            logging.info(f"  総ファイル数: {stats['total']}")
            logging.info(f"  成功: {stats['success']}")
            logging.info(f"  失敗: {stats['failed']}")
            logging.info("=" * 50)
            
            if stats['failed'] > 0:
                sys.exit(1)
        else:
            # 引数がない場合はヘルプを表示
            parser.print_help()
            print("\n使用例:")
            print("  python src/main.py --input ./input_pdfs")
            print("  python src/main.py --input file.pdf")
            print("  python src/main.py --input ./input_pdfs --debug")
    
    except KeyboardInterrupt:
        logging.info("処理が中断されました")
        sys.exit(0)
    except Exception as e:
        logging.error(f"予期しないエラーが発生しました: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()