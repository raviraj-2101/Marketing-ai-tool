import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { LayoutTemplate, FileText, Lightbulb, Wand2, ClipboardList } from "lucide-react";
import GeneratorForm from "@/components/statics/GeneratorForm";
import StaticsLogsTable from "@/components/statics/StaticsLogsTable";
import { SourcePoolsPanel } from "@/components/statics/SourcePoolsPanel";
import { TemplateBuilderForm } from "@/components/statics/TemplateBuilderForm";
import { ExistingTemplatesPanel } from "@/components/statics/ExistingTemplatesPanel";
import { StaticsLog } from "@/hooks/useStaticsLogs";
import { FormTemplate } from "@/hooks/useFormTemplates";

type TabKey = "template-builder" | "existing-templates" | "source-pools" | "generator" | "logs";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "template-builder",   label: "Ad Template Builder", icon: LayoutTemplate },
  { key: "existing-templates", label: "Existing Templates",  icon: FileText },
  { key: "source-pools",       label: "Inspo",               icon: Lightbulb },
  { key: "generator",          label: "Ad Generator",        icon: Wand2 },
  { key: "logs",               label: "Pipeline Log",        icon: ClipboardList },
];


const StaticsGenerator = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterAdId = searchParams.get("ad_id") || undefined;
  const tabParam = (searchParams.get("tab") || "") as TabKey;
  const initialTab = (location.state as any)?.initialTab as TabKey | undefined;
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam || initialTab || (filterAdId ? "logs" : "generator"));
  const [templateData, setTemplateData] = useState<StaticsLog | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null);
  const [generatorFormTemplate, setGeneratorFormTemplate] = useState<FormTemplate | null>(null);

  // Sync activeTab with URL tab parameter
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Clear location state after reading it or when tab changes
  useEffect(() => {
    if (initialTab || location.state) {
      window.history.replaceState({}, document.title);
    }
  }, [initialTab, activeTab, location.state]);

  const handleTabChange = useCallback((tab: TabKey) => {
    if (activeTab === "generator" && tab !== "generator") {
      setTemplateData(null);
      setGeneratorFormTemplate(null);
      setFormKey((prev) => prev + 1);
    }
    setActiveTab(tab);
    if (tab !== "template-builder") {
      setEditingTemplate(null);
    }
    if (tab !== "logs" && searchParams.get("ad_id")) {
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("ad_id"); return next; }, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  const handleUseAsTemplate = useCallback((log: StaticsLog) => {
    if (log.funnel?.toLowerCase() === "tsl") {
      navigate("/tsl-generator", { state: { fromLog: log } });
      return;
    }
    setFormKey((prev) => prev + 1);
    setTemplateData(log);
    setActiveTab("generator");
  }, [navigate]);

  const handleTemplateUsed = useCallback(() => {
    setTemplateData(null);
    if (searchParams.get("ad_id")) {
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("ad_id"); return next; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleEditTemplate = useCallback((template: FormTemplate) => {
    setEditingTemplate(template);
    setActiveTab("template-builder");
  }, []);

  const handleGenerateFromTemplate = useCallback((template: FormTemplate) => {
    if (template.funnel?.toLowerCase() === "tsl") {
      navigate("/tsl-generator", { state: { fromTemplate: template } });
      return;
    }
    setGeneratorFormTemplate(template);
    setFormKey((prev) => prev + 1);
    setActiveTab("generator");
  }, [navigate]);

  const activeTabInfo = tabs.find((t) => t.key === activeTab)!;

  return (
    <DashboardLayout>
      <div className="h-screen overflow-hidden bg-background">
        <div className="mx-auto px-8 pt-8 pb-4 h-full flex flex-col">

          {/* Breadcrumb + Title */}
          <div className="mb-5 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {activeTabInfo.label}
            </h1>          
            </div>

          {/* Horizontal pill tab nav */}
          <div className="flex items-center gap-2 mb-6 flex-wrap shrink-0">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  activeTab === key
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === "template-builder" && (
              <TemplateBuilderForm
                editingTemplate={editingTemplate}
                onSaved={() => setActiveTab("existing-templates")}
              />
            )}
            {activeTab === "existing-templates" && (
              <ExistingTemplatesPanel
                onEdit={handleEditTemplate}
                onGenerate={handleGenerateFromTemplate}
              />
            )}
            {activeTab === "source-pools" && <SourcePoolsPanel />}
            {activeTab === "generator" && (
              <GeneratorForm
                key={formKey}
                templateData={templateData}
                formTemplate={generatorFormTemplate}
                onTemplateUsed={handleTemplateUsed}
                onSubmitted={() => setActiveTab("logs")}
              />
            )}
            {activeTab === "logs" && (
              <StaticsLogsTable
                onUseAsTemplate={handleUseAsTemplate}
                filterAdId={filterAdId}
              />
            )}
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default StaticsGenerator;
