import { AnimatePresence, motion } from 'framer-motion';
import {
  Boxes,
  Camera,
  ChevronLeft,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Settings,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import type { NavPage } from '@/lib/types';

const NAV: { id: NavPage; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'dashboard', label: 'Dashboard',         icon: LayoutGrid },
  { id: 'upload',    label: 'Upload Center',      icon: Upload     },
  { id: 'vto',       label: 'Virtual Try-On',     icon: Wand2      },
  { id: 'mockup',    label: 'AI 3D Mockup',       icon: Boxes      },
  { id: 'pipeline',  label: 'Production Pipeline', icon: Camera     },
  { id: 'queue',     label: 'Processing Queue',   icon: List       },
  { id: 'gallery',   label: 'Generated Gallery',  icon: ImageIcon  },
  { id: 'settings',  label: 'Settings',           icon: Settings   },
];

export function Sidebar() {
  const { page, setPage, sidebarCollapsed, toggleSidebar, connected } = useAppStore();
  const width = sidebarCollapsed ? 84 : 240;

  return (
    <motion.aside
      animate={{ width }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="relative z-20 flex h-full flex-col border-r bg-sidebar-gradient"
      style={{ width }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-logo-gradient shadow-[0_8px_24px_-8px_rgba(99,102,241,0.7)]">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="leading-tight"
            >
              <p className="text-[15px] font-bold text-text-primary">AI Bulk Image</p>
              <p className="text-[12px] text-text-secondary">Generator</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1.5 px-3">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={cn(
                'group relative flex items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-sm font-medium transition-all',
                active
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-primary/40 bg-primary/[0.08] shadow-glow-active"
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                />
              )}
              {active && <span className="nav-streak absolute inset-0 rounded-xl" />}
              <Icon
                className={cn(
                  'relative z-10 h-[18px] w-[18px] shrink-0 transition-colors',
                  active ? 'text-primary-400' : 'text-text-secondary group-hover:text-text-primary',
                )}
              />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="relative z-10 whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="mt-auto space-y-3 px-5 pb-5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            )}
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                connected ? 'bg-success' : 'bg-text-secondary/50',
              )}
            />
          </span>
          {!sidebarCollapsed && (
            <span className="text-[13px] text-text-secondary">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>

        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white/[0.02] py-2.5 text-text-secondary transition hover:bg-white/[0.05] hover:text-text-primary"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
          {!sidebarCollapsed && <span className="text-[13px]">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
