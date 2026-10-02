import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  type AdsField,
  type TabKey,
  type TslScript,
  useVideoScripts,
} from "@/hooks/useAdsDb";
import { getCurrentAndNextYearWeekCodes } from "@/utils/weekCodeGenerator";
import { useFilteredBrands } from "@/hooks/useFilteredBrands";
import { useProducts, type Product } from "@/hooks/useProducts";
import { useCsConfig } from "@/hooks/useCsConfig";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Settings } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  ManageOptionsDialog,
  DropdownCellEditor,
  MultiSelectCellEditor,
  normalizeDropdownOptions,
} from "@/hooks/useAdsAgGridColumns";

interface ManageFieldOptionCallbacks {
  onAdd: (fieldId: string, label: string) => void;
  onRemove: (fieldId: string, label: string) => void;
  onRename: (fieldId: string, oldLabel: string, newLabel: string) => void;
}

interface AddAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: TabKey;
  fields: AdsField[];
  tslScripts?: TslScript[];
  onSuccess?: () => void;
  defaultBrandId?: string;
  defaultProductId?: string;
  /** Optional callbacks to add/remove/rename options on bulk fields (funnel, cta, persona, etc.) */
  onManageFieldOptions?: ManageFieldOptionCallbacks;
}

interface FormFieldGroup {
  id: string;
  data: Record<string, unknown>;
  brandId: string;
  productId: string;
  csId: string;
  qtyOfAds: string;
  useScriptId: boolean;
  scriptSearch: string;
}

const QTY_OPTIONS = Array.from({ length: 50 }, (_, i) => (i + 1).toString());

// Fields that get the DropdownCellEditor popup (same search UI as the grid).
// EDITABLE ones also show the ⚙ Edit Options footer (add / rename / remove).
const MULTI_SELECT_EDITABLE_FIELDS = ["root cause"];
// These use the single-select searchable popup (DropdownCellEditor) with the ⚙ Edit Options gear.
const SEARCHABLE_EDITABLE_FIELDS = ["persona", "angle", "awareness lvl"];
// Search only, no ⚙ Edit Options gear.
const SEARCHABLE_ONLY_FIELDS = ["funnel", "cta"];

const TAB_CONFIG: Record<
  TabKey,
  { title: string; subtitle: string; label: string }
> = {
  "vid-table": {
    title: "Add Video Ad",
    subtitle: "Create a new video advertisement",
    label: "Video Ad",
  },
  "tsl-table": {
    title: "Add TSL Ad",
    subtitle: "Create a new Text Sales Letter ad",
    label: "TSL Ad",
  },
  "img-table": {
    title: "Add Image Ad",
    subtitle: "Create a new image advertisement",
    label: "Image Ad",
  },
};

