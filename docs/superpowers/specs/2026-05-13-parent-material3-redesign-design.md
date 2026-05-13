# 家長端 Material 3 全面重寫

**Spec 日期**：2026-05-13
**Repo**：ivy-frontend
**Branch 規劃**：`feat/parent-m3-phase-{0..5}-frontend`（單一 repo，多 phase）
**目標**：將家長端 LIFF app（27 view、~20 業務元件）完整改寫為 Google Material 3 (Material You) 設計語言。
**用戶選擇**：Level C 完整 M3 重寫 + Roboto + Noto Sans TC。

---

## 1. 設計總目標

把目前「IvyKids Family OS（Soft UI Evolution + Sky-tinted claymorphism + 童彩 6 色）」全面改造成 **Material 3 行動端**：

- **品牌 source color**：保留 `#0d9053`（IvyKids 深綠）作為 M3 source color，自此生成 primary / secondary / tertiary / neutral 完整 tonal palette。
- **拿掉**：童彩 6 色 tile (`--ivy-tile-*`)、Sky-tinted claymorphism 陰影、Outfit/Quicksand/Patrick Hand 字體、cream 奶油黃底色、`pt-elev-1~3` 自製陰影 token。
- **替換**：M3 tonal palette、M3 elevation level 0–5、Roboto + Noto Sans TC、`surface-container-*` tonal surface、Material motion easing。

非目標（**out of scope**）：
- 不動 admin / teacher portal（只動 `src/parent/`）。
- 不動 backend / API（純前端設計改造）。
- 不動 LIFF 整合、Vue Router 結構、auth store、業務邏輯。

---

## 2. 整體架構

### 2.1 分階段策略

分 6 個 phase，每個 phase 一個獨立分支與 PR。前一個 phase 必須先 merge 才能進下一個（避免 token 與元件互相 race condition）。

| Phase | 範圍 | 預估 commit 數 | 風險 |
|-------|------|---------------|------|
| **P0** Token 基建 | M3 color/typography/elevation/motion token；字體切換；Material Symbols 載入；globals.css 清理 | 3–5 | LOW |
| **P1** 核心元件 | `M3Button` `M3Card` `M3IconButton` `M3List` `M3ListItem` `M3Chip` `M3Divider` | 4–6 | LOW |
| **P2** 導航元件 | `M3NavigationBar`（取代 tab-bar）、`M3TopAppBar`（取代 AppHeader）、`M3FAB` | 3–4 | MID（會影響全部 view 視覺） |
| **P3** 互動元件 | `M3Dialog`、`M3BottomSheet`（refactor `ParentBottomSheet`）、`M3Snackbar`、`M3TextField`、`M3SegmentedButton`、`M3Switch/Checkbox/Radio` | 4–6 | MID（`ParentBottomSheet` 被 7 處使用） |
| **P4** View 改寫 | 27 view 全套 M3 重寫，再拆 4 個子 PR：① 首頁群（4） ② 訊息/家校群（6） ③ 子女檔案群（6） ④ 申請/我的/收費群（11） | 14–18（含 4 sub-PR） | HIGH |
| **P5** Motion + polish | Material motion（emphasized easing、container transform）、route transition、reduced motion 兼容、視覺檢查 pass | 2–3 | LOW |

**總計**：估 28–40 commits、6 PR（其中 P4 拆 4 sub-PR）、估 2–4 週工時（取決於每日投入時間）。

### 2.2 依賴圖

```
P0 ─→ P1 ─→ P2 ─→ P3 ─→ P4 ─→ P5
                            ├─ P4.1 首頁群
                            ├─ P4.2 訊息/家校群
                            ├─ P4.3 子女檔案群
                            └─ P4.4 申請/我的群
```

P4 內部 4 個 sub-PR 可並行（不同 view 互不相依）。

---

## 3. Phase 0：Token 基建

### 3.1 M3 Color Tokens

從 `#0d9053` 用 Material Theme Builder 算法生成（本地產表，不引入 runtime dep）：

