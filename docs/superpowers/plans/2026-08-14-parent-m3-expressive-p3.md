# 家長端 M3 Expressive 改版 P3（首頁＋聯絡簿重排＋插畫落位）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 spec §9 P3（首頁＋聯絡簿重排至 mockup 形）與 §6（插畫落位）：首頁新增問候語＋插畫、Bento tile 撞色修正、聯絡簿卡三格化（午餐/午睡/心情）＋插畫裝飾、今日動態 timeline 全面改版為童彩 icon 方塊列表。

**Architecture:** 依 mockup（`docs/mockups/2026-08-14-parent-liff-direction-a-m3-expressive.html`，已由使用者核可）逐區塊施工，全部消費 P1 已建立的 token（`--pt-gradient-hero`／`--pt-hero-radius`／童彩五組 `--pt-accent-*-container/-on`／`--motion-*`）。新插畫走 inline SVG，仿 `KawaiiStar.vue` 風格，放 `src/parent/components/illustrations/`（進 parent-app eager chunk，需顧首屏 245KB 預算）。

**Tech Stack:** Vue 3 SFC（`<script setup lang="ts">`）、Vitest（`@vue/test-utils` mount + `vi.useFakeTimers`/`vi.setSystemTime`）。

**Spec:** `docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md` §6／§9

## Global Constraints

- **分支基底＝P1 分支 `feat/parent-m3-expressive-p1` 的 HEAD**（非 `origin/staging`）：本批依賴 P1 的 token 與元件成果，且會繼續修改 P1 已動過的 `ContactBookDayCard.vue`。嚴禁在共用 checkout 切分支，一律 worktree。
- **範圍已與使用者核可**：首頁「今日動態」timeline 全面改版為 mockup 的「分隔列表 + 童彩 icon 方塊」樣式（2026-08-14 使用者明確選擇，非預設假設）。
- **兩個刻意限縮範圍的決策**（技術約束明確，未再詢問使用者）：
  1. **`MoodBadge.vue` 不換成 SVG 插畫**，維持 emoji 渲染。mockup 只示範「開心」一種心情；若五種心情（`happy`/`normal`/`tired`/`sad`/`sick`）都畫成插畫，加上問候語與裝飾插畫，容易逼近 spec §6「總量首波 ≤10 張」上限與 parent 首屏 gz 預算餘裕（P2 完成時 231.3KB／245KB，餘裕約 13.7KB）。
  2. **Hero 卡的「blob」有機裝飾是純 CSS `border-radius` 疊層**（`46% 54% 58% 42% / 48% 42% 58% 52%`），不是 SVG，不占插畫資產預算，已被 P1 遺漏，本批一併補上。
- **架構決策：timeline 的 tone→icon 對照表放在展示層 `TodayTimelineItem.vue`，不修改 `useTodayTimeline.ts` 的資料結構**。理由：icon 只是純展示邏輯，把它留在資料層會多動十幾處事件 push 點、多一批測試要更新；放展示層一個檔案內建常數表即可達到同樣視覺效果，風險大幅降低。`useTodayTimeline.test.js`／`useTodayTimeline.routeParity.test.js` 兩支既有測試因此完全不受影響，不需要碰。
- **11 種既有語意 tone 保留不砍**（success/leave/muted/violet/info/danger/money/event/message/activity/announcement），映射到 5 組童彩色階（同色階允許多個語意共用，例如 success 與 announcement 皆用 leaf），不強行砍成 mockup 示範的 4 色。
- **ContactBookDayCard 三格順序＝mockup 順序**：午餐（sun）→ 午睡（grape）→ 心情（leaf，若有）；體溫、照片維持動態附加（不砍既有資訊，mockup 未涵蓋這兩項的邊界情況，用現有機制自然延伸）。
- **MoodBadge 的 `show-label` 在聯絡簿詳情頁 hero 改為不使用**：文字說明改由外部新增的 `mood-tag` chip 呈現（對齊 mockup「大 emoji + 獨立文字 chip」設計），避免文字重複顯示。
- **`TodayTimelineItem.vue` 的 `isFirst`/`isLast` props 保留定義但不再消費**：避免同時修改 `TodayTimeline.vue` 的呼叫端與造成 attribute fallthrough 到 `<li>` 根元素的髒 HTML。
- 元件 API（props/emits/slots）除本計畫明確列出的異動外零變動；既有測試斷言若因結構調整過時，同步更新為同等精確的新斷言（非放寬）。
- 測試指令不可接 `| tail`；vitest 目標檔單獨跑；全量測試與 typecheck 不同時背景執行（P1/P2 已驗證會 OOM，機器僅 8GB RAM）。
- typecheck 若 OOM，用 `NODE_OPTIONS="--max-old-space-size=6144" npx vue-tsc --noEmit`。
- 收尾 gate：`npm run test`、`npm run typecheck`、`npm run build` 三綠；新增插畫後**務必**確認 parent 首屏 gz 未破 245KB 預算（Task 10 專門驗證）。
- Commit 訊息繁體中文、Conventional Commits，結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。**不 push**，本計畫終點是本地完成＋驗證綠。

---

### Task 1: 開 worktree

**Files:**
- 無程式碼變更

**Interfaces:**
- Produces: worktree `~/Desktop/ivy-frontend/.claude/worktrees/parent-p3`，分支 `feat/parent-m3-expressive-p3`，基底＝P1 分支 HEAD。

- [ ] **Step 1: 確認 P1 分支 HEAD 並開 worktree**

```bash
cd ~/Desktop/ivy-frontend
git rev-parse feat/parent-m3-expressive-p1
git worktree add .claude/worktrees/parent-p3 -b feat/parent-m3-expressive-p3 feat/parent-m3-expressive-p1
```

