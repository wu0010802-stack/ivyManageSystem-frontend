# RWD 優化 — P0 地基：斷點 token 統一 + isMobile 收斂

- **日期**：2026-06-26
- **狀態**：設計待審
- **範圍**：本 spec 僅涵蓋 **P0 地基**。屬於更大的「全系統 RWD 翻修」第一階段（推進方式 A 橫切式：P0 地基 → P1 實機稽核 → P2 修壞點 → P3 品質掃除）。後三階段各自獨立成 spec。

---

## 1. 背景與問題

系統分四個面向（Admin 後台 / 教師 Portal / 家長端 LIFF / 公開報名頁），RWD 已有相當基礎（全專案 114 個 `@media`），但**斷點散亂、各做各的**，是後續所有面向修復的共病。具體：

### 1.1 CSS 側：真實的 off-by-one
- `@media (max-width: 767px)`：21 處
- `@media (max-width: 768px)`：19 處

兩者邊界**不同**：`max-width: 768px` 在恰好 768px 時 match（768 被當手機），`max-width: 767px` 不 match（768 被當桌機）。同一個「手機/桌機」概念在不同檔案落在不同邊界，是實際的不一致。其餘細點（900×9、600×9、640×7、560×6、420×8、1000×5…）為 ad-hoc，無統一來源。

### 1.2 JS 側：同一段邏輯手刻 7 份（DRY 破裂）
已有 `src/composables/useIsMobile.ts`（查 `(max-width: 767px)`），但只有 4 個頁面在用。其餘地方各自手刻 `isMobile`：

| 檔案 | 現況寫法 |
|---|---|
| `src/layouts/AdminLayout.vue:47` | `window.innerWidth < 768` |
| `src/layouts/PortalLayout.vue:45` | `window.innerWidth < 768` |
| `src/views/portal/PortalProfileView.vue:16-17` | `window.innerWidth < 768` |
| `src/views/portal/PortalSalaryView.vue:21-22` | `window.innerWidth < 768` |
| `src/views/portal/PortalAttendanceView.vue:50-52` | `window.innerWidth < 768` |
| `src/components/classroom/ClassroomStudentDrawer.vue:160-161` | `window.innerWidth < 768` |
| `src/views/portal/PortalScheduleView.vue:219` | `matchMedia('(max-width: 767px)')` |

> 註：`innerWidth < 768` 與 `matchMedia('(max-width: 767px)')` 對整數寬度**等價**（皆 ≤767 = 手機），故 JS 側目前**無 1px bug**；真正的問題是同一邏輯被複製 8+ 份 + 各自掛 resize listener，漂移風險高、維護成本高。

### 1.3 不在本階段處理（明確排除）
- 純偏好查詢：`prefers-reduced-motion`、`prefers-color-scheme`（家長端 theme）——非斷點，不動。
- 佈局計算用的 `innerWidth`：`CoursePickerSection.vue`（popover 定位）、`ClassHubMessagesDrawer.vue`（responsive 寬度計算）——非 boolean 斷點旗標，不動。
- 細點 `@media`（600/640/900/1000/420…）——P0 不一次 sweep，留待 P2/P3 碰到各檔時個案收斂。
- 視覺外觀：**P0 純地基，畫面應零變化**（除 1.4 提到的 768px 邊界 1px 對齊）。

---

## 2. 目標

1. 建立**單一斷點來源**（JS + CSS 各一份、由 guard 測試強制數值一致）。
2. 消除 1.1 的 CSS off-by-one（768 邊界統一）。
3. 收斂 1.2 的 8+ 份手刻 `isMobile` 至 `useIsMobile()`。
4. 提供 P2/P3 收斂用機制（PostCSS custom-media），但**不**在 P0 強制全量遷移。

非目標：不轉 SCSS、不改 Element Plus、不做視覺重設計。

---

## 3. Canonical 斷點集

對齊 Element Plus（本專案 UI lib）的斷點，避免與 EP 自身 responsive 工具打架：

