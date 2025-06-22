// PDF処理API (新ワークフロー対応版)
export default async function handler(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      success: false,
      error: "Method not allowed",
      message: "このエンドポイントはPOSTメソッドのみ対応しています",
    });
    return;
  }

  const apiKey = process.env.DIFY_API_KEY;
  const apiUrl = process.env.DIFY_API_URL;

  if (!apiKey || !apiUrl) {
    res.status(500).json({
      success: false,
      error: "Configuration error",
      message: "Dify API設定が不完全です。環境変数を確認してください。",
    });
    return;
  }

  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        success: false,
        error: "No files provided",
        message: "処理するファイルが指定されていません",
      });
      return;
    }

    if (files.length > 5) {
      res.status(400).json({
        success: false,
        error: "Too many files",
        message: "一度に処理できるファイルは5個までです",
      });
      return;
    }

    console.log(`📄 Processing ${files.length} files...`);
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        console.log(`📋 [${i + 1}/${files.length}] Processing: ${file.name}`);

        const validationError = validateFile(file);
        if (validationError) {
          throw new Error(validationError);
        }

        const base64Data = file.data.split(",")[1];
        if (!base64Data) {
          throw new Error("無効なBase64データです");
        }

        const buffer = Buffer.from(base64Data, "base64");

        if (buffer.length > 10 * 1024 * 1024) {
          throw new Error("ファイルサイズが10MBを超えています");
        }

        // Dify APIでPDF処理
        const difyResult = await processPDFWithDify(
          buffer,
          file.name,
          apiKey,
          apiUrl
        );

        // 新しいファイル名を生成
        const newFilename = generateFilename(difyResult, file.name);

        results.push({
          original_filename: file.name,
          new_filename: newFilename,
          analysis: {
            issuing_organization: difyResult.issuing_organization,
            document_type: difyResult.document_type,
            extracted_date: difyResult.document_date,
            confidence: difyResult.confidence || 0.8,
          },
          processed_data: file.data,
          status: "success",
        });

        console.log(`✅ Success: ${file.name} -> ${newFilename}`);

        if (i < files.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Error processing ${file.name}:`, error.message);

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
    console.error("PDF処理エラー:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "PDF処理中にエラーが発生しました",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

function validateFile(file) {
  if (!file.name) return "ファイル名が指定されていません";
  if (!file.data) return "ファイルデータが指定されていません";

  const allowedExtensions = [".pdf"];
  const extension = file.name.toLowerCase().split(".").pop();
  if (!allowedExtensions.includes(`.${extension}`)) {
    return `サポートされていないファイル形式です（対応形式: ${allowedExtensions.join(
      ", "
    )}）`;
  }

  if (!file.data.startsWith("data:application/pdf;base64,")) {
    return "無効なPDFファイル形式です";
  }

  return null;
}

async function processPDFWithDify(fileBuffer, filename, apiKey, apiUrl) {
  console.log(`📤 Starting Dify API processing for: ${filename}`);

  try {
    // 1段階目: ファイルアップロード
    console.log("🔄 Step 1: Uploading file to Dify...");

    const uploadFormData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    uploadFormData.append("file", blob, filename);
    uploadFormData.append("user", "universal-doc-processor");

    const uploadResponse = await fetch("https://api.dify.ai/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: uploadFormData,
    });

    console.log(`📤 Upload response status: ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(
        `❌ Upload failed: ${uploadResponse.status} - ${errorText}`
      );
      throw new Error(`ファイルアップロードエラー (${uploadResponse.status})`);
    }

    const uploadResult = await uploadResponse.json();
    console.log("📤 Upload success:", { id: uploadResult.id });

    // 2段階目: ワークフロー実行
    console.log("⚙️ Step 2: Running workflow...");

    const workflowData = {
      inputs: {
        file: uploadResult.id,
      },
      response_mode: "blocking",
      user: "universal-doc-processor",
    };

    console.log("⚙️ Workflow request data:", workflowData);

    const workflowResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(workflowData),
    });

    console.log(`⚙️ Workflow response status: ${workflowResponse.status}`);

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error(
        `❌ Workflow failed: ${workflowResponse.status} - ${errorText}`
      );
      throw new Error(`ワークフロー実行エラー (${workflowResponse.status})`);
    }

    const workflowResult = await workflowResponse.json();
    console.log(
      "⚙️ Workflow success. Data structure:",
      Object.keys(workflowResult)
    );

    if (workflowResult.data) {
      console.log("📊 Workflow data keys:", Object.keys(workflowResult.data));
      if (workflowResult.data.outputs) {
        console.log("📋 Workflow outputs:", workflowResult.data.outputs);
      }
    }

    const outputs = workflowResult.data?.outputs || {};

    console.log("🔍 Extracted values:", {
      issuing_organization: outputs.issuing_organization,
      document_type: outputs.document_type,
      document_date: outputs.document_date,
      document_name: outputs.document_name,
    });

    return {
      issuing_organization: outputs.issuing_organization || "不明機関",
      document_type: outputs.document_type || "その他書類",
      document_date: outputs.document_date || formatCurrentDate(),
      document_name: outputs.document_name || "不明書類",
      confidence: calculateConfidence(outputs),
      raw_response: workflowResult,
    };
  } catch (error) {
    console.error("❌ Dify API処理エラー:", error);

    const fallbackResult = {
      issuing_organization: inferOrganizationFromFilename(filename),
      document_type: inferDocumentTypeFromFilename(filename),
      document_date: formatCurrentDate(),
      document_name: `${inferOrganizationFromFilename(
        filename
      )}_${inferDocumentTypeFromFilename(filename)}`,
      confidence: 0.3,
      error: error.message,
      fallback: true,
    };

    console.log("🔄 Using fallback analysis:", fallbackResult);
    return fallbackResult;
  }
}

