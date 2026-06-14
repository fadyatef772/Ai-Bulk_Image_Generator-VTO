import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/utils/api';
import { useAppStore } from '../../../app/store/appStore';
import { AppSettings, ApiProvider } from '../../../shared/types';
import { Spinner } from '../../../shared/components/UI';
import {
  GEMINI_MODELS,
  VERTEX_MODELS,
  VERTEX_LOCATIONS,
  API_PROVIDER_LABELS,
} from '../../../shared/constants';

async function fetchSettings() {
  const res = await api.get<AppSettings>('/settings');
  return res.data;
}

const DEFAULT_FORM: AppSettings = {
  apiProvider: 'gemini',
  geminiApiKey: '',
  vertexProjectId: '',
  vertexLocation: 'us-central1',
  dustApiKey: '',
  dustWorkspaceId: '',
  dustAgentId: '',
  outputFolder: '',
  concurrentWorkers: 3,
  retryCount: 3,
  timeoutMs: 120000,
  imageQuality: 90,
  model: 'gemini-2.0-flash-exp',
};

// ── tiny icon components ──────────────────────────────────────────────────

function GeminiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function VertexIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function DustIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="10" />
      <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Provider Tab Button ───────────────────────────────────────────────────

interface ProviderTabProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  onClick: () => void;
}

