'use client'

import React, { type FC, useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Calendar } from '@/components/ui/calendar'
import { DateInput } from '@/components/ui/date-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronUp, ChevronDown, Check, CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DateRange {
  from: Date
  to: Date | undefined
}

export interface DateRangePickerProps {
  onUpdate?: (values: { range: DateRange }) => void
  initialDateFrom?: Date | string
  initialDateTo?: Date | string
  align?: 'start' | 'center' | 'end'
  locale?: string
  className?: string
  minDate?: Date
}

/** Legacy floor. Kept as the default so untouched callers behave exactly as before. */
const DEFAULT_MIN_DATE = new Date(2015, 0, 1)

interface Preset {
  name: string
  label: string
}

const PRESETS: Preset[] = [
  { name: 'today',     label: 'Today' },
  { name: 'yesterday', label: 'Yesterday' },
  { name: 'past3',     label: 'Past 3 days' },
  { name: 'last7',     label: 'Past 7 days' },
  { name: 'last14',    label: 'Past 14 days' },
  { name: 'last30',    label: 'Past 30 days' },
  { name: 'allTime',   label: 'All time' },
]

function getDateAdjustedForTimezone(dateInput: Date | string): Date {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-').map((p) => parseInt(p, 10))
    return new Date(parts[0], parts[1] - 1, parts[2])
  }
  return dateInput
}

function formatDisplay(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getPresetRange(presetName: string, minDate: Date = DEFAULT_MIN_DATE): DateRange {
  const from = new Date()
  const to   = new Date()

  switch (presetName) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      break
    case 'yesterday':
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)
      to.setDate(to.getDate() - 1)
      to.setHours(23, 59, 59, 999)
      break
    case 'past3':
      from.setDate(from.getDate() - 2)
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      break
    case 'last7':
      from.setDate(from.getDate() - 6)
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      break
    case 'last14':
      from.setDate(from.getDate() - 13)
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      break
    case 'last30':
      from.setDate(from.getDate() - 29)
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      break
    case 'allTime': {
      const allFrom = new Date(minDate)
      allFrom.setHours(0, 0, 0, 0)
      return {
        from: allFrom,
        to: new Date(new Date().setHours(23, 59, 59, 999))
      }
    }
    default:
      throw new Error(`Unknown preset: ${presetName}`)
  }

  return { from, to }
}

// Internal range type — undefined means nothing selected yet
type InternalRange = { from: Date; to?: Date } | undefined

