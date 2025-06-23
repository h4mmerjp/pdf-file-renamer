// 完全修正版 PDF処理API (Dify連携強化)
import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 300, // 5分（Vercel Pro以上）
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

  try {
    const contentType = req.headers["content-type"] || "";
    console.log(`[${requestId}] Content-Type:`, contentType);

    // JSONリクエストの処理
    if (contentType.includes("application/json")) {
      console.log(`[${requestId}] Processing JSON request...`);
      return await handleJsonRequest(req, res, requestId, startTime);
    }

    // FormDataリクエストの処理
    if (contentType.includes("multipart/form-data")) {
      console.log(`[${requestId}] Processing FormData request...`);
      return await handleFormDataRequest(req, res, requestId, startTime);
    }

    return res.status(400).json({
      error: "Unsupported content type",
      debug: `Content-Type: ${contentType}`,
      requestId,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Handler error after ${duration}ms:`, error);
    
    res.status(500).json({
      error: "Internal server error",
      debug: error.message,
      duration,
      requestId,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// JSONリクエストの処理（複数ファイル対応）
async function handleJsonRequest(req, res, requestId, startTime) {
  return new Promise((resolve) => {
    const chunks = [];
    let totalSize = 0;
    const maxSize = 50 * 1024 * 1024; // 50MB制限

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        console.error(`[${requestId}] Request too large: ${totalSize} bytes`);
        res.status(413).json({
          error: "Request too large",
          debug: `Size: ${totalSize} bytes, Max: ${maxSize} bytes`,
          requestId,
        });
        resolve();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", async () => {
      try {
        const duration = Date.now() - startTime;
        console.log(`[${requestId}] JSON data received after ${duration}ms, size: ${totalSize} bytes`);

        const body = Buffer.concat(chunks).toString();
        
        let jsonData;
        try {
          jsonData = JSON.parse(body);
        } catch (parseError) {
          console.error(`[${requestId}] JSON parse error:`, parseError.message);
          res.status(400).json({
            error: "Invalid JSON",
            debug: `Parse error: ${parseError.message}`,
            requestId,
          });
          resolve();
          return;
        }

        if (!jsonData.files || !Array.isArray(jsonData.files) || jsonData.files.length === 0) {
          res.status(400).json({
            error: "No files in JSON request",
            debug: "Expected 'files' array in JSON body",
            requestId,
          });
          resolve();
          return;
        }

        // 複数ファイル処理
        await processMultipleFiles(jsonData.files, res, requestId, startTime);
        resolve();

      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${requestId}] JSON processing error after ${duration}ms:`, error);
        res.status(500).json({
          error: "JSON processing failed",
          debug: error.message,
          duration,
          requestId,
        });
        resolve();
      }
    });

    req.on("error", (error) => {
      console.error(`[${requestId}] Request error:`, error);
      res.status(500).json({
        error: "Request error",
        debug: error.message,
        requestId,
      });
      resolve();
    });
  });
}

// FormDataリクエストの処理（単一ファイル）
async function handleFormDataRequest(req, res, requestId, startTime) {
  try {
    const form = formidable({
      maxFileSize: 15 * 1024 * 1024, // 15MB制限
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
        supportedTypes: ["application/pdf", "image/jpeg", "image/png", "image/gif"],
        requestId,
      });
    }

    // 単一ファイル処理
    const result = await processSingleFile(uploadedFile, requestId);
    
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
    return res.status(500).json({
      error: "FormData processing failed",
      debug: error.message,
      duration,
      requestId,
    });
  }
}

