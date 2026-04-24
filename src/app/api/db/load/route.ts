import { promises as fs } from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), 'db-config.json')

async function getRootDir(): Promise<string | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    return (JSON.parse(raw) as { rootDir?: string }).rootDir ?? null
  } catch {
    return null
  }
}

type Holding = { symbol: string; currency: 'USD' | 'TWD'; category: string; shares: number; price: number }
type CashAccount = { bank: string; currency: 'USD' | 'TWD'; amount: number }
type SnapRow = { date: string; total_twd: number; bucket_pct?: Record<string, number>; holdings_twd?: Record<string, number>; holdings_shares?: Record<string, number> }
type FileState = { exchange_rate?: number; holdings?: Holding[]; cash_accounts?: CashAccount[]; snapshots?: SnapRow[] }

function enrichSnapshot(fileDate: string, fileState: FileState): SnapRow | null {
  const fx = fileState.exchange_rate ?? 1
  const holdings = fileState.holdings ?? []
  const cashAccounts = fileState.cash_accounts ?? []

  const hVal = (h: Holding) => h.currency === 'USD' ? h.shares * h.price * fx : h.shares * h.price
  const cVal = (c: CashAccount) => c.currency === 'USD' ? c.amount * fx : c.amount

  const total = holdings.reduce((s, h) => s + hVal(h), 0) + cashAccounts.reduce((s, c) => s + cVal(c), 0)
  if (total <= 0) return null

  const cats: Record<string, number> = { core: 0, aggressive: 0, global: 0, alternative: 0, defensive: 0 }
  for (const h of holdings) {
    const cat = h.category
    if (cat in cats) cats[cat] += hVal(h)
  }
  for (const c of cashAccounts) cats.defensive += cVal(c)

  const bucket_pct: Record<string, number> = {}
  for (const [k, v] of Object.entries(cats)) bucket_pct[k] = (v / total) * 100

  const holdings_twd: Record<string, number> = {}
  const holdings_shares: Record<string, number> = {}
  for (const h of holdings) {
    holdings_twd[h.symbol] = hVal(h)
    holdings_shares[h.symbol] = h.shares
  }
  for (const c of cashAccounts) holdings_twd[c.bank] = cVal(c)

  return { date: fileDate, total_twd: total, bucket_pct, holdings_twd, holdings_shares }
}

export async function GET(request: Request) {
  const rootDir = await getRootDir()
  if (!rootDir) {
    return Response.json({ ok: false, error: '尚未設定根目錄' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  try {
    const entries = await fs.readdir(rootDir)
    const dateFiles = entries
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()

    if (dateFiles.length === 0) {
      return Response.json({ ok: false, error: '根目錄中沒有資料' }, { status: 404 })
    }

    const targetFile = date ? `${date}.json` : dateFiles[dateFiles.length - 1]
    if (!dateFiles.includes(targetFile)) {
      return Response.json({ ok: false, error: `找不到 ${targetFile}` }, { status: 404 })
    }

    const raw = await fs.readFile(path.join(rootDir, targetFile), 'utf-8')
    const state = JSON.parse(raw) as FileState

    // Rebuild full snapshot history: compute bucket_pct + holdings_twd from each file's state
    const snapMap = new Map<string, SnapRow>()
    for (const f of dateFiles) {
      const fileDate = f.replace('.json', '')
      try {
        const fileRaw = await fs.readFile(path.join(rootDir, f), 'utf-8')
        const fileState = JSON.parse(fileRaw) as FileState
        const snap = enrichSnapshot(fileDate, fileState)
        if (snap) snapMap.set(snap.date, snap)
      } catch {
        // skip unreadable files
      }
    }

    const mergedSnapshots = Array.from(snapMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))

    return Response.json({
      ok: true,
      state: { ...state, snapshots: mergedSnapshots },
      date: targetFile.replace('.json', ''),
      dates: dateFiles.map(f => f.replace('.json', '')),
    })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
