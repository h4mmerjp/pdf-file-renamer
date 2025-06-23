// ダウンロード用API
export default function handler(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
      debug: `Expected GET, received ${req.method}`,
    });
  }

  // URLからファイル名を取得
  const filename = req.query.filename;
  
  if (!filename) {
    return res.status(400).json({
      error: "Filename not provided",
      debug: "Expected filename parameter in query",
    });
  }

  try {
    // デコードしたファイル名
    const decodedFilename = decodeURIComponent(filename);
    console.log("Download request for:", decodedFilename);

    // 注意: この実装では元のファイルデータを保持していないため
    // 実際にはセッションストレージやデータベースに保存する必要があります
    // 現在はプレースホルダーレスポンスを返します

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${decodedFilename}"`);
    
    // プレースホルダーコンテンツ
    const placeholderContent = `This is a placeholder for the renamed file: ${decodedFilename}
    
Original processing would have renamed the uploaded PDF to this filename.
To implement actual file download, you would need to:
1. Store the processed file data during upload
2. Retrieve it here using the filename as a key
3. Stream the actual file content

Generated at: ${new Date().toISOString()}`;

    res.status(200).send(placeholderContent);

  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({
      error: "Download failed",
      debug: error.message,
    });
  }
}