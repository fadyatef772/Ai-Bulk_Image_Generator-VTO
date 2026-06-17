import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, Sparkles, FileImage, CheckCircle2,
  AlertCircle, Download, Loader2, Users, Shirt,
  RotateCcw
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { API_BASE_URL, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';

/** Convert a File to a pure base64 string (no data-url prefix) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:image/xxx;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Call the Python VTO endpoint which expects JSON {personImage, productImage} */
async function callVTOApi(personFile: File, clothingFile: File) {
  const [personB64, clothingB64] = await Promise.all([
    fileToBase64(personFile),
    fileToBase64(clothingFile),
  ]);

  const res = await fetch(`${API_BASE_URL}/vto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personImage:  personB64,
      productImage: clothingB64,
      sampleCount:  1,
      baseSteps:    30,
    }),
  });
  return res.json();
}

interface BulkResult {
  name: string;
  outputPath: string;
  imageBase64?: string;
  mimeType?: string;
  error?: string;
}

type Mode = 'single' | 'bulk';

export function VirtualTryOnPage() {
  const notify = useAppStore((s) => s.notify);
  const [mode, setMode] = useState<Mode>('single');

  // ── Single mode state ─────────────────────────────────────────────────────
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);
  const [resultBase64, setResultBase64] = useState<string | null>(null);
  const [resultMime, setResultMime] = useState<string>('image/png');
  const [singleLoading, setSingleLoading] = useState(false);

  // ── Bulk mode state ───────────────────────────────────────────────────────
  const [bulkPerson, setBulkPerson] = useState<File | null>(null);
  const [bulkPersonPreview, setBulkPersonPreview] = useState<string | null>(null);
  const [bulkClothing, setBulkClothing] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const personRef    = useRef<HTMLInputElement>(null);
  const clothingRef  = useRef<HTMLInputElement>(null);
  const bulkPersonRef   = useRef<HTMLInputElement>(null);
  const bulkClothingRef = useRef<HTMLInputElement>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  const makePreview = (f: File): string => URL.createObjectURL(f);

  // ── Single try-on ─────────────────────────────────────────────────────────
  const pickPerson = (f: File | null) => {
    if (!f || !validateFile(f)) return;
    setPersonFile(f);
    setPersonPreview(makePreview(f));
    setResultBase64(null);
  };

  const pickClothing = (f: File | null) => {
    if (!f || !validateFile(f)) return;
    setClothingFile(f);
    setClothingPreview(makePreview(f));
    setResultBase64(null);
  };

  const runSingle = async () => {
    if (!personFile || !clothingFile) {
      notify('warning', 'Upload both a person and a clothing image');
      return;
    }
    setSingleLoading(true);
    setResultBase64(null);
    try {
      const json = await callVTOApi(personFile, clothingFile);
      if (json.success && json.data?.image) {
        setResultBase64(json.data.image);
        setResultMime(json.data.mimeType ?? 'image/png');
        notify('success', 'Try-on generated!');
      } else {
        notify('error', json.error?.message ?? json.detail ?? 'Generation failed');
      }
    } catch {
      notify('error', 'Request failed — is the backend running?');
    } finally {
      setSingleLoading(false);
    }
  };

  const downloadSingle = () => {
    if (!resultBase64) return;
    const a = document.createElement('a');
    a.href = `data:${resultMime};base64,${resultBase64}`;
    a.download = `vto_result_${Date.now()}.${resultMime === 'image/jpeg' ? 'jpg' : 'png'}`;
    a.click();
  };

  // ── Bulk try-on ───────────────────────────────────────────────────────────
  const pickBulkPerson = (f: File | null) => {
    if (!f || !validateFile(f)) return;
    setBulkPerson(f);
    setBulkPersonPreview(makePreview(f));
    setBulkResults([]);
  };

  const addBulkClothing = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(validateFile);
    setBulkClothing(prev => [...prev, ...valid]);
  };

  const removeBulkClothing = (i: number) =>
    setBulkClothing(prev => prev.filter((_, idx) => idx !== i));

  const runBulk = async () => {
    if (!bulkPerson) { notify('warning', 'Upload a person/model image first'); return; }
    if (bulkClothing.length === 0) { notify('warning', 'Add at least one clothing image'); return; }

    setBulkLoading(true);
    setBulkResults([]);
    setBulkProgress(0);

    // Process in batches of 3 on the frontend side (backend also limits concurrency)
    const results: BulkResult[] = [];
    const BATCH = 3;
    const total = bulkClothing.length;

    for (let i = 0; i < total; i += BATCH) {
      const batch = bulkClothing.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (cFile) => {
        try {
          const json = await callVTOApi(bulkPerson, cFile);
          if (json.success && json.data?.image) {
            results.push({
              name: cFile.name,
              outputPath: json.data.imagePath ?? '',
              imageBase64: json.data.image,
              mimeType: json.data.mimeType ?? 'image/png',
            });
          } else {
            results.push({ name: cFile.name, outputPath: '', error: json.error?.message ?? json.detail ?? 'Failed' });
          }
        } catch (e) {
          results.push({ name: cFile.name, outputPath: '', error: 'Request failed' });
        }
      }));
      setBulkProgress(Math.min(i + BATCH, total));
      setBulkResults([...results]);
    }

    setBulkLoading(false);
    const succeeded = results.filter(r => !r.error).length;
    notify('success', `Done — ${succeeded}/${total} generated`);
  };

  const downloadResult = (r: BulkResult) => {
    if (!r.imageBase64) return;
    const a = document.createElement('a');
    a.href = `data:${r.mimeType ?? 'image/png'};base64,${r.imageBase64}`;
    a.download = `vto_${r.name}_${Date.now()}.png`;
    a.click();
  };

  const downloadAll = () => {
    bulkResults.filter(r => r.imageBase64).forEach((r, i) => {
      setTimeout(() => downloadResult(r), i * 300);
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-dashboard text-text-primary">Virtual Try-On</h1>
        <p className="mt-2 text-text-secondary">
          Place any product onto a model photo using AI — product stays pixel-perfect
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
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
            {m === 'single' ? '✦ Single Try-On' : '⊞ Bulk Try-On (up to 200)'}
          </button>
        ))}
      </div>

      {/* ── SINGLE MODE ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {mode === 'single' && (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 gap-5 lg:grid-cols-2"
          >
            {/* Inputs */}
            <Card hover={false}>
              <CardContent className="space-y-5">
                <h3 className="text-section text-text-primary">Input Images</h3>

                {/* Person */}
                <div>
                  <p className="mb-2 text-[13px] font-medium text-text-secondary flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Person Image
                  </p>
                  <div
                    onClick={() => personRef.current?.click()}
                    className="relative cursor-pointer rounded-2xl border-2 border-dashed border-glow overflow-hidden
                               hover:border-primary/40 hover:bg-white/[0.03] transition aspect-[3/4] flex items-center justify-center"
                  >
                    {personPreview ? (
                      <>
                        <img src={personPreview} className="h-full w-full object-cover" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setPersonFile(null); setPersonPreview(null); setResultBase64(null); }}
                          className="absolute top-2 right-2 rounded-full bg-background/80 p-1 text-text-secondary hover:text-danger"
                        ><X className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-text-secondary">
                        <Users className="h-8 w-8 opacity-40" />
                        <p className="text-sm">Click to upload</p>
                        <p className="text-[11px] opacity-60">Full body or lower body photo</p>
                      </div>
                    )}
                  </div>
                  <input ref={personRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} hidden onChange={e => pickPerson(e.target.files?.[0] ?? null)} />
                </div>

                {/* Clothing */}
                <div>
                  <p className="mb-2 text-[13px] font-medium text-text-secondary flex items-center gap-1.5">
                    <Shirt className="h-3.5 w-3.5" /> Product Image
                  </p>
                  <div
                    onClick={() => clothingRef.current?.click()}
                    className="relative cursor-pointer rounded-2xl border-2 border-dashed border-glow overflow-hidden
                               hover:border-primary/40 hover:bg-white/[0.03] transition aspect-[3/4] flex items-center justify-center"
                  >
                    {clothingPreview ? (
                      <>
                        <img src={clothingPreview} className="h-full w-full object-contain p-4" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setClothingFile(null); setClothingPreview(null); setResultBase64(null); }}
                          className="absolute top-2 right-2 rounded-full bg-background/80 p-1 text-text-secondary hover:text-danger"
                        ><X className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-text-secondary">
                        <Shirt className="h-8 w-8 opacity-40" />
                        <p className="text-sm">Click to upload</p>
                        <p className="text-[11px] opacity-60">Shoe, bag, shirt on white bg</p>
                      </div>
                    )}
                  </div>
                  <input ref={clothingRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} hidden onChange={e => pickClothing(e.target.files?.[0] ?? null)} />
                </div>

                <Button
                  variant="primary" size="lg" className="w-full"
                  disabled={singleLoading || !personFile || !clothingFile}
                  onClick={runSingle}
                >
                  {singleLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                    : <><Sparkles className="h-4 w-4" /> Generate Try-On</>
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Result */}
            <Card hover={false}>
              <CardContent className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-section text-text-primary">Result</h3>
                  {resultBase64 && (
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
                        <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-primary-400" />
                      </div>
                      <p className="text-sm">AI is placing the product…</p>
                      <p className="text-[12px] opacity-60">This takes ~20–40 seconds</p>
                    </div>
                  ) : resultBase64 ? (
                    <img
                      src={`data:${resultMime};base64,${resultBase64}`}
                      className="h-full w-full object-contain"
                      alt="Try-on result"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-text-secondary">
                      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.04]">
                        <FileImage className="h-7 w-7 opacity-30" />
                      </div>
                      <p className="text-sm">No result yet</p>
                      <p className="text-[12px] opacity-60">Upload images and click generate</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── BULK MODE ─────────────────────────────────────────────────── */}
        {mode === 'bulk' && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Person */}
              <Card hover={false}>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-section text-text-primary">Person Image</h3>
                    <p className="mt-1 text-[13px] text-text-secondary">Used for all products</p>
                  </div>
                  <div
                    onClick={() => bulkPersonRef.current?.click()}
                    className="relative cursor-pointer rounded-2xl border-2 border-dashed border-glow overflow-hidden
                               hover:border-primary/40 hover:bg-white/[0.03] transition aspect-square flex items-center justify-center"
                  >
                    {bulkPersonPreview ? (
                      <>
                        <img src={bulkPersonPreview} className="h-full w-full object-cover" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setBulkPerson(null); setBulkPersonPreview(null); setBulkResults([]); }}
                          className="absolute top-2 right-2 rounded-full bg-background/80 p-1 text-text-secondary hover:text-danger"
                        ><X className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-text-secondary">
                        <Users className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Click to upload</p>
                      </div>
                    )}
                  </div>
                  <input ref={bulkPersonRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} hidden onChange={e => pickBulkPerson(e.target.files?.[0] ?? null)} />
                </CardContent>
              </Card>

              {/* Clothing list */}
              <Card hover={false} className="lg:col-span-2">
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-section text-text-primary">Product Images</h3>
                      <p className="mt-1 text-[13px] text-text-secondary">
                        {bulkClothing.length > 0 ? `${bulkClothing.length} file${bulkClothing.length > 1 ? 's' : ''} selected` : 'Upload up to 200 products'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {bulkClothing.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setBulkClothing([])}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => bulkClothingRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Add Files
                      </Button>
                    </div>
                  </div>
                  <input
                    ref={bulkClothingRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')}
                    multiple hidden onChange={e => addBulkClothing(e.target.files)}
                  />

                  {bulkClothing.length === 0 ? (
                    <div
                      onClick={() => bulkClothingRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glow
                                 p-12 text-center hover:border-primary/40 hover:bg-white/[0.03] transition"
                    >
                      <Shirt className="h-10 w-10 opacity-30 text-text-secondary mb-3" />
                      <p className="text-sm text-text-secondary">Drop product images here or click to browse</p>
                      <p className="text-[12px] text-text-secondary opacity-60 mt-1">jpg, png, webp · up to 20MB · max 200 files</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                      {bulkClothing.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative group rounded-xl border border-glow overflow-hidden aspect-square bg-white/[0.02]">
                          <img src={makePreview(f)} className="h-full w-full object-contain p-1" />
                          <div className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1">
                            <p className="truncate text-[10px] text-text-secondary">{f.name}</p>
                          </div>
                          <button
                            onClick={() => removeBulkClothing(i)}
                            className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 text-text-secondary opacity-0 group-hover:opacity-100 hover:text-danger transition"
                          ><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Progress */}
                  {bulkLoading && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-[13px] text-text-secondary">
                        <span>Processing…</span>
                        <span>{bulkProgress} / {bulkClothing.length}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                          animate={{ width: `${(bulkProgress / bulkClothing.length) * 100}%` }}
                          transition={{ duration: 0.4 }}
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    variant="primary" size="lg" className="w-full"
                    disabled={bulkLoading || !bulkPerson || bulkClothing.length === 0}
                    onClick={runBulk}
                  >
                    {bulkLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing {bulkProgress}/{bulkClothing.length}…</>
                      : <><Sparkles className="h-4 w-4" /> Generate {bulkClothing.length > 0 ? `${bulkClothing.length} ` : ''}Try-Ons</>
                    }
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Bulk Results Grid */}
            <AnimatePresence>
              {bulkResults.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card hover={false}>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-section text-text-primary">Results</h3>
                          <p className="mt-1 text-[13px] text-text-secondary">
                            {bulkResults.filter(r => !r.error).length} succeeded · {bulkResults.filter(r => r.error).length} failed
                          </p>
                        </div>
                        {bulkResults.some(r => r.imageBase64) && (
                          <Button variant="secondary" size="sm" onClick={downloadAll}>
                            <Download className="h-3.5 w-3.5 mr-1" /> Download All
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {bulkResults.map((r, i) => (
                          <motion.div
                            key={r.name + i}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.04 }}
                            className="group relative rounded-2xl border border-glow overflow-hidden bg-white/[0.02] aspect-[3/4]"
                          >
                            {r.imageBase64 ? (
                              <>
                                <img
                                  src={`data:${r.mimeType ?? 'image/png'};base64,${r.imageBase64}`}
                                  className="h-full w-full object-cover"
                                />
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

                        {/* Loading placeholders */}
                        {bulkLoading && Array.from({ length: Math.min(3, bulkClothing.length - bulkProgress) }).map((_, i) => (
                          <div key={`placeholder-${i}`} className="rounded-2xl border border-glow bg-white/[0.02] aspect-[3/4] flex items-center justify-center">
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