import type { Permission } from "./auth/permissions";

export type NavItem = { href: string; label: string; permission?: Permission };
export type NavGroup = { title: string; items: NavItem[] };

export const NAVIGATION: NavGroup[] = [
  { title: "總覽", items: [{ href: "/", label: "儀表板" }] },
  {
    title: "總帳作業",
    items: [
      { href: "/accounts", label: "科目表管理", permission: "accounts.view" },
      { href: "/vouchers", label: "傳票輸入", permission: "vouchers.view" },
      { href: "/posting", label: "自動過帳", permission: "vouchers.post" },
    ],
  },
  {
    title: "帳簿",
    items: [
      { href: "/ledger/journal", label: "日記簿", permission: "ledger.view" },
      { href: "/ledger/general", label: "總分類帳", permission: "ledger.view" },
      { href: "/ledger/subsidiary", label: "明細分類帳", permission: "ledger.view" },
    ],
  },
  {
    title: "財務報表",
    items: [
      { href: "/reports/trial-balance", label: "試算表", permission: "reports.view" },
      { href: "/reports/income-statement", label: "損益表", permission: "reports.view" },
      { href: "/reports/balance-sheet", label: "資產負債表", permission: "reports.view" },
    ],
  },
  {
    title: "往來對象",
    items: [
      { href: "/customers", label: "客戶管理", permission: "customers.view" },
      { href: "/vendors", label: "供應商管理", permission: "vendors.view" },
    ],
  },
  {
    title: "應收應付",
    items: [
      { href: "/receivables", label: "應收帳款", permission: "ar.view" },
      { href: "/receivables/receipts", label: "收款沖帳", permission: "ar.view" },
      { href: "/receivables/aging", label: "應收帳齡", permission: "ar.view" },
      { href: "/payables", label: "應付帳款", permission: "ap.view" },
      { href: "/payables/payments", label: "付款沖帳", permission: "ap.view" },
      { href: "/payables/aging", label: "應付帳齡", permission: "ap.view" },
    ],
  },
  {
    title: "庫存",
    items: [
      { href: "/inventory", label: "商品與庫存", permission: "inventory.view" },
      { href: "/inventory/transactions", label: "庫存異動", permission: "inventory.view" },
      { href: "/inventory/adjust", label: "盤點調整", permission: "inventory.manage" },
    ],
  },
  {
    title: "系統管理",
    items: [
      { href: "/admin/users", label: "使用者", permission: "admin.users" },
      { href: "/admin/roles", label: "角色權限", permission: "admin.roles" },
      { href: "/admin/settings", label: "系統設定", permission: "admin.settings" },
      { href: "/admin/audit", label: "稽核紀錄", permission: "admin.audit" },
    ],
  },
];
