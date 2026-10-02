import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  scrollable?: boolean;
}

export function DashboardLayout({ children, scrollable = false }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 min-h-14 border-b border-border bg-card flex items-center px-4">
            <SidebarTrigger className="mr-4" />
          </header>
          <div className={`flex-1 ${scrollable ? '' : 'overflow-y-auto'} min-w-0`}>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
