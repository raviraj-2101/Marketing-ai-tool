import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Link, useLocation } from "react-router-dom";
import { Package, Bookmark, Users, UserCog, LayoutDashboard, LogOut, Sparkles, Palette, Wand2, Film, Bot, Clapperboard, Video, ChevronDown, ImageIcon, FileImage, Settings2, UserCheck, Megaphone,Database,SlidersHorizontal,ScrollText, BarChart2, Library, Kanban, Activity, Layers,Eye, MessageSquare, Zap,Rocket, ClipboardList, Building2, Store, Tag,UserCircle, PlusSquare, Globe, DollarSign } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute, getAccessFlags } from "@/lib/permissions";
import { canSeeBonuses } from "@/lib/bonusesAccess";
import { RobotHealthModal } from "@/components/admin/RobotHealthModal";
import { pipelineApiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Overall robot-health indicator on the sidebar "Robot Health" icon.
// worst-of: any red → red, else any amber → amber, else green; unknown while
// loading/erroring so we never fake a green.
type RobotHealthState = "green" | "amber" | "red";
type OverallHealth = RobotHealthState | "unknown";

const HEALTH_DOT_CLASS: Record<OverallHealth, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  unknown: "bg-muted-foreground/50",
};

const HEALTH_LABEL: Record<OverallHealth, string> = {
  green: "All robots healthy",
  amber: "Some robots need attention",
  red: "A robot is down",
  unknown: "Robot health unknown",
};

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  hideForCustomOnly?: boolean;
  devOnly?: boolean;
  adminOnly?: boolean;
  bonusesGate?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "User Management", url: "/users", icon: UserCog, permission: "USER_MANAGEMENT", hideForCustomOnly: true },
  { title: "CSs & Editors", url: "/cs-editors", icon: UserCheck, permission: "ADMIN_ONLY", hideForCustomOnly: true },
  { title: "Ads Performance", url: "/ads-performance", icon: BarChart2, permission: "STATIC_GENERATOR" },
  { title: "Bonuses", url: "/bonuses", icon: DollarSign, bonusesGate: true },
  { title: "Ad Bank", url: "/ad-bank", icon: Library },
  { title: "Pipeline Report", url: "/pipeline-report", icon: Kanban, permission: "STATIC_GENERATOR" },
  { title: "Editors Pace", url: "/editors-pace", icon: Activity, permission: "STATIC_GENERATOR" },
  { title: "CSs Pace", url: "/cs-pace", icon: Activity, permission: "STATIC_GENERATOR" },
  { title: "CS KPIs", url: "/cs-kpis", icon: Activity, permission: "STATIC_GENERATOR" },
  { title: "Spy Tool", url: "/spy-tool", icon: Eye },
  // { title: "Themes", url: "/themes", icon: Palette, permission: "STATIC_GENERATOR" },
];

const catalogItems: MenuItem[] = [
  { title: "Brands", url: "/brands", icon: Bookmark, permission: "ADMIN_ONLY", hideForCustomOnly: true },
  { title: "Products", url: "/products", icon: Package, permission: "ADMIN_ONLY", hideForCustomOnly: true },
  { title: "Publishers", url: "/publishers", icon: Users, permission: "ADMIN_ONLY", hideForCustomOnly: true },
];

const staticsGeneratorItems: MenuItem[] = [
  { title: "Config Module", url: "/config-module", icon: Palette, permission: "STATIC_GENERATOR" },
  { title: "Ad Generator", url: "/ad-generator", icon: Wand2, permission: "STATIC_GENERATOR" },
  // { title: "TSL Generator", url: "/tsl-generator", icon: ImageIcon, permission: "STATIC_GENERATOR" },
  { title: "Pipeline Log", url: "/pipeline-log", icon: Bookmark, permission: "STATIC_GENERATOR" },
];

const adsManagementItems: MenuItem[] = [
  { title: "Ads Db", url: "/ads-management/ads-db", icon: Database, permission: "ADS_MANAGEMENT" },
  { title: "Scripts", url: "/ads-management/scripts", icon: ScrollText, permission: "ADS_MANAGEMENT" },
  { title: "TSL Scripts", url: "/ads-management/tsl-scripts", icon: ScrollText, permission: "ADS_MANAGEMENT" },
  { title: "Fields Config", url: "/ads-management/fields-config", icon: SlidersHorizontal, permission: "ADS_MANAGEMENT", devOnly: true },
];

