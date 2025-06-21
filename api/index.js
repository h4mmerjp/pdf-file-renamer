/**
 * Vercel用 Node.js API（代替版）
 */

export default function handler(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONSリクエスト（CORS プリフライト）
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // URLパスを解析
  const { url, method } = req;
  const path = new URL(url, `http://${req.headers.host}`).pathname;

  console.log(`Request: ${method} ${path}`);

  // ルーティング
  if (method === "GET") {
    if (path === "/api/" || path === "/api") {
      res.status(200).json({
        name: "PDF File Renamer API",
        version: "1.0.0",
        status: "running",
        environment: "vercel-nodejs",
        timestamp: new Date().toISOString(),
        message: "Node.js API is working!",
      });
    } else if (path === "/api/health") {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        environment: "vercel-nodejs",
        environment_vars: {
          DIFY_API_KEY: process.env.DIFY_API_KEY ? "set" : "missing",
          DIFY_API_URL: process.env.DIFY_API_URL ? "set" : "missing",
        },
        node_version: process.version,
        path: path,
        method: method,
      });
    } else if (path === "/api/test") {
      res.status(200).json({
        message: "テスト成功！（Node.js版）",
        timestamp: new Date().toISOString(),
        environment: "vercel-nodejs",
        path: path,
      });
    } else {
      res.status(404).json({
        error: "Not Found",
        path: path,
        available_endpoints: ["/api/health", "/api/test", "/api/"],
      });
    }
  } else if (method === "POST") {
    // POST処理（将来の拡張用）
    res.status(200).json({
      message: "POST リクエストを受信しました（Node.js版）",
      timestamp: new Date().toISOString(),
      method: "POST",
      path: path,
    });
  } else {
    res.status(405).json({
      error: "Method Not Allowed",
      method: method,
      path: path,
    });
  }
}
