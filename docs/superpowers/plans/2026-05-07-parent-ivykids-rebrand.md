# 家長端 IvyKids 品牌回歸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把家長端視覺系統從 coral / sky 全面切換回 IvyKids 官網品牌（深綠 #0d9053 + 藍綠 #33aaaa + 童彩 6 色 + kawaii SVG 資產），全 22 view 一次到位。

**Architecture:** Token-first 重構（globals.css 22 個新 token + 10 個 tint 重新分配） + 6 個 SVG 品牌資產元件（brand/）+ 6 stacked PR 漸進交付（P1 foundation → P6 收尾）。每 phase 一條 `feat/parent-ivykids-rebrand-v1-phase{N}-{topic}` 分支，merge 順序 P1 → P6 嚴格依序。

**Tech Stack:** Vue 3 + Vite + Vitest + @vue/test-utils + happy-dom；CSS vars + prefers-color-scheme + data-theme dark mode；inline SVG（無外部圖檔）。

**Spec：** [`docs/superpowers/specs/2026-05-07-parent-ivykids-rebrand-design.md`](../specs/2026-05-07-parent-ivykids-rebrand-design.md)

**Branding reference：** `~/.claude/projects/-Users-yilunwu-Desktop-ivyManageSystem/memory/reference_ivykids_brand.md`

---

## File Structure

### 新建
```
src/parent/components/brand/
├── KawaiiStar.vue          # 黃星星 + 笑臉
├── CrownIcon.vue           # 金色皇冠
├── LaurelWreath.vue        # 月桂葉花環（左/右/雙側）
├── IvyRibbon.vue           # 綠緞帶 slot 容器
├── BrandMark.vue           # logo 縮放版（mini/full/mark-only）
└── BalloonGroup.vue        # 慶祝氣球（reduced-motion safe）

tests/unit/parent/components/brand/
├── KawaiiStar.test.js
├── CrownIcon.test.js
├── LaurelWreath.test.js
├── IvyRibbon.test.js
├── BrandMark.test.js
└── BalloonGroup.test.js
```

### 大改
```
src/parent/styles/globals.css        # token 全替換 + 22 個新 token + dark mode 同步
src/parent/components/AppHeader.vue  # 加 BrandMark mini
src/parent/layouts/ParentLayout.vue  # TabBar pill 色
src/parent/views/HomeView.vue + components/home/*  # P3 hero 主場
src/parent/views/MoreView.vue  + components/more/*  # P3 hero 主場
src/parent/views/{Leaves,Fees,Activity}View.vue + 子元件  # P4 hero 次場
src/parent/views/{Messages,Announcements,Calendar,ContactBook}*.vue  # P5 list-heavy
src/parent/views/{Attendance,Events,Medication,Notif,Login,Bind,ChildProfile}*.vue  # P6 收尾
```

### 不動
- 後端 / API / store / router / 業務邏輯
- vitest config / vite config / package.json
- ParentBottomSheet / LazyImage / ConnectionBanner（純 token 繼承，無 markup 改動）

---

# Phase 1 — Foundation：Token + SVG 品牌資產庫

> Branch base：main → 切 `feat/parent-ivykids-rebrand-v1-phase1-foundation`
>
> 完成後：6 SVG 元件可獨立使用、新 token 在 light + dark 兩模可見、既有 116 + 581 測試全綠、bundle +3-4 KB gzip。

## Task 1.1：新建 phase1 分支並開好 brand/ 目錄

**Files:**
- Create dir: `src/parent/components/brand/`
- Create dir: `tests/unit/parent/components/brand/`

- [ ] **Step 1：從 main 切分支**

```bash
cd ~/Desktop/ivy-frontend
git checkout main && git pull
git checkout -b feat/parent-ivykids-rebrand-v1-phase1-foundation
```

- [ ] **Step 2：建目錄**

```bash
mkdir -p src/parent/components/brand tests/unit/parent/components/brand
```

- [ ] **Step 3：確認測試環境正常**

Run: `npm run test:unit -- tests/unit/parent/ --run`
Expected: 既有 parent 測試全綠（baseline）

---

## Task 1.2：globals.css 加入 IvyKids 22 個品牌 token

**Files:**
- Modify: `src/parent/styles/globals.css`

設計：在 `:root { ... }` 區塊（第一段）的最後、`}` 之前，加入 IvyKids 專屬 token 區。同時在 dark 兩段同步補上對應 dark 版。

- [ ] **Step 1：閱讀現有 globals.css 結構**

Run: `wc -l src/parent/styles/globals.css && grep -n "^:root\|^}" src/parent/styles/globals.css | head -20`
Expected: 找到 `:root {` 起始位置、light mode `}` 結束行、`:root[data-theme='dark']` dark override 起始位置（不需要 @media — 見下方架構提醒）。

> **重要架構提醒**：本檔案 `useTheme.js` 一律會寫 `<html data-theme="...">`（即使 system 偏好 dark），所以 dark token **只需 `:root[data-theme='dark']` 一段**，不需要 `@media (prefers-color-scheme: dark)`。原 plan 寫加兩段是錯的（P1.2 review 確認），所有 P1.x 後續 tasks 都應遵循「只 data-theme 一段」原則。

- [ ] **Step 2：在 :root 結束 } 前插入 IvyKids token 區（light mode）**

在 `:root { ... }` 內的最後加入：

```css
  /* ---------------- IvyKids brand tokens (2026-05-07 rebrand) ----------------
   * Hex 來源：ivykids.tw 官網 CSS / favicon / about-b 教學理念 tile。
   * Spec：docs/superpowers/specs/2026-05-07-parent-ivykids-rebrand-design.md §3.2
   * Brand audit：reference_ivykids_brand.md（auto-memory）
   */
  --ivy-green-deep:    #0d9053;  /* primary CTA, emphasis bar */
  --ivy-green-bright:  #0caf76;  /* hover state */
  --ivy-green-laurel:  #5aa842;  /* 月桂葉、accent bar */
  --ivy-green-mid:     #41a074;  /* 中綠 icon bg */
  --ivy-teal-primary:  #33aaaa;  /* secondary primary button */
  --ivy-teal-soft:     #d3ecec;  /* teal soft tint */
  --ivy-star-yellow:   #ffde51;  /* kawaii 星黃 */
  --ivy-crown-gold:    #f3c630;  /* 皇冠 + 邊線金 */
  --ivy-cream-bg:      #fffce8;  /* 奶油黃底色 */
  --ivy-leaf-bg:       #f5fbe6;  /* 嫩綠底色 */

  /* 童彩 6 色 tile（bg + fg 配對，6/6 light + 6/6 dark 皆過 WCAG AA 4.5:1）*/
  --ivy-tile-yellow-bg:  #fff8d8;  --ivy-tile-yellow-fg:  #8a5d00;
  --ivy-tile-coral-bg:   #ffe8e4;  --ivy-tile-coral-fg:   #b14545;
  --ivy-tile-pink-bg:    #ffd8de;  --ivy-tile-pink-fg:    #a33340;
  --ivy-tile-purple-bg:  #efe5f5;  --ivy-tile-purple-fg:  #6e3f94;
  --ivy-tile-green-bg:   #e8f5e3;  --ivy-tile-green-fg:   #1b5e20;
  --ivy-tile-teal-bg:    #d3ecec;  --ivy-tile-teal-fg:    #145555;
```

> 注意：`--ivy-tile-yellow-fg: #8a5d00` 是 P1.2 review 修正後的值（原 `#b07700` 過不了 AA 4.5:1，僅 3.59:1）。

- [ ] **Step 3：在 :root[data-theme='dark'] 區段加入 dark 版本**

在 `:root[data-theme='dark'] { ... }` 內加入：

```css
  /* IvyKids dark — 對應 light 段，rgba 0.18 軟化 tile bg */
  --ivy-green-deep:    #5aa842;
  --ivy-green-bright:  #6dc068;
  --ivy-green-laurel:  #8bc34a;
  --ivy-green-mid:     #6dc068;
  --ivy-teal-primary:  #4dc4c4;
  --ivy-teal-soft:     rgba(77, 196, 196, 0.18);
  --ivy-star-yellow:   #ffe66d;
  --ivy-crown-gold:    #ffd647;
  --ivy-cream-bg:      #1f1c14;
  --ivy-leaf-bg:       #1a2418;

  --ivy-tile-yellow-bg:  rgba(255, 222, 81, 0.18);  --ivy-tile-yellow-fg:  #ffe66d;
  --ivy-tile-coral-bg:   rgba(243, 149, 140, 0.18); --ivy-tile-coral-fg:   #ff9a90;
  --ivy-tile-pink-bg:    rgba(246, 82, 101, 0.18);  --ivy-tile-pink-fg:    #ff8a98;
  --ivy-tile-purple-bg:  rgba(159, 137, 189, 0.18); --ivy-tile-purple-fg:  #b8a3d4;
  --ivy-tile-green-bg:   rgba(90, 168, 66, 0.18);   --ivy-tile-green-fg:   #8bc34a;
  --ivy-tile-teal-bg:    rgba(77, 196, 196, 0.18);  --ivy-tile-teal-fg:    #4dc4c4;
```

- [ ] **Step 4：（已併入 Step 3，刪除）**

- [ ] **Step 5：驗證 dev server 仍可啟動 + token 不破現有畫面**

Run: `npm run dev` 啟動，瀏覽 http://localhost:5173/parent，目視確認沒有 console error。Ctrl+C 結束。

- [ ] **Step 6：commit**

```bash
git add src/parent/styles/globals.css
git commit -m "feat(parent-rebrand): 新增 IvyKids 22 個品牌 token（light + dark）"
```

---

## Task 1.3：KawaiiStar SVG 元件 + TDD

**Files:**
- Create: `src/parent/components/brand/KawaiiStar.vue`
- Test: `tests/unit/parent/components/brand/KawaiiStar.test.js`

- [ ] **Step 1：寫失敗測試**

`tests/unit/parent/components/brand/KawaiiStar.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KawaiiStar from '@/parent/components/brand/KawaiiStar.vue'

describe('KawaiiStar', () => {
  it('預設 size=24，render svg', () => {
    const w = mount(KawaiiStar)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
  })

  it('size prop 控制 svg 大小', () => {
    const w = mount(KawaiiStar, { props: { size: 48 } })
    expect(w.find('svg').attributes('width')).toBe('48')
  })

  it('預設 aria-label="星星徽章"，role="img"', () => {
    const w = mount(KawaiiStar)
    const svg = w.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('星星徽章')
  })

  it('decorative=true 改用 aria-hidden 而非 label', () => {
    const w = mount(KawaiiStar, { props: { decorative: true } })
    const svg = w.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('aria-label')).toBeUndefined()
  })

  it('expression=wink 套用 wink 表情 path（不同 d 屬性）', () => {
    const w1 = mount(KawaiiStar, { props: { expression: 'smile' } })
    const w2 = mount(KawaiiStar, { props: { expression: 'wink' } })
    const smileMouth = w1.find('[data-test="mouth"]').attributes('d')
    const winkMouth = w2.find('[data-test="mouth"]').attributes('d')
    expect(smileMouth).not.toBe(winkMouth)
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

Run: `npm run test:unit -- tests/unit/parent/components/brand/KawaiiStar.test.js --run`
Expected: FAIL — Cannot find module '@/parent/components/brand/KawaiiStar.vue'

- [ ] **Step 3：寫元件最小實作**

`src/parent/components/brand/KawaiiStar.vue`：

```vue
<script setup>
/**
 * IvyKids kawaii 黃星星（手繪表情）— 對齊官網 logo / favicon 的星星 motif。
 *
 * 使用：
 *   <KawaiiStar />                              <!-- 預設 24px smile，有 aria-label -->
 *   <KawaiiStar :size="48" expression="wink" /> <!-- 大尺寸眨眼版 -->
 *   <KawaiiStar decorative />                   <!-- 純裝飾，aria-hidden -->
 */
