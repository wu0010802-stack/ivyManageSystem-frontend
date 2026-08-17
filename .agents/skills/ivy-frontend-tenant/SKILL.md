---
name: ivy-frontend-tenant
description: "Implement tenant-aware ivy-frontend behavior safely. Use when changing tenant host resolution, local/session storage, HTTP headers, caches, platform acting-tenant state, tenant dictionaries, branding, tenant-meta, LIFF, LINE links, PWA assets, or single-tenant gray-mode behavior."
---

# Ivy 前端租戶安全

1. 讀 `AGENTS.md` 與 `CLAUDE.md` 多租戶章節，標明 Host tenant、acting tenant、entry（admin/portal/parent/public）與單租戶 fallback。
2. Host 解析只在 `src/utils/tenant.ts`；不要在 `resolveTenant.ts` 加第二份邏輯，也不要 module top-level 呼叫會 throw 的 `requireTenantSlug()`。
3. localStorage 使用 `tenantGetItem/SetItem/RemoveItem`；HTTP 使用 `tenantHeaders()`；Cache API 使用 `tenantCacheName()` 並維護 logout cache list。
4. Platform acting tenant 只走 `tenant_id` 與 `setActingTenant()`；cache key 用 `platformCacheKey()`/等價雙層 key，禁止 acting header。
5. 品牌、文案、LIFF、LINE OA 優先 tenant-meta/既有 branding pipeline，不寫死義華或把 env fallback 升格成權威。
6. 維持灰度不變式：tenant env 未設時 storage key 不加前綴、不送 header、不掛 boot 遮罩。
7. 跑 tenant、tenantStorage、tenantBoot、cache/platform、branding/LIFF targeted tests，再跑 typecheck/lint；跨端變更交 reviewer。
8. 不讀/改真實 parent localStorage、token、prod tenant 設定，不 push/deploy。交付列多租戶與單租戶兩種測試結果。
