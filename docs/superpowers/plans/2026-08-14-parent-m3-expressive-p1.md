# 家長端 M3 Expressive 改版 P1（地基批）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 spec §4 token 收斂＋§5 元件 Expressive 化＋§8 motion token，讓家長端全 app 立即換上 M3 Expressive 暖色語彙，零結構／零 API 變動。

**Architecture:** 三層推進——先加新 token（motion、童彩配對、尺度），再拆疊層（Bento 冷調覆寫段與 claymorphism 陰影退場、`--pt-*` alias 重指向 `--m3-*`），最後元件層消費新 token（15 個 m3 元件＋6 個家長端共用元件只動 style 不動 props/emits）。守衛測試先行（source-scan 型，與既有 `aaContrast.spec.ts` 同模式）。

**Tech Stack:** Vue 3 SFC（`<script setup lang="ts">`）、CSS custom properties、Vitest（source-scan guard）、vue-tsc、vite build + `check-entry-chunks.mjs`。

**Spec:** `docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md`

## Global Constraints

- **分支基底＝`origin/staging`**（含對比修正 `492ae959` 與 `tests/unit/mobile/aaContrast.spec.ts`；main 落後 10 commit 且 main ⊂ staging，2026-08-14 已核實）。嚴禁在共用 checkout 切分支，一律 worktree。
- `src/parent/styles/m3-tokens.css` 為 auto-gen，**不可手改**（要改跑 `npm run gen:m3-tokens`；本計畫不需要改它）。
- `aaContrast.spec.ts` 既有 12 條守衛必須全程綠：legacy 色階（`--sky-*` 等 raw 定義與其 dark 覆寫）**P1 保留不刪**（刪除是 P4 的事）。
- 元件 API（props/emits/slots）零變動；既有 `src/parent/components/m3/__tests__/` 行為測試紅了＝回歸，不是「預期更新」。
- 新 hex 只允許出現在 `src/parent/styles/globals.css`（家長端 token 真源）；`.vue` 元件內禁止新增硬編 hex。
- 動效只用 transform/opacity；一切互動 transition 須被既有 `prefers-reduced-motion` 段（globals.css 456-468）或各自的 reduced-motion 覆寫涵蓋。
- 測試指令不可接 `| tail`（exit code 會被吃掉）；vitest 目標檔單獨跑。
- 收尾 gate：`npm run test`、`npm run typecheck`、`npm run build`（含 parent 首屏 gz 245KB 預算與禁 Element Plus 守衛）三綠才算完成。
- Commit 訊息繁體中文、Conventional Commits，結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。**不 push**——本計畫終點是本地完成＋驗證綠，push staging 需使用者另行授權。

---

### Task 1: 開 worktree 與 baseline 驗證

**Files:**
- 無程式碼變更（環境準備）

**Interfaces:**
- Produces: worktree `~/Desktop/ivy-frontend/.claude/worktrees/parent-p1`，分支 `feat/parent-m3-expressive-p1`，基底 `origin/staging`。後續所有 task 在此目錄工作。

- [ ] **Step 1: 開 worktree（基底 origin/staging）**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin
git worktree add .claude/worktrees/parent-p1 -b feat/parent-m3-expressive-p1 origin/staging
```

- [ ] **Step 2: 處理 node_modules（FE worktree 必要，見 memory `feedback_frontend_worktree_node_modules_symlink`）**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/parent-p1
ln -s ~/Desktop/ivy-frontend/node_modules node_modules
```

- [ ] **Step 3: baseline——既有守衛與 m3 元件測試須綠**

```bash
npx vitest run tests/unit/mobile/aaContrast.spec.ts src/parent/components/m3/__tests__/
```
Expected: 全 PASS（紅了先停：代表基底本身有問題，回報，勿帶病開工）。

- [ ] **Step 4: baseline build**

```bash
npm run build
```
Expected: build 成功、`check-entry-chunks` 通過。記下輸出中 parent 首屏 gz 大小備比對。

---

### Task 2: Motion token（spec §8）

**Files:**
- Modify: `src/parent/styles/motion.css`（現 48 行，檔尾追加）
- Test: `tests/unit/parent/motionTokens.spec.ts`（新建）

**Interfaces:**
- Produces: `--motion-spring`、`--motion-emphasized`、`--motion-quick`（160ms）、`--motion-base`（260ms）、`--motion-page`（350ms）。Task 5–8 的元件 transition 一律消費這五個 token。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/motionTokens.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/motion.css'), 'utf-8')

