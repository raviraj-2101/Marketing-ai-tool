import { useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import StaticsLogsTable from "@/components/statics/StaticsLogsTable";
import { StaticsLog } from "@/hooks/useStaticsLogs";

const PipelineLogPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const filterAdId = searchParams.get("ad_id") || undefined;

  useEffect(() => {
    if (location.state) {
      window.history.replaceState({}, document.title);
    }
  }, []);

  const handleUseAsTemplate = (log: StaticsLog) => {
    const funnelLower = log.funnel?.toLowerCase();
    if (funnelLower === "tsl") {
      navigate("/tsl-generator", { state: { fromLog: log } });
      return;
    }
    // Redirect to Ad Generator for: Comparison, Onbrand, Adv
    navigate("/ad-generator", { state: { fromLog: log } });
  };

  return (
    <DashboardLayout>
      <div className="h-screen overflow-hidden bg-background">
        <div className="mx-auto px-8 pt-8 pb-4 h-full flex flex-col">
          <div className="mb-5 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-foreground pb-6">
              Pipeline Log
            </h1>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <StaticsLogsTable
              onUseAsTemplate={handleUseAsTemplate}
              filterAdId={filterAdId}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PipelineLogPage;
