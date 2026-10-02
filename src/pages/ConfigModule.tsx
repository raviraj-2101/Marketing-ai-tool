import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { LayoutTemplate, FileText, Lightbulb } from "lucide-react";
import { TemplateBuilderForm } from "@/components/statics/TemplateBuilderForm";
import { ExistingTemplatesPanel } from "@/components/statics/ExistingTemplatesPanel";
import { SourcePoolsPanel } from "@/components/statics/SourcePoolsPanel";
import { FormTemplate } from "@/hooks/useFormTemplates";

type TabKey = "template-builder" | "existing-templates" | "source-pools";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "template-builder", label: "Ad Template Builder", icon: LayoutTemplate },
  { key: "existing-templates", label: "Existing Templates", icon: FileText },
  { key: "source-pools", label: "Inspo", icon: Lightbulb },
];

const ConfigModule = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("template-builder");
  const [editingTemplate, setEditingTemplate] = useState<FormTemplate | null>(null);

  useEffect(() => {
    if (location.state) {
      window.history.replaceState({}, document.title);
    }
  }, []);

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    if (tab !== "template-builder") {
      setEditingTemplate(null);
    }
  }, []);

  const handleEditTemplate = useCallback((template: FormTemplate) => {
    setEditingTemplate(template);
    setActiveTab("template-builder");
  }, []);

  const handleGenerateFromTemplate = useCallback((template: FormTemplate) => {
    if (template.funnel?.toLowerCase() === "tsl") {
      navigate("/tsl-generator", { state: { fromTemplate: template } });
      return;
    }
    navigate("/ad-generator", { state: { fromTemplate: template } });
  }, [navigate]);

  const activeTabInfo = tabs.find((t) => t.key === activeTab)!;

  return (
    <DashboardLayout>
      <div className="h-screen overflow-hidden bg-background">
        <div className="mx-auto px-8 pt-8 pb-4 h-full flex flex-col">
          <div className="mb-5 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {activeTabInfo.label}
            </h1>
          </div>

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
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ConfigModule;