```css
/* M3 Source Color: #0d9053 (IvyKids deep green) */

/* === Primary（主行動） === */
--m3-primary:                #006e3f;   /* primary 40 light / 80 dark */
--m3-on-primary:             #ffffff;
--m3-primary-container:      #98f7be;
--m3-on-primary-container:   #002111;

/* === Secondary（輔助 / chip） === */
--m3-secondary:              #506352;
--m3-on-secondary:           #ffffff;
--m3-secondary-container:    #d3e8d3;
--m3-on-secondary-container: #0e1f12;

/* === Tertiary（強調 / FAB / 童彩取代） === */
--m3-tertiary:               #3a6571;
--m3-on-tertiary:            #ffffff;
--m3-tertiary-container:     #beeaf8;
--m3-on-tertiary-container:  #001f27;

/* === Error === */
--m3-error:                  #ba1a1a;
--m3-on-error:               #ffffff;
--m3-error-container:        #ffdad6;
--m3-on-error-container:     #410002;

/* === Surface tonal hierarchy（取代白卡 + sky-tint） === */
--m3-background:             #f7fbf3;
--m3-on-background:          #181d18;
--m3-surface:                #f7fbf3;
--m3-on-surface:             #181d18;
--m3-surface-variant:        #dee5da;
--m3-on-surface-variant:     #424941;
--m3-surface-container-lowest: #ffffff;
--m3-surface-container-low:  #f1f5ee;
--m3-surface-container:      #ebefe8;
--m3-surface-container-high: #e5eae2;
--m3-surface-container-highest: #e0e4dc;

/* === Outline === */
--m3-outline:                #727970;
--m3-outline-variant:        #c2c9be;

/* === State layer alpha === */
--m3-state-hover:            0.08;
--m3-state-focus:            0.12;
--m3-state-pressed:          0.12;
--m3-state-dragged:          0.16;
```

Dark mode：完整對應 dark palette（Material Theme Builder 同時產出，這裡略）。

**Hex 數值需由實作者用 Material Theme Builder 或 `@material/material-color-utilities` npm package 從 `#0d9053` 重新生成後**寫入 spec。本文檔列出的 hex 為示意值（典型 M3 中性深綠 tonal palette）。

### 3.2 字體切換

```css
--m3-font-display: 'Roboto', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'PingFang TC', sans-serif;
--m3-font-body:    'Roboto', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'PingFang TC', sans-serif;
/* Roboto 與 Noto Sans TC 都用同一 stack —— M3 不分 display/body 字族 */
```

字體載入：`index.html` `<link>` Google Fonts CSS2 API，subset 限定 latin + chinese-traditional，weight 400/500/700。preload + `font-display: swap`。

**Type scale**（精確對齊 M3 spec）：

| Role | Size | Weight | Line height | Letter spacing |
|------|------|--------|-------------|----------------|
| display-large | 57px | 400 | 64 | -0.25 |
| display-medium | 45px | 400 | 52 | 0 |
| display-small | 36px | 400 | 44 | 0 |
| headline-large | 32px | 400 | 40 | 0 |
| headline-medium | 28px | 400 | 36 | 0 |
| headline-small | 24px | 400 | 32 | 0 |
| title-large | 22px | 400 | 28 | 0 |
| title-medium | 16px | 500 | 24 | 0.15 |
| title-small | 14px | 500 | 20 | 0.1 |
| label-large | 14px | 500 | 20 | 0.1 |
| label-medium | 12px | 500 | 16 | 0.5 |
| label-small | 11px | 500 | 16 | 0.5 |
| body-large | 16px | 400 | 24 | 0.5 |
| body-medium | 14px | 400 | 20 | 0.25 |
| body-small | 12px | 400 | 16 | 0.4 |

對應 CSS class：`.m3-display-large` ... `.m3-body-small`（共 15 個 utility class，放 `parent/styles/typography.css`）。

### 3.3 Elevation

