// 修正版 PDF処理API - AbortController問題修正
import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300, // 5分（Vercel Pro以上で有効）
};

export default async function handler(req, res) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      debug: `Received method: ${req.method}, expected: POST`,
      requestId,
    });
  }

  console.log(`[${requestId}] === PDF HANDLER START ===`);
  console.log(`[${requestId}] Environment check:`);
  console.log(`[${requestId}] - DIFY_API_KEY exists:`, !!process.env.DIFY_API_KEY);
  console.log(`[${requestId}] - DIFY_BASE_URL:`, process.env.DIFY_BASE_URL);

  // 環境変数チェック
  if (!process.env.DIFY_API_KEY || !process.env.DIFY_BASE_URL) {
    return res.status(500).json({
      error: "Missing environment variables",
      debug: {
        DIFY_API_KEY: !!process.env.DIFY_API_KEY,
        DIFY_BASE_URL: !!process.env.DIFY_BASE_URL,
      },
      requestId,
    });
  }

  // グローバルタイムアウト設定（55秒後に強制終了）
  const globalTimeout = setTimeout(() => {
    console.log(`[${requestId}] Global timeout reached, sending response`);
    if (!res.headersSent) {
      res.status(200).json({
        success: true,
        message: "処理がタイムアウトしました。一部のファイルが処理されました。",
        partial: true,
        results: [], // 部分的な結果があればここに含める
        duration: Date.now() - startTime,
        requestId,
      });
    }
  }, 55000);

  try {
    const contentType = req.headers["content-type"] || "";
    console.log(`[${requestId}] Content-Type:`, contentType);

    let result;

    // JSONリクエストの処理
    if (contentType.includes("application/json")) {
      console.log(`[${requestId}] Processing JSON request...`);
      result = await handleJsonRequest(req, res, requestId, startTime, globalTimeout);
    }
    // FormDataリクエストの処理
    else if (contentType.includes("multipart/form-data")) {
      console.log(`[${requestId}] Processing FormData request...`);
      result = await handleFormDataRequest(req, res, requestId, startTime, globalTimeout);
    } else {
      clearTimeout(globalTimeout);
      return res.status(400).json({
        error: "Unsupported content type",
        debug: `Content-Type: ${contentType}`,
        requestId,
      });
    }

    clearTimeout(globalTimeout);
    return result;

  } catch (error) {
    clearTimeout(globalTimeout);
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Handler error after ${duration}ms:`, error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        debug: error.message,
        duration,
        requestId,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
}

// JSONリクエストの処理（ストリーミング改善版）
async function handleJsonRequest(req, res, requestId, startTime, globalTimeout) {
  return new Promise((resolve) => {
    const chunks = [];
    let totalSize = 0;
    const maxSize = 8 * 1024 * 1024; // 8MBに制限を減らす

    // リクエストタイムアウト設定
    const requestTimeout = setTimeout(() => {
      console.log(`[${requestId}] Request reading timeout`);
      if (!res.headersSent) {
        res.status(408).json({
          error: "Request timeout",
          message: "リクエストの読み込みがタイムアウトしました",
          requestId,
        });
      }
      resolve();
    }, 10000); // 10秒でリクエスト読み込みタイムアウト

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        clearTimeout(requestTimeout);
        console.error(`[${requestId}] Request too large: ${totalSize} bytes`);
        if (!res.headersSent) {
          res.status(413).json({
            error: "Request too large",
            debug: `Size: ${totalSize} bytes, Max: ${maxSize} bytes`,
            message: "ファイルサイズが大きすぎます。小さいファイルで再試行してください。",
            requestId,
          });
        }
        resolve();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", async () => {
      clearTimeout(requestTimeout);
      
      try {
        const duration = Date.now() - startTime;
        console.log(`[${requestId}] JSON data received after ${duration}ms, size: ${totalSize} bytes`);

        const body = Buffer.concat(chunks).toString();
        
        let jsonData;
        try {
          jsonData = JSON.parse(body);
        } catch (parseError) {
          console.error(`[${requestId}] JSON parse error:`, parseError.message);
          if (!res.headersSent) {
            res.status(400).json({
              error: "Invalid JSON",
              debug: `Parse error: ${parseError.message}`,
              message: "リクエストデータの形式が正しくありません",
              requestId,
            });
          }
          resolve();
          return;
        }

        if (!jsonData.files || !Array.isArray(jsonData.files) || jsonData.files.length === 0) {
          if (!res.headersSent) {
            res.status(400).json({
              error: "No files in JSON request",
              debug: "Expected 'files' array in JSON body",
              message: "ファイルデータが見つかりません",
              requestId,
            });
          }
          resolve();
          return;
        }

        // ファイル数制限を動的に調整（より安全に）
        const maxFiles = Math.min(jsonData.files.length, 2); // 最大2ファイルまで
        const limitedFiles = jsonData.files.slice(0, maxFiles);

        if (maxFiles < jsonData.files.length) {
          console.log(`[${requestId}] File count limited: ${jsonData.files.length} -> ${maxFiles}`);
        }

        // 複数ファイル処理
        await processMultipleFiles(limitedFiles, res, requestId, startTime, globalTimeout);
        resolve();

      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${requestId}] JSON processing error after ${duration}ms:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            error: "JSON processing failed",
            debug: error.message,
            message: "ファイル処理中にエラーが発生しました",
            duration,
            requestId,
          });
        }
        resolve();
      }
    });

    req.on("error", (error) => {
      clearTimeout(requestTimeout);
      console.error(`[${requestId}] Request error:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Request error",
          debug: error.message,
          message: "リクエストエラーが発生しました",
          requestId,
        });
      }
      resolve();
    });
  });
}

