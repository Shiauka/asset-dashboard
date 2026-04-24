import type { AppState, CategorySummary, RebalanceRow, DrillItem, Category } from './types'

export const CATEGORY_META: Record<Category, { name: string; color: string; target_pct: number }> = {
  core:        { name: '核心資產', color: '#3b82f6', target_pct: 35 },
  aggressive:  { name: '攻擊資產', color: '#ef4444', target_pct: 30 },
  global:      { name: '分散資產', color: '#10b981', target_pct: 15 },
  alternative: { name: '另類資產', color: '#f59e0b', target_pct: 5  },
  defensive:   { name: '防禦資產', color: '#6366f1', target_pct: 15 },
}

const DRILL_PALETTES: Record<Category, string[]> = {
  core:        ['#3b82f6','#60a5fa','#93c5fd','#bfdbfe'],
  aggressive:  ['#ef4444','#f87171','#fca5a5'],
  global:      ['#10b981','#34d399','#6ee7b7'],
  alternative: ['#f59e0b','#fbbf24'],
  defensive:   ['#6366f1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff'],
}

export function holdingValueTwd(shares: number, price: number, currency: 'USD' | 'TWD', fx: number): number {
  return currency === 'USD' ? shares * price * fx : shares * price
}

export function totalAssetsTwd(state: AppState): number {
  const { exchange_rate: fx, holdings, cash_accounts } = state
  const holdingsVal = holdings.reduce((sum, h) => sum + holdingValueTwd(h.shares, h.price, h.currency, fx), 0)
  const cashVal = cash_accounts.reduce((sum, c) => sum + (c.currency === 'USD' ? c.amount * fx : c.amount), 0)
  return holdingsVal + cashVal
}

// 計算全部目標%加總（用於警示是否超過/低於 100%）
export function totalTargetPct(state: AppState): number {
  const holdingTotal = state.holdings.reduce((s, h) => s + h.target_pct, 0)
  const cashTotal = state.cash_accounts.reduce((s, c) => s + (c.target_pct ?? 0), 0)
  return holdingTotal + cashTotal
}

export function categorySummaries(state: AppState): CategorySummary[] {
  const { exchange_rate: fx, holdings, cash_accounts } = state
  const total = totalAssetsTwd(state)

  const catValues: Record<Category, number> = {
    core: 0, aggressive: 0, global: 0, alternative: 0, defensive: 0,
  }
  const catTargets: Record<Category, number> = {
    core: 0, aggressive: 0, global: 0, alternative: 0, defensive: 0,
  }

  for (const h of holdings) {
    catValues[h.category] += holdingValueTwd(h.shares, h.price, h.currency, fx)
    catTargets[h.category] += h.target_pct
  }
  for (const c of cash_accounts) {
    catValues.defensive += c.currency === 'USD' ? c.amount * fx : c.amount
    catTargets.defensive += c.target_pct ?? 0
  }

  return (Object.keys(CATEGORY_META) as Category[]).map(key => ({
    name: CATEGORY_META[key].name,
    key,
    value_twd: catValues[key],
    target_pct: catTargets[key],
    actual_pct: total > 0 ? (catValues[key] / total) * 100 : 0,
    color: CATEGORY_META[key].color,
  }))
}

export function categoryDrillDown(state: AppState, cat: Category): DrillItem[] {
  const { exchange_rate: fx, holdings, cash_accounts } = state
  const palette = DRILL_PALETTES[cat]
  const items: DrillItem[] = []

  if (cat === 'defensive') {
    for (const h of holdings.filter(h => h.category === 'defensive')) {
      items.push({
        id: h.symbol,
        symbol: h.symbol,
        name: h.name,
        value_twd: holdingValueTwd(h.shares, h.price, h.currency, fx),
        color: '',
      })
    }
    for (const c of cash_accounts) {
      const parts = c.bank.split(' ')
      items.push({
        id: c.bank,
        symbol: parts[0],
        name: parts.slice(1).join(' ') || '',
        value_twd: c.currency === 'USD' ? c.amount * fx : c.amount,
        color: '',
      })
    }
  } else {
    for (const h of holdings.filter(h => h.category === cat)) {
      items.push({
        id: h.symbol,
        symbol: h.symbol,
        name: h.name,
        value_twd: holdingValueTwd(h.shares, h.price, h.currency, fx),
        color: '',
      })
    }
  }

  return items
    .filter(i => i.value_twd > 0)
    .sort((a, b) => b.value_twd - a.value_twd)
    .map((item, i) => ({ ...item, color: palette[i % palette.length] }))
}

// FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r  →  solve for r
export function requiredAnnualReturn(pv: number, fv: number, n: number, pmt: number): number {
  if (n <= 0 || fv <= 0) return 0
  if (pv >= fv) return 0

  const calc = (r: number) => {
    const g = Math.pow(1 + r, n)
    if (Math.abs(r) < 1e-9) return pv * g + pmt * n
    return pv * g + pmt * (g - 1) / r
  }

  let lo = -0.2, hi = 3.0
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    if (calc(mid) < fv) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

export function rebalanceRows(state: AppState): RebalanceRow[] {
  const { exchange_rate: fx, holdings } = state
  const total = totalAssetsTwd(state)
  const rows: RebalanceRow[] = []

  const defSymbols = new Set(holdings.filter(h => h.category === 'defensive').map(h => h.symbol))

  for (const h of holdings.filter(h => !defSymbols.has(h.symbol))) {
    const current_value_twd = holdingValueTwd(h.shares, h.price, h.currency, fx)
    const target_value_twd = (h.target_pct / 100) * total
    const delta_twd = target_value_twd - current_value_twd
    const price_twd = h.currency === 'USD' ? h.price * fx : h.price
    rows.push({
      symbol: h.symbol,
      name: h.name,
      currency: h.currency,
      current_value_twd,
      target_pct: h.target_pct,
      target_value_twd,
      delta_twd,
      delta_usd: h.currency === 'USD' ? delta_twd / fx : undefined,
      delta_shares: price_twd > 0 ? delta_twd / price_twd : 0,
      price: h.price,
    })
  }

  // 防禦資產大桶（動態 target_pct = 防禦持倉 + 現金帳戶目標加總）
  const defHoldingsVal = holdings
    .filter(h => h.category === 'defensive')
    .reduce((s, h) => s + holdingValueTwd(h.shares, h.price, h.currency, fx), 0)
  const cashAccVal = state.cash_accounts.reduce((sum, c) =>
    sum + (c.currency === 'USD' ? c.amount * fx : c.amount), 0)
  const defensiveTotal = defHoldingsVal + cashAccVal

  const defensiveTargetPct =
    holdings.filter(h => h.category === 'defensive').reduce((s, h) => s + h.target_pct, 0) +
    state.cash_accounts.reduce((s, c) => s + (c.target_pct ?? 0), 0)
  const defensiveTarget = (defensiveTargetPct / 100) * total

  rows.push({
    symbol: 'DEFENSIVE',
    name: '防禦資產 (含儲蓄險)',
    currency: 'TWD',
    current_value_twd: defensiveTotal,
    target_pct: defensiveTargetPct,
    target_value_twd: defensiveTarget,
    delta_twd: defensiveTarget - defensiveTotal,
  })

  return rows.sort((a, b) => b.current_value_twd - a.current_value_twd)
}
