# 家長端 Material 3 重寫 P4.1：首頁群 view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P4 第一個 sub-PR：把家長端首頁群（HomeView / MoreView / NotificationPrefsView / AnnouncementsView + 6 個 components/home/* 子元件）的視覺改造為 Material 3。透過 `ParentIcon` → `M3Icon` 自動 swap、`pt-card` → `M3Card`、`pt-tint-*` 保留 fallback、`M3Switch` 接管 NotificationPrefs，達成 M3 視覺。零既有 API 破壞、既有 ~200 parent 測試零新增 regression。

**Architecture:** 採「ParentIcon wrapper 策略」一次性把全 app 的 icon 全切換到 Material Symbols：把 `ParentIcon.vue` 改成 `M3Icon` 的 wrapper + `iconMapping.js` 集中字串對應；所有 caller 不必改 template。其餘 view 採「visual-only refactor」：token 引用換 M3、`.pt-card` 包裝/替換為 `<M3Card>`、`ParentIcon` 由 wrapper 自動切換。**所有 view 與 component 的 props/events/script logic 完全不動**，只動 template + scoped style。

**Tech Stack:** Vue 3 `<script setup>`。沿用 P0-P3 已建的 M3 tokens + 17 個 M3 元件 + useSnackbar。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §7.1。

**Branch:** 從 `feat/parent-m3-phase-3-frontend` head 切 `feat/parent-m3-phase-4-1-frontend`。

---

## File Structure

### 改寫檔案

```
src/parent/components/ParentIcon.vue       (Task 1 — 整檔覆寫為 M3Icon wrapper)
src/parent/utils/iconMapping.js            (Task 1 — 新建 mapping table)
src/parent/components/home/HomeHero.vue    (Task 2 — visual)
src/parent/components/home/TodayStatusCards.vue (Task 3 — visual)
src/parent/components/home/TodoCenter.vue  (Task 3 — visual)
src/parent/components/home/QuickActions.vue(Task 4 — visual)
src/parent/components/home/ChildrenStrip.vue(Task 4 — visual)
src/parent/components/home/PushCta.vue     (Task 4 — visual)
src/parent/views/HomeView.vue              (Task 5 — visual container)
src/parent/views/MoreView.vue              (Task 5 — visual container)
src/parent/views/NotificationPrefsView.vue (Task 6 — Switch 全替換 M3Switch)
src/parent/views/AnnouncementsView.vue     (Task 7 — visual)
```

### 不動檔案

- 所有 `*.test.js` test files
- `src/parent/router.js`、`src/parent/main.js`
- 所有 script setup logic（include API call、reactive state、computed 等）

---

## Mapping reference

### ParentIcon name → Material Symbols Rounded name

| ParentIcon | Material Symbols Rounded |
|------------|-------------------------|
| `home` | `home` |
| `attendance` | `fact_check` |
| `messages`, `chat` | `chat_bubble` |
| `announcements`, `megaphone` | `campaign` |
| `more` | `more_horiz` |
| `calendar` | `calendar_month` |
| `clipboard` | `assignment` |
| `notebook` | `menu_book` |
| `pill`, `medication` | `medication` |
| `money`, `fees` | `payments` |
| `bell`, `notification` | `notifications` |
| `envelope` | `mail` |
| `document` | `description` |
| `attachment`, `paperclip` | `attach_file` |
| `camera` | `photo_camera` |
| `location`, `pin` | `location_on` |
| `signature` | `draw` |
| `art`, `palette` | `palette` |
| `pickup`, `children` | `child_care` |
| `check` | `check` |
| `check-circle` | `check_circle` |
| `close`, `x` | `close` |
| `plus` | `add` |
| `minus` | `remove` |
| `back`, `arrow-left` | `arrow_back` |
| `arrow-right`, `chevron-right` | `chevron_right` |
| `warn`, `warning`, `alert` | `warning` |
| `info` | `info` |
| `refresh` | `refresh` |
| `logout` | `logout` |
| `family` | `school` |
| `me`, `profile`, `person` | `person` |
| `contact` | `contacts` |
| `leave` | `event_busy` |

### Size mapping (ParentIcon size string → M3Icon size number)

