# 家長端 Material 3 重寫 P0：Token 基建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為家長端 LIFF app 建立 Material 3 token 基建（color/typography/elevation/motion/state-layer），切換字體為 Roboto + Noto Sans TC，載入 Material Symbols icon font，並新增 `M3Icon` 元件；P0 結束時 view 視覺已大幅改變（字體、底色、icon 系統），但 layout 結構與所有現有元件 API 不動，既有 ~220 Vitest 測試全綠。

**Architecture:** P0 是 **additive** 階段。新增 `src/parent/styles/m3-tokens.css`、`typography.css`、`motion.css` 三個獨立 token 檔；既有 `globals.css` 內 IvyKids/Sky/Coral tokens **保留**，因 P1-P3 元件與 P4 view 改寫前，舊 view 仍依賴它們。等 P4 view 改完才在 P5 統一清理。

**Tech Stack:** Vue 3 + Vite + Vitest；`@material/material-color-utilities` (dev-only, build-time token 生成器)；Google Fonts (Roboto + Noto Sans TC + Material Symbols Rounded)。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §3 與 §11。

---

### Task 0: 建立 phase-0 工作分支

**Files:**
- 無檔案改動，純 git 操作

**前置條件**：當前 `feat/student-mgmt-consolidation-frontend` 分支有大量 WIP。P0 需從 `main` 切乾淨分支執行，避免污染。建議用 git worktree 取得隔離工作區。

- [ ] **Step 1: 用 using-git-worktrees skill 建立隔離 worktree**

調用 `superpowers:using-git-worktrees` skill，建立 worktree 路徑類似 `.claude/worktrees/parent-m3-phase-0/`，從 `main` 為 base。

替代：若 skill 不可用，手動執行：
```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
git worktree add ../ivy-frontend-m3-p0 -b feat/parent-m3-phase-0-frontend origin/main
cd ../ivy-frontend-m3-p0
```

- [ ] **Step 2: 確認分支與 baseline**

```bash
git status
git log -1 --format="%H %s"
```

Expected: `On branch feat/parent-m3-phase-0-frontend` + working tree clean + HEAD 等於 main 最新 commit。

- [ ] **Step 3: 確認既有測試 baseline 全綠**

```bash
npm install   # 確保 node_modules 是最新
npm run test 2>&1 | tail -20
```

Expected: 所有測試通過。記下測試總數（例 `Tests  220 passed`），P0 結束時必須仍是 220 通過（含本 plan 新增 `M3Icon` 測試後總數略增）。

---

### Task 1: 安裝 material-color-utilities 並寫 token 生成 script

**Files:**
- Modify: `package.json`（新增 devDependency）
- Create: `scripts/gen-m3-tokens.mjs`

**為什麼用 build-time generator 而非 runtime**：M3 color algorithm 用 HCT 色彩空間 + tonal palette，hex 值無法手算。將 generator 寫成獨立 mjs script + commit 產出的 CSS，避免引入 runtime dep（家長 LIFF bundle 不該帶這個 ~30KB lib）。

- [ ] **Step 1: 安裝 material-color-utilities 為 devDep**

```bash
npm install --save-dev @material/material-color-utilities
```

Expected: `package.json` `devDependencies` 多 `@material/material-color-utilities`，`package-lock.json` 更新。

- [ ] **Step 2: 建立 scripts/gen-m3-tokens.mjs**

```bash
mkdir -p scripts
```

寫入 `scripts/gen-m3-tokens.mjs`：

