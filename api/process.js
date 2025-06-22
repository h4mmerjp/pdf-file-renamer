// PDF処理API (修正版 - BASE_URL対応)
import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
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
    });
  }

  try {
    console.log("=== PDF HANDLER START ===");
    console.log("Starting PDF processing...");
    console.log("Environment check:");
    console.log("- DIFY_API_KEY exists:", !!process.env.DIFY_API_KEY);
    console.log("- DIFY_BASE_URL:", process.env.DIFY_BASE_URL);

    // FormDataでファイルを受信
    const form = formidable({
      maxFileSize: 15 * 1024 * 1024, // 15MB制限
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    console.log("Files parsed:", Object.keys(files));

    // JSONリクエストの場合の処理
    if (
      !files.file &&
      req.headers["content-type"]?.includes("application/json")
    ) {
      console.log("Processing JSON request...");
      const rawData = [];
      req.on("data", (chunk) => rawData.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(rawData).toString();
        const { files: jsonFiles } = JSON.parse(body);
        return processJSONFiles(jsonFiles, res);
      });
      return;
    }

    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({
        error: "No file uploaded",
        debug: "files object does not contain a file property",
      });
    }

    console.log("File details:", {
      originalFilename: uploadedFile.originalFilename,
      size: uploadedFile.size,
      mimetype: uploadedFile.mimetype,
    });

    // PDFファイルの検証
    if (uploadedFile.mimetype !== "application/pdf") {
      return res.status(400).json({
        error: "Invalid file type",
        debug: `Expected PDF but got ${uploadedFile.mimetype}`,
      });
    }

    // 1. Difyにファイルアップロード
    console.log("=== STEP 1: UPLOAD TO DIFY ===");
    const uploadResult = await uploadFileToDify(uploadedFile);

    if (!uploadResult.success) {
      console.error("Upload failed:", uploadResult);
      return res.status(400).json({
        error: "File upload to Dify failed",
        debug: uploadResult.debug,
        difyError: uploadResult.error,
      });
    }

    console.log("File uploaded successfully, ID:", uploadResult.fileId);

    // 2. ワークフロー実行
    console.log("=== STEP 2: RUN WORKFLOW ===");
    const workflowResult = await runDifyWorkflow(uploadResult.fileId);

    if (!workflowResult.success) {
      console.error("Workflow execution failed:", workflowResult);
      return res.status(500).json({
        error: "Workflow execution failed",
        debug: workflowResult.debug,
        difyError: workflowResult.error,
      });
    }

    console.log("Workflow completed successfully");
    console.log("Extracted data:", workflowResult.data);

    // 3. ファイル名生成
    const newFilename = generateFilename(
      workflowResult.data,
      uploadedFile.originalFilename
    );

    // 4. 結果を返す
    res.status(200).json({
      success: true,
      message: "PDF処理が完了しました",
      timestamp: new Date().toISOString(),
      results: [
        {
          original_filename: uploadedFile.originalFilename,
          new_filename: newFilename,
          analysis: workflowResult.data,
          status: "success",
        },
      ],
      debug: {
        fileId: uploadResult.fileId,
        workflowExecuted: true,
        extractedParams: workflowResult.data,
      },
    });
  } catch (error) {
    console.error("Handler error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: "Internal server error",
      debug: error.message,
      errorType: error.constructor.name,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// JSONファイルリクエストの処理
async function processJSONFiles(files, res) {
  try {
    console.log(`Processing ${files.length} files from JSON request...`);
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);

        // Base64データをバッファに変換
        const base64Data = file.data.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");

        // 一時ファイルを作成
        const tempFile = {
          originalFilename: file.name,
          size: buffer.length,
          mimetype: "application/pdf",
          filepath: null,
        };

        // バッファから直接処理
        const uploadResult = await uploadBufferToDify(buffer, file.name);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error);
        }

        const workflowResult = await runDifyWorkflow(uploadResult.fileId);

        if (!workflowResult.success) {
          throw new Error(workflowResult.error);
        }

        const newFilename = generateFilename(workflowResult.data, file.name);

        results.push({
          original_filename: file.name,
          new_filename: newFilename,
          analysis: workflowResult.data,
          processed_data: file.data,
          status: "success",
        });
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.push({
          original_filename: file.name,
          new_filename: file.name,
          analysis: null,
          processed_data: file.data,
          status: "error",
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    res.status(200).json({
      success: true,
      message: `${files.length}個のファイルを処理しました（成功: ${successCount}、エラー: ${errorCount}）`,
      timestamp: new Date().toISOString(),
      results: results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: errorCount,
        success_rate: Math.round((successCount / results.length) * 100),
      },
    });
  } catch (error) {
    console.error("JSON processing error:", error);
    res.status(500).json({
      error: "JSON processing failed",
      debug: error.message,
    });
  }
}