```css
/* M3 elevation level 0-5；用 dual-layer shadow */
--m3-elev-0: none;
--m3-elev-1:
  0px 1px 2px 0px rgba(0, 0, 0, 0.30),
  0px 1px 3px 1px rgba(0, 0, 0, 0.15);
--m3-elev-2:
  0px 1px 2px 0px rgba(0, 0, 0, 0.30),
  0px 2px 6px 2px rgba(0, 0, 0, 0.15);
--m3-elev-3:
  0px 1px 3px 0px rgba(0, 0, 0, 0.30),
  0px 4px 8px 3px rgba(0, 0, 0, 0.15);
--m3-elev-4:
  0px 2px 3px 0px rgba(0, 0, 0, 0.30),
  0px 6px 10px 4px rgba(0, 0, 0, 0.15);
--m3-elev-5:
  0px 4px 4px 0px rgba(0, 0, 0, 0.30),
  0px 8px 12px 6px rgba(0, 0, 0, 0.15);
```

### 3.4 Material Motion

```css
/* Easing curves */
--m3-easing-standard:        cubic-bezier(0.2, 0, 0, 1);
--m3-easing-standard-accel:  cubic-bezier(0.3, 0, 1, 1);
--m3-easing-standard-decel:  cubic-bezier(0, 0, 0, 1);
--m3-easing-emphasized:      cubic-bezier(0.2, 0, 0, 1);   /* compound; 預設 fallback */
--m3-easing-emphasized-accel:cubic-bezier(0.3, 0, 0.8, 0.15);
--m3-easing-emphasized-decel:cubic-bezier(0.05, 0.7, 0.1, 1);

/* Duration */
--m3-dur-short-1:    50ms;
--m3-dur-short-2:    100ms;
--m3-dur-short-3:    150ms;
--m3-dur-short-4:    200ms;
--m3-dur-medium-1:   250ms;
--m3-dur-medium-2:   300ms;
--m3-dur-medium-3:   350ms;
--m3-dur-medium-4:   400ms;
--m3-dur-long-1:     450ms;
--m3-dur-long-2:     500ms;
```

### 3.5 Material Symbols

於 `index.html` 載入：

```html
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=block" />
```

新增元件 `M3Icon.vue`：

```vue
<template>
  <span class="material-symbols-rounded m3-icon" :style="iconStyle">{{ name }}</span>
</template>
```

`ParentIcon.vue` **保留但 deprecated**：P4 結束後若無 view 使用即可刪。新 view 一律用 `M3Icon`。

### 3.6 P0 檔案清單

- `src/parent/styles/m3-tokens.css`（新增）— M3 color/elevation/motion tokens
- `src/parent/styles/typography.css`（新增）— type scale utility class
- `src/parent/styles/state-layer.css`（新增）— state layer overlay mixin
- `src/parent/styles/globals.css`（**改寫**）— 拿掉 IvyKids/sky/sun/coral/leaf/grape/cream tokens、童彩 tile、Sunny Skyline 漸層；保留 reset / focus-visible / reduced-motion / sr-only
- `src/parent/main.js`（改）— import 順序：`m3-tokens.css` → `typography.css` → `state-layer.css` → `globals.css`
- `src/parent/App.vue`（改）— body background 改 `--m3-background`，font-family 改 `--m3-font-body`
- `index.html` 或 `src/parent/index.html`（改）— `<link>` Google Fonts (Roboto + Noto Sans TC) + Material Symbols
- `src/parent/components/M3Icon.vue`（新增）

**回歸驗證**：P0 結束時 view 視覺已大幅變化（字體/底色/陰影都換了），但 layout 結構未動。執行 `npm run build` + `npm run test:run`（parent app 既有 ~220 個測試）必須全綠。

---

## 4. Phase 1：核心元件

### 4.1 M3Button

variants：`filled` `tonal` `outlined` `text` `elevated`

```vue
<M3Button variant="filled" @click="...">送出</M3Button>
<M3Button variant="tonal" icon="add">新增</M3Button>
<M3Button variant="outlined">取消</M3Button>
<M3Button variant="text" size="small">查看更多</M3Button>
```

規格：
- 圓角：fully rounded（`border-radius: 100px`）
- 高度：40px（standard）、56px（FAB）
- Padding：horizontal 24px（無 icon）/ 16px+24px（leading icon）
- State layer：hover 8%、focus/pressed 12%，用 `::before` overlay
- 文字：label-large（14px / 500 / letter-spacing 0.1）

