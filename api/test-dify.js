// 修正版 Dify API接続テスト (DIFY_BASE_URL対応)
export default async function handler(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.DIFY_API_KEY;
  const baseUrl = process.env.DIFY_BASE_URL;

  console.log("Environment check:");
  console.log("- DIFY_API_KEY exists:", !!apiKey);
  console.log("- DIFY_BASE_URL:", baseUrl);

  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: "DIFY_API_KEY not configured",
      message: "Vercelの環境変数でDIFY_API_KEYを設定してください",
    });
    return;
  }

  if (!baseUrl) {
    res.status(500).json({
      success: false,
      error: "DIFY_BASE_URL not configured", 
      message: "Vercelの環境変数でDIFY_BASE_URLを設定してください",
    });
    return;
  }

  try {
    // Dify APIの基本接続テスト
    console.log("Testing Dify connection to:", `${baseUrl}/info`);
    
    const testResponse = await fetch(`${baseUrl}/info`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("Dify API response status:", testResponse.status);
    
    const difyStatus = testResponse.ok ? "connected" : "failed";

    res.status(200).json({
      success: true,
      dify_connection: difyStatus,
      dify_status_code: testResponse.status,
      api_key_length: apiKey.length,
      base_url: baseUrl,
      timestamp: new Date().toISOString(),
      message:
        difyStatus === "connected"
          ? "Dify API接続成功"
          : "Dify API接続に問題があります",
    });
  } catch (error) {
    console.error("Dify connection error:", error);
    res.status(500).json({
      success: false,
      error: "Dify API connection failed",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}