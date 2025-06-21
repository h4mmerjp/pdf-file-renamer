// Vercel Serverless Function
export default function handler(request, response) {
  // CORS設定
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONSリクエスト処理
  if (request.method === "OPTIONS") {
    response.status(200).end();
    return;
  }

  // GET リクエスト処理
  if (request.method === "GET") {
    response.status(200).json({
      success: true,
      message: "Vercel API は正常に動作しています！",
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      headers: request.headers,
    });
    return;
  }

  // その他のメソッド
  response.status(405).json({
    error: "Method Not Allowed",
    method: request.method,
  });
}
