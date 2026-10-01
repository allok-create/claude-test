/**
 * 權限定義：模組 × 動作
 * 此檔不依賴資料庫，可於伺服器與用戶端共用。
 */
export const PERMISSION_GROUPS = [
  {
    module: "會計科目",
    permissions: [
      { key: "accounts.view", label: "檢視科目表" },
      { key: "accounts.manage", label: "維護科目表" },
    ],
  },
  {
    module: "傳票",
    permissions: [
      { key: "vouchers.view", label: "檢視傳票" },
      { key: "vouchers.create", label: "新增／修改傳票" },
      { key: "vouchers.post", label: "過帳／反過帳" },
      { key: "vouchers.void", label: "作廢傳票" },
    ],
  },
  {
    module: "帳簿",
    permissions: [{ key: "ledger.view", label: "日記簿／總分類帳／明細分類帳" }],
  },
  {
    module: "財務報表",
    permissions: [{ key: "reports.view", label: "試算表／損益表／資產負債表" }],
  },
  {
    module: "客戶",
    permissions: [
      { key: "customers.view", label: "檢視客戶" },
      { key: "customers.manage", label: "維護客戶" },
    ],
  },
  {
    module: "供應商",
    permissions: [
      { key: "vendors.view", label: "檢視供應商" },
      { key: "vendors.manage", label: "維護供應商" },
    ],
  },
  {
    module: "應收帳款",
    permissions: [
      { key: "ar.view", label: "檢視應收帳款" },
      { key: "ar.manage", label: "開立應收／收款沖帳" },
    ],
  },
  {
    module: "應付帳款",
    permissions: [
      { key: "ap.view", label: "檢視應付帳款" },
      { key: "ap.manage", label: "登錄應付／付款沖帳" },
    ],
  },
  {
    module: "庫存",
    permissions: [
      { key: "inventory.view", label: "檢視庫存" },
      { key: "inventory.manage", label: "維護商品／庫存調整" },
    ],
  },
  {
    module: "系統管理",
    permissions: [
      { key: "admin.users", label: "使用者管理" },
      { key: "admin.roles", label: "角色權限管理" },
      { key: "admin.settings", label: "系統設定／關帳" },
      { key: "admin.audit", label: "稽核紀錄" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

/** 預設角色 */
export const DEFAULT_ROLES: {
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    code: "admin",
    name: "系統管理員",
    description: "擁有全部權限",
    permissions: ALL_PERMISSIONS,
  },
  {
    code: "chief_accountant",
    name: "會計主管",
    description: "可執行所有會計作業、過帳、作廢與關帳",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "admin.users" && p !== "admin.roles"),
  },
  {
    code: "accountant",
    name: "會計人員",
    description: "可輸入傳票、處理應收應付與庫存，不可作廢或關帳",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !p.startsWith("admin.") && p !== "vouchers.void" && p !== "accounts.manage",
    ),
  },
  {
    code: "viewer",
    name: "唯讀查詢",
    description: "僅可查詢帳簿與報表",
    permissions: ALL_PERMISSIONS.filter((p) => p.endsWith(".view")),
  },
];
