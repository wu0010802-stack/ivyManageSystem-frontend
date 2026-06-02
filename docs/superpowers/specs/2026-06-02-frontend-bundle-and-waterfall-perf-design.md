# 2026-06-02 前端 bundle 瘦身 + onMounted 瀑布 — Design

## 背景

2026-06-02 跨前後端效能審查中，前端 bundle 分析是**唯一不依賴資料量的真 runtime 信號**（`vite build` 實測，baseline 存於 `.scratch/fe-build-output.txt`）。三個 entry（admin / parent / public）的首屏 eager JS（gzip）實測：

- admin ~311 KB
- public ~290 KB
- parent ~709 KB

`parent`（家長端 LIFF 手機頁）與 `public`（未登入報名頁）本應輕量，卻吞下整包管理後台碼 + element-plus。根因有三，集中在 `vite.config.js` 的 `manualChunks` 與一個被破壞的 invariant。

> ⚠ `manualChunks` 是被多輪血淚調校過的雷區（每條規則都有 TDZ／cascade 註解）。本次改動必須 **三子項原子化 + 一次 rebuild diff 驗證**。

---

## 子項 A：bundle 瘦身（3 個同根因修復）

### A-F3：`api/index.ts` 的 element-plus 靜態 import 污染 admin-core

`vite.config.js:84-85` 明文要求 admin-core「EP-free」，但 `src/api/index.ts:3` `import { ElMessage } from 'element-plus'`，而 `api/index.ts` 被釘進 admin-core（`vite.config.js:92`）→ element-plus（161 KB gz）成為 admin-core 硬依賴。public 與 parent 只為共用 axios client 就 boot admin-core，連帶吞下整包 EP。

**修法**：`ElMessage` 改為錯誤路徑內動態 import：

```ts
// 只在 503 READ_ONLY_MODE 提示時用到，延遲一個 microtask 無感
const { ElMessage } = await import('element-plus')
```

**Invariant（CLAUDE.md 明訂）**：不換掉 axios wrapper、保留 dedupe / refresh / displayMessage 邏輯。本修法只延遲一個 import，不動 wrapper 邏輯。改後須驗證 `displayMessage` / `ElMessage` 在三個 entry 仍正確觸發。

**預期收益**：public 省 ~156 KB gz、parent 省 ~156 KB gz（實測為準）。

### A-F2：跨 entry 共用模組無 manualChunks 規則 → parent 靜態橋接 portal

`useFriendlyError`、`errorCodeRegistry`、`useOnlineStatus`、`useBodyLock`、`components/brand/*` 同時被 portal views 與家長端引用。Rollup 把它們分到 `portal` chunk，parent-app 為取得而靜態 import 整個 portal → cascade 拉入 fullcalendar / chart-vendor / activity-admin / qrcode（~285 KB gz）。

**修法**：把這些 **EP-free** 共用模組加進 `vite.config.js` 既有的 `shared-common` 規則（line 45-58）。

**前置驗證（plan 階段必做）**：逐一 grep 確認每個檔案無 `element-plus` import；若有 EP 引用則**不可**放 shared-common（會把 EP chunk 拉進家長 bundle，違反 line 43-44 註解）。實際納入清單以 grep 結果為準。

**預期收益**：parent 省 ~285 KB gz（實測為準）。

### A-F4：parent view collapse

`vite.config.js:124-130` 的 parent-app 規則 `id.includes('/src/parent/')` 太寬，把所有家長 view 都歸 parent-app（363 KB / 112 KB gz 單一 eager chunk），即使 `src/parent/router.ts` 29 條 route 都已 `() => import()`。

**修法**：縮窄規則排除 `/src/parent/views/`（只攔 parent 的非-views 共用碼），讓 lazy router 真正 emit per-view chunk。

**注意**：parent-app 規則同時涵蓋 `@line/liff` + `/node_modules/@liff/`（line 126-127）— 縮窄時務必保留這兩條，否則 LIFF sub-package 落到 vendor catch-all。

**預期收益**：parent 省 ~60-90 KB gz。**風險**：家長 view 間共用元件可能被複製到多個 view chunk（rebuild diff 會顯示）；若明顯則加一個 `parent-shared` chunk 去重。

### A 驗證（關鍵）

- 三子項作為**一個原子改動**，跑一次 `npm run build`。
- diff chunk 大小 / 各 entry HTML 的 `<script type=module>` vs baseline（`.scratch/fe-build-output.txt`）。
- **成功標準 = 實測 rebuild diff，不是估計數字：**
  - parent 首屏 gz 顯著下降（目標 ~270 KB，實測為準）
  - public 首屏 gz 顯著下降（目標 ~134 KB，實測為準）
  - admin 首屏不退化
  - 無新的跨 entry cascade、無 TDZ 錯誤、無共用元件過度複製
- build 後 `npm run preview` 手動 smoke：admin 登入、parent LIFF 頁、public 報名頁能正常載入；觸發一次錯誤提示驗 A-F3 的 `ElMessage`。

---

## 子項 C：onMounted 序列瀑布改 Promise.all

兩個高頻管理頁的 `onMounted` 把彼此無依賴的請求序列 await，固定多一個 round-trip 首屏延遲：

**`ClassroomView.vue:463-466`**

```ts
// before: await fetchOptions(); await fetchClassrooms();
await Promise.all([fetchOptions(), fetchClassrooms()])
```

**`StudentListPanel.vue:370-375`** — `loadClassrooms` 與 `fetchStudents` 獨立可並行；`handleRouteAction()` 可能依賴 students 已載入，**保留其序列位置**：

```ts
applyRouteContext()
await Promise.all([loadClassrooms(), fetchStudents()])
await handleRouteAction()
```

**驗證**：現有 vitest（兩頁若有測試）+ typecheck + build。correctness-preserving，不改任何資料寫入順序（兩支寫不同 ref，無 race）。

---

## 子項 D：地圖 marker 聚合（獨立 follow-up，本 spec 不含）

`RecruitmentAddressHeatmap.vue` marker 無聚合是唯一真正無上界的 render surface，但 **dev DB ~0 個 geocoded hotspot 無法本機驗證「變快」**（只能驗「接對了」），且涉及視覺語意改變需業主決策。列為獨立 follow-up track，待 A / B / C 落地 + 視覺決策後另開 spec。ship 時須標註「perf benefit 需 prod 驗證」。

---

## commit 慣例

A（bundle / vite.config）與 C（onMounted）是不同關注點，分兩個 commit。後端 B 在另一 repo 另 commit。
