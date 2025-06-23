// src/lib/dify-client.ts
import {
  DifyConfig,
  DifyFileUploadResponse,
  DifyWorkflowInput,
  DifyWorkflowResponse,
} from "@/types/dify";

export class DifyClient {
  private config: DifyConfig;

  constructor(config: DifyConfig) {
    this.config = config;
  }

  /**
   * ファイルをDifyにアップロード
   */
  async uploadFile(file: File, userId?: string): Promise<DifyFileUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("user", userId || this.config.userId || "default-user");

    const response = await fetch("https://api.dify.ai/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`File upload failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * ワークフローを実行
   */
  async runWorkflow(input: DifyWorkflowInput): Promise<DifyWorkflowResponse> {
    const response = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Workflow execution failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * ファイル付きワークフローの実行（便利メソッド）
   */
  async runWorkflowWithFile(
    file: File,
    additionalInputs: Record<string, any> = {},
    userId?: string
  ): Promise<DifyWorkflowResponse> {
    // 1. ファイルをアップロード
    const uploadResult = await this.uploadFile(file, userId);

    // 2. ワークフローを実行
    const workflowInput: DifyWorkflowInput = {
      inputs: additionalInputs,
      response_mode: "blocking",
      user: userId || this.config.userId || "default-user",
      files: [
        {
          transfer_method: "local_file",
          upload_file_id: uploadResult.id,
          type: this.getFileType(file.type),
        },
      ],
    };

    return this.runWorkflow(workflowInput);
  }

  /**
   * 複数ファイルを順次処理
   */
  async processMultipleFiles(
    files: File[],
    additionalInputs: Record<string, any> = {},
    userId?: string,
    onProgress?: (index: number, total: number, result?: DifyWorkflowResponse, error?: Error) => void
  ): Promise<Array<{ file: File; result?: DifyWorkflowResponse; error?: Error }>> {
    const results: Array<{ file: File; result?: DifyWorkflowResponse; error?: Error }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await this.runWorkflowWithFile(file, additionalInputs, userId);
        results.push({ file, result });
        onProgress?.(i + 1, files.length, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        results.push({ file, error: err });
        onProgress?.(i + 1, files.length, undefined, err);
      }
    }

    return results;
  }

  /**
   * ファイルタイプを判定
   */
  private getFileType(mimeType: string): "image" | "document" | "audio" | "video" {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  }
}

// デフォルトクライアントを作成するヘルパー
export function createDifyClient(apiKey?: string, apiUrl?: string): DifyClient {
  return new DifyClient({
    apiKey: apiKey || process.env.DIFY_API_KEY || "",
    apiUrl: apiUrl || process.env.DIFY_API_URL || "",
    userId: "default-user",
  });
}