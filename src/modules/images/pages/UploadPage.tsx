import { useState, useCallback, useRef } from 'react';
import { useUploadStore } from '../../../app/store/uploadStore';
import { useAppStore } from '../../../app/store/appStore';
import { useQuery } from '@tanstack/react-query';
import { api, formatFileSize } from '../../../shared/utils/api';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, PROMPT_EXAMPLES } from '../../../shared/constants';
import { Spinner, ProgressBar } from '../../../shared/components/UI';
import { AppSettings } from '../../../shared/types';

async function fetchSettings() {
  const res = await api.get<AppSettings>('/settings');
  return res.data;
}

export function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showExamples, setShowExamples] = useState(false);

  const { pendingFiles, prompt, isUploading, uploadProgress, addFiles, removeFile, clearFiles, setPrompt, setUploading, setProgress } = useUploadStore();
  const { navigate, addNotification } = useAppStore();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  const validateAndAdd = useCallback((files: File[]) => {
    const valid = files.filter(f => {
      if (!ALLOWED_FILE_TYPES.includes(f.type as never)) return false;
      if (f.size > MAX_FILE_SIZE_BYTES) return false;
      return true;
    });
    if (valid.length < files.length) {
      addNotification('warning', `${files.length - valid.length} file(s) skipped (invalid type or >20MB)`);
    }
    if (valid.length > 0) addFiles(valid);
  }, [addFiles, addNotification]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const items = Array.from(e.dataTransfer.files);
    validateAndAdd(items);
  }, [validateAndAdd]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAdd(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleUpload = async () => {
    if (!prompt.trim()) { addNotification('error', 'Please enter a prompt before uploading'); return; }
    if (pendingFiles.length === 0) { addNotification('error', 'Please select at least one image'); return; }
    if (!settings?.outputFolder) {
      addNotification('error', 'Please configure an output folder in Settings first');
      navigate('settings');
      return;
    }

    setUploading(true);
    setProgress(0);

    // Upload in batches of 50 to avoid overwhelming the server
    const BATCH = 50;
    let uploaded = 0;

    try {
      for (let i = 0; i < pendingFiles.length; i += BATCH) {
        const batch = pendingFiles.slice(i, i + BATCH);
        const formData = new FormData();
        formData.append('prompt', prompt.trim());
        for (const pf of batch) formData.append('files', pf.file);

        const res = await api.upload<{ accepted: unknown[]; totalAccepted: number; totalRejected: number }>('/images/upload', formData);

        uploaded += batch.length;
        setProgress(Math.round((uploaded / pendingFiles.length) * 100));

        if (!res.success) throw new Error(res.error?.message || 'Upload failed');
      }

      addNotification('success', `${uploaded} image(s) queued successfully`);

      // Auto-start queue
      await api.post('/queue/start');
      addNotification('info', 'Processing started automatically');

      clearFiles();
      navigate('queue');
    } catch (err) {
      addNotification('error', (err as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const totalSize = pendingFiles.reduce((sum, f) => sum + f.file.size, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Upload Center</h1>
        <p className="page-subtitle">Upload images for bulk AI generation</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Drop Zone + File List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Drop Zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 select-none
              ${isDragging
                ? 'border-brand-500 bg-brand-500/5 shadow-glow-brand drag-active'
                : 'border-surface-700 hover:border-surface-500 hover:bg-surface-800/30'
              }`}
          >
            <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp" onChange={onFileSelect} className="hidden" />

            <div className="w-14 h-14 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>

            <p className="text-sm font-medium text-surface-300 mb-1">
              {isDragging ? 'Drop images here' : 'Drag & drop images, or click to browse'}
            </p>
            <p className="text-xs text-surface-500">JPG, PNG, WEBP · Up to 20MB each · 1000+ files supported</p>
          </div>

          {/* Folder Select */}
          <div className="flex gap-3">
            <button
              className="flex-1 btn-secondary justify-center py-2.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              Select Files
            </button>
            <button
              className="flex-1 btn-secondary justify-center py-2.5"
              onClick={() => folderInputRef.current?.click()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Select Folder
            </button>
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-expect-error - webkitdirectory is non-standard
              webkitdirectory=""
              accept=".jpg,.jpeg,.png,.webp"
              onChange={onFileSelect}
              className="hidden"
            />
          </div>

          {/* File List */}
          {pendingFiles.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
                <div>
                  <span className="text-sm font-medium text-surface-200">{pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-surface-500 ml-2">({formatFileSize(totalSize)})</span>
                </div>
                <button className="text-xs text-rose-400 hover:text-rose-300 transition-colors" onClick={clearFiles}>
                  Clear all
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto virtual-scroll">
                {pendingFiles.slice(0, 200).map(pf => (
                  <div key={pf.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-800/50 last:border-0 hover:bg-surface-800/30 transition-colors">
                    {pf.preview && (
                      <img src={pf.preview} alt="" className="w-9 h-9 object-cover rounded-lg flex-shrink-0 border border-surface-700/50" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-surface-200 truncate">{pf.file.name}</p>
                      <p className="text-xs text-surface-500">{formatFileSize(pf.file.size)}</p>
                    </div>
                    <button
                      onClick={() => removeFile(pf.id)}
                      className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-surface-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {pendingFiles.length > 200 && (
                  <div className="px-4 py-3 text-xs text-surface-500 text-center">
                    + {pendingFiles.length - 200} more files
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Prompt + Submit */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="label !mb-0">AI Prompt</label>
              <button
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                onClick={() => setShowExamples(!showExamples)}
              >
                {showExamples ? 'Hide' : 'Examples'}
              </button>
            </div>

            {showExamples && (
              <div className="mb-3 space-y-1.5 max-h-40 overflow-y-auto">
                {PROMPT_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg bg-surface-800/60 hover:bg-surface-800 text-surface-400 hover:text-surface-200 transition-all border border-surface-700/50 hover:border-surface-600"
                    onClick={() => { setPrompt(ex); setShowExamples(false); }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            <textarea
              className="input-field resize-none h-32 font-body"
              placeholder="Describe how you want the images transformed..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-surface-600 mt-1 text-right">{prompt.length}/2000</p>
          </div>

          {/* Settings summary */}
          {settings && (
            <div className="glass-card p-4">
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-3">Current Settings</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-surface-500">Workers</span>
                  <span className="text-surface-300">{settings.concurrentWorkers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Retries</span>
                  <span className="text-surface-300">{settings.retryCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">Output folder</span>
                  <span className="text-surface-300 truncate max-w-[120px]" title={settings.outputFolder}>
                    {settings.outputFolder ? settings.outputFolder.split(/[/\\]/).pop() || settings.outputFolder : <span className="text-rose-400">Not set</span>}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-500">API Key</span>
                  <span className={settings.geminiApiKey ? 'text-emerald-400' : 'text-rose-400'}>
                    {settings.geminiApiKey ? '✓ Set' : '✗ Missing'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <Spinner size="sm" />
                <span className="text-sm text-surface-300">Uploading...</span>
                <span className="ml-auto text-sm font-medium text-surface-200">{uploadProgress}%</span>
              </div>
              <ProgressBar value={uploadProgress} />
            </div>
          )}

          {/* Submit Button */}
          <button
            className="w-full btn-primary py-3.5 text-base"
            onClick={handleUpload}
            disabled={isUploading || pendingFiles.length === 0 || !prompt.trim()}
          >
            {isUploading ? (
              <><Spinner size="sm" /> Uploading {pendingFiles.length} files...</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Queue {pendingFiles.length > 0 ? pendingFiles.length : ''} Image{pendingFiles.length !== 1 ? 's' : ''}</>
            )}
          </button>

          {!settings?.geminiApiKey && (
            <p className="text-xs text-amber-400 text-center bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              ⚠ Gemini API key required. <button className="underline" onClick={() => navigate('settings')}>Configure in Settings</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
