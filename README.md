# Asset Dashboard

個人資產配置追蹤工具，支援五桶框架（核心／攻擊／分散／另類／防禦），自動抓取 Yahoo Finance 報價與台銀匯率。

## 功能

- 五桶資產分類與比例視覺化
- 自動抓取即時股價（Yahoo Finance）與 USD/TWD 匯率（台銀）
- 每日快照存檔，歷史走勢圖表
- 再平衡建議計算
- 交易紀錄（買入／賣出，含手續費）
- 退休試算

## 系統需求

- [Node.js](https://nodejs.org/) v18 以上
- npm（隨 Node.js 附帶）

## 安裝與啟動

```bash
# 1. clone 專案
git clone <repo-url>
cd asset-dashboard

# 2. 安裝套件（約 1-2 分鐘）
npm install

# 3. 啟動開發伺服器
npm run dev
```

開啟瀏覽器前往 [http://localhost:3000](http://localhost:3000)

## 首次設定

1. 點選右上角「⚙ 根目錄設定」
2. 輸入一個本機資料夾路徑（例如 `C:\MyData\AssetSnapshots`），用來存放每日快照 JSON
3. 設定完成後，每次開啟頁面會自動載入最新快照並更新報價

> 若不設定根目錄，資料只會存在 localStorage（關閉瀏覽器後仍保留，但換裝置會遺失）。

## 資料儲存

| 儲存位置 | 內容 | 說明 |
|----------|------|------|
| 瀏覽器 localStorage | 目前狀態 | 即時，無需設定 |
| 本機資料夾（自訂路徑） | 每日 JSON 快照 | 需設定根目錄，格式如 `2026-04-24.json` |

所有資料存在本機，不會上傳任何伺服器。

## 注意事項

- 本工具設計為**本機自架**，不支援部署至 GitHub Pages（需要 Node.js 伺服器執行 API）
- 每次啟動 `npm run dev` 後才能使用，關閉終端機則停止服務
- 若要在同區網路其他裝置（如手機）存取，可改用 `npm run dev -- --hostname 0.0.0.0`，再從手機連 PC 的 IP

## 技術棧

- [Next.js](https://nextjs.org/) 16 (App Router)
- TypeScript
- [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS v4
- [Recharts](https://recharts.org/)
