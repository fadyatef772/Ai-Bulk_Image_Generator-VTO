import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Toaster } from '@/components/Toaster';
import { useAppStore } from '@/store/appStore';
import { DashboardPage } from '@/pages/DashboardPage';
import { UploadPage } from '@/pages/UploadPage';
import { VirtualTryOnPage } from '@/pages/VirtualTryOnPage';
import { MockupPage } from '@/pages/MockupPage';
import { QueuePage } from '@/pages/QueuePage';
import { GalleryPage } from '@/pages/GalleryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import type { NavPage } from '@/lib/types';

const PAGES: Record<NavPage, () => JSX.Element> = {
  dashboard: DashboardPage,
  upload:    UploadPage,
  vto:       VirtualTryOnPage,
  mockup:    MockupPage,
  queue:     QueuePage,
  gallery:   GalleryPage,
  settings:  SettingsPage,
};

export function AppLayout() {
  const page = useAppStore((s) => s.page);
  const Page = PAGES[page];

  return (
    <div className="flex h-screen overflow-hidden bg-background bg-app-gradient">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto max-w-[1400px] px-8 py-8"
          >
            <Page />
          </motion.div>
        </AnimatePresence>
      </main>
      <Toaster />
    </div>
  );
}