```js
#!/usr/bin/env node
/**
 * 從 IvyKids source color (#0d9053) 用 Material Color Utilities 算法生成
 * 家長端 M3 tonal palette CSS variables，輸出到 stdout。
 *
 * 使用：
 *   node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css
 *
 * 來源色票：#0d9053（IvyKids 深綠，spec §3.1）
 */
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from '@material/material-color-utilities'

const SOURCE_HEX = '#0d9053'
const argb = argbFromHex(SOURCE_HEX)
const theme = themeFromSourceColor(argb)

function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/**
 * 從 scheme.toJSON() 取出 M3 token，加 `--m3-` 前綴。
 * 補上 surface-container-* 階層（M3 後期新增，scheme JSON 沒帶）。
 */
function schemeToCss(scheme, neutralPalette, isDark) {
  const lines = []
  for (const [k, v] of Object.entries(scheme.toJSON())) {
    lines.push(`  --m3-${camelToKebab(k)}: ${hexFromArgb(v)};`)
  }
  // M3 surface-container tonal hierarchy
  const tones = isDark
    ? { lowest: 4, low: 10, base: 12, high: 17, highest: 22 }
    : { lowest: 100, low: 96, base: 94, high: 92, highest: 90 }
  lines.push(
    `  --m3-surface-container-lowest: ${hexFromArgb(neutralPalette.tone(tones.lowest))};`,
  )
  lines.push(
    `  --m3-surface-container-low: ${hexFromArgb(neutralPalette.tone(tones.low))};`,
  )
  lines.push(
    `  --m3-surface-container: ${hexFromArgb(neutralPalette.tone(tones.base))};`,
  )
  lines.push(
    `  --m3-surface-container-high: ${hexFromArgb(neutralPalette.tone(tones.high))};`,
  )
  lines.push(
    `  --m3-surface-container-highest: ${hexFromArgb(neutralPalette.tone(tones.highest))};`,
  )
  return lines.join('\n')
}

const header = `/**
 * Material 3 color tokens — auto-generated from source color ${SOURCE_HEX}.
 *
 * !! DO NOT EDIT BY HAND !!
 * 重新生成：node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §3.1
 * Generator: scripts/gen-m3-tokens.mjs
 */

`

const lightBlock = `:root {\n${schemeToCss(theme.schemes.light, theme.palettes.neutral, false)}\n}\n`
const darkBlock = `:root[data-theme='dark'] {\n${schemeToCss(theme.schemes.dark, theme.palettes.neutral, true)}\n}\n`

const stateAndCommon = `
:root {
  /* State layer alpha — 所有 variant 共用 */
  --m3-state-hover: 0.08;
  --m3-state-focus: 0.12;
  --m3-state-pressed: 0.12;
  --m3-state-dragged: 0.16;
}
`

process.stdout.write(header + lightBlock + '\n' + darkBlock + stateAndCommon)
```

- [ ] **Step 3: 把 script 加入 package.json scripts**

修改 `package.json` 的 `scripts` 區塊，加入：

```json
"gen:m3-tokens": "node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css"
```

完整位置（用 Edit 工具）：

```
"parent:audit": "bash scripts/parent-audit-grep.sh"
```

替換為：

```
"parent:audit": "bash scripts/parent-audit-grep.sh",
"gen:m3-tokens": "node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css"
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/gen-m3-tokens.mjs
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3 token 生成 script

- 安裝 @material/material-color-utilities (dev dep)
- scripts/gen-m3-tokens.mjs：從 #0d9053 source color 用 Material Theme algorithm 產 M3 token CSS
- npm run gen:m3-tokens 一鍵重生

P0 of 6-phase parent M3 redesign.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 一個 commit，含 3 個檔變更（lockfile + package.json + script）。

---

### Task 2: 生成 m3-tokens.css 並驗證內容合理

**Files:**
- Create: `src/parent/styles/m3-tokens.css`

- [ ] **Step 1: 跑 generator 產 CSS 檔**

```bash
npm run gen:m3-tokens
```

Expected: 無錯誤輸出；`src/parent/styles/m3-tokens.css` 被建立。

- [ ] **Step 2: 檢查產出內容合理**

```bash
head -30 src/parent/styles/m3-tokens.css
grep -c "^  --m3-" src/parent/styles/m3-tokens.css
```

Expected:
- 開頭有 auto-generated 註解
- 至少 50 條 `--m3-*` 變數（light + dark 兩段）
- 含 `--m3-primary`、`--m3-on-primary`、`--m3-surface`、`--m3-surface-container-low`、`--m3-state-hover` 等關鍵 token

- [ ] **Step 3: 抽樣驗證 primary 對應深綠系**

```bash
grep "^  --m3-primary:" src/parent/styles/m3-tokens.css
```

Expected: `--m3-primary:` 值落在綠色色域（R 值低、G 值高、B 值低；典型 hex 開頭 `#0`-`#3`，G 通道 `6`-`b`）。例：`#006d40`、`#1a6b3e` 之類。若 primary 不像綠色，generator 有問題。

