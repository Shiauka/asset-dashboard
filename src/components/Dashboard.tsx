'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, RefreshCw, Settings, Eye, EyeOff, Download, Upload, RotateCcw, Trash2, FolderOpen, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { loadState, saveState, resetState, applyTransaction, updateRetirement, reverseTransaction, retroactivelyAdjustSnapshots, editTransaction, updateHoldingPrice, updateExchangeRate, addSnapshot } from '@/lib/store'
import { getTaiwanToday } from '@/lib/dateUtils'
import { totalAssetsTwd, categorySummaries, rebalanceRows, categoryDrillDown, requiredAnnualReturn, totalTargetPct } from '@/lib/calc'
import { INITIAL_STATE } from '@/lib/initialData'
import type { AppState, Transaction, TxType, Category, RetirementSettings } from '@/lib/types'
import TransactionDialog from './TransactionDialog'
import RetirementDialog from './RetirementDialog'
import PriceUpdateDialog from './PriceUpdateDialog'
import HoldingsTable from './HoldingsTable'
import HistoryChart from './HistoryChart'
import DbConfigDialog from './DbConfigDialog'
import EditTransactionDialog from './EditTransactionDialog'

const fmt = (n: number, digits = 0) =>
  new Intl.NumberFormat('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
const fmtWan = (twd: number) => `${fmt(twd / 10000, 1)} 萬`

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null)
  const [txOpen, setTxOpen] = useState(false)
  const [retirementOpen, setRetirementOpen] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)
  const [drillCat, setDrillCat] = useState<Category | null>(null)
  const [blurred, setBlurred] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [txMonthFilter, setTxMonthFilter] = useState('')
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [dbOpen, setDbOpen] = useState(false)
  const [dbRootDir, setDbRootDir] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const commit = useCallback((next: AppState) => {
    setState(next)
    saveState(next)
  }, [])

  useEffect(() => {
    async function init() {
      let rootDir: string | null = null
      try {
        const r = await fetch('/api/db/config')
        const d = await r.json() as { rootDir?: string }
        rootDir = d.rootDir ?? null
      } catch {}
      setDbRootDir(rootDir)

      if (rootDir) {
        try {
          const res = await fetch('/api/db/load')
          const body = await res.json() as { ok?: boolean; state?: AppState; date?: string }
          if (body.ok && body.state) {
            const merged: AppState = {
              ...INITIAL_STATE,
              ...body.state,
              snapshots: body.state.snapshots ?? [],
              cash_accounts: (body.state.cash_accounts ?? []).map(c => ({ ...c, target_pct: c.target_pct ?? 0 })),
            }

            // Auto-fetch latest prices and exchange rate on load
            let final = merged
            try {
              const pricesRes = await fetch('/api/prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  holdings: merged.holdings.map(h => ({ symbol: h.symbol, currency: h.currency })),
                }),
              })
              if (pricesRes.ok) {
                const pricesData = await pricesRes.json() as { prices: Record<string, number | null>; exchange_rate: number | null }
                if (pricesData.exchange_rate !== null && pricesData.exchange_rate > 0)
                  final = updateExchangeRate(final, pricesData.exchange_rate)
                for (const [sym, price] of Object.entries(pricesData.prices))
                  if (price !== null && price > 0) final = updateHoldingPrice(final, sym, price)
                final = addSnapshot(final, totalAssetsTwd(final))
              }
            } catch {}

            commit(final)
            if (rootDir) {
              fetch('/api/db/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(final),
              }).catch(() => {})
            }
            return
          }
        } catch {}
      }

      setState(loadState())
    }
    init()
  }, [commit])

  const saveToDb = useCallback((next: AppState): Promise<void> => {
    if (!dbRootDir) return Promise.resolve()
    return fetch('/api/db/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).then(() => {}).catch(() => {})
  }, [dbRootDir])

  // After retroactive DB patches, reload all snapshots from DB for accurate historical data
  const reloadDbSnapshots = useCallback(async (base: AppState): Promise<AppState> => {
    if (!dbRootDir) return base
    try {
      const res = await fetch('/api/db/load')
      const body = await res.json() as { ok?: boolean; state?: AppState }
      if (body.ok && body.state?.snapshots) {
        return { ...base, snapshots: body.state.snapshots }
      }
    } catch {}
    return base
  }, [dbRootDir])

  const retroactiveDbUpdate = useCallback((tx: Transaction, direction: 1 | -1 = 1): Promise<void> => {
    if (!dbRootDir || tx.date >= getTaiwanToday()) return Promise.resolve()
    return fetch('/api/db/retroactive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx, direction }),
    }).then(() => {}).catch(() => {})
  }, [dbRootDir])

  const handleTransaction = useCallback(async (tx: Transaction) => {
    if (!state) return
    let next = applyTransaction(state, tx)
    next = retroactivelyAdjustSnapshots(next, tx)
    next = addSnapshot(next, totalAssetsTwd(next))
    commit(next)
    await saveToDb(next)
    await retroactiveDbUpdate(tx, 1)
    if (tx.date < getTaiwanToday()) {
      const reloaded = await reloadDbSnapshots(next)
      commit(reloaded)
    }
  }, [state, commit, saveToDb, retroactiveDbUpdate, reloadDbSnapshots])

  const handleReset = () => {
    if (!confirm('確定要重設所有資料回初始狀態？')) return
    setState(resetState())
  }

  const handleDeleteTransaction = useCallback(async (id: string) => {
    if (!state) return
    const tx = state.transactions.find(t => t.id === id)
    if (!tx) return
    const typeLabel: Record<string, string> = {
      buy: '買入', sell: '賣出', cash_in: '現金入', cash_out: '現金出',
      new_position: '建立股票', new_cash_account: '建立現金',
    }
    if (!confirm(`確定刪除這筆「${typeLabel[tx.type]}」紀錄並還原其對持倉的影響？`)) return
    let next = reverseTransaction(state, id)
    next = retroactivelyAdjustSnapshots(next, tx, -1)
    next = addSnapshot(next, totalAssetsTwd(next))
    commit(next)
    await saveToDb(next)
    await retroactiveDbUpdate(tx, -1)
    if (tx.date < getTaiwanToday()) {
      const reloaded = await reloadDbSnapshots(next)
      commit(reloaded)
    }
  }, [state, commit, saveToDb, retroactiveDbUpdate, reloadDbSnapshots])

  const handleEditSubmit = useCallback(async (id: string, updates: Partial<Transaction>) => {
    if (!state) return
    const result = editTransaction(state, id, updates)
    if (!result) return
    const { next, oldTx, newTx } = result
    let final = retroactivelyAdjustSnapshots(next, oldTx, -1)
    final = retroactivelyAdjustSnapshots(final, newTx, 1)
    final = addSnapshot(final, totalAssetsTwd(final))
    commit(final)
    await saveToDb(final)
    await retroactiveDbUpdate(oldTx, -1)
    await retroactiveDbUpdate(newTx, 1)
    if (oldTx.date < getTaiwanToday() || newTx.date < getTaiwanToday()) {
      const reloaded = await reloadDbSnapshots(final)
      commit(reloaded)
    }
  }, [state, commit, saveToDb, retroactiveDbUpdate, reloadDbSnapshots])

  const handleTabChange = useCallback((newTab: string) => {
    if (activeTab === 'holdings' && newTab !== 'holdings' && state) {
      const pct = totalTargetPct(state)
      const diff = Math.abs(pct - 100)
      if (diff > 0.1) {
        const msg = pct > 100
          ? `目標%加總為 ${pct.toFixed(1)}%，已超過 100%，建議調整後再離開。`
          : `目標%加總為 ${pct.toFixed(1)}%，尚未達到 100%（差 ${(100 - pct).toFixed(1)}%），建議調整後再離開。`
        alert(`⚠️ ${msg}`)
      }
    }
    setActiveTab(newTab)
  }, [activeTab, state])

  const handleRetirementSave = (settings: RetirementSettings) => {
    if (!state) return
    commit(updateRetirement(state, settings))
  }

  // 儲存今日資料至根目錄
  const handleExport = async () => {
    if (!state) return
    if (!dbRootDir) { alert('請先在「根目錄設定」中指定資料庫路徑'); return }
    const res = await fetch('/api/db/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => null)
    const body = await res?.json().catch(() => ({})) as { ok?: boolean; date?: string; error?: string }
    if (body.ok) alert(`已儲存今日資料至 ${body.date}.json`)
    else alert(body.error ?? '儲存失敗')
  }

  // 從根目錄載入最新資料
  const handleImport = async () => {
    if (!dbRootDir) { alert('請先在「根目錄設定」中指定資料庫路徑'); return }
    if (!confirm('確定要從根目錄載入最新資料？目前未儲存的異動將遺失。')) return
    const res = await fetch('/api/db/load').catch(() => null)
    const body = await res?.json().catch(() => ({})) as { ok?: boolean; state?: AppState; date?: string; error?: string }
    if (!body.ok || !body.state) { alert(body.error ?? '載入失敗'); return }
    const merged: AppState = {
      ...INITIAL_STATE,
      ...body.state,
      snapshots: body.state.snapshots ?? [],
      cash_accounts: (body.state.cash_accounts ?? []).map(c => ({ ...c, target_pct: c.target_pct ?? 0 })),
    }
    commit(merged)
    alert(`已載入 ${body.date} 的資料`)
  }

  // 更新報價後若有根目錄則自動儲存當日檔案
  const handlePriceUpdate = useCallback((next: AppState) => {
    commit(next)
    void saveToDb(next)
  }, [commit, saveToDb])

  if (!state) return <div className="flex items-center justify-center h-screen text-muted-foreground">載入中…</div>

  const total = totalAssetsTwd(state)
  const totalUsd = total / state.exchange_rate
  const cats = categorySummaries(state)
  const rebalance = rebalanceRows(state)
  const { target_year, target_amount_twd, annual_contribution_wan } = state.retirement
  const progress = total / target_amount_twd
  const remaining = target_amount_twd - total
  const yearsLeft = target_year - new Date().getFullYear()
  const reqReturn = requiredAnnualReturn(total, target_amount_twd, yearsLeft, annual_contribution_wan * 10000)

  const barData = cats.map(c => ({
    name: c.name,
    實際: parseFloat(c.actual_pct.toFixed(2)),
    目標: c.target_pct,
  }))

  const drillItems = drillCat ? categoryDrillDown(state, drillCat) : []
  const drillCatMeta = drillCat ? cats.find(c => c.key === drillCat) : null

  const A = ({ children }: { children: React.ReactNode }) =>
    blurred ? <span className="blur-sm select-none">{children}</span> : <>{children}</>

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">資產管理儀表板</h1>
          <p className="text-sm text-muted-foreground">
            1 USD = <A>{fmt(state.exchange_rate, 2)}</A> TWD · 本機儲存 · 隱私優先
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" onClick={() => setTxOpen(true)}>
            <Plus size={14} className="mr-1" />新增交易
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPriceOpen(true)}>
            <RefreshCw size={14} className="mr-1" />更新報價
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRetirementOpen(true)}>
            <Settings size={14} className="mr-1" />目標設定
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDbOpen(true)}
            title={dbRootDir ? `根目錄：${dbRootDir}` : '根目錄設定（未設定）'}
            className={dbRootDir ? 'text-emerald-600 border-emerald-400' : ''}>
            <FolderOpen size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBlurred(b => !b)} title={blurred ? '顯示金額' : '隱藏金額'}>
            {blurred ? <Eye size={14} /> : <EyeOff size={14} />}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} title="存至根目錄（今日）">
            <Download size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={handleImport} title="從根目錄載入最新">
            <Upload size={14} />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset} title="重設">
            <RotateCcw size={14} />
          </Button>
          {/* 保留 importRef 供未來擴充使用 */}
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={() => {}} />
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">總資產 (TWD)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold"><A>{fmtWan(total)}</A></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">總資產 (USD)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold"><A>${fmt(totalUsd)}</A></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">目標進度 ({target_year})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(progress * 100).toFixed(1)}%</p>
            <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
            </div>
            <p className={`text-xs mt-1 font-medium ${reqReturn > 0.15 ? 'text-red-500' : reqReturn > 0.08 ? 'text-amber-500' : 'text-emerald-600'}`}>
              需年化報酬 {(reqReturn * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">距目標 / 剩 {yearsLeft} 年</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold"><A>{fmtWan(remaining)}</A></p>
            <p className="text-xs text-muted-foreground">目標 <A>{fmtWan(target_amount_twd)}</A></p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">資產分布</TabsTrigger>
          <TabsTrigger value="trend">資產走勢</TabsTrigger>
          <TabsTrigger value="rebalance">再平衡分析</TabsTrigger>
          <TabsTrigger value="holdings">持倉明細</TabsTrigger>
          <TabsTrigger value="history">交易紀錄</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: 資產分布 ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">
                  {drillCat ? (
                    <span style={{ color: drillCatMeta?.color }}>{drillCatMeta?.name} — 個股明細</span>
                  ) : '當前資產分布（點入查看個股）'}
                </CardTitle>
                {drillCat && (
                  <Button size="sm" variant="ghost" onClick={() => setDrillCat(null)}>← 返回</Button>
                )}
              </CardHeader>
              <CardContent>
                {!drillCat ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={cats} dataKey="value_twd" nameKey="name" cx="50%" cy="50%"
                        outerRadius={105} cursor="pointer"
                        onClick={(_, idx) => setDrillCat(cats[idx].key)}
                        label={({ name, payload }: { name?: string; payload?: { actual_pct: number } }) =>
                          `${name ?? ''} ${payload?.actual_pct?.toFixed(1) ?? ''}%`}
                        labelLine>
                        {cats.map(c => <Cell key={c.key} fill={c.color} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={(v) => [blurred ? '***' : `${fmtWan(Number(v))}`, '市值']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={drillItems} dataKey="value_twd" nameKey="id" cx="50%" cy="50%" outerRadius={100}>
                        {drillItems.map(item => <Cell key={item.id} fill={item.color} stroke="none" />)}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [blurred ? '***' : `${fmtWan(Number(v))}`, '市值']}
                        labelFormatter={(id) => {
                          const item = drillItems.find(d => d.id === id)
                          return item ? `${item.symbol}${item.name ? ` ${item.name}` : ''}` : String(id)
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}

                {!drillCat && <p className="text-xs text-center text-muted-foreground mt-1">點擊任一區塊查看個股</p>}

                {drillCat && (
                  <div className="mt-3 space-y-1">
                    {drillItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: item.color }} />
                          <span className="font-medium">{item.symbol}</span>
                          <span className="text-muted-foreground text-xs">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <A><span className="font-medium">{fmtWan(item.value_twd)}</span></A>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({total > 0 ? ((item.value_twd / total) * 100).toFixed(1) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">目標 vs 實際比例 (%)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 55]} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={65} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                    <Legend />
                    <Bar dataKey="目標" fill="#94a3b8" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="實際" radius={[0, 3, 3, 0]}>
                      {barData.map((_, i) => <Cell key={i} fill={cats[i].color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  {cats.map(c => (
                    <button key={c.key} onClick={() => setDrillCat(c.key)}
                      className="text-left rounded-lg border p-3 hover:shadow-md transition-shadow cursor-pointer"
                      style={{ borderLeftWidth: 4, borderLeftColor: c.color }}>
                      <p className="text-xs font-medium" style={{ color: c.color }}>{c.name}</p>
                      <p className="text-base font-bold"><A>{fmtWan(c.value_twd)}</A></p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-xs px-1" style={{ borderColor: c.color, color: c.color }}>
                          {c.actual_pct.toFixed(1)}%
                        </Badge>
                        <Badge variant="secondary" className="text-xs px-1">目標 {c.target_pct}%</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 2: 資產走勢 ── */}
        <TabsContent value="trend">
          <Card>
            <CardHeader><CardTitle className="text-base">資產走勢</CardTitle></CardHeader>
            <CardContent>
              <HistoryChart
                snapshots={state.snapshots ?? []}
                blurred={blurred}
                holdings={state.holdings}
                cashAccounts={state.cash_accounts}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: 再平衡 ── */}
        <TabsContent value="rebalance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">再平衡建議</CardTitle>
              <p className="text-sm text-muted-foreground">以目前總資產 <A>{fmtWan(total)}</A> 為基準計算</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={rebalance.map(r => ({ name: r.symbol, delta: parseFloat((r.delta_twd / 10000).toFixed(1)) }))}
                  layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v}萬`} />
                  <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [blurred ? '***' : `${Number(v)} 萬 TWD`, '缺口']} />
                  <ReferenceLine x={0} stroke="#64748b" />
                  <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
                    {rebalance.map((r, i) => <Cell key={i} fill={r.delta_twd >= 0 ? '#10b981' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4">標的</th>
                      <th className="text-right pr-4">現值</th>
                      <th className="text-right pr-4">目標%</th>
                      <th className="text-right pr-4">偏移%</th>
                      <th className="text-right pr-4">目標值</th>
                      <th className="text-right pr-4">缺口</th>
                      <th className="text-right">股數/金額</th>
                      <th className="text-center pl-4">動作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rebalance.map(r => {
                      const isPos = r.delta_twd >= 0
                      const actualPct = total > 0 ? (r.current_value_twd / total) * 100 : 0
                      const offsetPct = actualPct - r.target_pct
                      const offsetLabel = r.target_pct > 0
                        ? `${offsetPct >= 0 ? '+' : ''}${offsetPct.toFixed(1)}%`
                        : '—'
                      const offsetColor = r.target_pct > 0
                        ? offsetPct > 0.5 ? 'text-red-500' : offsetPct < -0.5 ? 'text-emerald-600' : 'text-muted-foreground'
                        : 'text-muted-foreground'
                      return (
                        <tr key={r.symbol} className="border-b hover:bg-muted/50">
                          <td className="py-2 pr-4 font-medium">
                            {r.symbol}
                            <span className="text-xs text-muted-foreground ml-1">{r.name}</span>
                          </td>
                          <td className="text-right pr-4"><A>{fmtWan(r.current_value_twd)}</A></td>
                          <td className="text-right pr-4">{r.target_pct > 0 ? `${r.target_pct}%` : '—'}</td>
                          <td className={`text-right pr-4 text-xs font-medium ${offsetColor}`}>{offsetLabel}</td>
                          <td className="text-right pr-4">{r.target_pct > 0 ? <A>{fmtWan(r.target_value_twd)}</A> : '—'}</td>
                          <td className={`text-right pr-4 font-medium ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                            {r.target_pct > 0 ? <A>{`${isPos ? '+' : ''}${fmt(r.delta_twd / 10000, 1)} 萬`}</A> : '—'}
                          </td>
                          <td className={`text-right text-xs ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                            {r.delta_shares !== undefined && r.target_pct > 0
                              ? <A>{`${isPos ? '+' : ''}${fmt(r.delta_shares, 2)} 股`}</A>
                              : '—'}
                          </td>
                          <td className="text-center pl-4">
                            {r.target_pct > 0 && (
                              <Badge variant={isPos ? 'default' : 'destructive'} className="text-xs">
                                {isPos ? '買入' : '賣出'}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: 持倉明細 ── */}
        <TabsContent value="holdings">
          <HoldingsTable state={state} onUpdate={commit} blurred={blurred} />
        </TabsContent>

        {/* ── Tab 5: 交易紀錄 ── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">交易紀錄</CardTitle>
              {state.transactions.length > 0 && (() => {
                const months = [...new Set(
                  state.transactions.map(t => t.date.slice(0, 7))
                )].sort((a, b) => b.localeCompare(a))
                return (
                  <select
                    value={txMonthFilter}
                    onChange={e => setTxMonthFilter(e.target.value)}
                    className="text-sm border border-input rounded-md px-2 py-1 bg-background"
                  >
                    <option value="">全部（{state.transactions.length} 筆）</option>
                    {months.map(m => {
                      const count = state.transactions.filter(t => t.date.startsWith(m)).length
                      return <option key={m} value={m}>{m}（{count} 筆）</option>
                    })}
                  </select>
                )
              })()}
            </CardHeader>
            <CardContent>
              {state.transactions.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">尚無交易紀錄</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-3">日期</th>
                        <th className="text-left pr-3">類型</th>
                        <th className="text-left pr-3">標的/帳戶</th>
                        <th className="text-right pr-3">股數</th>
                        <th className="text-right pr-3">價格</th>
                        <th className="text-right pr-3">金額</th>
                        <th className="text-right pr-3">手續費</th>
                        <th className="text-left pr-3">備註</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.transactions]
                        .filter(tx => !txMonthFilter || tx.date.startsWith(txMonthFilter))
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(tx => {
                        const typeLabel: Record<TxType, string> = {
                          buy: '買入', sell: '賣出', cash_in: '現金入', cash_out: '現金出',
                          new_position: '建立股票', new_cash_account: '建立現金',
                        }
                        const typeColor: Record<TxType, string> = {
                          buy: 'text-emerald-600', sell: 'text-red-500',
                          cash_in: 'text-blue-500', cash_out: 'text-orange-500',
                          new_position: 'text-purple-600', new_cash_account: 'text-indigo-600',
                        }
                        return (
                          <tr key={tx.id} className="border-b hover:bg-muted/30">
                            <td className="py-1.5 pr-3 text-muted-foreground">{tx.date}</td>
                            <td className={`pr-3 font-medium ${typeColor[tx.type]}`}>{typeLabel[tx.type]}</td>
                            <td className="pr-3 font-mono text-xs">{tx.symbol || tx.bank || '—'}</td>
                            <td className="text-right pr-3">{tx.shares !== undefined ? fmt(tx.shares, 2) : '—'}</td>
                            <td className="text-right pr-3">{tx.price !== undefined ? `${tx.currency === 'USD' ? '$' : ''}${fmt(tx.price, 2)}` : '—'}</td>
                            <td className="text-right pr-3 font-medium">
                              <A>{tx.currency === 'USD' ? `$${fmt(tx.amount, 2)}` : `${fmt(tx.amount)} TWD`}</A>
                            </td>
                            <td className="text-right pr-3 text-muted-foreground text-xs">
                              {tx.commission ? `${tx.currency === 'USD' ? '$' : ''}${fmt(tx.commission, 2)}` : '—'}
                            </td>
                            <td className="pr-3 text-muted-foreground text-xs">{tx.note || '—'}</td>
                            <td className="text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <button onClick={() => setEditingTx(tx)}
                                  className="text-muted-foreground/40 hover:text-blue-500 transition-colors" title="編輯">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDeleteTransaction(tx.id)}
                                  className="text-muted-foreground/40 hover:text-red-500 transition-colors" title="刪除">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TransactionDialog
        open={txOpen}
        onClose={() => setTxOpen(false)}
        onSubmit={handleTransaction}
        holdings={state.holdings}
        cashAccounts={state.cash_accounts}
      />
      <RetirementDialog
        open={retirementOpen}
        onClose={() => setRetirementOpen(false)}
        current={state.retirement}
        currentTotal={total}
        onSave={handleRetirementSave}
      />
      <PriceUpdateDialog
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        state={state}
        onUpdate={handlePriceUpdate}
      />
      <DbConfigDialog
        open={dbOpen}
        onClose={() => setDbOpen(false)}
        currentState={state}
        onRootDirChange={setDbRootDir}
        onLoad={(s, _date) => commit(s)}
      />
      <EditTransactionDialog
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        onSubmit={handleEditSubmit}
        holdings={state.holdings}
        cashAccounts={state.cash_accounts}
      />
    </div>
  )
}
