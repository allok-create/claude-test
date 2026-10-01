/**
 * 資料庫結構定義（SQLite）
 *
 * 金額欄位一律以「分」（新台幣 × 100）之整數儲存，避免浮點誤差。
 * 數量與平均單位成本以 REAL 儲存。
 *
 * 每一個 migration 依序執行一次，執行紀錄存於 schema_migrations。
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
    -- 系統設定
    CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 權限管理：角色、權限、使用者、登入工作階段
    CREATE TABLE roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT,
      is_system   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE role_permissions (
      role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      PRIMARY KEY (role_id, permission)
    );

    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      email         TEXT,
      password_hash TEXT NOT NULL,
      role_id       INTEGER NOT NULL REFERENCES roles(id),
      is_active     INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE sessions (
      id         TEXT PRIMARY KEY,            -- token 的 SHA-256 雜湊
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_sessions_user ON sessions(user_id);

    -- 稽核紀錄
    CREATE TABLE audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER REFERENCES users(id),
      action     TEXT NOT NULL,
      entity     TEXT NOT NULL,
      entity_id  TEXT,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_audit_created ON audit_logs(created_at);

    -- 會計科目表
    CREATE TABLE accounts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      code           TEXT NOT NULL UNIQUE,
      name           TEXT NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
      category       TEXT NOT NULL,
      normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
      parent_id      INTEGER REFERENCES accounts(id),
      level          INTEGER NOT NULL DEFAULT 1,
      is_detail      INTEGER NOT NULL DEFAULT 1,  -- 1 = 明細科目，可入帳
      is_active      INTEGER NOT NULL DEFAULT 1,
      description    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_accounts_parent ON accounts(parent_id);

    -- 客戶 / 供應商
    CREATE TABLE customers (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      code               TEXT NOT NULL UNIQUE,
      name               TEXT NOT NULL,
      tax_id             TEXT,
      contact_person     TEXT,
      phone              TEXT,
      email              TEXT,
      address            TEXT,
      payment_terms_days INTEGER NOT NULL DEFAULT 30,
      credit_limit       INTEGER NOT NULL DEFAULT 0,
      is_active          INTEGER NOT NULL DEFAULT 1,
      notes              TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE vendors (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      code               TEXT NOT NULL UNIQUE,
      name               TEXT NOT NULL,
      tax_id             TEXT,
      contact_person     TEXT,
      phone              TEXT,
      email              TEXT,
      address            TEXT,
      payment_terms_days INTEGER NOT NULL DEFAULT 30,
      bank_account       TEXT,
      is_active          INTEGER NOT NULL DEFAULT 1,
      notes              TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 傳票
    CREATE TABLE vouchers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_no   TEXT NOT NULL UNIQUE,
      voucher_date TEXT NOT NULL,
      voucher_type TEXT NOT NULL CHECK (voucher_type IN ('receipt','payment','transfer')),
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
      source       TEXT NOT NULL DEFAULT 'manual',
      source_id    INTEGER,
      total_amount INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      posted_by    INTEGER REFERENCES users(id),
      posted_at    TEXT,
      voided_by    INTEGER REFERENCES users(id),
      voided_at    TEXT,
      void_reason  TEXT
    );
    CREATE INDEX idx_vouchers_date ON vouchers(voucher_date);
    CREATE INDEX idx_vouchers_status ON vouchers(status);

    CREATE TABLE voucher_lines (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id   INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      line_no      INTEGER NOT NULL,
      account_id   INTEGER NOT NULL REFERENCES accounts(id),
      description  TEXT,
      debit        INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
      credit       INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
      partner_type TEXT CHECK (partner_type IN ('customer','vendor')),
      partner_id   INTEGER
    );
    CREATE INDEX idx_voucher_lines_voucher ON voucher_lines(voucher_id);

    -- 總帳分錄（過帳後產生）
    CREATE TABLE gl_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id      INTEGER NOT NULL REFERENCES vouchers(id),
      voucher_line_id INTEGER NOT NULL REFERENCES voucher_lines(id),
      entry_date      TEXT NOT NULL,
      account_id      INTEGER NOT NULL REFERENCES accounts(id),
      debit           INTEGER NOT NULL DEFAULT 0,
      credit          INTEGER NOT NULL DEFAULT 0,
      description     TEXT,
      partner_type    TEXT,
      partner_id      INTEGER,
      posted_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_gl_account_date ON gl_entries(account_id, entry_date);
    CREATE INDEX idx_gl_date ON gl_entries(entry_date);
    CREATE INDEX idx_gl_voucher ON gl_entries(voucher_id);
    CREATE INDEX idx_gl_partner ON gl_entries(partner_type, partner_id);

    -- 商品 / 庫存
    CREATE TABLE products (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      sku              TEXT NOT NULL UNIQUE,
      name             TEXT NOT NULL,
      unit             TEXT NOT NULL DEFAULT '個',
      category         TEXT,
      sale_price       INTEGER NOT NULL DEFAULT 0,
      quantity_on_hand REAL NOT NULL DEFAULT 0,
      average_cost     REAL NOT NULL DEFAULT 0,  -- 移動加權平均單位成本（分）
      safety_stock     REAL NOT NULL DEFAULT 0,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE inventory_transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_no           TEXT NOT NULL,
      product_id       INTEGER NOT NULL REFERENCES products(id),
      txn_date         TEXT NOT NULL,
      txn_type         TEXT NOT NULL CHECK (txn_type IN ('opening','purchase','sale','adjust_in','adjust_out','purchase_void','sale_void')),
      quantity         REAL NOT NULL,          -- 入庫為正、出庫為負
      unit_cost        REAL NOT NULL,
      total_cost       INTEGER NOT NULL,       -- 入庫為正、出庫為負
      balance_qty      REAL NOT NULL,
      balance_avg_cost REAL NOT NULL,
      source_type      TEXT,
      source_id        INTEGER,
      voucher_id       INTEGER REFERENCES vouchers(id),
      description      TEXT,
      created_by       INTEGER REFERENCES users(id),
      created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_inv_product ON inventory_transactions(product_id, id);

    -- 應收帳款
    CREATE TABLE ar_invoices (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no  TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      invoice_date TEXT NOT NULL,
      due_date    TEXT NOT NULL,
      gui_no      TEXT,                      -- 統一發票號碼
      description TEXT,
      tax_rate    REAL NOT NULL DEFAULT 0.05,
      subtotal    INTEGER NOT NULL,
      tax_amount  INTEGER NOT NULL,
      total       INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','void')),
      voucher_id  INTEGER REFERENCES vouchers(id),
      created_by  INTEGER REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_ar_customer ON ar_invoices(customer_id);

    CREATE TABLE ar_invoice_lines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id  INTEGER NOT NULL REFERENCES ar_invoices(id) ON DELETE CASCADE,
      line_no     INTEGER NOT NULL,
      product_id  INTEGER REFERENCES products(id),
      account_id  INTEGER NOT NULL REFERENCES accounts(id),   -- 收入科目
      description TEXT NOT NULL,
      quantity    REAL NOT NULL,
      unit_price  INTEGER NOT NULL,
      amount      INTEGER NOT NULL
    );

    CREATE TABLE ar_receipts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no   TEXT NOT NULL UNIQUE,
      customer_id  INTEGER NOT NULL REFERENCES customers(id),
      receipt_date TEXT NOT NULL,
      account_id   INTEGER NOT NULL REFERENCES accounts(id),  -- 收款科目（現金/銀行）
      amount       INTEGER NOT NULL,
      description  TEXT,
      voucher_id   INTEGER REFERENCES vouchers(id),
      created_by   INTEGER REFERENCES users(id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE ar_receipt_allocations (
      receipt_id INTEGER NOT NULL REFERENCES ar_receipts(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL REFERENCES ar_invoices(id),
      amount     INTEGER NOT NULL,
      PRIMARY KEY (receipt_id, invoice_id)
    );

    -- 應付帳款
    CREATE TABLE ap_bills (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no     TEXT NOT NULL UNIQUE,
      vendor_id   INTEGER NOT NULL REFERENCES vendors(id),
      bill_date   TEXT NOT NULL,
      due_date    TEXT NOT NULL,
      vendor_ref  TEXT,                      -- 廠商發票號碼
      description TEXT,
      tax_rate    REAL NOT NULL DEFAULT 0.05,
      subtotal    INTEGER NOT NULL,
      tax_amount  INTEGER NOT NULL,
      total       INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','void')),
      voucher_id  INTEGER REFERENCES vouchers(id),
      created_by  INTEGER REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX idx_ap_vendor ON ap_bills(vendor_id);

    CREATE TABLE ap_bill_lines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id     INTEGER NOT NULL REFERENCES ap_bills(id) ON DELETE CASCADE,
      line_no     INTEGER NOT NULL,
      product_id  INTEGER REFERENCES products(id),
      account_id  INTEGER NOT NULL REFERENCES accounts(id),   -- 費用 / 存貨科目
      description TEXT NOT NULL,
      quantity    REAL NOT NULL,
      unit_price  INTEGER NOT NULL,
      amount      INTEGER NOT NULL
    );

    CREATE TABLE ap_payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_no   TEXT NOT NULL UNIQUE,
      vendor_id    INTEGER NOT NULL REFERENCES vendors(id),
      payment_date TEXT NOT NULL,
      account_id   INTEGER NOT NULL REFERENCES accounts(id),  -- 付款科目（現金/銀行）
      amount       INTEGER NOT NULL,
      description  TEXT,
      voucher_id   INTEGER REFERENCES vouchers(id),
      created_by   INTEGER REFERENCES users(id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE ap_payment_allocations (
      payment_id INTEGER NOT NULL REFERENCES ap_payments(id) ON DELETE CASCADE,
      bill_id    INTEGER NOT NULL REFERENCES ap_bills(id),
      amount     INTEGER NOT NULL,
      PRIMARY KEY (payment_id, bill_id)
    );

    -- 單據編號序號
    CREATE TABLE sequences (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    `,
  },
];