const videoBuilderItems: MenuItem[] = [
  { title: "Avatar Generation", url: "/video-builder/avatar-generation", icon: Bot, permission: "VIDEO_BUILDER" },
  { title: "Avatar Configuration", url: "/video-builder/avatar-configuration", icon: Settings2, permission: "VIDEO_BUILDER" },
  { title: "Manage Scenes", url: "/video-builder/manage-scenes", icon: Clapperboard, permission: "VIDEO_BUILDER" },
  { title: "Create Videos", url: "/video-builder/create-videos", icon: Video, permission: "VIDEO_BUILDER" },
];

const tslBuilderItems: MenuItem[] = [
  { title: "Generate Scripts", url: "/tsl-builder/generate-scripts", icon: MessageSquare },
  { title: "Develop TSL",      url: "/tsl-builder/develop",          icon: FileImage },
  { title: "Script Bank",      url: "/tsl-builder/script-bank",      icon: Library },
  { title: "TSL Log",          url: "/tsl-builder/tsl-log",          icon: ScrollText },
  { title: "Settings",         url: "/tsl-builder/settings",         icon: Settings2 },
];

const ugcBuilderItems: MenuItem[] = [
  { title: "Generate Scripts", url: "/ugc-builder/generate-scripts", icon: MessageSquare,hideForCustomOnly: true },
  { title: "Generate Video Ads",    url: "/ugc-builder/batch-creator",    icon: Layers },
  // { title: "Build Log",        url: "/ugc-builder/log",              icon: ScrollText },
  { title: "Automations",      url: "/ugc-builder/automations",      icon: Zap },
  // { title: "Avatar Config",    url: "/ugc-builder/avatar-config",    icon: Bot },
  { title: "Avatars",          url: "/ugc-builder/avatars",          icon: UserCircle },
  { title: "Video Build Log", url: "/ugc-builder/video-build-log", icon: Video },
];