import { computed } from 'vue'

const props = defineProps({
  size: { type: Number, default: 24 },
  expression: { type: String, default: 'smile' }, // smile | wink | sleep
  decorative: { type: Boolean, default: false },
})

const mouthPath = computed(() => {
  if (props.expression === 'wink') return 'M27 35 Q30 40 33 35'
  if (props.expression === 'sleep') return 'M27 36 L33 36'
  return 'M27 35 Q30 38 33 35' // smile
})

const eyeLeft = computed(() =>
  props.expression === 'wink' ? 'M23 30 L27 30' : null,
)

const ariaProps = computed(() =>
  props.decorative
    ? { 'aria-hidden': 'true' }
    : { role: 'img', 'aria-label': '星星徽章' },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 60 60"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="ariaProps"
  >
    <path
      d="M30 6 L36 22 L52 24 L40 36 L44 52 L30 44 L16 52 L20 36 L8 24 L24 22 Z"
      fill="var(--ivy-star-yellow, #ffde51)"
      stroke="var(--ivy-crown-gold, #f3c630)"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- 左眼：smile/sleep 用點，wink 用線 -->
    <circle v-if="!eyeLeft" cx="25" cy="30" r="1.5" fill="#392a1c" />
    <path v-else :d="eyeLeft" stroke="#392a1c" stroke-width="2" stroke-linecap="round" fill="none" />
    <!-- 右眼一律是點 -->
    <circle cx="35" cy="30" r="1.5" fill="#392a1c" />
    <!-- 嘴 -->
    <path
      data-test="mouth"
      :d="mouthPath"
      stroke="#392a1c"
      stroke-width="1.5"
      fill="none"
      stroke-linecap="round"
    />
    <!-- 腮紅 -->
    <circle cx="22" cy="33" r="1.5" fill="#f3958c" opacity="0.6" />
    <circle cx="38" cy="33" r="1.5" fill="#f3958c" opacity="0.6" />
  </svg>
</template>
```

- [ ] **Step 4：跑測試驗證 pass**

Run: `npm run test:unit -- tests/unit/parent/components/brand/KawaiiStar.test.js --run`
Expected: 5/5 PASS

- [ ] **Step 5：commit**

```bash
git add src/parent/components/brand/KawaiiStar.vue tests/unit/parent/components/brand/KawaiiStar.test.js
git commit -m "feat(parent-rebrand): KawaiiStar 元件（smile/wink/sleep + a11y）"
```

---

## Task 1.4：CrownIcon SVG 元件 + TDD

**Files:**
- Create: `src/parent/components/brand/CrownIcon.vue`
- Test: `tests/unit/parent/components/brand/CrownIcon.test.js`

- [ ] **Step 1：寫失敗測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CrownIcon from '@/parent/components/brand/CrownIcon.vue'

describe('CrownIcon', () => {
  it('預設 size=20、variant=gold、aria-label=皇冠', () => {
    const w = mount(CrownIcon)
    const svg = w.find('svg')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('aria-label')).toBe('皇冠')
    // 主色為金黃
    expect(w.find('[data-test="crown-body"]').attributes('fill')).toContain('var(--ivy-star-yellow')
  })

  it('variant=silver 改用銀色 fill', () => {
    const w = mount(CrownIcon, { props: { variant: 'silver' } })
    const fill = w.find('[data-test="crown-body"]').attributes('fill')
    expect(fill).toContain('#d0d0d0')
  })

  it('decorative=true 用 aria-hidden', () => {
    const w = mount(CrownIcon, { props: { decorative: true } })
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

Run: `npm run test:unit -- tests/unit/parent/components/brand/CrownIcon.test.js --run`
Expected: FAIL — Cannot find module

- [ ] **Step 3：寫實作**

`src/parent/components/brand/CrownIcon.vue`：

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  size: { type: Number, default: 20 },
  variant: { type: String, default: 'gold' }, // gold | silver
  decorative: { type: Boolean, default: false },
})

const bodyFill = computed(() =>
  props.variant === 'silver' ? '#d0d0d0' : 'var(--ivy-star-yellow, #ffde51)',
)
const strokeColor = computed(() =>
  props.variant === 'silver' ? '#999' : 'var(--ivy-crown-gold, #f3c630)',
)
const gemColor = computed(() => (props.variant === 'silver' ? '#33aaaa' : '#f65265'))

const ariaProps = computed(() =>
  props.decorative
    ? { 'aria-hidden': 'true' }
    : { role: 'img', 'aria-label': '皇冠' },
)
</script>

<template>
  <svg
    :width="size"
    :height="Math.round(size * 0.7)"
    viewBox="0 0 60 40"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="ariaProps"
  >
    <path
      data-test="crown-body"
      d="M10 32 L16 12 L24 26 L30 8 L36 26 L44 12 L50 32 Z"
      :fill="bodyFill"
      :stroke="strokeColor"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <circle cx="16" cy="12" r="3" :fill="gemColor" />
    <circle cx="30" cy="8" r="3" :fill="gemColor" />
    <circle cx="44" cy="12" r="3" :fill="gemColor" />
  </svg>
</template>
```

- [ ] **Step 4：跑測試驗證 pass**

Run: `npm run test:unit -- tests/unit/parent/components/brand/CrownIcon.test.js --run`
Expected: 3/3 PASS

- [ ] **Step 5：commit**

```bash
git add src/parent/components/brand/CrownIcon.vue tests/unit/parent/components/brand/CrownIcon.test.js
git commit -m "feat(parent-rebrand): CrownIcon 元件（gold/silver + a11y）"
```

---

## Task 1.5：LaurelWreath SVG 元件 + TDD

**Files:**
- Create: `src/parent/components/brand/LaurelWreath.vue`
- Test: `tests/unit/parent/components/brand/LaurelWreath.test.js`

- [ ] **Step 1：寫失敗測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LaurelWreath from '@/parent/components/brand/LaurelWreath.vue'

describe('LaurelWreath', () => {
  it('預設 side=full 渲染兩側葉子', () => {
    const w = mount(LaurelWreath)
    expect(w.find('[data-test="laurel-left"]').exists()).toBe(true)
    expect(w.find('[data-test="laurel-right"]').exists()).toBe(true)
  })

  it('side=left 只渲染左邊', () => {
    const w = mount(LaurelWreath, { props: { side: 'left' } })
    expect(w.find('[data-test="laurel-left"]').exists()).toBe(true)
    expect(w.find('[data-test="laurel-right"]').exists()).toBe(false)
  })

  it('side=right 只渲染右邊', () => {
    const w = mount(LaurelWreath, { props: { side: 'right' } })
    expect(w.find('[data-test="laurel-left"]').exists()).toBe(false)
    expect(w.find('[data-test="laurel-right"]').exists()).toBe(true)
  })

  it('預設 opacity=0.18，可被 prop 覆蓋', () => {
    const w1 = mount(LaurelWreath)
    expect(w1.find('svg').attributes('style') || '').toContain('opacity: 0.18')
    const w2 = mount(LaurelWreath, { props: { opacity: 0.5 } })
    expect(w2.find('svg').attributes('style') || '').toContain('opacity: 0.5')
  })

  it('預設 aria-hidden（裝飾性）', () => {
    const w = mount(LaurelWreath)
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

Run: `npm run test:unit -- tests/unit/parent/components/brand/LaurelWreath.test.js --run`

- [ ] **Step 3：寫實作**

`src/parent/components/brand/LaurelWreath.vue`：

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  side: { type: String, default: 'full' }, // left | right | full
  opacity: { type: Number, default: 0.18 },
  size: { type: Number, default: 80 },
})

const showLeft = computed(() => props.side === 'left' || props.side === 'full')
const showRight = computed(() => props.side === 'right' || props.side === 'full')

const svgStyle = computed(() => ({ opacity: props.opacity }))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 80 80"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    :style="svgStyle"
  >
    <g v-if="showLeft" data-test="laurel-left">
      <path
        d="M22 70 Q12 55 14 35 M22 70 Q18 60 16 45 M22 70 Q26 60 28 50"
        stroke="var(--ivy-green-laurel, #5aa842)"
        stroke-width="2.5"
        fill="none"
        stroke-linecap="round"
      />
      <ellipse cx="14" cy="42" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 14 42)" />
      <ellipse cx="18" cy="55" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 18 55)" />
      <ellipse cx="26" cy="48" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 26 48)" />
      <ellipse cx="22" cy="60" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 22 60)" />
    </g>
    <g v-if="showRight" data-test="laurel-right">
      <path
        d="M58 70 Q68 55 66 35 M58 70 Q62 60 64 45 M58 70 Q54 60 52 50"
        stroke="var(--ivy-green-laurel, #5aa842)"
        stroke-width="2.5"
        fill="none"
        stroke-linecap="round"
      />
      <ellipse cx="66" cy="42" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 66 42)" />
      <ellipse cx="62" cy="55" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 62 55)" />
      <ellipse cx="54" cy="48" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 54 48)" />
      <ellipse cx="58" cy="60" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 58 60)" />
    </g>
  </svg>
</template>
```

- [ ] **Step 4：跑測試驗證 pass**

Run: `npm run test:unit -- tests/unit/parent/components/brand/LaurelWreath.test.js --run`
Expected: 5/5 PASS

- [ ] **Step 5：commit**

```bash
git add src/parent/components/brand/LaurelWreath.vue tests/unit/parent/components/brand/LaurelWreath.test.js
git commit -m "feat(parent-rebrand): LaurelWreath 元件（left/right/full + opacity）"
```

---

## Task 1.6：IvyRibbon SVG 元件 + TDD

**Files:**
- Create: `src/parent/components/brand/IvyRibbon.vue`
- Test: `tests/unit/parent/components/brand/IvyRibbon.test.js`

- [ ] **Step 1：寫失敗測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IvyRibbon from '@/parent/components/brand/IvyRibbon.vue'

describe('IvyRibbon', () => {
  it('渲染 default slot 內容', () => {
    const w = mount(IvyRibbon, { slots: { default: 'IVY KIDS' } })
    expect(w.text()).toContain('IVY KIDS')
  })

  it('預設 color=green 使用深綠 bg', () => {
    const w = mount(IvyRibbon, { slots: { default: 'X' } })
    const ribbon = w.find('[data-test="ribbon-bg"]')
    expect(ribbon.attributes('fill')).toContain('var(--ivy-green-deep')
  })

  it('color=teal 使用藍綠 bg', () => {
    const w = mount(IvyRibbon, { props: { color: 'teal' }, slots: { default: 'X' } })
    expect(w.find('[data-test="ribbon-bg"]').attributes('fill')).toContain('var(--ivy-teal-primary')
  })

  it('裝飾性，aria-hidden=true', () => {
    const w = mount(IvyRibbon, { slots: { default: 'X' } })
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

Run: `npm run test:unit -- tests/unit/parent/components/brand/IvyRibbon.test.js --run`

- [ ] **Step 3：寫實作**

`src/parent/components/brand/IvyRibbon.vue`：

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  color: { type: String, default: 'green' }, // green | teal
})

const bgFill = computed(() =>
  props.color === 'teal' ? 'var(--ivy-teal-primary, #33aaaa)' : 'var(--ivy-green-deep, #0d9053)',
)
</script>

<template>
  <span class="ivy-ribbon">
    <svg
      class="ivy-ribbon-svg"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        data-test="ribbon-bg"
        d="M0 6 L12 0 L188 0 L200 6 L188 40 L12 40 Z"
        :fill="bgFill"
      />
    </svg>
    <span class="ivy-ribbon-text">
      <slot />
    </span>
  </span>
</template>

<style scoped>
.ivy-ribbon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 18px;
  min-height: 32px;
  color: var(--ivy-star-yellow, #ffde51);
  font-weight: 700;
  letter-spacing: 1px;
}
.ivy-ribbon-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ivy-ribbon-text {
  position: relative;
  z-index: 1;
}
</style>
```

