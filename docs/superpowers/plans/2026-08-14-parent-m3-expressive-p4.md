# 家長端 M3 Expressive 改版 P4（掃尾）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 spec §9 P4（一致性收口）：移除已死的 `MeDrawer.vue`、清理零消費的 legacy raw token、把 legacy 色階用量最集中的兩個共用元件（`TimelineRow.vue`／`MoodBadge.vue`）改走 P1 童彩 accent token、確認對比守衛全綠。

**Architecture:** 不開新分支——P4 直接在整合分支 `feat/parent-m3-expressive-integrated`（已由 P1+P2+P3 合併而成並驗證全綠，1037 測試檔／7402 測試通過）上繼續施工，因為 P4 的前提（5-tab IA 已生效、MeDrawer 已無掛載點）必須建立在三批全部到位之上。

**Tech Stack:** Vue 3 SFC、Vitest、既有 `tests/unit/mobile/aaContrast.spec.ts` 對比守衛。

**Spec:** `docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md` §9

## Global Constraints

- **分支＝`feat/parent-m3-expressive-integrated`**（worktree `~/Desktop/ivy-frontend/.claude/worktrees/parent-integrated`）。這是 P1（HEAD `24a79b82`）+ P2（`feat/parent-m3-expressive-p2`，merge commit `8956dfa0`）+ P3（P1 基礎上延伸）的整合分支，`git merge-tree` dry-run 確認零真實衝突，唯一衝突是圖示字型二進位產物（已重新用 `gen:parent-icons` 產生 137-icon 正確子集）。整合已跑過全量 vitest（1037 檔／7402 測試全綠）。
- **P4 範圍已與使用者核可為「機械性插件換 token」**（2026-08-14 裁定）：只把寫死的 hex／legacy raw token 換成對應的 P1 童彩 accent token 或既有 `--pt-*`/`--m3-*` token，**不重新設計版面、不新增插畫、不動版面結構**。範圍聚焦在 legacy raw token 用量最集中的兩個共用元件（`TimelineRow.vue`／`MoodBadge.vue`），因為改一次連動多個消費頁面受益。
- **明確排除於本批**：FeesView／MeView／ActivityView 等 16+ 個未被 P1-P3 動過的頁面各自的硬編 hex／radius/shadow——這些是頁面獨有樣式（非共用元件），逐頁清理工程量與前三批總和同級，超出「機械性、低風險」定位，留給未來批次（回報時明確告知使用者）。
- **重要修正（勿重蹈覆轍）**：對比守衛 `tests/unit/mobile/aaContrast.spec.ts` 第 42-58 行的「legacy 色階 dark 區塊必須覆寫」斷言明確要求 dark 區塊含 `--leaf-700:` 的覆寫——**即使目前沒有任何 `.vue` 檔案消費 `--leaf-700` 的值，這個 token 定義也不能刪除**，它是對比安全網完整性契約的一部分。盤點確認的「9 個零消費 token」中，只有 8 個真正可刪（`--sky-50/200/300/500/900`、`--sun-500`、`--leaf-500`、`--grape-300/500`），`--leaf-700` 排除在外。
- 元件 API（props/emits/slots）零變動；`MOOD_MAP`／`tone-*` 的**值域與語意**不變，只換底色/文字色的 token 來源。
- 測試指令不可接 `| tail`；vitest 目標檔單獨跑；全量測試與 typecheck 不同時背景執行（P1/P2/P3 已驗證會 OOM）。
- typecheck 若 OOM，用 `NODE_OPTIONS="--max-old-space-size=6144" npx vue-tsc --noEmit`。
- 收尾 gate：`npm run test`、`npm run typecheck`、`npm run build` 三綠。
- Commit 訊息繁體中文、Conventional Commits，結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。**不 push**，本計畫終點是本地完成＋驗證綠。

---

### Task 1: 確認整合分支就緒（無新增變更，純驗證）

**Files:**
- 無程式碼變更

**Interfaces:**
- Produces: 確認 worktree 狀態乾淨、baseline 測試綠，供後續 task 安心疊加變更。