- [ ] **Step 4: Commit**

```bash
git add src/parent/styles/m3-tokens.css
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 m3-tokens.css（auto-generated）

從 #0d9053 source color 跑 gen-m3-tokens.mjs 產出。
含 light + dark schemes + surface-container 階層 + state layer alpha。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 新增 typography.css（M3 type scale）

**Files:**
- Create: `src/parent/styles/typography.css`

- [ ] **Step 1: 寫 typography.css**

寫入 `src/parent/styles/typography.css`：

```css
/**
 * Material 3 Type Scale.
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §3.2
 *
 * Font stack 用 Roboto + Noto Sans TC（Google 官方 M3 中英搭配）。
 * 載入由 parent.html 的 <link> 處理。
 *
 * 用法：
 *   <h1 class="m3-headline-large">標題</h1>
 *   <p class="m3-body-medium">內文</p>
 */

:root {
  --m3-font-display: 'Roboto', 'Noto Sans TC', -apple-system, BlinkMacSystemFont,
    'PingFang TC', 'Helvetica Neue', sans-serif;
  --m3-font-body: 'Roboto', 'Noto Sans TC', -apple-system, BlinkMacSystemFont,
    'PingFang TC', 'Helvetica Neue', sans-serif;
}

/* Display */
.m3-display-large {
  font-family: var(--m3-font-display);
  font-size: 57px;
  font-weight: 400;
  line-height: 64px;
  letter-spacing: -0.25px;
}
.m3-display-medium {
  font-family: var(--m3-font-display);
  font-size: 45px;
  font-weight: 400;
  line-height: 52px;
  letter-spacing: 0;
}
.m3-display-small {
  font-family: var(--m3-font-display);
  font-size: 36px;
  font-weight: 400;
  line-height: 44px;
  letter-spacing: 0;
}

/* Headline */
.m3-headline-large {
  font-family: var(--m3-font-display);
  font-size: 32px;
  font-weight: 400;
  line-height: 40px;
  letter-spacing: 0;
}
.m3-headline-medium {
  font-family: var(--m3-font-display);
  font-size: 28px;
  font-weight: 400;
  line-height: 36px;
  letter-spacing: 0;
}
.m3-headline-small {
  font-family: var(--m3-font-display);
  font-size: 24px;
  font-weight: 400;
  line-height: 32px;
  letter-spacing: 0;
}

/* Title */
.m3-title-large {
  font-family: var(--m3-font-display);
  font-size: 22px;
  font-weight: 400;
  line-height: 28px;
  letter-spacing: 0;
}
.m3-title-medium {
  font-family: var(--m3-font-body);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  letter-spacing: 0.15px;
}
.m3-title-small {
  font-family: var(--m3-font-body);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.1px;
}

/* Label */
.m3-label-large {
  font-family: var(--m3-font-body);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.1px;
}
.m3-label-medium {
  font-family: var(--m3-font-body);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.5px;
}
.m3-label-small {
  font-family: var(--m3-font-body);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.5px;
}