- [ ] **Step 4：跑測試驗證 pass**

Run: `npm run test:unit -- tests/unit/parent/components/brand/IvyRibbon.test.js --run`
Expected: 4/4 PASS

- [ ] **Step 5：commit**

```bash
git add src/parent/components/brand/IvyRibbon.vue tests/unit/parent/components/brand/IvyRibbon.test.js
git commit -m "feat(parent-rebrand): IvyRibbon 緞帶容器元件（green/teal）"
```

---

## Task 1.7：BrandMark SVG 元件 + TDD

**Files:**
- Create: `src/parent/components/brand/BrandMark.vue`
- Test: `tests/unit/parent/components/brand/BrandMark.test.js`

設計：BrandMark 是縮小 logo（mini = AppHeader 角落用 32px / full = welcome 頁用 120px / mark-only = 純圖示無文字）。內部用 LaurelWreath + CrownIcon + IvyRibbon 組合。

- [ ] **Step 1：寫失敗測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '@/parent/components/brand/BrandMark.vue'

describe('BrandMark', () => {
  it('預設 variant=mini, size=32', () => {
    const w = mount(BrandMark)
    expect(w.find('[data-test="brand-mark"]').attributes('style') || '').toContain('width: 32px')
  })

  it('mini 模式不顯示文字 ribbon', () => {
    const w = mount(BrandMark, { props: { variant: 'mini' } })
    expect(w.findComponent({ name: 'IvyRibbon' }).exists()).toBe(false)
  })

  it('full 模式顯示 IVY KIDS 文字 ribbon', () => {
    const w = mount(BrandMark, { props: { variant: 'full' } })
    const ribbon = w.findComponent({ name: 'IvyRibbon' })
    expect(ribbon.exists()).toBe(true)
    expect(ribbon.text()).toContain('IVY KIDS')
  })

  it('mark-only 不顯示 ribbon 但有 LaurelWreath + Crown', () => {
    const w = mount(BrandMark, { props: { variant: 'mark-only' } })
    expect(w.findComponent({ name: 'IvyRibbon' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'LaurelWreath' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'CrownIcon' }).exists()).toBe(true)
  })

  it('aria-label=常春藤幼兒園', () => {
    const w = mount(BrandMark)
    expect(w.find('[data-test="brand-mark"]').attributes('aria-label')).toBe('常春藤幼兒園')
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

Run: `npm run test:unit -- tests/unit/parent/components/brand/BrandMark.test.js --run`

- [ ] **Step 3：寫實作**

`src/parent/components/brand/BrandMark.vue`：

```vue
<script setup>
import { computed } from 'vue'
import LaurelWreath from './LaurelWreath.vue'
import CrownIcon from './CrownIcon.vue'
import IvyRibbon from './IvyRibbon.vue'

const props = defineProps({
  variant: { type: String, default: 'mini' }, // mini | full | mark-only
  size: { type: Number, default: 32 },
})

const containerStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  position: 'relative',
}))

const showRibbon = computed(() => props.variant === 'full')

const wreathSize = computed(() => props.size)
const crownSize = computed(() => Math.round(props.size * 0.4))
</script>

<template>
  <span
    data-test="brand-mark"
    role="img"
    aria-label="常春藤幼兒園"
    :style="containerStyle"
    class="brand-mark"
  >
    <span class="brand-mark-stack">
      <LaurelWreath side="full" :opacity="1" :size="wreathSize" />
      <span class="brand-mark-crown">
        <CrownIcon :size="crownSize" decorative />
      </span>
    </span>
    <IvyRibbon v-if="showRibbon" class="brand-mark-ribbon">
      IVY KIDS
    </IvyRibbon>
  </span>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.brand-mark-stack {
  position: relative;
  width: 100%;
  height: 100%;
}
.brand-mark-stack > svg {
  position: absolute;
  inset: 0;
}
.brand-mark-crown {
  position: absolute;
  left: 50%;
  top: 8%;
  transform: translateX(-50%);
}
.brand-mark-ribbon {
  margin-top: 8px;
  font-size: calc(var(--mark-size, 32px) * 0.4);
}
</style>
```

- [ ] **Step 4：跑測試驗證 pass**

Run: `npm run test:unit -- tests/unit/parent/components/brand/BrandMark.test.js --run`
Expected: 5/5 PASS

- [ ] **Step 5：commit**

```bash
git add src/parent/components/brand/BrandMark.vue tests/unit/parent/components/brand/BrandMark.test.js
git commit -m "feat(parent-rebrand): BrandMark 元件（mini/full/mark-only）"
```

---

## Task 1.8：BalloonGroup SVG 元件 + TDD（reduced-motion safe）

**Files:**
- Create: `src/parent/components/brand/BalloonGroup.vue`
- Test: `tests/unit/parent/components/brand/BalloonGroup.test.js`

- [ ] **Step 1：寫失敗測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BalloonGroup from '@/parent/components/brand/BalloonGroup.vue'

describe('BalloonGroup', () => {
  it('預設 count=3', () => {
    const w = mount(BalloonGroup)
    expect(w.findAll('[data-test="balloon"]')).toHaveLength(3)
  })

  it('count=5 渲染 5 顆', () => {
    const w = mount(BalloonGroup, { props: { count: 5 } })
    expect(w.findAll('[data-test="balloon"]')).toHaveLength(5)
  })

  it('預設色彩用童彩 6 色循環', () => {
    const w = mount(BalloonGroup, { props: { count: 3 } })
    const fills = w.findAll('[data-test="balloon"] ellipse').map(e => e.attributes('fill'))
    // 至少 3 個不同顏色
    const unique = new Set(fills)
    expect(unique.size).toBeGreaterThanOrEqual(3)
  })

  it('colors prop 可覆蓋', () => {
    const w = mount(BalloonGroup, {
      props: { count: 2, colors: ['#ff0000', '#00ff00'] },
    })
    const fills = w.findAll('[data-test="balloon"] ellipse').map(e => e.attributes('fill'))
    expect(fills).toEqual(['#ff0000', '#00ff00'])
  })

  it('aria-hidden=true（純裝飾）', () => {
    const w = mount(BalloonGroup)
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

Run: `npm run test:unit -- tests/unit/parent/components/brand/BalloonGroup.test.js --run`

- [ ] **Step 3：寫實作**

`src/parent/components/brand/BalloonGroup.vue`：

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  count: { type: Number, default: 3 },
  colors: { type: Array, default: null },
})

const DEFAULT_COLORS = [
  '#ffde51', // yellow
  '#f3958c', // coral
  '#f65265', // pink
  '#9f89bd', // purple
  '#5aa842', // green
  '#33aaaa', // teal
]

const balloons = computed(() => {
  const palette = props.colors && props.colors.length ? props.colors : DEFAULT_COLORS
  return Array.from({ length: props.count }).map((_, i) => ({
    color: palette[i % palette.length],
    cx: 20 + i * 30,
    cy: 30 + (i % 2) * 8,
    delay: i * 0.4,
  }))
})
</script>

<template>
  <svg
    :width="count * 40"
    :height="80"
    viewBox="0 0 200 80"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g
      v-for="(b, i) in balloons"
      :key="i"
      data-test="balloon"
      class="balloon"
      :style="`animation-delay: ${b.delay}s`"
    >
      <ellipse :cx="b.cx" :cy="b.cy" rx="10" ry="13" :fill="b.color" />
      <line :x1="b.cx" :y1="b.cy + 13" :x2="b.cx" :y2="b.cy + 35" stroke="#392a1c" stroke-width="0.8" />
    </g>
  </svg>
</template>

<style scoped>
.balloon {
  animation: balloon-float 3s ease-in-out infinite;
  transform-origin: center;
}
@keyframes balloon-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
}
@media (prefers-reduced-motion: reduce) {
  .balloon { animation: none !important; }
}
</style>
```

- [ ] **Step 4：跑測試驗證 pass**

Run: `npm run test:unit -- tests/unit/parent/components/brand/BalloonGroup.test.js --run`
Expected: 5/5 PASS

- [ ] **Step 5：commit**

```bash
git add src/parent/components/brand/BalloonGroup.vue tests/unit/parent/components/brand/BalloonGroup.test.js
git commit -m "feat(parent-rebrand): BalloonGroup 慶祝氣球（reduced-motion safe）"
```

---

## Task 1.9：globals.css 切換 brand-primary（coral → IvyKids 深綠）

**Files:**
- Modify: `src/parent/styles/globals.css`

這是 P1 最關鍵的「品牌切換」一刀。改 token 不改 markup，所有 view 自動繼承。

- [ ] **Step 1：替換 light mode brand 區（grep 找到註解 "從深綠 (#3f7d48) → 珊瑚"）**

把：
```css
  --brand-primary:        #FF8B8B; /* coral-500 */
  --brand-primary-hover:  #E96B6B;
  --brand-primary-soft:   #FFE3E0;
  --brand-primary-tint:   #FFF4F2;
  --brand-accent:         #FFD93D;
```
改成：
```css
  /* 2026-05-07：回歸 IvyKids 官網品牌（從 coral 切換回深綠雙系統） */
  --brand-primary:        var(--ivy-green-deep);    /* #0d9053 */
  --brand-primary-hover:  var(--ivy-green-bright);  /* #0caf76 */
  --brand-primary-soft:   var(--ivy-leaf-bg);       /* #f5fbe6 */
  --brand-primary-tint:   #d4ffe7;                  /* 嫩綠 tint */
  --brand-secondary:      var(--ivy-teal-primary);  /* #33aaaa（新增） */
  --brand-secondary-soft: var(--ivy-teal-soft);     /* #d3ecec（新增） */
  --brand-accent:         var(--ivy-star-yellow);   /* #ffde51 */
```

- [ ] **Step 2：替換 light mode surface / text token（同檔案 :root 區內）**

把：
```css
  --pt-surface-app:        #F2F9FC;
```
改成：
```css
  --pt-surface-app:        var(--ivy-cream-bg, #fffce8);
```

把：
```css
  --pt-text-strong: #1B4459;
  --pt-text-body:   #1F2937;
  --pt-text-muted:  #2D6F8E;
```
改成：
```css
  --pt-text-strong: #392a1c;
  --pt-text-body:   #392a1c;
  --pt-text-muted:  #5B5B5B;
```

把：
```css
  --pt-surface-mute:       #ECF5F9;
  --pt-surface-mute-soft:  #F6FAFC;
  --pt-surface-mute-warm:  #FFFCF2;
```
改成：
```css
  --pt-surface-mute:       var(--ivy-leaf-bg, #f5fbe6);
  --pt-surface-mute-soft:  #fefcf3;
  --pt-surface-mute-warm:  var(--ivy-cream-bg, #fffce8);
```

- [ ] **Step 3：替換 hero 漸層 token**

把：
```css
  --pt-gradient-brand:      linear-gradient(135deg, #FF8B8B 0%, #E96B6B 100%);
  --pt-gradient-brand-soft: linear-gradient(135deg, #FFF4F2 0%, #FFE3E0 100%);
  --pt-gradient-warm:       linear-gradient(135deg, #FFF4C9 0%, #FFE285 100%);
  --pt-gradient-info:       linear-gradient(135deg, #DCEEF5 0%, #BBDDED 100%);
```
改成：
```css
  --pt-gradient-brand:      linear-gradient(135deg, var(--ivy-green-deep) 0%, var(--ivy-green-bright) 100%);
  --pt-gradient-brand-soft: linear-gradient(135deg, var(--ivy-leaf-bg) 0%, #d4ffe7 100%);
  --pt-gradient-warm:       linear-gradient(135deg, var(--ivy-tile-yellow-bg) 0%, var(--ivy-star-yellow) 100%);
  --pt-gradient-info:       linear-gradient(135deg, var(--ivy-teal-soft) 0%, var(--ivy-teal-primary) 100%);
```

把 `--pt-gradient-hero` 改成：
```css
  --pt-gradient-hero: linear-gradient(135deg, var(--ivy-cream-bg) 0%, var(--ivy-leaf-bg) 100%);
```

- [ ] **Step 4：重新分配 10 個 --pt-tint-***

把整段 `--pt-tint-*` 替換為：
```css
  /* tint：對應 ivy-tile-* 配色，每類別獨立色強化掃描識別 */
  --pt-tint-money:        var(--ivy-tile-yellow-bg);  --pt-tint-money-fg:        var(--ivy-tile-yellow-fg);
  --pt-tint-message:      var(--ivy-tile-teal-bg);    --pt-tint-message-fg:      var(--ivy-tile-teal-fg);
  --pt-tint-event:        var(--ivy-tile-purple-bg);  --pt-tint-event-fg:        var(--ivy-tile-purple-fg);
  --pt-tint-announcement: var(--ivy-tile-coral-bg);   --pt-tint-announcement-fg: var(--ivy-tile-coral-fg);
  --pt-tint-leave:        var(--ivy-tile-teal-bg);    --pt-tint-leave-fg:        var(--ivy-tile-teal-fg);
  --pt-tint-activity:     var(--ivy-tile-purple-bg);  --pt-tint-activity-fg:     var(--ivy-tile-purple-fg);
  --pt-tint-medication:   var(--ivy-tile-purple-bg);  --pt-tint-medication-fg:   var(--ivy-tile-purple-fg);
  --pt-tint-pickup:       var(--ivy-tile-teal-bg);    --pt-tint-pickup-fg:       var(--ivy-tile-teal-fg);
  --pt-tint-calendar:     var(--ivy-tile-green-bg);   --pt-tint-calendar-fg:     var(--ivy-tile-green-fg);
  --pt-tint-contact:      var(--ivy-tile-pink-bg);    --pt-tint-contact-fg:      var(--ivy-tile-pink-fg);
```

- [ ] **Step 5：dark mode 兩段同步替換**

在 `:root[data-theme='dark']` 內（**只一段**，不再加 @media — P1.2 review 確認既有架構 useTheme.js 一律寫 data-theme），找到對應的 brand / surface / text / gradient / tint 區，套同樣替換。原則：light 用 hex 直寫的，dark 也用 hex；light 用 var() 的，dark 也用 var()（dark token 在 Task 1.2 已建好）。

具體 dark 替換：
```css
  --brand-primary:       var(--ivy-green-deep);
  --brand-primary-hover: var(--ivy-green-bright);
  --brand-primary-soft:  rgba(13, 144, 83, 0.2);
  --brand-primary-tint:  rgba(13, 144, 83, 0.1);
  --brand-secondary:     var(--ivy-teal-primary);
  --brand-secondary-soft: rgba(77, 196, 196, 0.18);
  --brand-accent:        var(--ivy-star-yellow);

  --pt-surface-app:       var(--ivy-cream-bg);
  --pt-surface-mute:      var(--ivy-leaf-bg);
  --pt-text-strong:       #f0e8d4;
  --pt-text-body:         #e0d5c0;
  --pt-text-muted:        #a89d8c;
```

- [ ] **Step 6：跑全測試確認沒有 regression**

Run: `npm run test:unit --run`
Expected: 既有 116 (ACD) + 581 (baseline) + 新 28 (Task 1.3-1.8) = 725 全綠（pre-existing 2 個 liff.test 不算）

- [ ] **Step 7：手動視覺檢查 + 開 dev server**

Run: `npm run dev`
- 開 http://localhost:5173/parent，檢查 home 是綠系不是 coral
- 切深色（系統設定 → 外觀 → 深色），檢查 token 不破
- Ctrl+C 結束

- [ ] **Step 8：commit**

```bash
git add src/parent/styles/globals.css
git commit -m "feat(parent-rebrand): 切換 brand-primary 從 coral 回歸深綠雙系統 + 重綁所有 token"
```

---

## Task 1.10：P1 收尾 — bundle 檢查 + PR

- [ ] **Step 1：跑 build 確認 bundle 大小**

Run: `npm run build`
Expected: parent-app gzip ≤ 50.5 KB（baseline 46.33 + 新增 ≤ 4 KB）

- [ ] **Step 2：再跑一次完整測試**

Run: `npm run test:unit --run`
Expected: 全綠

- [ ] **Step 3：push 並開 PR**

```bash
git push -u origin feat/parent-ivykids-rebrand-v1-phase1-foundation
gh pr create --title "feat(parent-rebrand): P1 — IvyKids 品牌資產 + token foundation" --body "$(cat <<'EOF'
## Summary
P1/6 of IvyKids 品牌回歸（spec: docs/superpowers/specs/2026-05-07-parent-ivykids-rebrand-design.md）

- 新建 `src/parent/components/brand/` 6 SVG 元件（KawaiiStar / CrownIcon / LaurelWreath / IvyRibbon / BrandMark / BalloonGroup）
- `globals.css` 加 22 個 IvyKids 專屬 token（light + dark 兩套）
- 切換 `--brand-primary` 從 coral #FF8B8B → 深綠 #0d9053
- 重綁 surface / text / gradient / tint，10 個 --pt-tint-* 重新分配為童彩 6 色
- 28 新單元測試 + 既有 697 測試全綠

## Bundle
- baseline: 46.33 KB → after P1: ≤ 50.5 KB gzip（+4.17 KB 為 6 SVG 元件）

## Test plan
- [ ] `npm run test:unit --run` 全綠
- [ ] `npm run build` 成功
- [ ] dev server 啟動後 home 視覺從 coral → 深綠
- [ ] 深色模式不破

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Phase 2 — Containers：AppHeader / TabBar / Modal / Sheet

> Branch base：phase1-foundation → 切 `feat/parent-ivykids-rebrand-v1-phase2-containers`
>
> 完成後：全站 chrome（header、tab bar、modal、sheet）視覺一致對齊新品牌。

## Task 2.1：建分支、AppHeader 加 BrandMark mini

**Files:**
- Modify: `src/parent/components/AppHeader.vue`
- Modify: `tests/unit/parent/components/` 中 AppHeader 對應測試（如有）

- [ ] **Step 1：切分支**

```bash
git checkout feat/parent-ivykids-rebrand-v1-phase1-foundation
git checkout -b feat/parent-ivykids-rebrand-v1-phase2-containers
```

- [ ] **Step 2：在 AppHeader 加入 BrandMark**

打開 `src/parent/components/AppHeader.vue`，於 `<script setup>` 加：

```javascript
import BrandMark from './brand/BrandMark.vue'
```

於 `<template>` 內 logo / title 區左側加：

```html
<BrandMark variant="mini" :size="28" class="app-header-brand" />
```

`<style scoped>` 內加：

```css
.app-header-brand {
  flex-shrink: 0;
  margin-right: 8px;
}
```

- [ ] **Step 3：手動驗證**

Run: `npm run dev`，瀏覽 home，檢查 header 左上有縮小 logo（月桂葉 + 皇冠）。

- [ ] **Step 4：commit**

```bash
git add src/parent/components/AppHeader.vue
git commit -m "feat(parent-rebrand): AppHeader 加 BrandMark mini"
```

---

## Task 2.2：TabBar active pill 顏色對齊深綠

**Files:**
- Modify: `src/parent/layouts/ParentLayout.vue`

- [ ] **Step 1：找到 tab pill active 樣式**

Run: `grep -n "active\|pill" src/parent/layouts/ParentLayout.vue | head -20`

找到 active pill 的 background 設定，目前可能用 `--brand-primary-soft` 或固定色。

- [ ] **Step 2：確保 active pill 用 token，而非寫死色**

把 active pill background / 文字色改為：
```css
.tab-bar-item.active .pill {
  background: var(--brand-primary-soft);
}
.tab-bar-item.active .icon {
  color: var(--brand-primary);
}
```

- [ ] **Step 3：跑既有 TabBar 測試**

Run: `npm run test:unit -- tests/unit/parent/components/ParentLayoutTabReTap.test.js --run`
Expected: 全綠

- [ ] **Step 4：commit**

```bash
git add src/parent/layouts/ParentLayout.vue
git commit -m "feat(parent-rebrand): TabBar active pill 使用 brand token"
```

---

## Task 2.3：AppModal / ParentBottomSheet token sweep

**Files:**
- Modify: `src/parent/components/AppModal.vue`
- Modify: `src/parent/components/ParentBottomSheet.vue`

- [ ] **Step 1：grep 兩個檔案內的硬編色**

Run: `grep -nE "#[0-9a-fA-F]{3,6}" src/parent/components/AppModal.vue src/parent/components/ParentBottomSheet.vue`

- [ ] **Step 2：把任何 hex 改為 token**

例如 `background: #fff;` → `background: var(--pt-surface-card);`；overlay 黑半透明保留。

- [ ] **Step 3：跑既有 modal/sheet 測試**

Run: `npm run test:unit -- tests/unit/parent/components/ParentBottomSheet.test.js --run`
Expected: 全綠

- [ ] **Step 4：commit**

```bash
git add src/parent/components/AppModal.vue src/parent/components/ParentBottomSheet.vue
git commit -m "feat(parent-rebrand): AppModal / ParentBottomSheet 改用 token"
```

---

## Task 2.4：ConnectionBanner / SkeletonBlock 對齊新底色

**Files:**
- Modify: `src/parent/components/ConnectionBanner.vue`
- Modify: `src/parent/components/SkeletonBlock.vue`

- [ ] **Step 1：ConnectionBanner**

把離線/WS 斷線兩種狀態的 bg 改為：
- 離線：`var(--pt-tint-money)` (奶油黃 — 暖警告)
- WS 斷線：`var(--pt-tint-message)` (藍綠 — 資訊類)

- [ ] **Step 2：SkeletonBlock shimmer**

確認 `.pt-shimmer` 使用 `var(--pt-surface-card)` 與 `var(--pt-surface-mute)` 做 gradient（這在 Task 1.9 已生效）。如有硬編色補上。

- [ ] **Step 3：跑測試**

Run: `npm run test:unit -- tests/unit/parent/components/ConnectionBanner.test.js --run`
Expected: 全綠

- [ ] **Step 4：commit**

```bash
git add src/parent/components/ConnectionBanner.vue src/parent/components/SkeletonBlock.vue
git commit -m "feat(parent-rebrand): ConnectionBanner / SkeletonBlock 對齊新底色"
```

---

## Task 2.5：P2 收尾 — 開 PR

- [ ] **Step 1：跑全測試**

Run: `npm run test:unit --run`
Expected: 全綠

- [ ] **Step 2：push 並開 PR（base: phase1-foundation）**

```bash
git push -u origin feat/parent-ivykids-rebrand-v1-phase2-containers
gh pr create --base feat/parent-ivykids-rebrand-v1-phase1-foundation --title "feat(parent-rebrand): P2 — Containers (AppHeader/TabBar/Modal/Sheet)" --body "$(cat <<'EOF'
## Summary
P2/6 of IvyKids 品牌回歸。全站 chrome 對齊新品牌：
- AppHeader 加 BrandMark mini
- TabBar active pill 用 brand token
- AppModal / ParentBottomSheet token sweep
- ConnectionBanner / SkeletonBlock 對齊新底色

## Test plan
- [ ] `npm run test:unit --run` 全綠
- [ ] dev server header 左上有 brand mark
- [ ] tab pill active 為深綠

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Phase 3 — Hero 主場：Home / More

> Branch base：phase2-containers → 切 `feat/parent-ivykids-rebrand-v1-phase3-home-more`
>
> 完成後：HomeView / MoreView 套用月桂葉水印 + KawaiiStar 點綴 + 童彩 6 色 tile + 雙色字。375/414/768 三斷點視覺穩定。

## Task 3.1：HomeHero 重做

**Files:**
- Modify: `src/parent/components/home/HomeHero.vue`
- Modify: `tests/unit/parent/components/home/HomeHero.test.js`（如有）

- [ ] **Step 1：切分支**

```bash
git checkout feat/parent-ivykids-rebrand-v1-phase2-containers
git checkout -b feat/parent-ivykids-rebrand-v1-phase3-home-more
```

- [ ] **Step 2：閱讀現有 HomeHero**

Run: `cat src/parent/components/home/HomeHero.vue`
記錄目前的 props、template structure。

- [ ] **Step 3：重寫 HomeHero**

> 注意：spec §1.4 / §6 P3 提到「今日小明是 X 之星」moment 為 **conditional**（依後端 ChildSummary.daily_star 是否存在）。本 task 加 `dailyStar` 選用 prop（後端目前無此欄位，HomeView 不會傳，moment 會隱藏）；後端日後加上時 HomeView 一行傳入即可啟用。

```vue
<script setup>
import { computed } from 'vue'
import LaurelWreath from '../brand/LaurelWreath.vue'
import KawaiiStar from '../brand/KawaiiStar.vue'

const props = defineProps({
  parentName: { type: String, default: '' },
  childrenCount: { type: Number, default: 0 },
  dailyStar: { type: Object, default: null }, // { childName: string, label: string } | null
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 11) return '早安'
  if (h < 17) return '午安'
  return '晚安'
})

const todayLabel = computed(() => {
  const d = new Date()
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()} · 星期${wd}`
})
</script>

<template>
  <div class="home-hero">
    <LaurelWreath side="left" :opacity="0.18" :size="80" class="hero-laurel-l" />
    <KawaiiStar :size="40" decorative class="hero-star" />

    <div class="hero-content">
      <div class="hero-date">{{ todayLabel }}</div>
      <h1 class="hero-greeting">
        {{ greeting }}，<span class="hero-name">{{ parentName || '家長' }}</span>
      </h1>
      <p class="hero-subtitle" v-if="childrenCount > 0">
        您今天有 {{ childrenCount }} 位寶貝
      </p>
      <div v-if="dailyStar" class="hero-daily-star">
        <KawaiiStar :size="14" decorative class="daily-star-icon" />
        今日 {{ dailyStar.childName }} 是「{{ dailyStar.label }}」
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-hero {
  position: relative;
  margin: 14px 12px 0;
  padding: 18px 16px;
  background: var(--pt-gradient-hero);
  border: 1px solid rgba(90, 168, 66, 0.15);
  border-radius: 18px;
  box-shadow: var(--pt-elev-1);
  overflow: hidden;
  isolation: isolate;
}
.hero-laurel-l {
  position: absolute;
  left: -10px;
  top: 4px;
  z-index: 0;
}
.hero-star {
  position: absolute;
  right: 14px;
  top: 10px;
  z-index: 0;
}
.hero-content {
  position: relative;
  z-index: 1;
}
.hero-date {
  font-size: 11px;
  color: var(--ivy-green-laurel);
  font-weight: 700;
  letter-spacing: 1px;
}
.hero-greeting {
  font-size: 22px;
  font-weight: 900;
  line-height: 1.2;
  margin: 4px 0 0;
  color: var(--pt-text-strong);
}
.hero-name {
  color: var(--brand-primary);
}
.hero-subtitle {
  font-size: 12px;
  color: var(--pt-text-muted);
  margin: 6px 0 0;
  font-weight: 500;
}
.hero-daily-star {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--ivy-tile-yellow-fg);
  font-weight: 700;
}
.daily-star-icon { vertical-align: middle; }
</style>
```

- [ ] **Step 4：跑既有 HomeHero 測試（若有）**

Run: `find tests/unit/parent -name "HomeHero*"`
- 若有測試檔，跑：`npm run test:unit -- tests/unit/parent/components/home/HomeHero.test.js --run`
- 預期既有測試（檢查 parentName / childrenCount 渲染）仍綠；如測試斷言到舊 markup 細節，更新斷言以對應新 markup。

- [ ] **Step 5：手動視覺檢查**

Run: `npm run dev`，看 home。確認：
- 左側可見淡綠月桂葉
- 右上可見 kawaii 星
- 「早安，王太太」雙色字（黑 + 深綠）
- 整體溫暖、不刺眼

- [ ] **Step 6：commit**

```bash
git add src/parent/components/home/HomeHero.vue tests/unit/parent/components/home/HomeHero.test.js
git commit -m "feat(parent-rebrand): HomeHero 套月桂葉 + KawaiiStar + 雙色字"
```

---

## Task 3.2：TodoCenter tile 改童彩 6 色

**Files:**
- Modify: `src/parent/components/home/TodoCenter.vue`
- Modify: `src/parent/views/HomeView.vue`（todos array 已有 tint 欄位，確認對應正確）

- [ ] **Step 1：閱讀 TodoCenter 與 HomeView todos array**

Run: `cat src/parent/components/home/TodoCenter.vue`

確認 TodoCenter 已用 `--pt-tint-${tint}` token 渲染 icon bg/fg。如是 — Task 1.9 已重綁 token，視覺自動更新；不需改 markup。

- [ ] **Step 2：HomeView todos array 確認 tint key 對齊新 token**

打開 `src/parent/views/HomeView.vue`，找 `const todos = computed(() => { ... })`，確認每個 entry 的 `tint` 欄位是 `'money' | 'message' | 'event' | 'announcement' | 'leave' | 'activity'`（已存在），無需改動。

- [ ] **Step 3：tile 邊框加上對應 fg 色（強化區隔）**

修改 TodoCenter.vue 內 icon 容器樣式：
```css
.todo-icon {
  background: var(--pt-tint, transparent);  /* fallback */
  color: var(--pt-tint-fg, currentColor);
  border: 2px solid currentColor;
  border-radius: 10px;
}
```

並在 markup 中：
```html
<span
  class="todo-icon"
  :style="{
    '--pt-tint': `var(--pt-tint-${todo.tint})`,
    '--pt-tint-fg': `var(--pt-tint-${todo.tint}-fg)`,
  }"
>
  <ParentIcon :name="todo.icon" />
</span>
```

- [ ] **Step 4：跑既有 TodoCenter 測試（若有）**

Run: `find tests/unit/parent -name "TodoCenter*"`，跑對應測試。

- [ ] **Step 5：手動驗證**

Run: `npm run dev`，看 home 待辦：
- 待繳費（money）= 黃
- 未讀訊息（message）= 藍綠
- 待簽閱事件（event）= 紫
- 未讀公告（announcement）= 珊瑚
- 每類別都有獨立邊框色

- [ ] **Step 6：commit**

```bash
git add src/parent/components/home/TodoCenter.vue src/parent/views/HomeView.vue
git commit -m "feat(parent-rebrand): TodoCenter tile 套用童彩 6 色 + 邊框"
```

---

## Task 3.3：QuickActions 改童彩 6 色 tile

**Files:**
- Modify: `src/parent/components/home/QuickActions.vue`
- Modify: `src/parent/views/HomeView.vue`（QUICK_ACTIONS array tint 對應）

- [ ] **Step 1：閱讀 QuickActions**

Run: `cat src/parent/components/home/QuickActions.vue`

- [ ] **Step 2：QUICK_ACTIONS tint 對應**

`HomeView.vue` 中 `QUICK_ACTIONS` 已有 tint 欄位（contact / calendar / leave / medication）。確認 globals.css 第 1.9 步已建立這 4 種 tint（calendar/contact 是新的，已加；leave/medication 已有）。

- [ ] **Step 3：QuickActions 樣式套用**

跟 Task 3.2 相同 pattern，icon 容器用 `var(--pt-tint-${action.tint})` + 邊框。

- [ ] **Step 4：手動驗證 home 4 個 quick 各色不同**

聯絡簿（contact）粉 / 行程（calendar）綠 / 請假（leave）藍綠 / 用藥（medication）紫。

- [ ] **Step 5：commit**

```bash
git add src/parent/components/home/QuickActions.vue
git commit -m "feat(parent-rebrand): QuickActions 4 tile 套用童彩 6 色"
```

---

## Task 3.4：ChildrenStrip avatar + CrownIcon overlay

**Files:**
- Modify: `src/parent/components/home/ChildrenStrip.vue`

- [ ] **Step 1：在 ChildrenStrip 加入 CrownIcon 條件 overlay**

打開 `src/parent/components/home/ChildrenStrip.vue`，於 `<script setup>` 加：

```javascript
import CrownIcon from '../brand/CrownIcon.vue'

function isBirthdayToday(child) {
  if (!child.birthday) return false
  const d = new Date()
  const [, m, day] = child.birthday.split('-').map(Number)
  return d.getMonth() + 1 === m && d.getDate() === day
}
```

於 child avatar 區內：

```html
<span class="child-avatar-wrap">
  <CrownIcon
    v-if="isBirthdayToday(child)"
    :size="18"
    decorative
    class="child-crown"
  />
  <!-- 既有 avatar markup -->
</span>
```

CSS：
```css
.child-avatar-wrap { position: relative; }
.child-crown {
  position: absolute;
  left: 50%;
  top: -10px;
  transform: translateX(-50%);
  z-index: 2;
}
```

- [ ] **Step 2：跑既有 ChildrenStrip 測試（若有）**

Run: `find tests/unit/parent -name "ChildrenStrip*"`

- [ ] **Step 3：手動驗證**

如有孩子今天生日，avatar 上方有皇冠；無則無 crown。

- [ ] **Step 4：commit**

```bash
git add src/parent/components/home/ChildrenStrip.vue
git commit -m "feat(parent-rebrand): ChildrenStrip 生日 avatar 加 CrownIcon overlay"
```

---

## Task 3.5：UserHeroCard（MoreView）重做

**Files:**
- Modify: `src/parent/components/more/UserHeroCard.vue`

- [ ] **Step 1：閱讀現有 UserHeroCard**

Run: `cat src/parent/components/more/UserHeroCard.vue`

- [ ] **Step 2：重寫**

```vue
<script setup>
import LaurelWreath from '../brand/LaurelWreath.vue'
import KawaiiStar from '../brand/KawaiiStar.vue'

const props = defineProps({
  user: { type: Object, default: () => ({}) },
})
</script>

<template>
  <div class="user-hero">
    <LaurelWreath side="full" :opacity="0.15" :size="120" class="user-hero-laurel" />
    <KawaiiStar :size="32" decorative class="user-hero-star" />

    <div class="user-hero-inner">
      <div class="user-avatar">
        {{ user.name ? user.name.charAt(0) : '👤' }}
      </div>
      <div class="user-info">
        <div class="user-name">{{ user.name || '家長' }}</div>
        <div class="user-meta">{{ user.phone || user.email || '已綁定' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-hero {
  position: relative;
  margin: 14px 12px 0;
  padding: 22px 16px;
  background: var(--pt-gradient-hero);
  border: 1px solid rgba(90, 168, 66, 0.15);
  border-radius: 18px;
  overflow: hidden;
  isolation: isolate;
}
.user-hero-laurel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
}
.user-hero-star {
  position: absolute;
  right: 14px;
  top: 14px;
  z-index: 0;
}
.user-hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 14px;
}
.user-avatar {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, var(--ivy-green-deep), var(--ivy-green-bright));
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 22px;
}
.user-name {
  font-size: 18px;
  font-weight: 900;
  color: var(--pt-text-strong);
}
.user-meta {
  font-size: 12px;
  color: var(--pt-text-muted);
  margin-top: 2px;
}
</style>
```

- [ ] **Step 3：手動驗證 More 頁**

Run: `npm run dev`，瀏覽 /more，確認 user 卡片有月桂葉中心水印 + 右上 kawaii 星 + 暖底漸層。

- [ ] **Step 4：commit**

```bash
git add src/parent/components/more/UserHeroCard.vue
git commit -m "feat(parent-rebrand): UserHeroCard 套月桂葉 + KawaiiStar"
```

---

## Task 3.6：MoreMenuGroup 10 類 tile 改童彩 6 色

**Files:**
- Modify: `src/parent/components/more/MoreMenuGroup.vue`
- Modify: `src/parent/views/MoreView.vue`（menu items tint 對應）

- [ ] **Step 1：閱讀 MoreView menu items**

Run: `cat src/parent/views/MoreView.vue | head -100`

確認每 menu item 有 `tint` 欄位。10 類別建議分配：
- money / 學費：money（黃）
- announcement / 公告：announcement（珊瑚）
- event / 簽閱：event（紫）
- leave / 請假：leave（藍綠）
- medication / 用藥：medication（紫）
- pickup / 接送：pickup（藍綠）
- calendar / 行事曆：calendar（綠）
- contact / 聯絡簿：contact（粉）
- activity / 才藝：activity（紫）
- message / 訊息：message（藍綠）

- [ ] **Step 2：MoreMenuGroup item icon 套用 tint pattern**

跟 Task 3.2 相同：`var(--pt-tint-${item.tint})` + fg + 邊框。

- [ ] **Step 3：手動驗證**

Run: `npm run dev`，瀏覽 /more menu group，10 類各色明顯不同。

- [ ] **Step 4：commit**

```bash
git add src/parent/components/more/MoreMenuGroup.vue src/parent/views/MoreView.vue
git commit -m "feat(parent-rebrand): MoreMenuGroup 10 類別套童彩 6 色"
```

---

## Task 3.7：P3 收尾 — 視覺驗證 + PR

- [ ] **Step 1：跑全測試**

Run: `npm run test:unit --run`
Expected: 全綠

- [ ] **Step 2：手動三斷點驗證**

Run: `npm run dev`，用 Chrome DevTools 切換 375 / 414 / 768：
- HomeHero / UserHeroCard 漸層底背景無破版
- 月桂葉位置在三斷點都美
- TodoCenter / QuickActions tile 在 3 col 跟 4 col 切換時不溢出

- [ ] **Step 3：手動 dark mode 驗證**

系統設定切深色，看 home / more 是否所有元素皆對齊新 dark token。

- [ ] **Step 4：開 PR**

```bash
git push -u origin feat/parent-ivykids-rebrand-v1-phase3-home-more
gh pr create --base feat/parent-ivykids-rebrand-v1-phase2-containers --title "feat(parent-rebrand): P3 — Hero 主場 (Home/More)" --body "$(cat <<'EOF'
## Summary
P3/6 of IvyKids 品牌回歸。HomeView / MoreView 兩大 hero 主場套品牌資產：
- HomeHero / UserHeroCard 套月桂葉水印 + KawaiiStar
- TodoCenter / QuickActions / MoreMenuGroup tile 套童彩 6 色 + 邊框
- ChildrenStrip 生日加 CrownIcon overlay

## Test plan
- [ ] 既有 home / more 測試全綠
- [ ] 三斷點視覺驗證（375/414/768）
- [ ] light + dark 雙模驗證
- [ ] **業主預覽節點：請業主在此確認方向**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5：等業主預覽**

⚠️ Phase 3 是 spec 7.5 規定的業主驗收節點。**不繼續 P4 直到業主預覽通過**。如有調整意見，迭代於本 phase；通過後才開始 P4。

---

# Phase 4 — Hero 次場：Leaves / Fees / Activity

> Branch base：phase3-home-more（業主驗收後）→ 切 `feat/parent-ivykids-rebrand-v1-phase4-hero-secondary`

## Task 4.1：LeaveHero 重做

**Files:**
- Modify: `src/parent/components/leaves/LeaveHero.vue`

- [ ] **Step 1：切分支**

```bash
git checkout feat/parent-ivykids-rebrand-v1-phase3-home-more
git checkout -b feat/parent-ivykids-rebrand-v1-phase4-hero-secondary
```

- [ ] **Step 2：套用 HomeHero pattern**

仿照 Task 3.1 的 hero 模板（laurel + star + cream/leaf 漸層），但本 hero 主標題改為「請假」、副標顯示本學期請假天數。完整代碼：

```vue
<script setup>
import LaurelWreath from '../brand/LaurelWreath.vue'
import KawaiiStar from '../brand/KawaiiStar.vue'

const props = defineProps({
  semesterDays: { type: Number, default: 0 },
  pendingCount: { type: Number, default: 0 },
})
</script>

<template>
  <div class="leave-hero">
    <LaurelWreath side="left" :opacity="0.18" :size="80" class="hero-laurel" />
    <KawaiiStar :size="32" decorative class="hero-star" />
    <div class="hero-content">
      <div class="hero-label">本學期請假</div>
      <div class="hero-stat">
        <span class="hero-num">{{ semesterDays }}</span><span class="hero-unit"> 天</span>
      </div>
      <div v-if="pendingCount > 0" class="hero-pending">
        待審核 {{ pendingCount }} 件
      </div>
    </div>
  </div>
</template>

<style scoped>
.leave-hero {
  position: relative;
  margin: 14px 12px 0;
  padding: 18px 16px;
  background: var(--pt-gradient-hero);
  border: 1px solid rgba(90, 168, 66, 0.15);
  border-radius: 18px;
  overflow: hidden;
}
.hero-laurel { position: absolute; left: -10px; top: 4px; z-index: 0; }
.hero-star { position: absolute; right: 14px; top: 10px; z-index: 0; }
.hero-content { position: relative; z-index: 1; }
.hero-label { font-size: 11px; color: var(--ivy-green-laurel); font-weight: 700; letter-spacing: 1px; }
.hero-stat { margin-top: 4px; }
.hero-num { font-size: 32px; font-weight: 900; color: var(--pt-text-strong); }
.hero-unit { font-size: 14px; color: var(--pt-text-muted); }
.hero-pending { font-size: 12px; color: var(--ivy-tile-yellow-fg); margin-top: 4px; font-weight: 600; }
</style>
```

- [ ] **Step 3：commit**

```bash
git add src/parent/components/leaves/LeaveHero.vue
git commit -m "feat(parent-rebrand): LeaveHero 套月桂葉 + KawaiiStar"
```

---

## Task 4.2：LeaveListCard chip 改童彩

**Files:**
- Modify: `src/parent/components/leaves/LeaveListCard.vue`

- [ ] **Step 1：找 chip 樣式**

Run: `grep -nE "background.*#|status" src/parent/components/leaves/LeaveListCard.vue`

- [ ] **Step 2：把 status chip 改用 tint token**

請假狀態 → tint 對應：
- pending（待審核）→ `--pt-tint-money` (黃)
- approved（核准）→ `--pt-tint-calendar` (綠)
- rejected（駁回）→ `--pt-tint-announcement` (珊瑚)
- withdrawn（撤回）→ `--pt-tint-pickup` (藍綠淡)

實作 pattern：
```css
.status-chip[data-status="pending"]  { background: var(--pt-tint-money); color: var(--pt-tint-money-fg); }
.status-chip[data-status="approved"] { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.status-chip[data-status="rejected"] { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.status-chip[data-status="withdrawn"]{ background: var(--pt-tint-pickup); color: var(--pt-tint-pickup-fg); }
```

- [ ] **Step 3：跑既有測試**

Run: `npm run test:unit -- tests/unit/parent/components/leaves/ --run`
Expected: 全綠

- [ ] **Step 4：commit**

```bash
git add src/parent/components/leaves/LeaveListCard.vue
git commit -m "feat(parent-rebrand): LeaveListCard 狀態 chip 改童彩"
```

---

## Task 4.3：FeeHero 重做（warm 色調強調金額）

**Files:**
- Modify: `src/parent/components/fees/FeeHero.vue`

- [ ] **Step 1：套 hero 模板，但漸層改 `--pt-gradient-warm`**

```vue
<script setup>
import LaurelWreath from '../brand/LaurelWreath.vue'

const props = defineProps({
  outstandingAmount: { type: Number, default: 0 },
  outstandingCount: { type: Number, default: 0 },
  overdueAmount: { type: Number, default: 0 },
})
function formatMoney(n) {
  return n ? n.toLocaleString('en-US') : '0'
}
</script>

<template>
  <div class="fee-hero">
    <LaurelWreath side="right" :opacity="0.18" :size="80" class="hero-laurel" />
    <div class="hero-content">
      <div class="hero-label">未繳合計</div>
      <div class="hero-stat">
        <span class="hero-currency">NT$ </span>
        <span class="hero-num">{{ formatMoney(outstandingAmount) }}</span>
      </div>
      <div class="hero-meta">
        共 {{ outstandingCount }} 筆
        <span v-if="overdueAmount > 0" class="hero-overdue">
          · 逾期 NT$ {{ formatMoney(overdueAmount) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fee-hero {
  position: relative;
  margin: 14px 12px 0;
  padding: 18px 16px;
  background: var(--pt-gradient-warm);
  border: 1px solid rgba(243, 198, 48, 0.25);
  border-radius: 18px;
  overflow: hidden;
}
.hero-laurel { position: absolute; right: -10px; bottom: 4px; z-index: 0; }
.hero-content { position: relative; z-index: 1; }
.hero-label { font-size: 11px; color: var(--ivy-tile-yellow-fg); font-weight: 700; letter-spacing: 1px; }
.hero-stat { margin-top: 4px; }
.hero-currency { font-size: 14px; color: var(--pt-text-muted); font-weight: 600; }
.hero-num { font-size: 32px; font-weight: 900; color: var(--pt-text-strong); }
.hero-meta { font-size: 12px; color: var(--pt-text-muted); margin-top: 4px; }
.hero-overdue { color: var(--ivy-tile-pink-fg); font-weight: 700; }
</style>
```

- [ ] **Step 2：commit**

```bash
git add src/parent/components/fees/FeeHero.vue
git commit -m "feat(parent-rebrand): FeeHero 套 warm 漸層 + 月桂葉"
```

---

## Task 4.4：FeeListGroup tile 改童彩

**Files:**
- Modify: `src/parent/components/fees/FeeListGroup.vue`
- Modify: `src/parent/components/fees/FeeReceiptSheet.vue`

- [ ] **Step 1：FeeListGroup 月份 group header / 項目 icon 改 token**

把所有寫死 hex 改用 `var(--pt-tint-money)` 系列；繳費狀態 chip 用：
- 已繳（paid）→ tint-calendar（綠）
- 未繳（unpaid）→ tint-money（黃）
- 逾期（overdue）→ tint-announcement（珊瑚）

- [ ] **Step 2：FeeReceiptSheet token sweep**

Run: `grep -nE "#[0-9a-fA-F]{3,6}" src/parent/components/fees/FeeReceiptSheet.vue`

把所有硬編改 token。

- [ ] **Step 3：跑既有測試**

Run: `npm run test:unit -- tests/unit/parent/components/fees/ --run`

- [ ] **Step 4：commit**

```bash
git add src/parent/components/fees/FeeListGroup.vue src/parent/components/fees/FeeReceiptSheet.vue
git commit -m "feat(parent-rebrand): Fee 列表 / 收據改童彩 token"
```

---

## Task 4.5：ActivityHero 重做（info 漸層）

**Files:**
- Modify: `src/parent/components/activity/ActivityHero.vue`

- [ ] **Step 1：套 hero 模板，漸層改 `--pt-gradient-info`**

仿 Task 4.3 模板，背景用 `--pt-gradient-info`，hero 內容顯示三段統計（已報名 / 候補中 / 已上完）可點 scrollTo。完整代碼：

```vue
<script setup>
import LaurelWreath from '../brand/LaurelWreath.vue'

const props = defineProps({
  enrolled: { type: Number, default: 0 },
  waitlist: { type: Number, default: 0 },
  finished: { type: Number, default: 0 },
})

const emit = defineEmits(['scroll-to'])
</script>

<template>
  <div class="activity-hero">
    <LaurelWreath side="left" :opacity="0.15" :size="80" class="hero-laurel" />
    <div class="hero-content">
      <div class="hero-label">才藝報名概況</div>
      <div class="hero-stats">
        <button class="stat" @click="emit('scroll-to', 'enrolled')">
          <span class="stat-num">{{ enrolled }}</span>
          <span class="stat-label">已報名</span>
        </button>
        <button class="stat" @click="emit('scroll-to', 'waitlist')">
          <span class="stat-num">{{ waitlist }}</span>
          <span class="stat-label">候補中</span>
        </button>
        <button class="stat" @click="emit('scroll-to', 'finished')">
          <span class="stat-num">{{ finished }}</span>
          <span class="stat-label">已上完</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-hero {
  position: relative;
  margin: 14px 12px 0;
  padding: 18px 16px;
  background: var(--pt-gradient-info);
  border: 1px solid rgba(51, 170, 170, 0.25);
  border-radius: 18px;
  overflow: hidden;
}
.hero-laurel { position: absolute; left: -10px; top: 4px; z-index: 0; }
.hero-content { position: relative; z-index: 1; }
.hero-label { font-size: 11px; color: var(--ivy-tile-teal-fg); font-weight: 700; letter-spacing: 1px; }
.hero-stats { display: flex; gap: 12px; margin-top: 8px; }
.stat {
  flex: 1;
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(51, 170, 170, 0.2);
  border-radius: 12px;
  padding: 10px;
  text-align: center;
  cursor: pointer;
}
.stat-num { display: block; font-size: 22px; font-weight: 900; color: var(--pt-text-strong); }
.stat-label { font-size: 11px; color: var(--pt-text-muted); }
</style>
```

- [ ] **Step 2：commit**

```bash
git add src/parent/components/activity/ActivityHero.vue
git commit -m "feat(parent-rebrand): ActivityHero 套 info 漸層 + 月桂葉"
```

---

## Task 4.6：ActivityCardList / RegistrationStatusList / ActivityRegisterSheet token sweep

**Files:**
- Modify: `src/parent/components/activity/ActivityCardList.vue`
- Modify: `src/parent/components/activity/RegistrationStatusList.vue`
- Modify: `src/parent/components/activity/ActivityRegisterSheet.vue`

- [ ] **Step 1：grep 硬編色**

Run: `grep -nE "#[0-9a-fA-F]{3,6}" src/parent/components/activity/`

- [ ] **Step 2：替換 chip / tag / badge 用 tint token**

報名狀態 → tint：
- 已報名 → tint-calendar（綠）
- 候補中 → tint-money（黃）
- 已上完 → tint-pickup（藍綠淡）
- 已退款 → tint-event（紫）

- [ ] **Step 3：跑既有測試**

Run: `npm run test:unit -- tests/unit/parent/components/activity/ --run`

- [ ] **Step 4：commit**

```bash
git add src/parent/components/activity/
git commit -m "feat(parent-rebrand): Activity 列表 / sheet 套童彩 chip"
```

---

## Task 4.7：P4 收尾 PR

- [ ] **Step 1：跑全測試**

Run: `npm run test:unit --run`

- [ ] **Step 2：開 PR（base: phase3-home-more）**

```bash
git push -u origin feat/parent-ivykids-rebrand-v1-phase4-hero-secondary
gh pr create --base feat/parent-ivykids-rebrand-v1-phase3-home-more --title "feat(parent-rebrand): P4 — Hero 次場 (Leaves/Fees/Activity)"
```

---

# Phase 5 — List-heavy：Messages / Announcements / Calendar / ContactBook

> Branch base：phase4-hero-secondary → 切 `feat/parent-ivykids-rebrand-v1-phase5-list`

## Task 5.1：MessagesView + MessageBubble + MessageComposer

**Files:**
- Modify: `src/parent/views/MessagesView.vue`
- Modify: `src/parent/views/MessageThreadView.vue`
- Modify: `src/parent/components/MessageBubble.vue`
- Modify: `src/parent/components/MessageComposer.vue`

- [ ] **Step 1：切分支**

```bash
git checkout feat/parent-ivykids-rebrand-v1-phase4-hero-secondary
git checkout -b feat/parent-ivykids-rebrand-v1-phase5-list
```

- [ ] **Step 2：MessageBubble 自己 / 對方訊息色**

打開 `MessageBubble.vue`，把：
- 自己訊息 bubble bg：`var(--brand-primary)` (深綠) / fg：white
- 對方訊息 bubble bg：`var(--pt-surface-card)` / fg：`var(--pt-text-strong)`
- 系統訊息 bg：`var(--pt-tint-message)`，fg：`var(--pt-tint-message-fg)`

確認文字對比過 AA（深綠 #0d9053 + 白 = 4.95:1 ≥ 4.5 ✓）。

- [ ] **Step 3：MessageComposer 送出按鈕**

Composer 「送出」按鈕用 `--brand-primary`；附加按鈕（圖片 / 模板）用 `--pt-tint-event`（紫）。

- [ ] **Step 4：MessagesView 列表 + unread badge**

每 thread 列表項：
- 未讀 bg：`var(--brand-primary-tint)`（淡綠）
- 未讀 badge bg：`var(--brand-primary)` + 白字
- 已讀 bg：`var(--pt-surface-card)`

- [ ] **Step 5：跑既有測試**

Run: `npm run test:unit -- tests/unit/parent/components/MessageBubble.test.js tests/unit/parent/components/MessageComposer.test.js --run`

- [ ] **Step 6：commit**

```bash
git add src/parent/components/MessageBubble.vue src/parent/components/MessageComposer.vue src/parent/views/MessagesView.vue src/parent/views/MessageThreadView.vue
git commit -m "feat(parent-rebrand): Messages 對話氣泡 / composer / 列表 token sweep"
```

---

## Task 5.2：AnnouncementsView + category chip

**Files:**
- Modify: `src/parent/views/AnnouncementsView.vue`

- [ ] **Step 1：閱讀 AnnouncementsView 結構**

Run: `cat src/parent/views/AnnouncementsView.vue | head -80`

- [ ] **Step 2：category chip 套童彩**

如有 category 欄位：
- 重要 → tint-pink
- 一般 → tint-teal
- 活動 → tint-purple
- 緊急 → tint-coral

未讀 dot 用 `var(--brand-primary)` 深綠。

- [ ] **Step 3：commit**

```bash
git add src/parent/views/AnnouncementsView.vue
git commit -m "feat(parent-rebrand): Announcements category chip 套童彩"
```

---

## Task 5.3：CalendarView 6 色事件分類

**Files:**
- Modify: `src/parent/views/CalendarView.vue`

- [ ] **Step 1：找事件類別**

Run: `grep -nE "type|category" src/parent/views/CalendarView.vue | head -10`

事件分類建議色：
- 活動（activity）→ tint-purple
- 請假（leave）→ tint-teal
- 節日（holiday）→ tint-pink
- 會議（meeting）→ tint-yellow
- 到校（attendance）→ tint-green
- 其他（other）→ tint-coral

- [ ] **Step 2：每事件 dot / chip 套對應 tint**

```css
.calendar-event[data-type="activity"]  { background: var(--pt-tint-activity); color: var(--pt-tint-activity-fg); }
.calendar-event[data-type="leave"]     { background: var(--pt-tint-leave); color: var(--pt-tint-leave-fg); }
/* ... 同 pattern */
```

- [ ] **Step 3：commit**

```bash
git add src/parent/views/CalendarView.vue
git commit -m "feat(parent-rebrand): Calendar 6 色事件分類"
```

---

## Task 5.4：ContactBookView + Detail timeline

**Files:**
- Modify: `src/parent/views/ContactBookView.vue`
- Modify: `src/parent/views/ContactBookDetailView.vue`

- [ ] **Step 1：列表 / 時間軸節點 token 化**

把寫死色改 token；每日紀錄項目 icon 用：
- 餐點 → tint-yellow（黃）
- 午睡 → tint-teal（藍綠）
- 學習 → tint-purple（紫）
- 行為 → tint-green（綠）
- 健康 → tint-coral（珊瑚）
- 自由 → tint-pink

- [ ] **Step 2：empty state 加 KawaiiStar**

```vue
<div v-if="!records.length" class="empty">
  <KawaiiStar :size="64" decorative />
  <p>還沒有今日聯絡簿喔！</p>
</div>
```

注意 import：`import KawaiiStar from '@/parent/components/brand/KawaiiStar.vue'`

- [ ] **Step 3：跑既有測試**

Run: `npm run test:unit -- tests/unit/parent/contactBook.test.js --run`

- [ ] **Step 4：commit**

```bash
git add src/parent/views/ContactBookView.vue src/parent/views/ContactBookDetailView.vue
git commit -m "feat(parent-rebrand): ContactBook 時間軸 + KawaiiStar empty state"
```

---

## Task 5.5：P5 收尾 PR

- [ ] **Step 1：跑全測試**

Run: `npm run test:unit --run`

- [ ] **Step 2：手動驗證對比度**

開 dev server，messages thread 內：
- 自己 bubble（深綠 + 白字）目視清晰
- 對方 bubble（白底 + 暖咖啡字）目視清晰
- 切深色看是否仍 AA

- [ ] **Step 3：開 PR**

```bash
git push -u origin feat/parent-ivykids-rebrand-v1-phase5-list
gh pr create --base feat/parent-ivykids-rebrand-v1-phase4-hero-secondary --title "feat(parent-rebrand): P5 — List-heavy (Messages/Announcements/Calendar/ContactBook)"
```

---

# Phase 6 — 收尾 + 視覺驗證

> Branch base：phase5-list → 切 `feat/parent-ivykids-rebrand-v1-phase6-finish`

## Task 6.1：AttendanceView token sweep

**Files:**
- Modify: `src/parent/views/AttendanceView.vue`

- [ ] **Step 1：切分支**

```bash
git checkout feat/parent-ivykids-rebrand-v1-phase5-list
git checkout -b feat/parent-ivykids-rebrand-v1-phase6-finish
```

- [ ] **Step 2：出席狀態 pill / chip 套 tint**

- 在校（present）→ tint-green
- 請假（leave）→ tint-teal
- 缺席（absent）→ tint-coral
- 遲到（late）→ tint-yellow

- [ ] **Step 3：commit**

```bash
git add src/parent/views/AttendanceView.vue
git commit -m "feat(parent-rebrand): AttendanceView status pill 套童彩"
```

---

## Task 6.2：EventsView / EventAckView ack chip

**Files:**
- Modify: `src/parent/views/EventsView.vue`
- Modify: `src/parent/views/EventAckView.vue`

- [ ] **Step 1：ack 狀態 chip token 化**

- 待簽閱（pending）→ tint-money（黃）
- 已簽閱（acked）→ tint-green
- 已過期（expired）→ tint-coral

- [ ] **Step 2：commit**

```bash
git add src/parent/views/EventsView.vue src/parent/views/EventAckView.vue
git commit -m "feat(parent-rebrand): EventsView / EventAckView ack chip 套童彩"
```

---

## Task 6.3：MedicationListView / Form / Detail token sweep

**Files:**
- Modify: `src/parent/views/MedicationListView.vue`
- Modify: `src/parent/views/MedicationFormView.vue`
- Modify: `src/parent/views/MedicationDetailView.vue`

- [ ] **Step 1：用藥單狀態 chip**

- 待服用 → tint-money
- 已服用 → tint-green
- 已過期 → tint-pink
- 已撤銷 → tint-pickup

劑量 tile / 服藥時間 tile 用 `--pt-tint-medication`（紫）。

- [ ] **Step 2：commit**

```bash
git add src/parent/views/MedicationListView.vue src/parent/views/MedicationFormView.vue src/parent/views/MedicationDetailView.vue
git commit -m "feat(parent-rebrand): Medication 三 view 套童彩 token"
```

---

## Task 6.4：NotificationPrefsView toggle / category

**Files:**
- Modify: `src/parent/views/NotificationPrefsView.vue`

- [ ] **Step 1：toggle / category icon 套 tint**

每 notification category（messages/announcements/events/medication/...）用對應 tint，跟 MoreMenuGroup 一致。

- [ ] **Step 2：commit**

```bash
git add src/parent/views/NotificationPrefsView.vue
git commit -m "feat(parent-rebrand): NotificationPrefs category 套童彩"
```

---

## Task 6.5：LoginView / BindView / BindAdditionalView welcome hero

**Files:**
- Modify: `src/parent/views/LoginView.vue`
- Modify: `src/parent/views/BindView.vue`
- Modify: `src/parent/views/BindAdditionalView.vue`

- [ ] **Step 1：頂部加 BrandMark variant=full**

每個 view 頂部加：
```vue
<script setup>
import BrandMark from '@/parent/components/brand/BrandMark.vue'
</script>

<template>
  <div class="login-view">
    <BrandMark variant="full" :size="100" class="welcome-mark" />
    <!-- existing content -->
  </div>
</template>

<style scoped>
.welcome-mark {
  margin: 32px auto 24px;
  display: block;
}
</style>
```

- [ ] **Step 2：背景改 cream + leaf 漸層 hero**

```css
.login-view {
  min-height: 100vh;
  background: var(--pt-gradient-hero);
  padding: 0 16px;
}
```

- [ ] **Step 3：登入按鈕 / CTA 用 brand-primary（深綠）**

確認所有 CTA button background = `var(--brand-primary)`，hover = `var(--brand-primary-hover)`。

- [ ] **Step 4：commit**

```bash
git add src/parent/views/LoginView.vue src/parent/views/BindView.vue src/parent/views/BindAdditionalView.vue
git commit -m "feat(parent-rebrand): Login/Bind welcome hero 加 BrandMark full"
```

---

## Task 6.6：ChildProfileView hero

**Files:**
- Modify: `src/parent/views/ChildProfileView.vue`

- [ ] **Step 1：套 child hero 模板**

把 child info 區改為類似 UserHeroCard 的 hero 樣式：
- 月桂葉中心水印
- avatar 用深綠漸層圓
- 生日當天 avatar 上方加 CrownIcon
- info tile（年齡/班級/家長/緊急聯絡）用童彩 tile pattern

- [ ] **Step 2：info tile 童彩分配**

- 年齡 → tint-yellow
- 班級 → tint-teal
- 家長 → tint-pink
- 緊急聯絡 → tint-coral

- [ ] **Step 3：commit**

```bash
git add src/parent/views/ChildProfileView.vue
git commit -m "feat(parent-rebrand): ChildProfileView 套 hero + 童彩 info tile"
```

---

## Task 6.7：bundle 大小驗證

**Files:**
- 無檔案修改，純驗收

- [ ] **Step 1：跑 build**

Run: `npm run build`

- [ ] **Step 2：檢查 parent-app gzip 大小**

Run: `ls -lh dist/assets/parent-app-*.js | awk '{print $5}'`，gzip 大小看 `vite-bundle-analyzer` 或在 build output 末尾的 `gzip:` 欄位。

Expected: ≤ 58 KB gzip（baseline 46.33 + 預算 +12 KB）。

如超出，找出哪個元件最大：
- Run: `npm run build:analyze`（如有此 script）或檢查 dist 內檔案。
- 過大常見原因：BalloonGroup 動畫元件未 lazy load → 改 `defineAsyncComponent` 包裝
- 或 SVG 元件被多次 bundle → 確認 import 路徑一致

- [ ] **Step 3：紀錄結果**

如達標，繼續 Task 6.8。如超過 58 KB，新建 sub-task 處理（lazy load 或減少 SVG path 複雜度）。

---

## Task 6.8：Light + Dark + 三斷點 視覺檢查

**Files:**
- 無檔案修改，純驗收

- [ ] **Step 1：dev server 開啟**

```bash
npm run dev
```

- [ ] **Step 2：手動跑過所有 view（22 個）**

每個 view 在 light 模式 + 三斷點（375 / 414 / 768）下檢查：
- HomeView, MoreView, LeavesView, FeesView, ActivityView, MessagesView, MessageThreadView, AnnouncementsView, CalendarView, ContactBookView, ContactBookDetailView, AttendanceView, EventsView, EventAckView, MedicationListView, MedicationFormView, MedicationDetailView, NotificationPrefsView, ChildProfileView, LoginView, BindView, BindAdditionalView

每個 view 在 dark 模式（系統設定 → 外觀 → 深色）下檢查同樣。

- [ ] **Step 3：紀錄需修的視覺問題**

任何在 light/dark 下發現的問題（顏色不對齊、對比不足、tint 不協調、SVG 重疊等）建立 sub-task 修，**不要**留到 PR review 才發現。

修完後 commit：
```bash
git commit -am "fix(parent-rebrand): P6 視覺驗收 polish"
```

---

## Task 6.9：a11y 對比度自動化檢查

- [ ] **Step 1：用 Chrome DevTools Lighthouse a11y audit**

開 dev server → Chrome DevTools → Lighthouse → Accessibility 跑 audit。

Expected: a11y score ≥ 95；contrast issues = 0。

- [ ] **Step 2：手動測 reduced-motion**

System Preferences → Accessibility → Display → Reduce motion 開啟，重新整理：
- BalloonGroup 不漂浮（Task 1.8 已 reduced-motion safe）
- TabBar pill 動畫應停止（檢查 `transition` 在 reduced-motion 內被覆蓋）
- 任何發現未覆蓋的動效，補 `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }`

- [ ] **Step 3：commit polish（若有）**

---

## Task 6.10：P6 收尾 PR + 業主最終驗收

- [ ] **Step 1：跑全測試**

Run: `npm run test:unit --run`
Expected: 既有 116 + 581 + 新 28（SVG）= 725 全綠（pre-existing 2 個 liff.test 不算）

- [ ] **Step 2：跑 build 最終確認 bundle**

Run: `npm run build`
Expected: parent-app ≤ 58 KB gzip

- [ ] **Step 3：開 PR（base: phase5-list）**

```bash
git push -u origin feat/parent-ivykids-rebrand-v1-phase6-finish
gh pr create --base feat/parent-ivykids-rebrand-v1-phase5-list --title "feat(parent-rebrand): P6 — 收尾 + 視覺驗收 + a11y" --body "$(cat <<'EOF'
## Summary
P6/6 of IvyKids 品牌回歸（最終 phase）。
- AttendanceView / EventsView / Medication / NotificationPrefs / Login / Bind / ChildProfile 全 token sweep
- LoginView / BindView 加 BrandMark welcome hero
- bundle 驗收：≤ 58 KB gzip
- light + dark × 三斷點 22 view 視覺驗收
- a11y Lighthouse score ≥ 95、reduced-motion 全覆蓋

## 業主最終驗收
- [ ] HomeView / MoreView 視覺通過
- [ ] 所有 22 view 視覺一致
- [ ] dark mode 不破
- [ ] 三斷點視覺穩定
- [ ] 沒有對比不足的文字

## Merge order
P1 → P2 → P3 → P4 → P5 → P6 嚴格依序 merge 到 main。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4：等業主最終驗收**

業主驗收通過後，**依序** merge 6 個 PR 到 main：P1 → P2 → P3 → P4 → P5 → P6。

每 merge 一個 PR 後，下一個 PR 的 base 自動切換為新的 main HEAD（GitHub auto rebase 或手動 rebase）。

- [ ] **Step 5：merge 完後寫一條 project memory**

`~/.claude/projects/-Users-yilunwu-Desktop-ivyManageSystem/memory/project_parent_ivykids_rebrand_2026_05_07.md`，內容：
- 6 PR 摘要 + bundle 結果
- 新 SVG 元件清單與用法
- 22 token + 童彩 6 色 tile 系統
- 業主驗收回饋（如有）

- [ ] **Step 6：清理 worktree / 分支**

依 `feedback_branch_workflow` 慣例：
```bash
# 6 個 phase 分支留作歷史記錄；如不需保留可刪：
for n in 1 2 3 4 5 6; do
  git push origin --delete feat/parent-ivykids-rebrand-v1-phase${n}-*
done
```

---

# 附錄

## A. 整體驗收清單

最終驗收前確認：

- [ ] 6 個 PR 全 merge 進 main（依序）
- [ ] `npm run test:unit --run` 在 main 上全綠
- [ ] `npm run build` parent-app gzip ≤ 58 KB
- [ ] Lighthouse a11y ≥ 95
- [ ] 22 view × 三斷點 × light/dark 全部目視通過
- [ ] memory 紀錄已寫
- [ ] CLAUDE.md 對應段（如有提及 brand color）已更新

## B. 風險與 contingency

| 風險 | 偵測時機 | 處理 |
|---|---|---|
| 業主在 P3 預覽時不喜歡 cream 底 | Phase 3 PR review | 改回純白：`--pt-surface-app: #ffffff;` 一處改全站生效 |
| Bundle 超預算 | Task 6.7 build | BalloonGroup 改 `defineAsyncComponent` lazy；SVG path 簡化 |
| 童彩 dark mode 太刺眼 | Task 6.8 dark | dark token 全改 `rgba(色, 0.15)` 進一步軟化 |
| 既有 component test 因 markup 改動斷掉 | Phase N 跑測試時 | 更新斷言對應新 markup（不要刪測試） |
| Phase 3 後業主想加更多 motif | P3 PR review | 評估範圍、若小（< 0.5 day）併入；大則建 phase 6.5 sub-task |
