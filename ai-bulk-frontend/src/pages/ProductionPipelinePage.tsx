import JSZip from 'jszip';
import { useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, CheckCircle2, AlertCircle,
  Download, Loader2, Shirt, Package, RotateCcw, Camera,
  Users, Trees, Layers, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB,
} from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { PipelineAnimationModal, type PipelineOutput } from '@/components/pipeline/PipelineAnimationModal';

/** File → pure base64 (no data-url prefix) */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── All 8 angles, grouped ─────────────────────────────────────────────────────
const ANGLE_GROUPS = [
  {
    group: 'Product Angles',
    hint: 'gemini-3.1-flash-image',
    angles: [
      { id: 'front',  label: 'Front View' },
      { id: 'side',   label: 'Side View' },
      { id: 'back',   label: 'Back View' },
      { id: 'detail', label: 'Detail Shot' },
    ],
  },
  {
    group: 'Ghost Mannequin',
    hint: 'gemini-3-pro-image',
    angles: [
      { id: 'ghost_front', label: 'Ghost Front' },
      { id: 'ghost_back',  label: 'Ghost Back' },
    ],
  },
  {
    group: 'On Model',
    hint: 'virtual-try-on + flash',
    angles: [
      { id: 'model',   label: 'Full Shot on Model', needs: 'person' },
      { id: 'outdoor', label: 'Outdoor Lifestyle',  needs: 'person' },
    ],
  },
] as const;

const ALL_ANGLE_IDS = ANGLE_GROUPS.flatMap((g) => g.angles.map((a) => a.id));
const ANGLE_LABELS: Record<string, string> = Object.fromEntries(
  ANGLE_GROUPS.flatMap((g) => g.angles.map((a) => [a.id, a.label])),
);

// One product = one row of results (its 8 angles)
interface ProductInput {
  id: string;
  front: File;
  back?: File;
}
interface AngleResult {
  angle: string;
  success: boolean;
  image?: string;
  mimeType?: string;
  error?: string;
}
interface ProductResult {
  productId: string;
  productName: string;
  modelIndex?: number;   // which model from the pool was used (round-robin)
  outdoorIndex?: number; // which outdoor from the pool was used
  results: AngleResult[];
  done: boolean;
}