/* Body */
.m3-body-large {
  font-family: var(--m3-font-body);
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  letter-spacing: 0.5px;
}
.m3-body-medium {
  font-family: var(--m3-font-body);
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  letter-spacing: 0.25px;
}
.m3-body-small {
  font-family: var(--m3-font-body);
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 0.4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/parent/styles/typography.css
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 typography.css M3 type scale

15 個 utility class (.m3-display-large ... .m3-body-small)。
Font stack 為 Roboto + Noto Sans TC（M3 spec § 3.2）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 新增 motion.css（elevation + easing + duration）

**Files:**
- Create: `src/parent/styles/motion.css`

- [ ] **Step 1: 寫 motion.css**

寫入 `src/parent/styles/motion.css`：

```css
/**
 * Material 3 elevation + motion tokens.
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §3.3 §3.4
 *
 * Elevation：六階（0-5），dual-layer shadow。
 * Motion：standard / emphasized easing + 10 階 duration。
 */

:root {
  /* Elevation level 0-5 */
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

  /* Easing curves */
  --m3-easing-standard:          cubic-bezier(0.2, 0, 0, 1);
  --m3-easing-standard-accel:    cubic-bezier(0.3, 0, 1, 1);
  --m3-easing-standard-decel:    cubic-bezier(0, 0, 0, 1);
  --m3-easing-emphasized:        cubic-bezier(0.2, 0, 0, 1);
  --m3-easing-emphasized-accel:  cubic-bezier(0.3, 0, 0.8, 0.15);
  --m3-easing-emphasized-decel:  cubic-bezier(0.05, 0.7, 0.1, 1);

  /* Duration */
  --m3-dur-short-1:   50ms;
  --m3-dur-short-2:   100ms;
  --m3-dur-short-3:   150ms;
  --m3-dur-short-4:   200ms;
  --m3-dur-medium-1:  250ms;
  --m3-dur-medium-2:  300ms;
  --m3-dur-medium-3:  350ms;
  --m3-dur-medium-4:  400ms;
  --m3-dur-long-1:    450ms;
  --m3-dur-long-2:    500ms;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/parent/styles/motion.css
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 motion.css elevation + easing + duration tokens

Elevation 0-5 dual-layer shadow / standard + emphasized easing /
10 階 duration（50ms ~ 500ms）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 更新 parent.html — Roboto + Noto Sans TC + Material Symbols + theme-color

**Files:**
- Modify: `parent.html`

當前 `parent.html` 載入的是 Outfit + Quicksand + Patrick Hand + Noto Sans TC，theme-color 是 `#FF8B8B`（殘留舊 coral 配色）。要換成 M3 字體 + Material Symbols，theme-color 改 `#0d9053`。

- [ ] **Step 1: 替換 theme-color 與字體載入區塊**

用 Edit tool 把這段：

```html
    <!-- Sunny Skyline 配色：theme-color 跟著 brand 主色（CTA 珊瑚） -->
    <meta name="theme-color" content="#FF8B8B">
```

替換為：

```html
    <!-- M3 redesign：theme-color 跟 IvyKids 深綠主色 -->
    <meta name="theme-color" content="#0d9053">
```

- [ ] **Step 2: 替換字體 link 區塊**

把這段：

```html
    <!-- Sunny Skyline 視覺體系所需字型：Outfit (display) / Quicksand (body) / Patrick Hand (手寫點綴) / Noto Sans TC (中文) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Quicksand:wght@400;500;600;700&family=Patrick+Hand&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
```

替換為：

```html
    <!-- M3 type scale：Roboto (拉丁) + Noto Sans TC (中文)。font-display: swap 避免 FOIT。 -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
    <!-- Material Symbols Rounded icon font；display=block 確保字符載入完才顯示，避免 icon 字 → 字符 fallback 跳動 -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=block">
```

- [ ] **Step 3: 驗證 parent.html 語法正確**

```bash
npm run build 2>&1 | tail -20
```

Expected: build 成功（dist 產出），無 HTML 解析錯誤。

- [ ] **Step 4: Commit**

```bash
git add parent.html
git commit -m "$(cat <<'EOF'
feat(parent-m3): parent.html 切字體為 Roboto + Noto Sans TC

- 拿掉 Outfit / Quicksand / Patrick Hand 載入
- 載入 Material Symbols Rounded icon font (display=block)
- theme-color #FF8B8B → #0d9053

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 新增 M3Icon 元件（TDD）

**Files:**
- Create: `src/parent/components/m3/M3Icon.vue`
- Create: `src/parent/components/m3/__tests__/M3Icon.spec.js`

`M3Icon` 用 Material Symbols Rounded font ligature 渲染 icon。CSS variation settings 控制 fill / weight / grade / opsz。

- [ ] **Step 1: 建立 m3 元件資料夾**

```bash
mkdir -p src/parent/components/m3/__tests__
```

- [ ] **Step 2: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Icon.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Icon from '../M3Icon.vue'

describe('M3Icon', () => {
  it('render name 為 Material Symbols ligature', () => {
    const w = mount(M3Icon, { props: { name: 'home' } })
    expect(w.text()).toBe('home')
    expect(w.classes()).toContain('material-symbols-rounded')
    expect(w.classes()).toContain('m3-icon')
  })

  it('size prop 控制 font-size', () => {
    const w = mount(M3Icon, { props: { name: 'menu', size: 32 } })
    const style = w.attributes('style') || ''
    expect(style).toContain('font-size: 32px')
  })

  it('預設裝飾性（aria-hidden）', () => {
    const w = mount(M3Icon, { props: { name: 'star' } })
    expect(w.attributes('aria-hidden')).toBe('true')
  })

  it('提供 aria-label 時不是裝飾性', () => {
    const w = mount(M3Icon, {
      props: { name: 'close' },
      attrs: { 'aria-label': '關閉' },
    })
    expect(w.attributes('aria-hidden')).toBeUndefined()
    expect(w.attributes('aria-label')).toBe('關閉')
  })

  it('filled prop 切換 FILL variation', () => {
    const w = mount(M3Icon, { props: { name: 'favorite', filled: true } })
    const style = w.attributes('style') || ''
    expect(style).toContain('"FILL" 1')
  })
})
```

- [ ] **Step 3: 跑測試確認 FAIL**

```bash
npm run test -- M3Icon 2>&1 | tail -20
```

Expected: FAIL，錯誤訊息類似 `Cannot find module '../M3Icon.vue'`。

- [ ] **Step 4: 實作 M3Icon.vue**

寫入 `src/parent/components/m3/M3Icon.vue`：

```vue
<script setup>
import { computed, useAttrs } from 'vue'

/**
 * Material Symbols Rounded icon 渲染元件。
 *
 * 用 font ligature 渲染（不是 SVG），由 parent.html 載入的 Material Symbols
 * Rounded font 提供字符。CSS font-variation-settings 控制 4 軸（FILL / wght /
 * GRAD / opsz）— 詳見 https://m3.material.io/styles/icons/overview
 *
 * 使用：
 *   <M3Icon name="home" />                          裝飾性，預設 24px
 *   <M3Icon name="close" aria-label="關閉" />        非裝飾，screen reader 讀 label
 *   <M3Icon name="favorite" filled />                FILL=1，實心
 *   <M3Icon name="menu" :size="32" />                自訂尺寸
 *
 * Icon 名清單：https://fonts.google.com/icons?icon.set=Material+Symbols&icon.style=Rounded
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
  filled: { type: Boolean, default: false },
  weight: { type: [Number, String], default: 400 },
})

const attrs = useAttrs()
const isDecorative = computed(() => attrs['aria-label'] == null)

const iconStyle = computed(() => {
  const fontSize = typeof props.size === 'number' ? `${props.size}px` : props.size
  const fill = props.filled ? 1 : 0
  return {
    fontSize,
    fontVariationSettings: `"FILL" ${fill}, "wght" ${props.weight}, "GRAD" 0, "opsz" 24`,
    lineHeight: 1,
  }
})
</script>

<template>
  <span
    class="material-symbols-rounded m3-icon"
    :style="iconStyle"
    :aria-hidden="isDecorative ? 'true' : undefined"
  >{{ name }}</span>
</template>

<style scoped>
.m3-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  font-style: normal;
  /* 確保 font 還沒載入時不會出現 raw ligature 字串太久 */
  font-display: block;
  vertical-align: middle;
}
</style>
```

- [ ] **Step 5: 跑測試確認 PASS**

```bash
npm run test -- M3Icon 2>&1 | tail -20
```

Expected: 5 tests passed。

- [ ] **Step 6: 建立 barrel export**

寫入 `src/parent/components/m3/index.js`：

```js
/**
 * Material 3 元件 barrel export.
 *
 * 使用：
 *   import { M3Icon } from '@/parent/components/m3'
 *
 * P0 只有 M3Icon；P1 起逐步補上 M3Button / M3Card / ...
 */
export { default as M3Icon } from './M3Icon.vue'
```

- [ ] **Step 7: Commit**

```bash
git add src/parent/components/m3/M3Icon.vue \
       src/parent/components/m3/__tests__/M3Icon.spec.js \
       src/parent/components/m3/index.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Icon 元件 + Vitest

Material Symbols Rounded font ligature 渲染。
支援 filled / size / weight props + aria-hidden 自動推斷。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 更新 main.js 與 globals.css — 串接 M3 token

**Files:**
- Modify: `src/parent/main.js`
- Modify: `src/parent/styles/globals.css`

讓 M3 tokens 在 globals.css 之前載入；globals.css 加註解說明 M3 與 IvyKids tokens 共存策略。

- [ ] **Step 1: 改 main.js import 順序**

用 Edit tool，把這段：

```js
// 共用設計 tokens（字級 / 間距 / 圓角 / 陰影 / 動效 / semantic colors）。
// 各角色 app 共用同一份基礎尺度，避免「四個產品」的視覺語言分裂。
// 角色 accent 由 parent app 在自己 root style 覆寫 --brand-*。
import '@/assets/design-tokens.css'
// 家長 App 全域樣式：focus / reduced-motion / tap-highlight / utility class。
// 必須在 design-tokens.css 之後 import（因為它使用 token 變數）。
import './styles/globals.css'
// 無障礙偏好（字級 / 高對比）覆寫，需在 globals.css 之後以便覆蓋。
import '@/assets/a11y.css'
```

替換為：

```js
// 共用設計 tokens（字級 / 間距 / 圓角 / 陰影 / 動效 / semantic colors）。
// 各角色 app 共用同一份基礎尺度，避免「四個產品」的視覺語言分裂。
// 角色 accent 由 parent app 在自己 root style 覆寫 --brand-*。
import '@/assets/design-tokens.css'
// M3 token 基建（color / typography / elevation / motion / state layer）。
// 在 globals.css 之前 import，讓 globals 可在需要時覆寫。
// Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §3
import './styles/m3-tokens.css'
import './styles/typography.css'
import './styles/motion.css'
// 家長 App 全域樣式：focus / reduced-motion / tap-highlight / utility class
// + 既有 IvyKids tokens（與 M3 共存，P4 view 改完後 P5 統一清理）。
// 必須在 design-tokens.css 之後 import（因為它使用 token 變數）。
import './styles/globals.css'
// 無障礙偏好（字級 / 高對比）覆寫，需在 globals.css 之後以便覆蓋。
import '@/assets/a11y.css'
```

- [ ] **Step 2: globals.css 加共存註解**

用 Edit tool，把 globals.css 開頭這段：

```css
/**
 * 家長 App 全域樣式
 *
 * 範圍：focus 樣式 / reduced motion / scrollbar / 共用 utility class +
 *       parent app 專屬色彩 alias tokens。
 * 由 src/parent/main.js 在 design-tokens.css 之後 import。
```

替換為：

```css
/**
 * 家長 App 全域樣式
 *
 * 範圍：focus 樣式 / reduced motion / scrollbar / 共用 utility class +
 *       parent app 專屬色彩 alias tokens。
 * 由 src/parent/main.js 在 design-tokens.css 之後 import。
 *
 * !! M3 重寫進行中（2026-05-13~）!!
 * 本檔內 IvyKids / Sky / Coral / Sun / Leaf / Grape tokens 與 ivy-tile 童彩
 * 6 色仍保留，因為 view 內部還在大量使用。等 P4 view 全部改完，P5 才在
 * 此清理。新元件與新 view 一律用 src/parent/styles/m3-tokens.css 的 --m3-*
 * tokens。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md
```

- [ ] **Step 3: Commit**

```bash
git add src/parent/main.js src/parent/styles/globals.css
git commit -m "$(cat <<'EOF'
feat(parent-m3): main.js 接通 M3 tokens；globals.css 加共存註解

import 順序：design-tokens → m3-tokens → typography → motion → globals → a11y
M3 與 IvyKids tokens 共存，P5 才清舊 tokens。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 更新 App.vue — body 背景與 font-family 切 M3 token

**Files:**
- Modify: `src/parent/App.vue`

當前 App.vue 把 body background 寫成 sky-skyline → cream 漸層，#app 字體寫成 Quicksand。改成 M3 surface + Roboto。

- [ ] **Step 1: 改 body background**

用 Edit tool，把這段：

```css
/* Family OS 底色：使用線性 sky → cream 鋪底，不放裝飾 blob，讓卡片與功能區自己成為焦點。 */
body {
  background:
    linear-gradient(180deg, var(--pt-surface-skyline, #edf8f5) 0%, var(--pt-surface-app, #fffce8) 46%, var(--pt-surface-app, #fffce8) 100%);
  background-attachment: fixed;
  /* 阻擋 Android Chrome 原生下拉刷新 — 已交給 PullToRefresh 元件處理。
     設在實際捲動容器（body）才生效，設在 .ptr-root 上是無效的。 */
  overscroll-behavior-y: contain;
}
```

替換為：

```css
/* M3 底色：用 surface 純色（拿掉 sky → cream 漸層）。卡片自帶 surface-container tonal 階層提供層次。 */
body {
  background: var(--m3-surface, #f7fbf3);
  /* 阻擋 Android Chrome 原生下拉刷新 — 已交給 PullToRefresh 元件處理。
     設在實際捲動容器（body）才生效，設在 .ptr-root 上是無效的。 */
  overscroll-behavior-y: contain;
}
```

- [ ] **Step 2: 改 #app font-family 與 color**

把這段：

```css
#app {
  background: transparent;
  /* Sunny Skyline 字體 stack：Quicksand body + Outfit display + Noto Sans TC 中文
     由 globals.css 注入 token，這裡只是 fallback 寫法 */
  font-family: var(--pt-font-body, 'Quicksand', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif);
  font-weight: 500;
  -webkit-font-smoothing: antialiased;
  color: var(--pt-text-strong, #1b4459);
}
```

替換為：

```css
#app {
  background: transparent;
  /* M3 type scale：Roboto + Noto Sans TC（spec §3.2）。
     由 typography.css 注入 token，這裡只是 fallback 寫法 */
  font-family: var(--m3-font-body, 'Roboto', 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif);
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  color: var(--m3-on-surface, #181d18);
}
```

- [ ] **Step 3: 改 h1-h6 字體**

把這段：

```css
/* 標題層級統一改用 Outfit display 字體（中文 fallback Noto Sans TC）。
   跨整個家長 app；元件內 scoped 若有 override 仍會覆蓋。 */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--pt-font-display, 'Outfit', 'Noto Sans TC', sans-serif);
  font-weight: 700;
  letter-spacing: 0;
}
```

替換為：

```css
/* 標題層級用 M3 font-display (Roboto)。元件內 scoped 若用 m3-headline-* utility class 仍會覆蓋。 */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--m3-font-display, 'Roboto', 'Noto Sans TC', sans-serif);
  font-weight: 400;
  letter-spacing: 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/App.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): App.vue body 背景與字體切 M3 token

