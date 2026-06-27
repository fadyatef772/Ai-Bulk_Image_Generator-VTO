import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, Sparkles, FileImage, CheckCircle2,
  AlertCircle, Download, Loader2, Shirt, Package,
  RotateCcw, Boxes,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import {
  ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, GARMENT_TYPES,
} from '@/lib/constants';
import { useAppStore } from '@/store/appStore';

type Mode = 'single' | 'bulk';

interface BulkResult {
  name: string;
  imageBase64?: string;
  mimeType?: string;
  error?: string;
}

/** File → pure base64 (no data-url prefix) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MockupPage() {
  const notify = useAppStore((s) => s.notify);
  const [mode, setMode] = useState<Mode>('single');
  const [garmentType, setGarmentType] = useState('');

  // Single
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resultB64, setResultB64] = useState<string | null>(null);
  const [resultMime, setResultMime] = useState('image/png');
  const [singleLoading, setSingleLoading] = useState(false);

  // Bulk
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): boolean => {
    if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(f.type)) {
      notify('warning', `${f.name}: unsupported type`);
      return false;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      notify('warning', `${f.name}: exceeds ${MAX_FILE_SIZE_MB}MB`);
      return false;
    }
    return true;
  }, [notify]);

  // ── Single ────────────────────────────────────────────────────────────────
  const pickFile = (f: File | null) => {
    if (!f || !validateFile(f)) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResultB64(null);
  };

  const runSingle = async () => {
    if (!file) return notify('warning', 'Upload an apparel image first');
    setSingleLoading(true);
    setResultB64(null);
    try {
      const b64 = await fileToBase64(file);
      const res = await api.mockup(b64, garmentType);
      if (res.success && res.data?.image) {
        setResultB64(res.data.image);
        setResultMime(res.data.mimeType ?? 'image/png');
        notify('success', 'Mockup generated!');
      } else {
        notify('error', res.error?.message ?? 'Generation failed');
      }
    } catch {
      notify('error', 'Request failed — is the backend running?');
    } finally {
      setSingleLoading(false);
    }
  };

  const downloadSingle = () => {
    if (!resultB64) return;
    const a = document.createElement('a');
    a.href = `data:${resultMime};base64,${resultB64}`;
    a.download = `mockup_${Date.now()}.${resultMime === 'image/jpeg' ? 'jpg' : 'png'}`;
    a.click();
  };

  // ── Bulk ──────────────────────────────────────────────────────────────────
  const addBulk = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(validateFile);
    setBulkFiles((prev) => [...prev, ...valid]);
  };
  const removeBulk = (i: number) => setBulkFiles((prev) => prev.filter((_, idx) => idx !== i));

  const runBulk = async () => {
    if (bulkFiles.length === 0) return notify('warning', 'Add at least one image');
    setBulkLoading(true);
    setBulkResults([]);
    setBulkProgress(0);

    const results: BulkResult[] = [];
    const BATCH = 3;
    const total = bulkFiles.length;

    for (let i = 0; i < total; i += BATCH) {
      const batch = bulkFiles.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (f) => {
        try {
          const b64 = await fileToBase64(f);
          const res = await api.mockup(b64, garmentType);
          if (res.success && res.data?.image) {
            results.push({ name: f.name, imageBase64: res.data.image, mimeType: res.data.mimeType ?? 'image/png' });
          } else {
            results.push({ name: f.name, error: res.error?.message ?? 'Failed' });
          }
        } catch {
          results.push({ name: f.name, error: 'Request failed' });
        }
      }));
      setBulkProgress(Math.min(i + BATCH, total));
      setBulkResults([...results]);
    }

    setBulkLoading(false);
    notify('success', `Done — ${results.filter((r) => !r.error).length}/${total} generated`);
  };

  const downloadResult = (r: BulkResult) => {
    if (!r.imageBase64) return;
    const a = document.createElement('a');
    a.href = `data:${r.mimeType ?? 'image/png'};base64,${r.imageBase64}`;
    a.download = `mockup_${r.name}_${Date.now()}.png`;
    a.click();
  };
  const downloadAll = () => {
    bulkResults.filter((r) => r.imageBase64).forEach((r, i) => setTimeout(() => downloadResult(r), i * 300));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-dashboard text-text-primary">AI 3D Mockup</h1>
        <p className="mt-2 text-text-secondary">
          Turn flat apparel photos into ghost-mannequin 3D mockups — garment stays identical
        </p>
      </div>

      {/* Mode + garment type */}
      <div className="flex flex-wrap items-center gap-3">
        {(['single', 'bulk'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
              mode === m
                ? 'bg-primary/15 text-primary-400 border border-primary/40 shadow-glow-active'
                : 'bg-white/[0.03] text-text-secondary border border-white/[0.06] hover:bg-white/[0.06]'
            }`}
          >
            {m === 'single' ? '◆ Single' : '⊞ Bulk (up to 1000)'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] text-text-secondary">Garment:</span>
          <div className="w-44">
            <Select
              value={garmentType}
              options={GARMENT_TYPES as unknown as { value: string; label: string }[]}
              onChange={setGarmentType}
            />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── SINGLE ─────────────────────────────────────────────────────── */}
        {mode === 'single' && (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 gap-5 lg:grid-cols-2"
          >
            {/* Input */}
            <Card hover={false}>
              <CardContent className="space-y-5">
                <h3 className="text-section text-text-primary">Apparel Image</h3>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="relative cursor-pointer rounded-2xl border-2 border-dashed border-glow overflow-hidden
                             hover:border-primary/40 hover:bg-white/[0.03] transition aspect-square flex items-center justify-center"
                >
                  {preview ? (
                    <>
                      <img src={preview} className="h-full w-full object-contain p-4" />
                      <button
                        onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setResultB64(null); }}
                        className="absolute top-2 right-2 rounded-full bg-background/80 p-1 text-text-secondary hover:text-danger"
                      ><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-text-secondary">
                      <Shirt className="h-10 w-10 opacity-40" />
                      <p className="text-sm">Click to upload</p>
                      <p className="text-[11px] opacity-60">Flat-lay apparel on any background</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />

                <Button variant="primary" size="lg" className="w-full" disabled={singleLoading || !file} onClick={runSingle}>
                  {singleLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                    : <><Sparkles className="h-4 w-4" /> Generate Mockup</>}
                </Button>
              </CardContent>
            </Card>

            {/* Result */}
            <Card hover={false}>
              <CardContent className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-section text-text-primary">Result</h3>
                  {resultB64 && (
                    <Button variant="ghost" size="sm" onClick={downloadSingle}>
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                  )}
                </div>
                <div className="flex-1 flex items-center justify-center rounded-2xl border border-glow bg-white/[0.02] overflow-hidden min-h-[400px]">
                  {singleLoading ? (
                    <div className="flex flex-col items-center gap-4 text-text-secondary">
                      <div className="relative">
                        <div className="h-16 w-16 rounded-full border-2 border-primary/20 animate-spin border-t-primary" />
                        <Boxes className="absolute inset-0 m-auto h-6 w-6 text-primary-400" />
                      </div>
                      <p className="text-sm">Generating ghost-mannequin mockup…</p>
                      <p className="text-[12px] opacity-60">~20–40 seconds</p>
                    </div>
                  ) : resultB64 ? (
                    <img src={`data:${resultMime};base64,${resultB64}`} className="h-full w-full object-contain" alt="Mockup result" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-text-secondary">
                      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.04]">
                        <FileImage className="h-7 w-7 opacity-30" />
                      </div>
                      <p className="text-sm">No result yet</p>
                      <p className="text-[12px] opacity-60">Upload an image and click generate</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── BULK ───────────────────────────────────────────────────────── */}
        {mode === 'bulk' && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            <Card hover={false}>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-section text-text-primary">Apparel Images</h3>
                    <p className="mt-1 text-[13px] text-text-secondary">
                      {bulkFiles.length > 0 ? `${bulkFiles.length} file${bulkFiles.length > 1 ? 's' : ''} selected` : 'Upload up to 1000 images'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {bulkFiles.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setBulkFiles([])}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => bulkRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Add Files
                    </Button>
                  </div>
                </div>
                <input ref={bulkRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} multiple hidden onChange={(e) => addBulk(e.target.files)} />

                {bulkFiles.length === 0 ? (
                  <div
                    onClick={() => bulkRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glow
                               p-12 text-center hover:border-primary/40 hover:bg-white/[0.03] transition"
                  >
                    <Package className="h-10 w-10 opacity-30 text-text-secondary mb-3" />
                    <p className="text-sm text-text-secondary">Drop apparel images here or click to browse</p>
                    <p className="text-[12px] text-text-secondary opacity-60 mt-1">jpg, png, webp · up to 20MB each</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-5">
                    {bulkFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="relative group rounded-xl border border-glow overflow-hidden aspect-square bg-white/[0.02]">
                        <img src={URL.createObjectURL(f)} className="h-full w-full object-contain p-1" />
                        <div className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1">
                          <p className="truncate text-[10px] text-text-secondary">{f.name}</p>
                        </div>
                        <button
                          onClick={() => removeBulk(i)}
                          className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 text-text-secondary opacity-0 group-hover:opacity-100 hover:text-danger transition"
                        ><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {bulkLoading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[13px] text-text-secondary">
                      <span>Processing…</span>
                      <span>{bulkProgress} / {bulkFiles.length}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                        animate={{ width: `${(bulkProgress / bulkFiles.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                )}

                <Button variant="primary" size="lg" className="w-full" disabled={bulkLoading || bulkFiles.length === 0} onClick={runBulk}>
                  {bulkLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing {bulkProgress}/{bulkFiles.length}…</>
                    : <><Sparkles className="h-4 w-4" /> Generate {bulkFiles.length > 0 ? `${bulkFiles.length} ` : ''}Mockups</>}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <AnimatePresence>
              {bulkResults.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card hover={false}>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-section text-text-primary">Results</h3>
                          <p className="mt-1 text-[13px] text-text-secondary">
                            {bulkResults.filter((r) => !r.error).length} succeeded · {bulkResults.filter((r) => r.error).length} failed
                          </p>
                        </div>
                        {bulkResults.some((r) => r.imageBase64) && (
                          <Button variant="secondary" size="sm" onClick={downloadAll}>
                            <Download className="h-3.5 w-3.5 mr-1" /> Download All
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {bulkResults.map((r, i) => (
                          <motion.div
                            key={r.name + i}
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.04 }}
                            className="group relative rounded-2xl border border-glow overflow-hidden bg-white/[0.02] aspect-square"
                          >
                            {r.imageBase64 ? (
                              <>
                                <img src={`data:${r.mimeType ?? 'image/png'};base64,${r.imageBase64}`} className="h-full w-full object-cover" />
                                <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                  <Button variant="primary" size="sm" onClick={() => downloadResult(r)}>
                                    <Download className="h-3.5 w-3.5 mr-1" /> Save
                                  </Button>
                                </div>
                                <div className="absolute top-2 right-2">
                                  <CheckCircle2 className="h-4 w-4 text-success drop-shadow-lg" />
                                </div>
                              </>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center gap-2 p-3 text-center">
                                <AlertCircle className="h-6 w-6 text-danger" />
                                <p className="text-[11px] text-text-secondary">{r.error}</p>
                              </div>
                            )}
                            <div className="absolute bottom-0 inset-x-0 bg-background/80 px-2 py-1.5">
                              <p className="truncate text-[10px] text-text-secondary">{r.name}</p>
                            </div>
                          </motion.div>
                        ))}
                        {bulkLoading && Array.from({ length: Math.min(3, bulkFiles.length - bulkProgress) }).map((_, i) => (
                          <div key={`ph-${i}`} className="rounded-2xl border border-glow bg-white/[0.02] aspect-square flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-primary-400 animate-spin" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