export function AddAdDialog({
  open,
  onOpenChange,
  tab,
  fields,
  tslScripts = [],
  onSuccess,
  defaultBrandId,
  defaultProductId,
  onManageFieldOptions,
}: AddAdDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // State for the "Edit Options" manage-dialog (matches the table's ⚙ Edit Options behaviour)
  const [manageOptionsFieldId, setManageOptionsFieldId] = useState<
    string | null
  >(null);
  const [manageOptionsProductName, setManageOptionsProductName] = useState<
    string | undefined
  >(undefined);
  // Per-field search terms for the bulk-field dropdowns (keyed by field.id)
  const [fieldSearchTerms, setFieldSearchTerms] = useState<
    Record<string, string>
  >({});
  // Which DropdownCellEditor popup is currently open — keyed by `${groupId}-${fieldId}`
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);

  const config = TAB_CONFIG[tab];
  const weekCodes = useMemo(() => getCurrentAndNextYearWeekCodes(), []);

  // Get current week code as default
  const currentWeekCode = useMemo(() => {
    const today = new Date();
    const currentWeek = weekCodes.find((week) => {
      const startDate = new Date(week.startDate);
      const endDate = new Date(week.endDate);
      return today >= startDate && today <= endDate;
    });
    // Never silently fall back to week 1 (weekCodes[0]). If the current week
    // can't be resolved, leave it blank so the user must pick — a wrong default
    // (e.g. every Sunday's ads stamped Y26W01) is worse than an empty one.
    if (!currentWeek) {
      console.error(
        "AddAdDialog: could not resolve current batch week for",
        today.toISOString(),
      );
    }
    return currentWeek?.code || "";
  }, [weekCodes]);

  // Get column key for a field based on tab type
  const getColumnKey = (field: AdsField): string | null => {
    if (tab === "vid-table") {
      return field.ads_col_name;
    } else {
      return field.static_log_col_name || field.ads_col_name;
    }
  };

  // Get Batch Week field (moved up for use in helper function)
  const batchWeekField = useMemo(() => {
    return fields.find((f) => {
      const nameLower = f.name.toLowerCase();
      return nameLower.includes("batch") && nameLower.includes("week");
    });
  }, [fields]);

  // Filter custom fields early (before helper functions that depend on it)
  const customFields = useMemo(() => {
    return fields.filter((f) => {
      const nameLower = f.name.toLowerCase();
      const isScriptId =
        nameLower.includes("script") && nameLower.includes("id");
      const isBatchWeek =
        nameLower.includes("batch") && nameLower.includes("week");
      if (tab === "vid-table" && isScriptId) return false;
      if (isBatchWeek) return false;
      return (
        !nameLower.includes("brand") &&
        !nameLower.includes("product") &&
        !nameLower.includes("cs")
      );
    });
  }, [fields, tab]);

  // Helper to get default funnel value for current tab
  const getDefaultFunnelValue = (): string => {
    const funnelField = customFields.find((f) =>
      f.name.toLowerCase().includes("funnel"),
    );
    if (!funnelField || !Array.isArray(funnelField.options)) return "";

    const options = funnelField.options as unknown[];
    let defaultOption = null;

    if (tab === "tsl-table") {
      // TSL tab: Show only TSL options
      defaultOption = options.find((option: unknown) => {
        const isObj = typeof option === "object" && option !== null;
        const label = isObj
          ? (option as { label: string }).label
          : String(option);
        return label.toUpperCase().includes("TSL");
      });
    } else if (tab === "img-table") {
      // IMG tab: Show all options EXCEPT TSL
      defaultOption = options.find((option: unknown) => {
        const isObj = typeof option === "object" && option !== null;
        const label = isObj
          ? (option as { label: string }).label
          : String(option);
        return !label.toUpperCase().includes("TSL");
      });
    }

    if (!defaultOption) return "";
    const isObj = typeof defaultOption === "object" && defaultOption !== null;
    return isObj
      ? (defaultOption as { label: string }).label
      : String(defaultOption);
  };

  // Helper function to create initial field group state dynamically
  const getInitialFieldGroup = (): FormFieldGroup => {
    const initialData: Record<string, unknown> = {};

    // Set batch week
    if (batchWeekField) {
      const colKey = getColumnKey(batchWeekField);
      if (colKey) {
        initialData[colKey] = currentWeekCode;
      }
    }

    // Set default funnel value
    const funnelField = customFields.find((f) =>
      f.name.toLowerCase().includes("funnel"),
    );
    if (funnelField) {
      const colKey = getColumnKey(funnelField);
      if (colKey) {
        const defaultFunnel = getDefaultFunnelValue();
        if (defaultFunnel) {
          initialData[colKey] = defaultFunnel;
        }
      }
    }

    return {
      id: "1",
      data: initialData,
      brandId: defaultBrandId ?? "",
      productId: defaultProductId ?? "",
      csId: "",
      qtyOfAds: "1",
      useScriptId: false,
      scriptSearch: "",
    };
  };

  const [fieldGroups, setFieldGroups] = useState<FormFieldGroup[]>([
    getInitialFieldGroup(),
  ]);

  const { data: brands = [], isLoading: brandsLoading } = useFilteredBrands();
  const { products = [], isLoading: productsLoading } = useProducts();
  const { data: allCsConfig = [], isLoading: csConfigLoading } = useCsConfig();

  // Fetch all scripts (no product filter) to support per-group filtering
  const { data: allScripts = [] } = useVideoScripts();

  // Helper to get scripts for a specific product and apply search filter
  const getScriptsForProduct = (
    productCode?: string,
    productName?: string,
    searchTerm: string = "",
  ): any[] => {
    let scripts =
      productCode || productName
        ? allScripts.filter(
            (script: any) =>
              script.product === productCode || script.product === productName,
          )
        : allScripts;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      scripts = scripts.filter((script: any) =>
        String(script.script_id)
          .padStart(6, "0")
          .toLowerCase()
          .includes(searchLower),
      );
    }

    return scripts;
  };

  const getCsConfigForBrand = (brandId: string): any[] => {
    const brand = brands.find((b) => b.id === brandId) as any;
    if (!brand) return [];

    const mainAndSecondaryEmails = [
      ...(brand.main_cs || []),
      ...(brand.secondary_cs || []),
    ];

    return mainAndSecondaryEmails.length > 0
      ? allCsConfig.filter((cs: any) =>
          mainAndSecondaryEmails.some(
            (email) =>
              cs.value?.toLowerCase().trim() === email.toLowerCase().trim(),
          ),
        )
      : [];
  };

  const getEditorOptionsForBrand = (brandId: string): any[] => {
    const brand = brands.find((b) => b.id === brandId) as any;
    if (!brand) return [];
    const emails = [
      ...(brand.main_editor || []),
      ...(brand.secondary_editor || []),
    ];
    return emails.length > 0
      ? allCsConfig.filter((cs: any) =>
          emails.some(
            (e: string) =>
              cs.value?.toLowerCase().trim() === e.toLowerCase().trim(),
          ),
        )
      : [];
  };

  // Convert field label to snake_case lowercase payload key
  const getPayloadKey = (fieldName: string): string => {
    return fieldName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFieldGroups([getInitialFieldGroup()]);
    }
  }, [
    open,
    currentWeekCode,
    batchWeekField,
    customFields,
    defaultBrandId,
    defaultProductId,
  ]);

  const handleInputChange = (
    groupId: string,
    colKey: string,
    value: unknown,
  ) => {
    setFieldGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, data: { ...group.data, [colKey]: value } }
          : group,
      ),
    );
  };

  const addFieldGroup = () => {
    const newId = String(
      Math.max(...fieldGroups.map((g) => parseInt(g.id) || 0)) + 1,
    );
    const initialData: Record<string, unknown> = {};
    if (batchWeekField) {
      const colKey = getColumnKey(batchWeekField);
      if (colKey) {
        initialData[colKey] = currentWeekCode;
      }
    }
    const firstGroup = fieldGroups[0];
    setFieldGroups((prev) => [
      ...prev,
      {
        id: newId,
        data: initialData,
        brandId: firstGroup.brandId,
        productId: firstGroup.productId,
        csId: "",
        qtyOfAds: "1",
        useScriptId: false,
        scriptSearch: "",
      },
    ]);
  };

  const removeFieldGroup = (groupId: string) => {
    if (fieldGroups.length > 1) {
      setFieldGroups((prev) => prev.filter((g) => g.id !== groupId));
    }
  };

  const handleGroupFieldChange = (
    groupId: string,
    field:
      | "brandId"
      | "productId"
      | "csId"
      | "qtyOfAds"
      | "useScriptId"
      | "scriptSearch",
    value: unknown,
  ) => {
    setFieldGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, [field]: value } : group,
      ),
    );
  };

  const isFormValid = (): boolean => {
    if (fieldGroups.length === 0) return false;

    // Check if all field groups have required fields
    return fieldGroups.every((group) => {
      // Brand, Product, and CS are always required
      if (!group.brandId || !group.productId || !group.csId) return false;

      // For VID tab, Script ID is required only when Use Existing Script ID is checked
      if (
        tab === "vid-table" &&
        group.useScriptId &&
        !group.data["script_id"]
      ) {
        return false;
      }

      return true;
    });
  };

  const buildDynamicPayload = (
    group: FormFieldGroup,
  ): Record<string, unknown> => {
    const enrichedFormData: Record<string, unknown> = {};

    // Add group-specific fields using snake_case keys - use labels/names instead of IDs
    const brandName =
      brands.find((b) => b.id === group.brandId)?.name || group.brandId;
    const productName =
      products.find((p) => p.id === group.productId)?.name || group.productId;

    enrichedFormData[getPayloadKey("brand")] = brandName;
    enrichedFormData[getPayloadKey("product")] = productName;
    enrichedFormData[getPayloadKey("cs")] = group.csId;
    enrichedFormData[getPayloadKey("qty of ads")] = group.qtyOfAds;

    // Add custom fields with dynamic snake_case keys
    Object.entries(group.data).forEach(([colKey, value]) => {
      const field = customFields.find((f) => {
        const fieldColKey = getColumnKey(f);
        return fieldColKey === colKey;
      });

      const payloadKey = field ? getPayloadKey(field.name) : colKey;
      enrichedFormData[payloadKey] = value;
    });

    // Add batch week if it exists
    if (batchWeekField) {
      const batchWeekColKey = getColumnKey(batchWeekField);
      if (batchWeekColKey && group.data[batchWeekColKey]) {
        enrichedFormData[getPayloadKey(batchWeekField.name)] =
          group.data[batchWeekColKey];
      }
    }

    // Add script ID for VID tab if checked
    if (tab === "vid-table" && group.useScriptId && group.data["script_id"]) {
      enrichedFormData[getPayloadKey("script id")] = group.data["script_id"];
    }

    // Add use existing script ID flag for VID tab
    if (tab === "vid-table") {
      enrichedFormData[getPayloadKey("use existing script id")] =
        group.useScriptId;
    }

    // Add default language
    enrichedFormData["language"] = "EN";

    return enrichedFormData;
  };

  const mapToVidApiSchema = (
    dynamicPayload: Record<string, unknown>,
  ): Record<string, unknown> => {
    // Map dynamic snake_case keys to API schema keys
    const apiPayload: Record<string, unknown> = {};

    // Define mapping from snake_case keys to API schema keys
    const keyMap: Record<string, string> = {
      use_existing_script_id: "useExisting",
      script_id: "script_id",
      batch_week: "batch_week",
      qty_of_ads: "qty",
    };

    // Copy and map keys
    Object.entries(dynamicPayload).forEach(([key, value]) => {
      const apiKey = keyMap[key] || key;
      apiPayload[apiKey] = value;
    });

    return apiPayload;
  };

  const pollJobStatus = async (
    jobId: string,
    baseUrl: string,
    totalAds: number = 1,
  ) => {
    // The poll budget scales with how many ads the job creates. Each ad runs a
    // full script → HeyGen → merge pipeline on the backend, so ~15 ads finish
    // inside a few minutes but ~50 ads can run well past a flat 5-min cap — which
    // made the FE wrongly report a "timeout" (and a red error toast) while the
    // backend was still working fine. Budget ≈ 25s/ad, floored at 5 min and
    // capped at 30 min.
    const maxDurationMs = Math.min(
      30 * 60 * 1000,
      Math.max(5 * 60 * 1000, totalAds * 25 * 1000),
    );
    const startedAt = Date.now();

    const poll = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${baseUrl}/ads/job/${jobId}`);
        if (!response.ok)
          throw new Error(`Job status check failed: ${response.status}`);

        const data = await response.json();
        console.log("Job status:", data);

        if (data.status === "running" || data.status === "pending") {
          const elapsed = Date.now() - startedAt;
          if (elapsed < maxDurationMs) {
            // Gentle backoff so a 50-ad job doesn't fire hundreds of status
            // requests: 1s early on, easing to 3s for long-running batches.
            const interval =
              elapsed < 60_000 ? 1000 : elapsed < 5 * 60_000 ? 2000 : 3000;
            await new Promise((resolve) => setTimeout(resolve, interval));
            return poll();
          }
          // The FE stopped waiting, but the backend job is still running — this
          // is NOT an error. Show an informational note and refresh so the ads
          // that have finished still appear; the backend continues regardless.
          toast({
            title: "Still processing",
            description:
              "Your ads are taking longer than usual and are still being created in the background. They'll appear in the table as they finish.",
            variant: "default",
          });
          onSuccess?.();
          return false;
        }

        if (data.status === "done") {
          toast({
            title: "Success",
            description: data.message,
            variant: "default",
          });
          // Trigger table refresh
          onSuccess?.();
          return true;
        }

        if (data.status === "error") {
          throw new Error(data.message || "Job failed");
        }

        return false;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to check job status";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        throw error;
      }
    };

    return poll();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
      if (!baseUrl) {
        throw new Error("API base URL not configured");
      }

      if (tab === "vid-table") {
        // Build VID payloads and map to API schema
        const vidPayloads = fieldGroups.map((group) => {
          const dynamicPayload = buildDynamicPayload(group);
          const apiPayload = mapToVidApiSchema(dynamicPayload);
          return { ...apiPayload, ad_type: "VID" };
        });

        console.log("Submitting VID payload to /add-new-ad:", vidPayloads);

        const response = await fetch(`${baseUrl}/add-new-ad`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            vidPayloads.length === 1 ? vidPayloads[0] : vidPayloads,
          ),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error: ${response.status}`, errorText);
          throw new Error(
            `Failed to add video ad: ${response.status} ${errorText}`,
          );
        }

        const result = await response.json();
        const jobId = result.jobId;

        if (!jobId) {
          throw new Error("No job ID returned from API");
        }

        console.log("Job ID:", jobId);

        // Show initial processing toast
        toast({
          title: "Processing",
          description:
            "Please wait a moment, your ads are being created. Once the queue is completed, the ads will appear on the table.",
          variant: "default",
        });

        // Close dialog immediately after showing processing message
        setFieldGroups([getInitialFieldGroup()]);
        onOpenChange(false);

        // Poll the job status in background (without showing toasts during polling).
        // Pass the total ad count so the poll budget scales with the batch size.
        const totalAds = fieldGroups.reduce(
          (sum, g) => sum + (parseInt(g.qtyOfAds, 10) || 1),
          0,
        );
        pollJobStatus(jobId, baseUrl, totalAds).catch((error) => {
          console.error("Job polling failed:", error);
        });
      } else {
        // For TSL/IMG tabs, build dynamic payloads with all custom fields
        const payloads = fieldGroups.map((group) => {
          const dynamicPayload = buildDynamicPayload(group);
          return {
            ...dynamicPayload,
            ad_type: tab === "tsl-table" ? "TSL" : "IMG",
          };
        });

        console.log("Submit brief payload (TSL/IMG):", payloads);

        const response = await fetch(`${baseUrl}/api/submit-brief`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloads.length === 1 ? payloads[0] : payloads),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API error: ${response.status}`, errorText);
          throw new Error(
            `Failed to submit brief: ${response.status} ${errorText}`,
          );
        }

        // Show success toast
        toast({
          title: "Success",
          description: "Brief submitted successfully.",
          variant: "default",
        });

        // Close dialog and reset form
        setFieldGroups([getInitialFieldGroup()]);
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      console.error("Failed to create ad:", error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Renders a field's value using the grid's own DropdownCellEditor, wrapped
  // in a Popover so it can live inside a normal form (DropdownCellEditor expects
  // an AG Grid editor host, so we supply `stopEditing` ourselves to close the popover).
  const renderCellEditorDropdown = (
    group: FormFieldGroup,
    field: AdsField,
    colKey: string,
    options: Array<{ label: string; value: string }>,
    canManageOptions: boolean,
  ) => {
    const key = `${group.id}-${field.id}`;
    const selectedValue = String(group.data[colKey] || "");
    const isOpen = openDropdownKey === key;

    return (
      <Popover
        open={isOpen}
        onOpenChange={(o) => setOpenDropdownKey(o ? key : null)}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between font-normal"
          >
            <span
              className={`truncate text-left ${selectedValue ? "" : "text-muted-foreground"}`}
            >
              {selectedValue || `Select ${field.name.toLowerCase()}...`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-auto" align="start">
          <DropdownCellEditor
            value={selectedValue}
            onValueChange={(val: unknown) =>
              handleInputChange(group.id, colKey, val)
            }
            stopEditing={() => setOpenDropdownKey(null)}
            options={options}
            canAddOptions={canManageOptions}
            onOpenManageOptions={() => {
              const productName = products.find(
                (p) => p.id === group.productId,
              )?.name;
              setManageOptionsProductName(productName);
              setManageOptionsFieldId(field.id);
              setOpenDropdownKey(null);
            }}
          />
        </PopoverContent>
      </Popover>
    );
  };
  const renderMultiSelectCellEditor = (
    group: FormFieldGroup,
    field: AdsField,
    colKey: string,
    options: Array<{ label: string; value: string }>,
    canManageOptions: boolean,
  ) => {
    const key = `${group.id}-${field.id}`;
    const rawValue = String(group.data[colKey] || "");
    const selectedLabels = rawValue.trim()
      ? rawValue
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const isOpen = openDropdownKey === key;

    return (
      <Popover
        open={isOpen}
        onOpenChange={(o) => setOpenDropdownKey(o ? key : null)}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between font-normal"
          >
            <span
              className={`truncate text-left ${selectedLabels.length ? "" : "text-muted-foreground"}`}
            >
              {selectedLabels.length
                ? selectedLabels.join(", ")
                : `Select ${field.name.toLowerCase()}...`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-auto" align="start">
          <MultiSelectCellEditor
            value={rawValue}
            onValueChange={(val: unknown) =>
              handleInputChange(group.id, colKey, val)
            }
            stopEditing={() => setOpenDropdownKey(null)}
            options={options}
            canAddOptions={canManageOptions}
            onOpenManageOptions={() => {
              const productName = products.find(
                (p) => p.id === group.productId,
              )?.name;
              setManageOptionsProductName(productName);
              setManageOptionsFieldId(field.id);
              setOpenDropdownKey(null);
            }}
          />
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b">
            <DialogTitle className="text-xl font-bold">
              {config.title}
            </DialogTitle>
            <p className="text-muted-foreground text-sm mt-1">
              {config.subtitle}
            </p>
          </div>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              {/* Dynamic Field Groups */}
              {fieldGroups.map((group, groupIndex) => (
                <div key={group.id} className="col-span-2 space-y-4 ">
                  {groupIndex > 0 && (
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        Ad Configuration {groupIndex + 1}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFieldGroup(group.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-6">
                    {/* Brand Selection */}
                    <div className="space-y-2">
                      <Label className="font-medium text-foreground">
                        Brand <span className="text-red-500">*</span>
                      </Label>
                      {defaultBrandId ? (
                        <div className="h-10 px-3 flex items-center rounded-md border bg-muted text-sm text-muted-foreground cursor-not-allowed">
                          {brands.find((b) => b.id === defaultBrandId)?.name ??
                            "—"}
                        </div>
                      ) : (
                        <Select
                          value={group.brandId}
                          onValueChange={(val) =>
                            handleGroupFieldChange(group.id, "brandId", val)
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue
                              placeholder={
                                brandsLoading ? "Loading…" : "Select brand"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {brands.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Product Selection */}
                    <div className="space-y-2">
                      <Label className="font-medium text-foreground">
                        Product <span className="text-red-500">*</span>
                      </Label>
                      {defaultProductId ? (
                        <div className="h-10 px-3 flex items-center rounded-md border bg-muted text-sm text-muted-foreground cursor-not-allowed">
                          {products.find((p) => p.id === defaultProductId)
                            ?.name ?? "—"}
                        </div>
                      ) : (
                        (() => {
                          const groupProducts = group.brandId
                            ? products.filter(
                                (p: Product) => p.brand_id === group.brandId,
                              )
                            : [];
                          return (
                            <Select
                              value={group.productId}
                              onValueChange={(val) =>
                                handleGroupFieldChange(
                                  group.id,
                                  "productId",
                                  val,
                                )
                              }
                              disabled={!group.brandId}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue
                                  placeholder={
                                    !group.brandId
                                      ? "Select brand first"
                                      : productsLoading
                                        ? "Loading…"
                                        : "Select product"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {groupProducts.map((p: Product) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()
                      )}
                    </div>

                    {/* CS Selection */}
                    <div className="space-y-2">
                      <Label className="font-medium text-foreground">
                        CS <span className="text-red-500">*</span>
                      </Label>
                      {(() => {
                        const groupCsConfig = getCsConfigForBrand(
                          group.brandId,
                        );
                        return (
                          <Select
                            value={group.csId}
                            onValueChange={(val) =>
                              handleGroupFieldChange(group.id, "csId", val)
                            }
                            disabled={!group.brandId}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue
                                placeholder={
                                  !group.brandId
                                    ? "Select brand first"
                                    : csConfigLoading
                                      ? "Loading…"
                                      : "Select CS"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {groupCsConfig.map((cs: any) => (
                                <SelectItem key={cs.id} value={cs.label}>
                                  {cs.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>

                    {/* Batch Week */}
                    {batchWeekField && (
                      <div className="space-y-2">
                        <Label className="font-medium text-foreground">
                          {batchWeekField.name}
                        </Label>
                        {(() => {
                          const colKey = getColumnKey(batchWeekField);
                          const selectedValue = String(
                            group.data[colKey || ""] || "",
                          );
                          return (
                            <Select
                              value={selectedValue}
                              onValueChange={(val) =>
                                handleInputChange(group.id, colKey || "", val)
                              }
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue>
                                  {selectedValue || "Select a week..."}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {weekCodes.map((week) => (
                                  <SelectItem key={week.code} value={week.code}>
                                    {week.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </div>
                    )}

                    {/* Custom Fields */}
                    {customFields.length > 0 && (
                      <>
                        {customFields.map((field) => {
                          const colKey = getColumnKey(field);
                          if (!colKey) return null;

                          return (
                            <div
                              key={field.id}
                              className={`space-y-2 ${(field.type === "dropdown" || field.type === "dropdown_text") && (field.name.toLowerCase().includes("description") || field.name.toLowerCase().includes("week")) ? "col-span-2" : ""}`}
                            >
                              <Label className="font-medium text-foreground">
                                {field.name}
                              </Label>

                              {/* TSL Script ID dropdown */}
                              {colKey === "tsl_script_id" &&
                              tab === "tsl-table" &&
                              tslScripts.length > 0 ? (
                                <Select
                                  value={String(group.data[colKey] || "")}
                                  onValueChange={(val) =>
                                    handleInputChange(group.id, colKey, val)
                                  }
                                >
                                  <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Select a TSL script..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {tslScripts.map((script) => (
                                      <SelectItem
                                        key={script.id}
                                        value={script.tsl_script_id}
                                      >
                                        {script.tsl_script_id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : field.type === "text" ? (
                                <Input
                                  type="text"
                                  value={String(group.data[colKey] || "")}
                                  onChange={(e) =>
                                    handleInputChange(
                                      group.id,
                                      colKey,
                                      e.target.value,
                                    )
                                  }
                                  placeholder={`Enter ${field.name.toLowerCase()}`}
                                  className="h-10"
                                />
                              ) : field.type === "number" ? (
                                <Input
                                  type="number"
                                  value={
                                    group.data[colKey]
                                      ? Number(group.data[colKey])
                                      : ""
                                  }
                                  onChange={(e) =>
                                    handleInputChange(
                                      group.id,
                                      colKey,
                                      e.target.value
                                        ? Number(e.target.value)
                                        : "",
                                    )
                                  }
                                  placeholder={`Enter ${field.name.toLowerCase()}`}
                                  className="h-10"
                                />
                              ) : (field.type === "dropdown" ||
                                  field.type === "dropdown_text") &&
                                Array.isArray(field.options) ? (
                                (() => {
                                  const fieldNameLower = field.name
                                    .toLowerCase()
                                    .trim();
                                  const useMultiSelectCellEditor =
                                    MULTI_SELECT_EDITABLE_FIELDS.includes(
                                      fieldNameLower,
                                    );
                                  const useCellEditorPopup =
                                    SEARCHABLE_EDITABLE_FIELDS.includes(
                                      fieldNameLower,
                                    ) ||
                                    SEARCHABLE_ONLY_FIELDS.includes(
                                      fieldNameLower,
                                    );

                                  // Filter options based on field type and tab
                                  const isFunnelField = field.name
                                    .toLowerCase()
                                    .includes("funnel");
                                  let filteredOptions: unknown[] =
                                    field.options as unknown[];

                                  // Filter by product name if this is a product-level field
                                  if (
                                    field.is_option_product_level &&
                                    group.productId
                                  ) {
                                    const productName = products.find(
                                      (p: Product) => p.id === group.productId,
                                    )?.name;
                                    if (productName) {
                                      filteredOptions = filteredOptions.filter(
                                        (option: unknown) => {
                                          if (
                                            typeof option === "object" &&
                                            option !== null &&
                                            "product" in option
                                          ) {
                                            return (
                                              option as { product: string[] }
                                            ).product.includes(productName);
                                          }
                                          return true;
                                        },
                                      );
                                    }
                                  }

                                  let defaultValue = "";

                                  if (isFunnelField) {
                                    if (tab === "tsl-table") {
                                      // TSL tab: Show only TSL options
                                      filteredOptions = filteredOptions.filter(
                                        (option: unknown) => {
                                          const isObj =
                                            typeof option === "object" &&
                                            option !== null;
                                          const label = isObj
                                            ? (option as { label: string })
                                                .label
                                            : String(option);
                                          return label
                                            .toUpperCase()
                                            .includes("TSL");
                                        },
                                      );
                                      // Set default to first TSL option
                                      if (filteredOptions.length > 0) {
                                        const isObj =
                                          typeof filteredOptions[0] ===
                                            "object" &&
                                          filteredOptions[0] !== null;
                                        defaultValue = isObj
                                          ? (
                                              filteredOptions[0] as {
                                                label: string;
                                              }
                                            ).label
                                          : String(filteredOptions[0]);
                                      }
                                    } else if (tab === "img-table") {
                                      // IMG tab: Show all options EXCEPT TSL
                                      filteredOptions = filteredOptions.filter(
                                        (option: unknown) => {
                                          const isObj =
                                            typeof option === "object" &&
                                            option !== null;
                                          const label = isObj
                                            ? (option as { label: string })
                                                .label
                                            : String(option);
                                          return !label
                                            .toUpperCase()
                                            .includes("TSL");
                                        },
                                      );
                                      // Set default to first non-TSL option
                                      if (filteredOptions.length > 0) {
                                        const isObj =
                                          typeof filteredOptions[0] ===
                                            "object" &&
                                          filteredOptions[0] !== null;
                                        defaultValue = isObj
                                          ? (
                                              filteredOptions[0] as {
                                                label: string;
                                              }
                                            ).label
                                          : String(filteredOptions[0]);
                                      }
                                    }
                                  }

                                  const selectedValue = String(
                                    group.data[colKey] || defaultValue || "",
                                  );

                                  // ── Root Cause / Funnel / CTA / Persona / Angle / Awareness Level: use the grid's own DropdownCellEditor ──
                                  if (useMultiSelectCellEditor) {
                                    const editorOptions = filteredOptions.map(
                                      (opt: unknown) => {
                                        const isObj =
                                          typeof opt === "object" &&
                                          opt !== null;
                                        const label = isObj
                                          ? (opt as { label: string }).label
                                          : String(opt);
                                        return { label, value: label };
                                      },
                                    );

                                    const canManageOptions =
                                      !!onManageFieldOptions &&
                                      !field.is_add_in_clickup;

                                    return renderMultiSelectCellEditor(
                                      group,
                                      field,
                                      colKey,
                                      editorOptions,
                                      canManageOptions,
                                    );
                                  }

                                  // ── Funnel / CTA / Persona / Angle / Awareness Level: use the grid's own DropdownCellEditor ──
                                  if (useCellEditorPopup) {
                                    const editorOptions = filteredOptions.map(
                                      (opt: unknown) => {
                                        const isObj =
                                          typeof opt === "object" &&
                                          opt !== null;
                                        const label = isObj
                                          ? (opt as { label: string }).label
                                          : String(opt);
                                        return { label, value: label };
                                      },
                                    );

                                    const canManageOptions =
                                      SEARCHABLE_EDITABLE_FIELDS.includes(
                                        fieldNameLower,
                                      ) &&
                                      !!onManageFieldOptions &&
                                      (fieldNameLower === "angle" ||
                                        !field.is_add_in_clickup);

                                    return renderCellEditorDropdown(
                                      group,
                                      field,
                                      colKey,
                                      editorOptions,
                                      canManageOptions,
                                    );
                                  }

                                  if (field.is_multi_select) {
                                    const multiOptions = filteredOptions.map(
                                      (opt: unknown) => {
                                        const isObj =
                                          typeof opt === "object" &&
                                          opt !== null;
                                        const label = isObj
                                          ? (opt as { label: string }).label
                                          : String(opt);
                                        const value = isObj
                                          ? (opt as { label: string }).label
                                          : String(opt);
                                        return { label, value };
                                      },
                                    );
                                    const parsedValues = selectedValue.trim()
                                      ? selectedValue
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean)
                                      : [];

                                    return (
                                      <MultiSelect
                                        options={multiOptions}
                                        value={parsedValues}
                                        onClose={(values) => {
                                          handleInputChange(
                                            group.id,
                                            colKey,
                                            values.join(","),
                                          );
                                        }}
                                        placeholder={`Select ${field.name.toLowerCase()}...`}
                                        className="h-10 text-sm"
                                      />
                                    );
                                  }

                                  // Show the ⚙ Edit Options button for non-ClickUp dropdown fields
                                  // when the parent has provided manage-option callbacks (same rule as the table)
                                  const canManageOptions =
                                    onManageFieldOptions &&
                                    !field.is_add_in_clickup &&
                                    (field.type === "dropdown" ||
                                      field.type === "dropdown_text");

                                  // Per-field search for dropdowns with many options
                                  const fieldSearch =
                                    fieldSearchTerms[field.id] ?? "";
                                  const searchFilteredOptions = fieldSearch
                                    ? filteredOptions.filter((opt: unknown) => {
                                        const isObj =
                                          typeof opt === "object" &&
                                          opt !== null;
                                        const label = isObj
                                          ? (opt as { label: string }).label
                                          : String(opt);
                                        return label
                                          .toLowerCase()
                                          .includes(fieldSearch.toLowerCase());
                                      })
                                    : filteredOptions;

                                  return (
                                    <Select
                                      value={selectedValue}
                                      onValueChange={(val) => {
                                        handleInputChange(
                                          group.id,
                                          colKey,
                                          val,
                                        );
                                        // Set default value if not already set
                                        if (
                                          !group.data[colKey] &&
                                          defaultValue
                                        ) {
                                          handleInputChange(
                                            group.id,
                                            colKey,
                                            defaultValue,
                                          );
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue
                                          placeholder={`Select ${field.name.toLowerCase()}...`}
                                        />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {/* Search input inside dropdown */}
                                        <div className="p-2 border-b">
                                          <Input
                                            autoFocus
                                            placeholder={`Search ${field.name.toLowerCase()}...`}
                                            value={fieldSearch}
                                            onChange={(e) =>
                                              setFieldSearchTerms((prev) => ({
                                                ...prev,
                                                [field.id]: e.target.value,
                                              }))
                                            }
                                            className="h-7 text-sm"
                                            onKeyDown={(e) =>
                                              e.stopPropagation()
                                            }
                                          />
                                        </div>
                                        {searchFilteredOptions.length === 0 ? (
                                          <div className="py-2 px-3 text-sm text-muted-foreground">
                                            No results
                                          </div>
                                        ) : (
                                          <div className="max-h-48 overflow-y-auto">
                                            {searchFilteredOptions.map(
                                              (
                                                option: unknown,
                                                idx: number,
                                              ) => {
                                                const isObj =
                                                  typeof option === "object" &&
                                                  option !== null;
                                                const label = isObj
                                                  ? (
                                                      option as {
                                                        label: string;
                                                      }
                                                    ).label
                                                  : String(option);
                                                const value = isObj
                                                  ? (
                                                      option as {
                                                        label: string;
                                                      }
                                                    ).label
                                                  : String(option);
                                                return (
                                                  <SelectItem
                                                    key={`${idx}-${value}`}
                                                    value={value}
                                                  >
                                                    {label}
                                                  </SelectItem>
                                                );
                                              },
                                            )}
                                          </div>
                                        )}
                                        {/* ⚙ Edit Options — same as the table's dropdown behaviour */}
                                        {canManageOptions && (
                                          <div className="border-t mt-1 pt-1">
                                            <button
                                              type="button"
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                setManageOptionsFieldId(
                                                  field.id,
                                                );
                                              }}
                                              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                                            >
                                              <Settings className="h-3.5 w-3.5" />
                                              Edit Options
                                            </button>
                                          </div>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  );
                                })()
                              ) : field.type === "date" ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="w-full justify-start text-left font-normal h-10"
                                    >
                                      {group.data[colKey]
                                        ? format(
                                            new Date(
                                              String(group.data[colKey]),
                                            ),
                                            "dd MMM yyyy",
                                          )
                                        : "Pick a date..."}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                  >
                                    <Calendar
                                      mode="single"
                                      selected={
                                        group.data[colKey]
                                          ? new Date(String(group.data[colKey]))
                                          : undefined
                                      }
                                      onSelect={(date) =>
                                        handleInputChange(
                                          group.id,
                                          colKey,
                                          date
                                            ? date.toISOString().split("T")[0]
                                            : "",
                                        )
                                      }
                                    />
                                  </PopoverContent>
                                </Popover>
                              ) : field.type === "user" ? (
                                (() => {
                                  const name = field.name.toLowerCase();
                                  const userOpts = name.includes("editor")
                                    ? getEditorOptionsForBrand(group.brandId)
                                    : getCsConfigForBrand(group.brandId);
                                  return (
                                    <Select
                                      value={String(group.data[colKey] || "")}
                                      onValueChange={(val) =>
                                        handleInputChange(group.id, colKey, val)
                                      }
                                      disabled={!group.brandId}
                                    >
                                      <SelectTrigger className="h-10">
                                        <SelectValue
                                          placeholder={
                                            !group.brandId
                                              ? "Select brand first"
                                              : `Select ${field.name.toLowerCase()}...`
                                          }
                                        />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {userOpts.map((u: any) => (
                                          <SelectItem
                                            key={u.id}
                                            value={u.label}
                                          >
                                            {u.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  );
                                })()
                              ) : (
                                <Input
                                  type="text"
                                  value={String(group.data[colKey] || "")}
                                  onChange={(e) =>
                                    handleInputChange(
                                      group.id,
                                      colKey,
                                      e.target.value,
                                    )
                                  }
                                  placeholder={`Enter ${field.name.toLowerCase()}`}
                                  className="h-10"
                                />
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Qty of Ads - only for VID tab */}
                    {tab === "vid-table" && (
                      <div className="space-y-2">
                        <Label className="font-medium text-foreground">
                          Qty of Ads
                        </Label>
                        <Select
                          value={group.qtyOfAds}
                          onValueChange={(val) =>
                            handleGroupFieldChange(group.id, "qtyOfAds", val)
                          }
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select quantity" />
                          </SelectTrigger>
                          <SelectContent>
                            {QTY_OPTIONS.map((qty) => (
                              <SelectItem key={qty} value={qty}>
                                {qty}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Use Existing Script ID checkbox (only for VID tab) */}
                    {tab === "vid-table" && (
                      <div className="space-y-2 col-span-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`use-script-id-${group.id}`}
                            checked={group.useScriptId}
                            onCheckedChange={(checked) =>
                              handleGroupFieldChange(
                                group.id,
                                "useScriptId",
                                checked === true,
                              )
                            }
                            disabled={!group.productId}
                          />
                          <Label
                            htmlFor={`use-script-id-${group.id}`}
                            className={`font-medium cursor-pointer ${
                              group.productId
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            Use Existing Script ID
                          </Label>
                        </div>
                        {!group.productId && (
                          <p className="text-xs text-muted-foreground">
                            Select a product first
                          </p>
                        )}
                      </div>
                    )}

                    {/* Script ID dropdown for VID tab when checkbox is checked */}
                    {tab === "vid-table" && group.useScriptId && (
                      <div className="space-y-2">
                        <Label className="font-medium text-foreground">
                          Script ID <span className="text-red-500">*</span>
                        </Label>
                        {(() => {
                          const groupProduct = products.find(
                            (p: Product) => p.id === group.productId,
                          );
                          const groupScripts = getScriptsForProduct(
                            groupProduct?.product_code,
                            groupProduct?.name,
                            group.scriptSearch,
                          );

                          return (
                            <Select
                              value={String(group.data["script_id"] || "")}
                              onValueChange={(val) => {
                                handleInputChange(group.id, "script_id", val);
                              }}
                            >
                              <SelectTrigger className="h-10">
                                {group.data["script_id"] ? (
                                  <span>
                                    {String(group.data["script_id"]).padStart(
                                      6,
                                      "0",
                                    )}
                                  </span>
                                ) : (
                                  <SelectValue
                                    placeholder={
                                      groupScripts.length === 0
                                        ? "No scripts available"
                                        : "Search script ID..."
                                    }
                                  />
                                )}
                              </SelectTrigger>
                              <SelectContent className="w-full">
                                <div className="p-2 border-b">
                                  <Input
                                    autoFocus
                                    placeholder="Search script ID..."
                                    value={group.scriptSearch}
                                    onChange={(e) =>
                                      handleGroupFieldChange(
                                        group.id,
                                        "scriptSearch",
                                        e.target.value,
                                      )
                                    }
                                    className="h-8"
                                  />
                                </div>
                                {groupScripts.length === 0 ? (
                                  <div className="p-2 text-sm text-muted-foreground">
                                    {groupProduct && group.scriptSearch
                                      ? `No scripts matching "${group.scriptSearch}"`
                                      : groupProduct
                                        ? "No scripts available for this product"
                                        : "Select a product first"}
                                  </div>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto">
                                    {groupScripts.map((script: any) => (
                                      <SelectItem
                                        key={script.id}
                                        value={script.script_id}
                                        className="cursor-pointer"
                                      >
                                        {String(script.script_id).padStart(
                                          6,
                                          "0",
                                        )}
                                      </SelectItem>
                                    ))}
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Add Other Ad Configuration button (VID tab only) */}
                  {tab === "vid-table" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addFieldGroup}
                      className="w-full mt-4 gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Other Ad Configuration
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 flex justify-end gap-3 bg-muted/50">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid()}
              className="h-10"
            >
              {isSubmitting ? "Adding..." : `Add ${config.label}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ⚙ Manage Options dialog — mirrors the table's "Edit Options" popup */}
      {onManageFieldOptions &&
        manageOptionsFieldId &&
        (() => {
          const field = fields.find((f) => f.id === manageOptionsFieldId);
          if (!field || !Array.isArray(field.options)) return null;
          const normalizedOptions = normalizeDropdownOptions(
            field.options as unknown[],
            !!field.is_option_product_level,
            manageOptionsProductName,
          );
          return (
            <ManageOptionsDialog
              open={!!manageOptionsFieldId}
              onClose={() => setManageOptionsFieldId(null)}
              fieldName={field.name}
              initialOptions={normalizedOptions}
              onAdd={(label) =>
                onManageFieldOptions.onAdd(manageOptionsFieldId, label)
              }
              onRemove={(label) =>
                onManageFieldOptions.onRemove(manageOptionsFieldId, label)
              }
              onRename={(oldLabel, newLabel) =>
                onManageFieldOptions.onRename(
                  manageOptionsFieldId,
                  oldLabel,
                  newLabel,
                )
              }
              canEdit={true}
            />
          );
        })()}
    </>
  );
}
