// 統合版 ヘルスチェック＆Dify接続テストAPI
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

  const startTime = Date.now();
  console.log("Health check with Dify test started");

  // 基本的な環境変数チェック
  const envCheck = {
    DIFY_API_KEY: process.env.DIFY_API_KEY ? "set" : "missing",
    DIFY_BASE_URL: process.env.DIFY_BASE_URL ? "set" : "missing",
  };

  // Dify接続テスト
  let difyConnectionResult = {
    status: "not_tested",
    message: "Dify connection not tested",
    details: null,
    error: null,
    response_time: null
  };

  // DIFY_API_KEYとDIFY_BASE_URLが設定されている場合のみテスト実行
  if (process.env.DIFY_API_KEY && process.env.DIFY_BASE_URL) {
    try {
      const difyStartTime = Date.now();
      const testUrl = `${process.env.DIFY_BASE_URL}/info`;
      
      console.log("Testing Dify connection to:", testUrl);
      
      const difyResponse = await Promise.race([
        fetch(testUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
            "Content-Type": "application/json",
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Dify connection timeout (10s)")), 10000)
        )
      ]);
      
      const difyResponseTime = Date.now() - difyStartTime;
      console.log("Dify API response status:", difyResponse.status, "in", difyResponseTime + "ms");
      
      let responseData = null;
      let responseText = "";
      
      try {
        responseText = await difyResponse.text();
        if (responseText) {
          responseData = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.log("Dify response parsing info:", parseError.message);
      }
      
      if (difyResponse.ok) {
        difyConnectionResult = {
          status: "connected",
          message: "Dify API接続成功",
          details: {
            status_code: difyResponse.status,
            status_text: difyResponse.statusText,
            response_time: difyResponseTime,
            test_url: testUrl,
            response_data: responseData
          },
          error: null,
          response_time: difyResponseTime
        };
      } else {
        difyConnectionResult = {
          status: "failed",
          message: `Dify API接続失敗 (${difyResponse.status}: ${difyResponse.statusText})`,
          details: {
            status_code: difyResponse.status,
            status_text: difyResponse.statusText,
            response_time: difyResponseTime,
            test_url: testUrl,
            response_text: responseText.substring(0, 500) // 最初の500文字のみ
          },
          error: `HTTP ${difyResponse.status}: ${difyResponse.statusText}`,
          response_time: difyResponseTime
        };
      }
      
    } catch (error) {
      console.error("Dify connection error:", error);
      
      let errorMessage = "Dify API connection failed";
      let errorDetails = error.message;
      
      if (error.message.includes("timeout")) {
        errorMessage = "Dify API connection timeout";
        errorDetails = "接続がタイムアウトしました (10秒)";
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = "Dify API endpoint not found";
        errorDetails = "ネットワーク接続またはURL設定を確認してください";
      }
      
      difyConnectionResult = {
        status: "error",
        message: errorMessage,
        details: {
          error_name: error.name,
          error_code: error.code,
          error_message: error.message,
          test_url: process.env.DIFY_BASE_URL ? `${process.env.DIFY_BASE_URL}/info` : "URL not configured"
        },
        error: errorDetails,
        response_time: null
      };
    }
  } else {
    // 環境変数が不足している場合
    const missingVars = [];
    if (!process.env.DIFY_API_KEY) missingVars.push("DIFY_API_KEY");
    if (!process.env.DIFY_BASE_URL) missingVars.push("DIFY_BASE_URL");
    
    difyConnectionResult = {
      status: "not_configured",
      message: `Dify設定が不完全です: ${missingVars.join(", ")} が設定されていません`,
      details: {
        missing_variables: missingVars,
        required_variables: ["DIFY_API_KEY", "DIFY_BASE_URL"]
      },
      error: "Environment variables not configured",
      response_time: null
    };
  }

  const totalResponseTime = Date.now() - startTime;

  // 総合的なヘルス状態を判定
  let overallStatus = "healthy";
  let overallMessage = "All systems operational";

  if (difyConnectionResult.status === "not_configured") {
    overallStatus = "warning";
    overallMessage = "System operational but Dify not configured";
  } else if (difyConnectionResult.status === "error" || difyConnectionResult.status === "failed") {
    overallStatus = "degraded";
    overallMessage = "System operational but Dify connection issues";
  }

  // レスポンス構築
  const healthResponse = {
    status: overallStatus,
    message: overallMessage,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: "vercel-nodejs",
    node_version: process.version,
    response_time: totalResponseTime,
    
    // 基本システム情報
    system: {
      status: "operational",
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      environment_vars: envCheck
    },
    
    // Dify接続テスト結果
    dify_connection: difyConnectionResult,
    
    // 利用可能なAPIエンドポイント
    api_endpoints: [
      "/api/health",
      "/api/process",
      "/api/download"
    ],
    
    // 設定状況のサマリー
    configuration_summary: {
      dify_configured: envCheck.DIFY_API_KEY === "set" && envCheck.DIFY_BASE_URL === "set",
      api_functional: true,
      ready_for_processing: difyConnectionResult.status === "connected"
    }
  };

  // ステータスコードの決定
  let statusCode = 200;
  if (overallStatus === "degraded") {
    statusCode = 503; // Service Unavailable
  } else if (overallStatus === "warning") {
    statusCode = 200; // OK but with warnings
  }

  console.log(`Health check completed in ${totalResponseTime}ms, status: ${overallStatus}`);

  res.status(statusCode).json(healthResponse);
};
