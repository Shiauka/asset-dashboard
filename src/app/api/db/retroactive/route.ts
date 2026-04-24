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

type Holding = { symbol: string; shares: number; amount?: number; [key: string]: unknown }
type CashAccount = { bank: string; amount: number; [key: string]: unknown }
type TxPayload = {
  type: string
  symbol?: string
  bank?: string
  shares?: number
  price?: number
  amount: number
  commission?: number
  currency: string
  date: string
}
type FileState = {
  holdings?: Holding[]
  cash_accounts?: CashAccount[]
  [key: string]: unknown
}

function applyDelta(
  holdings: Holding[],
  cashAccounts: CashAccount[],
  tx: TxPayload,
  sign: 1 | -1,
): void {
  switch (tx.type) {
    case 'sell': {
      const hi = holdings.findIndex(h => h.symbol === tx.symbol)
      if (hi >= 0 && tx.shares) holdings[hi] = { ...holdings[hi], shares: holdings[hi].shares - sign * tx.shares }
      if (tx.bank && tx.bank !== '__none') {
        const ci = cashAccounts.findIndex(c => c.bank === tx.bank)
        if (ci >= 0) cashAccounts[ci] = { ...cashAccounts[ci], amount: cashAccounts[ci].amount + sign * (tx.amount - (tx.commission ?? 0)) }
      }
      break
    }
    case 'buy': {
      const hi = holdings.findIndex(h => h.symbol === tx.symbol)
      if (hi >= 0 && tx.shares) holdings[hi] = { ...holdings[hi], shares: holdings[hi].shares + sign * tx.shares }
      if (tx.bank && tx.bank !== '__none') {
        const ci = cashAccounts.findIndex(c => c.bank === tx.bank)
        if (ci >= 0) cashAccounts[ci] = { ...cashAccounts[ci], amount: cashAccounts[ci].amount - sign * (tx.amount + (tx.commission ?? 0)) }
      }
      break
    }
    case 'cash_in': {
      if (tx.bank) {
        const ci = cashAccounts.findIndex(c => c.bank === tx.bank)
        if (ci >= 0) cashAccounts[ci] = { ...cashAccounts[ci], amount: cashAccounts[ci].amount + sign * tx.amount }
      }
      break
    }
    case 'cash_out': {
      if (tx.bank) {
        const ci = cashAccounts.findIndex(c => c.bank === tx.bank)
        if (ci >= 0) cashAccounts[ci] = { ...cashAccounts[ci], amount: cashAccounts[ci].amount - sign * tx.amount }
      }
      break
    }
  }
}

export async function POST(request: Request) {
  const rootDir = await getRootDir()
  if (!rootDir) {
    return Response.json({ ok: false, error: '尚未設定根目錄' }, { status: 400 })
  }

  const body = await request.json() as { tx: TxPayload; direction?: 1 | -1 }
  const { tx, direction = 1 } = body
  const sign: 1 | -1 = direction === -1 ? -1 : 1

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })

  const entries = await fs.readdir(rootDir)
  const affected = entries
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter(f => {
      const d = f.replace('.json', '')
      return d >= tx.date && d < today
    })
    .sort()

  const updatedFiles: string[] = []

  for (const f of affected) {
    const filePath = path.join(rootDir, f)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const state = JSON.parse(raw) as FileState

      const holdings = [...(state.holdings ?? [])] as Holding[]
      const cashAccounts = [...(state.cash_accounts ?? [])] as CashAccount[]

      applyDelta(holdings, cashAccounts, tx, sign)

      const updated: FileState = { ...state, holdings, cash_accounts: cashAccounts }
      await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8')
      updatedFiles.push(f)
    } catch {
      // skip unreadable files
    }
  }

  return Response.json({ ok: true, updated: updatedFiles })
}
