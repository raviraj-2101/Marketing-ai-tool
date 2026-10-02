import { DashboardLayout } from "@/components/DashboardLayout";
import TSLGeneratorForm from "@/components/tsl/TSLGeneratorForm";

const TSLGenerator = () => (
  <DashboardLayout>
    <div className="h-screen overflow-hidden bg-background">
      <div className="mx-auto px-8 pt-8 pb-4 h-full flex flex-col">
        <div className="mb-5 shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">TSL Image Generator</h1>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TSLGeneratorForm />
        </div>
      </div>
    </div>
  </DashboardLayout>
);

export default TSLGenerator;
