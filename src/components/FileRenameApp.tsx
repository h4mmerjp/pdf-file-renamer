"use client";

import React, { useState, useRef } from 'react';
import { Upload, Download, AlertCircle, CheckCircle, Clock, Loader2, Bug, Terminal } from 'lucide-react';
import DifyFileProcessor from '../components/DifyFileProcessor';
import { ProcessedFile } from '../types/dify';

interface DifyConfig {
  apiUrl: string;
  apiKey: string;
  userId: string;
}

interface DebugLog {
  timestamp: string;
  level: 'info' | 'error' | 'warning';
  message: string;
  data?: unknown;
}

const FileRenameApp = () => {
  const [config, setConfig] = useState<DifyConfig>({
    apiUrl: 'https://api.dify.ai/v1/workflows/run',
    apiKey: '',
    userId: 'user-12345'
  });
  const [showConfig, setShowConfig] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [completedFiles, setCompletedFiles] = useState<ProcessedFile[]>([]);

  // デバッグログ追加関数
  const addDebugLog = (level: 'info' | 'error' | 'warning', message: string, data?: unknown) => {
    const log: DebugLog = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data
    };
    setDebugLogs(prev => [...prev, log].slice(-50));
    
    const consoleMethod = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
    consoleMethod(`[${log.timestamp}] ${message}`, data || '');
  };

  const clearDebugLogs = () => setDebugLogs([]);

  // ファイル処理結果のハンドラー
  const handleFileResult = (file: ProcessedFile, result?: any, error?: string) => {
    if (error) {
      addDebugLog('error', `ファイル処理失敗: ${file.name}`, { error });
      return;
    }
    
    if (result && result.data?.outputs) {
      const outputs = result.data.outputs;
      const processedFile: ProcessedFile = {
        ...file,
        result: {
          renamed_filename: outputs.renamed_filename || 'renamed_file.pdf',
          company: outputs.company || '',
          date: outputs.date || '',
          amount: Number(outputs.amount) || 0,
          description: outputs.description || ''
        }
      };
      
      setCompletedFiles(prev => [...prev, processedFile]);
      addDebugLog('info', `ファイル処理完了: ${file.name}`, outputs);
    }
  };

  // 処理完了時のハンドラー
  const handleProcessingComplete = (results: ProcessedFile[]) => {
    addDebugLog('info', '全ファイル処理完了', { fileCount: results.length });
  };

  // カスタム結果レンダラー
  const renderFileResult = (file: ProcessedFile) => {
    if (!file.result) return null;
    
    return (
      <div className="mt-3 p-4 bg-green-50 rounded-lg">
        <h4 className="font-semibold text-green-900 mb-2">処理結果</h4>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">新しいファイル名:</span>
            <span className="ml-2 text-green-700">{file.result.renamed_filename}</span>
          </div>
          <div>
            <span className="font-medium">会社名:</span>
            <span className="ml-2">{file.result.company}</span>
          </div>
          <div>
            <span className="font-medium">日付:</span>
            <span className="ml-2">{file.result.date}</span>
          </div>
          <div>
            <span className="font-medium">金額:</span>
            <span className="ml-2">¥{file.result.amount.toLocaleString()}</span>
          </div>
          <div>
            <span className="font-medium">説明:</span>
            <span className="ml-2">{file.result.description}</span>
          </div>
        </div>
      </div>
    );
  };

  // 単一ファイルダウンロード
  const downloadSingleFile = (file: ProcessedFile) => {
    if (!file.result) return;

    // 元のファイルを新しい名前でダウンロード
    const url = URL.createObjectURL(new Blob([file.name], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file.result.renamed_filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    addDebugLog('info', `ファイルダウンロード: ${file.result.renamed_filename}`);
  };

  // 全ファイル一括ダウンロード
  const downloadAllFiles = () => {
    addDebugLog('info', `一括ダウンロード開始: ${completedFiles.length}ファイル`);
    
    completedFiles.forEach((file, index) => {
      setTimeout(() => {
        downloadSingleFile(file);
      }, index * 100);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🤖 領収書ファイル一括リネームアプリ (改良版)
          </h1>
          <p className="text-lg text-gray-600">
            Dify File Upload Exampleを導入した改良版アプリです
          </p>
        </div>

        {/* デバッグパネル */}
        <div className="bg-gray-900 text-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-green-400" />
              <h2 className="text-xl font-semibold text-green-400">🐛 デバッグ情報</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearDebugLogs}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
              >
                ログクリア
              </button>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
              >
                {showDebug ? '隠す' : '表示'}
              </button>
            </div>
          </div>
          
          {showDebug && (
            <div className="space-y-4">
              {/* 現在の状態 */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  現在の状態
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>Completed Files: <span className="text-blue-400">{completedFiles.length}</span></div>
                  <div>API URL: <span className="text-yellow-400">{config.apiUrl ? 'Set' : 'Not Set'}</span></div>
                  <div>API Key: <span className="text-yellow-400">{config.apiKey ? 'Set' : 'Not Set'}</span></div>
                  <div>User ID: <span className="text-green-400">{config.userId}</span></div>
                </div>
              </div>

              {/* ログ表示 */}
              <div className="bg-gray-800 rounded-lg p-4 max-h-60 overflow-y-auto">
                <h3 className="text-green-400 font-semibold mb-2">ログ ({debugLogs.length})</h3>
                {debugLogs.length === 0 ? (
                  <div className="text-gray-400 text-sm">ログはありません</div>
                ) : (
                  <div className="space-y-1 text-xs font-mono">
                    {debugLogs.map((log, index) => (
                      <div key={index} className={`
                        ${log.level === 'error' ? 'text-red-400' : 
                          log.level === 'warning' ? 'text-yellow-400' : 'text-gray-300'}
                      `}>
                        <span className="text-gray-500">[{log.timestamp}]</span>
                        <span className={`ml-2 ${
                          log.level === 'error' ? 'text-red-400' : 
                          log.level === 'warning' ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="ml-2">{log.message}</span>
                        {log.data && (
                          <details className="ml-4 mt-1">
                            <summary className="cursor-pointer text-blue-400">詳細</summary>
                            <pre className="mt-1 text-gray-400 bg-gray-900 p-2 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* API設定セクション */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">⚙️ API設定</h2>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {showConfig ? '隠す' : '設定'}
            </button>
          </div>
          
          {showConfig && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dify API URL
                </label>
                <input
                  type="text"
                  value={config.apiUrl}
                  onChange={(e) => setConfig({...config, apiUrl: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://api.dify.ai/v1/workflows/run"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="app-xxxxxxxxxxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User ID
                </label>
                <input
                  type="text"
                  value={config.userId}
                  onChange={(e) => setConfig({...config, userId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="user-12345"
                />
              </div>
            </div>
          )}
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-2xl font-bold text-green-600">{completedFiles.length}</div>
            <div className="text-sm text-gray-600">処理済みファイル</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-2xl font-bold text-blue-600">
              {completedFiles.filter(f => f.result?.amount).reduce((sum, f) => sum + (f.result?.amount || 0), 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">総金額 (¥)</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <div className="text-2xl font-bold text-purple-600">
              {new Set(completedFiles.map(f => f.result?.company).filter(Boolean)).size}
            </div>
            <div className="text-sm text-gray-600">企業数</div>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-lg">
            <button
              onClick={downloadAllFiles}
              disabled={completedFiles.length === 0}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              全件DL
            </button>
          </div>
        </div>

        {/* Dify File Processor */}
        <DifyFileProcessor
          title="📄 領収書ファイル処理"
          description="領収書ファイル（PDF、JPG、PNG等）をアップロードして自動でリネーム処理を行います"
          acceptedFileTypes={[".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]}
          acceptedMimeTypes="application/pdf,image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
          maxFiles={10}
          additionalInputs={{
            processType: "receipt_rename",
            extractCompany: true,
            extractDate: true,
            extractAmount: true
          }}
          userId={config.userId}
          onFileResult={handleFileResult}
          onProcessingComplete={handleProcessingComplete}
          resultRenderer={renderFileResult}
        />

        {/* 処理済みファイル一覧 */}
        {completedFiles.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">✅ 処理済みファイル一覧</h2>
            <div className="space-y-3">
              {completedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{file.name}</div>
                    <div className="text-sm text-green-600">
                      → {file.result?.renamed_filename}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {file.result?.company} | {file.result?.date} | ¥{file.result?.amount.toLocaleString()}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => downloadSingleFile(file)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    DL
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* フッター */}
        <div className="text-center mt-8 text-gray-600">
          <p>Powered by Dify File Upload Example | Next.js + Vercel</p>
        </div>
      </div>
    </div>
  );
};

export default FileRenameApp;