// FormDataリクエストの処理（制限を厳しく）
async function handleFormDataRequest(req, res, requestId, startTime, globalTimeout) {
  try {
    const form = formidable({
      maxFileSize: 3 * 1024 * 1024, // 3MBに制限
      keepExtensions: true,
      maxFiles: 1,
    });

    const [fields, files] = await form.parse(req);
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] FormData parsed after ${duration}ms`);

    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({
        error: "No file uploaded",
        debug: "files object does not contain a file property",
        message: "ファイルがアップロードされていません",
        requestId,
      });
    }

    console.log(`[${requestId}] File details:`, {
      originalFilename: uploadedFile.originalFilename,
      size: uploadedFile.size,
      mimetype: uploadedFile.mimetype,
    });

    // ファイル形式チェック
    if (!isValidFileType(uploadedFile.mimetype)) {
      return res.status(400).json({
        error: "Unsupported file type",
        debug: `Received: ${uploadedFile.mimetype}`,
        supportedTypes: ["application/pdf", "image/jpeg", "image/png"],
        message: "サポートされていないファイル形式です",
        requestId,
      });
    }

    // ファイルをBase64に変換
    const buffer = fs.readFileSync(uploadedFile.filepath);
    const base64Data = `data:${uploadedFile.mimetype};base64,${buffer.toString('base64')}`;

    // 単一ファイル処理（短いタイムアウト）
    const result = await Promise.race([
      processSingleFile(uploadedFile, requestId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Single file processing timeout")), 20000) // 20秒
      )
    ]);
    
    // 結果にBase64データを追加
    result.fileData = base64Data;
    
    return res.status(200).json({
      success: true,
      message: "ファイル処理が完了しました",
      timestamp: new Date().toISOString(),
      results: [result],
      duration: Date.now() - startTime,
      requestId,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] FormData processing error after ${duration}ms:`, error);
    
    if (!res.headersSent) {
      return res.status(500).json({
        error: "FormData processing failed",
        debug: error.message,
        message: "ファイル処理に失敗しました",
        duration,
        requestId,
      });
    }
  }
}