- [ ] **Step 2: node_modules symlink**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/parent-p3
ln -s ~/Desktop/ivy-frontend/node_modules node_modules
```

- [ ] **Step 3: baseline——本次會動到的既有測試須綠**

```bash
npx vitest run src/parent/components/__tests__/StatTile.spec.ts src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts src/parent/views/__tests__/TodayView.hero.test.ts tests/unit/parent/views/TodayView.test.js tests/unit/parent/components/home-timeline/TodayTimeline.test.js tests/unit/parent/composables/useTodayTimeline.test.js tests/unit/parent/composables/useTodayTimeline.routeParity.test.js src/parent/views/__tests__/ContactBookDetailView.raceGuard.test.ts tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js
```
Expected: 全 PASS。

---

### Task 2: 問候插畫元件（太陽版、月亮版）

**Files:**
- Create: `src/parent/components/illustrations/GreetingSunIllustration.vue`
- Create: `src/parent/components/illustrations/GreetingMoonIllustration.vue`
- Test: `tests/unit/parent/components/illustrations/greetingIllustrations.spec.ts`（新建）

**Interfaces:**
- Produces: 兩個零 props 的展示型元件，供 Task 3 的 TodayView.vue 依時段切換使用。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/components/illustrations/greetingIllustrations.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GreetingSunIllustration from '@/parent/components/illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '@/parent/components/illustrations/GreetingMoonIllustration.vue'

describe('問候插畫元件', () => {
  it('GreetingSunIllustration 渲染 svg 且 aria-hidden', () => {
    const w = mount(GreetingSunIllustration)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })
  it('GreetingMoonIllustration 渲染 svg 且 aria-hidden', () => {
    const w = mount(GreetingMoonIllustration)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/components/illustrations/greetingIllustrations.spec.ts
```
Expected: FAIL（檔案不存在）。

- [ ] **Step 3: 實作 GreetingSunIllustration.vue**

```vue
<script setup lang="ts">
/**
 * 問候語插畫（早安/午安）：太陽 + 雲朵，仿 KawaiiStar.vue 極簡風格。
 * 零 props，純裝飾用途。
 */
</script>

<template>
  <svg class="greeting-sun-illustration" width="92" height="66" viewBox="0 0 92 66" fill="none" aria-hidden="true">
    <circle cx="60" cy="28" r="17" fill="#FFD75E" />
    <g stroke="#FFC93C" stroke-width="3.4" stroke-linecap="round">
      <line x1="60" y1="4" x2="60" y2="0.5" />
      <line x1="77" y1="11" x2="80" y2="8" />
      <line x1="84" y1="28" x2="88" y2="28" />
      <line x1="77" y1="45" x2="80" y2="48" />
    </g>
    <circle cx="54.5" cy="26" r="1.9" fill="#8a6d1d" />
    <circle cx="65.5" cy="26" r="1.9" fill="#8a6d1d" />
    <path d="M55 32 Q60 36.5 65 32" stroke="#8a6d1d" stroke-width="2" stroke-linecap="round" fill="none" />
    <path d="M4 52 a10 10 0 0 1 10-9 a12 12 0 0 1 23-3 a9 9 0 0 1 9 12 z" fill="#fff" stroke="#cfe8f4" stroke-width="2.5" />
  </svg>
</template>
```

- [ ] **Step 4: 實作 GreetingMoonIllustration.vue**

```vue
<script setup lang="ts">
/**
 * 問候語插畫（晚安）：月亮 + 星星，仿 KawaiiStar.vue 極簡風格。
 * 零 props，純裝飾用途。
 */
</script>

<template>
  <svg class="greeting-moon-illustration" width="86" height="62" viewBox="0 0 86 62" fill="none" aria-hidden="true">
    <path d="M66 12 a17 17 0 1 0 8 30 a17 17 0 0 1 -8 -30 z" fill="#FFD75E" />
    <g fill="#a5dff2">
      <path d="M28 8 l1.8 4 4 1.8 -4 1.8 -1.8 4 -1.8 -4 -4 -1.8 4 -1.8 z" />
      <path d="M42 34 l1.3 2.8 2.8 1.3 -2.8 1.3 -1.3 2.8 -1.3 -2.8 -2.8 -1.3 2.8 -1.3 z" opacity="0.7" />
    </g>
  </svg>
</template>
```

- [ ] **Step 5: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/components/illustrations/greetingIllustrations.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/illustrations/GreetingSunIllustration.vue src/parent/components/illustrations/GreetingMoonIllustration.vue tests/unit/parent/components/illustrations/greetingIllustrations.spec.ts
git commit -m "feat(parent): 新增問候語插畫元件（太陽/月亮，spec §6 插畫落位）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 首頁問候語整合進 TodayView.vue

**Files:**
- Modify: `src/parent/views/TodayView.vue`
- Test: `src/parent/views/__tests__/TodayView.greeting.test.ts`（新建）

