import type { AppState } from './types'

export const INITIAL_STATE: AppState = {
  exchange_rate: 31.5330,
  holdings: [
    // 核心資產 (35%)：0050 15%、VOO 20%
    { symbol: '0050',   name: '元大台50',  currency: 'TWD', category: 'core',        shares: 16675, price: 89.95,   target_pct: 15  },
    { symbol: 'VOO',    name: '標普500',   currency: 'USD', category: 'core',        shares: 97,    price: 652.00,  target_pct: 20  },
    // 攻擊資產 (30%)：00631L 15%、QQQ 15%
    { symbol: '00631L', name: '台50正2',   currency: 'TWD', category: 'aggressive',  shares: 3269,  price: 458.75,  target_pct: 15  },
    { symbol: 'QQQ',    name: '納斯達克',  currency: 'USD', category: 'aggressive',  shares: 72,    price: 655.95,  target_pct: 15  },
    // 分散資產 (15%)：VEA 7.5%、VWO 7.5%
    { symbol: 'VEA',    name: '非美成熟',  currency: 'USD', category: 'global',      shares: 350,   price: 67.78,   target_pct: 7.5 },
    { symbol: 'VWO',    name: '新興市場',  currency: 'USD', category: 'global',      shares: 410,   price: 57.92,   target_pct: 7.5 },
    // 另類資產 (5%)：IBIT 3%、IAU 2%
    { symbol: 'IBIT',   name: '比特幣',    currency: 'USD', category: 'alternative', shares: 215,   price: 44.14,   target_pct: 3   },
    { symbol: 'IAU',    name: '黃金',      currency: 'USD', category: 'alternative', shares: 72,    price: 88.05,   target_pct: 2   },
    // 防禦資產 (15%)：SGOV 7.5%（現金帳戶另貢獻 7.5%）
    { symbol: 'SGOV',   name: '短期美債',  currency: 'USD', category: 'defensive',   shares: 236,   price: 100.63,  target_pct: 7.5 },
  ],
  cash_accounts: [
    // 防禦資產 7.5%：TWD 目標 750,000 + 股數購買餘額 430
    { id: 'fubon-twd',  bank: '富邦 台幣現金', currency: 'TWD', amount: 750430,  type: 'bank', target_pct: 7.5 },
    // USD 購股餘額（各 USD ETF 零股餘額加總）
    { id: 'schwab-usd', bank: '嘉信 美金現金', currency: 'USD', amount: 684.13,  type: 'bank', target_pct: 0   },
  ],
  transactions: [],
  snapshots: [],
  retirement: {
    target_year: 2036,
    target_amount_twd: 50000000,
    annual_contribution_wan: 150,
  },
}
