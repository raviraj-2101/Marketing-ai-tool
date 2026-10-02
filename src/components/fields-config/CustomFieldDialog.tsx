import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { OptionsInput } from './OptionsInput';
import {
  FIELD_TYPES,
  CONTAINS_OPTIONS,
  isProductOptions,
  type FieldType,
  type ObjectOption,
  type ProductOption,
  type CustomField,
  type CustomFieldCreatePayload,
  type CustomFieldUpdatePayload,
  type ContainsValue,
} from '@/hooks/useCustomFields';
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: CustomField | null;
  onSubmit: (payload: CustomFieldCreatePayload | CustomFieldUpdatePayload) => void;
  isLoading: boolean;
  products?: Array<{ id: string; name: string }>;
  selectedBrandId?: string;
  selectedProductId?: string;
  selectedProductName?: string;
  isDev?: boolean;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  user: 'User',
  number: 'Number',
  dropdown: 'Dropdown',
  dropdown_text: 'Dropdown + Text',
  date: 'Date',
};

function isObjectOptions(options: CustomField['options']): options is ObjectOption[] {
  return Array.isArray(options) && options.length > 0 && typeof options[0] === 'object' && !('product' in (options[0] as object));
}

/** Merge visibleLabels (options for selectedProductName) back into the full productOptions array. */
function mergeProductOptions(
  allOpts: ProductOption[],
  visibleLabels: string[],
  productName: string | undefined,
): ProductOption[] {
  if (!productName) {
    return visibleLabels.filter(Boolean).map((label) => ({ label, product: [] }));
  }

  // Build a map of existing options by label
  const existingByLabel = new Map(allOpts.map((o) => [o.label, o]));

  // Strip this product from all existing options — we'll re-add based on visibleLabels
  const strippedOpts = allOpts.map((o) => ({
    ...o,
    product: o.product.filter((p) => p !== productName),
  }));

  const labelSet = new Set(visibleLabels.filter(Boolean));
  const result: ProductOption[] = [];
  const handled = new Set<string>();

  // Re-add stripped options (other products preserved)
  for (const opt of strippedOpts) {
    if (labelSet.has(opt.label)) {
      // Still visible → restore productName
      result.push({ ...opt, product: [...opt.product, productName] });
    } else if (opt.product.length > 0) {
      // Other products still have this option → keep without productName
      result.push(opt);
    }
    handled.add(opt.label);
  }

  // New labels not in existing options
  for (const label of labelSet) {
    if (!handled.has(label) && !existingByLabel.has(label)) {
      result.push({ label, product: [productName] });
    }
  }

  return result;
}