### 4.2 M3Card

variants：`elevated` `filled` `outlined`

- `elevated`：bg = `--m3-surface-container-low`，shadow = `--m3-elev-1`
- `filled`：bg = `--m3-surface-container-highest`，no shadow
- `outlined`：bg = `--m3-surface`，1px solid `--m3-outline-variant`
- 圓角：12px（M3 standard）
- Padding：可由父層控制（slot-driven）
- 點擊行為：可選 `clickable` prop 啟用 state layer + cursor

### 4.3 M3IconButton

variants：`standard` `filled` `filled-tonal` `outlined`

- 大小：40×40px touch target（icon 24px）
- 圓角：fully rounded
- 用法：`<M3IconButton icon="close" aria-label="關閉" />`

### 4.4 M3List + M3ListItem

```vue
<M3List>
  <M3ListItem
    leading-icon="event"
    headline="今日才藝課"
    supporting-text="14:00 美術教室"
    trailing="chevron_right"
    @click="..."
  />
</M3List>
```

- One-line：56px、two-line：72px、three-line：88px
- Leading：avatar / icon / image / checkbox / switch
- Trailing：icon / text / chevron / switch / checkbox
- Divider：M3 spec 預設不畫 divider，改用 spacing；若需要可加 `divided` prop

### 4.5 M3Chip

variants：`assist` `filter` `input` `suggestion`

- 高度：32px
- 圓角：8px（M3 chip 不是 fully rounded）
- 已選 filter chip：`--m3-secondary-container` 背景 + check icon
- 用法：取代既有 `<span class="chip">` patterns

### 4.6 P1 檔案

- `src/parent/components/m3/M3Button.vue`
- `src/parent/components/m3/M3Card.vue`
- `src/parent/components/m3/M3IconButton.vue`
- `src/parent/components/m3/M3List.vue`
- `src/parent/components/m3/M3ListItem.vue`
- `src/parent/components/m3/M3Chip.vue`
- `src/parent/components/m3/M3Divider.vue`
- `src/parent/components/m3/index.js`（barrel export）

每個元件搭一個 Vitest 測試（render + click + slot）。

---

## 5. Phase 2：導航元件

### 5.1 M3NavigationBar

取代 `ParentLayout.vue` 的 `<nav class="tab-bar">`。

規格：
- 高度：80px（內含 safe-area-inset-bottom）
- 4 個 tab（home/messages/family/me 不變）
- Active tab：icon 上方有 32×32 active indicator pill（背景 `--m3-secondary-container`）
- Inactive tab：icon outline 變體（Material Symbols `FILL=0`）
- Active tab：icon filled 變體（`FILL=1`）
- Label：label-medium（12px / 500）
- Badge：未讀數字 chip 浮在 icon 右上

整合：badge 邏輯（`unread` `unreadMessages`）保留現有的 `refreshUnread()` flow，只改 UI。

### 5.2 M3TopAppBar

取代 `AppHeader.vue`。

variants：`center-aligned`（首頁）、`small`（一般 detail page）、`large`（特殊頁如子女檔案首頁）

- 高度：64px（small / center-aligned）、152px（large 展開）、64px（large 收起，含 scroll-driven 動畫）
- Title：title-large（22px / 400）；large variant 展開時 headline-medium（28px / 400）
- Leading：back icon（router.back()）或 menu icon
- Trailing：最多 3 個 M3IconButton（通知 / 子女選擇 / 設定）

Scroll behavior：用 IntersectionObserver 偵測 page top，scroll 超過 80px 後 top bar 加上 `--m3-elev-2` 陰影。

### 5.3 M3FAB / Extended FAB

- 預留 `<M3FAB>` 元件，但 P2 結束時不強制鋪滿所有 view，只在 P4 階段視 view 內容決定哪些頁面要用 FAB。
- 可能用 FAB 的場景：`MessagesView`（新訊息）、`LeavesView`（新請假）、`MedicationListView`（新用藥單）。

