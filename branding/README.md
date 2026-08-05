# 多租戶品牌（前端）

品牌值分三層注入，各走各的機制。**改東西前先確認你要改的是哪一層**，改錯層不會報錯，只會沒生效。

| 層 | 讀者 | 內容 | 事實來源 | 生效方式 |
|---|---|---|---|---|
| **L1** | LINE/FB 爬蟲（不執行 JS）、瀏覽器安裝 PWA 時 | 三個 HTML 的 `<title>` / `theme-color` / og 整組、三份 `*.webmanifest` | `branding/tenants.json` | nginx `sub_filter` 依 `$host` 逐請求替換 `{{TB_*}}` token |
| **L2** | 執行中的 SPA | 側欄標題、頁尾機構名、聯絡資訊、分享文案、招生地圖圖例… | 後端 `GET /api/public/tenant-meta`（DB） | `useTenantBranding()`；API 缺欄逐欄退回 `BRANDING_DEFAULTS` |
| **L3** | `<img>` / manifest icons / og:image | logo、海報、PWA icon | `public/brand/<slug>/` 覆蓋檔 | nginx `try_files /brand/$tb_slug$uri $uri`，**URL 不變** |

## 新租戶 onboarding（前端這半邊）

1. **`branding/tenants.json` 加一個條目**
   - `slug` 必須等於後端 `tenants.slug`，且 `tokens.TB_SLUG` 必須等於 `slug`（腳本會擋）
   - `hosts` 列出這間園所所有對外 host。**這同時是未知 host 守衛的白名單**——沒列到的 host 在
     `TENANT_HOST_GUARD=on` 時整站回 404
   - `tokens` 必須**每一個 key 都填**（缺一個就 fail build）。刻意不做「缺值退 default」：
     退 default = 這間園所的 og 卡片印別間園所的名字，比 build 失敗糟得多
2. **（選用）`public/brand/<slug>/` 放覆蓋的品牌圖**，鏡射要換掉的檔名即可，缺檔自動 fallback 預設檔：
   ```
   public/brand/sunshine/LOGO.png
   public/brand/sunshine/images/activity-poster.jpg
   ```
   可覆蓋的完整清單見 `nginx.conf.template` 內的 overlay `location` 正則。
   default tenant（yihua）**不建目錄**，直接吃 `public/` 下的預設檔。
3. **後端補 DB 品牌值**（L2）：`system_configs` 的 `brand.*` key 與 `tenants` 的欄位，
   見 `03-final/frontend-brand-build.md` §5 的 key 目錄。
4. **重佈前端**（L1 走 nginx conf，需要重新 build image 才生效）。
5. **跑煙霧測試**：
   ```bash
   node scripts/check-brand-tokens.mjs --base 'https://{host}' --expect-host-guard
   ```

## 常見陷阱

- **換海報但 LINE 還是舊圖**：LINE 圖片 CDN 按整串網址快取且無官方清快取工具。
  改該租戶的 `TB_OG_POSTER_V`（改成當天日期）才會換。
- **改了 tenants.json 但已安裝的 PWA 沒更新**：`brand-version.json` 的 hash 會跟著變並觸發
  SW 更新——前提是**重新 build 過**（它由 `npm run prebuild` 產生）。
- **iOS 已安裝的 PWA 主畫面名字改不掉**：平台限制，manifest 不會被重讀。
  請家長重新加入主畫面。品牌定稿盡量在 onboarding 前完成。
- **不要加 `gzip_static`**：`sub_filter` 無法處理已壓縮的 body，token 會原樣外洩到使用者畫面。
- **平台健康檢查的 host 沒列進 tenants.json** → 開 `TENANT_HOST_GUARD=on` 後部署被自己擋掉。

## 本機／無 nginx 環境

`vite dev` 由 `vite.config.js` 的 brand-tokens plugin 用 default 條目替換（**只有 dev server 生效**）。
跑 `dist` 但前面沒有 nginx（`vite preview`、後端 Playwright E2E、任何靜態伺服器）必須先跑：

```bash
node scripts/apply-brand-tokens.mjs        # 就地把 dist 的 token 換成 default 租戶的值
```

`npm run preview` 已經幫你串好。dev 下 `?tenant=` 只影響 L2/API，**L1 一律 default**——
L1 的驗收一律走部署環境。
