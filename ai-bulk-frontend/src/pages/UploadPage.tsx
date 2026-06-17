import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileImage, Sparkles, Upload, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { api, formatFileSize } from '@/lib/api';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  PROMPT_EXAMPLES,
} from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { useQueryClient } from '@tanstack/react-query';

export function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const notify = useAppStore((s) => s.notify);
  const setPage = useAppStore((s) => s.setPage);
  const qc = useQueryClient();

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid: File[] = [];
    Array.from(incoming).forEach((f) => {
      const okType = (ALLOWED_FILE_TYPES as readonly string[]).includes(f.type);
      const okSize = f.size <= MAX_FILE_SIZE_BYTES;
      if (okType && okSize) valid.push(f);
      else if (!okType) notify('warning', `${f.name}: unsupported type`);
      else notify('warning', `${f.name}: exceeds ${MAX_FILE_SIZE_MB}MB`);
    });
    setFiles((prev) => [...prev, ...valid]);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleUpload = async () => {
    if (files.length === 0) return notify('warning', 'Add at least one image');
    if (!prompt.trim()) return notify('warning', 'Enter a generation prompt');
    setUploading(true);
    try {
      const res = await api.uploadImages(files, prompt.trim());
      if (res.success && res.data) {
        notify('success', `${res.data.totalAccepted} image(s) queued`);
        if (res.data.totalRejected > 0) notify('warning', `${res.data.totalRejected} rejected`);
        setFiles([]);
        setPrompt('');
        qc.invalidateQueries({ queryKey: ['queue-stats'] });
        qc.invalidateQueries({ queryKey: ['gallery'] });
        setPage('queue');
      } else {
        notify('error', res.error?.message ?? 'Upload failed');
      }
    } catch {
      notify('error', 'Upload failed — is the backend running?');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-dashboard text-text-primary">Upload Center</h1>
        <p className="mt-2 text-text-secondary">
          Drop images and describe the transformation to generate in bulk
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Dropzone */}
        <Card className="lg:col-span-2" hover={false}>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition ${
                dragging
                  ? 'border-primary/60 bg-primary/[0.06]'
                  : 'border-glow bg-white/[0.02] hover:border-primary/40 hover:bg-white/[0.04]'
              }`}
            >
              <motion.div
                animate={{ y: dragging ? -6 : 0 }}
                className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/12 text-primary-400"
              >
                <Upload className="h-7 w-7" />
              </motion.div>
              <p className="mt-5 text-lg font-semibold text-text-primary">
                Drop images here or click to browse
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {ALLOWED_EXTENSIONS.join(', ')} · up to {MAX_FILE_SIZE_MB}MB each
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ALLOWED_FILE_TYPES.join(',')}
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {/* Selected files */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-text-primary">
                      {files.length} file{files.length > 1 ? 's' : ''} selected
                    </p>
                    <button
                      onClick={() => setFiles([])}
                      className="text-[13px] text-text-secondary hover:text-danger"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="grid max-h-56 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                    {files.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 rounded-xl border bg-white/[0.02] p-2.5"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-400">
                          <FileImage className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-text-primary">{f.name}</p>
                          <p className="text-[11px] text-text-secondary">{formatFileSize(f.size)}</p>
                        </div>
                        <button
                          onClick={() => removeFile(i)}
                          className="text-text-secondary hover:text-danger"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Prompt */}
        <Card hover={false}>
          <CardContent className="flex h-full flex-col">
            <h3 className="text-section text-text-primary">Prompt</h3>
            <p className="mt-1 text-[13px] text-text-secondary">
              Applied to every uploaded image
            </p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Describe the transformation…"
              className="mt-4"
            />
            <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Examples
            </p>
            <div className="flex flex-1 flex-col gap-2 overflow-auto">
              {PROMPT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="flex items-start gap-2 rounded-lg border bg-white/[0.02] p-2.5 text-left text-[12px] text-text-secondary transition hover:bg-white/[0.05] hover:text-text-primary"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-400" />
                  {ex}
                </button>
              ))}
            </div>

            <Button
              variant="primary"
              size="lg"
              className="mt-5 w-full"
              disabled={uploading}
              onClick={handleUpload}
            >
              <Upload className="h-[18px] w-[18px]" />
              {uploading ? 'Uploading…' : `Upload ${files.length || ''} & Queue`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
