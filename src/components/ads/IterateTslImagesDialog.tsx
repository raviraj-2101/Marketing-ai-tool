import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, ChevronDown, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { TslScript } from '@/hooks/useAdsDb';

interface IterateTslImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adIdOptions: string[];
  tslScripts: TslScript[];
  onSuccess?: () => void;
}

const PAGE_SIZE = 15;

export function IterateTslImagesDialog({
  open,
  onOpenChange,
  adIdOptions,
  tslScripts,
  onSuccess,
}: IterateTslImagesDialogProps) {
  const { toast } = useToast();

  const [selectedAdId, setSelectedAdId] = useState('');
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [adIdSearch, setAdIdSearch] = useState('');
  const [adIdVisible, setAdIdVisible] = useState(PAGE_SIZE);
  const [adIdOpen, setAdIdOpen] = useState(false);
  const [scriptSearch, setScriptSearch] = useState('');
  const [scriptVisible, setScriptVisible] = useState(PAGE_SIZE);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state on dialog close
  useEffect(() => {
    if (!open) {
      setSelectedAdId('');
      setAdIdSearch('');
      setAdIdVisible(PAGE_SIZE);
      setSelectedScriptId('');
      setScriptSearch('');
      setScriptVisible(PAGE_SIZE);
    }
  }, [open]);

  // Filtered Ad IDs
  const filteredAdIds = adIdOptions.filter(id => id.includes(adIdSearch.trim()));
  const visibleAdIds = filteredAdIds.slice(0, adIdVisible);
  const hasMoreAdIds = adIdVisible < filteredAdIds.length;

  // Filtered Scripts
  const filteredScripts = tslScripts.filter(s =>
    s.tsl_script_id.toLowerCase().includes(scriptSearch.trim().toLowerCase())
  );
  const visibleScripts = filteredScripts.slice(0, scriptVisible);
  const hasMoreScripts = scriptVisible < filteredScripts.length;

  // Scroll handlers
  const handleAdIdScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40) {
      setAdIdVisible(v => v + PAGE_SIZE);
    }
  };

  const handleAdIdWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.scrollTop += e.deltaY;
    handleAdIdScroll(e as unknown as React.UIEvent<HTMLDivElement>);
  };

  const handleScriptScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 40) {
      setScriptVisible(v => v + PAGE_SIZE);
    }
  };

  const handleScriptWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.scrollTop += e.deltaY;
    handleScriptScroll(e as unknown as React.UIEvent<HTMLDivElement>);
  };

  // Submit
  const handleSubmit = async () => {
    const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
    if (!baseUrl) {
      toast({ title: 'Error', description: 'API configuration missing', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/api/iterate-tsl-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ad_id: selectedAdId,
          tsl_script_id: selectedScriptId,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      toast({
        title: 'Iteration Completed',
        description: 'TSL images iterated successfully.',
      });

      if (onSuccess) {
        onSuccess();
      }

      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
              <Repeat2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Iterate on TSL Images</DialogTitle>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {/* Use Images From */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Use Images From
            </label>
            <Popover open={adIdOpen} onOpenChange={setAdIdOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal h-10"
                >
                  <span className={selectedAdId ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedAdId || 'Select Ad ID...'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search Ad ID..."
                    value={adIdSearch}
                    onValueChange={(v) => {
                      setAdIdSearch(v);
                      setAdIdVisible(PAGE_SIZE);
                    }}
                  />
                  <CommandList onScroll={handleAdIdScroll} onWheel={handleAdIdWheel} className="max-h-52 overflow-y-auto flex flex-col">
                    <CommandEmpty>No Ad IDs found.</CommandEmpty>
                    <CommandGroup>
                      {visibleAdIds.map(id => (
                        <CommandItem
                          key={id}
                          value={id}
                          onSelect={() => {
                            setSelectedAdId(id);
                            setAdIdOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedAdId === id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {id}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {hasMoreAdIds && (
                      <div className="py-2 text-center text-xs text-muted-foreground border-t">
                        Scroll for more ({filteredAdIds.length - adIdVisible} remaining)
                      </div>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* TSL Script ID */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              TSL Script ID
            </label>
            <Popover open={scriptOpen} onOpenChange={setScriptOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal h-10"
                >
                  <span className={selectedScriptId ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedScriptId || 'Select TSL Script...'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search script ID..."
                    value={scriptSearch}
                    onValueChange={(v) => {
                      setScriptSearch(v);
                      setScriptVisible(PAGE_SIZE);
                    }}
                  />
                  <CommandList onScroll={handleScriptScroll} onWheel={handleScriptWheel} className="max-h-52 overflow-y-auto flex flex-col">
                    <CommandEmpty>No scripts found.</CommandEmpty>
                    <CommandGroup>
                      {visibleScripts.map(s => (
                        <CommandItem
                          key={s.id}
                          value={s.tsl_script_id}
                          onSelect={() => {
                            setSelectedScriptId(s.tsl_script_id);
                            setScriptOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedScriptId === s.tsl_script_id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{s.tsl_script_id}</div>
                            {/* <div className="text-xs text-muted-foreground">
                              {s.core_id || s.variation || '—'}
                            </div> */}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {hasMoreScripts && (
                      <div className="py-2 text-center text-xs text-muted-foreground border-t">
                        Scroll for more ({filteredScripts.length - scriptVisible} remaining)
                      </div>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
            disabled={isSubmitting || !selectedAdId || !selectedScriptId}
            className="h-10"
          >
            {isSubmitting ? 'Submitting...' : 'Iterate Images'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
