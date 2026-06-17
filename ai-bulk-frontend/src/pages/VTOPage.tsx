import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Image as ImageIcon, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';

export function VTOPage() {
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const notify = useAppStore((s) => s.notify);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'person' | 'product') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      return notify('warning', 'File is too large (max 20MB)');
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      if (type === 'person') setPersonImage(b64);
      else setProductImage(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!personImage || !productImage) {
      return notify('warning', 'Please upload both person and product images');
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await api.vto(personImage, productImage);
      if (res.success && res.data) {
        setResult(res.data.dataUrl);
        notify('success', 'Virtual Try-On successful');
      } else {
        notify('error', res.error?.message ?? 'VTO failed');
      }
    } catch {
      notify('error', 'VTO failed — is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-dashboard text-text-primary">Virtual Try-On</h1>
        <p className="mt-2 text-text-secondary">
          Upload a person and a clothing item to see the AI magic
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-5">
          <Card hover={false}>
            <CardContent>
              <h3 className="text-section text-text-primary mb-4">Input Images</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Dropzone
                  label="Person Image"
                  image={personImage}
                  onClear={() => setPersonImage(null)}
                  onChange={(e) => handleFileChange(e, 'person')}
                />
                <Dropzone
                  label="Product Image"
                  image={productImage}
                  onClear={() => setProductImage(null)}
                  onChange={(e) => handleFileChange(e, 'product')}
                />
              </div>

              <Button
                variant="primary"
                size="lg"
                className="mt-6 w-full"
                disabled={loading || !personImage || !productImage}
                onClick={handleGenerate}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
                {loading ? 'Generating…' : 'Generate Try-On'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Result */}
        <Card hover={false} className="min-h-[400px]">
          <CardContent className="flex h-full flex-col">
            <h3 className="text-section text-text-primary mb-4">Result</h3>
            <div className="relative flex-1 overflow-hidden rounded-2xl border-2 border-dashed border-glow bg-white/[0.02]">
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full w-full"
                  >
                    <img src={result} alt="VTO Result" className="h-full w-full object-contain" />
                    <div className="absolute bottom-4 right-4">
                      <a href={result} download="vto-result.png">
                        <Button variant="secondary" size="sm">
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </a>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full flex-col items-center justify-center text-center p-8"
                  >
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.03]">
                      <ImageIcon className="h-7 w-7 text-text-secondary" />
                    </div>
                    <p className="mt-5 text-lg font-semibold text-text-primary">
                      {loading ? 'AI is working...' : 'No result yet'}
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {loading
                        ? 'This usually takes 10-20 seconds'
                        : 'Upload images and click generate to see the result'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Dropzone({
  label,
  image,
  onClear,
  onChange,
}: {
  label: string;
  image: string | null;
  onClear: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-text-secondary">{label}</p>
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-dashed border-glow bg-white/[0.02] transition hover:border-primary/40 hover:bg-white/[0.04]">
        {image ? (
          <>
            <img src={image} alt={label} className="h-full w-full object-cover" />
            <button
              onClick={onClear}
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <label className="flex h-full cursor-pointer flex-col items-center justify-center p-4 text-center">
            <Upload className="h-6 w-6 text-text-secondary" />
            <p className="mt-2 text-[12px] text-text-secondary">Click to upload</p>
            <input type="file" accept="image/*" hidden onChange={onChange} />
          </label>
        )}
      </div>
    </div>
  );
}
