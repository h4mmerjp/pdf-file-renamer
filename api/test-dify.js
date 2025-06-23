// CommonJS版 Dify API接続テスト
const fetch = require('node-fetch');

module.exports = async function handler(req, res) {
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

  console.log("Dify API Test - Environment check:");
  console.log("- DIFY_API_KEY exists:", !!apiKey);
  console.log("- DIFY_BASE_URL:", baseUrl);

  // API Key チェック
  if (!apiKey) {
    res.status(500).json({
      success: false,
      error: "DIFY_API_KEY not configured",
      message: "Vercelの環境変数でDIFY_API_KEYを設定してください",
      debug: {
        DIFY_API_KEY: "missing",
        DIFY_BASE_URL: baseUrl || "missing"
      }
    });
    return;
  }

  // Base URL チェック
  if (!baseUrl) {
    res.status(500).json({
      success: false,
      error: "DIFY_BASE_URL not configured", 
      message: "Vercelの環境変数でDIFY_BASE_URLを設定してください（例: https://api.dify.ai/v1）",
      debug: {
        DIFY_API_KEY: "set",
        DIFY_BASE_URL: "missing"
      }
    });
    return;
  }

  try {
    // Dify APIの基本接続テスト
    const testUrl = `${baseUrl}/info`;
    console.log("Testing Dify connection to:", testUrl);
    
    const testResponse = await fetch(testUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000
    });
    
    console.log("Dify API response status:", testResponse.status);
    
    let responseData = null;
    let responseText = "";
    
    try {
      responseText = await testResponse.text();
      if (responseText) {
        responseData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.log("Response parsing info:", parseError.message);
    }
    
    const difyStatus = testResponse.ok ? "connected" : "failed";

    res.status(200).json({
      success: true,
      dify_connection: difyStatus,
      dify_status_code: testResponse.status,
      dify_status_text: testResponse.statusText,
      api_key_length: apiKey.length,
      base_url: baseUrl,
      test_url: testUrl,
      response_data: responseData,
      timestamp: new Date().toISOString(),
      message: difyStatus === "connected"
        ? "Dify API接続成功"
        : `Dify API接続に問題があります (${testResponse.status}: ${testResponse.statusText})`,
      debug: {
        environment: "vercel",
        node_version: process.version
      }
    });
    
  } catch (error) {
    console.error("Dify connection error:", error);
    
    let errorMessage = "Dify API connection failed";
    let errorDetails = error.message;
    
    if (error.type === 'request-timeout') {
      errorMessage = "Dify API connection timeout";
      errorDetails = "接続がタイムアウトしました (10秒)";
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = "Dify API endpoint not found";
      errorDetails = "ネットワーク接続またはURL設定を確認してください";
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString(),
      debug: {
        error_name: error.name,
        error_code: error.code,
        base_url: baseUrl,
        api_key_configured: !!apiKey
      }
    });
  }
};
