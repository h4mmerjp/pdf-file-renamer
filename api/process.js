// PDF処理API (改善版 - Dify連携最適化)
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

  // 環境変数の検証
  const apiKey = process.env.DIFY_API_KEY;
  const apiUrl = process.env.DIFY_API_URL;

  if (!apiKey || !apiUrl) {
    res.status(500).json({
      success: false,
      error: "Configuration error",
      message: "Dify API設定が不完全です。環境変数を確認してください。",
      debug: {
        api_key_set: !!apiKey,
        api_url_set: !!apiUrl,
        api_url: apiUrl,
      },
    });
    return;
  }

  try {
    const { files } = req.body;

    // リクエストバリデーション
    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({
        success: false,
        error: "No files provided",
        message: "処理するファイルが指定されていません",
      });
      return;
    }

    // ファイル数制限
    if (files.length > 5) {
      res.status(400).json({
        success: false,
        error: "Too many files",
        message: "一度に処理できるファイルは5個までです",
      });
      return;
    }

    console.log(`Processing ${files.length} files...`);
    const results = [];

    // 各ファイルを順次処理（並列処理だとDify APIが制限される可能性）
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        console.log(`[${i + 1}/${files.length}] Processing: ${file.name}`);

        // ファイルバリデーション
        const validationError = validateFile(file);
        if (validationError) {
          throw new Error(validationError);
        }

        // Base64データをBufferに変換
        const base64Data = file.data.split(",")[1];
        if (!base64Data) {
          throw new Error("無効なBase64データです");
        }

        const buffer = Buffer.from(base64Data, "base64");

        // 実際のファイルサイズをチェック
        if (buffer.length > 10 * 1024 * 1024) {
          throw new Error("ファイルサイズが10MBを超えています");
        }

        // 2段階処理: 1. ファイルアップロード → 2. ワークフロー実行
        const difyResult = await processPDFWithDify(
          buffer,
          file.name,
          apiKey,
          apiUrl
        );

        // 新しいファイル名を生成
        const newFilename = generateJapaneseFilename(difyResult, file.name);

        results.push({
          original_filename: file.name,
          new_filename: newFilename,
          analysis: {
            issuing_organization: difyResult.issuing_organization,
            document_type: difyResult.document_type,
            extracted_date: difyResult.date,
            confidence: difyResult.confidence || 0.8,
          },
          processed_data: file.data,
          status: "success",
        });

        console.log(`✅ Success: ${file.name} -> ${newFilename}`);

        // APIレート制限を考慮して少し待機
        if (i < files.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
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

    // 結果をまとめて返却
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

// ファイルバリデーション
function validateFile(file) {
  if (!file.name) {
    return "ファイル名が指定されていません";
  }

  if (!file.data) {
    return "ファイルデータが指定されていません";
  }

  // ファイル拡張子チェック
  const allowedExtensions = [".pdf"];
  const extension = file.name.toLowerCase().split(".").pop();
  if (!allowedExtensions.includes(`.${extension}`)) {
    return `サポートされていないファイル形式です（対応形式: ${allowedExtensions.join(
      ", "
    )}）`;
  }

  // MIME typeチェック
  const allowedMimeTypes = ["application/pdf"];
  if (file.type && !allowedMimeTypes.includes(file.type)) {
    return `サポートされていないMIMEタイプです: ${file.type}`;
  }

  // Base64データの形式チェック
  if (!file.data.startsWith("data:application/pdf;base64,")) {
    return "無効なPDFファイル形式です";
  }

  return null;
}

// Dify APIでPDFを処理（2段階処理）
async function processPDFWithDify(fileBuffer, filename, apiKey, apiUrl) {
  try {
    console.log(`📤 Uploading file to Dify: ${filename}`);

    // 1段階目: ファイルアップロード
    const uploadFormData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    uploadFormData.append("file", blob, filename);
    uploadFormData.append("user", "pdf-renamer-user");

    // ファイルアップロードAPI
    const uploadResponse = await fetch("https://api.dify.ai/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(
        `❌ Dify upload error: ${uploadResponse.status} - ${errorText}`
      );
      throw new Error(
        `ファイルアップロードエラー (${uploadResponse.status}): ${errorText}`
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log("📤 Upload success:", uploadResult);

    // 2段階目: ワークフロー実行
    console.log(`⚙️ Running workflow for: ${filename}`);

    const workflowData = {
      inputs: {
        file: uploadResult.id, // アップロードされたファイルのIDを使用
      },
      response_mode: "blocking",
      user: "pdf-renamer-user",
    };

    const workflowResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(workflowData),
    });

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error(
        `❌ Dify workflow error: ${workflowResponse.status} - ${errorText}`
      );
      throw new Error(
        `ワークフロー実行エラー (${workflowResponse.status}): ${errorText}`
      );
    }

    const workflowResult = await workflowResponse.json();
    console.log("⚙️ Workflow success:", workflowResult);

    // レスポンスから情報を抽出
    const outputs = workflowResult.data?.outputs || {};

    return {
      issuing_organization: outputs.issuing_organization || "不明機関",
      document_type: outputs.document_type || "その他書類",
      date: extractDateFromResponse(outputs) || formatCurrentDate(),
      confidence: outputs.confidence || 0.8,
      raw_response: workflowResult,
    };
  } catch (error) {
    console.error("❌ Dify API処理エラー:", error);

    // フォールバック: ファイル名から基本的な情報を推測
    return {
      issuing_organization: inferOrganizationFromFilename(filename),
      document_type: inferDocumentTypeFromFilename(filename),
      date: formatCurrentDate(),
      confidence: 0.3,
      error: error.message,
    };
  }
}

