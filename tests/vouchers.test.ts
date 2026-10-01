import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { setSetting } from "@/lib/services/settings";
import {
  createVoucher,
  getVoucher,
  postAllDrafts,
  postVoucher,
  unpostVoucher,
  updateVoucher,
  voidVoucher,
} from "@/lib/services/vouchers";
import { getTrialBalance, getIncomeStatement, getBalanceSheet } from "@/lib/services/reports";
import { getJournal, getSubsidiaryLedger, getGeneralLedger } from "@/lib/services/ledger";
import { ADMIN, acct, freshDb } from "./helpers";

function capital(date = "2026-01-02", amount = 100_000_00) {
  return createVoucher(
    {
      voucherDate: date,
      voucherType: "receipt",
      description: "股東出資",
      lines: [
        { accountId: acct("1103"), debit: amount, credit: 0 },
        { accountId: acct("3110"), debit: 0, credit: amount },
      ],
    },
    ADMIN,
  );
}

describe("傳票與過帳", () => {
  beforeEach(() => freshDb());

  it("拒絕借貸不平衡的傳票", () => {
    expect(() =>
      createVoucher(
        {
          voucherDate: "2026-01-02",
          voucherType: "transfer",
          lines: [
            { accountId: acct("1103"), debit: 100, credit: 0 },
            { accountId: acct("3110"), debit: 0, credit: 90 },
          ],
        },
        ADMIN,
      ),
    ).toThrow(/借貸不平衡/);
  });

  it("拒絕彙總科目入帳及單列同時借貸", () => {
    expect(() =>
      createVoucher(
        {
          voucherDate: "2026-01-02",
          voucherType: "transfer",
          lines: [
            { accountId: acct("1100"), debit: 100, credit: 0 },
            { accountId: acct("3110"), debit: 0, credit: 100 },
          ],
        },
        ADMIN,
      ),
    ).toThrow(/彙總科目/);
    expect(() =>
      createVoucher(
        {
          voucherDate: "2026-01-02",
          voucherType: "transfer",
          lines: [
            { accountId: acct("1103"), debit: 100, credit: 100 },
            { accountId: acct("3110"), debit: 0, credit: 0 },
          ],
        },
        ADMIN,
      ),
    ).toThrow(/擇一/);
  });

  it("自動過帳開啟時，儲存即寫入總帳", () => {
    const id = capital();
    expect(getVoucher(id)!.status).toBe("posted");
    const n = (getDb().prepare("SELECT COUNT(*) c FROM gl_entries WHERE voucher_id = ?").get(id) as { c: number }).c;
    expect(n).toBe(2);
    expect(getVoucher(id)!.voucher_no).toBe("20260102-0001");
  });

  it("自動過帳關閉時保留草稿，可修改後批次過帳", () => {
    setSetting("posting.auto", "0");
    const id = capital();
    expect(getVoucher(id)!.status).toBe("draft");
    updateVoucher(
      id,
      {
        voucherDate: "2026-01-03",
        voucherType: "receipt",
        lines: [
          { accountId: acct("1101"), debit: 500_00, credit: 0 },
          { accountId: acct("3110"), debit: 0, credit: 500_00 },
        ],
      },
      ADMIN,
    );
    const result = postAllDrafts(ADMIN);
    expect(result.posted).toHaveLength(1);
    expect(getVoucher(id)!.status).toBe("posted");
    expect(getVoucher(id)!.total_amount).toBe(500_00);
  });

  it("反過帳與作廢會移除總帳分錄", () => {
    const id = capital();
    unpostVoucher(id, ADMIN);
    expect(getJournal("2026-01-01", "2026-12-31")).toHaveLength(0);
    postVoucher(id, ADMIN);
    expect(getJournal("2026-01-01", "2026-12-31")).toHaveLength(2);
    voidVoucher(id, ADMIN, "輸入錯誤");
    expect(getVoucher(id)!.status).toBe("void");
    expect(getJournal("2026-01-01", "2026-12-31")).toHaveLength(0);
  });

  it("關帳日之前不得新增或過帳", () => {
    setSetting("posting.closing_date", "2026-01-31");
    expect(() => capital("2026-01-15")).toThrow(/關帳/);
    expect(() => capital("2026-02-01")).not.toThrow();
  });
});

describe("帳簿與報表", () => {
  beforeEach(() => {
    freshDb();
    capital("2025-12-01", 200_000_00);
    // 本年度：現銷 50,000、付租金 20,000
    createVoucher(
      {
        voucherDate: "2026-03-01",
        voucherType: "receipt",
        lines: [
          { accountId: acct("1103"), debit: 50_000_00, credit: 0 },
          { accountId: acct("4100"), debit: 0, credit: 50_000_00 },
        ],
      },
      ADMIN,
    );
    createVoucher(
      {
        voucherDate: "2026-03-05",
        voucherType: "payment",
        lines: [
          { accountId: acct("6202"), debit: 20_000_00, credit: 0 },
          { accountId: acct("1103"), debit: 0, credit: 20_000_00 },
        ],
      },
      ADMIN,
    );
    // 以前年度費用
    createVoucher(
      {
        voucherDate: "2025-12-20",
        voucherType: "payment",
        lines: [
          { accountId: acct("6203"), debit: 1_000_00, credit: 0 },
          { accountId: acct("1103"), debit: 0, credit: 1_000_00 },
        ],
      },
      ADMIN,
    );
  });

  it("試算表借貸平衡且上層科目為下層彙總", () => {
    const tb = getTrialBalance("2026-01-01", "2026-12-31");
    expect(tb.balanced).toBe(true);
    expect(tb.totals.debit).toBe(70_000_00);
    const bank = tb.rows.find((r) => r.account.code === "1103")!;
    expect(bank.opening).toBe(199_000_00);
    expect(bank.closing).toBe(229_000_00);
    const cashGroup = tb.rows.find((r) => r.account.code === "1100")!;
    expect(cashGroup.closing).toBe(229_000_00);
  });

  it("損益表計算本期淨利", () => {
    const is = getIncomeStatement("2026-01-01", "2026-12-31");
    expect(is.revenue.total).toBe(50_000_00);
    expect(is.operatingExpense.total).toBe(20_000_00);
    expect(is.netIncome).toBe(30_000_00);
  });

  it("資產負債表平衡（含本期損益及以前年度未結轉損益）", () => {
    const bs = getBalanceSheet("2026-12-31");
    expect(bs.totalAssets).toBe(229_000_00);
    expect(bs.balanced).toBe(true);
    const names = bs.equity.lines.map((l) => l.name);
    expect(names).toContain("本期損益");
    expect(names).toContain("累積盈虧（以前年度未結轉）");
  });

  it("分類帳計算期初與累計餘額", () => {
    const sl = getSubsidiaryLedger(acct("1103"), "2026-01-01", "2026-12-31")!;
    expect(sl.opening).toBe(199_000_00);
    expect(sl.rows.map((r) => r.balance)).toEqual([249_000_00, 229_000_00]);
    const gl = getGeneralLedger(acct("1100"), "2026-01-01", "2026-12-31")!;
    expect(gl.closing).toBe(229_000_00);
  });
});