export function CustomFieldDialog({
  open,
  onOpenChange,
  field,
  onSubmit,
  isLoading,
  products = [],
  selectedBrandId,
  selectedProductId,
  selectedProductName,
  isDev = true
}: Props) {
  const isEdit = Boolean(field);

  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType | ''>('');
  const [showAdditional, setShowAdditional] = useState(false);

  // Additional settings
  const [isAddInClickup, setIsAddInClickup] = useState(false);
  const [isUpdateInCron, setIsUpdateInCron] = useState(false);
  const [isShowAsLink, setIsShowAsLink] = useState(false);
  const [isEditableFields, setIsEditableFields] = useState(false);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isProductLevel, setIsProductLevel] = useState(false);
  const [clickupId, setClickupId] = useState('');
  const [adsColName, setAdsColName] = useState('');
  const [staticLogColName, setStaticLogColName] = useState('');
  const [contains, setContains] = useState<ContainsValue[]>([]);
  const [order, setOrder] = useState<string>('');

  // Options state
  const [stringOptions, setStringOptions] = useState<string[]>([]);
  const [objectOptions, setObjectOptions] = useState<ObjectOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open && field) {
      setName(field.name);
      setType(field.type);
      setIsAddInClickup(field.is_add_in_clickup);
      setIsUpdateInCron(field.is_update_in_cron);
      setIsShowAsLink(field.is_show_as_link ?? false);
      setIsEditableFields(field.is_editable_fields ?? false);
      setIsMultiSelect(field.is_multi_select ?? false);
      setIsProductLevel(field.is_option_product_level ?? false);
      setClickupId(field.clickup_id ?? '');
      setAdsColName(field.ads_col_name ?? '');
      setStaticLogColName(field.static_log_col_name ?? '');
      setContains((field.contains as ContainsValue[]) ?? []);
      setOrder(field.order != null ? String(field.order) : '');
      setDraft('');
      setShowAdditional(false);

      if (field.is_option_product_level && isProductOptions(field.options)) {
        const allProdOpts = field.options as ProductOption[];
        setProductOptions(allProdOpts);
        // Show only options for the selected product (Option A)
        const visible = selectedProductName
          ? allProdOpts.filter((o) => o.product.includes(selectedProductName)).map((o) => o.label)
          : allProdOpts.map((o) => o.label);
        setStringOptions(visible);
        setObjectOptions([]);
      } else if (isObjectOptions(field.options)) {
        setObjectOptions(field.options as ObjectOption[]);
        setStringOptions([]);
        setProductOptions([]);
      } else {
        setStringOptions((field.options as string[]) ?? []);
        setObjectOptions([]);
        setProductOptions([]);
      }
    } else if (!open) {
      setName('');
      setType('');
      setIsAddInClickup(false);
      setIsUpdateInCron(false);
      setIsShowAsLink(false);
      setIsEditableFields(false);
      setIsMultiSelect(false);
      setIsProductLevel(false);
      setClickupId('');
      setAdsColName('');
      setStaticLogColName('');
      setContains([]);
      setOrder('');
      setStringOptions([]);
      setObjectOptions([]);
      setProductOptions([]);
      setDraft('');
      setShowAdditional(false);
    }
  }, [open, field, selectedProductName]);

  const handleContainsToggle = (value: ContainsValue, checked: boolean) => {
    const group = CONTAINS_OPTIONS.find((g) => g.parent === value || g.child === value);
    if (!group) return;

    if (checked) {
      if (value === group.parent) {
        setContains((prev) => Array.from(new Set([...prev, group.parent, group.child])));
      } else {
        setContains((prev) => Array.from(new Set([...prev, value])));
      }
    } else {
      if (value === group.parent) {
        setContains((prev) => prev.filter((v) => v !== group.parent));
      } else {
        setContains((prev) => prev.filter((v) => v !== value));
      }
    }
  };

  const handleClickupToggle = (checked: boolean) => {
    setIsAddInClickup(checked);
    if (checked) {
      // dropdown_text can coexist with product-level options; only regular dropdown cannot
      if (type !== 'dropdown_text') {
        setIsProductLevel(false);
        setProductOptions([]);
        setObjectOptions(stringOptions.map((s) => ({ label: s, value: '' })));
        setIsMultiSelect(false);
      }
    } else {
      if (type !== 'dropdown_text') {
        setStringOptions(objectOptions.map((o) => o.label).filter(Boolean));
      }
    }
  };

  const handleProductLevelToggle = (checked: boolean) => {
    setIsProductLevel(checked);
    if (checked) {
      // Convert current string options seeding the selected product name
      const converted: ProductOption[] = stringOptions.map((label) => ({
        label,
        product: selectedProductName ? [selectedProductName] : [],
      }));
      setProductOptions(converted);
    } else {
      // Revert: show visible labels for selected product
      const visible = selectedProductName
        ? productOptions.filter((o) => o.product.includes(selectedProductName)).map((o) => o.label)
        : productOptions.map((o) => o.label);
      setStringOptions(visible);
      setProductOptions([]);
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || !type) return;

    let options: string[] | ObjectOption[] | ProductOption[] | null;

    if (isProductLevel) {
      const merged = mergeProductOptions(productOptions, stringOptions, selectedProductName);
      options = merged.length > 0 ? merged : null;
    } else if (isAddInClickup && type !== 'dropdown_text') {
      const filtered = objectOptions.filter((o) => o.label.trim());
      options = filtered.length > 0 ? filtered : null;
    } else {
      const filtered = stringOptions.filter(Boolean);
      options = filtered.length > 0 ? filtered : null;
    }

    const payload = {
      name: name.trim(),
      type: type as FieldType,
      options,
      is_add_in_clickup: isAddInClickup,
      is_update_in_cron: isUpdateInCron && type !== 'dropdown_text',
      is_show_as_link: isShowAsLink,
      is_editable_fields: isEditableFields,
      is_multi_select: (type === 'dropdown' && !isAddInClickup) || type === 'dropdown_text' ? isMultiSelect : false,
      is_option_product_level: (type === 'dropdown' || type === 'dropdown_text') ? isProductLevel : false,
      clickup_id: isAddInClickup && clickupId.trim() ? clickupId.trim() : null,
      ads_col_name: adsColName.trim() || null,
      static_log_col_name: staticLogColName.trim() || null,
      contains: contains.length > 0 ? contains : null,
      order: order !== '' ? Number(order) : null,
    };

    if (isEdit && field) {
      onSubmit({ id: field.id, ...payload } as CustomFieldUpdatePayload);
    } else {
      onSubmit(payload as CustomFieldCreatePayload);
    }
  };

  const isValid = name.trim() !== '' && type !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-1 py-1 overflow-y-auto flex-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ad Format"
            />
          </div>

          {/* Type */}
          {isDev && (
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select field type" />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {FIELD_TYPE_LABELS[ft]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Options */}
          {isProductLevel ? (
            <div className="space-y-1">
              <OptionsInput
                mode="string"
                value={stringOptions}
                onChange={setStringOptions}
                draft={draft}
                onDraftChange={setDraft}
              />
              {!selectedProductName && (
                <p className="text-xs text-muted-foreground">Select a product on the Fields Config page to filter options by product</p>
              )}
              {selectedProductName && (
                <p className="text-xs text-muted-foreground">
                  Showing options for: <span className="font-medium">{selectedProductName}</span>
                </p>
              )}
            </div>
          ) : isAddInClickup && type !== 'dropdown_text' ? (
            <OptionsInput mode="object" value={objectOptions} onChange={setObjectOptions} />
          ) : (
            <OptionsInput
              mode="string"
              value={stringOptions}
              onChange={setStringOptions}
              draft={draft}
              onDraftChange={setDraft}
            />
          )}

          {/* Additional Settings toggle */}
          {isDev && (
            <button
              type="button"
              onClick={() => setShowAdditional((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {showAdditional ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Additional Settings
            </button>
          )}

          {isDev && showAdditional && (
            <div className="space-y-4 border-l-2 border-border pl-4">
              {/* Add in ClickUp */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cf-clickup"
                  checked={isAddInClickup}
                  disabled={isProductLevel && type !== 'dropdown_text'}
                  onCheckedChange={(v) => handleClickupToggle(Boolean(v))}
                />
                <Label htmlFor="cf-clickup" className="cursor-pointer">Add in ClickUp</Label>
              </div>

              {/* Update via cron — not applicable for dropdown_text (ClickUp text fields have no options) */}
              {type !== 'dropdown_text' && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cf-cron"
                    checked={isUpdateInCron}
                    onCheckedChange={(v) => setIsUpdateInCron(Boolean(v))}
                  />
                  <Label htmlFor="cf-cron" className="cursor-pointer">Update via cron</Label>
                </div>
              )}

              {/* Show as link */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cf-show-as-link"
                  checked={isShowAsLink}
                  onCheckedChange={(v) => setIsShowAsLink(Boolean(v))}
                />
                <Label htmlFor="cf-show-as-link" className="cursor-pointer">Show as link</Label>
              </div>

              {/* Editable fields */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cf-editable"
                  checked={isEditableFields}
                  onCheckedChange={(v) => setIsEditableFields(Boolean(v))}
                />
                <Label htmlFor="cf-editable" className="cursor-pointer">Editable fields</Label>
              </div>

              {/* Multi Select — dropdown (not in ClickUp) or dropdown_text (always; joined string goes to ClickUp as text) */}
              {((type === 'dropdown' && !isAddInClickup) || type === 'dropdown_text') && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cf-multi-select"
                    checked={isMultiSelect}
                    onCheckedChange={(v) => setIsMultiSelect(Boolean(v))}
                  />
                  <Label htmlFor="cf-multi-select" className="cursor-pointer">Multi Select</Label>
                </div>
              )}

              {/* Product Level Options — for dropdown (not in ClickUp) or dropdown_text (always) */}
              {((type === 'dropdown' && !isAddInClickup) || type === 'dropdown_text') && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cf-product-level"
                    checked={isProductLevel}
                    onCheckedChange={(v) => handleProductLevelToggle(Boolean(v))}
                  />
                  <Label htmlFor="cf-product-level" className="cursor-pointer">Product Level Options</Label>
                </div>
              )}

              {/* clickup_id — only when is_add_in_clickup */}
              {isAddInClickup && (
                <div className="space-y-1.5">
                  <Label htmlFor="cf-clickup-id">ClickUp Field ID</Label>
                  <Input
                    id="cf-clickup-id"
                    value={clickupId}
                    onChange={(e) => setClickupId(e.target.value)}
                    placeholder="e.g. abc123xyz"
                  />
                </div>
              )}

              {/* ads_col_name */}
              <div className="space-y-1.5">
                <Label htmlFor="cf-ads-col">Ads Column Name</Label>
                <Input
                  id="cf-ads-col"
                  value={adsColName}
                  onChange={(e) => setAdsColName(e.target.value)}
                  placeholder="e.g. ad_format"
                />
              </div>

              {/* static_log_col_name */}
              <div className="space-y-1.5">
                <Label htmlFor="cf-static-col">Static Log Column Name</Label>
                <Input
                  id="cf-static-col"
                  value={staticLogColName}
                  onChange={(e) => setStaticLogColName(e.target.value)}
                  placeholder="e.g. log_format"
                />
              </div>

              {/* order */}
              <div className="space-y-1.5">
                <Label htmlFor="cf-order">Table Order</Label>
                <Input
                  id="cf-order"
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  placeholder="e.g. 1"
                />
              </div>

              {/* Contains */}
              <div className="space-y-4">
                <Label>Config Settings</Label>
                {CONTAINS_OPTIONS.map((group) => (
                  <div key={group.parent} className="space-y-1 pl-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`contains-${group.parent}`}
                        checked={contains.includes(group.parent)}
                        onCheckedChange={(v) => handleContainsToggle(group.parent, Boolean(v))}
                      />
                      <Label htmlFor={`contains-${group.parent}`} className="cursor-pointer capitalize">
                        {group.parent}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2 pl-5">
                      <Checkbox
                        id={`contains-${group.child}`}
                        checked={contains.includes(group.child)}
                        onCheckedChange={(v) => handleContainsToggle(group.child, Boolean(v))}
                      />
                      <Label htmlFor={`contains-${group.child}`} className="cursor-pointer capitalize text-muted-foreground">
                        {group.child}
                      </Label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isLoading}>
            {isLoading ? 'Saving…' : isEdit ? 'Update' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
