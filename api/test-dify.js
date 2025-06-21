// Dify API接続テスト
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
  const apiUrl = process.env.DIFY_API_URL;

  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: "DIFY_API_KEY not configured",
      message: "Vercelの環境変数でDIFY_API_KEYを設定してください",
    });
    return;
  }

  if (!apiUrl) {
    res.status(500).json({
      success: false,
      error: "DIFY_API_URL not configured",
      message: "Vercelの環境変数でDIFY_API_URLを設定してください",
    });
    return;
  }

  try {
    // Dify APIの基本接続テスト
    const testResponse = await fetch("https://api.dify.ai/v1", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    const difyStatus = testResponse.ok ? "connected" : "failed";

    res.status(200).json({
      success: true,
      dify_connection: difyStatus,
      dify_status_code: testResponse.status,
      api_key_length: apiKey.length,
      api_url: apiUrl,
      timestamp: new Date().toISOString(),
      message:
        difyStatus === "connected"
          ? "Dify API接続成功"
          : "Dify API接続に問題があります",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Dify API connection failed",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