describe('家長端動效 token（M3 Expressive P1）', () => {
  it('定義 spring 曲線', () => {
    expect(css).toContain('--motion-spring: cubic-bezier(0.34, 1.56, 0.64, 1)')
  })
  it('定義 emphasized 曲線（alias 到既有 m3 easing）', () => {
    expect(css).toContain('--motion-emphasized: var(--m3-easing-emphasized-decelerate')
  })
  it('定義三階語意時長', () => {
    expect(css).toContain('--motion-quick: 160ms')
    expect(css).toContain('--motion-base: 260ms')
    expect(css).toContain('--motion-page: 350ms')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/motionTokens.spec.ts
```
Expected: FAIL（`--motion-spring` 不存在）。
注意：`--motion-emphasized` 斷言引用的既有 easing 變數名以 motion.css 現檔為準（六條 easing curve 之一，名稱含 emphasized-decelerate）；寫測試前先開檔確認精確名稱，斷言與實作用同一個名字。

- [ ] **Step 3: 實作——motion.css 檔尾追加**

```css
/* ---------------------------------------------------------------
   M3 Expressive P1 語意動效 token（2026-08-14 spec §8）
   元件層一律消費這五個，不直接寫 cubic-bezier/毫秒字面值。
   --------------------------------------------------------------- */
:root {
  --motion-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --motion-emphasized: var(--m3-easing-emphasized-decelerate); /* 名稱以現檔為準 */
  --motion-quick: 160ms;
  --motion-base: 260ms;
  --motion-page: 350ms;
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/motionTokens.spec.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/styles/motion.css tests/unit/parent/motionTokens.spec.ts
git commit -m "feat(parent): 新增 M3 Expressive 語意動效 token（spring/emphasized/三階時長）"
```

---

### Task 3: 童彩 tonal 配對＋尺度 token（spec §3/§4）

**Files:**
- Modify: `src/parent/styles/globals.css`——「Parent App v3 版面基調」段（222-240）改尺度值並新增童彩配對；dark 段（293-432 內）新增童彩 dark 配對
- Test: `tests/unit/parent/accentTokens.spec.ts`（新建）

**Interfaces:**
- Produces: 十個童彩 token `--pt-accent-{sun|coral|sky|leaf|grape}-container` 與 `--pt-accent-{…}-on`（light/dark 各一套）；尺度 `--pt-card-radius: 26px`、`--pt-control-radius: 14px`、`--pt-hero-radius: 30px`。Task 5–8 消費。

- [ ] **Step 1: 寫失敗測試（set-equality 型：五色 × container/on × light/dark 全齊）**

```ts
// tests/unit/parent/accentTokens.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')
const darkStart = css.indexOf(":root[data-theme='dark']")
const light = css.slice(0, darkStart)
const dark = css.slice(darkStart)

const ACCENTS = ['sun', 'coral', 'sky', 'leaf', 'grape'] as const

describe('童彩 tonal 配對（M3 Expressive P1）', () => {
  it.each(ACCENTS)('%s：light 有 container+on 配對', (name) => {
    expect(light).toContain(`--pt-accent-${name}-container:`)
    expect(light).toContain(`--pt-accent-${name}-on:`)
  })
  it.each(ACCENTS)('%s：dark 有 container+on 配對（禁 light-only）', (name) => {
    expect(dark).toContain(`--pt-accent-${name}-container:`)
    expect(dark).toContain(`--pt-accent-${name}-on:`)
  })
  it('尺度 token 升級到 Expressive 值', () => {
    expect(light).toContain('--pt-card-radius: 26px')
    expect(light).toContain('--pt-control-radius: 14px')
    expect(light).toContain('--pt-hero-radius: 30px')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/accentTokens.spec.ts
```
Expected: FAIL。

- [ ] **Step 3: 實作**

(a) 222-240 段內，尺度改值＋新增（`--pt-app-max-width`、`--pt-page-gap` 不動）：

```css
  --pt-card-radius: 26px;      /* 14px → 26px（Expressive） */
  --pt-control-radius: 14px;   /* 12px → 14px */
  --pt-hero-radius: 30px;      /* 新增：hero 卡 */
```

(b) 同段之後新增童彩配對（light）：

```css
  /* 童彩 tonal 配對（spec §3）：tile/timeline dot/chip 一律用配對，禁單獨取 container 配自訂文字色 */
  --pt-accent-sun-container: #ffedb8;   --pt-accent-sun-on: #5c4300;
  --pt-accent-coral-container: #ffddd1; --pt-accent-coral-on: #7a2e18;
  --pt-accent-sky-container: #cfecf7;   --pt-accent-sky-on: #0b4a5c;
  --pt-accent-leaf-container: #d8f1de;  --pt-accent-leaf-on: #1c5232;
  --pt-accent-grape-container: #eadfff; --pt-accent-grape-on: #4a3277;
```

(c) dark 段（`:root[data-theme='dark']` 內、IvyKids dark hex 段 381-398 附近）新增：

```css
  --pt-accent-sun-container: #4a3a10;   --pt-accent-sun-on: #ffe08c;
  --pt-accent-coral-container: #54291c; --pt-accent-coral-on: #ffbfa8;
  --pt-accent-sky-container: #123c4a;   --pt-accent-sky-on: #a5dff2;
  --pt-accent-leaf-container: #1d3f2a;  --pt-accent-leaf-on: #b5e8c4;
  --pt-accent-grape-container: #38295c; --pt-accent-grape-on: #d8c5ff;
```

- [ ] **Step 4: 跑測試確認通過＋既有守衛不破**

```bash
npx vitest run tests/unit/parent/accentTokens.spec.ts tests/unit/mobile/aaContrast.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/styles/globals.css tests/unit/parent/accentTokens.spec.ts
git commit -m "feat(parent): 童彩五組 tonal 配對 token＋Expressive 尺度（card 26/control 14/hero 30）"
```

---

### Task 4: 疊層退場——Bento 覆寫刪除＋alias 重指向 m3（spec §4 核心）

**Files:**
- Modify: `src/parent/styles/globals.css`：
  - 刪：light Bento 覆寫段（242-291）、dark Bento 覆寫段（404-431）、claymorphism 原始 elevation 段（140-161 重寫）
  - 改：`--pt-text-*`（74-85）、`--pt-surface-*`（87-97）、`--pt-border-*`（99-106）重指向 `--m3-*`；dark 段對應區（308-328、353-356）同步
  - 加：`--pt-app-bg` 暖底＋body 消費；`--pt-gradient-hero` 改新漸層
- Test: `tests/unit/parent/tokenLayering.spec.ts`（新建）

**Interfaces:**
- Consumes: Task 3 的尺度 token
- Produces: 生效視覺從「Bento slate」變「M3 Expressive 暖色」；`--pt-shadow-card`／`--pt-shadow-float` 新陰影對；`--pt-app-bg`。**注意**：Bento 段內的 `--pt-on-accent` 與 `--color-primary-contrast` 是守衛測試消費的活 token，刪段前先搬進保留區。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/tokenLayering.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')

describe('token 疊層收斂（M3 Expressive P1）', () => {
  it('Bento 冷調覆寫層已退場（slate hex 不得殘留）', () => {
    expect(css).not.toContain('#0f172a')
    expect(css).not.toContain('#94a3b8')
    expect(css).not.toContain('rgba(15,23,42')
    expect(css).not.toContain('rgba(15, 23, 42')
  })
  it('globals.css 不再覆寫任何 --m3-* token（m3-tokens.css 為唯一真源）', () => {
    // 允許「消費」var(--m3-...)，禁止「定義」--m3-...:
    expect(css).not.toMatch(/^\s*--m3-[a-z-]+\s*:/m)
  })
  it('文字 alias 指向 m3 色彩角色', () => {
    expect(css).toContain('--pt-text-strong: var(--m3-on-surface)')
    expect(css).toContain('--pt-text-muted: var(--m3-on-surface-variant)')
  })
  it('暖底 app 背景 light/dark 成對', () => {
    const darkStart = css.indexOf(":root[data-theme='dark']")
    expect(css.slice(0, darkStart)).toContain('--pt-app-bg: #f7f6ef')
    expect(css.slice(darkStart)).toContain('--pt-app-bg: #141614')
  })
  it('守衛消費的 token 仍存在（自 Bento 段搬遷後保留）', () => {
    expect(css).toContain('--pt-on-accent:')
    expect(css).toContain('--color-primary-contrast:')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/tokenLayering.spec.ts
```
Expected: FAIL（slate hex 仍在、alias 未重指向）。

- [ ] **Step 3: 實作（依序，每小步存檔）**

(a) **搬遷保留 token**：把 Bento 段（242-291）內的 `--pt-on-accent`、`--color-primary-contrast` 兩行原值剪下，貼到 Brand 段（122-138）尾。

(b) **刪 light Bento 段**（242-291 剩餘全部，含區段註解）與 **dark Bento 段**（404-431 全部）。

(c) **重寫 elevation 段**（原 140-161，claymorphism 三階＋hairline）為：

```css
  /* --------------------------------------------------------------
     Elevation（M3 Expressive：單一柔和綠灰陰影對，取代 claymorphism）
     -------------------------------------------------------------- */
  --pt-shadow-card: 0 1px 2px rgba(27, 60, 38, 0.05), 0 6px 20px -8px rgba(27, 60, 38, 0.14);
  --pt-shadow-float: 0 8px 28px -6px rgba(27, 60, 38, 0.25);
  --pt-elev-1: var(--pt-shadow-card);
  --pt-elev-2: 0 4px 14px -6px rgba(27, 60, 38, 0.18);
  --pt-elev-3: var(--pt-shadow-float);
  --pt-hairline: /* 原值保留不動，只搬進本段 */;
```
（`--pt-hairline` 抄 161 行原值；「Parent App v3」段 233-235 的舊 `--pt-shadow-card`/`--pt-shadow-press` 定義同步刪除，`--pt-shadow-press` 若有消費者則改指 `--pt-shadow-card`——先 `grep -rn "pt-shadow-press" src/parent` 確認。）

(d) **重指向文字/表面/邊框 alias**（74-106）。逐行改指向，行內註記舊值供回溯：

```css
  --pt-text-strong: var(--m3-on-surface);          /* 原 #392a1c，Bento 覆寫 #0f172a */
  --pt-text-body: var(--m3-on-surface);
  --pt-text-muted: var(--m3-on-surface-variant);   /* 原 #5b5b5b，Bento 覆寫 #64748b */
  --pt-text-faint: var(--m3-outline);
  --pt-surface-card: var(--m3-surface-container-lowest);
  --pt-border-strong: var(--m3-outline);
  --pt-border-light: var(--m3-outline-variant);
```
規則：74-106 內上表未列到的成員（soft/placeholder/disabled/hint、surface-mute 系、其餘 border）**先維持原值不動**（它們沒被 Bento 覆寫、視覺影響小，P4 掃尾再收）；只重指向上表七個曾被 Bento 覆寫的主力 alias。

(e) **dark 段同步**（308-328）：dark 內同名七個 alias 改成同樣的 `var(--m3-…)` 指向（m3-tokens.css dark 段會給出正確深色值，故 dark 的這幾行與 light 相同寫法即可）；dark elevation（353-356）改為：

```css
  --pt-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.4), 0 6px 20px -8px rgba(0, 0, 0, 0.5);
  --pt-shadow-float: 0 8px 28px -6px rgba(0, 0, 0, 0.6);
  --pt-elev-1: var(--pt-shadow-card);
  --pt-elev-2: 0 4px 14px -6px rgba(0, 0, 0, 0.45);
  --pt-elev-3: var(--pt-shadow-float);
```

(f) **暖底與 hero 漸層**：「Parent App v3」段加 `--pt-app-bg: #f7f6ef;`，dark 段加 `--pt-app-bg: #141614;`；漸層段（163-168）`--pt-gradient-hero` 改：

```css
  --pt-gradient-hero: linear-gradient(150deg, #fff7dd 0%, #d9f4e2 78%, #cdeef9 130%);
```
dark 段（358-359）對應改：

```css
  --pt-gradient-hero: linear-gradient(150deg, #2c2a1c 0%, #1c332a 78%, #14313c 130%);
```
系統 reset 段（470-501）的 body 背景改 `background: var(--pt-app-bg);`（原值 grep `body` 確認後替換）。

- [ ] **Step 4: 跑測試確認通過（新守衛＋全部既有守衛）**

```bash
npx vitest run tests/unit/parent/tokenLayering.spec.ts tests/unit/parent/accentTokens.spec.ts tests/unit/mobile/aaContrast.spec.ts src/views/public/__tests__/publicThemeContrast.test.ts
```
Expected: 全 PASS。若 `aaContrast` 紅：檢查是否誤刪 legacy 色階段（29-72）或其 dark 覆寫——那些 P1 必須保留。

- [ ] **Step 5: 全量測試＋殘留掃描**

```bash
npx vitest run
grep -n "0f172a\|94a3b8\|15,23,42" src/parent/styles/*.css
```
Expected: vitest 全綠；grep 零命中。紅的測試逐一判定：斷言舊 slate 值的測試＝斷言過時，**同步更新斷言到新 token 指向**（維持精確斷言，不放寬）；其他紅＝回歸，修到綠。

- [ ] **Step 6: Commit**

```bash
git add src/parent/styles/globals.css tests/unit/parent/tokenLayering.spec.ts
git commit -m "refactor(parent): Bento 冷調覆寫層退場，pt alias 重指向 m3 真源＋暖底與新陰影對"
```

---

### Task 5: patterns.css utility 對齊

**Files:**
- Modify: `src/parent/styles/patterns.css`（245 行）
- Test: `tests/unit/parent/patternTokens.spec.ts`（新建）

**Interfaces:**
- Consumes: Task 3 尺度 token、Task 2 motion token、Task 4 `--pt-gradient-hero`
- Produces: `.pt-card`（radius 走 var）、`.pt-action-btn`（膠囊＋字重 800）、`.pt-page-hero`（新漸層）。view 層 class 名全部不變。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/patternTokens.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/patterns.css'), 'utf-8')

describe('patterns.css Expressive 對齊（P1）', () => {
  it('.pt-card 圓角走 token 不寫死', () => {
    expect(css).toContain('border-radius: var(--pt-card-radius')
    expect(css).not.toMatch(/\.pt-card[^-{]*\{[^}]*border-radius:\s*18px/s)
  })
  it('.pt-action-btn 膠囊化', () => {
    expect(css).toMatch(/\.pt-action-btn\s*\{[^}]*border-radius:\s*9999px/s)
  })
  it('.pt-page-hero 用 hero 漸層 token', () => {
    expect(css).toMatch(/\.pt-page-hero\s*\{[^}]*var\(--pt-gradient-hero\)/s)
  })
  it('互動 utility 消費語意動效 token', () => {
    expect(css).toContain('var(--motion-quick)')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/patternTokens.spec.ts
```
Expected: FAIL。

- [ ] **Step 3: 實作（對照行號）**

- `.pt-card`（35-43）：`border-radius: 18px` → `border-radius: var(--pt-card-radius, 26px)`；box-shadow 改 `var(--pt-shadow-card)`。
- `.pt-page-hero`（69-94）：背景 cream→leaf 漸層改 `background: var(--pt-gradient-hero);`；圓角 `var(--pt-hero-radius, 30px)`。
- `.pt-action-btn`（145-173）：`border-radius: 9999px`、`font-weight: 800`、transition 時長改 `var(--motion-quick)`＋`:active { transform: scale(0.96); }`（transition 加 `transform var(--motion-base) var(--motion-spring)`）。
- `.pt-ghost-btn`／`.pt-icon-btn`／`.pt-list-row`：transition 時長字面值統一改 `var(--motion-quick)`。
- `.pt-pill` 系（126-142）：圓角維持 999px；success/warn/info 三變體底色改消費童彩配對（`--pt-accent-leaf-container`/`--pt-accent-sun-container`/`--pt-accent-sky-container`＋對應 `-on` 文字色）；danger／violet 維持原 semantic 色。
- `.pt-empty`（222-240）：`-title` 字重 → 900。
- reduced-motion 段（243-245）確認新加的 transform transition 也被關閉（把 `.pt-action-btn` 列入該段既有選擇器清單）。

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/patternTokens.spec.ts tests/unit/mobile/aaContrast.spec.ts
```
Expected: 全 PASS（aaContrast 有 `.pt-action-btn`／`.pt-pill-success` 相關斷言，特別確認）。

- [ ] **Step 5: Commit**

```bash
git add src/parent/styles/patterns.css tests/unit/parent/patternTokens.spec.ts
git commit -m "refactor(parent): patterns utility 對齊 Expressive——card/hero 走尺度 token、action-btn 膠囊化"
```

---

### Task 6: m3 元件批次一（Button/Card/Chip/TextField/IconButton/FAB）

**Files:**
- Modify: `src/parent/components/m3/M3Button.vue`（style 56-119）、`M3Card.vue`（48-84）、`M3Chip.vue`（92-158）、`M3TextField.vue`（86-171）、`M3IconButton.vue`、`M3FAB.vue`
- Test: `tests/unit/parent/m3Expressive.spec.ts`（新建，source-scan）

**Interfaces:**
- Consumes: Task 2/3 token
- Produces: 六元件新樣式；props/emits 零變動。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/m3Expressive.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (name: string) =>
  readFileSync(resolve(__dirname, `../../../src/parent/components/m3/${name}.vue`), 'utf-8')

describe('m3 元件 Expressive 化（P1 批次一）', () => {
  it('M3Card 圓角走 token', () => {
    expect(read('M3Card')).toContain('var(--pt-card-radius')
  })
  it('M3Chip 膠囊化', () => {
    expect(read('M3Chip')).toContain('border-radius: 9999px')
  })
  it('M3TextField outlined 圓角走 control token', () => {
    expect(read('M3TextField')).toContain('var(--pt-control-radius')
  })
  it.each(['M3Button', 'M3Card', 'M3FAB'])('%s 有 spring 按壓回饋', (name) => {
    const src = read(name)
    expect(src).toContain('var(--motion-spring)')
    expect(src).toContain('scale(0.96)')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/m3Expressive.spec.ts
```
Expected: FAIL。

- [ ] **Step 3: 實作（每元件同一套手法）**

共通 spring 按壓（加在各元件根 class 的 style 內；clickable 才加——M3Card 只在 `.clickable` variant 上）：

```css
transition: transform var(--motion-base) var(--motion-spring),
            background-color var(--motion-quick) ease,
            box-shadow var(--motion-quick) ease;
}
.（根 class）:active { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) {
  .（根 class） { transition: none; }
  .（根 class）:active { transform: none; }
}
```

個別：
- `M3Button.vue`：既有 9999px 不動；`font-weight` → 700 維持（膠囊字重交由 patterns `.pt-action-btn`，M3Button 依 M3 spec 保持 500→改 700）；加共通 spring。
- `M3Card.vue`：`border-radius: 12px` → `var(--pt-card-radius, 26px)`；elevated variant box-shadow 改 `var(--pt-shadow-card)`。
- `M3Chip.vue`：`border-radius: 8px` → `9999px`；selected 底色維持 `--m3-secondary-container` 配對不動。
- `M3TextField.vue`：outlined `border-radius: 4px` → `var(--pt-control-radius, 14px)`；filled 上圓角 `var(--pt-control-radius, 14px) var(--pt-control-radius, 14px) 0 0`。
- `M3IconButton.vue`／`M3FAB.vue`：圓角維持（icon 圓形／FAB 既有值），加共通 spring；FAB box-shadow 改 `var(--pt-shadow-float)`。

- [ ] **Step 4: 跑新測試＋既有 m3 行為測試**

```bash
npx vitest run tests/unit/parent/m3Expressive.spec.ts src/parent/components/m3/__tests__/
```
Expected: 全 PASS（行為測試紅＝改壞了 API 或 DOM 結構，回頭修）。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3 tests/unit/parent/m3Expressive.spec.ts
git commit -m "feat(parent): m3 元件批次一 Expressive 化——圓角 token 化＋spring 按壓回饋"
```

---

### Task 7: m3 元件批次二（NavigationBar/TopAppBar/Snackbar/List/ListItem/SegmentedButton/Switch/Checkbox/Radio/Divider）

**Files:**
- Modify: `src/parent/components/m3/M3NavigationBar.vue`（style 76-153）、`M3TopAppBar.vue`、`M3Snackbar.vue`、`M3List.vue`、`M3ListItem.vue`、`M3SegmentedButton.vue`、`M3Switch.vue`、`M3Checkbox.vue`、`M3Radio.vue`、`M3Divider.vue`
- Test: 擴充 `tests/unit/parent/m3Expressive.spec.ts`

**Interfaces:**
- Consumes: Task 2/3 token
- Produces: 批次二元件新樣式；`M3NavigationBar` 維持 3-item 現行行為（5 destinations 是 P2 scope，本批**不做**）。

- [ ] **Step 1: 擴充測試（追加至 m3Expressive.spec.ts）**

```ts
describe('m3 元件 Expressive 化（P1 批次二）', () => {
  it('M3NavigationBar indicator 用 spring 曲線', () => {
    expect(read('M3NavigationBar')).toContain('var(--motion-spring)')
  })
  it('M3Snackbar 圓角走 control token', () => {
    expect(read('M3Snackbar')).toContain('var(--pt-control-radius')
  })
  it('M3ListItem 有按壓 state layer transition 時長 token', () => {
    expect(read('M3ListItem')).toContain('var(--motion-quick)')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/m3Expressive.spec.ts
```
Expected: 新增 3 條 FAIL。

- [ ] **Step 3: 實作**

- `M3NavigationBar.vue`：indicator pill 的 transition 由 `opacity 150ms` 改為 `opacity var(--motion-quick) ease, transform var(--motion-base) var(--motion-spring)`；active icon scale 進場（`transform: scale(1)`，非 active `scale(0.9)`）。**不動** items 數量邏輯與 `--m3-secondary-container` AA 覆寫（那在 ParentLayout）。
- `M3TopAppBar.vue`：標題字重 → 900；bar 底色確認消費 `--m3-surface`（transparent-on-scroll 行為不動）。
- `M3Snackbar.vue`：圓角 → `var(--pt-control-radius, 14px)`；進出場 transition 時長 → `var(--motion-base)`。
- `M3List.vue`／`M3ListItem.vue`：group 圓角 → `var(--pt-card-radius)`（List 容器）；ListItem state-layer transition → `var(--motion-quick)`。
- `M3SegmentedButton.vue`：外框圓角 → 9999px；selected 底 `--m3-secondary-container` 配對不動。
- `M3Switch.vue`／`M3Checkbox.vue`／`M3Radio.vue`：transition 時長字面值 → `var(--motion-quick)`；色彩 token 不動。
- `M3Divider.vue`：色彩確認 `--m3-outline-variant`（多半不用動）。
- 各檔比照 Task 6 的 reduced-motion 覆寫確保涵蓋新 transform。

- [ ] **Step 4: 跑測試**

```bash
npx vitest run tests/unit/parent/m3Expressive.spec.ts src/parent/components/m3/__tests__/
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3 tests/unit/parent/m3Expressive.spec.ts
git commit -m "feat(parent): m3 元件批次二 Expressive 化——nav pill spring、list/snackbar 圓角 token 化"
```

---

### Task 8: 家長端共用元件換膚（StatTile/SectionHeader/SkeletonBlock/StatusPill/ContactBookDayCard/ParentBottomSheet）

**Files:**
- Modify: `src/parent/components/StatTile.vue`、`SectionHeader.vue`、`SkeletonBlock.vue`、`StatusPill.vue`、`ParentBottomSheet.vue`、`src/parent/components/contact-book/ContactBookDayCard.vue`（style 152 起）
- Test: `tests/unit/parent/parentComponentsExpressive.spec.ts`（新建）

**Interfaces:**
- Consumes: Task 2/3/4 token
- Produces: 六元件新樣式；**props 零變動**——`StatTile` 的 `tone` 值（sky/coral/amber/brand…）維持原名，內部映射到童彩配對（amber→sun）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/parentComponentsExpressive.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) =>
  readFileSync(resolve(__dirname, `../../../src/parent/components/${rel}`), 'utf-8')

describe('家長端共用元件 Expressive 換膚（P1）', () => {
  it('StatTile 消費童彩配對 token', () => {
    const src = read('StatTile.vue')
    expect(src).toContain('--pt-accent-sky-container')
    expect(src).toContain('--pt-accent-sun-container') // amber tone 內部映射到 sun
  })
  it('SkeletonBlock 有 shimmer 動畫與 reduced-motion 降階', () => {
    const src = read('SkeletonBlock.vue')
    expect(src).toContain('@keyframes')
    expect(src).toContain('prefers-reduced-motion')
  })
  it('SectionHeader 標題字重 900', () => {
    expect(read('SectionHeader.vue')).toContain('font-weight: 900')
  })
  it('ContactBookDayCard 用 hero 漸層與 hero 圓角 token', () => {
    const src = read('contact-book/ContactBookDayCard.vue')
    expect(src).toContain('var(--pt-gradient-hero)')
    expect(src).toContain('var(--pt-hero-radius')
  })
  it('ParentBottomSheet 上緣圓角走 hero token', () => {
    expect(read('ParentBottomSheet.vue')).toContain('var(--pt-hero-radius')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/parentComponentsExpressive.spec.ts
```
Expected: FAIL。

- [ ] **Step 3: 實作**

- `StatTile.vue`：各 tone 的底色/文字改消費 `--pt-accent-*-container`／`--pt-accent-*-on`（tone 對映：sky→sky、coral→coral、amber→sun、brand→`--m3-primary-container` 配對；先開檔盤點現有 tone 值全集再逐一對映，**不得留任一 tone 掉回舊 `--ivy-tile-*`**）；tile 圓角 `var(--pt-card-radius)`；icon 移入半透明白圓塊（mockup `.tile-icon` 樣式：42px、圓角 16px、`rgba(255,255,255,0.55)`——此為 color-mix 快照，dark 用 `rgba(255,255,255,0.1)`，寫成 tile 內 local var 由 `:root[data-theme='dark']` 切換）；按壓 spring（同 Task 6 共通手法）。
- `SectionHeader.vue`：標題 `font-weight: 900`、字級 16.5px。
- `SkeletonBlock.vue`：底色塊加 shimmer：

```css
.skeleton { position: relative; overflow: hidden; }
.skeleton::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%);
  animation: pt-shimmer 1.4s ease-in-out infinite;
}
@keyframes pt-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none; } }
```
（dark 下 shimmer 高光 `rgba(255,255,255,0.08)`，同 StatTile 手法用 local var 切換；class 名以現檔實際根 class 為準。）
- `StatusPill.vue`：tone 底色改童彩配對（ok→leaf、info→sky、warn→sun、danger 維持 semantic、neutral 維持），圓角已是膠囊則不動。
- `ContactBookDayCard.vue`：`.day-card` 背景 `linear-gradient(135deg, var(--cream), var(--leaf-100))` → `var(--pt-gradient-hero)`；圓角 20px → `var(--pt-hero-radius, 30px)`；awaiting/offday 變體漸層同步改為 `--pt-gradient-hero` 加 `opacity` 收斂（維持「有聯絡簿的日子更飽滿」的既有設計意圖）；心情方塊（`.hero-motif`／MoodBadge 容器）圓角 24px。
- `ParentBottomSheet.vue`：上緣圓角 → `var(--pt-hero-radius, 30px) var(--pt-hero-radius, 30px) 0 0`；進場 transition → `var(--motion-page) var(--motion-emphasized)`。

- [ ] **Step 4: 跑測試（新＋相關既有元件測試）**

```bash
npx vitest run tests/unit/parent/parentComponentsExpressive.spec.ts src/parent/components/__tests__/
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components tests/unit/parent/parentComponentsExpressive.spec.ts
git commit -m "feat(parent): 共用元件 Expressive 換膚——StatTile 童彩化、skeleton shimmer、hero 卡新漸層"
```

---

### Task 9: 全量驗證與收尾

**Files:**
- 無新變更（驗證＋必要修補）

**Interfaces:**
- Consumes: Task 1–8 全部產出
- Produces: 三綠（test/typecheck/build）＋視覺抽查證據，P1 本地完成。

- [ ] **Step 1: 全量測試**

```bash
npx vitest run
```
Expected: 全 PASS。紅的逐一判定（斷言過時→同步更新為精確新斷言；回歸→修）。

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```
Expected: 零錯誤。

- [ ] **Step 3: build＋chunk gate**

```bash
npm run build
```
Expected: 成功；`check-entry-chunks` 通過；parent 首屏 gz 與 Task 1 baseline 比對，增幅應 < 3KB（本批只有 CSS 與少量 keyframes）。

- [ ] **Step 4: 視覺抽查（dev server）**

在 worktree 起 `npx vite --port 5174`（避開使用者可能在跑的 5173），以瀏覽器工具開 `http://localhost:5174/parent.html`，抽查：首頁（light/dark 各一張截圖）、聯絡簿詳情、事務頁。核對點：暖底生效、卡片 26px 圓角、tile 童彩配對、無 slate 殘影、dark 對比正常。截圖存 workspace `.scratch/`。完成後關掉 dev server。

- [ ] **Step 5: 收尾狀態回報（不 push）**

```bash
git log --oneline origin/staging..HEAD
git status
```
整理：commit 清單、測試/typecheck/build 結果、首屏 gz 差、截圖路徑。回報使用者等待 staging 授權——**本計畫到此為止，push 與 promotion 不在 scope**。

---

## Self-Review 紀錄

- **Spec 覆蓋**：§4 token 收斂→Task 3/4/5；§5 元件→Task 6/7/8（NavigationBar 5-item 明確標記為 P2 不在本批）；§8 動效→Task 2＋各元件消費；§10 驗證→Task 9。§6 插畫、§7 IA 屬 P3/P2，不在本計畫。
- **無 placeholder**：所有 CSS/測試皆給實際內容；行號會漂移處（hairline 原值、body 背景原值、easing 變數精確名、StatTile tone 全集）均註明「先開檔確認再改」的具體查法，非 TBD。
- **型別/命名一致**：`--pt-accent-{name}-container/-on`、`--motion-*`、`--pt-hero-radius` 在 Task 3 定義、5–8 消費，名稱逐一核對過。
