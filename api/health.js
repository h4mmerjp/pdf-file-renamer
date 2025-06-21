// ヘルスチェックAPI
export default function handler(req, res) {
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

  // 環境変数チェック
  const envCheck = {
    DIFY_API_KEY: process.env.DIFY_API_KEY ? "set" : "missing",
    DIFY_API_URL: process.env.DIFY_API_URL ? "set" : "missing",
  };

  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: "vercel-nodejs",
    node_version: process.version,
    environment_vars: envCheck,
    api_endpoints: [
      "/api/hello",
      "/api/health",
      "/api/test-dify",
      "/api/process",
    ],
  });
}
