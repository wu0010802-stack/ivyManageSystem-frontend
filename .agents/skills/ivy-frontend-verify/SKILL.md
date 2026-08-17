---
name: ivy-frontend-verify
description: "Verify ivy-frontend changes with the smallest sufficient gate set. Use after Vue, TypeScript, API, composable, store, router, parent, public, platform, tenant, styling, Vite, or asset changes, and before claiming completion. Select targeted Vitest plus typecheck, lint, token, accessibility, parent, OpenAPI, shared-constant, and build checks based on the diff."
---

# Ivy 前端驗證

1. 看 `git status --short --branch` 與本次 diff，分成 logic/component、parent、API/OpenAPI、permission/tenant、CSS/token/a11y、Vite/build。
2. 先跑會直接證明變更的 targeted Vitest；記錄 collected/passed/failed。0 tests、timeout 或工具錯誤標 `UNVERIFIED`。
3. 所有業務碼變更跑 `npm run typecheck` 與 `npm run lint`。
4. 家長端 markup/class/prop 跑 `npm run test -- --run src/parent tests/unit/parent tests/parent`；相關時加 `npm run lint:tokens`、`npm run parent:audit`、`npm run check:a11y`。
5. Permission/tenant/shared constants 跑對應 guard 與 `npm run check:shared-constants`；API contract 使用 `$ivy-openapi-sync`。
6. Vite/config/assets/chunk 變更加 `npm run build`；知道 build 會重建 dist 並刪 source maps。
7. 不用 `--update`、放寬斷言、ignore 或重產 baseline 消除紅燈，除非行為變更已批准且 diff 已 review。
8. 輸出 PASS/FAIL/UNVERIFIED 表格，列每個 gate、結果與未跑原因。不要 commit/push/deploy。
