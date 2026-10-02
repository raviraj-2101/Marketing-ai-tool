import { Outlet } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ToastProvider } from '@/features/ads-launcher/components/Toast';
import { ConfirmProvider } from '@/features/ads-launcher/components/Confirm';

export default function AdsLauncherLayout() {
  return (
    <DashboardLayout scrollable>
      <ToastProvider>
        <ConfirmProvider>
          <Outlet />
        </ConfirmProvider>
      </ToastProvider>
    </DashboardLayout>
  );
}