- `xs` → 14
- `sm` → 18
- `md` → 22
- `lg` → 28

---

### Task 0: P4.1 branch setup

- [ ] **Step 1: 從 P3 head 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = 63e91d1f P3 barrel
git checkout -b feat/parent-m3-phase-4-1-frontend
```

- [ ] **Step 2: 跑 parent baseline 記下 pre-existing failures**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed (HomeHero 2 + TodoCenter 1 + TodoCenterPhase3 1)。

---

### Task 1: ParentIcon → M3Icon wrapper + iconMapping

**Files:**
- Create: `src/parent/utils/iconMapping.js`
- Modify: `src/parent/components/ParentIcon.vue` (整檔覆寫)

策略：把 ParentIcon 改成 M3Icon 的 wrapper，所有 caller 不必改 template。

- [ ] **Step 1: 建 mapping module**

```bash
mkdir -p src/parent/utils
```

寫入 `src/parent/utils/iconMapping.js`：

```js
/**
 * ParentIcon name → Material Symbols Rounded name mapping.
 *
 * P4.1: ParentIcon refactor 為 M3Icon wrapper 時用。
 * 未對應的 name 會原樣傳給 M3Icon（讓 Material Symbols 嘗試 fallback）。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §7.1
 */
const ICON_MAP = {
  home: 'home',
  attendance: 'fact_check',
  messages: 'chat_bubble',
  chat: 'chat_bubble',
  announcements: 'campaign',
  megaphone: 'campaign',
  more: 'more_horiz',
  calendar: 'calendar_month',
  clipboard: 'assignment',
  notebook: 'menu_book',
  pill: 'medication',
  medication: 'medication',
  money: 'payments',
  fees: 'payments',
  bell: 'notifications',
  notification: 'notifications',
  envelope: 'mail',
  document: 'description',
  attachment: 'attach_file',
  paperclip: 'attach_file',
  camera: 'photo_camera',
  location: 'location_on',
  pin: 'location_on',
  signature: 'draw',
  art: 'palette',
  palette: 'palette',
  pickup: 'child_care',
  children: 'child_care',
  check: 'check',
  'check-circle': 'check_circle',
  close: 'close',
  x: 'close',
  plus: 'add',
  minus: 'remove',
  back: 'arrow_back',
  'arrow-left': 'arrow_back',
  'arrow-right': 'chevron_right',
  'chevron-right': 'chevron_right',
  warn: 'warning',
  warning: 'warning',
  alert: 'warning',
  info: 'info',
  refresh: 'refresh',
  logout: 'logout',
  family: 'school',
  me: 'person',
  profile: 'person',
  person: 'person',
  contact: 'contacts',
  leave: 'event_busy',
}

const SIZE_MAP = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
}

export function mapIconName(name) {
  return ICON_MAP[name] ?? name
}

export function mapIconSize(size) {
  return SIZE_MAP[size] ?? 22
}
```

- [ ] **Step 2: 整檔覆寫 ParentIcon.vue**

寫入 `src/parent/components/ParentIcon.vue`：

```vue
<script setup>
import { computed } from 'vue'
import M3Icon from './m3/M3Icon.vue'
import { mapIconName, mapIconSize } from '../utils/iconMapping'

