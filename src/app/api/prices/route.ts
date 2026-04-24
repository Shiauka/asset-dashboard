interface HoldingInput {
  symbol: string
  currency: 'USD' | 'TWD'
}

async function fetchYahooPrice(symbol: string, currency: 'USD' | 'TWD'): Promise<number | null> {
  const yahooSymbol = currency === 'TWD' ? `${symbol}.TW` : symbol
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } }
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' && price > 0 ? price : null
  } catch {
    return null
  }
}

// 台銀即期買入匯率（銀行買進 USD，即你持有 USD 資產換算成 TWD 的基準）
async function fetchBotUsdRate(): Promise<number | null> {
  try {
    const res = await fetch('https://rate.bot.com.tw/xrt?Lang=zh-TW', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // 找含有 USD 的 <tr> 區塊，再從中抓數字型 <td>
    const trBlocks = html.split(/<tr[\s>]/i)
    const usdTr = trBlocks.find(b => b.includes('(USD)'))
    if (!usdTr) return null

    // 欄位順序：現金買入 | 現金賣出 | 即期買入 | 即期賣出 | 遠期...
    const nums = [...usdTr.matchAll(/<td[^>]*>\s*([\d.]+)\s*<\/td>/gi)]
    if (nums.length < 3) return null

    const spotBuy = parseFloat(nums[2][1]) // index 2 = 即期買入
    return isNaN(spotBuy) || spotBuy <= 0 ? null : spotBuy
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const body = await request.json() as { holdings: HoldingInput[] }
  const { holdings } = body

  const [priceResults, exchangeRate] = await Promise.all([
    Promise.all(
      holdings.map(async h => ({
        symbol: h.symbol,
        price: await fetchYahooPrice(h.symbol, h.currency),
      }))
    ),
    fetchBotUsdRate(),
  ])

  const prices: Record<string, number | null> = {}
  const errors: string[] = []
  for (const r of priceResults) {
    prices[r.symbol] = r.price
    if (r.price === null) errors.push(r.symbol)
  }

  return Response.json({ prices, exchange_rate: exchangeRate, errors })
}
