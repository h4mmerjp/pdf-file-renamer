"use client";

import { useState, useRef, useCallback } from "react";
import { ProcessedFile, DifyWorkflowResponse } from "@/types/dify";
import { processFilesSequentially } from "@/lib/dify-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, File, X, CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";

interface DifyFileProcessorProps {
  title?: string;
  description?: string;
  acceptedFileTypes?: string[];
  acceptedMimeTypes?: string;
  maxFiles?: number;
  additionalInputs?: Record<string, any>;
  userId?: string;
  onProcessingComplete?: (results: ProcessedFile[]) => void;
  onFileResult?: (file: ProcessedFile, result?: DifyWorkflowResponse, error?: string) => void;
  resultRenderer?: (file: ProcessedFile) => React.ReactNode;
}

export default function DifyFileProcessor({
  title = "ファイル処理",
  description = "ファイルをアップロードしてDifyで処理します",
  acceptedFileTypes = [".pdf", ".txt", ".docx"],
  acceptedMimeTypes = "application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  maxFiles = 10,
  additionalInputs = {},
  userId,
  onProcessingComplete,
  onFileResult,
  resultRenderer,
}: DifyFileProcessorProps) {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    handleFiles(selectedFiles);
  }, []);

  const handleFiles = useCallback((newFiles: File[]) => {
    const processedFiles: ProcessedFile[] = newFiles.slice(0, maxFiles).map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      status: "pending",
      progress: 0,
    }));
    
    setFiles(processedFiles);
  }, [maxFiles]);

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const startProcessing = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);

    // 実際のFileオブジェクトを取得
    const fileInput = fileInputRef.current;
    const selectedFiles = fileInput?.files;
    
    if (!selectedFiles) {
      setIsProcessing(false);
      return;
    }

    const fileArray = Array.from(selectedFiles);

    try {
      await processFilesSequentially(
        fileArray,
        additionalInputs,
        userId,
        (completed, total, currentFileName, result, error) => {
          const fileIndex = fileArray.findIndex(f => f.name === currentFileName);
          const fileId = files[fileIndex]?.id;
          
          if (!fileId) return;

          setFiles(prev => prev.map(f => {
            if (f.id === fileId) {
              const updatedFile = {
                ...f,
                status: error ? "error" as const : (completed > fileIndex ? "completed" as const : "processing" as const),
                progress: error ? 0 : (completed > fileIndex ? 100 : 50),
                result,
                error,
              };
              
              // コールバックを呼び出し
              if (completed > fileIndex) {
                onFileResult?.(updatedFile, result, error);
              }
              
              return updatedFile;
            }
            return f;
          }));
        }
      );

      // 処理完了時のコールバック
      onProcessingComplete?.(files);
    } catch (error) {
      console.error("Processing failed:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [files, additionalInputs, userId, onProcessingComplete, onFileResult]);

  const getStatusIcon = (status: ProcessedFile["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ProcessedFile["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "error":
        return "bg-red-100 text-red-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-gray-600">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ファイルアップロードエリア */}
          <Card
            className={`border-2 border-dashed transition-colors cursor-pointer ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="p-6 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg mb-2">ファイルをドラッグ&ドロップ</p>
              <p className="text-gray-600 mb-4">または</p>
              <Button disabled={isProcessing}>
                ファイルを選択
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                対応形式: {acceptedFileTypes.join(", ")} (最大{maxFiles}ファイル)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptedMimeTypes}
                onChange={handleFileChange}
                className="hidden"
              />
            </CardContent>
          </Card>

          {/* 選択されたファイル一覧 */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">
                選択されたファイル ({files.length}件)
              </h3>
              {files.map((file) => (
                <div key={file.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(file.status)}
                      <span className="font-medium">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(file.status)}>
                        {file.status === "pending" && "待機中"}
                        {file.status === "processing" && "処理中"}
                        {file.status === "completed" && "完了"}
                        {file.status === "error" && "エラー"}
                      </Badge>
                      {file.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          disabled={isProcessing}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {file.status === "processing" && (
                    <Progress value={file.progress} className="mb-2" />
                  )}

                  {file.error && (
                    <div className="text-sm text-red-600">
                      <strong>エラー:</strong> {file.error}
                    </div>
                  )}

                  {file.result && resultRenderer && resultRenderer(file)}
                  
                  {file.result && !resultRenderer && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <strong>処理完了</strong>
                      <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                        {JSON.stringify(file.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}

              <Button
                onClick={startProcessing}
                disabled={isProcessing || files.length === 0}
                className="w-full"
              >
                {isProcessing ? "処理中..." : "処理を開始"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}