/**
 * 營業稅媒體申報代碼（依「營業稅電子資料申報繳稅作業要點」營業人進、銷項資料檔格式）
 * 此檔不依賴資料庫，可於伺服器與用戶端共用。
 */

export type TaxType = "1" | "2" | "3";
export const TAX_TYPES: { value: TaxType; label: string; rate: number }[] = [
  { value: "1", label: "應稅 5%", rate: 0.05 },
  { value: "2", label: "零稅率", rate: 0 },
  { value: "3", label: "免稅", rate: 0 },
];
export const TAX_TYPE_LABELS: Record<string, string> = { "1": "應稅", "2": "零稅率", "3": "免稅", F: "作廢" };

export function taxRateOf(taxType: TaxType): number {
  return taxType === "1" ? 0.05 : 0;
}

/** 銷項憑證格式代號 */
export const AR_INVOICE_FORMATS = [
  { value: "35", label: "35 三聯式收銀機發票／電子發票" },
  { value: "31", label: "31 三聯式／電子計算機發票" },
  { value: "32", label: "32 二聯式／二聯式收銀機發票" },
] as const;

/** 進項憑證格式代號（none：無稅額憑證，如收據，不列入申報） */
export const AP_INVOICE_FORMATS = [
  { value: "25", label: "25 三聯式收銀機發票／電子發票／公用事業憑證" },
  { value: "21", label: "21 三聯式／電子計算機發票" },
  { value: "22", label: "22 二聯式收銀機發票／載有稅額之其他憑證" },
  { value: "28", label: "28 海關代徵營業稅繳納證" },
  { value: "none", label: "不申報（收據等無稅額憑證）" },
] as const;

export type ArInvoiceFormat = (typeof AR_INVOICE_FORMATS)[number]["value"];
export type ApInvoiceFormat = (typeof AP_INVOICE_FORMATS)[number]["value"];

export function formatLabel(code: string): string {
  return [...AR_INVOICE_FORMATS, ...AP_INVOICE_FORMATS].find((f) => f.value === code)?.label ?? code;
}

/** 進項扣抵代號 */
export type DeductionCode = "1" | "2" | "3" | "4";
export const DEDUCTION_CODES: { value: DeductionCode; label: string }[] = [
  { value: "1", label: "1 可扣抵之進貨及費用" },
  { value: "2", label: "2 可扣抵之固定資產" },
  { value: "3", label: "3 不得扣抵之進貨及費用" },
  { value: "4", label: "4 不得扣抵之固定資產" },
];
export function isDeductible(code: string): boolean {
  return code === "1" || code === "2";
}

/** 零稅率通關方式註記 */
export const CUSTOMS_MARKS = [
  { value: "1", label: "1 非經海關出口（應附證明文件）" },
  { value: "2", label: "2 經海關出口（免附證明文件）" },
] as const;

/** 折讓單格式代號：依原發票格式決定 */
export function allowanceFormatFor(invoiceFormat: string): string | null {
  switch (invoiceFormat) {
    case "31":
    case "35":
      return "33";
    case "32":
      return "34";
    case "21":
    case "25":
      return "23";
    case "22":
      return "24";
    default:
      return null;
  }
}

/** 統一發票號碼：2 碼英文字軌 + 8 碼數字 */
export const GUI_PATTERN = /^[A-Z]{2}\d{8}$/;
