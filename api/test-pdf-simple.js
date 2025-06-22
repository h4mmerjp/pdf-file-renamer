// 簡易PDFテストAPI
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        // シンプルなテストページを表示
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>PDF Dify 簡易テスト</title>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .container { max-width: 800px; margin: 0 auto; }
                .result { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; }
                .error { background: #f8d7da; border: 1px solid #f5c6cb; }
                .info { background: #d1ecf1; border: 1px solid #bee5eb; }
                button { padding: 10px 20px; margin: 10px 5px; }
                pre { white-space: pre-wrap; font-size: 12px; max-height: 300px; overflow-y: auto; }
                .step { margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>PDF Dify API 簡易テスト</h1>
                
                <div class="info">
                    <h3>📋 テスト手順</h3>
                    <ol>
                        <li>環境変数確認</li>
                        <li>Dify基本接続テスト</li>
                        <li>PDFファイルアップロードテスト</li>
                    </ol>
                </div>
                
                <div class="step">
                    <h3>1. 環境変数確認</h3>
                    <button onclick="checkEnvironment()">環境変数チェック</button>
                    <div id="envResult"></div>
                </div>
                
                <div class="step">
                    <h3>2. Dify基本接続テスト</h3>
                    <button onclick="testDifyConnection()">Dify接続テスト</button>
                    <div id="connectionResult"></div>
                </div>
                
                <div class="step">
                    <h3>3. PDFファイルテスト</h3>
                    <input type="file" id="pdfFile" accept=".pdf" />
                    <button onclick="testPDFUpload()">PDFテスト実行</button>
                    <div id="pdfResult"></div>
                </div>
            </div>

            <script>
                async function checkEnvironment() {
                    const result = document.getElementById('envResult');
                    result.innerHTML = '<p>環境変数をチェック中...</p>';
                    
                    try {
                        const response = await fetch('/api/test-pdf-simple?check=env');
                        const data = await response.json();
                        
                        result.className = 'result ' + (data.success ? 'success' : 'error');
                        result.innerHTML = \`
                            <h4>環境変数チェック結果</h4>
                            <p>DIFY_API_KEY: \${data.env.DIFY_API_KEY}</p>
                            <p>DIFY_BASE_URL: \${data.env.DIFY_BASE_URL}</p>
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        \`;
                    } catch (error) {
                        result.className = 'result error';
                        result.innerHTML = \`<h4>エラー</h4><p>\${error.message}</p>\`;
                    }
                }
                
                async function testDifyConnection() {
                    const result = document.getElementById('connectionResult');
                    result.innerHTML = '<p>Dify API接続をテスト中...</p>';
                    
                    try {
                        const response = await fetch('/api/test-pdf-simple?check=connection');
                        const data = await response.json();
                        
                        result.className = 'result ' + (data.success ? 'success' : 'error');
                        result.innerHTML = \`
                            <h4>Dify接続テスト結果</h4>
                            <p>ステータス: \${data.status}</p>
                            <p>接続: \${data.success ? '✅ 成功' : '❌ 失敗'}</p>
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        \`;
                    } catch (error) {
                        result.className = 'result error';
                        result.innerHTML = \`<h4>エラー</h4><p>\${error.message}</p>\`;
                    }
                }
                
                async function testPDFUpload() {
                    const fileInput = document.getElementById('pdfFile');
                    const result = document.getElementById('pdfResult');
                    
                    if (!fileInput.files[0]) {
                        result.className = 'result error';
                        result.innerHTML = '<h4>エラー</h4><p>PDFファイルを選択してください</p>';
                        return;
                    }
                    
                    const file = fileInput.files[0];
                    
                    if (file.type !== 'application/pdf') {
                        result.className = 'result error';
                        result.innerHTML = '<h4>エラー</h4><p>PDFファイルを選択してください</p>';
                        return;
                    }
                    
                    result.innerHTML = '<p>PDFファイルをテスト中...</p>';
                    
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        
                        const response = await fetch('/api/test-pdf-simple', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        
                        result.className = 'result ' + (data.success ? 'success' : 'error');
                        result.innerHTML = \`
                            <h4>PDFテスト結果</h4>
                            <p>ファイル: \${file.name}</p>
                            <p>結果: \${data.success ? '✅ 成功' : '❌ 失敗'}</p>
                            \${data.error ? \`<p>エラー: \${data.error}</p>\` : ''}
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        \`;
                    } catch (error) {
                        result.className = 'result error';
                        result.innerHTML = \`<h4>エラー</h4><p>\${error.message}</p>\`;
                    }
                }
            </script>
        </body>
        </html>
        `;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);
    }

    if (req.method === 'POST') {
        // PDFファイルテストを実行
        try {
            const formidable = (await import('formidable')).default;
            const form = formidable({
                maxFileSize: 15 * 1024 * 1024,
                keepExtensions: true,
            });

            const [fields, files] = await form.parse(req);
            const uploadedFile = files.file?.[0];

            if (!uploadedFile) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            // 基本的なファイル検証
            const result = {
                success: true,
                file: {
                    name: uploadedFile.originalFilename,
                    size: uploadedFile.size,
                    type: uploadedFile.mimetype
                },
                environment: {
                    DIFY_API_KEY: !!process.env.DIFY_API_KEY,
                    DIFY_BASE_URL: process.env.DIFY_BASE_URL
                },
                message: 'ファイル受信成功。Dify API連携を実装してください。'
            };

            return res.status(200).json({
                success: response.ok,
                status: response.status,
                statusText: response.statusText,
                url: `${process.env.DIFY_BASE_URL}/info`,
                message: response.ok ? 'Dify API接続成功' : 'Dify API接続失敗'
            });

        } catch (error) {
            return res.status(200).json({
                success: false,
                error: error.message,
                message: 'Dify API接続エラー'
            });
        }
    }

    return res.status(405).json({
        error: 'Method not allowed'
    });
}).json(result);

        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // GETクエリパラメータでの各種チェック
    if (req.query.check === 'env') {
        return res.status(200).json({
            success: !!(process.env.DIFY_API_KEY && process.env.DIFY_BASE_URL),
            env: {
                DIFY_API_KEY: process.env.DIFY_API_KEY ? '設定済み' : '未設定',
                DIFY_BASE_URL: process.env.DIFY_BASE_URL || '未設定'
            }
        });
    }

    if (req.query.check === 'connection') {
        try {
            const fetch = (await import('node-fetch')).default;
            
            // Dify APIへの基本的な接続テスト
            const response = await fetch(`${process.env.DIFY_BASE_URL}/info`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return res.status(200