| token | min-width | 語意 |
|---|---|---|
| `xs` | 480px | 小手機 |
| `sm` | 768px | 手機 ↔ 平板（**主要邊界**，`useIsMobile` 用這條）|
| `md` | 1024px | 平板 ↔ 桌機 |
| `lg` | 1200px | 寬桌機 |

**手機判定統一為 `< 768px`（即 `max-width: 767.98px`）** — 768 視為非手機，與 JS 側 `innerWidth < 768` 對齊。1.1 中 19 個用 `max-width: 768px` 的檔案，邊界會在恰好 768px 處位移 1px（768px 由「手機」變「非手機」），視覺影響可忽略，換得 JS/CSS 邊界一致。

> `xs`/`md`/`lg` 在 P0 僅**定義**好供 P2/P3 使用；P0 只主動遷移 `sm`（768）這條主要邊界。900/1000 等是否併入 `md` 屬會改變佈局的決定，留 P2/P3 個案處理。

---

## 4. 設計

### 4.1 JS 單一來源 — `src/constants/breakpoints.ts`
```ts
// Canonical RWD 斷點（與 src/assets/breakpoints.media.css 數值同步，
// 由 __tests__/breakpoints.spec.ts guard 強制一致）。
export const BREAKPOINTS = { xs: 480, sm: 768, md: 1024, lg: 1200 } as const
export type BreakpointKey = keyof typeof BREAKPOINTS

/** 手機上界（含）：< sm。matchMedia 用 767.98 避開整數邊界落點歧義。 */
export const MOBILE_MAX_PX = BREAKPOINTS.sm - 0.02 // 767.98
```
由 `src/constants/index.ts` barrel re-export（沿用既有慣例）。

### 4.2 `useIsMobile.ts` 改用常數
- query 從寫死的 `'(max-width: 767px)'` 改為 `` `(max-width: ${MOBILE_MAX_PX}px)` ``。
- 行為不變（767.98 與 767 對整數寬度同結果），但邊界值來自單一來源。
- 既有 4 個 user 不需改。

### 4.3 收斂手刻 isMobile → `useIsMobile()`
1.2 表中 7 個檔案（+ 既有重複者）改成：
```ts
const { isMobile } = useIsMobile()
```
移除各自的 `ref` + `checkMobile` + `resize` listener + `onMounted/onUnmounted` 樣板。

**注意 AdminLayout 的副作用**：`checkMobile` 內含 `if (!isMobile.value) sidebarOpen.value = false`（桌機時關手機側欄）。收斂後改用 `watch(isMobile, m => { if (!m) sidebarOpen.value = false })` 保留此行為。`PortalLayout` 若有類似副作用同樣處理。逐檔確認 `isMobile` 以外無其他 resize 相依邏輯被一併移除。

### 4.4 CSS 單一來源 + PostCSS custom-media
**新增** `src/assets/breakpoints.media.css`（custom-media 定義；不含任何規則）：
```css
/* min-width anchors（與 breakpoints.ts 同步）*/
@custom-media --bp-xs (min-width: 480px);
@custom-media --bp-sm (min-width: 768px);
@custom-media --bp-md (min-width: 1024px);
@custom-media --bp-lg (min-width: 1200px);
/* max-width（desktop-first override，多數既有 @media 對應這組）*/
@custom-media --to-sm (max-width: 767.98px);   /* 手機 */
@custom-media --to-md (max-width: 1023.98px);
@custom-media --to-lg (max-width: 1199.98px);
```

**建置接線**（新增 `postcss.config.mjs`，目前無 postcss config）：
```js
import postcssGlobalData from '@csstools/postcss-global-data'
import postcssCustomMedia from 'postcss-custom-media'

export default {
  plugins: [
    postcssGlobalData({ files: ['src/assets/breakpoints.media.css'] }),
    postcssCustomMedia(),
  ],
}
```
- `@csstools/postcss-global-data`：把 custom-media 定義注入**每個** SFC `<style scoped>` 編譯單元（否則各 SFC 獨立編譯看不到定義）。
- `postcss-custom-media`：把 `@media (--to-sm)` 解析回 `@media (max-width: 767.98px)`。
- 對 Element Plus 的 node_modules CSS 為 no-op（EP 用裸 px，無 `@media (--name)` 模式）。
- 新增兩個 devDependency；CI 既有 build/typecheck 流程不變。