export const DateRangePicker: FC<DateRangePickerProps> = ({
  initialDateFrom,
  initialDateTo,
  onUpdate,
  align = 'end',
  locale = 'en-US',
  className,
  minDate = DEFAULT_MIN_DATE,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  // Internal selection state — always reset to undefined when the picker opens.
  // The user must pick both start and end dates fresh every time.
  const [range, setRange]               = useState<InternalRange>(undefined)
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(undefined)

  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 960 : false
  )

  const initCalendarMonth = (): Date => {
    const now   = new Date()
    const small = typeof window !== 'undefined' ? window.innerWidth < 960 : false
    const wanted = new Date(now.getFullYear(), now.getMonth() - (small ? 0 : 1), 1)

    const floorMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    return wanted < floorMonth ? floorMonth : wanted
  }
  const [calendarMonth, setCalendarMonth] = useState<Date>(initCalendarMonth)

  const minTime = minDate.getTime()

  const calendarYears = useMemo(() => {
    const start = new Date(minTime).getFullYear()
    const end   = new Date().getFullYear() + 1
    return Array.from({ length: Math.max(end - start + 1, 1) }, (_, i) => start + i)
  }, [minTime])

  const calendarMonthNames = useMemo(() => {
    const floor     = new Date(minTime)
    const firstMonth = calendarMonth.getFullYear() === floor.getFullYear() ? floor.getMonth() : 0
    return Array.from({ length: 12 }, (_, i) => i)
      .filter((i) => i >= firstMonth)
      .map((i) => ({
        value: String(i),
        label: new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'long' }),
      }))
  }, [minTime, calendarMonth])

  // Every time the picker opens: wipe internal range so the calendar is blank
  // and the user is forced to pick both dates from scratch.
  useEffect(() => {
    if (isOpen) {
      setRange(undefined)
      setSelectedPreset(undefined)
    }
  }, [isOpen])

  useEffect(() => {
    const handleResize = () => setIsSmallScreen(window.innerWidth < 960)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Detect which preset matches the current internal range (for highlight)
  useEffect(() => {
    if (!range?.from || !range?.to) { setSelectedPreset(undefined); return }
    for (const preset of PRESETS) {
      const pr       = getPresetRange(preset.name, minDate)
      const nFrom    = new Date(range.from); nFrom.setHours(0, 0, 0, 0)
      const nPFrom   = new Date(pr.from);    nPFrom.setHours(0, 0, 0, 0)
      const nTo      = new Date(range.to);   nTo.setHours(0, 0, 0, 0)
      const nPTo     = new Date(pr.to ?? 0); nPTo.setHours(0, 0, 0, 0)
      if (nFrom.getTime() === nPFrom.getTime() && nTo.getTime() === nPTo.getTime()) {
        setSelectedPreset(preset.name)
        return
      }
    }
    setSelectedPreset(undefined)
  }, [range, minTime])

  // Close and fire the committed range
  const commit = useCallback((newRange: DateRange) => {
    setIsOpen(false)
    onUpdate?.({ range: newRange })
  }, [onUpdate])

  const applyPreset = (presetName: string) => {
    const newRange = getPresetRange(presetName, minDate)
    setRange(newRange)
    setSelectedPreset(presetName)
    if (presetName === 'allTime') {
      const now = new Date()
      setCalendarMonth(new Date(now.getFullYear(), now.getMonth() - (isSmallScreen ? 0 : 1), 1))
    } else {
      setCalendarMonth(new Date(newRange.from.getFullYear(), newRange.from.getMonth(), 1))
    }
    commit(newRange)
  }

  // Trigger label always shows the COMMITTED values from parent props, not internal state.
  // This means the button always reflects what was last confirmed, even while picking.
  const triggerLabel = useMemo(() => {
    const fromDate = initialDateFrom ? getDateAdjustedForTimezone(initialDateFrom) : null
    const toDate   = initialDateTo   ? getDateAdjustedForTimezone(initialDateTo)   : null
    if (!fromDate) return 'Select date range'
    return `${formatDisplay(fromDate, locale)}${toDate ? ` – ${formatDisplay(toDate, locale)}` : ''}`
  }, [initialDateFrom, initialDateTo, locale])

  const triggerButton = (
    <Button
      variant="outline"
      className={cn(
        'h-9 w-full justify-between rounded-lg border-border bg-muted text-sm font-normal',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-foreground truncate">{triggerLabel}</span>
      </div>
      {isOpen
        ? <ChevronUp   className="h-4 w-4 text-muted-foreground shrink-0" />
        : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      }
    </Button>
  )

  const pickerBody = (
    <div className="flex flex-col">

          {/* ── Top row: date inputs + month/year/quick selectors.
               Mobile = clean 2-col grid; desktop = inline flex row. ── */}
          <div className={cn(
            'border-b border-border px-4 py-3',
            isSmallScreen ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap items-center gap-2'
          )}>
            {/* From input */}
            <DateInput
              className={cn(isSmallScreen && 'w-full justify-center')}
              value={range?.from}
              minYear={minDate.getFullYear()}
              onChange={(date) => {
                const to = range?.to && date <= range.to ? range.to : undefined
                setRange({ from: date, to })
                setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
              }}
            />
            {!isSmallScreen && <span className="text-muted-foreground text-xs shrink-0">–</span>}
            {/* To input — auto-commits when both dates are present */}
            <DateInput
              className={cn(isSmallScreen && 'w-full justify-center')}
              value={range?.to}
              minYear={minDate.getFullYear()}
              onChange={(date) => {
                const from     = range?.from ?? date
                const newRange: DateRange = { from, to: date }
                setRange(newRange)
                setCalendarMonth(new Date(from.getFullYear(), from.getMonth(), 1))
                commit(newRange)
              }}
            />

            {/* Month */}
            <Select
              value={String(calendarMonth.getMonth())}
              onValueChange={(v) =>
                setCalendarMonth(new Date(calendarMonth.getFullYear(), Number(v), 1))
              }
            >
              <SelectTrigger className={cn('h-8 rounded-md border-border bg-muted text-xs', isSmallScreen ? 'w-full' : 'w-[120px] ml-auto')}>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {calendarMonthNames.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Year */}
            <Select
              value={String(calendarMonth.getFullYear())}
              onValueChange={(v) =>
                setCalendarMonth(new Date(Number(v), calendarMonth.getMonth(), 1))
              }
            >
              <SelectTrigger className={cn('h-8 rounded-md border-border bg-muted text-xs', isSmallScreen ? 'w-full' : 'w-[85px]')}>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {calendarYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Mobile: quick-select preset dropdown (full width) */}
            {isSmallScreen && (
              <div className="col-span-2">
                <Select value={selectedPreset} onValueChange={applyPreset}>
                  <SelectTrigger className="h-8 w-full text-xs border-border bg-muted">
                    <SelectValue placeholder="Quick select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p.name} value={p.name}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ── Calendar + desktop preset list ── */}
          <div className={cn('flex', isSmallScreen && 'justify-center')}>
            <Calendar
              mode="range"
              selected={range}
              // showOutsideDays=false prevents clicks on greyed-out adjacent-month
              // days from triggering onMonthChange and jumping the calendar view.
              showOutsideDays={false}
              onSelect={(value) => {
                if (!value?.from) return
                const newRange = { from: value.from, to: value.to }
                setRange(newRange)
                // First click → from only (to undefined) — keep picker open.
                // Second click → both set — commit and close.
                if (value.from && value.to) {
                  commit({ from: value.from, to: value.to })
                }
              }}
              numberOfMonths={isSmallScreen ? 1 : 2}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              fromDate={minDate}
              toYear={new Date().getFullYear() + 1}
              className="p-3"
            />

            {/* Desktop preset list */}
            {!isSmallScreen && (
              <div className="flex flex-col gap-0.5 border-l border-border px-2 py-3 min-w-[140px]">
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'w-full justify-start gap-2 text-sm font-normal',
                      selectedPreset === p.name && 'bg-muted font-medium pointer-events-none'
                    )}
                    onClick={() => applyPreset(p.name)}
                  >
                    <Check className={cn('h-3.5 w-3.5 shrink-0', selectedPreset === p.name ? 'opacity-100 text-primary' : 'opacity-0')} />
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Cancel / Update buttons — not needed while auto-close is active.
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!range?.from || !range?.to}
              onClick={() => { if (range?.from && range?.to) commit({ from: range.from, to: range.to }) }}
            >
              Update
            </Button>
          </div>
          */}

        </div>
  )

  // Mobile: a bottom sheet so the picker is never clipped or pushed off-screen.
  if (isSmallScreen) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-auto max-h-[90vh] overflow-y-auto rounded-t-2xl p-0"
          // Don't auto-focus the From/To date fields on open — that pops the mobile keyboard.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-4 pt-4 pb-1 text-left">
            <SheetTitle className="text-base">Select date range</SheetTitle>
          </SheetHeader>
          {pickerBody}
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: unchanged dropdown popover.
  return (
    <Popover modal open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0" sideOffset={8}>
        {pickerBody}
      </PopoverContent>
    </Popover>
  )
}

DateRangePicker.displayName = 'DateRangePicker'