function ProviderTab({ active, label, icon, accentClass, onClick }: ProviderTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
        ${active
          ? `${accentClass} border`
          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 border border-transparent'
        }
      `}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export function SettingsPage() {
  const { addNotification } = useAppStore();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  const [form, setForm] = useState<AppSettings>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [credValid, setCredValid] = useState<boolean | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showDustKey, setShowDustKey] = useState(false);
  const [folderSelecting, setFolderSelecting] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const activeProvider = form.apiProvider;

  const setProvider = (p: ApiProvider) => {
    setForm(f => ({ ...f, apiProvider: p }));
    setCredValid(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', form);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      addNotification('success', 'Settings saved successfully');
    } catch {
      addNotification('error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setCredValid(null);
    try {
      let body: Record<string, string> = { provider: activeProvider };
      if (activeProvider === 'gemini') {
        if (!form.geminiApiKey) return;
        body = { ...body, apiKey: form.geminiApiKey };
      }
      const res = await api.post<{ isValid: boolean }>('/settings/validate-key', body);
      const valid = res.data?.isValid ?? false;
      setCredValid(valid);
      addNotification(valid ? 'success' : 'error', valid ? 'Credentials valid!' : 'Credentials invalid');
    } catch {
      setCredValid(false);
      addNotification('error', 'Could not validate credentials');
    } finally {
      setValidating(false);
    }
  };

  const canValidate = () => {
    switch (activeProvider) {
      case 'gemini':
        return !!form.geminiApiKey && !form.geminiApiKey.includes('*');
      case 'vertex':
        return !!form.vertexProjectId;
      case 'dust':
        return !!form.dustApiKey && !form.dustApiKey.includes('*') && !!form.dustWorkspaceId;
      default:
        return false;
    }
  };

  const activeModels = activeProvider === 'vertex' ? VERTEX_MODELS : GEMINI_MODELS;

  const handleSelectFolder = async () => {
    setFolderSelecting(true);
    try {
      const electron = (window as unknown as {
        electronAPI?: { openFolderDialog: () => Promise<{ success: boolean; path: string | null }> };
      }).electronAPI;
      if (electron?.openFolderDialog) {
        const result = await electron.openFolderDialog();
        if (result.success && result.path) {
          setForm(f => ({ ...f, outputFolder: result.path! }));
        }
      } else {
        const path = window.prompt('Enter output folder path:', form.outputFolder);
        if (path) {
          const res = await api.post<{ folder: string }>('/settings/select-folder', { folder: path });
          if (res.success && res.data?.folder) {
            setForm(f => ({ ...f, outputFolder: res.data!.folder }));
          }
        }
      }
    } catch {
      addNotification('error', 'Failed to select folder');
    } finally {
      setFolderSelecting(false);
    }
  };

  const handleOpenFolder = async () => {
    await api.post('/settings/open-folder');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your AI provider, output folder, and processing options</p>
      </div>

      <div className="space-y-6">

        {/* ── Provider Selection ─────────────────────────────────────────── */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
              <GeminiIcon />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-200">AI Provider</h2>
              <p className="text-xs text-surface-500">Choose which service generates your images</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ProviderTab
              active={activeProvider === 'gemini'}
              label="Gemini API"
              icon={<GeminiIcon />}
              accentClass="bg-brand-500/15 text-brand-300 border-brand-500/40"
              onClick={() => setProvider('gemini')}
            />
            <ProviderTab
              active={activeProvider === 'vertex'}
              label="Vertex AI"
              icon={<VertexIcon />}
              accentClass="bg-blue-500/15 text-blue-300 border-blue-500/40"
              onClick={() => setProvider('vertex')}
            />
            <ProviderTab
              active={activeProvider === 'dust'}
              label="Dust.tt"
              icon={<DustIcon />}
              accentClass="bg-purple-500/15 text-purple-300 border-purple-500/40"
              onClick={() => setProvider('dust')}
            />
          </div>
        </section>

        {/* ── Gemini API ─────────────────────────────────────────────────── */}
        {activeProvider === 'gemini' && (
          <section className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center">
                <GeminiIcon />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-surface-200">Gemini API</h2>
                <p className="text-xs text-surface-500">Direct access via Google AI Studio key</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      className="input-field pr-10"
                      placeholder="AIza..."
                      value={form.geminiApiKey}
                      onChange={e => { setForm(f => ({ ...f, geminiApiKey: e.target.value })); setCredValid(null); }}
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      type="button"
                    >
                      {showGeminiKey ? '🙈' : '👁'}
                    </button>
                  </div>
                  <button
                    className="btn-secondary flex-shrink-0"
                    onClick={handleValidate}
                    disabled={validating || !canValidate()}
                  >
                    {validating ? <Spinner size="sm" /> : 'Validate'}
                  </button>
                </div>
                {credValid !== null && (
                  <p className={`text-xs mt-1.5 ${credValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {credValid ? '✓ API key is valid and working' : '✗ Invalid API key — check and try again'}
                  </p>
                )}
                <p className="text-xs text-surface-600 mt-2">
                  Get your key at{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">
                    aistudio.google.com
                  </a>
                </p>
              </div>

              <div>
                <label className="label">Model</label>
                <select
                  className="input-field"
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                >
                  {GEMINI_MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        {/* ── Vertex AI ──────────────────────────────────────────────────── */}
        {activeProvider === 'vertex' && (
          <section className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <VertexIcon />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-surface-200">Vertex AI</h2>
                <p className="text-xs text-surface-500">Gemini via your Google Cloud project — authenticated by ADC</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">GCP Project ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field flex-1"
                    placeholder="project-7bd2f752-b55e-47ee-94e"
                    value={form.vertexProjectId}
                    onChange={e => { setForm(f => ({ ...f, vertexProjectId: e.target.value })); setCredValid(null); }}
                  />
                  <button
                    className="btn-secondary flex-shrink-0"
                    onClick={handleValidate}
                    disabled={validating || !canValidate()}
                  >
                    {validating ? <Spinner size="sm" /> : 'Test'}
                  </button>
                </div>
                {credValid !== null && (
                  <p className={`text-xs mt-1.5 ${credValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {credValid ? '✓ ADC credentials verified' : '✗ Could not authenticate — run the command below'}
                  </p>
                )}
                <p className="text-xs text-surface-600 mt-2">
                  Found in the{' '}
                  <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    Google Cloud Console
                  </a>
                  {' '}— Dashboard → Project info → Project ID
                </p>
              </div>

              <div>
                <label className="label">Region</label>
                <select
                  className="input-field"
                  value={form.vertexLocation}
                  onChange={e => setForm(f => ({ ...f, vertexLocation: e.target.value }))}
                >
                  {VERTEX_LOCATIONS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Model</label>
                <select
                  className="input-field"
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                >
                  {activeModels.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* ADC Setup Instructions */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-300">
                  🔐 Authentication — run once in your terminal, never touch again
                </p>

                <div className="rounded-md bg-surface-900 border border-surface-700 p-3 font-mono text-xs text-emerald-300 leading-relaxed">
                  <span className="text-surface-500 select-none"># One-time setup</span>{'\n'}
                  gcloud auth application-default login \{'\n'}
                  {'  '}--impersonate-service-account=\{'\n'}
                  {'    '}966705361965-compute@developer.gserviceaccount.com
                </div>

                <ul className="text-xs text-blue-300/80 space-y-1 list-none">
                  <li>✓ Credentials are read automatically from <code className="font-mono bg-surface-700/60 px-1 rounded">~/.config/gcloud/</code></li>
                  <li>✓ No API keys, no JSON files, no tokens in settings</li>
                  <li>✓ Token refresh is handled automatically — no manual renewal</li>
                  <li>✓ Works for both local development and GCP-hosted deployments</li>
                </ul>

                <p className="text-xs text-blue-300/60">
                  Need to verify your setup?{' '}
                  <code className="font-mono bg-surface-700/60 px-1 rounded text-blue-300">
                    gcloud auth application-default print-access-token
                  </code>
                  {' '}— if it prints a token, you're good.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Dust.tt ────────────────────────────────────────────────────── */}
        {activeProvider === 'dust' && (
          <section className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <DustIcon />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-surface-200">Dust.tt</h2>
                <p className="text-xs text-surface-500">Route image generation through a Dust agent</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">API Key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showDustKey ? 'text' : 'password'}
                      className="input-field pr-10"
                      placeholder="sk-dust-..."
                      value={form.dustApiKey}
                      onChange={e => { setForm(f => ({ ...f, dustApiKey: e.target.value })); setCredValid(null); }}
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                      onClick={() => setShowDustKey(!showDustKey)}
                      type="button"
                    >
                      {showDustKey ? '🙈' : '👁'}
                    </button>
                  </div>
                  <button
                    className="btn-secondary flex-shrink-0"
                    onClick={handleValidate}
                    disabled={validating || !canValidate()}
                  >
                    {validating ? <Spinner size="sm" /> : 'Test'}
                  </button>
                </div>
                {credValid !== null && (
                  <p className={`text-xs mt-1.5 ${credValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {credValid ? '✓ Credentials valid' : '✗ Could not connect — check API key and Workspace ID'}
                  </p>
                )}
                <p className="text-xs text-surface-600 mt-2">
                  Generate keys in{' '}
                  <a href="https://dust.tt" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">
                    dust.tt
                  </a>{' '}
                  → Workspace Settings → API Keys
                </p>
              </div>

              <div>
                <label className="label">Workspace ID</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="your-workspace-id"
                  value={form.dustWorkspaceId}
                  onChange={e => setForm(f => ({ ...f, dustWorkspaceId: e.target.value }))}
                />
                <p className="text-xs text-surface-600 mt-1">
                  Found in your Dust workspace URL: <span className="font-mono text-surface-500">dust.tt/w/<strong>workspace-id</strong>/…</span>
                </p>
              </div>

              <div>
                <label className="label">Agent Configuration ID</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="@my-image-agent or agent_abc123"
                  value={form.dustAgentId}
                  onChange={e => setForm(f => ({ ...f, dustAgentId: e.target.value }))}
                />
                <p className="text-xs text-surface-600 mt-1">
                  The agent must be configured to accept image attachments and return an edited image.
                </p>
              </div>

              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4 text-xs text-purple-300/80 space-y-1">
                <p className="font-medium text-purple-300">Agent requirements</p>
                <p>Your Dust agent should be instructed to: accept a base64-encoded image, apply the prompt as editing instructions, and reply with the result image as a data URL or file attachment.</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Output Folder ──────────────────────────────────────────────── */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FolderIcon />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-200">Output Folder</h2>
              <p className="text-xs text-surface-500">Where generated images are saved</p>
            </div>
          </div>

          <div>
            <label className="label">Output Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1"
                placeholder="C:\Users\You\Pictures\Output"
                value={form.outputFolder}
                onChange={e => setForm(f => ({ ...f, outputFolder: e.target.value }))}
              />
              <button className="btn-secondary flex-shrink-0" onClick={handleSelectFolder} disabled={folderSelecting}>
                {folderSelecting ? <Spinner size="sm" /> : 'Browse'}
              </button>
              {form.outputFolder && (
                <button className="btn-ghost flex-shrink-0" onClick={handleOpenFolder} title="Open folder">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-xs text-surface-600 mt-2">
              Creates subfolders: <span className="text-surface-500 font-mono">Generated/ · Failed/ · Logs/ · Temp/</span>
            </p>
          </div>
        </section>

        {/* ── Processing Options ─────────────────────────────────────────── */}
        <section className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <CogIcon />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-200">Processing Options</h2>
              <p className="text-xs text-surface-500">Queue and retry configuration</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Concurrent Workers</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={1} max={10} step={1}
                  value={form.concurrentWorkers}
                  onChange={e => setForm(f => ({ ...f, concurrentWorkers: Number(e.target.value) }))}
                  className="flex-1 accent-brand-500"
                />
                <span className="w-8 text-center text-sm font-medium text-surface-200">{form.concurrentWorkers}</span>
              </div>
              <p className="text-xs text-surface-600 mt-1">Parallel API requests (1–10)</p>
            </div>

            <div>
              <label className="label">Max Retries</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={10} step={1}
                  value={form.retryCount}
                  onChange={e => setForm(f => ({ ...f, retryCount: Number(e.target.value) }))}
                  className="flex-1 accent-brand-500"
                />
                <span className="w-8 text-center text-sm font-medium text-surface-200">{form.retryCount}</span>
              </div>
              <p className="text-xs text-surface-600 mt-1">Retries on failure (0–10)</p>
            </div>

            <div>
              <label className="label">Timeout (seconds)</label>
              <input
                type="number" min={10} max={600} step={10}
                className="input-field"
                value={form.timeoutMs / 1000}
                onChange={e => setForm(f => ({ ...f, timeoutMs: Number(e.target.value) * 1000 }))}
              />
              <p className="text-xs text-surface-600 mt-1">Per-image timeout</p>
            </div>

            <div>
              <label className="label">Image Quality</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={10} max={100} step={5}
                  value={form.imageQuality}
                  onChange={e => setForm(f => ({ ...f, imageQuality: Number(e.target.value) }))}
                  className="flex-1 accent-brand-500"
                />
                <span className="w-10 text-center text-sm font-medium text-surface-200">{form.imageQuality}%</span>
              </div>
              <p className="text-xs text-surface-600 mt-1">Output quality hint</p>
            </div>
          </div>
        </section>

        {/* ── Save ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-surface-500">
            Active provider: <span className="text-surface-300 font-medium">
              {API_PROVIDER_LABELS[activeProvider] ?? activeProvider}
            </span>
          </p>
          <button
            className="btn-primary px-8 py-3"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <><Spinner size="sm" /> Saving…</> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
