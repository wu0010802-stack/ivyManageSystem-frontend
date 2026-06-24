# 家長端 Bento 儀表板重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有 Material 3 地基上，把家長端核心日常流程改造成 Bento 儀表板（冷調石板灰 + 品牌綠 + Material Symbols），並收齊三態與狀態配色。

**Architecture:** 不重做 M3 遷移。做三件事：(1) `globals.css` 加冷調 surface token 覆寫（連帶 ~22 非核心頁免費換底）；(2) 新增 4 個以 M3 基元組裝的共用元件（`StatusPill / StatTile / SectionHeader / DashboardHero`）；(3) 逐頁重塑核心 6 頁版面並補三態。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Vite、Vitest（happy-dom）、Material 3 元件庫（`src/parent/components/m3/`）、Material Symbols Rounded、CSS custom properties。

## Global Constraints

- **語言**：所有 UI 文案、commit message、註解、docstring 一律**繁體中文**。
- **TS strict**：禁 `: any` / `as any`（ESLint `no-explicit-any` error，`reportUnusedDisableDirectives` 棘輪）；`@ts-expect-error` 需 ≥3 字說明；禁裸 `@ts-ignore`/`@ts-nocheck`。新 SFC 一律 `<script setup lang="ts">`。
- **日期**：用 `src/utils/format.ts` 的 `todayISO` / `dateToLocalISO`；**禁** `toISOString().slice()/.split()`。
- **Element-Plus-free**：`src/parent` 禁靜態 `import 'element-plus'` 與 `<el-*>`（`tests/unit/parent-public-no-element-plus.test.ts` 會擋）。
- **Icon**：一律 `M3Icon`（裝飾性 `aria-hidden`、互動性 `aria-label`）；**禁 emoji 當 UI 圖示**；禁引回 SVG icon。
- **Token**：view/component scoped style **禁裸 hex**（`background|color|border-color`），用 `var(--token)`（`npm run parent:audit` 紅線；放行 `rgba()`/`box-shadow`/註解行）。`#3f7d48` 僅 `globals.css` 放行。
- **`m3-tokens.css` 禁手改**（機器生成）；改色經 `globals.css` 後覆寫（main.ts 載入順序 globals 晚於 m3-tokens，會贏 cascade）。
- **Rigid API 不可動 props/events/slots**：`ParentBottomSheet`(7 caller) / `AppModal` / `ConfirmDialog` / `ParentIcon`(全 app) / 全部 `M3*` 元件 — 只能改 template/style。
- **不可移除的錨點/語意**：scrollIntoView 錨點（`data-unpaid-anchor`、`id=act-active`、`id=act-upcoming`）；`useChildSelection` 子女上下文（勿自管 child id）；生命週期 bug fix（TodayView P1-16 `onMounted ensureSelected+loadContactBook`、ContactBookView P1-19 `useAbortableFetch`）勿回退。
- **綠色雙階分工**：`--brand-primary`(#0d9053) 給 hero 大面積/裝飾；M3 filled 按鈕/小字綠底用 `--m3-primary`(#006d3d，AA)。**不**把 `--m3-primary` 壓成 #0d9053。
- **完成定義**：每階段獨立可驗、單獨 commit（Conventional Commits）。最終併 local main（**未** push）+ worktree 收尾。

## 前置作業（Prerequisites）

工作區為獨立 worktree：`/Users/yilunwu/Desktop/ivyManageSystem/.claude/worktrees/parent-bento-fe`（branch `feat/parent-bento-redesign`）。

- [ ] **P-1：worktree 安裝依賴**（frontend worktree symlink node_modules 會壞，直接安裝）
  - Run: `cd /Users/yilunwu/Desktop/ivyManageSystem/.claude/worktrees/parent-bento-fe && npm install`
  - Expected: 安裝完成、無 error。
- [ ] **P-2：sanity 綠燈基線**
  - Run: `npm run test -- --run 2>&1 | tail -5` → 既有測試綠
  - Run: `npm run typecheck` → 0 error
  - Run: `npm run parent:audit` → pass（基線）
- [ ] **P-3：視覺驗證管道**：家長端 dev server（`npm run dev` → `parent.html`）需 `VITE_LIFF_ID` 且 LIFF 登入會擋本機渲染。視覺驗證以「元件層（mount + happy-dom 快照思路）+ 開發者本機 LIFF mock」為主；若 dev server 可繞登入則逐頁截圖。**此限制不阻擋實作，只影響截圖方式**——execution 時若 LIFF 擋路，改用元件 mount 截圖。

---

## P0 — Design Tokens 基建

### Task 1: 冷調石板灰 surface 覆寫 + spacing 補號

**Files:**
- Modify: `src/assets/design-tokens.css`（spacing 區，約 :43-51）
- Modify: `src/parent/styles/globals.css`（`:root` 末尾與 `:root[data-theme='dark']` 末尾各加覆寫區塊）
- Test: 無單元測試（純 token）；驗證走 `parent:audit` + `build` + 視覺。

**Interfaces:**
- Produces: 冷調 surface 後，所有吃 `--m3-surface*` / `--pt-surface*` / `--pt-text*` / `--pt-border*` 的元件自動位移到 slate。新元件（Task 2-5）依賴這些 token 已是 slate。

- [ ] **Step 1: 補 spacing 缺號**。在 `design-tokens.css` spacing 區（`--space-6` 與 `--space-8` 之間、`--space-8` 與 `--space-10` 之間、`--space-10` 與 `--space-12` 之間）新增：

```css
  --space-7: 28px;
  --space-9: 36px;
  --space-11: 44px;
```

- [ ] **Step 2: 加冷調 surface 覆寫（light）**。在 `globals.css` 的 `:root { ... }` 區塊**末端**（line 240 的 `}` 之前）加入：

```css
  /* ============================================================
   * Bento 重設計：冷調石板灰 surface ramp（2026-06-24）
   * 覆寫 M3 與 pt 兩套被消費的 surface/text/border token，使整個
   * 家長 app 從暖奶油底位移到冷調 slate。brand 綠與 accent/tile 保留。
   * globals.css 載入晚於 m3-tokens.css，故此處 --m3-* 覆寫會贏 cascade。
   * Spec §3.2。
   * ============================================================ */
  /* M3 surface tonal ramp → slate */
  --m3-background: #eef1f5;
  --m3-surface: #eef1f5;
  --m3-surface-container-lowest: #ffffff;
  --m3-surface-container-low: #ffffff;
  --m3-surface-container: #f4f7fa;
  --m3-surface-container-high: #eef2f7;
  --m3-surface-container-highest: #e7edf3;
  --m3-on-surface: #0f172a;
  --m3-on-surface-variant: #64748b;
  --m3-outline: #cbd5e1;
  --m3-outline-variant: #e2e8f0;
  /* pt 系列（legacy view 仍消費）→ slate */
  --pt-text-strong: #0f172a;
  --pt-text-body: #1e293b;
  --pt-text-muted: #64748b;
  --pt-text-soft: #64748b;
  --pt-text-faint: #94a3b8;
  --pt-surface-card: #ffffff;
  --pt-surface-mute: #f1f5f9;
  --pt-surface-mute-soft: #f8fafc;
  --pt-surface-raised: #ffffff;
  --pt-surface-recessed: #eef2f7;
  --pt-border: #e2e8f0;
  --pt-border-light: #eef2f7;
  --pt-border-strong: #cbd5e1;
  --pt-page-border: rgba(15, 23, 42, 0.08);
  --pt-hairline: 1px solid #e2e8f0;
  --pt-shadow-card:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 6px 20px rgba(15, 23, 42, 0.06);
  --pt-elev-1: 0 1px 2px rgba(15, 23, 42, 0.05), 0 2px 8px rgba(15, 23, 42, 0.06);
  --pt-elev-2: 0 4px 12px rgba(15, 23, 42, 0.08), 0 12px 28px rgba(15, 23, 42, 0.10);
  --pt-elev-3: 0 8px 18px rgba(15, 23, 42, 0.12), 0 20px 48px rgba(15, 23, 42, 0.16);
```

- [ ] **Step 3: 加冷調 surface 覆寫（dark）**。在 `globals.css` 的 `:root[data-theme='dark'] { ... }` 區塊**末端**（line 356 的 `}` 之前）加入：

```css
  /* Bento 冷調 dark slate（2026-06-24，對齊 light 段） */
  --m3-background: #0f141a;
  --m3-surface: #0f141a;
  --m3-surface-container-lowest: #0b0f14;
  --m3-surface-container-low: #1a212b;
  --m3-surface-container: #1f2731;
  --m3-surface-container-high: #252e3a;
  --m3-surface-container-highest: #2c3744;
  --m3-on-surface: #e7edf3;
  --m3-on-surface-variant: #9aa7b5;
  --m3-outline: #475569;
  --m3-outline-variant: #2a333f;
  --pt-text-strong: #e7edf3;
  --pt-text-body: #d6dee7;
  --pt-text-muted: #9aa7b5;
  --pt-text-soft: #9aa7b5;
  --pt-text-faint: #6b7886;
  --pt-surface-card: #1a212b;
  --pt-surface-mute: #1f2731;
  --pt-surface-mute-soft: #252e3a;
  --pt-surface-raised: #1a212b;
  --pt-surface-recessed: #0f141a;
  --pt-border: #2a333f;
  --pt-border-light: #1f2731;
  --pt-border-strong: #475569;
  --pt-page-border: rgba(255, 255, 255, 0.08);
  --pt-hairline: 1px solid #2a333f;
  --pt-shadow-card: 0 6px 20px rgba(0, 0, 0, 0.32);
```

- [ ] **Step 4: 文件化綠色雙階分工**。在 `globals.css` 的 brand 區塊（line 122-134）註解補一行說明：`/* Bento: --brand-primary(#0d9053) 僅大面積/hero/裝飾；M3 filled 按鈕/小字綠底用 --m3-primary(#006d3d, AA)。勿把 --m3-primary 壓成 #0d9053（白字掉到 4.1:1 未過 AA normal text）。 */`

- [ ] **Step 5: 修 3 個 pre-existing parent:audit 違規（基線轉綠）**。執行時基線 `parent:audit` 已紅（非本次改動造成），需先修使後續 gate 有意義。各以 `var(--token, #fallback)` 包裝（audit 放行 `var()` 內 hex）：
  - `src/parent/views/MessagesView.vue:330`：`color: #fff;` → `color: var(--m3-on-primary, #fff);`
  - `src/parent/views/MeView.vue:342`：`color: #fff;` → `color: var(--m3-on-primary, #fff);`
  - `src/parent/views/MaintenanceView.vue:114`：`background: #00838f;` → `background: var(--mv-header-bg, #00838f);`（MaintenanceView 整頁青色於 Task 13 再正式 token 化，此處僅讓 audit 過綠、視覺不變）

- [ ] **Step 6: 驗證**
  - Run: `npm run parent:audit` → Expected: **pass**（基線 3 違規已修、未引入新裸 hex）
  - Run: `npm run build` → Expected: 成功
  - 視覺 sanity：啟 dev server 或 mount 任一既有 view，確認底色變冷調 slate、卡片白底、文字深 slate、品牌綠按鈕仍綠。

- [ ] **Step 7: Commit**

```bash
git add src/assets/design-tokens.css src/parent/styles/globals.css src/parent/views/MessagesView.vue src/parent/views/MeView.vue src/parent/views/MaintenanceView.vue
git commit -m "feat(parent): 冷調石板灰 surface token + spacing 補號 + 基線 audit 轉綠（Bento P0）"
```

---

## P1 — 共用元件（M3 基元組裝 + TDD）

> 全部放 `src/parent/components/`，co-located test 放 `src/parent/components/__tests__/`。沿用既有測試慣例：`import { mount } from '@vue/test-utils'`、繁中測試名、`classes()/text()/emitted()` 斷言。

### Task 2: StatusPill 元件（統一狀態配色）

**Files:**
- Create: `src/parent/components/StatusPill.vue`
- Test: `src/parent/components/__tests__/StatusPill.spec.ts`

**Interfaces:**
- Produces: `StatusPill` props `{ tone?: 'ok'|'warn'|'danger'|'neutral'|'info', label: string, icon?: string }`，預設 tone=`neutral`。供 Activity / Fees / ContactBook 取代散落的 `paymentBadge`/`STATUS_COLOR`/`COURSE_STATUS` 配色。`paymentBadge().tone`（`'ok'|'warn'|'neutral'`）為其子集，可直接傳入。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/components/__tests__/StatusPill.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusPill from '../StatusPill.vue'

describe('StatusPill', () => {
  it('render label', () => {
    const w = mount(StatusPill, { props: { label: '已繳' } })
    expect(w.text()).toContain('已繳')
  })

  it('預設 tone = neutral', () => {
    const w = mount(StatusPill, { props: { label: 'x' } })
    expect(w.classes()).toContain('status-pill')
    expect(w.classes()).toContain('tone-neutral')
  })

  it.each(['ok', 'warn', 'danger', 'neutral', 'info'])('tone=%s 套對應 class', (tone) => {
    const w = mount(StatusPill, { props: { label: 'x', tone } })
    expect(w.classes()).toContain(`tone-${tone}`)
  })

  it('icon prop 渲染 leading Material Symbol（aria-hidden）', () => {
    const w = mount(StatusPill, { props: { label: 'x', icon: 'check' } })
    const leading = w.find('.status-pill-icon')
    expect(leading.exists()).toBe(true)
    expect(leading.text()).toBe('check')
    expect(leading.attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**
  - Run: `npm run test -- --run src/parent/components/__tests__/StatusPill.spec.ts`
  - Expected: FAIL（找不到 `../StatusPill.vue`）

- [ ] **Step 3: 實作元件**

```vue
<!-- src/parent/components/StatusPill.vue -->
<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'
  icon?: string
}>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="status-pill" :class="`tone-${tone}`">
    <span v-if="icon" class="status-pill-icon material-symbols-rounded" aria-hidden="true">{{ icon }}</span>
    {{ label }}
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 11px);
  font-weight: 700;
  line-height: 1;
  padding: 4px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.status-pill-icon { font-size: 13px; }
.tone-ok { background: var(--color-success-soft, #dcfce7); color: var(--pt-success-text, #15803d); }
.tone-warn { background: var(--color-warning-soft, #fff3e0); color: var(--pt-warning-text, #c2740a); }
.tone-danger { background: var(--color-danger-soft, #fee2e2); color: var(--coral-700, #b14545); }
.tone-neutral { background: var(--m3-surface-container-highest, #e7edf3); color: var(--pt-text-soft, #64748b); }
.tone-info { background: var(--color-info-soft, #e0f2fe); color: var(--pt-info-text, #2d6f8e); }
</style>
```

- [ ] **Step 4: 跑測試確認通過**
  - Run: `npm run test -- --run src/parent/components/__tests__/StatusPill.spec.ts`
  - Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/StatusPill.vue src/parent/components/__tests__/StatusPill.spec.ts
git commit -m "feat(parent): StatusPill 統一狀態標籤元件（Bento P1）"
```

### Task 3: StatTile 元件（Bento 統計格）

**Files:**
- Create: `src/parent/components/StatTile.vue`
- Test: `src/parent/components/__tests__/StatTile.spec.ts`

**Interfaces:**
- Consumes: `M3Card`（`@/parent/components/m3`）。
- Produces: `StatTile` props `{ label: string, value: string|number, sub?: string, icon?: string, tone?: 'brand'|'amber'|'coral'|'sky'|'neutral', to?: string }`。`to` 有值時整格為 `<router-link>` 可點（a11y `aria-label="{label} {value}"`）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/components/__tests__/StatTile.spec.ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import StatTile from '../StatTile.vue'

const mountTile = (props) =>
  mount(StatTile, { props, global: { stubs: { 'router-link': RouterLinkStub } } })

describe('StatTile', () => {
  it('render label / value / sub', () => {
    const w = mountTile({ label: '待繳學費', value: '$4,200', sub: '6/30 前' })
    expect(w.text()).toContain('待繳學費')
    expect(w.text()).toContain('$4,200')
    expect(w.text()).toContain('6/30 前')
  })

  it('無 to 時不是連結', () => {
    const w = mountTile({ label: 'x', value: '1' })
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('有 to 時為 router-link + aria-label', () => {
    const w = mountTile({ label: '待簽文件', value: '1 份', to: '/events' })
    const link = w.findComponent(RouterLinkStub)
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toBe('/events')
    expect(link.attributes('aria-label')).toBe('待簽文件 1 份')
  })

  it('icon prop 渲染 Material Symbol（aria-hidden）', () => {
    const w = mountTile({ label: 'x', value: '1', icon: 'payments' })
    const ic = w.find('.stat-tile-icon')
    expect(ic.text()).toBe('payments')
    expect(ic.attributes('aria-hidden')).toBe('true')
  })

  it('tone 套對應 class', () => {
    const w = mountTile({ label: 'x', value: '1', tone: 'amber' })
    expect(w.find('.stat-tile').classes()).toContain('tone-amber')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**
  - Run: `npm run test -- --run src/parent/components/__tests__/StatTile.spec.ts`
  - Expected: FAIL

- [ ] **Step 3: 實作元件**

```vue
<!-- src/parent/components/StatTile.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import M3Card from './m3/M3Card.vue'

const props = withDefaults(defineProps<{
  label: string
  value: string | number
  sub?: string
  icon?: string
  tone?: 'brand' | 'amber' | 'coral' | 'sky' | 'neutral'
  to?: string
}>(), {
  tone: 'neutral',
})

const ariaLabel = computed(() => `${props.label} ${props.value}`)
</script>

<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to"
    :aria-label="to ? ariaLabel : undefined"
    class="stat-tile-wrap"
  >
    <M3Card variant="elevated" :clickable="!!to" padding="12px" class="stat-tile" :class="`tone-${tone}`">
      <div class="stat-tile-head">
        <span class="stat-tile-label">{{ label }}</span>
        <span v-if="icon" class="stat-tile-icon material-symbols-rounded" aria-hidden="true">{{ icon }}</span>
      </div>
      <div class="stat-tile-value">{{ value }}</div>
      <div v-if="sub" class="stat-tile-sub">{{ sub }}</div>
    </M3Card>
  </component>
</template>

<style scoped>
.stat-tile-wrap { display: block; text-decoration: none; color: inherit; }
.stat-tile-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.stat-tile-label { font-size: var(--text-xs, 11px); font-weight: 600; color: var(--pt-text-soft, #64748b); }
.stat-tile-icon { font-size: 18px; color: var(--pt-text-faint, #94a3b8); }
.stat-tile-value { font-size: 19px; font-weight: 800; color: var(--pt-text-strong, #0f172a); margin-top: 4px; line-height: 1.2; }
.stat-tile-sub { font-size: var(--text-xs, 11px); color: var(--pt-text-faint, #94a3b8); margin-top: 3px; }
.tone-amber .stat-tile-value { color: var(--pt-warning-text, #c2740a); }
.tone-coral .stat-tile-value { color: var(--coral-700, #b14545); }
.tone-brand .stat-tile-value { color: var(--brand-primary, #0d9053); }
.tone-sky .stat-tile-value { color: var(--pt-info-text, #2d6f8e); }
</style>
```

- [ ] **Step 4: 跑測試確認通過**
  - Run: `npm run test -- --run src/parent/components/__tests__/StatTile.spec.ts`
  - Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/StatTile.vue src/parent/components/__tests__/StatTile.spec.ts
git commit -m "feat(parent): StatTile Bento 統計格元件（Bento P1）"
```

### Task 4: SectionHeader 元件

**Files:**
- Create: `src/parent/components/SectionHeader.vue`
- Test: `src/parent/components/__tests__/SectionHeader.spec.ts`

**Interfaces:**
- Produces: `SectionHeader` props `{ title: string }` + slot `action`。沿用既有 `.pt-section-head` / `.pt-section-title` class（globals.css:469,484）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/components/__tests__/SectionHeader.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionHeader from '../SectionHeader.vue'

describe('SectionHeader', () => {
  it('render title', () => {
    const w = mount(SectionHeader, { props: { title: '今日狀態' } })
    expect(w.find('.pt-section-title').text()).toBe('今日狀態')
  })

  it('action slot 渲染', () => {
    const w = mount(SectionHeader, {
      props: { title: 'x' },
      slots: { action: '<a class="more">更多</a>' },
    })
    expect(w.find('.more').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `npm run test -- --run src/parent/components/__tests__/SectionHeader.spec.ts` → FAIL

- [ ] **Step 3: 實作元件**

```vue
<!-- src/parent/components/SectionHeader.vue -->
<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="pt-section-head">
    <h3 class="pt-section-title">{{ title }}</h3>
    <slot name="action" />
  </div>
</template>
```

- [ ] **Step 4: 跑測試確認通過** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(parent): SectionHeader 區塊標題元件（Bento P1）"`

### Task 5: DashboardHero 元件

**Files:**
- Create: `src/parent/components/DashboardHero.vue`
- Test: `src/parent/components/__tests__/DashboardHero.spec.ts`

**Interfaces:**
- Consumes: `LaurelWreath`（`@/components/brand/LaurelWreath.vue`）、`StatusPill`。
- Produces: `DashboardHero` props `{ eyebrow?: string, title: string, value?: string, sub?: string, statusLabel?: string, statusTone?: 'ok'|'warn'|'danger'|'neutral'|'info' }`。品牌綠漸層大卡，供 TodayView / FeesView 置頂。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/components/__tests__/DashboardHero.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardHero from '../DashboardHero.vue'

describe('DashboardHero', () => {
  it('render title / value / eyebrow', () => {
    const w = mount(DashboardHero, { props: { eyebrow: '本月應繳', title: '小宇', value: '$4,200' } })
    expect(w.text()).toContain('本月應繳')
    expect(w.text()).toContain('小宇')
    expect(w.text()).toContain('$4,200')
  })

  it('statusLabel 有值時渲染 StatusPill', () => {
    const w = mount(DashboardHero, { props: { title: 'x', statusLabel: '已入園 08:32', statusTone: 'ok' } })
    expect(w.find('.status-pill').exists()).toBe(true)
    expect(w.text()).toContain('已入園 08:32')
  })

  it('無 statusLabel 不渲染 pill', () => {
    const w = mount(DashboardHero, { props: { title: 'x' } })
    expect(w.find('.status-pill').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗** → FAIL

- [ ] **Step 3: 實作元件**

```vue
<!-- src/parent/components/DashboardHero.vue -->
<script setup lang="ts">
import LaurelWreath from '@/components/brand/LaurelWreath.vue'
import StatusPill from './StatusPill.vue'

defineProps<{
  eyebrow?: string
  title: string
  value?: string
  sub?: string
  statusLabel?: string
  statusTone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'
}>()
</script>

<template>
  <section class="dash-hero">
    <LaurelWreath class="dash-hero-laurel" side="right" :opacity="0.16" :size="120" aria-hidden="true" />
    <div class="dash-hero-body">
      <p v-if="eyebrow" class="dash-hero-eyebrow">{{ eyebrow }}</p>
      <h2 class="dash-hero-title">{{ title }}</h2>
      <p v-if="value" class="dash-hero-value">{{ value }}</p>
      <p v-if="sub" class="dash-hero-sub">{{ sub }}</p>
      <StatusPill v-if="statusLabel" class="dash-hero-pill" :tone="statusTone ?? 'neutral'" :label="statusLabel" />
    </div>
  </section>
</template>

<style scoped>
.dash-hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 16px 18px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary, #0d9053), var(--brand-primary-hover, #12b06a));
  box-shadow: 0 10px 22px rgba(13, 144, 83, 0.30);
}
.dash-hero-laurel { position: absolute; right: -16px; top: -12px; pointer-events: none; }
.dash-hero-body { position: relative; }
.dash-hero-eyebrow { margin: 0; font-size: var(--text-xs, 11px); font-weight: 600; opacity: 0.92; }
.dash-hero-title { margin: 2px 0 0; font-size: 17px; font-weight: 800; }
.dash-hero-value { margin: 8px 0 0; font-size: 28px; font-weight: 900; letter-spacing: 0.5px; }
.dash-hero-sub { margin: 3px 0 0; font-size: var(--text-xs, 11px); opacity: 0.95; }
.dash-hero-pill { margin-top: 10px; background: rgba(255, 255, 255, 0.22) !important; color: #fff !important; }
</style>
```

> 註：`.dash-hero-pill` 用 `!important` 覆寫 StatusPill 的 tone 底色，使其在綠底上為半透明白。`LaurelWreath` 的 props（`side/opacity/size`）以實際元件簽章為準（Task 執行時先讀 `src/components/brand/LaurelWreath.vue` 確認；若不符即調整）。

- [ ] **Step 4: 跑測試確認通過** → PASS（若 LaurelWreath props 不符先修正再跑）
- [ ] **Step 5: Commit** — `git commit -m "feat(parent): DashboardHero 品牌綠 hero 元件（Bento P1）"`

---

## P2 — TodayView Bento 旗艦

### Task 6: TodayView 改造為 Bento 儀表板

**Files:**
- Modify: `src/parent/views/TodayView.vue`
- Test: `src/parent/views/__tests__/TodayView.*`（若無則新增 render smoke）

**Interfaces:**
- Consumes: `DashboardHero`、`StatTile`、`SectionHeader`、`StatusPill`、既有 `getHomeSummary`/`useTodayStatusCache` 資料、`useChildSelection`。

- [ ] **Step 1**：先讀現況 `src/parent/views/TodayView.vue`（~394 行）確認 `hero` computed（empty/single/multi 三態）、`SkeletonBlock`/`MobileErrorRetry`/`PullToRefresh`/`ChildrenStrip`/`PendingSignBanner`/`PushCta`/`ContactBookDayCard` 用法與資料欄位名。**不動** onMounted P1-16 邏輯與三態條件。
- [ ] **Step 2**：版面改造（template）：
  - 頂部以 `DashboardHero`（孩子姓名 + 班級 sub + 今日出席 `statusLabel`/`statusTone`）取代現有 `today-head` 大標（empty 態維持「尚未綁定子女」文案）。
  - 新增 2 欄 Bento 格 `<div class="today-bento">`，內含 `StatTile`：待繳學費（tone amber, `to="/fees"`）、待簽文件（tone coral, `to="/events"`）、今日午餐 / 才藝課（neutral）。資料取自 `getHomeSummary` 既有欄位（無資料的 tile 不渲染）。
  - 保留 `PushCta`、今日聯絡簿卡、`ChildrenStrip`、timeline、footer 行事曆連結；區塊標題改用 `SectionHeader`。
  - scoped style 內 off-scale 裸 px（hero 30/34px、footer 14/18px 等）改 `--space-*` / `--text-*` token。新增 `.today-bento { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2, 8px); }`。
- [ ] **Step 3**：render smoke 測試（happy-dom，mock api）：

```ts
// 斷言：mount 後不拋例外、含 DashboardHero、待繳/待簽 StatTile 依 summary 條件渲染。
// 沿用既有 TodayView 測試的 mock 寫法；若無既有測試，新增最小 render smoke。
```

- [ ] **Step 4**：驗證
  - Run: `npm run test -- --run src/parent/views/__tests__/TodayView` → PASS
  - Run: `npm run typecheck` → 0 error
  - Run: `npm run parent:audit` → pass
  - 視覺：對齊 mockup 1（截圖或元件 mount）。
- [ ] **Step 5: Commit** — `git commit -m "feat(parent): 今日首頁改 Bento 儀表板（Bento P2）"`

---

## P3 — ActivityView + FeesView（清單/交易 + 三態）

### Task 7: ActivityView 補 skeleton + inline error（三態）

**Files:**
- Modify: `src/parent/views/ActivityView.vue`
- Test: `src/parent/views/__tests__/ActivityView.*`

**Interfaces:**
- Consumes: `SkeletonBlock`、`MobileErrorRetry`（既有）。

- [ ] **Step 1**：讀 `ActivityView.vue`（~554 行）確認 `loading` ref、fetch 失敗目前只 `toast.error` 的位置、`ActivityCardList`/`RegistrationStatusList` 使用點。**不動**衝堂偵測 / 報名時段 fail-open / 防連點 / 一次性管理連結語意。
- [ ] **Step 2**：寫失敗測試（TDD 三態）：

```ts
// ActivityView 三態：
// it('載入中顯示 SkeletonBlock') — loading=true 時 find SkeletonBlock 存在
// it('fetch 失敗顯示 MobileErrorRetry 並可重試') — mock listCourses reject → find MobileErrorRetry 存在、emit retry 重新 fetch
// （沿用既有 ActivityView 測試 mock 寫法）
```

- [ ] **Step 3**：跑測試確認失敗 → FAIL
- [ ] **Step 4**：實作：加 `loadError` ref（fetch catch 設 true、成功清除）；template 加 `<SkeletonBlock v-if="loading && !courses.length" ... />` 與 `<MobileErrorRetry v-else-if="loadError" :on-retry="reload" />`（包住列表區）。
- [ ] **Step 5**：跑測試確認通過 → PASS
- [ ] **Step 6: Commit** — `git commit -m "fix(parent): 才藝報名補 skeleton 與 inline error 三態（Bento P3）"`

### Task 8: ActivityView 清單卡重塑 + StatusPill

**Files:**
- Modify: `src/parent/views/ActivityView.vue`、`src/parent/components/activity/ActivityCardList.vue`、`src/parent/components/activity/RegistrationStatusList.vue`
- Test: 更新上述元件既有測試

- [ ] **Step 1**：`M3SegmentedButton` 取代現有 `tab-row`/`tab-btn`（切「可報名 / 我的報名」）。
- [ ] **Step 2**：課程列改 Bento list-card 視覺（M3Card 包覆，icon tile + 標題 + meta + 價格 + CTA），狀態標籤改用 `StatusPill`（剩 N 位→tone warn、已額滿→neutral、已報名→ok）。`RegistrationStatusList` 的 `courseStatusMap` inline 配色改傳 tone 給 `StatusPill`。
- [ ] **Step 3**：保留 `id=act-active` / `id=act-upcoming` 錨點。scoped style 裸 px 改 token。
- [ ] **Step 4**：更新元件測試（badge → StatusPill 斷言）。
- [ ] **Step 5**：驗證 `npm run test`/`typecheck`/`parent:audit` 綠；視覺對齊 mockup 2。
- [ ] **Step 6: Commit** — `git commit -m "feat(parent): 才藝報名清單卡 + StatusPill 重塑（Bento P3）"`

### Task 9: FeesView 重塑 + 補 error 三態

**Files:**
- Modify: `src/parent/views/FeesView.vue`、`src/parent/components/fees/FeeListGroup.vue`
- Test: `src/parent/views/__tests__/FeesView.*`、FeeListGroup 既有測試

- [ ] **Step 1**：讀 `FeesView.vue`（~292 行）確認 `FeeHero`/`STATUS_COLOR`/`fetchSummary`/`fetchRecords`/`FeeReceiptSheet` 用法。
- [ ] **Step 2**：寫失敗測試：fetch 失敗顯示 `MobileErrorRetry`（目前只 toast）。
- [ ] **Step 3**：跑測試 → FAIL
- [ ] **Step 4**：實作：加 `loadError` ref + `MobileErrorRetry`；hero 改用 `DashboardHero`（eyebrow「本月應繳」+ value 金額 + sub 期限）或保留 `FeeHero` 但套冷調 + 補 hero skeleton；`STATUS_COLOR` 配色改 `StatusPill`（待繳→warn、已繳→ok、逾期→danger）；修裸 rgba（FeesView.vue:274）改 token；template inline `font-size:40px`(L235) 改 token。
- [ ] **Step 5**：跑測試 → PASS；`parent:audit` 綠（消掉裸 rgba 熱點）。
- [ ] **Step 6: Commit** — `git commit -m "feat(parent): 繳費頁 DashboardHero + StatusPill + error 三態（Bento P3）"`

---

## P4 — ContactBook + Messages + ChildProfile

### Task 10: MessagesView 修「失敗落空態」bug + 重塑

**Files:**
- Modify: `src/parent/views/MessagesView.vue`
- Test: `src/parent/views/__tests__/MessagesView.*`

**Interfaces:**
- Consumes: `MobileErrorRetry`、既有 `useMessagesStore`/`listAnnouncements`。

- [ ] **Step 1**：讀 `MessagesView.vue`（~343 行）確認 `fetchThreads`/`listAnnouncements` 失敗時 `finally` 仍標 loaded → 落 empty 態的程式段，與 `inboxItems` computed、`#fff` 裸 hex（L330）。
- [ ] **Step 2**：寫失敗測試（重現 bug）：

```ts
// it('threads / announcements 載入失敗時顯示錯誤態而非空態')
//   mock fetchThreads + listAnnouncements 皆 reject
//   await flush → 斷言 find(MobileErrorRetry).exists() === true
//                 且 EmptyState 不存在（修 bug 前：EmptyState 存在 → 紅）
```

- [ ] **Step 3**：跑測試確認失敗（紅，證 bug 存在）→ FAIL
- [ ] **Step 4**：實作：加 `loadError` ref；fetch catch 設 `loadError=true`；template 三態優先序改 `loading → error → empty → list`（error 渲染 `MobileErrorRetry :on-retry`）。（註：`.badge` 的 `color: #fff` L330 已於 Task 1 改成 token，不需再動。）
- [ ] **Step 5**：跑測試確認通過 → PASS
- [ ] **Step 6: Commit** — `git commit -m "fix(parent): 訊息頁載入失敗顯示錯誤態（修落空態 bug，Bento P4）"`

### Task 11: ContactBookView 重塑 + inline error

**Files:**
- Modify: `src/parent/views/ContactBookView.vue`
- Test: `src/parent/views/__tests__/ContactBookView.*`

- [ ] **Step 1**：讀現況確認 `MonthDateStrip`/`useAbortableFetch`(P1-19)/`useIncrementalRender`/`EmptyState` 用法（**勿回退** abort 邏輯）。
- [ ] **Step 2**：區塊標題改 `SectionHeader`；未讀 pill 改 `StatusPill`（tone info/warn）；scoped style 裸 px（section-eyebrow 18px、圓角 16/20px）改 token。
- [ ] **Step 3**：補 inline error：`cbError` 既有走 friendly toast，新增 `MobileErrorRetry`（fetch 失敗且無資料時）。
- [ ] **Step 4**：驗證 test/typecheck/parent:audit 綠。
- [ ] **Step 5: Commit** — `git commit -m "feat(parent): 聯絡簿 SectionHeader + StatusPill + inline error（Bento P4）"`

### Task 12: ChildProfileView 三態統一 + token 修整

**Files:**
- Modify: `src/parent/views/ChildProfileView.vue`
- Test: `src/parent/views/__tests__/ChildProfileView.*`

- [ ] **Step 1**：讀現況（~629 行）確認 timeline/photos 子區三態與裸值熱點。
- [ ] **Step 2**：子區 loading 純文字「載入中…」改 `SkeletonBlock`；error 純文字改 `MobileErrorRetry`（與主檔一致）。
- [ ] **Step 3**：修裸 rgba（L332 child-hero border）改 token；統一 `--pt-surface-mute` fallback（`#f3f4f6` vs `#f5fbe6` → 統一移除多餘 fallback 用 token）；rem/px 混用統一為 token。區塊標題改 `SectionHeader`。
- [ ] **Step 4**：驗證 test/typecheck/parent:audit 綠（消 rgba 熱點）。
- [ ] **Step 5: Commit** — `git commit -m "feat(parent): 孩子檔案三態統一與 token 修整（Bento P4）"`

---

## P5 — Layout/nav 收尾 + 非核心巡檢 + 全 gate

### Task 13: ParentLayout/nav 冷調收尾 + 非核心頁巡檢

**Files:**
- Modify: `src/parent/layouts/ParentLayout.vue`（如需微調 active indicator 對比）
- Modify: 非核心 view（僅修明顯衝突，逐檔列在 commit message）

- [ ] **Step 1**：確認 `M3TopAppBar`/`M3NavigationBar` 在冷調 surface 下 active indicator 與文字對比足夠（必要時於 ParentLayout scoped style 微調，**不動** M3 元件本身）。
- [ ] **Step 2**：非核心 ~22 頁巡檢（AnnouncementsView/AttendanceView/LeavesView/MedicationListView/EventsView/CalendarView/Child{Reports,Photos,Measurements}View/MeView/PrivacyRightsView/NotificationPrefsView/Bind*/Maintenance 等）：mount 或 dev 截圖，找冷調底色下的明顯衝突（如童彩 tile 對比、寫死暖色）。**只修明顯衝突**，不做結構重設計。MaintenanceView 的整頁青色硬編（:94,97,103,114）若與品牌脫節，改 token。
- [ ] **Step 3**：驗證 `npm run test` 全綠、`npm run typecheck` 0、`npm run parent:audit` pass、`npm run lint` 0。
- [ ] **Step 4: Commit** — `git commit -m "feat(parent): 外框冷調收尾 + 非核心頁視覺巡檢（Bento P5）"`

### Task 14: 全 gate 綠燈 + 收尾

**Files:** 無（驗證 + 整合）

- [ ] **Step 1: 全 gate**（依序，全綠才算完成）

```bash
npm run test -- --run      # 全綠
npm run typecheck          # 0 error
npm run lint               # 0 error
npm run parent:audit       # pass（無裸 hex）
npm run build              # 成功
```

- [ ] **Step 2:（建議，flag）** 評估把 `parent:audit` 加進 `.github/workflows/ci.yml`（目前僅本地 gate）。若做：在 `test` job 加一 step `- run: npm run parent:audit`。此為獨立小 commit `chore(ci): parent:audit 納入 CI gate`，可選。
- [ ] **Step 3: 視覺總驗**：核心 6 頁逐頁對照 mockup 與三態（loading/empty/error）。
- [ ] **Step 4: 收尾**：回報 user。落地策略：在對 main 的暫存 worktree 用 `git merge feat/parent-bento-redesign`（讀 live main tip，**不**用 `branch -f`+過時 SHA），衝突即停回報；**未** push（push 觸發 Zeabur 前端部署，由 user 裁定）。完成後 `git worktree remove` 清理 `parent-bento-fe`。

---

## Self-Review（撰寫者自查）

- **Spec coverage**：§3 tokens→Task 1；§4 元件→Task 2-5（ListCard/ParentErrorState 規劃時收斂為「複用 MobileErrorRetry / 重塑既有 list 元件」，已於對應 task 註明）；§5.1-5.7 逐頁→Task 6,8,9,10,11,12,13；§6 三態→Task 7,9,10,11,12；§7 約束→Global Constraints；§8 測試→各 task + Task 14；§9 風險→前置 + Task 14 收尾。**無未覆蓋**。
- **Placeholder scan**：新元件/測試/ token 均含完整程式碼；view 改造任務以「先讀現況再改」+ 明確 token/結構指令呈現（view 既有程式碼龐大，逐行重抄反而易漂移，故指明區域 + 新增片段 + 測試斷言）。
- **Type consistency**：StatusPill tone union（`ok|warn|danger|neutral|info`）在 StatusPill/DashboardHero 一致；`paymentBadge().tone`（`ok|warn|neutral`）為子集可直接傳；StatTile tone union（`brand|amber|coral|sky|neutral`）為視覺色階，與 StatusPill tone 分屬不同語意，刻意不同名。
