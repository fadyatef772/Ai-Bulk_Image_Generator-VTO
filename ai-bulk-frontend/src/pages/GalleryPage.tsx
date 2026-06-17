import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, ImageOff, Search, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGallery, useJobActions } from '@/hooks/useQueries';
import { getImagePreviewUrl, formatRelativeTime } from '@/lib/api';
import { JOB_STATUS_LABELS, JOB_STATUS_PILL } from '@/lib/constants';
import type { ImageJob, JobStatus } from '@/lib/types';

const FILTERS: { id: JobStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
  { id: 'processing', label: 'Processing' },
];

export function GalleryPage() {
  const [filter, setFilter] = useState<JobStatus | 'all'>('completed');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ImageJob | null>(null);

  const { data } = useGallery({
    status: filter === 'all' ? undefined : filter,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    limit: 200,
  });
  const actions = useJobActions();

  const jobs = useMemo(() => {
    const all = data?.jobs ?? [];
    const q = search.trim().toLowerCase();
    return q
      ? all.filter(
          (j) => j.originalName.toLowerCase().includes(q) || j.prompt.toLowerCase().includes(q),
        )
      : all;
  }, [data, search]);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-dashboard text-text-primary">Generated Gallery</h1>
          <p className="mt-2 text-text-secondary">
            {data?.total ?? 0} generated image{(data?.total ?? 0) === 1 ? '' : 's'}
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or prompt…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-xl border px-4 py-2 text-sm transition ${
              filter === f.id
                ? 'border-primary/40 bg-primary/[0.08] text-primary-400 shadow-glow'
                : 'border-glow bg-white/[0.02] text-text-secondary hover:text-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <Card hover={false}>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.03]">
              <ImageOff className="h-7 w-7 text-text-secondary" />
            </div>
            <p className="mt-5 text-lg font-semibold text-text-primary">No images found</p>
            <p className="mt-2 text-sm text-text-secondary">
              Generated images will appear here once jobs complete
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
          {jobs.map((job, i) => (
            <GalleryCard
              key={job.id}
              job={job}
              index={i}
              onOpen={() => setActive(job)}
              onDelete={() => actions.remove.mutate(job.id)}
            />
          ))}
        </div>
      )}

      <Lightbox job={active} onClose={() => setActive(null)} />
    </div>
  );
}

function GalleryCard({
  job,
  index,
  onOpen,
  onDelete,
}: {
  job: ImageJob;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const url = getImagePreviewUrl(job.outputPath);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      whileHover={{ y: -4 }}
      className="glass-card group hover:shadow-glow"
    >
      <button onClick={onOpen} className="block aspect-square w-full overflow-hidden">
        {url && job.status === 'completed' ? (
          <img
            src={url}
            alt={job.originalName}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/[0.02]">
            <ImageOff className="h-8 w-8 text-text-secondary/60" />
          </div>
        )}
      </button>
      <div className="relative p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-medium text-text-primary">{job.originalName}</p>
          <Badge className={JOB_STATUS_PILL[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
        </div>
        <p className="mt-1 truncate text-[12px] text-text-secondary">{job.prompt}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-text-secondary/70">{formatRelativeTime(job.updatedAt)}</span>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {url && job.status === 'completed' && (
              <a
                href={url}
                download={job.originalName}
                className="grid h-7 w-7 place-items-center rounded-lg text-text-secondary hover:text-primary-400"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={onDelete}
              className="grid h-7 w-7 place-items-center rounded-lg text-text-secondary hover:text-danger"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Lightbox({ job, onClose }: { job: ImageJob | null; onClose: () => void }) {
  const url = job ? getImagePreviewUrl(job.outputPath) : '';
  return (
    <AnimatePresence>
      {job && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card max-h-[88vh] w-full max-w-3xl overflow-hidden"
          >
            <div className="relative flex items-center justify-between p-4">
              <p className="truncate text-sm font-medium text-text-primary">{job.originalName}</p>
              <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
                <X className="h-5 w-5" />
              </button>
            </div>
            {url && (
              <img src={url} alt={job.originalName} className="max-h-[64vh] w-full object-contain" />
            )}
            <div className="relative p-4">
              <p className="text-[13px] text-text-secondary">{job.prompt}</p>
              {url && (
                <a href={url} download={job.originalName} className="mt-3 inline-block">
                  <Button variant="primary" size="sm">
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
