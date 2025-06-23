// CommonJS版 基本動作確認用API
module.exports = function handler(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    success: true,
    message: "PDF File Renamer API is working!",
    timestamp: new Date().toISOString(),
    environment: "vercel-nodejs",
    version: "1.0.0",
    method: req.method,
    url: req.url,
  });
};