const adsLauncherItems: MenuItem[] = [
  { title: "Launch Module", url: "/ads-launcher/launch", icon: Rocket, permission: "ADS_LAUNCHER" },
  { title: "Launch Log", url: "/ads-launcher/log", icon: ClipboardList, permission: "ADS_LAUNCHER" },
  { title: "Meta Accounts", url: "/ads-launcher/accounts", icon: Building2, permission: "ADS_LAUNCHER" },
  { title: "AdManage Library", url: "/ads-launcher/library", icon: Library, permission: "ADS_LAUNCHER" },
  { title: "Brands & Products", url: "/ads-launcher/brands-products", icon: Store, permission: "ADS_LAUNCHER" },
  { title: "Settings", url: "/ads-launcher/settings", icon: Settings2, permission: "ADS_LAUNCHER" },
];

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [robotHealthOpen, setRobotHealthOpen] = useState(false);

  const VITE_SPY_TOOL_URL= import.meta.env.VITE_SPY_TOOL_URL;

  const isDevUser = (user?.user_type ?? []).includes('Dev');
  const isAdmin = (user?.user_type ?? []).includes('Admin');
  const isSuperAdmin = (user?.user_type ?? []).includes('Super Admin');
  const isInternalAdmin = isAdmin || isSuperAdmin || isDevUser;
  const canAccessTslBuilder = isInternalAdmin;

  // Poll robot health so the sidebar icon shows a live green/amber/red dot for
  // Super Admins without opening the modal. Shares the modal's query cache.
  const { data: robotHealthData, isError: robotHealthError } =
    useQuery<{ summary?: string; robots?: Array<{ state: RobotHealthState }> }>({
      queryKey: ["/api/robot-health"],
      queryFn: async () => {
        const res = await pipelineApiRequest("GET", "/api/robot-health");
        return res.json();
      },
      enabled: isSuperAdmin,
      refetchInterval: 5 * 60 * 1000, // 5 min
      refetchOnWindowFocus: true,
      staleTime: 60 * 1000,
      retry: false,
    });

  const robotStates = robotHealthData?.robots ?? [];
  const overallHealth: OverallHealth = robotHealthError
    ? "unknown"
    : robotStates.some((r) => r.state === "red")
      ? "red"
      : robotStates.some((r) => r.state === "amber")
        ? "amber"
        : robotStates.length > 0
          ? "green"
          : "unknown";

  // Prefer the backend's summary ("3 of 5 robots healthy · 1 down · 1 stale");
  // fall back to a generic label while loading/erroring.
  const robotHealthTooltip =
    !robotHealthError && robotHealthData?.summary
      ? robotHealthData.summary
      : HEALTH_LABEL[overallHealth];

  // Restricted = pure Custom, or Admin+Custom with checkboxes set. Menu items are
  // shown only for routes the user can actually open (same rule as ProtectedRoute),
  // so the menu and direct-URL access can never drift apart.
  const { restricted } = getAccessFlags(user);
  const canSee = (item: MenuItem) =>
    item.bonusesGate ? canSeeBonuses(user) : canAccessRoute(user, item.url);

  // Strip devOnly items for non-Dev users.
  const filterDevOnly = (items: MenuItem[]) =>
    items.filter((item) => !item.devOnly || isDevUser);

  // Admin-only items (e.g. UGC Automations) are visible only to internal admins.
  const gateAdminOnly = (items: MenuItem[]) =>
    items.filter((item) => !item.adminOnly || isInternalAdmin);

  const visibleMenuItems = menuItems.filter(canSee);
  const visibleCatalogItems = catalogItems.filter(canSee);
  const visibleMenuItemsForADS = filterDevOnly(adsManagementItems).filter(canSee);
  const visibleStaticsItems = staticsGeneratorItems.filter(canSee);
  const visibleVideoItems = videoBuilderItems.filter(canSee);
  const visibleUgcBuilderItems = gateAdminOnly(ugcBuilderItems).filter(canSee);
  const visibleAdsLauncherItems = adsLauncherItems.filter(canSee);
  const visibleTslBuilderItems = tslBuilderItems.filter(canSee);

  // TSL Builder is admin-only for unrestricted users; restricted users see it
  // only if their checkboxes grant a TSL route.
  const showTslBuilder = restricted
    ? visibleTslBuilderItems.length > 0
    : canAccessTslBuilder;

  const [catalogOpen, setCatalogOpen] = useState(() =>
    location.pathname.startsWith('/brands') ||
    location.pathname.startsWith('/products') ||
    location.pathname.startsWith('/publishers')
  );
  const [videoBuilderOpen, setVideoBuilderOpen] = useState(() =>
    location.pathname.startsWith('/video-builder')
  );
  const [ugcBuilderOpen, setUgcBuilderOpen] = useState(() =>
    location.pathname.startsWith('/ugc-builder')
  );
  const [adsManagementOpen, setAdsManagementOpen] = useState(() =>
    location.pathname.startsWith('/ads-management')
  );
  const [staticsGeneratorOpen, setStaticsGeneratorOpen] = useState(() =>
    location.pathname.startsWith('/config-module') ||
    location.pathname.startsWith('/ad-generator') ||
    location.pathname.startsWith('/pipeline-log') ||
    location.pathname.startsWith('/tsl-generator')
  );
  const [tslBuilderOpen, setTslBuilderOpen] = useState(() =>
    location.pathname.startsWith('/tsl-builder')
  );
  const [adsLauncherOpen, setAdsLauncherOpen] = useState(() =>
    location.pathname.startsWith('/ads-launcher')
  );

  useEffect(() => {
    if (
      location.pathname.startsWith('/brands') ||
      location.pathname.startsWith('/products') ||
      location.pathname.startsWith('/publishers')
    ) {
      setCatalogOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/video-builder')) {
      setVideoBuilderOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/ugc-builder')) {
      setUgcBuilderOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/ads-management')) {
      setAdsManagementOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (
      location.pathname.startsWith('/config-module') ||
      location.pathname.startsWith('/ad-generator') ||
      location.pathname.startsWith('/pipeline-log') ||
      location.pathname.startsWith('/tsl-generator')
    ) {
      setStaticsGeneratorOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/tsl-builder')) {
      setTslBuilderOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/ads-launcher')) {
      setAdsLauncherOpen(true);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    logout();
    await signOut();
  };

  const logout = () => {
  const iframeElement = document.querySelector('iframe');
  if (iframeElement?.contentWindow) {
    iframeElement.contentWindow.postMessage(
      { type: "LOGOUT" },
      `${VITE_SPY_TOOL_URL}`
    );
    console.log("[Parent] Logout message sent to iframe");
  }
};

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        {!canAccessRoute(user, "/dashboard") ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-sidebar-foreground">Acentecom</h1>
              <p className="text-xs text-sidebar-foreground/60">Internal Tool</p>
            </div>
          </div>
        ) : (
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-sidebar-foreground">Acentecom</h1>
              <p className="text-xs text-sidebar-foreground/60">Internal Tool</p>
            </div>
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            {/* <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) => 
                        `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                          isActive 
                            ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        }`
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu> */}
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <NavLink
                    to={item.url}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                        ? "bg-white/15 text-white font-medium"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuItem>
              ))}

              {/* Catalog Submenu (Brands, Products, Publishers) */}
              {visibleCatalogItems.length > 0 && (
                <SidebarMenuItem>
                  <Collapsible open={catalogOpen} onOpenChange={setCatalogOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <Layers className="w-4 h-4" />
                      <span className="flex-1 text-left">Catalog</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${catalogOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleCatalogItems.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {/* Ads Management Submenu */}
              {visibleMenuItemsForADS.length > 0 && (
                <SidebarMenuItem>
                  <Collapsible open={adsManagementOpen} onOpenChange={setAdsManagementOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <Megaphone className="w-4 h-4" />
                      <span className="flex-1 text-left">Ads Management</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${adsManagementOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleMenuItemsForADS.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}
  

              {/* Statics Generator Submenu */}
              {visibleStaticsItems.length > 0 && (
                <SidebarMenuItem>
                  <Collapsible open={staticsGeneratorOpen} onOpenChange={setStaticsGeneratorOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <Wand2 className="w-4 h-4" />
                      <span className="flex-1 text-left">Statics Generator</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${staticsGeneratorOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleStaticsItems.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}


              {/* Video Builder Submenu */}
              {/* {visibleVideoItems.length > 0 && (
                <SidebarMenuItem>
                  <Collapsible open={videoBuilderOpen} onOpenChange={setVideoBuilderOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <Film className="w-4 h-4" />
                      <span className="flex-1 text-left">Video Builder</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${videoBuilderOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleVideoItems.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )} */}

              {/* UGC Builder Submenu */}
              {visibleUgcBuilderItems.length > 0 && (
                <SidebarMenuItem>
                  <Collapsible open={ugcBuilderOpen} onOpenChange={setUgcBuilderOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <MessageSquare className="w-4 h-4" />
                      <span className="flex-1 text-left">UGC Builder</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${ugcBuilderOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleUgcBuilderItems.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {/* TSL Builder Submenu - Admin/SuperAdmin/Dev, or Custom users with allowed routes */}
              {showTslBuilder && (
                <SidebarMenuItem>
                  <Collapsible open={tslBuilderOpen} onOpenChange={setTslBuilderOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <ScrollText className="w-4 h-4" />
                      <span className="flex-1 text-left">TSL Builder</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${tslBuilderOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleTslBuilderItems.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {/* Ads Launcher Submenu - shown to internal users, or Custom users
                  granted any /ads-launcher/* route via allowed_routes */}
              {visibleAdsLauncherItems?.length > 0 && (
                <SidebarMenuItem>
                  <Collapsible open={adsLauncherOpen} onOpenChange={setAdsLauncherOpen}>
                    <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-sm text-white/60 hover:bg-white/10 hover:text-white">
                      <Rocket className="w-4 h-4" />
                      <span className="flex-1 text-left">Ads Launcher</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${adsLauncherOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {visibleAdsLauncherItems?.map((item) => (
                        <NavLink
                          key={item.title}
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 pl-7 pr-3 py-2 rounded-md transition-colors w-full text-sm ${isActive
                              ? "bg-white/15 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                            }`
                          }
                        >
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-1">
        {isSuperAdmin && (
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setRobotHealthOpen(true)}
            title={robotHealthTooltip}
          >
            <span className="relative mr-3 flex shrink-0">
              <Bot className="w-4 h-4" />
              <span
                className={cn(
                  "absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar",
                  HEALTH_DOT_CLASS[overallHealth],
                  overallHealth === "unknown" && "animate-pulse",
                )}
                aria-hidden="true"
              />
            </span>
            <span className="flex-1 text-left">Robot Health</span>
            <span className="sr-only">{robotHealthTooltip}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-3" />
          Sign out
        </Button>
      </SidebarFooter>

      {isSuperAdmin && (
        <RobotHealthModal open={robotHealthOpen} onOpenChange={setRobotHealthOpen} />
      )}
    </Sidebar>
  );
}
