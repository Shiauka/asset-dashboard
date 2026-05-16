import type { AppState } from './types'

export const INITIAL_STATE: AppState = {
  exchange_rate: 32.0,
  holdings: [
    // 核心資產 (35%)：0050 15%、VOO 20%
    { symbol: '0050',   name: '元大台50',  currency: 'TWD', category: 'core',        shares: 1000, price: 90.0,   target_pct: 15  },
    { symbol: 'VOO',    name: '標普500',   currency: 'USD', category: 'core',        shares: 10,   price: 550.0,  target_pct: 20  },
    // 攻擊資產 (30%)：00631L 15%、QQQ 15%
    { symbol: '00631L', name: '台50正2',   currency: 'TWD', category: 'aggressive',  shares: 500,  price: 460.0,  target_pct: 15  },
    { symbol: 'QQQ',    name: '納斯達克',  currency: 'USD', category: 'aggressive',  shares: 5,    price: 480.0,  target_pct: 15  },
    // 分散資產 (15%)：VEA 7.5%、VWO 7.5%
    { symbol: 'VEA',    name: '非美成熟',  currency: 'USD', category: 'global',      shares: 50,   price: 52.0,   target_pct: 7.5 },
    { symbol: 'VWO',    name: '新興市場',  currency: 'USD', category: 'global',      shares: 50,   price: 45.0,   target_pct: 7.5 },
    // 另類資產 (5%)：IBIT 3%、IAU 2%
    { symbol: 'IBIT',   name: '比特幣',    currency: 'USD', category: 'alternative', shares: 10,   price: 50.0,   target_pct: 3   },
    { symbol: 'IAU',    name: '黃金',      currency: 'USD', category: 'alternative', shares: 10,   price: 55.0,   target_pct: 2   },
    // 防禦資產 (15%)：SGOV 7.5%（現金帳戶另貢獻 7.5%）
    { symbol: 'SGOV',   name: '短期美債',  currency: 'USD', category: 'defensive',   shares: 30,   price: 100.5,  target_pct: 7.5 },
  ],
  cash_accounts: [
    { id: 'twd-bank', bank: '台幣帳戶', currency: 'TWD', amount: 100000, type: 'bank', target_pct: 7.5 },
    { id: 'usd-bank', bank: '美金帳戶', currency: 'USD', amount: 500,    type: 'bank', target_pct: 0   },
  ],
  transactions: [],
  snapshots: [],
  retirement: {
    birth_year: 1990,
    retirement_age: 50,
    target_amount_twd: 30000000,
    monthly_contribution_wan: 5,
    expected_annual_return: 0.07,
  },
}