/**
 * ParentIcon — 舊 SVG icon 元件的 backward-compatible wrapper。
 *
 * P4.1 改造：內部改用 Material Symbols (M3Icon)；name string 透過
 * iconMapping 自動映射。所有既有 caller 不必改 template。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §7.1
 *
 * 使用（與 P3 之前完全相同）：
 *   <ParentIcon name="home" size="md" />
 *   <ParentIcon name="close" size="lg" aria-label="關閉" />
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: String, default: 'md' },
  decorative: { type: Boolean, default: true },
})

const m3Name = computed(() => mapIconName(props.name))
const m3Size = computed(() => mapIconSize(props.size))
</script>

<template>
  <M3Icon :name="m3Name" :size="m3Size" />
</template>
```

- [ ] **Step 3: 跑 parent 全套確認零新增 regression**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -10
```

Expected: 228 passed / 4 failed (pre-existing) 不變。如果新增 failure，可能是測試斷在 `.parent-icon svg` 之類的具體選擇器。視情況保留 ParentIcon 內舊 svg fallback 或修正 test selector（**不要動 test 本身，調 component 包裝**）。

- [ ] **Step 4: 跑 dev server 確認啟動正常**

```bash
(npm run dev 2>&1 &); DEV_PID=$!; sleep 6; kill $DEV_PID 2>/dev/null; wait 2>/dev/null
```

Expected: `VITE ... ready`。

- [ ] **Step 5: Commit**

```bash
git add src/parent/utils/iconMapping.js src/parent/components/ParentIcon.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ParentIcon refactor 為 M3Icon wrapper

- 新增 src/parent/utils/iconMapping.js（38 個 icon name 對應 + 4 size 對應）
- ParentIcon.vue 從 inline SVG 改為 M3Icon wrapper
- 所有既有 caller 不必改 template；全 app icon 一次性切換到 Material Symbols
- API (name/size/decorative props) 完全保留

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: HomeHero visual M3 化

**Files:**
- Modify: `src/parent/components/home/HomeHero.vue`

策略：保留 LaurelWreath / KawaiiStar brand SVG（仍是 IvyKids 品牌標誌）；只動 scoped style：
- 圓角 14 → 24px
- 背景：linear-gradient → `var(--m3-primary-container, <既有 fallback>)` 或保留漸層但改 M3 tonal
- box-shadow 改 `var(--m3-elev-1, ...)`
- 字色改 `var(--m3-on-primary-container, var(--pt-text-strong))` (fallback 鏈)
- 拿掉 `var(--pt-tint-sun)` 引用 → 改 `var(--m3-tertiary-container)`

- [ ] **Step 1: Read 現有 HomeHero.vue 完整內容**

```bash
cat src/parent/components/home/HomeHero.vue
```

- [ ] **Step 2: Read style 區塊定位每個 token 引用**

```bash
grep -n "var(--pt-\|var(--ivy-\|var(--brand-\|var(--pt-elev\|var(--pt-tint" src/parent/components/home/HomeHero.vue
```

- [ ] **Step 3: 套以下 token 替換規則（用 Edit tool 多次小範圍替換）**

每次 Edit 後跑 vitest 確認沒新失敗。

| 找到 | 替換為 |
|------|-------|
| `border-radius: var(--pt-card-radius, 14px);` | `border-radius: 24px;` |
| `box-shadow: var(--pt-shadow-card, var(--pt-elev-1));` | `box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));` |
| `var(--pt-text-strong)` | `var(--m3-on-primary-container, var(--pt-text-strong))` |
| `var(--pt-tint-sun, var(--ivy-tile-yellow-bg))` | `var(--m3-tertiary-container, var(--pt-tint-sun, var(--ivy-tile-yellow-bg)))` |
| `var(--pt-tint-brand, var(--brand-primary-soft))` | `var(--m3-primary-container, var(--pt-tint-brand, var(--brand-primary-soft)))` |

對於 linear-gradient bg：保留結構，但兩端顏色改 fallback 為 M3 token：

| 找到（精確） | 替換為 |
|------|-------|
| `var(--pt-surface-raised, #fff)` | `var(--m3-surface-container-low, var(--pt-surface-raised, #fff))` |
| `var(--pt-surface-recessed, #f5fbe6)` | `var(--m3-surface-container, var(--pt-surface-recessed, #f5fbe6))` |

- [ ] **Step 4: 跑 HomeHero 測試**

```bash
npm run test -- HomeHero 2>&1 | tail -10
```

Expected: pre-existing 2 failures 不變，不增加新 failure。

- [ ] **Step 5: 跑 parent baseline 確認**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed (pre-existing) 不變。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/home/HomeHero.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): HomeHero visual M3 化

- 圓角 14 → 24px
- 引用 --m3-primary-container / --m3-elev-1 / --m3-on-primary-container
- 保留 LaurelWreath/KawaiiStar brand SVG（IvyKids 品牌記憶點）
- props/script setup 完全不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: TodayStatusCards + TodoCenter visual M3 化

**Files:**
- Modify: `src/parent/components/home/TodayStatusCards.vue`
- Modify: `src/parent/components/home/TodoCenter.vue`

兩個都是 list-like 區塊。改動範圍：
- `.pt-card` / `border-radius: 14px` → 改為 12px (M3 list card) + bg surface-container-low
- `.tint-*` 背景：保留 className 不變，但 token fallback 加 M3 對應
- `.press-scale` 移除 transform: scale 動畫（改用 state layer，但若改 template 風險高，保留即可）

- [ ] **Step 1: Read 兩個檔案**

```bash
cat src/parent/components/home/TodayStatusCards.vue
cat src/parent/components/home/TodoCenter.vue
```

- [ ] **Step 2: Read style 區塊定位 token**

```bash
grep -n "var(--pt-\|var(--ivy-\|border-radius:\|box-shadow:" src/parent/components/home/TodayStatusCards.vue src/parent/components/home/TodoCenter.vue
```

- [ ] **Step 3: 套替換（兩檔同時做）**

對每個檔案內的 card-like selector（如 `.status-card`、`.todo-row` 等），替換：

| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-tint-brand, var(--brand-primary-soft))` | `var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)))` |

對於 `.tint-money` `.tint-message` 等類別背景（多半在 :class binding 內），不改 className，但其 CSS rule 內的 token fallback 改：

```
.tint-money     { background: var(--pt-tint-money);     color: var(--pt-tint-money-fg);     }
```

不必動（已有 fallback chain）。等 P5 統一清。

- [ ] **Step 4: 跑這兩個元件測試**

```bash
npm run test -- TodayStatusCards TodoCenter 2>&1 | tail -15
```

Expected: pre-existing failures 不變。

- [ ] **Step 5: 跑 parent baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 / 4 failed 不變。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/home/TodayStatusCards.vue \
       src/parent/components/home/TodoCenter.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): TodayStatusCards + TodoCenter visual M3 化

- 圓角 14 → 12px (M3 list card)
- 引用 --m3-surface-container-low / --m3-elev-1
- tint-* 類別保留（P5 統一清舊 pt-tint tokens）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: QuickActions + ChildrenStrip + PushCta visual M3 化

**Files:**
- Modify: `src/parent/components/home/QuickActions.vue`
- Modify: `src/parent/components/home/ChildrenStrip.vue`
- Modify: `src/parent/components/home/PushCta.vue`

QuickActions：圓角 14 → 16px，pt-card → surface-container-low。
ChildrenStrip：child avatar bg 改 secondary-container。
PushCta：CTA box 圓角 14 → 16，bg → tertiary-container。

- [ ] **Step 1: Read 三個檔案**

```bash
cat src/parent/components/home/QuickActions.vue
cat src/parent/components/home/ChildrenStrip.vue
cat src/parent/components/home/PushCta.vue
```

- [ ] **Step 2: 套以下替換規則**

對 QuickActions:
| 找到 | 替換為 |
|------|-------|
| `border-radius: var(--pt-card-radius, 14px)` | `border-radius: 16px` |
| `background: var(--pt-surface-card)` | `background: var(--m3-surface-container-low, var(--pt-surface-card))` |
| `box-shadow: var(--pt-shadow-card, var(--pt-elev-1))` | `box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |

對 ChildrenStrip:
| 找到 | 替換為 |
|------|-------|
| `var(--pt-tint-brand, var(--brand-primary-soft))` | `var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)))` |
| `var(--brand-primary)` (在 avatar/badge bg 用途) | `var(--m3-primary, var(--brand-primary))` |
| `border-radius: var(--pt-card-radius, 14px)` | `border-radius: 16px` |

對 PushCta:
| 找到 | 替換為 |
|------|-------|
| `border-radius: var(--pt-card-radius, 14px)` | `border-radius: 16px` |
| `var(--pt-tint-announcement, var(--ivy-tile-coral-bg))` | `var(--m3-tertiary-container, var(--pt-tint-announcement, var(--ivy-tile-coral-bg)))` |

每次 Edit 後跑 vitest 確認沒新失敗。

- [ ] **Step 3: 跑這三個元件測試**

```bash
npm run test -- QuickActions ChildrenStrip PushCta 2>&1 | tail -15
```

Expected: 全綠（pre-existing baseline）。

- [ ] **Step 4: 跑 parent baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/home/QuickActions.vue \
       src/parent/components/home/ChildrenStrip.vue \
       src/parent/components/home/PushCta.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): QuickActions + ChildrenStrip + PushCta visual M3 化

- 圓角 14 → 16px
- 引用 --m3-surface-container-low / --m3-secondary-container / --m3-tertiary-container
- tint-* / brand-primary 保留 fallback chain

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: HomeView + MoreView 容器 view visual M3 化

**Files:**
- Modify: `src/parent/views/HomeView.vue`
- Modify: `src/parent/views/MoreView.vue`

兩個都是容器頁，主要視覺由子元件提供。僅改頁面 padding、section 標題、可能的 banner。

- [ ] **Step 1: Read 兩個 view 確認結構**

```bash
cat src/parent/views/HomeView.vue
cat src/parent/views/MoreView.vue
```

- [ ] **Step 2: 套以下 token 替換**

對 HomeView / MoreView 的 scoped style 區塊內：
| 找到 | 替換為 |
|------|-------|
| `var(--pt-page-gutter, ...)` | 不動（保留 page padding） |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |
| `var(--pt-card-radius, 14px)` | `12px` |
| `background: var(--pt-surface-card)` | `background: var(--m3-surface-container-low, var(--pt-surface-card))` |

- [ ] **Step 3: 跑 HomeView 測試**

```bash
npm run test -- HomeView 2>&1 | tail -10
```

Expected: baseline 通過。

- [ ] **Step 4: 跑 parent baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/HomeView.vue src/parent/views/MoreView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): HomeView + MoreView 容器 visual M3 化

- 頁面 section / card 切 M3 token (surface-container-low / on-surface)
- 圓角 14 → 12px
- 子元件視覺由 Task 2-4 提供

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: NotificationPrefsView M3Switch 替換

**Files:**
- Modify: `src/parent/views/NotificationPrefsView.vue`

策略：頁面內所有 `<input type="checkbox">` 或自製 toggle 換 `<M3Switch v-model="..." />`。

- [ ] **Step 1: Read 現有 NotificationPrefsView 完整**

```bash
cat src/parent/views/NotificationPrefsView.vue
```

定位每個 checkbox / toggle 的 v-model binding 與 onChange 行為。

- [ ] **Step 2: 識別 switch points**

```bash
grep -nE "<input type=\"checkbox\"|toggle|switch" src/parent/views/NotificationPrefsView.vue
```

- [ ] **Step 3: 替換 toggle 元素**

對每個既有 `<input type="checkbox" v-model="X" />` 或自製 `.toggle` 結構：

替換為：

```vue
<M3Switch v-model="X" :aria-label="'<該欄位的中文 label>'" />
```

並在 `<script setup>` 開頭加 import（如果還沒）：

```js
import M3Switch from '../components/m3/M3Switch.vue'
```

不要動 script 內的 reactive state、onChange callback、API call 等邏輯。

- [ ] **Step 4: Style 區塊清理 toggle 相關 CSS（若移除了自製 toggle markup）**

如果 view 內有 `.toggle` `.toggle-track` `.toggle-thumb` 等自訂 CSS rule，已被 M3Switch 替換後可移除（但保留也無妨，未被使用的 CSS 不會影響運作）。

- [ ] **Step 5: 跑 NotificationPrefs 相關測試**

```bash
npm run test -- NotificationPrefs 2>&1 | tail -10
```

Expected: 若有測試斷言 `<input type="checkbox">` 存在會失敗。看 fail 訊息決定：
- 若 test 用 `findComponent(M3Switch)` 或檢查 `update:modelValue` emit，會 PASS
- 若 test 用 `.toggle-input` selector 或 `find('input[type=checkbox]')`，需要視情況：保留一個 hidden checkbox（accessibility fallback）或調整 test selector

如果新增 failure，先**讀 test 內容**判斷修正策略。**不要動 test 本身**，調 component。

- [ ] **Step 6: 跑 parent baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 / 4 failed 不變。

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/NotificationPrefsView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): NotificationPrefsView 用 M3Switch 替換所有 toggle

- 每個通知偏好項目用 <M3Switch v-model="..." aria-label="..." />
- script setup reactive state / API call 完全不動
- M3 標誌性 track + thumb 動畫提供更清楚的 on/off 視覺

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: AnnouncementsView visual M3 化

**Files:**
- Modify: `src/parent/views/AnnouncementsView.vue`

公告列表頁。改動：
- 列表項用 `.pt-card` → 改 M3Card 樣式
- 未讀 chip 改 M3 secondary-container
- 圓角統一

- [ ] **Step 1: Read AnnouncementsView**

```bash
cat src/parent/views/AnnouncementsView.vue
```

- [ ] **Step 2: 套 token 替換**

對 scoped style 區塊內：
| 找到 | 替換為 |
|------|-------|
| `var(--pt-card-radius, 14px)` | `12px` |
| `var(--pt-surface-card)` | `var(--m3-surface-container-low, var(--pt-surface-card))` |
| `var(--pt-shadow-card, var(--pt-elev-1))` | `var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)))` |
| `var(--pt-tint-announcement, ...)` (未讀 chip bg) | `var(--m3-secondary-container, var(--pt-tint-announcement, ...))` |
| `var(--pt-text-strong)` | `var(--m3-on-surface, var(--pt-text-strong))` |

- [ ] **Step 3: 跑 AnnouncementsView 相關測試**

```bash
npm run test -- Announcement 2>&1 | tail -10
```

- [ ] **Step 4: 跑 parent baseline**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/views/AnnouncementsView.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): AnnouncementsView visual M3 化

- 圓角 14 → 12px
- 引用 --m3-surface-container-low / --m3-elev-1 / --m3-secondary-container
- 未讀 chip M3 化

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 全套驗證

**Files:**
- 無檔案改動，純驗證

- [ ] **Step 1: 跑全套 m3 元件測試確認 P3 不爆**

```bash
npm run test -- src/parent/components/m3 2>&1 | tail -10
```

Expected: 135 全綠（無新增 failure）。

- [ ] **Step 2: 跑全套 parent 測試**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -10
```

Expected: 228 passed / 4 failed (pre-existing) — 不變。

- [ ] **Step 3: 跑 dev server 啟動確認**

```bash
(npm run dev 2>&1 &); DEV_PID=$!; sleep 6; kill $DEV_PID 2>/dev/null; wait 2>/dev/null
```

Expected: `VITE ... ready`。

- [ ] **Step 4: P4.1 commit 總計**

```bash
git log --oneline feat/parent-m3-phase-3-frontend..HEAD
```

Expected: 7 個 commit (Task 1-7)。

- [ ] **Step 5: 寫進度摘要到 .scratch（可選）**

無需 commit。

---

## Self-Review 後備檢查表

- [ ] ParentIcon refactor 為 M3Icon wrapper，全 app 自動切換到 Material Symbols
- [ ] iconMapping.js 含 38+ icon name 對應與 4 size 對應
- [ ] HomeHero / TodayStatusCards / TodoCenter / QuickActions / ChildrenStrip / PushCta 全套 visual refactor
- [ ] HomeView / MoreView 容器頁 visual refactor
- [ ] NotificationPrefsView 用 M3Switch 替換 toggle
- [ ] AnnouncementsView visual refactor
- [ ] 全部既有 script setup logic 不動（無 API call / reactive state 變更）
- [ ] 全部既有 props / events 簽名不動
- [ ] M3 元件測試 135 全綠（P3 不爆）
- [ ] Parent app baseline 228 / 4 failed (pre-existing) 不變

---

## P4.1 完成後

- 進 **P4.2 plan**（訊息 / 家校群 6 view：MessagesView / MessageThreadView / ContactBookView / ContactBookDetailView / EventsView / EventAckView）。
- P4.2 風險與 P4.1 相當；M3 chat bubble 是新東西需要設計。
- P4.2 plan 由 implementer 重新調用 writing-plans skill 寫，spec §7.2 為依據。