### 5.4 P2 檔案

- `src/parent/components/m3/M3NavigationBar.vue`（新）
- `src/parent/components/m3/M3TopAppBar.vue`（新）
- `src/parent/components/m3/M3FAB.vue`（新）
- `src/parent/layouts/ParentLayout.vue`（改：用新元件）
- `src/parent/components/AppHeader.vue`（**刪除**或留 deprecated）

**回歸驗證**：所有 view 視覺都會跟著變（共用 layout）。手動點過全部 4 tab + 至少 3 個 detail page，確認 nav/header 行為正常。

---

## 6. Phase 3：互動元件

### 6.1 M3Dialog

取代 `ConfirmDialog.vue` 與 `AppModal.vue`。

- 圓角：28px（M3 dialog 標誌性）
- Padding：24px
- Action buttons 排在右下角：`<M3Button variant="text">`
- Scrim：rgba(0,0,0, 0.32) + backdrop-filter blur(8px)
- 進場：emphasized-decel easing, 250ms scale 0.8→1 + opacity

### 6.2 M3BottomSheet

**Refactor** `ParentBottomSheet.vue`：

- 保留所有現有 API（避免破壞 7 處使用：`FeeReceiptSheet`、`LeaveDetailSheet`、`ActivityRegisterSheet`、`MessageThreadView`、`LeavesView`、`ParentLayout` 等）
- 改動：
  - 圓角頂部：28px
  - Drag handle：32×4 px 圓條（`--m3-outline-variant`）
  - 內部 spacing 套 M3 tokens
  - 進場：emphasized-decel easing
- Modal（覆蓋全螢幕）vs Standard（半高）兩種模式保留現有用法

### 6.3 M3Snackbar

新增。預期取代既有的 toast 系統（若無則新建）。

- 位置：底部置中，底部距 NavigationBar 16px
- 圓角：4px
- 高度：48px（單行）/ 68px（雙行）
- Action：可選 `<M3Button variant="text">`
- 自動關閉：4 秒（短訊息）/ 7 秒（含 action）
- 與 NavigationBar 共存時，snackbar 浮在 nav 上方

提供 composable：`useSnackbar()` 包 `show({ message, action, duration })`。

### 6.4 M3TextField

variants：`filled`（預設）`outlined`

- 高度：56px
- Label：浮動標籤（focus / 有值時上移）
- Supporting text：下方 12px label
- Error state：error 色 + error icon
- 圓角：filled 4px top / outlined 4px all

### 6.5 M3SegmentedButton

新增。取代既有的 tab pill / segmented control 樣式（家校頁、訊息篩選等）。

### 6.6 M3Switch / M3Checkbox / M3Radio

新增。M3 Switch 是辨識度最高的元件（拇指放大、track 顏色變化、handle icon optional）。

`NotificationPrefsView` 與 `AppearanceSettings` 大量用到 switch，是主要受益者。

### 6.7 P3 檔案

- `src/parent/components/m3/M3Dialog.vue`
- `src/parent/components/m3/M3BottomSheet.vue`（refactor `ParentBottomSheet.vue` 為它，或新增同名 component 後遷移）
- `src/parent/components/m3/M3Snackbar.vue`
- `src/parent/components/m3/M3TextField.vue`
- `src/parent/components/m3/M3SegmentedButton.vue`
- `src/parent/components/m3/M3Switch.vue`
- `src/parent/components/m3/M3Checkbox.vue`
- `src/parent/components/m3/M3Radio.vue`
- `src/parent/composables/useSnackbar.js`

**遷移策略**：`ParentBottomSheet` 不直接重命名，改在內部換實作 + 視覺；對外保留同樣 props/events。P5 階段如果新增 `M3BottomSheet.vue` 別名，可漸進遷移命名。

---

## 7. Phase 4：View 改寫

27 個 view 全部走 M3 元件。拆 4 個 sub-PR 並行（4 + 6 + 6 + 11 = 27）：

### 7.1 P4.1 首頁群（4 view）

