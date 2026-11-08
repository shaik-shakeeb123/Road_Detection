import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import DashboardPage from '@/pages/DashboardPage';
import ImageDetectionPage from '@/pages/ImageDetectionPage';
import VideoDetectionPage from '@/pages/VideoDetectionPage';
import LiveCameraPage from '@/pages/LiveCameraPage';
import HistoryPage from '@/pages/HistoryPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'image', element: <ImageDetectionPage /> },
      { path: 'video', element: <VideoDetectionPage /> },
      { path: 'camera', element: <LiveCameraPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