- [ ] **Step 1: 確認分支與工作區狀態**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/parent-integrated
git status --short
git log --oneline -5
```
Expected: 工作區乾淨（無未 commit 變更）；log 頭部應為字型子集重產 commit（`chore(parent): 整合 P1+P2+P3...`）。

- [ ] **Step 2: baseline——即將動到的既有測試須綠**

```bash
npx vitest run tests/unit/mobile/aaContrast.spec.ts tests/unit/parent/components/layout/MeDrawer.test.js src/parent/layouts/__tests__ tests/unit/parent/components/ParentLayoutTabs.spec.ts 2>&1 | tail -30
```
若 `src/parent/layouts/__tests__` 路徑不存在屬正常（ParentLayout 測試可能放在 `tests/unit/parent/components/`），改跑：

```bash
npx vitest run tests/unit/mobile/aaContrast.spec.ts tests/unit/parent/components/layout/MeDrawer.test.js tests/unit/parent/components/ParentLayoutTabs.spec.ts tests/unit/parent/components/ParentLayoutTabReTap.test.js
```
Expected: 全 PASS。

---

### Task 2: 移除 MeDrawer（元件＋測試＋過時註解）

**Files:**
- Delete: `src/parent/components/layout/MeDrawer.vue`
- Delete: `tests/unit/parent/components/layout/MeDrawer.test.js`
- Modify: `src/parent/composables/useParentLogout.ts`（更新過時註解）

**Interfaces:**
- Consumes: 無（已確認零生產程式碼引用，見 Global Constraints 前置盤點）
- Produces: `MeDrawer.vue` 完全移除；`useParentLogout.ts` 註解反映現況（不再有 MeDrawer 靜態鏈）。

- [ ] **Step 1: 再次確認零引用（防止 worktree 間資訊落差）**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/parent-integrated
grep -rln "MeDrawer" src/parent --include="*.vue" --include="*.ts" | grep -v "__tests__\|test\.js\|test\.ts"
```
Expected: 只輸出 `src/parent/composables/useParentLogout.ts`（純註解提及，非 import）。若輸出還有其他檔案（例如某處仍 `<MeDrawer>` 掛載），**停止本 task**，回報衝突狀況而非強行刪除。

- [ ] **Step 2: 刪除元件與測試**

```bash
git rm src/parent/components/layout/MeDrawer.vue
git rm tests/unit/parent/components/layout/MeDrawer.test.js
```

- [ ] **Step 3: 更新 `useParentLogout.ts` 過時註解**

原本（第 15-17 行）：

```ts
// 注意：liff（@line/liff SDK ~30KB gz）改為登出時才 dynamic import。此 composable
// 經 MeDrawer → ParentLayout → App.vue 靜態鏈落在家長首屏；若靜態 import liff 會把整包
// SDK 拖進首屏。登出是使用者動作，容忍一次動態載入（登入過的使用者該 chunk 已在快取）。
```

改為：

```ts
// 注意：liff（@line/liff SDK ~30KB gz）改為登出時才 dynamic import。此 composable
// 經 MeView（/me route lazy component）引入；P2 起 MeDrawer 已移除掛載，本檔不再
// 落在首屏靜態鏈上，但維持動態 import liff 的既有決策不變（無急迫理由改回靜態，
// 且改動屬效能優化範疇，超出 P4 掃尾範圍）。
```

- [ ] **Step 4: 跑相關測試確認無連帶破壞**

```bash
npx vitest run tests/unit/parent/components/ParentLayoutTabs.spec.ts tests/unit/parent/components/ParentLayoutTabReTap.test.js tests/unit/parent/composables 2>&1 | tail -20
```
若 `tests/unit/parent/composables` 目錄跑不動（路徑需確認），改跑：

```bash
npx vitest run tests/unit/parent/components/ParentLayoutTabs.spec.ts tests/unit/parent/components/ParentLayoutTabReTap.test.js
find tests/unit/parent -iname "*logout*"
```
找到 logout 相關測試後一併加入跑；Expected 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/composables/useParentLogout.ts
git commit -m "refactor(parent): 移除已無引用的 MeDrawer 元件（P2 起功能已全數轉移至 /me 頁）