// ファイル名から組織を推測
function inferOrganizationFromFilename(filename) {
  const orgPatterns = {
    支払基金: ["支払", "基金", "shikyu"],
    国保連: ["国保", "kokaho", "連合"],
  };

  for (const [org, patterns] of Object.entries(orgPatterns)) {
    if (patterns.some((pattern) => filename.toLowerCase().includes(pattern))) {
      return org;
    }
  }

  return "不明機関";
}

// ファイル名から書類種別を推測
function inferDocumentTypeFromFilename(filename) {
  const typePatterns = {
    増減点連絡書: ["増減", "zougen"],
    返戻内訳書: ["返戻", "henrei"],
    "過誤・再審査結果通知書": ["過誤", "kago", "再審査"],
    診療報酬明細書: ["明細", "meisai"],
  };

  for (const [type, patterns] of Object.entries(typePatterns)) {
    if (patterns.some((pattern) => filename.toLowerCase().includes(pattern))) {
      return type;
    }
  }

  return "その他書類";
}

// レスポンスから日付を抽出
function extractDateFromResponse(outputs) {
  if (outputs.date) {
    return formatDate(outputs.date);
  }

  const text = outputs.text || outputs.content || "";
  return extractDateFromText(text);
}

// テキストから日付を抽出
function extractDateFromText(text) {
  const datePatterns = [
    /(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})[日]?/,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(\d{4})(\d{2})(\d{2})/,
    /令和(\d{1,2})[年](\d{1,2})[月](\d{1,2})[日]?/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern.source.includes("令和")) {
        const reiwaYear = parseInt(match[1]);
        const year = 2018 + reiwaYear;
        const month = match[2].padStart(2, "0");
        const day = match[3].padStart(2, "0");
        return `${year}${month}${day}`;
      } else {
        let year, month, day;

        if (match[1].length === 4) {
          year = match[1];
          month = match[2].padStart(2, "0");
          day = match[3].padStart(2, "0");
        } else {
          month = match[1].padStart(2, "0");
          day = match[2].padStart(2, "0");
          year = match[3];
        }

        return `${year}${month}${day}`;
      }
    }
  }

  return null;
}

// 日付文字列をフォーマット
function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return formatCurrentDate();
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return `${year}${month}${day}`;
}

// 現在の日付をフォーマット
function formatCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");

  return `${year}${month}${day}`;
}

// 日本語ファイル名を生成
function generateJapaneseFilename(analysis, originalFilename) {
  const date = analysis.date;
  const org = normalizeOrganizationName(analysis.issuing_organization);
  const type = normalizeDocumentType(analysis.document_type);

  const ext = originalFilename.split(".").pop();

  return `${date}_${org}_${type}.${ext}`;
}

// 組織名の正規化
function normalizeOrganizationName(org) {
  const orgMap = {
    支払基金: "支払基金",
    社会保険診療報酬支払基金: "支払基金",
    国保連: "国保連",
    国民健康保険団体連合会: "国保連",
    不明: "不明機関",
  };

  for (const [key, value] of Object.entries(orgMap)) {
    if (org.includes(key)) {
      return value;
    }
  }

  return org || "不明機関";
}

// 書類種別の正規化
function normalizeDocumentType(type) {
  const typeMap = {
    増減点: "増減点連絡書",
    返戻: "返戻内訳書",
    過誤: "過誤・再審査結果通知書",
    調整: "保険過誤調整結果通知書",
    資格: "資格確認結果連絡書",
    振込: "当座口振込通知書",
    明細: "診療報酬明細書",
    通知: "医療費通知",
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (type.includes(key)) {
      return value;
    }
  }

  return type || "その他書類";
}
