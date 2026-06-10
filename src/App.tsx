import { ReactQueryProvider } from './app/providers/QueryProvider';
import { SSEProvider } from './app/providers/SSEProvider';
import { MainLayout } from './shared/layouts/MainLayout';
import { NotificationContainer } from './shared/components/Notifications';

export default function App() {
  return (
    <ReactQueryProvider>
      <SSEProvider>
        <div className="h-screen flex flex-col overflow-hidden bg-surface-950">
          <MainLayout />
          <NotificationContainer />
        </div>
      </SSEProvider>
    </ReactQueryProvider>
  );
}
