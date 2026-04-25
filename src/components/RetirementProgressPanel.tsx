'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AppState } from '@/lib/types'
import { computeTWR, requiredAnnualReturn, totalAssetsTwd } from '@/lib/calc'

const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
const fmtWan = (twd: number) => `${fmt(Math.round(twd / 10000))} 萬`
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`

// Future value: PV grown at rate r for n years, with annual PMT added
function fv(pv: number, rate: number, years: number, pmt: number): number {
  if (Math.abs(rate) < 1e-9) return pv + pmt * years
  const g = Math.pow(1 + rate, years)
  return pv * g + pmt * (g - 1) / rate
}

interface ChartPoint {
  year: number
  actual?: number    // 萬 TWD, historical snapshots
  projected?: number // 萬 TWD, future projection at current TWR
  required?: number  // 萬 TWD, path needed to hit target by target_year
}

export default function RetirementProgressPanel({ state, blurred }: { state: AppState; blurred: boolean }) {
  const B = ({ children }: { children: React.ReactNode }) =>
    blurred ? <span className="blur-sm select-none">{children}</span> : <>{children}</>

  const computed = useMemo(() => {
    const total = totalAssetsTwd(state)
    const { target_year, target_amount_twd, annual_contribution_wan } = state.retirement
    const annualContrib = annual_contribution_wan * 10000

    const today = new Date()
    const currentYear = today.getFullYear()
    const yearsLeft = target_year - currentYear

    const reqReturn = requiredAnnualReturn(total, target_amount_twd, yearsLeft, annualContrib)
    const twr = computeTWR(state.snapshots ?? [], state.transactions, state.exchange_rate)
    const actualReturn = twr?.annualized ?? null

    // Projection uses actual TWR if available, falls back to required return
    const projRate = actualReturn ?? reqReturn

    // Find projected completion year
    let projCompletionYear: number | null = null
    for (let y = 0; y <= 60; y++) {
      if (fv(total, projRate, y, annualContrib) >= target_amount_twd) {
        projCompletionYear = currentYear + y
        break
      }
    }

    const yearsAheadBehind = projCompletionYear != null ? target_year - projCompletionYear : null

    // Latest snapshot value per year (last snapshot date in each year wins)
    const snapsByYear: Record<number, number> = {}
    for (const snap of [...(state.snapshots ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
      snapsByYear[parseInt(snap.date.slice(0, 4))] = snap.total_twd
    }

    // Chart range: earliest snapshot year → max(target_year+1, projCompletion+1)
    const firstYear = Math.min(...Object.keys(snapsByYear).map(Number), currentYear)
    const lastYear = Math.max(
      target_year + 1,
      projCompletionYear != null ? projCompletionYear + 1 : target_year + 1,
    )
    const targetWan = Math.round(target_amount_twd / 10000)

    const chartData: ChartPoint[] = []
    for (let year = firstYear; year <= lastYear; year++) {
      const point: ChartPoint = { year }

      // Actual: historical snapshot or current value for current year
      if (snapsByYear[year] != null) {
        point.actual = Math.round(snapsByYear[year] / 10000)
      } else if (year === currentYear) {
        point.actual = Math.round(total / 10000)
      }

      // Projections start from current year
      if (year >= currentYear) {
        const n = year - currentYear
        point.projected = Math.round(fv(total, projRate, n, annualContrib) / 10000)
        point.required  = Math.round(fv(total, reqReturn, n, annualContrib) / 10000)
      }

      chartData.push(point)
    }

    // Milestone rows: current year → max(target_year+2, projCompletion+1)
    const milestoneEnd = Math.max(target_year + 2, projCompletionYear != null ? projCompletionYear + 1 : target_year + 2)
    const milestones = chartData.filter(
      p => p.year >= currentYear && p.year <= milestoneEnd && p.projected != null,
    )

    return {
      total, annualContrib, target_amount_twd, target_year, annual_contribution_wan,
      yearsLeft, reqReturn, actualReturn, projRate,
      projCompletionYear, yearsAheadBehind,
      chartData, milestones, targetWan,
      progress: (total / target_amount_twd) * 100,
    }
  }, [state])

  const {
    total, annualContrib: _annualContrib, target_amount_twd, target_year, annual_contribution_wan,
    yearsLeft, reqReturn, actualReturn,
    projCompletionYear, yearsAheadBehind,
    chartData, milestones, targetWan,
    progress,
  } = computed

  return (
    <div className="space-y-4">

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">目前進度</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{progress.toFixed(1)}%</p>
            <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              目標 <B>{fmtWan(target_amount_twd)}</B>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">預計達成年份</CardTitle>
          </CardHeader>
          <CardContent>
            {projCompletionYear != null ? (
              <>
                <p className="text-2xl font-bold">{projCompletionYear} 年</p>
                {yearsAheadBehind != null && (
                  <Badge
                    variant={yearsAheadBehind >= 0 ? 'default' : 'destructive'}
                    className="mt-1.5 text-xs"
                  >
                    {yearsAheadBehind > 0
                      ? `提前 ${yearsAheadBehind} 年`
                      : yearsAheadBehind === 0
                        ? '剛好達成'
                        : `落後 ${Math.abs(yearsAheadBehind)} 年`}
                  </Badge>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">無法達成</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">目標年份 {target_year}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">實際 vs 需要年化</CardTitle>
          </CardHeader>
          <CardContent>
            {actualReturn != null ? (
              <>
                <p className={`text-2xl font-bold ${actualReturn >= reqReturn ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fmtPct(actualReturn)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  需要 <span className="font-medium">{fmtPct(reqReturn)}</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">—</p>
                <p className="text-xs text-muted-foreground mt-1">需要 {fmtPct(reqReturn)}（資料累積中）</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">距目標缺口</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              <B>{fmtWan(target_amount_twd - total)}</B>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              剩 {yearsLeft} 年 · 年存 <B>{annual_contribution_wan} 萬</B>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Trajectory chart ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">退休目標軌跡</CardTitle>
          <p className="text-xs text-muted-foreground">
            藍線：歷史實際資產｜綠虛線：按目前年化報酬預測｜灰虛線：達標所需路徑｜紅線：目標金額
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={v => `${fmt(Number(v))}萬`}
                tick={{ fontSize: 11 }}
                width={64}
              />
              <Tooltip
                formatter={(v: unknown, name: unknown) => {
                  const labels: Record<string, string> = {
                    actual: '實際資產', projected: '預測軌跡', required: '所需軌跡',
                  }
                  const key = String(name)
                  const val = blurred ? '***' : `${fmt(Number(v))} 萬`
                  return [val, labels[key] ?? key]
                }}
                labelFormatter={v => `${v} 年`}
              />
              <Legend
                formatter={v =>
                  ({ actual: '歷史實際', projected: '預測軌跡', required: '所需軌跡' } as Record<string, string>)[v] ?? v
                }
              />
              {/* Target amount line */}
              <ReferenceLine
                y={targetWan}
                stroke="#ef4444"
                strokeDasharray="6 3"
                label={{ value: `目標 ${fmt(targetWan)}萬`, fontSize: 10, fill: '#ef4444', position: 'insideTopLeft' }}
              />
              {/* Target year line */}
              <ReferenceLine
                x={target_year}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{ value: String(target_year), fontSize: 10, fill: '#94a3b8', position: 'insideTopRight' }}
              />
              {/* Actual history */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              {/* Projected trajectory */}
              <Line
                type="monotone"
                dataKey="projected"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={false}
                connectNulls={false}
              />
              {/* Required path */}
              <Line
                type="monotone"
                dataKey="required"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Milestone table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">關鍵年度里程碑</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1.5 pr-4">年份</th>
                  <th className="text-right pr-4">預測資產</th>
                  <th className="text-right pr-4">所需資產</th>
                  <th className="text-right">領先 / 落後</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map(p => {
                  const gap = (p.projected ?? 0) - (p.required ?? 0)
                  const isTargetYear = p.year === target_year
                  const isProjYear = p.year === projCompletionYear
                  return (
                    <tr
                      key={p.year}
                      className={`border-b hover:bg-muted/30 ${isTargetYear ? 'bg-blue-50 dark:bg-blue-950/20 font-medium' : ''}`}
                    >
                      <td className="py-1.5 pr-4">
                        {p.year}
                        {isTargetYear && (
                          <Badge variant="outline" className="ml-2 text-xs">目標年</Badge>
                        )}
                        {isProjYear && !isTargetYear && (
                          <Badge className="ml-2 text-xs bg-emerald-600">達標</Badge>
                        )}
                      </td>
                      <td className="text-right pr-4">
                        <B>{fmt(p.projected ?? 0)} 萬</B>
                      </td>
                      <td className="text-right pr-4 text-muted-foreground">
                        <B>{fmt(p.required ?? 0)} 萬</B>
                      </td>
                      <td className={`text-right font-medium ${gap >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        <B>{gap >= 0 ? '+' : ''}{fmt(gap)} 萬</B>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        預測軌跡以目前年化 TWR（{actualReturn != null ? fmtPct(actualReturn) : '資料累積中，暫用所需報酬率'}）
        + 年存 {annual_contribution_wan} 萬計算。持倉未滿 30 天時以所需報酬率代替實際 TWR。
        本預測為估算值，非投資建議。
      </p>
    </div>
  )
}