// Difyにファイルをアップロード（ファイルパス版）
async function uploadFileToDify(file) {
  try {
    console.log("Creating FormData for upload...");
    const formData = new FormData();
    const fileStream = fs.createReadStream(file.filepath);

    formData.append("file", fileStream, {
      filename: file.originalFilename,
      contentType: file.mimetype,
    });
    formData.append("user", "pdf-renamer-user");

    console.log("Sending file to Dify upload endpoint...");
    console.log("Upload URL:", `${process.env.DIFY_BASE_URL}/files/upload`);

    const response = await fetch(`${process.env.DIFY_BASE_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log("Dify upload response status:", response.status);
    console.log("Dify upload response body:", responseText);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        debug: `Upload failed with status ${response.status}. Response: ${responseText}`,
      };
    }

    const result = JSON.parse(responseText);

    if (!result.id) {
      return {
        success: false,
        error: "No file ID returned",
        debug: `Response missing ID field. Full response: ${responseText}`,
      };
    }

    return {
      success: true,
      fileId: result.id,
      debug: `File uploaded successfully with ID: ${result.id}`,
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: error.message,
      debug: `Upload exception: ${error.message}`,
      stack: error.stack,
    };
  }
}

// Difyにバッファをアップロード（Base64データ版）
async function uploadBufferToDify(buffer, filename) {
  try {
    console.log(`Creating FormData for buffer upload: ${filename}`);
    const formData = new FormData();

    formData.append("file", buffer, {
      filename: filename,
      contentType: "application/pdf",
    });
    formData.append("user", "pdf-renamer-user");

    console.log("Sending buffer to Dify upload endpoint...");

    const response = await fetch(`${process.env.DIFY_BASE_URL}/files/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log("Dify buffer upload response status:", response.status);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        debug: `Buffer upload failed with status ${response.status}. Response: ${responseText}`,
      };
    }

    const result = JSON.parse(responseText);

    if (!result.id) {
      return {
        success: false,
        error: "No file ID returned",
        debug: `Response missing ID field. Full response: ${responseText}`,
      };
    }

    return {
      success: true,
      fileId: result.id,
      debug: `Buffer uploaded successfully with ID: ${result.id}`,
    };
  } catch (error) {
    console.error("Buffer upload error:", error);
    return {
      success: false,
      error: error.message,
      debug: `Buffer upload exception: ${error.message}`,
    };
  }
}

// ワークフロー実行
async function runDifyWorkflow(fileId) {
  try {
    // YAMLファイルの設定に基づいた正しいリクエスト形式
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

    console.log("Workflow URL:", `${process.env.DIFY_BASE_URL}/workflows/run`);
    console.log("Sending workflow request...");
    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${process.env.DIFY_BASE_URL}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("Workflow response status:", response.status);
    console.log("Workflow response text:", responseText.substring(0, 500));

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        debug: `Workflow failed with status ${
          response.status
        }. Response: ${responseText.substring(0, 500)}...`,
      };
    }

    // JSON解析
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      return {
        success: false,
        error: "Invalid JSON response",
        debug: `JSON parse failed: ${
          parseError.message
        }. Response: ${responseText.substring(0, 200)}`,
      };
    }

    // ワークフローの状態を確認
    if (result.data && result.data.status === "failed") {
      return {
        success: false,
        error: result.data.error || "Workflow execution failed",
        debug: `Workflow failed: ${result.data.error}. Elapsed time: ${result.data.elapsed_time}s`,
      };
    }

    // データ抽出
    const extractedData = extractDataFromResponse(result);

    return {
      success: true,
      data: extractedData,
      debug: `Workflow completed successfully.`,
      rawResponse: result,
    };
  } catch (error) {
    console.error("Workflow error:", error);
    return {
      success: false,
      error: error.message,
      debug: `Workflow exception: ${error.message}`,
    };
  }
}

// レスポンスからデータを抽出
function extractDataFromResponse(result) {
  console.log("=== DATA EXTRACTION ===");
  console.log("Full result structure:", Object.keys(result));

  let extractedData = {
    issuing_organization: "",
    document_type: "",
    document_date: "",
    document_name: "",
    confidence: 0.5,
  };

  // パターン1: result.data.outputs内をチェック
  if (
    result.data &&
    result.data.outputs &&
    typeof result.data.outputs === "object"
  ) {
    console.log("Pattern 1: Checking result.data.outputs");
    const outputs = result.data.outputs;

    // 直接アクセス
    if (outputs.issuing_organization)
      extractedData.issuing_organization = outputs.issuing_organization;
    if (outputs.document_type)
      extractedData.document_type = outputs.document_type;
    if (outputs.document_date)
      extractedData.document_date = outputs.document_date;
    if (outputs.document_name)
      extractedData.document_name = outputs.document_name;
  }

  // パターン2: result.data直下をチェック
  if (result.data && typeof result.data === "object") {
    console.log("Pattern 2: Checking result.data directly");
    if (
      result.data.issuing_organization &&
      !extractedData.issuing_organization
    ) {
      extractedData.issuing_organization = result.data.issuing_organization;
    }
    if (result.data.document_type && !extractedData.document_type) {
      extractedData.document_type = result.data.document_type;
    }
    if (result.data.document_date && !extractedData.document_date) {
      extractedData.document_date = result.data.document_date;
    }
    if (result.data.document_name && !extractedData.document_name) {
      extractedData.document_name = result.data.document_name;
    }
  }

  // デフォルト値の設定
  if (!extractedData.issuing_organization)
    extractedData.issuing_organization = "不明機関";
  if (!extractedData.document_type) extractedData.document_type = "その他書類";
  if (!extractedData.document_date)
    extractedData.document_date = formatCurrentDate();
  if (!extractedData.document_name) {
    extractedData.document_name = `${extractedData.issuing_organization}_${extractedData.document_type}`;
  }

  console.log("Final extracted data:", extractedData);
  return extractedData;
}

// ファイル名生成
function generateFilename(analysis, originalFilename) {
  const date = analysis.document_date || formatCurrentDate();
  const documentName =
    analysis.document_name ||
    `${analysis.issuing_organization}_${analysis.document_type}`;

  const ext = originalFilename.split(".").pop();

  // 特殊文字を除去・置換
  const cleanDocumentName = documentName
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");

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
