import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddAdToBankDialog } from "@/components/adbank/AddAdToBankDialog";

export default function AdBankPage() {
  const [open, setOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="relative flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
        <iframe
          src="https://adbank.acentecom.com"
          className="w-full flex-1 border-0"
          title="Ad Bank"
          allow="autoplay; fullscreen; clipboard-write"
        />

        <Button
          onClick={() => setOpen(true)}
          className="absolute top-4 right-4 shadow-lg z-10"
          size="lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add new ad
        </Button>

        <AddAdToBankDialog open={open} onOpenChange={setOpen} />
      </div>
    </DashboardLayout>
  );
}
