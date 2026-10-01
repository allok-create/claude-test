# 企業會計記帳系統

以 **Next.js 16（App Router）＋ TypeScript ＋ SQLite ＋ Tailwind CSS** 建置的企業級會計記帳系統，介面採繁體中文，涵蓋總帳、帳簿、財務報表、應收應付、庫存與權限管理。

## 功能一覽

| # | 模組 | 路徑 | 說明 |
|---|------|------|------|
| 1 | 科目表管理 | `/accounts` | 階層式會計科目（預設依商業會計項目表），僅明細科目可入帳，上層科目自動彙總 |
| 2 | 傳票輸入 | `/vouchers` | 收入／支出／轉帳傳票，借貸平衡檢核、差額補平、往來對象標記、修改／刪除／作廢 |
| 3 | 自動過帳 | `/posting` | 可設定儲存即過帳；批次過帳、單張過帳、反過帳；關帳日控管 |
| 4 | 日記簿 | `/ledger/journal` | 依日期、傳票順序列示所有已過帳分錄 |
| 5 | 總分類帳 | `/ledger/general` | 任一科目（含下層）以傳票彙總之借貸與累計餘額 |
| 6 | 明細分類帳 | `/ledger/subsidiary` | 明細科目逐筆分錄與累計餘額，可依客戶／供應商篩選 |
| 7 | 試算表 | `/reports/trial-balance` | 期初、本期借貸、期末餘額，階層彙總與平衡檢核 |
| 8 | 損益表 | `/reports/income-statement` | 多站式損益表（毛利、營業淨利、稅前淨利、本期淨利） |
| 9 | 資產負債表 | `/reports/balance-sheet` | 流動／非流動資產負債、權益（含本期損益） |
| 10 | 客戶管理 | `/customers` | 客戶主檔、信用額度、付款條件、往來紀錄 |
| 11 | 供應商管理 | `/vendors` | 供應商主檔、匯款帳號、往來紀錄 |
| 12 | 應收帳款管理 | `/receivables` | 開立應收（自動分錄＋銷貨成本＋庫存出庫）、收款沖帳、帳齡分析 |
| 13 | 應付帳款管理 | `/payables` | 登錄進貨／費用（自動分錄＋存貨入庫）、付款沖帳、帳齡分析 |
| 14 | 庫存管理 | `/inventory` | 商品主檔、移動加權平均成本、存貨卡、盤點調整（自動產生調整傳票） |
| 15 | 權限管理 | `/admin` | 使用者、角色權限矩陣、系統設定、稽核紀錄 |

## 快速開始

```bash
npm install
npm run db:reset     # 建立資料庫並載入示範資料（可略過，首次啟動會自動建立基本資料）
npm run dev          # http://localhost:3000
```

預設帳號：

| 帳號 | 密碼 | 角色 |
|------|------|------|
| admin | admin123 | 系統管理員（首次登入後請立即變更密碼） |
| chief | Chief12345 | 會計主管（示範資料） |
| accountant | Account123 | 會計人員（示範資料） |
| viewer | Viewer1234 | 唯讀查詢（示範資料） |

正式環境：

```bash
npm run build
DATABASE_PATH=/var/lib/accounting/accounting.db ADMIN_PASSWORD='強密碼' npm start
```

### 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `DATABASE_PATH` | `./data/accounting.db` | SQLite 資料庫檔案位置 |
| `SESSION_TTL_HOURS` | `12` | 登入有效時數 |
| `ADMIN_PASSWORD` | `admin123` | 首次建立資料庫時的管理員密碼 |
| `INSECURE_COOKIE` | — | 設為 `1` 可在非 HTTPS 的正式環境使用登入 cookie（僅限內網測試） |

## 系統架構

```
src/
├── proxy.ts                  # 未登入導向登入頁（Next.js 16 Proxy）
├── app/
│   ├── login/                # 登入
│   └── (app)/                # 需登入之頁面（側邊選單依權限顯示）
│       ├── accounts/  vouchers/  posting/
│       ├── ledger/{journal,general,subsidiary}/
│       ├── reports/{trial-balance,income-statement,balance-sheet}/
│       ├── customers/  vendors/  receivables/  payables/  inventory/
│       └── admin/{users,roles,settings,audit}/
├── components/               # 共用 UI、傳票／單據／沖帳表單
└── lib/
    ├── db/                   # 連線、migration、預設科目表與基本資料
    ├── auth/                 # 密碼雜湊（scrypt）、Session、權限定義
    ├── services/             # 商業邏輯層（所有會計規則集中於此）
    └── utils/                # 金額、日期、錯誤處理
tests/                        # Vitest 單元測試（記憶體資料庫）
scripts/seed.ts               # 示範資料
```

### 分層設計

- **Service 層**（`src/lib/services`）：所有會計規則集中處理，具交易一致性（SQLite transaction），頁面與 Server Action 僅負責權限檢查、輸入轉換與呈現。
- **Server Actions**：每個模組的 `actions.ts` 以 `authorize()` 檢查權限，以 `runAction()` 統一轉換業務錯誤訊息。
- **權限**：模組 × 動作（例如 `vouchers.post`），角色可自訂權限組合；頁面與動作皆於伺服器端檢查。

### 會計規則

- **金額**一律以「分」整數儲存，避免浮點誤差；數量與平均成本以實數儲存。
- **傳票**：每列僅能借或貸，借貸合計必須相等；只有啟用中的明細科目可入帳。
- **過帳**：過帳時將分錄寫入 `gl_entries`，日記簿、分類帳與報表皆只讀取已過帳資料；反過帳／作廢會移除對應分錄並保留稽核紀錄。
- **關帳**：系統設定之「關帳日」（含）以前不得新增、修改、過帳、反過帳或作廢任何單據。
- **自動分錄**：
  - 應收單：借 應收帳款／貸 銷貨收入、銷項稅額；含商品時另借 銷貨成本／貸 存貨。
  - 收款：借 現金或銀行存款／貸 應收帳款。
  - 應付單：借 存貨或費用、進項稅額／貸 應付帳款。
  - 付款：借 應付帳款／貸 現金或銀行存款。
  - 盤點調整：盤盈 借 存貨／貸 存貨盤盈；盤損 借 存貨盤損／貸 存貨。
- **存貨計價**：移動加權平均法，不允許負庫存。
- **營業稅**：預設 5%，四捨五入至元，可選零稅率／免稅。
- **資產負債表**：尚未結轉之損益，以前年度列為「累積盈虧（以前年度未結轉）」，當年度列為「本期損益」。
- 系統自動分錄所用科目可於「系統設定 → 系統對應科目」調整。

## 開發

```bash
npm run typecheck   # TypeScript 型別檢查
npm test            # 單元測試（過帳、報表平衡、應收應付、庫存成本）
```

---

方圓會計師事務所　會計師　梁右澤
地址：台中市北屯區文心路四段955號20樓之5｜電話：04-22410032｜聯絡：@allfine
※ 本系統報表內容僅供參考，實際申報以主管機關核定為準
