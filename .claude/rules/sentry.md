---
paths:
  - "src/utils/sentry.ts"
  - "tests/unit/utils/sentry*"
  - "vite.config.js"
  - "src/api/index.ts"
  - "src/main.ts"
  - "src/parent/main.ts"
  - "src/public/main.ts"
---

# 錯誤監控（Sentry）

> 自 CLAUDE.md 拆出（2026-09-03，path-scoped rule）：在本 repo 內開 session 且碰到 `paths` 內檔案時自動載入；從 workspace session（add-dir 不觸發 path rule）或 Codex（不讀 .claude/rules）動這些檔前請先讀本檔。

## 錯誤監控（Sentry）

`src/utils/sentry.ts` 提供 `initSentry(app, { entry })` 與 `captureException(err, context)`。

- **啟用條件**：`VITE_SENTRY_DSN` 設定才生效；缺值時整支模組 no-op，三 entry boot 不受影響
- **三 entry 都接上**：`src/main.ts`（admin）/ `src/parent/main.ts` / `src/public/main.ts`；每個 entry 用 `entry: 'admin'|'parent'|'public'` tag 區分
- **axios 攔截器**：`src/api/index.ts` 對 `>=500` 與 network error 顯式上報；4xx（401/403/404/422 等）視為預期路徑由 UI errorHandler 處理，**不**送 Sentry
- **PII 過濾**：55（現值，見 `PII_KEY_SUBSTRINGS`）欄位 denylist + URL path id sanitize + **query string PII 遮罩**（`?phone=0912 / ?email=x / ?id_number=A1` 等 value 自動 `[Filtered]`）+ **`event.user.id` FNV-1a hash**（擬個資去識別）；與後端 `_PII_KEY_SUBSTRINGS` 對齊。新增欄位同步前後端與測試（`tests/unit/utils/sentry.test.js`），backend 的 `tests/test_pii_denylist_parity.py` 在 CI enforce parity（讀前端 `sentry.ts` 比對 denylist + exempt list）
- **`captureException` 內部 cache `_SentryRef`**：避免每次呼叫重複 dynamic import；init 前呼叫 → no-op（不再讀 env，純看 ref 是否存在）
- **axios 攔截器使用 `sanitizeUrl(error.config?.url)` 才送 Sentry extra**：path id 去識別 + query PII 遮罩；不要直接送原始 url
- **source map**：vite build 預設不產 .map（避免外洩程式結構）；需要 source map 給 Sentry 解 stack 時，在 build env 設 `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`，plugin 會用 `sourcemap: 'hidden'` 產 map → 上傳 Sentry → 從 dist 刪除。**`postbuild` npm script 額外 `find dist -name '*.map' -delete` 兜底**，即便 Sentry upload 失敗 .map 也不會留在 dist 進 CDN
- **`sentryVitePlugin` 排在 plugins array 最末**（VitePWA 之後），避免 SW precache manifest 把 .map 收進去
- **不要在元件 catch 內手動呼叫 `captureException`**：Vue errorHandler / global onerror / unhandledrejection 已被 SDK 自動 hook；axios 攔截器也已涵蓋。重複手動上報會雙報炸 quota
