/**
 * PipelineAnimationModal — premium in-page AI processing popup for the Full
 * Production Pipeline. Matches the approved mockup:
 *   • page stays mounted behind a 20px blur + ~40% dark overlay
 *   • centered floating white-glass panel, 24px radii, soft shadows, bronze accent
 *   • left/right floating product & model cards on reflective platforms
 *   • central glowing bronze AI Core with rotating rings + light streams
 *   • horizontal icon timeline
 *   • bottom: "Live Progress" checklist (left) + "Outputs Preview" (right) that
 *     fills in with REAL generated images as they arrive
 *   • Minimize button; Completion state; closes with no route change
 *
 * Scroll fix: the outer wrapper is overflow-y-auto so that on small screens
 * the full panel is reachable without the modal clipping content.
 *
 * Honest sync: the backend returns each product's images in one response (no
 * per-angle stream). The stage cadence is a simulated narrative, but the REAL
 * sync points are respected — `outputs` fills the preview with actual images as
 * products complete, and `phase='done'` drives the completion screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, PackageSearch, Sparkles, Cpu, ImageIcon,
  Boxes, CheckCircle2, Check, Minus, X,
} from 'lucide-react';

export type PipelinePhase = 'running' | 'done';

export interface PipelineOutput {
  angle: string;
  label: string;
  dataUrl: string;
}

interface Props {
  open: boolean;
  phase: PipelinePhase;
  productPreviewUrl?: string;
  personPreviewUrl?: string;
  totalProducts?: number;
  doneProducts?: number;
  outputs?: PipelineOutput[];
  onClose?: () => void;
  onMinimize?: () => void;
}

// Horizontal timeline steps (top) — icon per node.
const STEPS = [
  { id: 'upload',   label: 'Uploading\nAssets',        icon: UploadCloud   },
  { id: 'analyze',  label: 'Analyzing\nProduct',       icon: PackageSearch },
  { id: 'prompt',   label: 'Generating\nAI Prompt',    icon: Sparkles      },
  { id: 'gemini',   label: 'Running\nGemini · Vertex', icon: Cpu           },
  { id: 'images',   label: 'Generating\nImages',       icon: ImageIcon     },
  { id: 'mockups',  label: 'Building\nMockups',        icon: Boxes         },
  { id: 'final',    label: 'Finalizing\nResults',      icon: CheckCircle2  },
] as const;

const spring = { type: 'spring', stiffness: 220, damping: 26 } as const;
const BRONZE    = '#B0863A';
const BRONZE_LT = '#C9A876';

export function PipelineAnimationModal({
  open, phase, productPreviewUrl, personPreviewUrl,
  totalProducts = 1, doneProducts = 0, outputs = [], onClose, onMinimize,
}: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  // simulated cadence while running
  useEffect(() => {
    if (!open || phase !== 'running') return;
    setCompleting(false);
    const stepT = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 2)); // hold before last until done
    }, 1700);
    return () => { clearInterval(stepT); };
  }, [open, phase]);

  // real completion
  useEffect(() => {
    if (open && phase === 'done') {
      setStepIdx(STEPS.length - 1);
      setCompleting(true);
    }
  }, [phase, open]);

  useEffect(() => {
    if (!open) { setStepIdx(0); setCompleting(false); }
  }, [open]);

  const productProgress = useMemo(
    () => (totalProducts ? Math.min(100, Math.round((doneProducts / totalProducts) * 100)) : 0),
    [doneProducts, totalProducts],
  );

  const PROGRESS_ROWS = [
    { label: 'Uploading Assets',        idx: 0 },
    { label: 'Analyzing Product',       idx: 1 },
    { label: 'Generating AI Prompt',    idx: 2 },
    { label: 'Running Gemini · Vertex', idx: 3 },
    { label: 'Generating Images',       idx: 4 },
    { label: 'Building Mockups',        idx: 5 },
    { label: 'Finalizing Results',      idx: 6 },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          /* ─── SCROLL FIX: overflow-y-auto + items-start so the panel is
             scrollable on short screens; my-auto on the panel keeps it centered
             when there IS space.  ─────────────────────────────────────────── */
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
        >
          {/* Backdrop — fixed so it doesn't scroll with the panel */}
          <div className="fixed inset-0 bg-black/40" style={{ backdropFilter: 'blur(20px)' }} />

          {/* Floating glass panel — my-auto centres it when viewport is tall enough */}
          <motion.div
            className="relative z-10 my-auto w-full max-w-6xl overflow-hidden rounded-[24px] border border-white/40
                       shadow-[0_40px_120px_rgba(90,66,30,0.35)]"
            style={{
              background: 'linear-gradient(180deg, rgba(251,247,239,0.72) 0%, rgba(245,238,225,0.68) 100%)',
              backdropFilter: 'blur(24px) saturate(120%)',
            }}
            initial={{ scale: 0.95, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={spring}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl"
                     style={{ background: 'linear-gradient(135deg,#F0E4CC,#E3CFA6)' }}>
                  <Sparkles className="h-4 w-4 text-[#8A6A3B]" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[#3D3427] leading-tight">AI Pipeline</h3>
                  <p className="text-[12px] text-[#8B7E68]">Producing your photoshoot</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onMinimize && !completing && (
                  <button onClick={onMinimize}
                          className="flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 text-[12px] font-medium
                                     text-[#6F6552] shadow-sm hover:bg-white transition">
                    <Minus className="h-3.5 w-3.5" /> Minimize
                  </button>
                )}
                {completing && onClose && (
                  <button onClick={onClose}
                          className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-[#8A6A3B] hover:bg-white transition">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!completing ? (
                <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
                  {/* ── 3D stage ─────────────────────────────────────────── */}
                  <div className="relative mx-4 mt-4 h-[300px] overflow-hidden rounded-[20px]"
                       style={{ background: 'radial-gradient(600px 300px at 50% 35%, rgba(252,248,240,0.5), rgba(243,234,218,0.35))' }}>
                    <LightStreams active={true} hasModel={!!personPreviewUrl} />

                    <FloatingCard url={productPreviewUrl} label="Product Image" side="left" />
                    {personPreviewUrl && (
                      <FloatingCard url={personPreviewUrl} label="Model Image" side="right" />
                    )}

                    <div className="absolute inset-0 flex items-center justify-center">
                      <AIOrb active={true} />
                    </div>

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center">
                      <p className="text-[13px] font-semibold text-[#5A4A2E]">
                        {STEPS[Math.min(stepIdx, STEPS.length - 1)].label.replace('\n', ' ')}
                      </p>
                      <p className="text-[10px] text-[#9A8B70]">Generating high quality images</p>
                    </div>
                  </div>

                  {/* ── horizontal timeline ──────────────────────────────── */}
                  <div className="px-6 py-5">
                    <div className="flex items-start justify-between">
                      {STEPS.map((s, i) => {
                        const state = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'todo';
                        const Icon = s.icon;
                        return (
                          <div key={s.id} className="flex flex-1 flex-col items-center">
                            <div className="flex w-full items-center">
                              <span className={`h-[2px] flex-1 ${i === 0 ? 'opacity-0' : ''}`}
                                    style={{ background: i <= stepIdx ? BRONZE : '#E2D6C2' }} />
                              <motion.div
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2"
                                style={{
                                  borderColor: state === 'todo' ? '#E2D6C2' : BRONZE,
                                  background: state === 'active'
                                    ? `linear-gradient(135deg,${BRONZE_LT},${BRONZE})`
                                    : '#FFFFFF',
                                }}
                                animate={state === 'active' ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                                transition={{ duration: 1.4, repeat: state === 'active' ? Infinity : 0 }}
                              >
                                {state === 'done'
                                  ? <Check className="h-4 w-4" style={{ color: BRONZE }} />
                                  : <Icon className="h-4 w-4" style={{ color: state === 'active' ? '#fff' : '#B3A891' }} />}
                              </motion.div>
                              <span className={`h-[2px] flex-1 ${i === STEPS.length - 1 ? 'opacity-0' : ''}`}
                                    style={{ background: i < stepIdx ? BRONZE : '#E2D6C2' }} />
                            </div>
                            <span className="mt-2 whitespace-pre-line text-center text-[10.5px] leading-tight"
                                  style={{ color: state === 'todo' ? '#B3A891' : '#5A4A2E' }}>
                              {s.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── bottom: live progress + outputs preview ───────────── */}
                  <div className="mx-4 mb-4 grid grid-cols-1 gap-4 rounded-[20px] bg-white/60 p-5 lg:grid-cols-[1fr_1.4fr]">
                    {/* live progress checklist */}
                    <div>
                      <h4 className="mb-3 text-[13px] font-semibold text-[#3D3427]">Live Progress</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {PROGRESS_ROWS.map((row) => {
                          const st = row.idx < stepIdx ? 'done' : row.idx === stepIdx ? 'active' : 'todo';
                          return (
                            <div key={row.label} className="flex items-center gap-2">
                              {st === 'done' ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: BRONZE }} />
                              ) : st === 'active' ? (
                                <motion.span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BRONZE }}
                                             animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                             transition={{ duration: 1.2, repeat: Infinity }} />
                              ) : (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-[#E2D6C2]" />
                              )}
                              <span className="text-[11.5px]"
                                    style={{ color: st === 'todo' ? '#B3A891' : st === 'active' ? '#3D3427' : '#6F6552' }}>
                                {row.label}
                              </span>
                              {st === 'active' && (
                                <span className="text-[9px] text-[#B08637]">Processing…</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {totalProducts > 1 && (
                        <div className="mt-4">
                          <div className="mb-1 flex justify-between text-[10px] text-[#8B7E68]">
                            <span>Product {Math.min(doneProducts + 1, totalProducts)} / {totalProducts}</span>
                            <span>{productProgress}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#E7DCC8]">
                            <motion.div className="h-full rounded-full"
                                        style={{ background: `linear-gradient(90deg,${BRONZE_LT},${BRONZE})` }}
                                        animate={{ width: `${productProgress}%` }} transition={spring} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* outputs preview — real images fill in as they arrive */}
                    <div>
                      <h4 className="mb-3 text-[13px] font-semibold text-[#3D3427]">Outputs Preview</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const o = outputs[i];
                          return (
                            <div key={i} className="space-y-1">
                              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[#E5DAC6] bg-[#F6EFE2]">
                                <AnimatePresence>
                                  {o ? (
                                    <motion.img
                                      key={o.dataUrl}
                                      src={o.dataUrl}
                                      initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
                                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                      transition={spring}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <motion.div
                                      className="absolute inset-0 grid place-items-center"
                                      animate={{ opacity: [0.4, 0.7, 0.4] }}
                                      transition={{ duration: 1.6, repeat: Infinity }}
                                    >
                                      <ImageIcon className="h-4 w-4 text-[#D3C3A5]" />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              <p className="truncate text-center text-[9px] text-[#8B7E68]">
                                {o?.label ?? ['Front', 'Side', 'Back', 'Detail', 'Ghost'][i]}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* footer hint */}
                  <div className="mx-4 mb-5 rounded-[14px] bg-[#F0E7D6]/70 px-4 py-3 text-center">
                    <p className="text-[12px] text-[#8B7E68]">
                      <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[#B08637]" />
                      This may take a few moments. You can keep working while we generate your results.
                    </p>
                  </div>
                </motion.div>
              ) : (
                /* ── Completion ──────────────────────────────────────────── */
                <motion.div key="done" className="px-6 pb-8 pt-2"
                            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
                  <div className="mb-6 mt-4 flex flex-col items-center text-center">
                    <motion.div className="mb-3 grid h-16 w-16 place-items-center rounded-full"
                                style={{ background: `linear-gradient(135deg,#D9BE8E,${BRONZE})` }}
                                initial={{ scale: 0 }} animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
                      <CheckCircle2 className="h-8 w-8 text-white" />
                    </motion.div>
                    <h3 className="text-[20px] font-semibold text-[#3D3427]">Production Complete</h3>
                    <p className="mt-1 text-[13px] text-[#8B7E68]">{outputs.length} assets generated</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {outputs.slice(0, 8).map((o, i) => (
                      <motion.div key={o.angle + i}
                                  initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
                                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                  transition={{ delay: 0.15 + i * 0.07, ...spring }}
                                  className="relative overflow-hidden rounded-2xl border border-[#E5DAC6] bg-white
                                             shadow-[0_10px_30px_rgba(120,90,50,0.12)] aspect-square">
                        <img src={o.dataUrl} className="h-full w-full object-cover" alt={o.label} />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 py-1.5">
                          <span className="text-[10px] font-medium text-white">{o.label}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {onClose && (
                    <motion.button onClick={onClose}
                                   initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                                   className="mx-auto mt-7 block rounded-2xl px-7 py-2.5 text-[14px] font-medium text-white
                                              shadow-[0_10px_30px_rgba(176,134,55,0.35)] transition hover:brightness-105"
                                   style={{ background: `linear-gradient(135deg,${BRONZE_LT},${BRONZE})` }}>
                      View Gallery
                    </motion.button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── AI Orb ───────────────────────────────────────────────────────────────────
function AIOrb({ active }: { active: boolean }) {
  return (
    <div className="relative grid place-items-center" style={{ width: 200, height: 200 }}>
      {/* outer glow */}
      <motion.div className="absolute rounded-full"
        style={{ width: 200, height: 200, background: 'radial-gradient(circle, rgba(201,168,118,0.35), transparent 70%)' }}
        animate={{ scale: active ? [1, 1.12, 1] : 1, opacity: active ? [0.7, 1, 0.7] : 0.6 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
      {/* rotating rings */}
      <motion.div className="absolute rounded-full border-2 border-dashed"
        style={{ width: 180, height: 180, borderColor: 'rgba(176,134,55,0.35)' }}
        animate={{ rotate: 360 }} transition={{ duration: 16, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="absolute rounded-full border"
        style={{ width: 140, height: 140, borderColor: 'rgba(201,168,118,0.5)' }}
        animate={{ rotate: -360 }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }} />
      {/* core sphere */}
      <motion.div className="relative grid place-items-center rounded-full"
        style={{
          width: 110, height: 110,
          background: 'radial-gradient(circle at 40% 35%, #FBF6EC, #E9D9BE 55%, #C9A876)',
          boxShadow: '0 16px 50px rgba(176,134,55,0.35), inset 0 0 30px rgba(255,255,255,0.6)',
        }}
        animate={active ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
        <div className="grid h-11 w-11 place-items-center rounded-xl"
             style={{ background: `linear-gradient(135deg,${BRONZE_LT},${BRONZE})` }}>
          <span className="text-[15px] font-bold text-white">AI</span>
        </div>
      </motion.div>
      {/* label pill */}
      <div className="absolute -bottom-1 flex flex-col items-center gap-1">
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[9px] font-medium text-[#8A6A3B] border border-[#C9A876]/40">
          Gemini · Vertex
        </span>
      </div>
    </div>
  );
}

// ── Light streams behind the orb ─────────────────────────────────────────────
function LightStreams({ active, hasModel }: { active: boolean; hasModel: boolean }) {
  if (!active) return null;
  return (
    <svg className="absolute inset-0 h-full w-full" style={{ zIndex: 1 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#C9A876" stopOpacity="0" />
          <stop offset="50%"  stopColor="#E3CFA6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#C9A876" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d="M 130 150 Q 300 120 480 150" fill="none" stroke="url(#lg)" strokeWidth="2"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, repeat: Infinity, repeatType: 'reverse' }} />
      {hasModel && (
        <motion.path d="M 480 150 Q 660 180 830 150" fill="none" stroke="url(#lg)" strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, repeat: Infinity, repeatType: 'reverse', delay: 0.3 }} />
      )}
    </svg>
  );
}

// ── Floating image card — circulates into the core and out the other side ────
// The card starts on its side, drifts toward the center (shrinking, fading as it
// "enters" the AI core), then reappears back on its side — a continuous loop that
// runs for the whole generation.
function FloatingCard({
  url, label, side,
}: { url?: string; label: string; side: 'left' | 'right' }) {
  if (!url) return null;
  const isLeft = side === 'left';
  const toCenter = isLeft ? 230 : -230;
  return (
    <motion.div
      className="absolute top-1/2 z-10"
      style={isLeft ? { left: '7%' } : { right: '7%' }}
      initial={{ y: '-50%', opacity: 0 }}
      animate={{
        x:       [0, toCenter * 0.9, toCenter * 0.9, 0],
        scale:   [1, 0.45, 0.45, 1],
        opacity: [1, 0, 0, 1],
        y:       ['-53%', '-50%', '-50%', '-47%'],
      }}
      transition={{
        duration: 5.5,
        times:    [0, 0.42, 0.58, 1],
        repeat:   Infinity,
        ease:     'easeInOut',
        delay:    isLeft ? 0 : 0.9,
      }}
    >
      <p className="mb-2 text-center text-[11px] font-medium text-[#8B7E68]">{label}</p>
      <motion.div
        className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_20px_50px_rgba(120,90,50,0.25)]"
        style={{ width: 130, height: 168 }}
        animate={{ rotateY: isLeft ? [6, 14, 6] : [-6, -14, -6] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img src={url} className="h-full w-full object-cover" alt={label} />
      </motion.div>
      {/* reflective platform */}
      <motion.div className="mx-auto mt-2 h-3 w-24 rounded-full"
        style={{ background: 'radial-gradient(ellipse at center, rgba(176,134,55,0.35), transparent 70%)' }}
        animate={{ opacity: [0.4, 0.7, 0.4], scaleX: [1, 1.1, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}
