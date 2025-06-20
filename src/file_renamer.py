"""
ファイルリネーム機能
抽出された情報を基にファイル名を生成し、リネームを行う
"""

import os
import re
import shutil
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)

class FileRenamer:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.naming_rules = config['naming_rules']
        self.issuers = config['issuers']
        self.document_types = config['document_types']
        self.output_folder = Path(config['file_processing']['output_folder'])
        
        # 出力フォルダを作成
        self.output_folder.mkdir(parents=True, exist_ok=True)
    
    def clean_filename(self, filename: str) -> str:
        """
        ファイル名から不正な文字を除去
        
        Args:
            filename: 元のファイル名
            
        Returns:
            クリーンなファイル名
        """
        # 不正な文字を置換
        for char in self.naming_rules['invalid_chars']:
            filename = filename.replace(char, self.naming_rules['replacement_char'])
        
        # 連続するアンダースコアを単一に
        filename = re.sub(r'_+', '_', filename)
        
        # 先頭と末尾のアンダースコアを削除
        filename = filename.strip('_')
        
        # 最大長制限
        max_length = self.naming_rules['max_filename_length']
        if len(filename) > max_length:
            name, ext = os.path.splitext(filename)
            filename = name[:max_length - len(ext) - 3] + '...' + ext
        
        return filename
    
    def normalize_issuer(self, issuer: str) -> str:
        """
        発行機関名を標準化
        
        Args:
            issuer: 抽出された発行機関名
            
        Returns:
            標準化された機関名
        """
        issuer = issuer.strip()
        
        # マッピング辞書から検索（日本語のまま返す）
        for key, value in self.issuers.items():
            if key in issuer or issuer in key:
                return value
        
        # 部分マッチで検索
        if '国民健康保険' in issuer or '国保' in issuer:
            return self.issuers['国民健康保険団体連合会']
        elif '社会保険' in issuer or '支払基金' in issuer:
            return self.issuers['社会保険診療報酬支払基金']
        elif '厚生労働省' in issuer or '厚労省' in issuer:
            return self.issuers['厚生労働省']
        
        return self.issuers['その他']
    
    def normalize_document_type(self, doc_type: str) -> str:
        """
        書類種別を標準化
        
        Args:
            doc_type: 抽出された書類種別
            
        Returns:
            標準化された書類種別
        """
        doc_type = doc_type.strip()
        
        # マッピング辞書から検索（日本語のまま返す）
        for key, value in self.document_types.items():
            if key in doc_type or doc_type in key:
                return value
        
        # 部分マッチで検索（より詳細に）
        if '診療報酬' in doc_type or '明細' in doc_type:
            return self.document_types['診療報酬明細書']
        elif '医療費' in doc_type or '通知' in doc_type:
            return self.document_types['医療費通知']
        elif '保険証' in doc_type:
            return self.document_types['保険証']
        elif '診断書' in doc_type:
            return self.document_types['診断書']
        elif '処方箋' in doc_type:
            return self.document_types['処方箋']
        elif '返戻' in doc_type or 'へんれい' in doc_type:
            return self.document_types['返戻内訳書']
        elif '増減点' in doc_type:
            return self.document_types['増減点連絡書']
        elif '過誤' in doc_type or '再審査' in doc_type:
            return self.document_types['過誤・再審査結果通知書']
        elif '調整' in doc_type:
            return self.document_types['保険過誤調整結果通知書']
        elif '資格' in doc_type or '確認' in doc_type:
            return self.document_types['資格確認結果連絡書']
        elif '振込' in doc_type or '当座' in doc_type:
            return self.document_types['当座口振込通知書']
        
        return self.document_types['その他']
    
    def format_date(self, date_str: str) -> str:
        """
        日付文字列をフォーマット
        
        Args:
            date_str: 抽出された日付文字列
            
        Returns:
            フォーマットされた日付文字列
        """
        if not date_str:
            return datetime.now().strftime(self.naming_rules['date_format'])
        
        # 様々な日付形式に対応
        date_patterns = [
            r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})',  # 2024年1月1日, 2024/1/1, 2024-1-1
            r'(\d{4})(\d{2})(\d{2})',  # 20240101
            r'(\d{1,2})[月/-](\d{1,2})[日/-](\d{4})',  # 1月1日2024
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, date_str)
            if match:
                try:
                    if len(match.groups()) == 3:
                        year, month, day = match.groups()
                        # パターンによって順序が異なる場合の調整
                        if len(year) == 2:
                            year = '20' + year
                        elif len(year) != 4:
                            year, month, day = day, year, month
                        
                        date_obj = datetime(int(year), int(month), int(day))
                        return date_obj.strftime(self.naming_rules['date_format'])
                except ValueError:
                    continue
        
        # 解析できない場合は現在日時を使用
        return datetime.now().strftime(self.naming_rules['date_format'])
    
    def generate_filename(self, extracted_info: Dict[str, str], original_filename: str) -> str:
        """
        抽出された情報を基にファイル名を生成
        
        Args:
            extracted_info: 抽出された情報
            original_filename: 元のファイル名
            
        Returns:
            新しいファイル名
        """
        # 情報を標準化
        issuer = self.normalize_issuer(extracted_info.get('issuer', ''))
        document_type = self.normalize_document_type(extracted_info.get('document_type', ''))
        date = self.format_date(extracted_info.get('date', ''))
        
        # 元のファイル名から拡張子を取得
        original_path = Path(original_filename)
        extension = original_path.suffix
        
        # パターンに従ってファイル名を生成（日本語形式）
        pattern = self.naming_rules['pattern']
        new_filename = pattern.format(
            issuer=issuer,
            document_type=document_type,
            date=date
        )
        
        # 拡張子を追加
        new_filename += extension
        
        # ファイル名をクリーン（不正文字の除去のみ、日本語は保持）
        new_filename = self.clean_filename_japanese(new_filename)
        
        logger.info(f"ファイル名生成: {original_filename} -> {new_filename}")
        return new_filename
    
    def clean_filename_japanese(self, filename: str) -> str:
        """
        日本語ファイル名から不正な文字のみを除去
        
        Args:
            filename: 元のファイル名
            
        Returns:
            クリーンなファイル名
        """
        # 不正な文字を置換（日本語文字は保持）
        for char in self.naming_rules['invalid_chars']:
            filename = filename.replace(char, self.naming_rules['replacement_char'])
        
        # 最大長制限
        max_length = self.naming_rules['max_filename_length']
        if len(filename) > max_length:
            name, ext = os.path.splitext(filename)
            filename = name[:max_length - len(ext) - 3] + '...' + ext
        
        return filename
    
    def rename_file(self, source_path: str, extracted_info: Dict[str, str]) -> str:
        """
        ファイルをリネームして出力フォルダにコピー
        
        Args:
            source_path: 元のファイルパス
            extracted_info: 抽出された情報
            
        Returns:
            新しいファイルのパス
        """
        try:
            source_path = Path(source_path)
            
            # 新しいファイル名を生成
            new_filename = self.generate_filename(extracted_info, source_path.name)
            
            # 出力パスを決定
            output_path = self.output_folder / new_filename
            
            # 同名ファイルが存在する場合は番号を追加
            counter = 1
            while output_path.exists():
                name, ext = os.path.splitext(new_filename)
                numbered_filename = f"{name}_{counter:02d}{ext}"
                output_path = self.output_folder / numbered_filename
                counter += 1
            
            # ファイルをコピー
            shutil.copy2(source_path, output_path)
            
            logger.info(f"ファイルリネーム完了: {source_path.name} -> {output_path.name}")
            return str(output_path)
            
        except Exception as e:
            logger.error(f"ファイルリネームエラー: {str(e)}")
            raise