- body 拿掉 sky→cream 漸層，改 m3-surface 純色
- #app font 切 Roboto + Noto Sans TC，color 改 m3-on-surface
- h1-h6 weight 700→400（M3 spec headline weight）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 全套驗證

**Files:**
- 無檔案改動，純驗證步驟

- [ ] **Step 1: 跑 Vitest 全套**

```bash
npm run test 2>&1 | tail -30
```

Expected: 全部測試通過。測試總數 = baseline + 5（M3Icon 新增 5 tests）。

若有失敗，可能原因：
- 既有測試斷在 IvyKids token CSS class（理論上不會，因為 globals.css 未動）
- M3Icon 測試與 jsdom 互動問題（jsdom 不渲染 font-variation-settings 但屬性會在 style 屬性裡）

逐一檢視失敗 trace，修正 M3Icon 實作（不該動既有測試）。

- [ ] **Step 2: build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build 成功，無 error。dist 產出。

- [ ] **Step 3: 啟動 dev server 手動視覺檢查**

```bash
# 另開 terminal 跑：
cd ~/Desktop/ivyManageSystem && ./start.sh
```

或在當前 worktree 直接：
```bash
npm run dev
```

打開 `http://localhost:5173/parent.html` （或 `/login` 看公開頁），用瀏覽器 dev tools 確認：

