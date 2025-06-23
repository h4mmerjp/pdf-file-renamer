// src/examples/document-analysis.tsx
import DifyFileProcessor from "@/components/DifyFileProcessor";
import { ProcessedFile } from "@/types/dify";
import { extractOutputFromDifyResult } from "@/lib/dify-utils";

export default function DocumentAnalysisApp() {
  const handleFileResult = (file: ProcessedFile, result?: any, error?: string) => {
    if (error) {
      console.error(`${file.name}の処理でエラー:`, error);
      return;
    }
    
    if (result) {
      console.log(`${file.name}の処理完了:`, result);
    }
  };

  const renderCustomResult = (file: ProcessedFile) => {
    if (!file.result) return null;
    
    const summary = extractOutputFromDifyResult(file.result, "summary");
    const sentiment = extractOutputFromDifyResult(file.result, "sentiment");
    const keywords = extractOutputFromDifyResult(file.result, "keywords");
    
    return (
      <div className="mt-3 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">分析結果</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">要約:</span>
            <p className="text-gray-700">{summary}</p>
          </div>
          <div>
            <span className="font-medium">感情分析:</span>
            <span className={`ml-2 px-2 py-1 rounded text-xs ${
              sentiment === 'positive' ? 'bg-green-100 text-green-800' :
              sentiment === 'negative' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {sentiment}
            </span>
          </div>
          <div>
            <span className="font-medium">キーワード:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {keywords?.map((keyword: string, index: number) => (
                <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">文書分析システム</h1>
      
      <DifyFileProcessor
        title="文書を分析"
        description="PDFや文書ファイルをアップロードして、要約・感情分析・キーワード抽出を行います"
        acceptedFileTypes={[".pdf", ".txt", ".docx"]}
        acceptedMimeTypes="application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        maxFiles={5}
        additionalInputs={{
          analysisType: "comprehensive",
          language: "japanese",
          extractKeywords: true,
          sentimentAnalysis: true
        }}
        userId="doc-analyzer-user"
        onFileResult={handleFileResult}
        resultRenderer={renderCustomResult}
      />
    </div>
  );
}