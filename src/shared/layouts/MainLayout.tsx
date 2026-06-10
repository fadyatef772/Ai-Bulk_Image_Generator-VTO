import { useAppStore } from '../../app/store/appStore';
import { Sidebar } from './Sidebar';
import { DashboardPage } from '../../modules/images/pages/DashboardPage';
import { UploadPage } from '../../modules/images/pages/UploadPage';
import { QueuePage } from '../../modules/queue/pages/QueuePage';
import { GalleryPage } from '../../modules/gallery/pages/GalleryPage';
import { SettingsPage } from '../../modules/settings/pages/SettingsPage';

export function MainLayout() {
  const { currentPage } = useAppStore();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'upload': return <UploadPage />;
      case 'queue': return <QueuePage />;
      case 'gallery': return <GalleryPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