- [ ] body computed `background-color` 是 M3 surface 色（grep 一下 m3-tokens.css 內 `--m3-surface:` 的值）
- [ ] 字體 inspector 顯示 `Roboto` 或 `Noto Sans TC`（不是 `Quicksand` 或 `Outfit`）
- [ ] 整個 app 字感變 Material（中性、不再圓潤手寫感）
- [ ] body bg 從漸層變純色
- [ ] 既有 view（HomeView、MessagesView 等）layout 仍正常，不爆版

- [ ] **Step 4: 截圖前後對比存檔**

```bash
mkdir -p ~/Desktop/ivyManageSystem/.scratch/m3-redesign/phase-0
# 用瀏覽器或 macOS 截圖工具，把首頁 / 訊息 / 我的頁 各截一張存到上面資料夾
```

- [ ] **Step 5: 確認 dark mode 也 OK**

在 dev tools console 跑：
```js
document.documentElement.setAttribute('data-theme', 'dark')
```

確認 dark mode 切換正常（M3 tokens 已含 dark scheme）。view 內舊 IvyKids dark tokens 仍生效。

- [ ] **Step 6: 確認 bundle 不爆**

```bash
ls -lh dist/assets/*.css | head -5
```

Expected: parent app CSS bundle 增加在 +10~20KB（兩個新 CSS 檔），未超出 spec 60KB gz 預算的硬上限。

