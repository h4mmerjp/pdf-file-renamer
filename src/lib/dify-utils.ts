// src/lib/dify-utils.ts
import { DifyWorkflowResponse } from "@/types/dify";

/**
 * 単一ファイルをDifyで処理
 */
export async function processSingleFile(
  file: File,
  additionalInputs: Record<string, any> = {},
  userId?: string
): Promise<DifyWorkflowResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("additionalInputs", JSON.stringify(additionalInputs));
  if (userId) {
    formData.append("userId", userId);
  }

  const response = await fetch("/api/dify/process", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "処理に失敗しました");
  }

  const result = await response.json();
  return result.result;
}

/**
 * 複数ファイルをDifyで処理
 */
export async function processMultipleFiles(
  files: File[],
  additionalInputs: Record<string, any> = {},
  userId?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Array<{ filename: string; success: boolean; result?: DifyWorkflowResponse; error?: string }>> {
  const formData = new FormData();
  
  // ファイルを追加
  files.forEach((file, index) => {
    formData.append(`file_${index}`, file);
  });
  
  formData.append("additionalInputs", JSON.stringify(additionalInputs));
  if (userId) {
    formData.append("userId", userId);
  }

  const response = await fetch("/api/dify/process", {
    method: "PUT",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "処理に失敗しました");
  }

  const result = await response.json();
  return result.results;
}

/**
 * ファイルを順次処理（プログレス付き）
 */
export async function processFilesSequentially(
  files: File[],
  additionalInputs: Record<string, any> = {},
  userId?: string,
  onProgress?: (completed: number, total: number, currentFile: string, result?: DifyWorkflowResponse, error?: string) => void
): Promise<Array<{ filename: string; success: boolean; result?: DifyWorkflowResponse; error?: string }>> {
  const results: Array<{ filename: string; success: boolean; result?: DifyWorkflowResponse; error?: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      onProgress?.(i, files.length, file.name);
      
      const result = await processSingleFile(file, additionalInputs, userId);
      
      results.push({
        filename: file.name,
        success: true,
        result,
      });
      
      onProgress?.(i + 1, files.length, file.name, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      results.push({
        filename: file.name,
        success: false,
        error: errorMessage,
      });
      
      onProgress?.(i + 1, files.length, file.name, undefined, errorMessage);
    }
  }

  return results;
}

/**
 * Difyワークフローの結果から特定の出力を取得
 */
export function extractOutputFromDifyResult(
  result: DifyWorkflowResponse,
  outputKey: string
): any {
  return result.data?.outputs?.[outputKey];
}

/**
 * Difyワークフローの結果を整形
 */
export function formatDifyResult(result: DifyWorkflowResponse) {
  return {
    id: result.workflow_run_id,
    status: result.data.status,
    outputs: result.data.outputs,
    tokens: result.data.total_tokens,
    steps: result.data.total_steps,
    elapsedTime: result.data.elapsed_time,
    createdAt: new Date(result.data.created_at * 1000),
    finishedAt: new Date(result.data.finished_at * 1000),
  };
}

/**
 * エラーハンドリング用のヘルパー関数
 */
export function handleDifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as any).message);
  }
  
  return 'Unknown error occurred';
}

/**
 * ファイル検証用のヘルパー関数
 */
export function validateFile(file: File, allowedTypes: string[], maxSize: number): { valid: boolean; error?: string } {
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `サポートされていないファイル形式です: ${file.type}`
    };
  }
  
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `ファイルサイズが大きすぎます: ${(file.size / 1024 / 1024).toFixed(2)}MB (最大: ${(maxSize / 1024 / 1024).toFixed(2)}MB)`
    };
  }
  
  return { valid: true };
}

/**
 * 複数ファイルの検証
 */
export function validateFiles(files: File[], allowedTypes: string[], maxSize: number, maxCount: number): { validFiles: File[]; errors: string[] } {
  const validFiles: File[] = [];
  const errors: string[] = [];
  
  if (files.length > maxCount) {
    errors.push(`ファイル数が上限を超えています: ${files.length}/${maxCount}`);
    return { validFiles: [], errors };
  }
  
  files.forEach((file, index) => {
    const validation = validateFile(file, allowedTypes, maxSize);
    if (validation.valid) {
      validFiles.push(file);
    } else {
      errors.push(`ファイル${index + 1} (${file.name}): ${validation.error}`);
    }
  });
  
  return { validFiles, errors };
}