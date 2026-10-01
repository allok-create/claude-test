/**
 * 預設會計科目表（參考經濟部「商業會計項目表」精簡版）
 * [代碼, 名稱, 類別, 子分類, 上層代碼]
 * 末層（無下層者）為可入帳之明細科目。
 */
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type SeedAccount = [code: string, name: string, type: AccountType, category: string, parent: string | null];

export const DEFAULT_ACCOUNTS: SeedAccount[] = [
  // 1 資產
  ["1", "資產", "asset", "asset", null],
  ["11", "流動資產", "asset", "current_asset", "1"],
  ["1100", "現金及約當現金", "asset", "current_asset", "11"],
  ["1101", "庫存現金", "asset", "current_asset", "1100"],
  ["1102", "零用金", "asset", "current_asset", "1100"],
  ["1103", "銀行存款", "asset", "current_asset", "1100"],
  ["1150", "應收票據", "asset", "current_asset", "11"],
  ["1170", "應收帳款", "asset", "current_asset", "11"],
  ["1180", "備抵呆帳－應收帳款", "asset", "current_asset", "11"],
  ["1200", "其他應收款", "asset", "current_asset", "11"],
  ["1300", "存貨", "asset", "current_asset", "11"],
  ["1410", "預付款項", "asset", "current_asset", "11"],
  ["1470", "進項稅額", "asset", "current_asset", "11"],
  ["1480", "留抵稅額", "asset", "current_asset", "11"],
  ["15", "非流動資產", "asset", "non_current_asset", "1"],
  ["1600", "不動產、廠房及設備", "asset", "non_current_asset", "15"],
  ["1610", "土地", "asset", "non_current_asset", "1600"],
  ["1620", "房屋及建築", "asset", "non_current_asset", "1600"],
  ["1630", "機器設備", "asset", "non_current_asset", "1600"],
  ["1640", "運輸設備", "asset", "non_current_asset", "1600"],
  ["1650", "辦公設備", "asset", "non_current_asset", "1600"],
  ["1690", "累計折舊", "asset", "non_current_asset", "1600"],
  ["1780", "無形資產", "asset", "non_current_asset", "15"],
  ["1920", "存出保證金", "asset", "non_current_asset", "15"],

  // 2 負債
  ["2", "負債", "liability", "liability", null],
  ["21", "流動負債", "liability", "current_liability", "2"],
  ["2100", "短期借款", "liability", "current_liability", "21"],
  ["2150", "應付票據", "liability", "current_liability", "21"],
  ["2170", "應付帳款", "liability", "current_liability", "21"],
  ["2200", "其他應付款", "liability", "current_liability", "21"],
  ["2201", "應付薪資", "liability", "current_liability", "2200"],
  ["2202", "應付費用", "liability", "current_liability", "2200"],
  ["2204", "銷項稅額", "liability", "current_liability", "21"],
  ["2205", "應付營業稅", "liability", "current_liability", "21"],
  ["2230", "本期所得稅負債", "liability", "current_liability", "21"],
  ["2310", "預收款項", "liability", "current_liability", "21"],
  ["2280", "代收款", "liability", "current_liability", "21"],
  ["25", "非流動負債", "liability", "non_current_liability", "2"],
  ["2540", "長期借款", "liability", "non_current_liability", "25"],
  ["2645", "存入保證金", "liability", "non_current_liability", "25"],

  // 3 權益
  ["3", "權益", "equity", "equity", null],
  ["3100", "股本", "equity", "equity", "3"],
  ["3110", "普通股股本", "equity", "equity", "3100"],
  ["3200", "資本公積", "equity", "equity", "3"],
  ["3300", "保留盈餘", "equity", "equity", "3"],
  ["3310", "法定盈餘公積", "equity", "equity", "3300"],
  ["3350", "未分配盈餘", "equity", "equity", "3300"],
  ["3360", "本期損益", "equity", "equity", "3300"],

  // 4 營業收入
  ["4", "營業收入", "revenue", "operating_revenue", null],
  ["4100", "銷貨收入", "revenue", "operating_revenue", "4"],
  ["4170", "銷貨退回", "revenue", "operating_revenue", "4"],
  ["4190", "銷貨折讓", "revenue", "operating_revenue", "4"],
  ["4600", "勞務收入", "revenue", "operating_revenue", "4"],

  // 5 營業成本
  ["5", "營業成本", "expense", "cost_of_sales", null],
  ["5100", "銷貨成本", "expense", "cost_of_sales", "5"],
  ["5600", "勞務成本", "expense", "cost_of_sales", "5"],

  // 6 營業費用
  ["6", "營業費用", "expense", "operating_expense", null],
  ["6100", "推銷費用", "expense", "operating_expense", "6"],
  ["6110", "廣告費", "expense", "operating_expense", "6100"],
  ["6120", "運費", "expense", "operating_expense", "6100"],
  ["6200", "管理費用", "expense", "operating_expense", "6"],
  ["6201", "薪資支出", "expense", "operating_expense", "6200"],
  ["6202", "租金支出", "expense", "operating_expense", "6200"],
  ["6203", "文具用品", "expense", "operating_expense", "6200"],
  ["6204", "旅費", "expense", "operating_expense", "6200"],
  ["6205", "郵電費", "expense", "operating_expense", "6200"],
  ["6206", "修繕費", "expense", "operating_expense", "6200"],
  ["6207", "水電瓦斯費", "expense", "operating_expense", "6200"],
  ["6208", "保險費", "expense", "operating_expense", "6200"],
  ["6209", "交際費", "expense", "operating_expense", "6200"],
  ["6210", "稅捐", "expense", "operating_expense", "6200"],
  ["6211", "折舊", "expense", "operating_expense", "6200"],
  ["6212", "伙食費", "expense", "operating_expense", "6200"],
  ["6213", "職工福利", "expense", "operating_expense", "6200"],
  ["6214", "勞務費", "expense", "operating_expense", "6200"],
  ["6215", "雜項購置", "expense", "operating_expense", "6200"],
  ["6219", "其他費用", "expense", "operating_expense", "6200"],

  // 7 營業外收益及費損
  ["7", "營業外收益及費損", "revenue", "non_operating", null],
  ["7100", "利息收入", "revenue", "non_operating_revenue", "7"],
  ["7190", "其他收入", "revenue", "non_operating_revenue", "7"],
  ["7191", "存貨盤盈", "revenue", "non_operating_revenue", "7"],
  ["7510", "利息費用", "expense", "non_operating_expense", "7"],
  ["7880", "其他損失", "expense", "non_operating_expense", "7"],
  ["7881", "存貨盤損", "expense", "non_operating_expense", "7"],

  // 8 所得稅
  ["8", "所得稅費用", "expense", "income_tax", null],
  ["8100", "所得稅費用", "expense", "income_tax", "8"],
];

