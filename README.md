# PDF File Renamer

PDF ファイルを AI で自動分析してリネームする Web アプリケーションです。Dify API を使用して、医療関連書類の発行機関と書類種別を自動的に識別し、適切なファイル名に変更します。

## 🚀 機能

- **AI 自動分析**: Dify AI が発行機関と書類種別を自動識別
- **日本語ファイル名**: 日付*発行機関*書類種別の分かりやすい形式
- **一括処理**: 複数の PDF ファイルを同時に処理可能
- **ダウンロード機能**: 個別または ZIP 形式での一括ダウンロード
- **ファイル管理**: アップロードしたファイルの一覧表示と削除

## 📋 対応書類

- 診療報酬明細書
- 医療費通知
- 保険証
- 診断書
- 処方箋
- 返戻内訳書
- 増減点連絡書
- 過誤・再審査結果通知書
- その他医療関連書類

## 🛠️ 技術スタック

### バックエンド

- **FastAPI**: Python の Web フレームワーク
- **Dify API**: AI 処理エンジン
- **PyPDF2**: PDF 処理
- **pdfplumber**: PDF テキスト抽出

### フロントエンド

- **HTML5/CSS3/JavaScript**: バニラ JavaScript 実装
- **Responsive Design**: モバイル対応

### デプロイ

- **Vercel**: サーバーレスデプロイ
- **GitHub**: ソースコード管理

## 🔧 セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd pdf-file-renamer
```

### 2. 依存関係のインストール

```bash
pip install -r requirements.txt
```

### 3. 環境変数の設定

`config/.env` ファイルを作成:

```env
DIFY_API_KEY=your_dify_api_key_here
DIFY_API_URL=https://api.dify.ai/v1/workflows/run
```

### 4. ローカル実行

```bash
python api/main.py
```

ブラウザで `http://localhost:8000` にアクセス

## 🌐 Vercel デプロイ

### 1. GitHub リポジトリにプッシュ

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Vercel でプロジェクトインポート

1. [Vercel](https://vercel.com) にログイン
2. "New Project" をクリック
3. GitHub リポジトリを選択
4. プロジェクト設定:
   - Framework Preset: Other
   - Build Command: (空白)
   - Output Directory: (空白)
   - Install Command: `pip install -r requirements.txt`

### 3. 環境変数の設定

Vercel ダッシュボードで以下の環境変数を設定:

- `DIFY_API_KEY`: あなたの Dify API キー
- `DIFY_API_URL`: Dify ワークフローのエンドポイント

### 4. デプロイ

設定完了後、自動的にデプロイが開始されます。

## 📁 プロジェクト構造

```
pdf-file-renamer/
├── api/
│   └── main.py              # FastAPI メインアプリケーション
├── src/
│   ├── __init__.py
│   ├── dify_client.py       # Dify API クライアント
│   └── file_renamer.py      # ファイルリネーム機能
├── config/
│   ├── settings.json        # アプリケーション設定
│   └── .env                 # 環境変数（秘匿情報）
├── dify_config/
│   └── *.yml               # Difyワークフロー設定
├── index.html              # フロントエンド
├── vercel.json             # Vercel設定
├── requirements.txt        # Python依存関係
├── .gitignore             # Git除外設定
└── README.md              # このファイル
```

## 🔑 Dify 設定

### 1. Dify アカウント作成

[Dify](https://dify.ai) でアカウントを作成

### 2. ワークフロー作成

1. 新しいワークフローを作成
2. ファイル入力ノードを追加
3. テキスト抽出ノードを追加
4. パラメーター抽出ノードで以下を設定:
   - 発行機関の抽出
   - 書類種別の抽出
   - 日付の抽出

### 3. API 設定

1. ワークフローを公開
2. API キーを取得
3. ワークフロー URL を取得

## 📚 API エンドポイント

### 基本情報

- `GET /api/health` - ヘルスチェック
- `GET /api/` - API 情報

### ファイル処理

- `POST /api/process` - 単一ファイル処理
- `POST /api/process-multiple` - 複数ファイル一括処理

### ダウンロード

- `GET /api/download/{filename}` - 個別ファイルダウンロード
- `GET /api/download-all` - 全ファイル ZIP ダウンロード

### ファイル管理

- `GET /api/files` - ファイル一覧取得
- `DELETE /api/files/{filename}` - ファイル削除

## 🛡️ セキュリティ

- ファイルサイズ制限: 10MB
- 対応形式: PDF のみ
- ディレクトリトラバーサル対策
- CORS 設定

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 サポート

問題が発生した場合は、以下を確認してください:

1. **環境変数**: DIFY_API_KEY と DIFY_API_URL が正しく設定されているか
2. **ファイル形式**: PDF 形式のファイルをアップロードしているか
3. **ファイルサイズ**: 10MB 以下のファイルか
4. **Dify 設定**: ワークフローが正しく設定されているか

デバッグ情報はブラウザの開発者ツール（F12）のコンソールで確認できます。