export function ProductionPipelinePage() {
  const notify = useAppStore((s) => s.notify);

  // Product inputs (front required, back optional) — supports multiple products
  const [products, setProducts] = useState<ProductInput[]>([]);
  // Pools (round-robin across products)
  const [modelPool, setModelPool] = useState<File[]>([]);
  const [outdoorPool, setOutdoorPool] = useState<File[]>([]);
  // Angle selection
  const [selectedAngles, setSelectedAngles] = useState<string[]>(ALL_ANGLE_IDS);
  // Run state
  const [running, setRunning] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ProductResult[]>([]);
  const [showPools, setShowPools] = useState(true);
  const [showAnim, setShowAnim] = useState(false);

  const frontRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const outdoorRef = useRef<HTMLInputElement>(null);

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

  // ── Product management ────────────────────────────────────────────────────
  const addProducts = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(validateFile);
    setProducts((prev) => [
      ...prev,
      ...valid.map((f) => ({ id: `${f.name}-${Date.now()}-${Math.random()}`, front: f })),
    ]);
  };
  const removeProduct = (id: string) => setProducts((prev) => prev.filter((p) => p.id !== id));
  const setProductBack = (id: string, file: File | null) => {
    if (file && !validateFile(file)) return;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, back: file ?? undefined } : p)));
  };

  // ── Pools ─────────────────────────────────────────────────────────────────
  const addToPool = (which: 'model' | 'outdoor', files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(validateFile);
    if (which === 'model') setModelPool((prev) => [...prev, ...valid]);
    else setOutdoorPool((prev) => [...prev, ...valid]);
  };
  const removeFromPool = (which: 'model' | 'outdoor', i: number) => {
    if (which === 'model') setModelPool((prev) => prev.filter((_, idx) => idx !== i));
    else setOutdoorPool((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ── Angle toggles ─────────────────────────────────────────────────────────
  const toggleAngle = (id: string) =>
    setSelectedAngles((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  const toggleGroup = (groupAngles: readonly { id: string }[]) => {
    const ids = groupAngles.map((a) => a.id);
    const allOn = ids.every((id) => selectedAngles.includes(id));
    setSelectedAngles((prev) =>
      allOn ? prev.filter((a) => !ids.includes(a)) : [...new Set([...prev, ...ids])],
    );
  };

  // does the current selection need a person? (model/outdoor)
  const needsPerson = useMemo(
    () => selectedAngles.some((a) => a === 'model' || a === 'outdoor'),
    [selectedAngles],
  );

  // ── Run the pipeline (round-robin model + outdoor across products) ─────────
  const run = async () => {
    if (products.length === 0) return notify('warning', 'Add at least one product image');
    if (selectedAngles.length === 0) return notify('warning', 'Select at least one angle');
    if (needsPerson && modelPool.length === 0)
      return notify('warning', 'Model/Outdoor angles need at least one model image in the pool');

    setRunning(true);
    setShowAnim(true);
    setResults([]);
    setProgress({ done: 0, total: products.length });

    // pre-encode pools once
    const modelsB64 = await Promise.all(modelPool.map(fileToBase64));
    const outdoorsB64 = await Promise.all(outdoorPool.map(fileToBase64));

    const acc: ProductResult[] = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      // round-robin selection — one model + one location per product, advancing each time
      const modelIndex = modelsB64.length ? i % modelsB64.length : undefined;
      const outdoorIndex = outdoorsB64.length ? i % outdoorsB64.length : undefined;

      try {
        const frontB64 = await fileToBase64(p.front);
        const backB64 = p.back ? await fileToBase64(p.back) : undefined;

        const body: {
          imageFront: string; imageBack?: string;
          personImage?: string; outdoorImage?: string; angles: string[];
        } = { imageFront: frontB64, angles: selectedAngles };
        if (backB64) body.imageBack = backB64;
        if (modelIndex !== undefined) body.personImage = modelsB64[modelIndex];
        if (outdoorIndex !== undefined) body.outdoorImage = outdoorsB64[outdoorIndex];

        const res = await api.pipeline(body);
        if (res.success && res.data) {
          acc.push({
            productId: p.id,
            productName: p.front.name,
            modelIndex, outdoorIndex,
            results: res.data.images,
            done: true,
          });
        } else {
          acc.push({
            productId: p.id, productName: p.front.name, modelIndex, outdoorIndex,
            results: [], done: true,
          });
          notify('error', `${p.front.name}: ${res.error?.message ?? 'failed'}`);
        }
      } catch {
        acc.push({
          productId: p.id, productName: p.front.name, modelIndex, outdoorIndex,
          results: [], done: true,
        });
        notify('error', `${p.front.name}: request failed`);
      }

      setProgress({ done: i + 1, total: products.length });
      setResults([...acc]);
    }

    setRunning(false);
    const totalImgs = acc.reduce((n, r) => n + r.results.filter((x) => x.success).length, 0);
    notify('success', `Done — ${totalImgs} images across ${products.length} product(s)`);
  };

  // ── Downloads ─────────────────────────────────────────────────────────────
  const downloadOne = (r: AngleResult, productName: string) => {
    if (!r.image) return;
    try {
      const mime = r.mimeType ?? 'image/png';
      const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
      const byteChars = atob(r.image);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${productName.replace(/\.[^.]+$/, '')}_${r.angle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      notify('error', 'Download failed');
    }
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    let count = 0;
    for (const pr of results) {
      const base = pr.productName.replace(/\.[^.]+$/, '');
      for (const r of pr.results) {
        if (r.success && r.image) {
          const ext = (r.mimeType ?? 'image/png') === 'image/jpeg' ? 'jpg' : 'png';
          zip.file(`${base}/${base}_${r.angle}.${ext}`, r.image, { base64: true });
          count++;
        }
      }
    }
    if (count === 0) return;
    setZipping(true);
    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `production_pipeline_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      notify('error', 'ZIP creation failed');
    } finally {
      setZipping(false);
    }
  };

  const totalSucceeded = results.reduce((n, r) => n + r.results.filter((x) => x.success).length, 0);

  const firstProductUrl = useMemo(() => {
    const p = products[0];
    return p ? URL.createObjectURL(p.front) : undefined;
  }, [products]);

  const firstModelUrl = useMemo(() => {
    const m = modelPool[0];
    return m ? URL.createObjectURL(m) : undefined;
  }, [modelPool]);

  const animOutputs = useMemo<PipelineOutput[]>(
    () => results.flatMap((pr) =>
      pr.results
        .filter((r) => r.success && r.image)
        .map((r) => ({
          angle:   r.angle,
          label:   ANGLE_LABELS[r.angle] ?? r.angle,
          dataUrl: `data:${r.mimeType ?? 'image/png'};base64,${r.image}`,
        })),
    ),
    [results],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-dashboard text-text-primary">Full Production Pipeline</h1>
        <p className="mt-2 text-text-secondary">
          One product image → a complete photoshoot. Product angles, ghost-mannequin, on-model & outdoor — generated automatically.
        </p>
      </div>

      {/* ── Products ──────────────────────────────────────────────────────── */}
      <Card hover={false}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-section text-text-primary flex items-center gap-2">
                <Shirt className="h-4 w-4 text-primary-400" /> Product Images
              </h3>
              <p className="mt-1 text-[13px] text-text-secondary">
                {products.length > 0
                  ? `${products.length} product${products.length > 1 ? 's' : ''} · add a back image to each for accurate back/ghost-back`
                  : 'Upload one or more product front images'}
              </p>
            </div>
            <div className="flex gap-2">
              {products.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setProducts([])}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => frontRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" /> Add Products
              </Button>
            </div>
          </div>
          <input ref={frontRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} multiple hidden
                 onChange={(e) => addProducts(e.target.files)} />

          {products.length === 0 ? (
            <div onClick={() => frontRef.current?.click()}
                 className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-glow
                            p-12 text-center hover:border-primary/40 hover:bg-white/[0.03] transition">
              <Package className="h-10 w-10 opacity-30 text-text-secondary mb-3" />
              <p className="text-sm text-text-secondary">Drop product images here or click to browse</p>
              <p className="text-[12px] text-text-secondary opacity-60 mt-1">Front image required · back optional</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <div key={p.id} className="rounded-xl border border-glow overflow-hidden bg-white/[0.02]">
                  <div className="relative aspect-square">
                    <img src={URL.createObjectURL(p.front)} className="h-full w-full object-contain p-1" alt={p.front.name} />
                    <button onClick={() => removeProduct(p.id)}
                            className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 text-text-secondary hover:text-danger transition">
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute top-1 left-1 rounded-md bg-primary/20 border border-primary/40 px-1.5 py-0.5">
                      <span className="text-[9px] text-primary-400 font-medium">FRONT</span>
                    </div>
                  </div>
                  {/* back slot */}
                  <label className="block cursor-pointer border-t border-glow">
                    <input type="file" accept={ALLOWED_FILE_TYPES.join(',')} hidden
                           onChange={(e) => setProductBack(p.id, e.target.files?.[0] ?? null)} />
                    <div className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/[0.03] transition">
                      {p.back ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-success" />
                          <span className="text-[10px] text-text-secondary truncate flex-1">{p.back.name}</span>
                          <button onClick={(e) => { e.preventDefault(); setProductBack(p.id, null); }}>
                            <X className="h-3 w-3 text-text-secondary hover:text-danger" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Upload className="h-3 w-3 text-text-secondary opacity-60" />
                          <span className="text-[10px] text-text-secondary opacity-60">Add back image</span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pools (model + outdoor) ────────────────────────────────────────── */}
      <Card hover={false}>
        <CardContent className="space-y-4">
          <button onClick={() => setShowPools((s) => !s)}
                  className="flex w-full items-center justify-between">
            <h3 className="text-section text-text-primary flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-400" /> Model & Location Pools
            </h3>
            {showPools ? <ChevronUp className="h-4 w-4 text-text-secondary" /> : <ChevronDown className="h-4 w-4 text-text-secondary" />}
          </button>
          <p className="-mt-2 text-[13px] text-text-secondary">
            Upload several models and locations. They rotate automatically — each product gets the next model & location in turn.
          </p>

          <AnimatePresence>
            {showPools && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-1 gap-5 md:grid-cols-2 overflow-hidden"
              >
                {/* Model pool */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-text-primary flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary-400" /> Models
                      {modelPool.length > 0 && <span className="text-text-secondary">({modelPool.length})</span>}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => modelRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <input ref={modelRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} multiple hidden
                         onChange={(e) => addToPool('model', e.target.files)} />
                  {modelPool.length === 0 ? (
                    <div onClick={() => modelRef.current?.click()}
                         className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-glow
                                    p-6 text-center hover:border-primary/40 transition">
                      <Users className="h-7 w-7 opacity-30 text-text-secondary mb-2" />
                      <p className="text-[12px] text-text-secondary">Add model photos for on-model & outdoor shots</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {modelPool.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative group rounded-lg border border-glow overflow-hidden aspect-square bg-white/[0.02]">
                          <img src={URL.createObjectURL(f)} className="h-full w-full object-cover" alt={`model-${i + 1}`} />
                          <div className="absolute top-0.5 left-0.5 rounded bg-background/70 px-1 text-[8px] text-text-secondary">{i + 1}</div>
                          <button onClick={() => removeFromPool('model', i)}
                                  className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-text-secondary opacity-0 group-hover:opacity-100 hover:text-danger transition">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Outdoor pool */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-text-primary flex items-center gap-1.5">
                      <Trees className="h-3.5 w-3.5 text-secondary" /> Locations
                      {outdoorPool.length > 0 && <span className="text-text-secondary">({outdoorPool.length})</span>}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => outdoorRef.current?.click()}>
                      <Upload className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  <input ref={outdoorRef} type="file" accept={ALLOWED_FILE_TYPES.join(',')} multiple hidden
                         onChange={(e) => addToPool('outdoor', e.target.files)} />
                  {outdoorPool.length === 0 ? (
                    <div onClick={() => outdoorRef.current?.click()}
                         className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-glow
                                    p-6 text-center hover:border-primary/40 transition">
                      <Trees className="h-7 w-7 opacity-30 text-text-secondary mb-2" />
                      <p className="text-[12px] text-text-secondary">Optional — outdoor scenes. If empty, scenes are auto-generated.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {outdoorPool.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative group rounded-lg border border-glow overflow-hidden aspect-square bg-white/[0.02]">
                          <img src={URL.createObjectURL(f)} className="h-full w-full object-cover" alt={`location-${i + 1}`} />
                          <div className="absolute top-0.5 left-0.5 rounded bg-background/70 px-1 text-[8px] text-text-secondary">{i + 1}</div>
                          <button onClick={() => removeFromPool('outdoor', i)}
                                  className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 text-text-secondary opacity-0 group-hover:opacity-100 hover:text-danger transition">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* ── Angle selection ────────────────────────────────────────────────── */}
      <Card hover={false}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-section text-text-primary flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary-400" /> Angles to Generate
              <span className="text-[13px] text-text-secondary font-normal">({selectedAngles.length}/{ALL_ANGLE_IDS.length})</span>
            </h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAngles(ALL_ANGLE_IDS)}>All</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedAngles([])}>None</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ANGLE_GROUPS.map((g) => {
              const ids = g.angles.map((a) => a.id);
              const allOn = ids.every((id) => selectedAngles.includes(id));
              return (
                <div key={g.group} className="rounded-xl border border-glow bg-white/[0.02] p-3 space-y-2">
                  <button onClick={() => toggleGroup(g.angles)}
                          className="flex w-full items-center justify-between text-left">
                    <span className="text-[13px] font-medium text-text-primary">{g.group}</span>
                    <span className={`text-[10px] rounded px-1.5 py-0.5 border ${allOn ? 'text-primary-400 border-primary/40 bg-primary/10' : 'text-text-secondary border-white/10'}`}>
                      {allOn ? 'All' : 'Pick'}
                    </span>
                  </button>
                  <p className="text-[10px] text-text-secondary opacity-50 font-mono">{g.hint}</p>
                  <div className="space-y-1.5">
                    {g.angles.map((a) => {
                      const on = selectedAngles.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAngle(a.id)}
                                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition ${
                                  on ? 'bg-primary/15 text-primary-400 border border-primary/30'
                                     : 'bg-white/[0.02] text-text-secondary border border-transparent hover:bg-white/[0.05]'
                                }`}>
                          <span className={`grid h-3.5 w-3.5 place-items-center rounded border ${on ? 'border-primary/50 bg-primary/30' : 'border-white/20'}`}>
                            {on && <CheckCircle2 className="h-3 w-3" />}
                          </span>
                          {a.label}
                          {'needs' in a && a.needs === 'person' && (
                            <span className="ml-auto text-[9px] text-secondary opacity-70">model</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {needsPerson && modelPool.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <p className="text-[12px] text-text-secondary">
                Model / Outdoor angles are selected — add at least one model image to the pool above.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Run ───────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {running && (
          <div className="space-y-2">
            <div className="flex justify-between text-[13px] text-text-secondary">
              <span>Generating… (each product runs its angles sequentially to respect rate limits)</span>
              <span>{progress.done} / {progress.total} products</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                          animate={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                          transition={{ duration: 0.4 }} />
            </div>
          </div>
        )}
        <Button variant="primary" size="lg" className="w-full"
                disabled={running || products.length === 0 || selectedAngles.length === 0}
                onClick={run}>
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating {progress.done}/{progress.total}…</>
            : <><Camera className="h-4 w-4" /> Generate Photoshoot
                {products.length > 0 && ` · ${products.length} product${products.length > 1 ? 's' : ''} × ${selectedAngles.length} angles`}</>}
        </Button>
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-section text-text-primary">Results</h3>
                <p className="mt-1 text-[13px] text-text-secondary">{totalSucceeded} images generated</p>
              </div>
              {totalSucceeded > 0 && (
                <Button variant="secondary" size="sm" onClick={downloadAll} disabled={zipping}>
                  {zipping
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Zipping…</>
                    : <><Download className="h-3.5 w-3.5 mr-1" /> Download All ({totalSucceeded})</>}
                </Button>
              )}
            </div>

            {results.map((pr) => (
              <Card key={pr.productId} hover={false}>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium text-text-primary truncate">{pr.productName}</p>
                    <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                      {pr.modelIndex !== undefined && (
                        <span className="rounded bg-primary/10 border border-primary/30 px-1.5 py-0.5 text-primary-400">Model #{pr.modelIndex + 1}</span>
                      )}
                      {pr.outdoorIndex !== undefined && (
                        <span className="rounded bg-secondary/10 border border-secondary/30 px-1.5 py-0.5 text-secondary">Location #{pr.outdoorIndex + 1}</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
                    {pr.results.map((r, i) => (
                      <motion.div key={r.angle + i}
                                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: i * 0.03 }}
                                  className="group relative rounded-xl border border-glow overflow-hidden bg-white/[0.02] aspect-square">
                        {r.success && r.image ? (
                          <>
                            <img src={`data:${r.mimeType ?? 'image/png'};base64,${r.image}`} className="h-full w-full object-cover" alt={r.angle} />
                            <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                              <button
                                onClick={() => downloadOne(r, pr.productName)}
                                className="pointer-events-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-white shadow-glow-active hover:bg-primary/90 transition"
                              >
                                <Download className="h-3.5 w-3.5" /> Save
                              </button>
                            </div>
                            <div className="absolute bottom-0 inset-x-0 bg-background/80 px-1.5 py-1 pointer-events-none">
                              <p className="truncate text-[9px] text-text-secondary">{ANGLE_LABELS[r.angle] ?? r.angle}</p>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
                            <AlertCircle className="h-5 w-5 text-danger opacity-70" />
                            <p className="text-[9px] text-text-secondary leading-tight">{ANGLE_LABELS[r.angle] ?? r.angle}</p>
                            <p className="text-[8px] text-text-secondary opacity-50 leading-tight line-clamp-2">{r.error}</p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                    {!pr.done && (
                      <div className="rounded-xl border border-glow bg-white/[0.02] aspect-square flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-primary-400 animate-spin" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <PipelineAnimationModal
        open={showAnim}
        phase={running ? 'running' : 'done'}
        productPreviewUrl={firstProductUrl}
        personPreviewUrl={firstModelUrl}
        totalProducts={products.length}
        doneProducts={progress.done}
        outputs={animOutputs}
        onClose={() => setShowAnim(false)}
        onMinimize={() => setShowAnim(false)}
      />
    </div>
  );
}
