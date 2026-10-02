import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import GeneratorForm from "@/components/statics/GeneratorForm";
import { StaticsLog } from "@/hooks/useStaticsLogs";
import { FormTemplate } from "@/hooks/useFormTemplates";

const AdGeneratorPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [templateData, setTemplateData] = useState<StaticsLog | null>(() =>
    (location.state as any)?.fromLog || null
  );
  const [formTemplate, setFormTemplate] = useState<FormTemplate | null>(() =>
    (location.state as any)?.fromTemplate || null
  );

  useEffect(() => {
    if (location.state) {
      window.history.replaceState({}, document.title);
    }
  }, []);

  const handleTemplateUsed = () => {
    setTemplateData(null);
    if (searchParams.get("ad_id")) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("ad_id");
        return next;
      }, { replace: true });
    }
  };

  const handleSubmitted = () => {
    navigate("/pipeline-log");
  };

  return (
    <DashboardLayout>
      <div className="h-screen overflow-hidden bg-background">
        <div className="mx-auto px-8 pt-8 pb-4 h-full flex flex-col">
          <div className="mb-5 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Ad Generator
            </h1>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <GeneratorForm
              templateData={templateData}
              formTemplate={formTemplate}
              onTemplateUsed={handleTemplateUsed}
              onSubmitted={handleSubmitted}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdGeneratorPage;
