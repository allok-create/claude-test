import { cents, int, bool, str } from "@/lib/action";
import { AppError } from "@/lib/utils/errors";
import type { PartnerInput, PartnerKind } from "@/lib/services/partners";

/** 由表單讀取客戶／供應商主檔欄位（客戶與供應商共用） */
export function readPartnerInput(kind: PartnerKind, fd: FormData): PartnerInput {
  const input: PartnerInput = {
    code: str(fd, "code"),
    name: str(fd, "name"),
    taxId: str(fd, "taxId") || null,
    contactPerson: str(fd, "contactPerson") || null,
    phone: str(fd, "phone") || null,
    email: str(fd, "email") || null,
    address: str(fd, "address") || null,
    paymentTermsDays: int(fd, "paymentTermsDays"),
    isActive: bool(fd, "isActive"),
    notes: str(fd, "notes") || null,
  };
  if (kind === "customer") {
    const limit = cents(fd, "creditLimit");
    if (Number.isNaN(limit) || limit < 0) throw new AppError("信用額度格式不正確");
    input.creditLimit = limit;
  } else {
    input.bankAccount = str(fd, "bankAccount") || null;
  }
  return input;
}