/** 系統自動分錄使用之預設科目（存於 settings，可於系統設定調整） */
export const DEFAULT_ACCOUNT_MAPPINGS: Record<string, string> = {
  "acct.cash": "1101",
  "acct.bank": "1103",
  "acct.ar": "1170",
  "acct.ap": "2170",
  "acct.inventory": "1300",
  "acct.sales": "4100",
  "acct.cogs": "5100",
  "acct.output_vat": "2204",
  "acct.input_vat": "1470",
  "acct.purchase_expense": "6219",
  "acct.inventory_gain": "7191",
  "acct.inventory_loss": "7881",
  "acct.current_earnings": "3360",
};

export const ACCOUNT_MAPPING_LABELS: Record<string, string> = {
  "acct.cash": "現金",
  "acct.bank": "銀行存款",
  "acct.ar": "應收帳款",
  "acct.ap": "應付帳款",
  "acct.inventory": "存貨",
  "acct.sales": "銷貨收入",
  "acct.cogs": "銷貨成本",
  "acct.output_vat": "銷項稅額",
  "acct.input_vat": "進項稅額",
  "acct.purchase_expense": "預設費用科目",
  "acct.inventory_gain": "存貨盤盈",
  "acct.inventory_loss": "存貨盤損",
  "acct.current_earnings": "本期損益",
};