**Interfaces:**
- Consumes: Task 2 的兩個插畫元件
- Produces: `today-head` 區塊新增問候語大字階標題 + 對應插畫，不影響既有 `today-date`／`ChildContextHeader` 排列。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/views/__tests__/TodayView.greeting.test.ts
/**
 * 首頁問候語（P3 mockup 落位）：依時段顯示「早安/午安/晚安」+ 對應插畫。
 * 沿用 TodayView.hero.test.ts 同款 mock 手法（見該檔案），只新增問候語斷言。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import GreetingSunIllustration from '@/parent/components/illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '@/parent/components/illustrations/GreetingMoonIllustration.vue'

vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
}))
const summaryDataRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({ data: summaryDataRef, error: ref(null), pending: ref(false), refresh: vi.fn() }),
}))
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({ status: ref(null), refresh: vi.fn() }),
}))
vi.mock('@/parent/api/bus', () => ({
  getBusToday: vi.fn().mockResolvedValue({ data: { trip: null, children: [] } }),
}))
vi.mock('@/parent/composables/useTodayTimeline', () => ({
  useTodayTimeline: () => ({ buckets: ref([]) }),
}))
vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { clearChildSelection } from '@/parent/composables/useChildSelection'

async function mountToday() {
  const TodayView = (await import('@/parent/views/TodayView.vue')).default
  const wrapper = shallowMount(TodayView, {
    global: {
      stubs: { PullToRefresh: { template: '<div class="ptr-stub"><slot /></div>' } },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  clearChildSelection()
  try { localStorage.clear() } catch { /* happy-dom 防呆 */ }
  summaryDataRef.value = {
    me: { can_push: true },
    children: [{ student_id: 1, name: '小明', classroom_name: '向日葵班' }],
    summary: {},
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayView — 問候語（P3）', () => {
  it('上午 8 點 → 早安 + 太陽插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 8, 0, 0))
    const wrapper = await mountToday()
    expect(wrapper.find('.today-greet').text()).toBe('早安！')
    expect(wrapper.findComponent(GreetingSunIllustration).exists()).toBe(true)
    wrapper.unmount()
  })

  it('下午 3 點 → 午安 + 太陽插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 15, 0, 0))
    const wrapper = await mountToday()
    expect(wrapper.find('.today-greet').text()).toBe('午安！')
    expect(wrapper.findComponent(GreetingSunIllustration).exists()).toBe(true)
    wrapper.unmount()
  })

  it('晚上 9 點 → 晚安 + 月亮插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 21, 0, 0))
    const wrapper = await mountToday()
    expect(wrapper.find('.today-greet').text()).toBe('晚安！')
    expect(wrapper.findComponent(GreetingMoonIllustration).exists()).toBe(true)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/parent/views/__tests__/TodayView.greeting.test.ts
```
Expected: FAIL（`.today-greet` 不存在）。

- [ ] **Step 3: 實作——TodayView.vue script 新增問候語邏輯**

於 `<script setup>` 內，import 區塊新增：

```ts
import GreetingSunIllustration from '../components/illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '../components/illustrations/GreetingMoonIllustration.vue'
```

在既有 `todayDateLine` computed 附近新增：

```ts
type GreetingPeriod = 'morning' | 'noon' | 'evening'

const GREETING_TEXT: Record<GreetingPeriod, string> = {
  morning: '早安！',
  noon: '午安！',
  evening: '晚安！',
}

function greetingPeriod(): GreetingPeriod {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'noon'
  return 'evening'
}

const greetingText = computed(() => GREETING_TEXT[greetingPeriod()])
const isEveningGreeting = computed(() => greetingPeriod() === 'evening')
```

- [ ] **Step 4: 實作——template 修改 `today-head` 區塊**

```html
<!-- 頂部：日期 + 多寶切換（單孩姓名由今日卡呈現，不重複） -->
<div class="today-head">
  <div class="today-greet-row">
    <div>
      <h1 class="today-greet">{{ greetingText }}</h1>
      <p class="today-date">{{ todayDateLine }}</p>
    </div>
    <GreetingMoonIllustration v-if="isEveningGreeting" class="today-greet-art" />
    <GreetingSunIllustration v-else class="today-greet-art" />
  </div>
  <ChildContextHeader v-if="children.length > 1" variant="hero" class="today-cch" />
</div>
```

- [ ] **Step 5: 實作——style 新增問候語樣式**

於 `<style scoped>` 內，`.today-date` 規則之前新增：

```css
.today-greet-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.today-greet {
  margin: 0;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0.01em;
  line-height: 1.15;
  color: var(--pt-text-strong);
}
.today-greet-art {
  flex-shrink: 0;
  margin-bottom: -2px;
}
```

`.today-date` 原本的 `padding: var(--space-6, 24px) var(--space-4, 16px) 0;` 屬於 `.today-head`，不受影響；`.today-date` 本身字級樣式維持不動（作為問候語下方的次要日期說明）。

- [ ] **Step 6: 跑測試確認通過**

```bash
npx vitest run src/parent/views/__tests__/TodayView.greeting.test.ts src/parent/views/__tests__/TodayView.hero.test.ts tests/unit/parent/views/TodayView.test.js
```
Expected: 全 PASS（後兩支既有測試不斷言 `today-head` 內部結構，不受影響）。

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/TodayView.vue src/parent/views/__tests__/TodayView.greeting.test.ts
git commit -m "feat(parent): 首頁新增問候語（早安/午安/晚安）+ 對應插畫（spec §6）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: StatTile 新增 tone-leaf ＋ Bento tile 撞色修正

**Files:**
- Modify: `src/parent/components/StatTile.vue`
- Modify: `src/parent/views/TodayView.vue`
- Test: `src/parent/components/__tests__/StatTile.spec.ts`（追加）

**Interfaces:**
- Consumes: P1 已建立的 `--pt-accent-leaf-container`/`--pt-accent-leaf-on`
- Produces: `StatTile` `tone` prop 新增 `'leaf'` 選項；TodayView 的「臨時接送」tile 改用新色，消解與「待簽文件」的撞色。

- [ ] **Step 1: 追加失敗測試**

於 `src/parent/components/__tests__/StatTile.spec.ts` 末尾新增：

```ts
  it('tone=leaf 套對應 class', () => {
    const w = mountTile({ label: 'x', value: '1', tone: 'leaf' })
    expect(w.find('.stat-tile').classes()).toContain('tone-leaf')
  })
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/parent/components/__tests__/StatTile.spec.ts
```
Expected: 新增測試 PASS（class binding 是動態字串拼接，`tone-leaf` 已經會出現，這條其實不會失敗——**驗證**：`:class="`tone-${tone}`"` 是純模板字串，不受 `tone` union 型別是否含 `'leaf'` 影響，執行期沒有守衛擋掉未知值，故測試在 Step 3 之前就會過。若 Step 2 意外全綠，直接跳到 Step 3 補型別與樣式，Step 4 仍要跑一次確認樣式生效（用 `getComputedStyle` 或至少確認 class 存在），不影響流程完整性）。

- [ ] **Step 3: 實作——StatTile.vue 型別與樣式**

`tone` prop 型別：

```ts
tone?: 'brand' | 'amber' | 'coral' | 'sky' | 'leaf' | 'neutral'
```

`<style scoped>` 新增：

```css
.tone-leaf .stat-tile-value { color: var(--pt-accent-leaf-on); }
```

（沿用既有 `.tone-amber .stat-tile-value` 等寫法的一致模式，只設文字色，不動底色——StatTile 目前 tone 只控文字色不控底色，維持既有慣例不擴大改動面。）

- [ ] **Step 4: TodayView.vue「臨時接送」tile 改色**

```html
<StatTile
  v-if="pickupActiveCount > 0"
  label="臨時接送"
  :value="`${pickupActiveCount} 筆進行中`"
  icon="hail"
  tone="leaf"
  to="/pickup"
/>
```

（原本 `tone="coral"` 改為 `tone="leaf"`，對齊 mockup 四色配置且消解與「待簽文件」的撞色。）

- [ ] **Step 5: 跑測試確認通過**

```bash
npx vitest run src/parent/components/__tests__/StatTile.spec.ts tests/unit/parent/views/TodayView.test.js
```
Expected: 全 PASS（`TodayView.test.js` 已核實沒有斷言「臨時接送」tile 的 tone 值，見計畫撰寫時的盤點確認）。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/StatTile.vue src/parent/components/__tests__/StatTile.spec.ts src/parent/views/TodayView.vue
git commit -m "fix(parent): StatTile 新增 tone-leaf，消解首頁 Bento tile「臨時接送/待簽文件」撞色

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ContactBookDayCard stats 三格化（午餐/午睡/心情）＋ per-stat tonal 底色

**Files:**
- Modify: `src/parent/components/contact-book/ContactBookDayCard.vue`
- Test: `src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts`（追加）

**Interfaces:**
- Consumes: P1 童彩 token；既有 `ContactBookEntry.mood` 欄位
- Produces: `stats` computed 新增心情格（順序：午餐→午睡→心情→體溫→照片），每格依 `tone` 走童彩 tonal container。

- [ ] **Step 1: 追加失敗測試**

於 `ContactBookDayCard.spec.ts` 的 `full 態` describe 內新增：

```ts
    it('心情有值時 stats 新增心情格，順序為午餐/午睡/心情', () => {
      const w = mount(ContactBookDayCard, {
        props: { entry: fullEntry, studentName: '小明', classroomName: '中班' },
      })
      const labels = w.findAll('.stat-label').map((n) => n.text())
      expect(labels.slice(0, 3)).toEqual(['午餐', '午睡', '心情'])
      expect(w.text()).toContain('開心')
    })

    it('心情格底色走童彩 leaf tonal', () => {
      const w = mount(ContactBookDayCard, {
        props: { entry: fullEntry, studentName: '小明' },
      })
      const moodStat = w.findAll('.stat').find((s) => s.classes().includes('stat-leaf'))
      expect(moodStat).toBeTruthy()
    })

    it('無心情值時不渲染心情格', () => {
      const noMood = { ...fullEntry, mood: undefined }
      const w = mount(ContactBookDayCard, {
        props: { entry: noMood, studentName: '小明' },
      })
      const labels = w.findAll('.stat-label').map((n) => n.text())
      expect(labels).not.toContain('心情')
    })
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts
```
Expected: 新增 3 條 FAIL。

- [ ] **Step 3: 實作——`stats` computed 重寫**

```ts
const MOOD_STAT_ICON: Record<string, string> = {
  happy: 'sentiment_very_satisfied',
  normal: 'sentiment_neutral',
  tired: 'bedtime',
  sad: 'sentiment_dissatisfied',
  sick: 'sick',
}
const MOOD_STAT_TEXT: Record<string, string> = {
  happy: '開心', normal: '普通', tired: '想睡', sad: '難過', sick: '不舒服',
}

const stats = computed(() => {
  const e = props.entry
  const out: { key: string; label: string; value: string | number; icon: string; tone: string }[] = []
  if (!e) return out
  if (e.meal_lunch != null) out.push({ key: 'lunch', label: '午餐', value: `${e.meal_lunch}/3`, icon: 'restaurant', tone: 'sun' })
  if (e.nap_minutes != null) out.push({ key: 'nap', label: '午睡', value: `${e.nap_minutes} 分`, icon: 'bedtime', tone: 'grape' })
  if (e.mood && MOOD_STAT_TEXT[e.mood]) {
    out.push({ key: 'mood', label: '心情', value: MOOD_STAT_TEXT[e.mood], icon: MOOD_STAT_ICON[e.mood], tone: 'leaf' })
  }
  if (e.temperature_c != null) out.push({ key: 'temp', label: '體溫', value: `${e.temperature_c}°`, icon: 'thermostat', tone: 'sky' })
  if (photoCount.value > 0) out.push({ key: 'photo', label: '照片', value: photoCount.value, icon: 'photo_camera', tone: 'coral' })
  return out
})
```

- [ ] **Step 4: template——stat class 改用 tone 驅動**

```html
<div v-if="isFull && stats.length" class="stats">
  <div v-for="s in stats" :key="s.key" class="stat" :class="`stat-${s.tone}`">
    <span class="stat-icon" aria-hidden="true">
      <span class="material-symbols-rounded">{{ s.icon }}</span>
    </span>
    <span class="stat-value">{{ s.value }}</span>
    <span class="stat-label">{{ s.label }}</span>
  </div>
</div>
```

- [ ] **Step 5: style——移除 key-based 舊規則，改用 tone-based tonal container**

移除：

```css
.stat-lunch .stat-icon { color: var(--coral-600, #e96b6b); }
.stat-nap   .stat-icon { color: var(--grape-700, #6e3f94); }
.stat-temp  .stat-icon { color: var(--sun-700, #c99500); }
.stat-photo .stat-icon { color: var(--sky-700, #2d6f8e); }
```

改為：

```css
.stat-sun   { background: var(--pt-accent-sun-container); }
.stat-sun .stat-icon, .stat-sun .stat-value { color: var(--pt-accent-sun-on); }
.stat-grape { background: var(--pt-accent-grape-container); }
.stat-grape .stat-icon, .stat-grape .stat-value { color: var(--pt-accent-grape-on); }
.stat-leaf  { background: var(--pt-accent-leaf-container); }
.stat-leaf .stat-icon, .stat-leaf .stat-value { color: var(--pt-accent-leaf-on); }
.stat-sky   { background: var(--pt-accent-sky-container); }
.stat-sky .stat-icon, .stat-sky .stat-value { color: var(--pt-accent-sky-on); }
.stat-coral { background: var(--pt-accent-coral-container); }
.stat-coral .stat-icon, .stat-coral .stat-value { color: var(--pt-accent-coral-on); }
```

`.stat` 本身移除原本統一的 `background: color-mix(...)` 一行（改由上述 tone-based 規則決定），其餘 `padding`/`border-radius`/`text-align` 等版面屬性保留：

```css
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 6px 8px;
  border-radius: 14px;
  text-align: center;
}
```

`.stat-icon` 內既有 `color: var(--brand-primary, #0d9053);` 預設值移除（改由 tone 規則決定顏色，不留寫死 fallback 蓋掉 tone class）。

- [ ] **Step 6: 跑測試確認通過**

```bash
npx vitest run src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts
```
Expected: 全 PASS（含既有測試——`awaiting`/`offday` 態 `stats.length` 仍為 0，因為 `stats` computed 在 `!e` 時直接回空陣列，`isFull` 才會顯示 `.stats` 區塊，邏輯不變）。

- [ ] **Step 7: 跑受影響的上游測試**

```bash
npx vitest run src/parent/views/__tests__/TodayView.hero.test.ts
```
Expected: 全 PASS（該測試斷言 `ContactBookDayCard` 的 props 而非內部 stats 渲染，不受影響）。

- [ ] **Step 8: Commit**

```bash
git add src/parent/components/contact-book/ContactBookDayCard.vue src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts
git commit -m "feat(parent): ContactBookDayCard stats 三格化（午餐/午睡/心情優先）+ per-stat 童彩底色

- 心情格新增（依 mood 動態顯示，5 種心情各自 icon）
- 各格底色改走童彩 tonal container（sun/grape/leaf/sky/coral），非統一底色
- 體溫、照片維持既有動態附加邏輯，不砍資訊

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 聯絡簿詳情 hero 裝飾插畫元件

**Files:**
- Create: `src/parent/components/illustrations/ContactBookHeroSparkle.vue`
- Test: `tests/unit/parent/components/illustrations/contactBookHeroSparkle.spec.ts`（新建）

**Interfaces:**
- Produces: 零 props 展示型元件，供 Task 7 的 `ContactBookDetailView.vue` 使用。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/components/illustrations/contactBookHeroSparkle.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookHeroSparkle from '@/parent/components/illustrations/ContactBookHeroSparkle.vue'

describe('ContactBookHeroSparkle', () => {
  it('渲染 svg 且 aria-hidden', () => {
    const w = mount(ContactBookHeroSparkle)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/components/illustrations/contactBookHeroSparkle.spec.ts
```
Expected: FAIL（檔案不存在）。

- [ ] **Step 3: 實作**

```vue
<script setup lang="ts">
/**
 * 聯絡簿詳情頁 hero 裝飾插畫：白雲 + 星星 + 橘色小星 spot，仿 KawaiiStar.vue 風格。
 * 零 props，純裝飾用途，絕對定位由使用端的 CSS 決定。
 */
</script>

<template>
  <svg class="contact-book-hero-sparkle" width="72" height="58" viewBox="0 0 72 58" fill="none" aria-hidden="true">
    <path d="M8 40 a9 9 0 0 1 9-8 a11 11 0 0 1 21-3 a8 8 0 0 1 8 11 z" fill="#fff" opacity="0.9" />
    <g fill="#FFD75E">
      <path d="M58 10 l2.2 5 5 2.2 -5 2.2 -2.2 5 -2.2 -5 -5 -2.2 5 -2.2 z" />
    </g>
    <g fill="#FF8C42" opacity="0.8">
      <path d="M46 34 l1.5 3.4 3.4 1.5 -3.4 1.5 -1.5 3.4 -1.5 -3.4 -3.4 -1.5 3.4 -1.5 z" />
    </g>
  </svg>
</template>
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/components/illustrations/contactBookHeroSparkle.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/illustrations/ContactBookHeroSparkle.vue tests/unit/parent/components/illustrations/contactBookHeroSparkle.spec.ts
git commit -m "feat(parent): 新增聯絡簿詳情頁 hero 裝飾插畫（spec §6 插畫落位）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ContactBookDetailView hero 大改（漸層/圓角/mood-lg/mood-tag）

**Files:**
- Modify: `src/parent/views/ContactBookDetailView.vue`
- Test: `src/parent/views/__tests__/ContactBookDetailView.hero.test.ts`（新建）

**Interfaces:**
- Consumes: Task 6 的 `ContactBookHeroSparkle.vue`；P1 的 `--pt-gradient-hero`/`--pt-hero-radius`/童彩 sun token
- Produces: hero 區塊視覺對齊 mockup（暖漸層底、裝飾插畫、76px 圓角 mood 容器、心情文字 chip）；既有 `timelineItems`／回覆／已讀邏輯零變動。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/views/__tests__/ContactBookDetailView.hero.test.ts
/**
 * ContactBookDetailView hero 重排（P3 mockup 落位）：裝飾插畫 + mood-lg 容器 +
 * mood-tag chip。沿用既有 ContactBookDetailView.raceGuard.test.ts 的 mock 慣例。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ContactBookHeroSparkle from '@/parent/components/illustrations/ContactBookHeroSparkle.vue'

const mockEntry = {
  id: 100,
  log_date: '2026-08-10',
  mood: 'happy',
  meal_lunch: 3,
  nap_minutes: 90,
  teacher_note: '今天表現很棒',
  photos: [],
  replies: [],
  readAt: null,
  isRead: false,
}

vi.mock('@/parent/api/contactBook', () => ({
  getContactBookDetail: vi.fn().mockResolvedValue({ data: mockEntry }),
  ackContactBook: vi.fn().mockResolvedValue({ data: { readAt: '2026-08-10T10:00:00Z' } }),
  replyContactBook: vi.fn(),
  deleteContactBookReply: vi.fn(),
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({ items: [{ student_id: 1, name: '小明', classroom_name: '中班' }], load: vi.fn() }),
}))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn(),
  flushParentQueue: vi.fn().mockResolvedValue(undefined),
}))

async function mountDetail() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/contact-book/:entryId', component: { template: '<div/>' } }],
  })
  router.push('/contact-book/100')
  await router.isReady()
  const ContactBookDetailView = (await import('@/parent/views/ContactBookDetailView.vue')).default
  const wrapper = mount(ContactBookDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ContactBookDetailView — hero 重排（P3）', () => {
  it('渲染裝飾插畫', async () => {
    const w = await mountDetail()
    expect(w.findComponent(ContactBookHeroSparkle).exists()).toBe(true)
  })

  it('mood-lg 容器包住 MoodBadge', async () => {
    const w = await mountDetail()
    expect(w.find('.mood-lg').exists()).toBe(true)
  })

  it('mood-tag 顯示心情文字', async () => {
    const w = await mountDetail()
    const tag = w.find('.mood-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('開心')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/parent/views/__tests__/ContactBookDetailView.hero.test.ts
```
Expected: FAIL（三個新元素皆不存在）。

- [ ] **Step 3: 實作——script 新增 import 與 MOOD_LABEL 已存在複用**

新增 import：

```ts
import ContactBookHeroSparkle from '../components/illustrations/ContactBookHeroSparkle.vue'
```

（`MOOD_LABEL` 常數第 50-52 行既有，直接複用，不重複定義。）

- [ ] **Step 4: 實作——template hero 區塊重寫**

```html
<header class="hero">
  <ContactBookHeroSparkle class="hero-art" />
  <p class="hero-date">{{ dateLine }}</p>
  <div class="hero-row">
    <div class="mood-lg">
      <MoodBadge :mood="entry.mood" size="lg" />
    </div>
    <div class="hero-meta">
      <h1 class="hero-name">{{ studentInfo?.name || '聯絡簿' }}</h1>
      <p v-if="studentInfo?.classroom_name" class="hero-class">{{ studentInfo.classroom_name }}</p>
      <span v-if="entry.mood && MOOD_LABEL[entry.mood]" class="mood-tag">
        <span class="material-symbols-rounded" aria-hidden="true">sunny</span>
        今天心情：{{ MOOD_LABEL[entry.mood] }}
      </span>
    </div>
  </div>
</header>
```

（原本 `<MoodBadge ... show-label />` 的 `show-label` 拿掉，文字改由 `mood-tag` 呈現，避免重複。）

- [ ] **Step 5: 實作——style 新增/修改**

修改 `.hero`：

```css
.hero {
  position: relative;
  padding: 16px 20px 18px;
  background: var(--pt-gradient-hero);
  border-radius: var(--pt-hero-radius, 30px);
  overflow: hidden;
}
```

（移除原本的 `linear-gradient(135deg, var(--cream) 0%, var(--leaf-100) 100%)` 寫死值。）

新增：

```css
.hero-art {
  position: absolute;
  right: 14px;
  top: 12px;
  opacity: 0.95;
}
.mood-lg {
  width: 76px;
  height: 76px;
  border-radius: 28px;
  flex-shrink: 0;
  background: var(--pt-surface-card, #fff);
  box-shadow: var(--pt-shadow-card);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mood-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  background: var(--pt-accent-sun-container);
  color: var(--pt-accent-sun-on);
  border-radius: 999px;
  padding: 4px 12px 4px 8px;
  font-size: 12.5px;
  font-weight: 800;
}
.mood-tag .material-symbols-rounded {
  font-size: 15px;
}
```

- [ ] **Step 6: 跑測試確認通過**

```bash
npx vitest run src/parent/views/__tests__/ContactBookDetailView.hero.test.ts src/parent/views/__tests__/ContactBookDetailView.raceGuard.test.ts tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js
```
Expected: 全 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/ContactBookDetailView.vue src/parent/views/__tests__/ContactBookDetailView.hero.test.ts
git commit -m "feat(parent): 聯絡簿詳情頁 hero 重排——新漸層/圓角、裝飾插畫、mood-lg 容器、mood-tag chip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: TodayTimelineItem icon 化改版（最大改動，含既有死代碼清理）

**Files:**
- Modify: `src/parent/components/home-timeline/TodayTimelineItem.vue`
- Test: `tests/unit/parent/components/home-timeline/TodayTimelineItem.spec.ts`（新建，既有測試無此檔案專屬測試，先前只有透過 `TodayTimeline.test.js` 間接測到）

**Interfaces:**
- Consumes: `event.tone`（既有 11 種語意值，來自 `useTodayTimeline.ts`，資料結構不變）
- Produces: `.tdot`（40×40 圓角方塊 + icon）取代原本 `.dot`（14px 純色圓點）；`.row + .row` hairline 分隔取代連續 rail 軌道線；`isFirst`/`isLast` props 保留宣告不消費。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/components/home-timeline/TodayTimelineItem.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayTimelineItem from '@/parent/components/home-timeline/TodayTimelineItem.vue'

const stubs = { CrownIcon: true }

function makeEvent(over = {}) {
  return {
    id: 'e1', time: null, primary: '小明 已入園', secondary: '大象班',
    tone: 'success', variant: 'past', path: '/attendance', ...over,
  }
}

describe('TodayTimelineItem — icon 化（P3）', () => {
  it('success tone 顯示 check_circle icon', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent() }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('check_circle')
  })

  it('money tone 顯示 payments icon', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ tone: 'money' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('payments')
  })

  it('未知 tone fallback 顯示 circle icon', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ tone: 'nonexistent' }) }, global: { stubs } })
    expect(w.find('.tdot').text()).toBe('circle')
  })

  it('tdot 套 tone class', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ tone: 'money' }) }, global: { stubs } })
    expect(w.find('.tdot').classes()).toContain('tone-money')
  })

  it('點擊有 path 的 entry → emit navigate', async () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ path: '/fees' }) }, global: { stubs } })
    await w.find('.entry').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual(['/fees'])
  })

  it('無 path → entry disabled', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ path: undefined }) }, global: { stubs } })
    expect(w.find('.entry').attributes('disabled')).toBeDefined()
  })

  it('有 time 時顯示時間', () => {
    const w = mount(TodayTimelineItem, { props: { event: makeEvent({ time: '08:12' }) }, global: { stubs } })
    expect(w.find('.time').text()).toBe('08:12')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/components/home-timeline/TodayTimelineItem.spec.ts
```
Expected: FAIL（`.tdot` 不存在，現行是 `.dot`）。

- [ ] **Step 3: 實作——script 全面重寫**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import CrownIcon from '@/components/brand/CrownIcon.vue'

interface TimelineEvent {
  id?: number | string
  path?: string
  time?: string
  primary?: string
  secondary?: string
  tone?: string
  variant?: string
  motif?: string
}

const props = withDefaults(defineProps<{
  event: TimelineEvent
  isFirst?: boolean
  isLast?: boolean
}>(), {
  isFirst: false,
  isLast: false,
})

const emit = defineEmits<{
  'navigate': [path: string]
}>()

/**
 * tone → icon 對照，僅供展示層使用，刻意不進 useTodayTimeline.ts 資料結構
 * （見 P3 計畫 Global Constraints：純展示邏輯留在展示層，降低改動面）。
 */
const TONE_ICON: Record<string, string> = {
  success: 'check_circle',
  leave: 'event_busy',
  muted: 'schedule',
  violet: 'medication',
  info: 'directions_walk',
  danger: 'payments',
  money: 'payments',
  event: 'mark_email_read',
  message: 'chat_bubble',
  activity: 'palette',
  announcement: 'campaign',
}
const DEFAULT_ICON = 'circle'

const iconName = computed<string>(() => TONE_ICON[props.event.tone || ''] || DEFAULT_ICON)

const dotClasses = computed<string[]>(() => [
  'tdot',
  `tone-${props.event.tone || 'muted'}`,
  `variant-${props.event.variant || 'info'}`,
])

function handle(): void {
  if (props.event.path) emit('navigate', props.event.path)
}
</script>

<template>
  <li class="row" :class="{ 'row-info': event.variant === 'info' }">
    <button
      type="button"
      class="entry press-scale"
      :disabled="!event.path"
      @click="handle"
    >
      <span :class="dotClasses">
        <span class="material-symbols-rounded" aria-hidden="true">{{ iconName }}</span>
        <CrownIcon v-if="event.motif === 'crown'" :size="12" decorative class="motif" />
      </span>
      <span class="body">
        <span class="primary">{{ event.primary }}</span>
        <span v-if="event.secondary" class="secondary">{{ event.secondary }}</span>
      </span>
      <span v-if="event.time" class="time">{{ event.time }}</span>
    </button>
  </li>
</template>

<style scoped>
.row {
  position: relative;
}
.row + .row {
  border-top: 1px solid var(--pt-border-light);
}
.row-info { opacity: 0.78; }

.entry {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 13px 4px;
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
  width: 100%;
  cursor: pointer;
  color: inherit;
  border-radius: var(--radius-md, 10px);
  min-height: var(--touch-target-min, 44px);
}
.entry:disabled { cursor: default; }
.entry:not(:disabled):active { background: var(--pt-surface-mute-soft); }

.tdot {
  width: 40px;
  height: 40px;
  border-radius: 15px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.tdot .material-symbols-rounded {
  font-size: 21px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.tdot .motif { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); }

.tone-success      { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.tone-announcement { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.tone-money        { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-activity     { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-danger       { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-event        { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-info         { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.tone-leave        { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.tone-violet       { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-message      { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-muted        { background: var(--m3-surface-container-high); color: var(--pt-text-faint); }

.variant-pending .tdot {
  background: transparent;
  border: 2px solid currentColor;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.primary {
  font-size: var(--text-base, 15px);
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.35;
}
.row-info .primary { font-weight: 600; }

.secondary {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-muted);
  font-weight: 500;
  line-height: 1.4;
}

.time {
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--pt-text-faint);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  align-self: flex-start;
  padding-top: 2px;
}

.row + .row-info,
.row.row-info + :not(.row-info) {
  margin-top: var(--space-1, 4px);
}
</style>
```

（移除 `import ParentIcon`——不再使用箭頭圖示；移除死代碼 `tone-warn` 規則——已核實 `useTodayTimeline.ts` 的 11 種 tone 值域中無 `'warn'`。）

- [ ] **Step 4: 跑新測試確認通過**

```bash
npx vitest run tests/unit/parent/components/home-timeline/TodayTimelineItem.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: 跑既有間接測試確認未破**

```bash
npx vitest run tests/unit/parent/components/home-timeline/TodayTimeline.test.js
```
Expected: 全 PASS（該檔案斷言 `.bucket-label`／`.entry` 點擊行為，未斷言 `.dot`/`.tdot` 內部樣式，不受影響）。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/home-timeline/TodayTimelineItem.vue tests/unit/parent/components/home-timeline/TodayTimelineItem.spec.ts
git commit -m "feat(parent): 今日動態 timeline item 全面改版——童彩 icon 方塊取代純色圓點（spec §9 P3）

- .dot（14px 圓點+連續 rail 軌道）→ .tdot（40px 圓角方塊+icon+hairline 分隔）
- tone→icon 對照表內建於展示層，11 種既有語意 tone 保留、映射 5 組童彩色階
- pending 態改用透明底+邊框區分（取代原本純白空心圈）
- 移除死代碼 .tone-warn（已核實無任何 tone push 點使用 'warn'）
- 資料層 useTodayTimeline.ts 零變動，其 2 支既有測試不受影響

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: TodayTimeline 外層卡片包裝 + bucket-head 簡化

**Files:**
- Modify: `src/parent/components/home-timeline/TodayTimeline.vue`
- Test: `tests/unit/parent/components/home-timeline/TodayTimeline.test.js`（既有，不追加新測試，僅跑確認）

**Interfaces:**
- Consumes: P1 的 `--pt-card-radius`/`--pt-shadow-card`
- Produces: `.timeline` 容器加卡片外觀（對齊 mockup `.stream`）；`.bucket-head` 拿掉 rail/tick，改純文字標籤（不再需要與 item 的 56px rail 欄位對齊，Task 8 已拿掉該欄位）。

- [ ] **Step 1: 實作——template 移除 bucket-rail**

```html
<header class="bucket-head">
  <h2 class="bucket-label">{{ b.label }}</h2>
</header>
```

（移除 `<span class="bucket-rail"><span class="bucket-tick"></span></span>`。）

- [ ] **Step 2: 實作——style 調整**

```css
.timeline {
  position: relative;
  background: var(--pt-surface-card, #fff);
  border-radius: var(--pt-card-radius, 26px);
  box-shadow: var(--pt-shadow-card);
  padding: 4px 12px;
}
.bucket + .bucket {
  margin-top: var(--space-4, 16px);
}

.bucket-head {
  display: flex;
  align-items: center;
  min-height: 28px;
  margin-bottom: var(--space-1, 4px);
  padding: 0 4px;
}
.bucket-label {
  margin: 0;
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--pt-text-faint);
}
```

（移除 `.bucket-rail`/`.bucket-tick` 規則；`.bucket + .bucket` 間距從 `20px` 收斂到 `16px`，因為現在整組被同一張卡片包住，不需要像過去分散排列時那麼大的呼吸間距。）

- [ ] **Step 3: 跑既有測試確認通過**

```bash
npx vitest run tests/unit/parent/components/home-timeline/TodayTimeline.test.js
```
Expected: 全 PASS（該測試斷言 `.bucket-label` 文字內容與 `.entry` 點擊行為，不涉及 `.bucket-rail`，不受影響）。

- [ ] **Step 4: Commit**

```bash
git add src/parent/components/home-timeline/TodayTimeline.vue
git commit -m "style(parent): 今日動態 timeline 外層加卡片包裝，bucket 標題簡化（spec §9 P3）

- .timeline 新增卡片背景/圓角/陰影，對齊 mockup .stream
- bucket-head 移除 rail/tick（item 已在 Task 8 拿掉對應的 56px rail 欄位）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: 全量驗證與收尾

**Files:**
- 無新變更（驗證＋必要修補）

**Interfaces:**
- Consumes: Task 1–9 全部產出
- Produces: 三綠（test/typecheck/build）＋插畫資產不破首屏預算的證據，P3 本地完成。

- [ ] **Step 1: 全量測試**

```bash
npx vitest run
```
Expected: 全 PASS。紅的逐一判定：本次新增了 4 個插畫元件與 1 個新測試檔案（`TodayTimelineItem.spec.ts`），若圖示字型子集守衛（`src/parent/__tests__/iconFontSubset.spec.ts`）紅燈，代表本批引入的 icon 名稱（`sunny`／`sentiment_very_satisfied`／`sentiment_neutral`／`sentiment_dissatisfied`／`sick`／`check_circle`／`event_busy`／`schedule`／`medication`／`directions_walk`／`payments`／`mark_email_read`／`chat_bubble`／`palette`／`campaign`／`circle`）有不在既有子集內者，比照 P1/P2 教訓執行：

```bash
npm run gen:parent-icons
```
重產後 commit 進本任務。若出現與本批改動無關的 timeout 型紅燈，先確認是否為機器資源競爭（單獨重跑該檔案），不要同時疊加全量 vitest 與其他重量級任務。

- [ ] **Step 2: typecheck**

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx vue-tsc --noEmit
```
Expected: 零錯誤。

- [ ] **Step 3: build＋chunk gate＋插畫資產首屏預算驗證**

```bash
npm run build
```
Expected: 成功；`check-entry-chunks` 通過；**重點檢查 parent 首屏 gz**——P2 完成時基準 231.3KB／預算 245KB（餘裕 13.7KB）。本批新增 3 個插畫元件（`GreetingSunIllustration`／`GreetingMoonIllustration`／`ContactBookHeroSparkle`）皆放 `src/parent/components/illustrations/`，會計入 parent-app eager chunk。若新首屏 gz 逼近或超過 245KB：
1. 先確認插畫 SVG 本身是否精簡（無多餘 metadata、無 base64 內嵌圖片）
2. 若仍超標，考慮把插畫改成透過 `defineAsyncComponent` 動態載入（僅在對應時段/頁面才載入太陽或月亮其中一個，而非兩個都進首屏）——**此為超出預算時的應變方案，非預設做法，先跑 build 看實際數字再決定是否需要**。

- [ ] **Step 4: 視覺抽查**

在 worktree 起 `npx vite --port 5176`（與 P1 的 5174、P2 的 5175 錯開），瀏覽器開 `http://localhost:5176/parent.html`。比照 P1/P2 的降級路徑：登入頁本身無法展示首頁/聯絡簿內容（`hideTabBar: true` 且需要登入態）。改用以下方式驗證：
1. 確認 build 產物中插畫元件正確被 tree-shake 進 `parent-app` chunk（非誤入 admin-core/shared-common）：
```bash
grep -c "GreetingSunIllustration\|GreetingMoonIllustration\|ContactBookHeroSparkle" dist/assets/parent-app-*.js
```
預期 ≥1（三個元件名稱至少各出現一次，代表被正確打包進 parent-app）。
2. Console 檢查：navigate 到登入頁，`read_console_messages` 確認無 error/warning（比照 P1/P2 做法）。
3. 若使用者提供測試帳密或走 debug token 取得登入態，截圖首頁（light/dark 各一）與聯絡簿詳情頁，核對問候語、Bento tile 配色、stats 三格、timeline icon 方塊、hero 裝飾插畫是否與 mockup 一致，存 workspace `.scratch/`。
完成後關掉 dev server。

- [ ] **Step 5: 收尾狀態回報（不 push）**

```bash
git log --oneline feat/parent-m3-expressive-p1..HEAD
git status
```
整理：commit 清單（相對 P1 分支基底）、測試/typecheck/build 結果、首屏 gz 變化（P2 基準 231.3KB → 本批實測值）、視覺抽查證據或降級說明。回報使用者等待 staging 授權——**本計畫到此為止，push 與 promotion 不在 scope**。同時提醒：P3 分支基於 P1（非 origin/staging），未來 push 順序須先 P1 再 P3（或 P3 分支需重新 rebase 到 P1 實際上線後的 staging 狀態）。

---

## Self-Review 紀錄

- **Spec 覆蓋**：§6 插畫落位（3 個插畫元件，落點在問候區、聯絡簿 hero，符合白名單「首頁問候區、聯絡簿 hero」）；§9 P3「首頁＋聯絡簿重排至 mockup 形」→ Task 3-9 逐區塊對應 mockup 元素（問候語/Bento 撞色/stats 三格/hero 重排/timeline 全改）。
- **無 placeholder**：所有 SVG、CSS、TS 邏輯皆為實際內容；Task 4 Step 2 的「測試可能提前變綠」是誠實記錄 CSS 動態綁定的技術現實，非佔位符，且後續步驟仍完整執行到底。
- **型別/命名一致**：三個插畫元件檔名與 import 路徑在 Task 3/7 消費處逐一核對一致；`stat-${tone}`／`tone-${tone}` 的 class 命名模式在 Task 5、Task 8 之間保持同構（都是「容器色-容器語意」＋「on 色-文字語意」的兩層結構），降低認知負擔。
- **風險最高的 Task 8**（timeline 全改）已將既有 3 支測試（`useTodayTimeline.test.js`／`useTodayTimeline.routeParity.test.js`／`TodayTimeline.test.js`）逐一核對不受影響，並新增專屬測試檔案補上先前完全沒有直接覆蓋 `TodayTimelineItem.vue` 的測試缺口。
- **Task 9 依賴 Task 8 的結構調整**（bucket-head 拿掉 56px 對齊是因為 item 不再有 56px rail 欄位）——依賴關係已在 Task 9 開頭 Interfaces 註明。