- `HomeView.vue`、`MoreView.vue`、`NotificationPrefsView.vue`、`AnnouncementsView.vue`
- `components/home/*`（HomeHero、TodayStatusCards、TodoCenter、QuickActions、ChildrenStrip、PushCta）

改造重點：
- HomeHero 卡片：圓角 12 → 24px，bg = `--m3-primary-container`，文字 on-primary-container
- TodayStatusCards：拿掉童彩 tile，全部走 `--m3-surface-container-low` + 圖示用 `--m3-tertiary-container` 背景
- QuickActions：4 格 button → M3 IconButton + label（M3 標誌性 quick action pattern）
- TodoCenter：M3List + ListItem 改寫

### 7.2 P4.2 訊息/家校群（6 view）

- `MessagesView`、`MessageThreadView`、`ContactBookView`、`ContactBookDetailView`、`EventsView`、`EventAckView`

改造重點：
- 訊息列表：M3List two-line（標題 + supporting text），未讀 = title-medium 加粗 + tertiary 圓點
- MessageBubble：圓角 18px（M3 chat bubble spec）；自己訊息 = `--m3-primary-container`、對方 = `--m3-surface-container-high`
- 訊息輸入區：M3TextField + filled variant + 圓角 28px（單行 chat bar）
- ContactBookView：日曆網格走 M3 date picker grid

### 7.3 P4.3 子女檔案群（6 view）

- `ChildProfileView`、`ChildMeasurementsView`、`ChildPhotosView`、`ChildReportsView`、`AttendanceView`、`FamilyView`

改造重點：
- ChildProfileView Hero：large top app bar + scroll collapse
- 量測曲線：圖表配色換 M3 palette（primary / tertiary 雙線）
- ChildPhotosView：3-col grid → M3 image list（圓角 12px、loading state shimmer 用 `--m3-surface-container`）
- 里程碑卡：refactor `MilestoneCard.vue`，bg = `--m3-tertiary-container`

### 7.4 P4.4 申請/我的/收費群（11 view）

- `LeavesView`、`MedicationListView`、`MedicationFormView`、`MedicationDetailView`、`MeView`、`FeesView`、`ActivityView`、`CalendarView`、`BindView`、`BindAdditionalView`、`LoginView`

改造重點：
- LeavesView / MedicationListView：M3 FAB (Extended FAB) 觸發新增
- Form：全部走 M3TextField，supporting text 統一顯示驗證錯誤
- NotificationPrefsView：M3 Switch 全套替換
- MeView：M3 List + Hero 卡片
- FeesView：M3 Card outlined + chip（已繳/未繳/逾期）
- 簽名頁（`SignaturePad`）：邊框走 outlined variant、按鈕走 M3Button

### 7.5 P4 共通遷移檢查表

每個 view 改寫前 grep 確認：
- [ ] 全部 inline `box-shadow`、`border-radius`、`background-color` 改走 M3 tokens
- [ ] 所有 `<ParentIcon>` 改 `<M3Icon>`（保留 ParentIcon 作 fallback，P5 才刪）
- [ ] 所有 `<button class="pt-btn-*">` 改 `<M3Button variant="...">`
- [ ] 所有 `<div class="pt-card">` 改 `<M3Card variant="...">`
- [ ] 所有 chip-like span 改 `<M3Chip>`
- [ ] 全部 `--pt-tint-*` `--ivy-tile-*` 引用刪除 / 替換
- [ ] view 內 scoped style 不再硬寫 hex 色

每個 sub-PR 結束時跑 `npm run test:run` 必須綠（既有 ~220 parent 測試 + 既有 admin 不受影響）。

---

## 8. Phase 5：Motion + Polish

### 8.1 Route Transition

`App.vue` 既有的 `parent-fade / parent-slide-forward / parent-slide-back` 過場：
- Easing 從 `cubic-bezier(0.4, 0, 0.2, 1)` 改 `var(--m3-easing-emphasized-decel)`
- Duration leave 140ms / enter 160ms → 改 M3 spec：forward = container transform 400ms emphasized；fade = 250ms emphasized
- 保留 reduced-motion 兼容

