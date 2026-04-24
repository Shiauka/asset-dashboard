'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RetirementSettings } from '@/lib/types'
import { requiredAnnualReturn } from '@/lib/calc'

interface Props {
  open: boolean
  onClose: () => void
  current: RetirementSettings
  currentTotal: number
  onSave: (s: RetirementSettings) => void
}

function Row({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <Label className="text-right leading-tight">
        {label}
        {sublabel && <span className="block text-xs font-normal text-muted-foreground">{sublabel}</span>}
      </Label>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

export default function RetirementDialog({ open, onClose, current, currentTotal, onSave }: Props) {
  const [year, setYear] = useState(String(current.target_year))
  const [amountWan, setAmountWan] = useState(String(current.target_amount_twd / 10000))
  const [contribWan, setContribWan] = useState(String(current.annual_contribution_wan))

  useEffect(() => {
    if (open) {
      setYear(String(current.target_year))
      setAmountWan(String(current.target_amount_twd / 10000))
      setContribWan(String(current.annual_contribution_wan))
    }
  }, [open, current])

  const y = parseInt(year)
  const a = parseFloat(amountWan)
  const c = parseFloat(contribWan) || 0
  const n = y - new Date().getFullYear()
  const fv = a * 10000
  const pmt = c * 10000

  const canSave = !isNaN(y) && y >= 2024 && !isNaN(a) && a > 0

  const reqReturn = canSave && n > 0 && currentTotal > 0
    ? requiredAnnualReturn(currentTotal, fv, n, pmt)
    : null

  const handleSave = () => {
    if (!canSave) return
    onSave({ target_year: y, target_amount_twd: fv, annual_contribution_wan: c })
    onClose()
  }

  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(Math.round(n))

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>目標設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Row label="目標年份">
            <Input type="number" min={2024} max={2100} step={1} placeholder="如 2045"
              value={year} onChange={e => setYear(e.target.value)} />
          </Row>
          <Row label="目標金額" sublabel="萬 TWD">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} step={10} placeholder="如 3000"
                value={amountWan} onChange={e => setAmountWan(e.target.value)} />
              <span className="text-sm text-muted-foreground whitespace-nowrap">萬</span>
            </div>
          </Row>
          <Row label="年度投入" sublabel="萬 TWD，選填">
            <div className="flex items-center gap-2">
              <Input type="number" min={0} step={1} placeholder="如 120"
                value={contribWan} onChange={e => setContribWan(e.target.value)} />
              <span className="text-sm text-muted-foreground whitespace-nowrap">萬</span>
            </div>
          </Row>

          {canSave && reqReturn !== null && (
            <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">距目標年</span>
                <span className="font-medium">{n} 年</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">目標金額</span>
                <span className="font-medium">{fmt(fv)} TWD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">年度投入</span>
                <span className="font-medium">{fmt(pmt)} TWD</span>
              </div>
              <div className="border-t pt-1.5 mt-1.5 flex justify-between items-center">
                <span className="text-muted-foreground">需年化報酬</span>
                <span className={`text-lg font-bold ${reqReturn > 0.15 ? 'text-red-500' : reqReturn > 0.08 ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {(reqReturn * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={!canSave}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