---

### Task 10: 結尾 polish + push

- [ ] **Step 1: 跑 git log 確認 commit 紀錄乾淨**

```bash
git log --oneline origin/main..HEAD
```

Expected: 8 個 commit（Tasks 1-8 每個一筆）。

- [ ] **Step 2: 推送分支**

```bash
git push -u origin feat/parent-m3-phase-0-frontend
```

Expected: 推送成功，回傳 PR 建立 URL。

- [ ] **Step 3: 開 PR**

```bash
gh pr create --title "feat(parent-m3): P0 token 基建 + 字體切換 + M3Icon" --body "$(cat <<'EOF'
## Summary

家長端 Material 3 重寫的第 0 階段：token 基建。

- 從 IvyKids 深綠 #0d9053 用 Material Color Utilities 生成完整 tonal palette
- 新增三個獨立 token 檔：m3-tokens.css / typography.css / motion.css
- parent.html 切字體為 Roboto + Noto Sans TC，載入 Material Symbols Rounded
- 新增 M3Icon 元件（5 Vitest 全綠）
- App.vue body 背景與字體切 M3 token
- IvyKids tokens 保留共存（P4 view 改完後 P5 才清）

Spec: `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md`

## Test plan

- [ ] `npm run test` 全綠（baseline + 5 新 M3Icon 測試）
- [ ] `npm run build` 成功
- [ ] 瀏覽器手動：首頁 / 訊息 / 我的 三頁視覺切到 Material 風（純色 body、Roboto 字體）
- [ ] Dark mode 切換正常
- [ ] CSS bundle 增加 < 20KB

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review 後備檢查表

實作者在 PR merge 前需逐項打勾：

- [ ] Generator script 重跑（`npm run gen:m3-tokens`）產出與 commit 內容一致（deterministic check）
- [ ] m3-tokens.css 不含手動編輯痕跡（純 generator 輸出）
- [ ] typography.css 15 個 utility class 命名與 spec 表格完全一致
- [ ] M3Icon 5 tests 全綠
- [ ] 既有 ~220 parent app 測試零 regression
- [ ] parent.html 拿掉所有 Outfit / Quicksand / Patrick Hand 字串
- [ ] App.vue 內無 `--pt-text-strong` `--pt-font-body` `--pt-surface-skyline` 引用（改 m3-*）
- [ ] globals.css 註解明確標示「P0 共存策略」
- [ ] No remaining `TODO` / `TBD` 字串在新增檔案內

---

## P0 完成後

- 進 **P1 plan**（核心 M3 元件：M3Button / M3Card / M3IconButton / M3List / M3Chip / M3Divider）。
- P1 plan 由 implementer 重新調用 `superpowers:writing-plans` skill 寫，spec §4 為依據。
