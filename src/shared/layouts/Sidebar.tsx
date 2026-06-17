import { useAppStore } from '../../app/store/appStore';
import { useQueueStore } from '../../app/store/queueStore';
import { NavPage } from '../types';

interface NavItem {
  page: NavPage;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
}

function LayoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

export function Sidebar() {
  const { currentPage, navigate, isSidebarCollapsed, toggleSidebar } = useAppStore();
  const { stats, isConnected } = useQueueStore();

  const navItems: NavItem[] = [
    { page: 'dashboard', label: 'Dashboard', icon: <LayoutIcon /> },
    { page: 'upload', label: 'Upload Center', icon: <UploadIcon /> },
    {
      page: 'queue',
      label: 'Processing Queue',
      icon: <QueueIcon />,
      badge: stats.pending + stats.processing > 0 ? stats.pending + stats.processing : undefined,
    },
    {
      page: 'gallery',
      label: 'Generated Gallery',
      icon: <GalleryIcon />,
      badge: stats.completed > 0 ? stats.completed : undefined,
    },
    { page: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  return (
    <aside
      className={`flex flex-col border-r border-surface-800/70 bg-surface-950/90 backdrop-blur transition-all duration-300 ${
        isSidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-800/70">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center shadow-glow-brand">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        {!isSidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-display font-semibold text-surface-100 truncate">AI Bulk Image</p>
            <p className="text-xs text-surface-500">Generator</p>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <button
            key={item.page}
            onClick={() => navigate(item.page)}
            className={`w-full nav-item ${currentPage === item.page ? 'nav-item-active' : ''} ${
              isSidebarCollapsed ? 'justify-center px-2' : ''
            }`}
            title={isSidebarCollapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!isSidebarCollapsed && (
              <>
                <span className="flex-1 text-left truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center font-medium">
                    {typeof item.badge === 'number' && item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Footer: connection status + collapse */}
      <div className="px-2 py-3 border-t border-surface-800/70 space-y-2">
        {!isSidebarCollapsed && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className="text-xs text-surface-500">
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="w-full nav-item justify-center"
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`}
          >
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}