function calculateConfidence(outputs) {
  let confidence = 0.5;

  if (
    outputs.issuing_organization &&
    !outputs.issuing_organization.includes("不明")
  ) {
    confidence += 0.2;
  }

  if (outputs.document_type && !outputs.document_type.includes("その他")) {
    confidence += 0.2;
  }

  if (outputs.document_date && outputs.document_date !== formatCurrentDate()) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

function inferOrganizationFromFilename(filename) {
  const orgPatterns = {
    支払基金: ["支払", "基金", "shikyu"],
    国保連: ["国保", "kokaho", "連合"],
    Amazon: ["amazon"],
    楽天: ["rakuten"],
    セブン: ["seven", "711"],
    ローソン: ["lawson"],
  };

  const lowerFilename = filename.toLowerCase();

  for (const [org, patterns] of Object.entries(orgPatterns)) {
    if (
      patterns.some((pattern) => lowerFilename.includes(pattern.toLowerCase()))
    ) {
      return org;
    }
  }

  return "不明機関";
}

function inferDocumentTypeFromFilename(filename) {
  const typePatterns = {
    増減点連絡書: ["増減", "zougen"],
    返戻内訳書: ["返戻", "henrei"],
    "過誤・再審査結果通知書": ["過誤", "kago"],
    診療報酬明細書: ["明細", "meisai"],
    領収書: ["receipt", "領収", "ryoshu"],
    請求書: ["invoice", "請求", "seikyu"],
    契約書: ["contract", "契約", "keiyaku"],
  };

  const lowerFilename = filename.toLowerCase();

  for (const [type, patterns] of Object.entries(typePatterns)) {
    if (
      patterns.some((pattern) => lowerFilename.includes(pattern.toLowerCase()))
    ) {
      return type;
    }
  }

  return "その他書類";
}

function generateFilename(analysis, originalFilename) {
  const date = analysis.document_date;
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

function formatCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}
