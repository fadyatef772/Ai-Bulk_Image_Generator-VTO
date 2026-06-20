import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, FolderOpen, KeyRound, Loader2, Save, Sparkles, Terminal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSettings, useUpdateSettings } from '@/hooks/useQueries';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import {
  API_PROVIDER_LABELS,
  GEMINI_MODELS,
  VERTEX_LOCATIONS,
  VERTEX_MODELS,
} from '@/lib/constants';
import type { ApiProvider, AppSettings } from '@/lib/types';

const PROVIDERS: ApiProvider[] = ['gemini', 'vertex', 'dust'];
const AUTH_CMD = 'gcloud auth application-default login';
const AUTH_CHECKS = [
  'Credentials are read automatically',
  'No API keys required',
  'Token refresh handled automatically',
  'Works for local development',
];

export function SettingsPage() {
  const { data } = useSettings();
  const update = useUpdateSettings();
  const notify = useAppStore((s) => s.notify);

  const [form, setForm] = useState<AppSettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (!form) {
    return (
      <div className="flex h-64 items-center justify-center text-text-secondary">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings…
      </div>
    );
  }

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const testConnection = async () => {
    setTesting(true);
    try {
      const key = form.apiProvider === 'gemini' ? form.geminiApiKey : form.vertexProjectId;
      const res = await api.validateKey(form.apiProvider, key);
      if (res.success && res.data?.isValid) notify('success', 'Connection verified');
      else notify('error', res.error?.message ?? 'Validation failed');
    } catch {
      notify('error', 'Could not reach backend');
    } finally {
      setTesting(false);
    }
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(AUTH_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-dashboard text-text-primary">Settings</h1>
        <p className="mt-2 text-text-secondary">
          Configure your AI provider, output folder, and processing options
        </p>
      </div>

      {/* AI Provider */}
      <Card hover={false}>
        <CardContent>
          <h3 className="text-section text-text-primary">AI Provider</h3>
          <p className="mt-1 text-[13px] text-text-secondary">Choose how images are generated</p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PROVIDERS.map((p) => {
              const active = form.apiProvider === p;
              return (
                <motion.button
                  key={p}
                  whileHover={{ y: -2 }}
                  onClick={() => set('apiProvider', p)}
                  className={`relative overflow-hidden rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-primary/50 bg-primary/[0.08] shadow-glow-active'
                      : 'border-glow bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  {active && <span className="nav-streak absolute inset-0" />}
                  <div className="relative flex items-center justify-between">
                    <span
                      className={`text-sm font-semibold ${active ? 'text-primary-400' : 'text-text-primary'}`}
                    >
                      {API_PROVIDER_LABELS[p]}
                    </span>
                    {active && <Check className="h-4 w-4 text-primary-400" />}
                  </div>
                  <p className="relative mt-1 text-[12px] text-text-secondary">
                    {p === 'gemini'
                      ? 'Direct Gemini API key'
                      : p === 'vertex'
                        ? 'Gemini via Google Cloud project'
                        : 'Dust.tt agent workspace'}
                  </p>
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Provider-specific config */}
      {form.apiProvider === 'vertex' && (
        <Card hover={false}>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-section text-text-primary">Vertex AI</h3>
                <p className="mt-1 text-[13px] text-text-secondary">
                  Gemini via your Google Cloud project
                </p>
              </div>
              <Badge className="bg-primary/10 text-primary-400 border-primary/30">Active</Badge>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="GCP Project ID">
                <div className="flex gap-2">
                  <Input
                    value={form.vertexProjectId}
                    onChange={(e) => set('vertexProjectId', e.target.value)}
                    placeholder="my-gcp-project"
                  />
                  <Button variant="secondary" onClick={testConnection} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </Field>
              <Field label="Region">
                <Select
                  value={form.vertexLocation}
                  options={VERTEX_LOCATIONS}
                  onChange={(v) => set('vertexLocation', v)}
                />
              </Field>
              <Field label="Model" className="md:col-span-2">
                <Select
                  value={form.model}
                  options={VERTEX_MODELS}
                  onChange={(v) => set('model', v)}
                />
              </Field>
            </div>

            {/* Authentication box */}
            <div className="mt-6 rounded-2xl border bg-[#060c20] p-5">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-primary-400" />
                <p className="text-sm font-semibold text-text-primary">Authentication</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-black/40 px-4 py-3 font-mono text-[13px]">
                <code className="text-primary-400">
                  <span className="text-text-secondary">$ </span>
                  {AUTH_CMD}
                </code>
                <button onClick={copyCmd} className="text-text-secondary hover:text-text-primary">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {AUTH_CHECKS.map((c) => (
                  <div key={c} className="flex items-center gap-2 text-[13px] text-text-secondary">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    {c}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {form.apiProvider === 'gemini' && (
        <Card hover={false}>
          <CardContent>
            <h3 className="text-section text-text-primary">Gemini API</h3>
            <p className="mt-1 text-[13px] text-text-secondary">Direct access with an API key</p>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="API Key">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={form.geminiApiKey}
                    onChange={(e) => set('geminiApiKey', e.target.value)}
                    placeholder="AIza…"
                  />
                  <Button variant="secondary" onClick={testConnection} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
                  </Button>
                </div>
              </Field>
              <Field label="Model">
                <Select value={form.model} options={GEMINI_MODELS} onChange={(v) => set('model', v)} />
              </Field>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/[0.06] p-3.5 text-[12px] text-warning">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              Keys are stored locally by the backend. Never commit a populated config to source control.
            </div>
          </CardContent>
        </Card>
      )}

      {form.apiProvider === 'dust' && (
        <Card hover={false}>
          <CardContent>
            <h3 className="text-section text-text-primary">Dust.tt</h3>
            <p className="mt-1 text-[13px] text-text-secondary">Agent workspace integration</p>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="API Key">
                <Input
                  type="password"
                  value={form.dustApiKey}
                  onChange={(e) => set('dustApiKey', e.target.value)}
                  placeholder="sk-…"
                />
              </Field>
              <Field label="Workspace ID">
                <Input
                  value={form.dustWorkspaceId}
                  onChange={(e) => set('dustWorkspaceId', e.target.value)}
                  placeholder="workspace id"
                />
              </Field>
              <Field label="Agent ID" className="md:col-span-2">
                <Input
                  value={form.dustAgentId}
                  onChange={(e) => set('dustAgentId', e.target.value)}
                  placeholder="agent id"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output + processing */}
      <Card hover={false}>
        <CardContent>
          <h3 className="text-section text-text-primary">Output & Processing</h3>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Output Folder" className="md:col-span-2">
              <div className="flex gap-2">
                <Input
                  value={form.outputFolder}
                  onChange={(e) => set('outputFolder', e.target.value)}
                  placeholder="./output"
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const res = await api.selectFolder(form.outputFolder);
                    if (res.success && res.data?.folder) {
                     set('outputFolder', res.data.folder);
                   }
                }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
            </Field>
            <Field label="Concurrent Workers">
              <Input
                type="number"
                min={1}
                max={20}
                value={form.concurrentWorkers}
                onChange={(e) => set('concurrentWorkers', Number(e.target.value))}
              />
            </Field>
            <Field label="Retry Count">
              <Input
                type="number"
                min={0}
                max={10}
                value={form.retryCount}
                onChange={(e) => set('retryCount', Number(e.target.value))}
              />
            </Field>
            <Field label="Timeout (ms)">
              <Input
                type="number"
                min={1000}
                step={1000}
                value={form.timeoutMs}
                onChange={(e) => set('timeoutMs', Number(e.target.value))}
              />
            </Field>
            <Field label="Image Quality">
              <Input
                type="number"
                min={1}
                max={100}
                value={form.imageQuality}
                onChange={(e) => set('imageQuality', Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              variant="primary"
              size="lg"
              disabled={update.isPending}
              onClick={() => update.mutate(form)}
            >
              {update.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Save className="h-[18px] w-[18px]" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 pb-4 text-[12px] text-text-secondary/60">
        <Sparkles className="h-3.5 w-3.5" />
        AI Bulk Image Generator · connected to FastAPI backend
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-[13px] font-medium text-text-secondary">{label}</label>
      {children}
    </div>
  );
}