// 複数ファイル処理（修正版・AbortController問題解決）
async function processMultipleFiles(files, res, requestId, startTime, globalTimeout) {
  const results = [];
  const maxProcessingTime = 40000; // 40秒制限に短縮
  const maxFileProcessingTime = 15000; // 1ファイルあたり15秒制限

  console.log(`[${requestId}] Processing ${files.length} files sequentially...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileStartTime = Date.now();
    const elapsedTotal = fileStartTime - startTime;

    // 全体時間制限チェック
    if (elapsedTotal > maxProcessingTime) {
      console.log(`[${requestId}] Time limit reached, stopping at file ${i + 1}/${files.length}`);
      break;
    }

    try {
      console.log(`[${requestId}] Processing file ${i + 1}/${files.length}: ${file.name}`);

      // ファイルバリデーション（厳格化）
      if (!file.name || !file.data) {
        throw new Error("Invalid file data: missing name or data");
      }

      // Base64データの検証と変換
      const base64Match = file.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) {
        throw new Error("Invalid base64 data format");
      }

      const mimeType = base64Match[1];
      const base64Data = base64Match[2];

      if (!isValidFileType(mimeType)) {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      const buffer = Buffer.from(base64Data, "base64");
      
      // ファイルサイズチェック（より厳格に）
      if (buffer.length > 2 * 1024 * 1024) { // 2MB制限
        throw new Error(`File too large: ${buffer.length} bytes (max 2MB)`);
      }

      console.log(`[${requestId}] File ${file.name}: ${buffer.length} bytes`);

      // ファイル処理（短いタイムアウト・修正版）
      const fileResult = await Promise.race([
        processSingleFileBufferWithRetry(buffer, file.name, requestId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("File processing timeout (15s)")), maxFileProcessingTime)
        )
      ]);

      results.push({
        original_filename: file.name,
        new_filename: fileResult.new_filename,
        analysis: fileResult.analysis,
        fileData: file.data,
        status: "success",
        processing_time: Date.now() - fileStartTime,
      });

      console.log(`[${requestId}] File ${file.name} processed successfully`);

    } catch (error) {
      const processingTime = Date.now() - fileStartTime;
      console.error(`[${requestId}] Error processing ${file.name} after ${processingTime}ms:`, error);
      
      results.push({
        original_filename: file.name,
        new_filename: file.name,
        analysis: null,
        fileData: file.data,
        status: "error",
        error: error.message || "Unknown error",
        processing_time: processingTime,
      });
    }

    // 次のファイルまで少し待機（安定性向上）
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms待機
    }

    // レスポンスが既に送信されていたら停止
    if (res.headersSent) {
      console.log(`[${requestId}] Response already sent, stopping processing`);
      break;
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  console.log(`[${requestId}] Processing complete after ${totalDuration}ms: ${successCount} success, ${errorCount} errors`);

  if (!res.headersSent) {
    clearTimeout(globalTimeout);
    res.status(200).json({
      success: true,
      message: `${files.length}個のファイルを処理しました（成功: ${successCount}、エラー: ${errorCount}）`,
      timestamp: new Date().toISOString(),
      results: results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: errorCount,
        success_rate: successCount > 0 ? Math.round((successCount / results.length) * 100) : 0,
        total_duration: totalDuration,
      },
      requestId,
    });
  }
}

// リトライ機能付きファイル処理
async function processSingleFileBufferWithRetry(buffer, filename, requestId, maxRetries = 2) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${requestId}] Processing ${filename} - Attempt ${attempt}/${maxRetries}`);
      
      return await processSingleFileBuffer(buffer, filename, requestId);
    } catch (error) {
      lastError = error;
      console.error(`[${requestId}] Attempt ${attempt} failed for ${filename}:`, error.message);
      
      if (attempt < maxRetries) {
        // 次の試行まで少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  throw lastError;
}

// Difyにバッファをアップロード（改良版・短いタイムアウト）
async function uploadBufferToDify(buffer, filename, requestId) {
  try {
    const formData = new FormData();

    formData.append("file", buffer, {
      filename: filename,
      contentType: getContentType(filename),
    });
    formData.append("user", "pdf-renamer-user");

    console.log(`[${requestId}] Uploading buffer to: ${process.env.DIFY_BASE_URL}/files/upload`);

    const response = await Promise.race([
      fetch(`${process.env.DIFY_BASE_URL}/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
          ...formData.getHeaders(),
        },
        body: formData,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Upload timeout (10s)")), 10000) // 10秒に短縮
      )
    ]);

    const responseText = await response.text();
    console.log(`[${requestId}] Buffer upload response: ${response.status}`);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText}`,
      };
    }

    const result = JSON.parse(responseText);
    
    if (!result.id) {
      return {
        success: false,
        error: "No file ID returned from Dify",
      };
    }

    return {
      success: true,
      fileId: result.id,
    };
  } catch (error) {
    console.error(`[${requestId}] Buffer upload error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ワークフロー実行（改良版・短いタイムアウト）
async function runDifyWorkflow(fileId, requestId) {
  try {
    const requestBody = {
      inputs: {
        file: {
          type: "document",
          transfer_method: "local_file",
          upload_file_id: fileId,
        },
      },
      response_mode: "blocking",
      user: "pdf-renamer-user",
    };

    console.log(`[${requestId}] Running workflow: ${process.env.DIFY_BASE_URL}/workflows/run`);

    const response = await Promise.race([
      fetch(`${process.env.DIFY_BASE_URL}/workflows/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Workflow timeout (20s)")), 20000) // 20秒に短縮
      )
    ]);

    const responseText = await response.text();
    console.log(`[${requestId}] Workflow response: ${response.status}`);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText.substring(0, 500)}`,
      };
    }

    const result = JSON.parse(responseText);

    if (result.data && result.data.status === "failed") {
      return {
        success: false,
        error: result.data.error || "Workflow execution failed",
      };
    }

    const extractedData = extractDataFromResponse(result, requestId);

    return {
      success: true,
      data: extractedData,
    };
  } catch (error) {
    console.error(`[${requestId}] Workflow error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 単一ファイル処理（バッファ版）
async function processSingleFileBuffer(buffer, filename, requestId) {
  // 1. Difyにバッファアップロード
  console.log(`[${requestId}] Step 1: Upload buffer to Dify`);
  const uploadResult = await uploadBufferToDify(buffer, filename, requestId);

  if (!uploadResult.success) {
    throw new Error(`Upload failed: ${uploadResult.error}`);
  }

  console.log(`[${requestId}] Buffer uploaded with ID: ${uploadResult.fileId}`);

  // 2. ワークフロー実行
  console.log(`[${requestId}] Step 2: Run workflow`);
  const workflowResult = await runDifyWorkflow(uploadResult.fileId, requestId);

  if (!workflowResult.success) {
    throw new Error(`Workflow failed: ${workflowResult.error}`);
  }

  // 3. ファイル名生成
  const newFilename = generateFilename(workflowResult.data, filename);

  return {
    original_filename: filename,
    new_filename: newFilename,
    analysis: workflowResult.data,
    status: "success",
  };
}

// 単一ファイル処理（ファイルオブジェクト版）
async function processSingleFile(file, requestId) {
  const buffer = fs.readFileSync(file.filepath);
  return await processSingleFileBuffer(buffer, file.originalFilename, requestId);
}

// レスポンスからデータを抽出
function extractDataFromResponse(result, requestId) {
  console.log(`[${requestId}] Extracting data from response`);

  let extractedData = {
    document_type: "",
    document_date: "",
    document_name: "",
    issuing_organization: "",
  };

  // YMLファイルの設定に基づく出力パラメータをチェック
  if (result.data && result.data.outputs) {
    const outputs = result.data.outputs;
    console.log(`[${requestId}] Available outputs:`, Object.keys(outputs));

    if (outputs.document_type) extractedData.document_type = outputs.document_type;
    if (outputs.document_date) extractedData.document_date = outputs.document_date;
    if (outputs.document_name) extractedData.document_name = outputs.document_name;
    if (outputs.issuing_organization) extractedData.issuing_organization = outputs.issuing_organization;
  }

  // デフォルト値の設定
  if (!extractedData.document_type) extractedData.document_type = "その他書類";
  if (!extractedData.document_date) extractedData.document_date = formatCurrentDate();
  if (!extractedData.issuing_organization) extractedData.issuing_organization = "不明機関";
  if (!extractedData.document_name) {
    extractedData.document_name = `${extractedData.issuing_organization}_${extractedData.document_type}`;
  }

  console.log(`[${requestId}] Final extracted data:`, extractedData);
  return extractedData;
}

// ファイル名生成
function generateFilename(analysis, originalFilename) {
  const date = analysis.document_date || formatCurrentDate();
  const documentName = analysis.document_name || `${analysis.issuing_organization}_${analysis.document_type}`;

  const ext = originalFilename.split(".").pop();
  const cleanDocumentName = documentName
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50); // ファイル名長さ制限

  return `${date}_${cleanDocumentName}.${ext}`;
}

// 現在日付フォーマット
function formatCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ファイル形式チェック
function isValidFileType(mimeType) {
  const supportedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg", 
    "image/png"
  ];
  return supportedTypes.includes(mimeType);
}

// ファイル名からContent-Typeを取得
function getContentType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const contentTypes = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png"
  };
  return contentTypes[ext] || "application/octet-stream";
}