// 複数ファイル処理（順次処理）
async function processMultipleFiles(files, res, requestId, startTime) {
  const results = [];
  const maxProcessingTime = 280000; // 280秒制限（5分-20秒のマージン）

  console.log(`[${requestId}] Processing ${files.length} files sequentially...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileStartTime = Date.now();
    const elapsedTotal = fileStartTime - startTime;

    if (elapsedTotal > maxProcessingTime) {
      console.log(`[${requestId}] Time limit reached, stopping at file ${i + 1}/${files.length}`);
      break;
    }

    try {
      console.log(`[${requestId}] Processing file ${i + 1}/${files.length}: ${file.name}`);

      // ファイルバリデーション
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
      console.log(`[${requestId}] File ${file.name}: ${buffer.length} bytes`);

      // タイムアウト付きでDify処理を実行
      const fileResult = await Promise.race([
        processSingleFileBuffer(buffer, file.name, requestId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("File processing timeout")), 60000)
        )
      ]);

      results.push({
        original_filename: file.name,
        new_filename: fileResult.new_filename,
        analysis: fileResult.analysis,
        downloadUrl: `/api/download/${encodeURIComponent(fileResult.new_filename)}`,
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
        downloadUrl: null,
        status: "error",
        error: error.message,
        processing_time: processingTime,
      });
    }

    // 次のファイルまで少し待機
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const totalDuration = Date.now() - startTime;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  console.log(`[${requestId}] Processing complete after ${totalDuration}ms: ${successCount} success, ${errorCount} errors`);

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

// 単一ファイル処理（ファイルオブジェクト版）
async function processSingleFile(file, requestId) {
  // 1. Difyにファイルアップロード
  console.log(`[${requestId}] Step 1: Upload to Dify`);
  const uploadResult = await uploadFileToDify(file, requestId);

  if (!uploadResult.success) {
    throw new Error(`Upload failed: ${uploadResult.error}`);
  }

  console.log(`[${requestId}] File uploaded with ID: ${uploadResult.fileId}`);

  // 2. ワークフロー実行
  console.log(`[${requestId}] Step 2: Run workflow`);
  const workflowResult = await runDifyWorkflow(uploadResult.fileId, requestId);

  if (!workflowResult.success) {
    throw new Error(`Workflow failed: ${workflowResult.error}`);
  }

  // 3. ファイル名生成
  const newFilename = generateFilename(workflowResult.data, file.originalFilename);

  return {
    original_filename: file.originalFilename,
    new_filename: newFilename,
    analysis: workflowResult.data,
    downloadUrl: `/api/download/${encodeURIComponent(newFilename)}`,
    status: "success",
  };
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

// Difyにファイルをアップロード
async function uploadFileToDify(file, requestId) {
  try {
    const formData = new FormData();
    const fileStream = fs.createReadStream(file.filepath);

    formData.append("file", fileStream, {
      filename: file.originalFilename,
      contentType: file.mimetype,
    });
    formData.append("user", "pdf-renamer-user");

    console.log(`[${requestId}] Uploading to: ${process.env.DIFY_BASE_URL}/files/upload`);

    const response = await fetch(`${process.env.DIFY_BASE_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
      timeout: 60000, // 60秒タイムアウト
    });

    const responseText = await response.text();
    console.log(`[${requestId}] Upload response: ${response.status}`);

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
    console.error(`[${requestId}] Upload error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Difyにバッファをアップロード
async function uploadBufferToDify(buffer, filename, requestId) {
  try {
    const formData = new FormData();

    formData.append("file", buffer, {
      filename: filename,
      contentType: getContentType(filename),
    });
    formData.append("user", "pdf-renamer-user");

    console.log(`[${requestId}] Uploading buffer to: ${process.env.DIFY_BASE_URL}/files/upload`);

    const response = await fetch(`${process.env.DIFY_BASE_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
      timeout: 60000,
    });

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

// ワークフロー実行（ブログ参考の2段階目）
async function runDifyWorkflow(fileId, requestId) {
  try {
    const requestBody = {
      inputs: {
        file: {
          type: "document",
          transfer_method: "local_file",
          upload_file_id: fileId, // ← 1段階目で取得したファイルID
        },
      },
      response_mode: "blocking",
      user: "pdf-renamer-user",
    };

    console.log(`[${requestId}] Running workflow: ${process.env.DIFY_BASE_URL}/workflows/run`);
    console.log(`[${requestId}] Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${process.env.DIFY_BASE_URL}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      timeout: 120000, // 120秒タイムアウト
    });

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

    // YMLファイルで定義されているパラメータを取得
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
    .substring(0, 100); // ファイル名長さ制限

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
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml"
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
    png: "image/png", 
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml"
  };
  return contentTypes[ext] || "application/octet-stream";
}