### 8.2 Container Transform（選做）

選擇 1–2 個高頻轉場做 container transform（M3 shared element）：
- HomeView → MessageThreadView（點訊息卡 → 列表項放大成全頁）
- ChildPhotosView → 大圖檢視

技術：Vue 4 不原生支援，可用 `vue-router` 配合 `<Transition>` + CSS `view-transition-name`（瀏覽器 View Transitions API，Chrome 111+ / Safari TP）。LIFF webview 支援度需驗證；若不支援，fallback fade。

### 8.3 Press Feedback

拿掉 `.press-scale` 的 `transform: scale(0.97)`，改用 M3 state layer overlay（已在 M3Button / M3Card 內建）。

`globals.css` 清掉 `.press-scale` utility。

### 8.4 Final Polish

- 視覺檢查每個 view（手動逐頁過 24 view）
- Dark mode 全 view 過一遍
- Reduced motion 兼容（全部 transition 經由 prefers-reduced-motion 媒體查詢已自動關閉）
- Accessibility：M3 spec 規定的 touch target ≥ 48dp、contrast ≥ 4.5:1（spec 內建 token 已符合）
- Bundle size check：對比 baseline，預期 +30~50KB gz（Material Symbols + Roboto 字體 + 新元件）；若超出再做拆分

### 8.5 P5 檔案

- `src/parent/App.vue`（路由 transition）
- `src/parent/styles/globals.css`（最終清理）
- `src/parent/components/AppHeader.vue`（刪除）
- `src/parent/components/ParentIcon.vue`（刪除，若無人用）
- `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md`（本文檔加 P5 結案 note）

---

## 9. 元件對應總表

| 既有 | 替換 |
|------|------|
| `AppHeader.vue` | `M3TopAppBar.vue` |
| `ParentLayout` `.tab-bar` | `M3NavigationBar.vue` |
| `ParentBottomSheet.vue` | refactor 為 `M3BottomSheet.vue`（或同名換實作） |
| `ConfirmDialog.vue` | `M3Dialog.vue` |
| `AppModal.vue` | `M3Dialog.vue`（合併） |
| `.pt-card` utility | `M3Card variant="elevated/filled/outlined"` |
| `<button class="pt-btn-primary">` | `M3Button variant="filled"` |
| `<button class="pt-btn-secondary">` | `M3Button variant="tonal"` |
| `<button class="pt-btn-ghost">` | `M3Button variant="text"` |
| `<ParentIcon>` | `<M3Icon>` |
| 自製 toast / message | `M3Snackbar` + `useSnackbar` |
| `<input>` / `<textarea>` 散落 | `M3TextField` |
| 散落 chip span | `M3Chip` |
| 散落 segmented pill | `M3SegmentedButton` |
| 散落 `<input type="checkbox">` | `M3Switch` / `M3Checkbox` |

---

## 10. 風險與緩解

| 風險 | 等級 | 緩解 |
|------|------|------|
| `ParentBottomSheet` refactor 破壞 7 處使用 | HIGH | 保留現有 API（props/events 不變）；P3 PR 內逐一手動測 7 處 |
| LIFF webview 支援 Material Symbols 字體載入失敗 | MID | preload + fallback：text fallback `[icon]` 或 inline SVG fallback set |
| Roboto + Noto Sans TC web font 載入造成 FOIT | MID | `font-display: swap` + preload 主 weight；中文 subset 用 Google Fonts 子集化 |
| 童彩 6 色刪除後 visual identity 削弱 | MID | tertiary container 仍是溫暖色調；FAB / quick action icon 可用 tertiary tone 保留色彩感 |
| Bundle 增加超過預期 | LOW | Material Symbols 用 CSS font 而非 SVG sprite；分階段 audit bundle |
| Dark mode 對比測試 | LOW | M3 token 自帶 dark palette，理論上 WCAG AA 達標 |
| 既有 220+ Vitest 測試斷在元件選擇器上 | MID | 測試多用 `data-testid` 或 role；若有用 `.pt-btn-*` CSS class 斷言，P4 內順手改 |
| View Transitions API 在 LIFF 不支援 | LOW | P5 選做；不支援自動 fallback fade |
| 與 admin app 共用的 design-tokens.css | MID | M3 tokens 只放 `src/parent/styles/m3-tokens.css`，不污染共用；admin 完全不受影響 |

