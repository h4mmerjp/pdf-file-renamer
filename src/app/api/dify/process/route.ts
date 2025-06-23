// src/app/api/dify/process/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createDifyClient } from "@/lib/dify-client";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const additionalInputsStr = formData.get("additionalInputs") as string;
    const userId = formData.get("userId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "ファイルが見つかりません" },
        { status: 400 }
      );
    }

    // 追加の入力パラメータを解析
    let additionalInputs = {};
    if (additionalInputsStr) {
      try {
        additionalInputs = JSON.parse(additionalInputsStr);
      } catch (error) {
        return NextResponse.json(
          { error: "additionalInputsの形式が不正です" },
          { status: 400 }
        );
      }
    }

    // Difyクライアントを作成
    const difyClient = createDifyClient();

    // ワークフローを実行
    const result = await difyClient.runWorkflowWithFile(
      file,
      additionalInputs,
      userId || "default-user"
    );

    return NextResponse.json({
      success: true,
      filename: file.name,
      result,
    });
  } catch (error) {
    console.error("Dify processing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "処理に失敗しました",
      },
      { status: 500 }
    );
  }
}

// 複数ファイル用のエンドポイント
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files: File[] = [];
    const additionalInputsStr = formData.get("additionalInputs") as string;
    const userId = formData.get("userId") as string;

    // 複数ファイルを取得
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file_") && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "ファイルが見つかりません" },
        { status: 400 }
      );
    }

    // 追加の入力パラメータを解析
    let additionalInputs = {};
    if (additionalInputsStr) {
      try {
        additionalInputs = JSON.parse(additionalInputsStr);
      } catch (error) {
        return NextResponse.json(
          { error: "additionalInputsの形式が不正です" },
          { status: 400 }
        );
      }
    }

    // Difyクライアントを作成
    const difyClient = createDifyClient();

    // 複数ファイルを処理
    const results = await difyClient.processMultipleFiles(
      files,
      additionalInputs,
      userId || "default-user"
    );

    return NextResponse.json({
      success: true,
      results: results.map((result) => ({
        filename: result.file.name,
        success: !result.error,
        result: result.result,
        error: result.error?.message,
      })),
    });
  } catch (error) {
    console.error("Multiple file processing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "処理に失敗しました",
      },
      { status: 500 }
    );
  }
}