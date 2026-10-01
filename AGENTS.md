<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 專案說明（企業會計記帳系統）

- 所有會計規則集中於 `src/lib/services/*`；頁面與 Server Action 不直接撰寫會計邏輯。
- 金額以「分」整數儲存與運算；顯示用 `formatMoney`，輸入用 `toCents`。
- Server Action 一律使用 `runAction(async () => { const user = await authorize("perm"); ... })`。
- 頁面使用 `await requirePermission("perm")`；權限定義於 `src/lib/auth/permissions.ts`。
- 介面文字一律使用繁體中文（台灣用語）。
- 驗證：`npm run typecheck && npm test`。