---

## 11. 測試與驗收

### 11.1 自動化

- `npm run test:run` 每 phase 結束必須全綠
- `npm run build` 必須成功
- 既有 Vitest 測試斷在 component class 上的，逐一修

### 11.2 手動驗證（每 phase 結束）

啟動 `./start.sh`，瀏覽器開家長端，逐項手動測：

**P0**：
- [ ] 字體確實是 Roboto / Noto Sans TC（dev tools 確認）
- [ ] body 背景是 M3 surface 色
- [ ] 既有 view 不爆版

**P1**：
- [ ] M3 元件 storybook-like 測試頁可瀏覽（建一個 `/dev/m3-gallery` 路由，phase 結束後刪）

**P2**：
- [ ] 4 個 tab 切換有 active indicator pill
- [ ] AppBar scroll 後出現 elevation

**P3**：
- [ ] 7 處 BottomSheet 全部正常開啟/關閉
- [ ] Dialog 開啟/關閉動畫流暢
- [ ] Snackbar 浮在 NavigationBar 上方不被遮

**P4.x**：每個 sub-PR 結束逐頁過 view，golden path：
- [ ] 登入 → 首頁
- [ ] 點訊息卡 → 訊息列表 → thread → 送訊息
- [ ] 點請假 → 新請假 form → 送出 → 看列表
- [ ] 點用藥單 → 簽名 → 送出
- [ ] 切 dark mode 看一次首頁

**P5**：
- [ ] 路由切換動畫順暢
- [ ] Reduced motion 開啟後動畫全關
- [ ] Bundle size diff < +60KB gz

### 11.3 視覺對比

每個 phase 結束截圖前後對比，存 `.scratch/m3-redesign/phase-X/`。

---

## 12. Commit / 分支策略

- 一個 phase 一個分支：`feat/parent-m3-phase-0-frontend` ~ `feat/parent-m3-phase-5-frontend`
- P4 內部 sub-PR 用 stacked branch：`feat/parent-m3-phase-4-1-home-frontend`、`feat/parent-m3-phase-4-2-messages-frontend` 等
- 每個 phase merge 後才開下一個分支（避免 token 衝突）
- Commit message：`feat(parent-m3): <description>`（Conventional Commits）

---

## 13. 預期效果

完成後家長端應該：

1. **第一眼**：明顯 Material 風格（Roboto 字體、tonal surface、large radius、Material icons）
2. **互動**：State layer overlay 取代 scale 動畫；按鈕 fully rounded；切 tab 有 active indicator pill
3. **層次**：surface tonal hierarchy 取代邊框 + 陰影（白卡 → tonal 階差）
4. **品牌**：IvyKids 深綠仍是主色（M3 primary），但童彩刪除、整體更素雅嚴肅，像 Google Workspace 而非主題樂園
5. **規格**：對齊 M3 spec，可被 Material Design 圈識別

---

## 14. 已決議事項（2026-05-13 user 確認）

1. **P4 sub-PR 順序**：4.1 → 4.2 → 4.3 → 4.4（不調整）
2. **M3 source color**：保留 `#0d9053`（IvyKids 深綠），不換 Google 藍。理由：剛完成 ivykids rebrand 將色票從 coral 切回深綠，再切會推翻才完成的品牌決定
3. **IvyKids brand SVG**：保留為 deprecated（CrownIcon / LaurelWreath / BrandMark / KawaiiStar 不刪）；P4.3 子女檔案頁 implementer 視覺需要時可選用，新 view 一律不用
4. **Tertiary 顏色**：走 M3 Material Theme Builder 算法生成的 tertiary（不手動覆寫成暖色）。徹底走 M3 spec
5. **Bundle 預算**：接受 baseline +60KB gz 上限。Material Symbols 用 CSS font + `display=block` 為主；若超出再做 SVG sprite subset 化