- 刪除 MeDrawer.vue 與其測試（P2 已拿掉 ParentLayout 的掛載點，個人資料/
  通知偏好/加綁子女/登出四項功能已在 /me 頁完整存在，見 P2 spec §7）
- 更新 useParentLogout.ts 過時註解（不再提及已不存在的 MeDrawer 靜態鏈）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Legacy raw token 死代碼清理（8 個零消費 token）

**Files:**
- Modify: `src/parent/styles/globals.css`
- Test: `tests/unit/parent/legacyTokenCleanup.spec.ts`（新建）

**Interfaces:**
- Consumes: 無
- Produces: 8 個零消費 token（`--sky-50/200/300/500/900`、`--sun-500`、`--leaf-500`、`--grape-300/500`）從 light `:root` 移除；`--leaf-700` 明確保留不動（對比守衛依賴）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/legacyTokenCleanup.spec.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')

const REMOVED_TOKENS = [
  '--sky-50:', '--sky-200:', '--sky-300:', '--sky-500:', '--sky-900:',
  '--sun-500:',
  '--leaf-500:',
  '--grape-300:', '--grape-500:',
]

describe('Legacy raw token 死代碼清理（P4）', () => {
  it.each(REMOVED_TOKENS)('%s 已從 globals.css 移除（零消費確認，見 P4 計畫盤點）', (token) => {
    expect(css).not.toContain(token)
  })

  it('--leaf-700 明確保留（對比守衛依賴，非零消費 token）', () => {
    // aaContrast.spec.ts 第 51 行要求 dark 區塊含 --leaf-700: 覆寫，
    // 即使目前無 .vue 消費其值，此 token 是對比安全網完整性契約的一部分，
    // 誤刪會讓既有守衛紅燈——此測試防止未來重蹈覆轍。
    expect(css).toContain('--leaf-700:')
    const darkStart = css.indexOf(":root[data-theme='dark']")
    expect(css.slice(darkStart)).toContain('--leaf-700:')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/legacyTokenCleanup.spec.ts
```
Expected: 8 個 FAIL（token 仍存在）、1 個 PASS（`--leaf-700` 本來就在）。

- [ ] **Step 3: 實作——刪除 8 行**

於 `src/parent/styles/globals.css`，於 light `:root` 段（約 36-70 行區間，實際行號以現檔為準，先 `grep -n` 定位再刪）逐一移除：

```
--sky-50:    #f2f9fc;
--sky-200:   #bbdded;
--sky-300:   #92c8e0;
--sky-500:   #5ba8cc;
--sky-900:   #1b4459;
--sun-500:   #ffd93d;
--leaf-500:  #5fc79a;
--grape-300: #d4bce6;
--grape-500: #b58cd9;
```
（`--leaf-700` **不列入刪除清單**，維持原樣不動。）

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/legacyTokenCleanup.spec.ts tests/unit/mobile/aaContrast.spec.ts
```
Expected: 全 PASS（對比守衛不受影響，因為只刪了守衛清單外的 token）。

- [ ] **Step 5: 全域 grep 確認無殘餘消費者（雙重確認）**

```bash
grep -rn "var(--sky-50\|var(--sky-200\|var(--sky-300\|var(--sky-500\|var(--sky-900\|var(--sun-500\|var(--leaf-500\|var(--grape-300\|var(--grape-500" src/parent src/components src/views 2>/dev/null
```
Expected: 零輸出。若有輸出，代表盤點遺漏消費者，**先還原 Step 3 的刪除**，改為只刪真正零消費的子集，重新跑 Step 4。

- [ ] **Step 6: Commit**

```bash
git add src/parent/styles/globals.css tests/unit/parent/legacyTokenCleanup.spec.ts
git commit -m "chore(parent): 清理 8 個零消費 legacy raw token（P4 掃尾）

--sky-50/200/300/500/900、--sun-500、--leaf-500、--grape-300/500 全域確認
零 .vue 消費且不在對比守衛的 dark 覆寫必要清單內，安全移除定義。
--leaf-700 雖同為零消費，但 aaContrast.spec.ts 明確要求 dark 區塊覆寫此
token（對比安全網完整性契約），保留不動——新增守衛測試防止未來誤刪。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: TimelineRow.vue 童彩化（legacy raw token 用量最集中的共用元件之一）

**Files:**
- Modify: `src/parent/components/contact-book/TimelineRow.vue`
- Test: `src/parent/components/contact-book/__tests__/TimelineRow.spec.ts`（新建，先前無專屬測試）

**Interfaces:**
- Consumes: P1 童彩 accent token（`--pt-accent-{sun|coral|sky|leaf|grape}-container/-on`）
- Produces: 5 個 `tone-*` 規則改消費童彩 token，語意/DOM 結構零變動；`.dot` fallback 背景（`--cream`）與 `.line` 虛線色（`--leaf-300`）維持不動（不在本次清理範圍，見 Global Constraints）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/components/contact-book/__tests__/TimelineRow.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TimelineRow from '../TimelineRow.vue'

const css = readFileSync(resolve(__dirname, '../TimelineRow.vue'), 'utf-8')

describe('TimelineRow — 童彩化（P4）', () => {
  it('渲染 icon/label/value', () => {
    const w = mount(TimelineRow, { props: { icon: 'restaurant', label: '午餐', value: '3/3' } })
    expect(w.text()).toContain('午餐')
    expect(w.text()).toContain('3/3')
  })

  it.each([
    ['green', 'leaf'],
    ['coral', 'coral'],
    ['grape', 'grape'],
    ['sun', 'sun'],
    ['sky', 'sky'],
  ])('iconTone=%s 的 .dot 走童彩 %s tonal（container+on 配對）', (iconTone, accent) => {
    const re = new RegExp(`\\.tone-${iconTone}\\s+\\.dot\\s*\\{[^}]*var\\(--pt-accent-${accent}-on[^}]*var\\(--pt-accent-${accent}-container`, 's')
    expect(css).toMatch(re)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/parent/components/contact-book/__tests__/TimelineRow.spec.ts
```
Expected: 第一條 PASS（既有渲染邏輯本來就對），5 條 tone 測試 FAIL（現行是 legacy raw token）。

- [ ] **Step 3: 實作**

```css
.tone-green .dot  { color: var(--pt-accent-leaf-on); background: var(--pt-accent-leaf-container); }
.tone-coral .dot  { color: var(--pt-accent-coral-on); background: var(--pt-accent-coral-container); }
.tone-grape .dot  { color: var(--pt-accent-grape-on); background: var(--pt-accent-grape-container); }
.tone-sun   .dot  { color: var(--pt-accent-sun-on); background: var(--pt-accent-sun-container); }
.tone-sky   .dot  { color: var(--pt-accent-sky-on); background: var(--pt-accent-sky-container); }
```

（取代原本的 `var(--brand-primary, #0d9053)` / `var(--leaf-100, #dcf4e6)` 等 5 行寫法。）

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run src/parent/components/contact-book/__tests__/TimelineRow.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: 跑消費 TimelineRow 的既有測試確認未破**

```bash
grep -rl "TimelineRow" src/parent/views src/parent/components --include="*.vue" | grep -v __tests__
```
（先找出消費頁面，通常是 `ContactBookDetailView.vue`。）

```bash
npx vitest run src/parent/views/__tests__/ContactBookDetailView.hero.test.ts src/parent/views/__tests__/ContactBookDetailView.raceGuard.test.ts tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js tests/unit/mobile/aaContrast.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/contact-book/TimelineRow.vue src/parent/components/contact-book/__tests__/TimelineRow.spec.ts
git commit -m "refactor(parent): TimelineRow 五色 tone 改走童彩 tonal 配對（P4 掃尾，legacy token 收斂）

.tone-green/coral/grape/sun/sky 從 --brand-primary/--leaf-100/--coral-700 等
legacy raw token 改消費 P1 童彩 accent token（container+on 配對），語意與
DOM 結構零變動。.dot fallback 背景（--cream）與 .line 虛線色（--leaf-300）
維持不動，不在本次機械性換 token 範圍。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: MoodBadge.vue 童彩化（legacy raw token 用量最集中的共用元件之二）

**Files:**
- Modify: `src/parent/components/contact-book/MoodBadge.vue`
- Test: `src/parent/components/contact-book/__tests__/MoodBadge.spec.ts`（新建，先前無專屬測試——P1-P3 都只間接透過 ContactBookDayCard/ContactBookDetailView 測到）

**Interfaces:**
- Consumes: P1 童彩 accent token
- Produces: `tone-sun`/`tone-grape`/`tone-sky`/`tone-coral` 四個規則改消費童彩 token；`tone-cream`（normal 心情，中性米白）與 `tone-muted`（未記錄 fallback）維持不動——兩者本來就不是童彩五色系統的一部分，是刻意的中性選擇。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/parent/components/contact-book/__tests__/MoodBadge.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MoodBadge from '../MoodBadge.vue'

const css = readFileSync(resolve(__dirname, '../MoodBadge.vue'), 'utf-8')

describe('MoodBadge — 童彩化（P4）', () => {
  it('mood=happy 渲染開心 emoji', () => {
    const w = mount(MoodBadge, { props: { mood: 'happy', showLabel: true } })
    expect(w.text()).toContain('開心')
  })

  it('mood=null 渲染未記錄 fallback', () => {
    const w = mount(MoodBadge, { props: { mood: null, showLabel: true } })
    expect(w.text()).toContain('未記錄')
  })

  it.each([
    ['sun', 'sun'],
    ['grape', 'grape'],
    ['sky', 'sky'],
    ['coral', 'coral'],
  ])('tone-%s 走童彩 %s container', (tone, accent) => {
    const re = new RegExp(`\\.tone-${tone}\\s+\\.mood-emoji\\s*\\{[^}]*var\\(--pt-accent-${accent}-container`, 's')
    expect(css).toMatch(re)
  })

  it('tone-cream（normal 心情）維持中性 --cream，不強行套童彩', () => {
    expect(css).toMatch(/\.tone-cream\s+\.mood-emoji\s*\{[^}]*var\(--cream/s)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run src/parent/components/contact-book/__tests__/MoodBadge.spec.ts
```
Expected: 前兩條 PASS（既有渲染邏輯本來就對），4 條 tone 測試 FAIL，`tone-cream` 那條 PASS（本來就是 `--cream`，不用改）。

- [ ] **Step 3: 實作**

```css
.tone-sun    .mood-emoji { background: var(--pt-accent-sun-container); }
.tone-cream  .mood-emoji { background: var(--cream, #fffcf2); border: 1px solid var(--pt-border-light); }
.tone-grape  .mood-emoji { background: var(--pt-accent-grape-container); }
.tone-sky    .mood-emoji { background: var(--pt-accent-sky-container); }
.tone-coral  .mood-emoji { background: var(--pt-accent-coral-container); }
```

（`tone-cream` 那行不動；其餘四行把 `var(--sun-100, ...)` 等改成對應童彩 container。這裡只換底色，不加文字色——`MoodBadge` 本身沒有文字色需求，`mood-emoji` 裝的是 emoji 字元非 icon，emoji 自帶色彩不受 CSS `color` 影響；`mood-label` 走既有 `--pt-text-strong`，不受此次改動影響。）

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run src/parent/components/contact-book/__tests__/MoodBadge.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: 跑消費 MoodBadge 的既有測試確認未破**

```bash
npx vitest run src/parent/components/contact-book/__tests__/ContactBookDayCard.spec.ts src/parent/views/__tests__/ContactBookDetailView.hero.test.ts tests/unit/mobile/aaContrast.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/contact-book/MoodBadge.vue src/parent/components/contact-book/__tests__/MoodBadge.spec.ts
git commit -m "refactor(parent): MoodBadge 四色 tone 改走童彩 tonal container（P4 掃尾，legacy token 收斂）

tone-sun/grape/sky/coral 從 legacy raw token（--sun-100/--grape-100/
--sky-100/--coral-100）改消費 P1 童彩 accent container token。tone-cream
（normal 心情，中性米白）與 tone-muted（未記錄 fallback）維持不動，兩者
本非童彩五色系統的一部分，是刻意的中性選擇。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 全量驗證與收尾

**Files:**
- 無新變更（驗證＋必要修補）

**Interfaces:**
- Consumes: Task 1–5 全部產出
- Produces: 三綠（test/typecheck/build）＋對比守衛全綠證據，P4（也是整批 M3 Expressive 改版）本地完成。

- [ ] **Step 1: 全量測試**

```bash
npx vitest run
```
Expected: 全 PASS。紅的逐一判定：若圖示字型子集守衛紅（本批未新增 icon 引用，理論上不會，但若動到 TimelineRow/MoodBadge 樣式行意外觸發寬鬆掃描規則誤判，比照 P1-P3 教訓處理：檢查是否有 `icon`/`Icon` 字樣與新引號字面值同行）；若出現與本批改動無關的 timeout 型紅燈，單獨重跑該檔案確認是否為機器資源競爭。

- [ ] **Step 2: typecheck**

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx vue-tsc --noEmit
```
Expected: 零錯誤（含 Task 2 刪除 `MeDrawer.vue` 後，確認沒有任何檔案還 import 它導致的型別錯誤）。

- [ ] **Step 3: build＋chunk gate**

```bash
npm run build
```
Expected: 成功；`check-entry-chunks` 通過；家長端首屏 gz 應與 P3 完成時的 233.1KB 量級相近或略降（本批刪除 MeDrawer.vue 減少程式碼量，token 清理與童彩化替換不增加資產）。

- [ ] **Step 4: 對比守衛專項確認**

```bash
npx vitest run tests/unit/mobile/aaContrast.spec.ts tests/unit/parent/legacyTokenCleanup.spec.ts src/parent/components/contact-book/__tests__/TimelineRow.spec.ts src/parent/components/contact-book/__tests__/MoodBadge.spec.ts
```
Expected: 全 PASS——這是 P4「對比守衛全綠」目標的直接證據。

- [ ] **Step 5: 收尾狀態回報（不 push）**

```bash
git log --oneline feat/parent-m3-expressive-p1..HEAD
git status
```
整理：commit 清單（Task 2-5 共 4 個 + 整合階段的 merge/字型重產 2 個）、測試/typecheck/build 結果、首屏 gz 變化。回報使用者：
1. P4 明確排除的範圍（16+ 頁未走共用元件的獨立硬編值，留給未來批次）
2. 整個 M3 Expressive 改版（P1+P2+P3+P4）現在收斂在單一分支 `feat/parent-m3-expressive-integrated`，等待 staging 授權
3. 原本 P1/P2/P3 三個獨立分支已完成歷史使命（內容已包含在整合分支內），worktree 建議保留供追溯，分支本身不建議再單獨 push
**本計畫到此為止，push 與 promotion 不在 scope。**

---

## Self-Review 紀錄

- **Spec 覆蓋**：§9 P4 四項——MeDrawer 移除（Task 2）、legacy raw token 刪除（Task 3）、其餘 views 對齊（範圍已與使用者收斂為「共用元件優先」，Task 4/5）、對比守衛全綠（Task 6 Step 4）皆有對應。
- **無 placeholder**：所有程式碼與測試皆為實際內容。
- **型別/命名一致**：Task 3/4/5 的 token 名稱（`--pt-accent-*-container/-on`）與 P1 spec 定義、P3 已使用的命名完全一致。
- **關鍵風險已消除**：`--leaf-700` 誤刪風險已在計畫撰寫階段發現並修正（Task 3 明確排除＋新增守衛測試防呆），非事後補救。
- **範圍誠實揭露**：Task 6 Step 5 明確要求回報「排除範圍」，不讓「P4 掃尾」被誤解為「全部 34 頁都已對齊」。
