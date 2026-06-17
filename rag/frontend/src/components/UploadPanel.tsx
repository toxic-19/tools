import React, { useCallback, useState } from 'react';
import { UploadIcon, PackageIcon } from './Icons';
import { ingestFiles, ingestDefault, Record } from '../api';

interface UploadPanelProps {
  records: Record[];
  onRefresh: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const formatSize = (bytes: number | undefined): string => {
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const fileIcons: { [key: string]: string } = {
  txt: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  md: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  docx: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
};

const UploadPanel: React.FC<UploadPanelProps> = ({ records, onRefresh, onToast }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, text: '' });

  const handleFileSelect = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    setUploading(true);
    setProgress({ percent: 30, text: `正在处理 ${fileArray.length} 个文件...` });

    try {
      setProgress({ percent: 60, text: `正在上传并向量化...` });
      const { results, errors } = await ingestFiles(fileArray);
      setProgress({ percent: 100, text: `完成` });
      
      if (results.length > 0) {
        onToast(`成功导入 ${results.length} 个文件`, 'success');
      }
      if (errors && errors.length > 0) {
        onToast(`部分导入失败: ${errors.join('; ')}`, 'error');
      }
      onRefresh();
    } catch (err) {
      setProgress({ percent: 0, text: '' });
      onToast(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setUploading(false);
      setTimeout(() => setProgress({ percent: 0, text: '' }), 3000);
    }
  }, [onRefresh, onToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleFileSelect(files);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleIngestDefault = async () => {
    onToast('正在批量导入 data/ 目录...', 'info');
    try {
      const result = await ingestDefault();
      onToast(`批量导入完成: ${result.chunks} 个片段`, 'success');
      onRefresh();
    } catch (err) {
      onToast(`批量导入失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  const statusLabels: { [key: string]: string } = {
    ok: '完成',
    err: '失败',
    loading: '处理中',
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Upload Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Upload File Card */}
        <div
          className="p-5 rounded-xl transition-all duration-200"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <h3 className="text-[14px] font-semibold mb-3.5" style={{ color: 'var(--text)' }}>上传文件</h3>
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200"
            style={{ borderColor: 'var(--gray-300)' }}
          >
            <input
              type="file"
              accept=".txt,.md,.pdf,.docx"
              className="hidden"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              disabled={uploading}
            />
            <UploadIcon className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>点击或拖拽文件到此处</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>支持 .txt / .md / .pdf / .docx</p>
          </label>

          {/* Progress */}
          {uploading && progress.percent > 0 && (
            <div className="mt-3">
              <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--gray-200)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ backgroundColor: 'var(--primary)', width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{progress.text}</p>
            </div>
          )}
        </div>

        {/* Batch Import Card */}
        <div
          className="p-5 rounded-xl transition-all duration-200"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          <h3 className="text-[14px] font-semibold mb-3.5" style={{ color: 'var(--text)' }}>批量导入</h3>
          <div
            onClick={handleIngestDefault}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200"
            style={{ borderColor: 'var(--gray-300)' }}
          >
            <PackageIcon className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>导入 data/ 目录下所有文档</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>自动扫描并处理所有支持的文件格式</p>
          </div>
        </div>
      </div>

      {/* Import Records */}
      <div
        className="p-5 rounded-xl"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
      >
        <h3 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--text)' }}>导入记录</h3>
        {records.length === 0 ? (
          <div className="text-center py-5 text-[13px]" style={{ color: 'var(--gray-400)' }}>
            暂无导入记录
          </div>
        ) : (
          <div className="space-y-1.5">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ backgroundColor: 'var(--gray-50)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}
              >
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={fileIcons[record.file_type] || fileIcons.txt} />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] truncate" style={{ color: 'var(--text)' }}>
                    {record.filename}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {record.chunks ? `${record.chunks} 片段` : ''}
                    {record.file_size ? ` · ${formatSize(record.file_size)}` : ''}
                    {record.created_at ? ` · ${record.created_at.substring(0, 16).replace('T', ' ')}` : ''}
                  </div>
                </div>
                <span
                  className="text-[10px] font-semibold px-2.5 py-1 rounded"
                  style={{
                    backgroundColor: record.status === 'completed' ? 'var(--success-bg)' : record.status === 'failed' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                    color: record.status === 'completed' ? 'var(--success)' : record.status === 'failed' ? 'var(--danger)' : 'var(--warning)',
                  }}
                >
                  {statusLabels[record.status === 'completed' ? 'ok' : record.status === 'failed' ? 'err' : 'loading']}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPanel;
