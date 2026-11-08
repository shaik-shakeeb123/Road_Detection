import { useState } from 'react';
import { useOutlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import PageContainer from './PageContainer';
import { useBackendStatus } from '@/hooks/useBackendStatus';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const backendStatus = useBackendStatus();
  const location = useLocation();
  const outlet = useOutlet(backendStatus);

  return (
    <div className="flex h-screen bg-[#090A0F] text-[#F5F5F5] overflow-hidden select-text">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        modelStatus={backendStatus.modelStatus}
        backendConnected={backendStatus.connection === 'connected'}
      />
      <div className="flex flex-col flex-1 min-w-0 bg-[#090A0F] overflow-hidden">
        <Header
          backendStatus={backendStatus}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          onRefresh={backendStatus.refresh}
        />
        <PageContainer locationKey={location.pathname}>
          {outlet}
        </PageContainer>
      </div>
    </div>
  );
}