### 4.5 P0 的 CSS 遷移範圍（僅 sm 邊界）
把 1.1 的 **40 個** `@media (max-width: 767px)` / `@media (max-width: 768px)` 改寫為 `@media (--to-sm)`。其餘細點 `@media` 不動。`PortalScheduleView.vue:219` 與 `CalendarBoard.vue:35`（matchMedia 640）：前者 767 → 收斂進 `useIsMobile`；後者 640 是 distinct 細點，P0 不動（留 P2/P3）。

---

## 5. 測試

1. **`breakpoints.ts` 常數測試**：斷言四個值 + `MOBILE_MAX_PX = 767.98`。
2. **drift guard**：讀 `breakpoints.media.css` 解析 `--bp-*` 數值，與 `breakpoints.ts` 比對，不一致即 fail（強制兩檔同步 = 單一邏輯來源）。
3. **`useIsMobile` 測試**：已有 spec，補一條斷言 query 由常數導出（mock `matchMedia`，驗 true/false 切換）。
4. **AdminLayout / PortalLayout**：保留既有 resize → sidebar 行為測試（收斂後仍綠）；補「桌機時自動關側欄」斷言。
5. **回歸**：`npm run test`（注意家長端三測試樹，但本階段不動家長元件 markup）+ `npm run type-check` + `npm run build`（驗 postcss 接線不爆）。
6. **新增 JS-side guard**（lint 或測試）：禁止 `src/` 再出現裸 `window.innerWidth < 768` / `matchMedia('(max-width: 767px)')` 之類魔術數字（CoursePicker/ClassHub 的佈局計算用法 allowlist 排除）。形式：簡單的 grep 型測試，掃描 src 命中即 fail，附 allowlist。

---

## 6. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 加 postcss-custom-media 影響全 CSS 編譯 | plugin 成熟（@csstools 官方）；只轉 `@media (--name)` pattern，裸 px 不動；build 測試把關 |
| global-data 未注入某些編譯單元 → `@media (--to-sm)` 沒被解析、漏成無效 query | build 後 grep dist CSS 確認無殘留 `(--to-` 字串；CI build 階段即現形 |
| 768 邊界 1px 位移造成非預期佈局變化 | 影響僅恰好 768px 視窗寬；P1 實機稽核會在 768px 截圖驗證 |
| 收斂 isMobile 時誤刪 resize 相依的其他邏輯 | §4.3 要求逐檔確認；測試保留各 layout 既有行為斷言 |
| guard 測試誤擋合法用法（佈局計算） | allowlist 明列 CoursePickerSection / ClassHubMessagesDrawer |

---

## 7. 交付定義（DoD）

- `breakpoints.ts` + `breakpoints.media.css` + `postcss.config.mjs` 落地，drift guard 綠。
- 7 個手刻 isMobile 收斂至 `useIsMobile()`，layout 行為測試綠。
- 40 個 sm 邊界 `@media` 改用 `@media (--to-sm)`，`npm run build` 綠、dist 無殘留 `(--to-` token。
- `npm run test` / `type-check` / `build` 全綠。
- 視覺零變化（除 768px 邊界 1px 對齊）。
- commit 分開、Conventional Commits、繁中訊息。

---

## 8. 後續階段（本 spec 不含，僅備忘）

- **P1 實機稽核（report-only）**：dev server + Playwright/chrome MCP，在 480/768/1024px 對各面向關鍵頁截圖，產分級壞點清單。
- **P2 修壞點**：依 P1 清單，家長端/公開頁優先 → Portal → Admin。
- **P3 品質掃除**：觸控目標 ≥44px、間距、字型縮放、平板 768–1024 中間帶；順手把細點 `@media`（600/640/900…）收斂到 canonical token。
