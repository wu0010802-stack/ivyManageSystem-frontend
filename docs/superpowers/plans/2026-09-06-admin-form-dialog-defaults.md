# 後台表單預設層＋FormDialog＋棘輪守衛 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓後台新增／編輯表單「用一個元件就合規」、既有 84 檔零逐檔改動拿到全域修正，並以棘輪守衛鎖住數字只降不升；用兩張旗艦驗證兩條遷移路徑。

**Architecture:** 三層：① `main.css` 全域 CSS 預設層（手機標籤對齊修正＋桌機 dialog 內表單預設 label-top，附 opt-out class）② `FormDialog.vue` 薄封裝殼（尺寸 token、footer 樣板、關閉保護、autofocus、Enter 送出、錯誤捲動），不擁有 `el-form`；搭配 `useFormDirty` 與 `validators/rules.ts` ③ `scripts/check-form-dialogs.mjs` 四指標棘輪進 CI。旗艦 F1（課程：重排版面）與 F2（收付款：只換殼）。

**Tech Stack:** Vue 3.5 `<script setup lang="ts">`、Element Plus 2.13（`el-dialog`／`el-form`）、Vitest 4 + @vue/test-utils（happy-dom）、Node ESM scripts（`.mjs`）、PostCSS custom media（`--to-sm`／`--to-md`）。

**Spec:** `docs/superpowers/specs/2026-09-06-admin-form-dialog-defaults-design.md`（開放決策 D1／D2／D3 皆採預設：做、是、是）

## Global Constraints

- 工作目錄：`~/Desktop/ivy-frontend/.claude/worktrees/form-dialog-defaults`（分支 `feat/admin-form-dialog-defaults`，基於 origin/staging）。**所有指令都在此目錄執行**，不要碰主 checkout。`node_modules` 是指向主 repo 的 symlink，直接用。
- TS-only：新檔一律 `<script setup lang="ts">`／`.ts`；禁 `any`／`as any`（用 `unknown` 收窄）。ESLint `no-explicit-any` blocking。
- 語言：程式註解、commit message、文件一律繁體中文（台灣用語）。
- Commit 一律限定路徑：`git add <檔案…>` 後 `git commit -m … -- <檔案…>`；**禁止** `git add .`、`git commit -a`、`git checkout` 切分支、`git push`（push 需使用者授權）。
- 每個 commit message 結尾加兩行 trailer：
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh
  ```
- 跑測試：`VITEST_MAX_FORKS=2 npx vitest run <檔案…>`（機器 8GB，不要全套並行）。typecheck：`NODE_OPTIONS=--max-old-space-size=4096 npx vue-tsc --noEmit`。
- vitest 只套 `vue()` plugin、**沒有** unplugin 元件自動註冊：SFC 使用共用元件一律 **顯式 import**（如 `import FormSection from '@/components/common/FormSection.vue'`），否則測試裡會變成未解析標籤。
- happy-dom 下 `ElForm.validate()` 對空值恆回 true：必填斷言用 `.el-form-item.is-required` 類名，**不用**「點儲存看 emit」。`el-dialog` 會 teleport，測試一律用 stub 把 slot 就地渲染。
- 不動任何 API payload、驗證語意、權限判斷；不動 `src/parent/**`、`src/views/portal/**`、`src/components/portal/**`。
- `npm run build` 會重生 `components.d.ts` 並塞進其他分支的元件：build 後用 `git show HEAD:components.d.ts > components.d.ts` 還原，再手動只加本計畫那一行。
- CSS 顏色不得新增寫死 hex（`lint:tokens` 棘輪）；中性色用 `--el-*` 變數。

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `src/assets/main.css` | 修：`--to-sm` 標籤對齊；新增桌機 dialog 內 label-top 預設層 |
| `tests/unit/assets/mainCssFormDefaults.test.ts` | 新：CSS 契約文字測試（規則存在、opt-out 選擇器存在） |
| `scripts/check-form-dialogs.mjs` | 新：四指標棘輪 |
| `tests/unit/ci/checkFormDialogs.test.ts` | 新：fixture 目錄驗偵測邏輯 |
| `package.json`、`.github/workflows/ci.yml` | 修：接線 `check:form-dialogs` |
| `src/composables/useFormDirty.ts` | 新：通用 dirty 快照 |
| `tests/unit/composables/useFormDirty.test.ts` | 新 |
| `src/validators/rules.ts` | 新：EP rule 產生器與統一文案 |
| `tests/unit/validators/rules.test.ts` | 新 |
| `src/components/common/FormDialog.vue` | 新：表單型 dialog 標準殼 |
| `tests/components/FormDialog.test.ts` | 新 |
| `components.d.ts` | 修：加 `FormDialog` 一行 |
| `DESIGN.md`、`docs/analysis/2026-08-18-admin-create-form-inventory.md` | 修／還原文件 |
| `src/views/activity/ActivityCourseView.vue` | 修：F1 |
| `src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts` | 新 |
| `src/components/signoff/SignoffPanel.vue` | 修：F2 |

---

### Task 1: 全域 CSS 預設層（手機標籤對齊＋桌機 label-top）

**Files:**
- Modify: `src/assets/main.css`（`@media (--to-sm)` 區塊內 `.el-dialog .el-form-item__label` 規則約第 337–342 行；新增區塊放在 `/* Dialog - responsive on mobile */` 之前）
- Test: `tests/unit/assets/mainCssFormDefaults.test.ts`

**Interfaces:**
- Produces: opt-out class 名稱 `form-labels-inline`（加在 `<el-form class="form-labels-inline">` 上），Task 6 文件與 Task 5 元件註解引用。

- [ ] **Step 1: 寫失敗的 CSS 契約測試**

建立 `tests/unit/assets/mainCssFormDefaults.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// main.css 的 dialog 表單預設層（spec 2026-09-06 §3.1）契約：
// 1) 手機斷點的標籤必須左對齊（EP label-right 是 inline-flex justify-content:flex-end，
//    只寫 text-align 蓋不掉）；2) 桌機 dialog 內表單預設堆疊標籤，且提供 opt-out class。
const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

function block(startMarker: string): string {
  const i = css.indexOf(startMarker)
  expect(i, `找不到區塊起點 ${startMarker}`).toBeGreaterThan(-1)
  return css.slice(i, i + 2500)
}

describe('main.css dialog 表單預設層', () => {
  it('手機斷點：dialog 內標籤規則含 justify-content: flex-start', () => {
    const mobile = block('/* Dialog - responsive on mobile */')
    const labelRule = mobile.slice(mobile.indexOf('.el-dialog .el-form-item__label'))
    expect(labelRule.slice(0, 600)).toMatch(/justify-content:\s*flex-start/)
  })

  it('桌機：dialog 內非 inline 表單預設堆疊標籤，並排除 .form-labels-inline', () => {
    const desk = block('/* ========== Dialog 表單預設層')
    expect(desk).toMatch(/\.el-dialog \.el-form:not\(\.el-form--inline\):not\(\.form-labels-inline\)/)
    expect(desk).toMatch(/\.el-form-item__label\s*\{[^}]*width:\s*auto\s*!important/)
    expect(desk).toMatch(/\.el-form-item__content\s*\{[^}]*margin-left:\s*0\s*!important/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/assets/mainCssFormDefaults.test.ts`
Expected: FAIL（找不到 `justify-content: flex-start` 與新區塊）

- [ ] **Step 3: 修手機標籤對齊（一行）**

在 `src/assets/main.css` 的 `@media (--to-sm)` 內，把

```css
  .el-dialog .el-form--label-top .el-form-item__label,
  .el-dialog .el-form-item__label {
    width: auto !important;
    text-align: left;
    padding-bottom: 4px;
  }
```

改成

```css
  .el-dialog .el-form--label-top .el-form-item__label,
  .el-dialog .el-form-item__label {
    width: auto !important;
    text-align: left;
    /* EP label-right 的 label 是 inline-flex + justify-content:flex-end；
       只改 text-align 蓋不掉，標籤會靠右浮在輸入框上方（2026-09-05 staging 實測 8/15 表單中招）。 */
    justify-content: flex-start;
    padding-bottom: 4px;
  }
```

- [ ] **Step 4: 新增桌機 label-top 預設層**

在 `/* Dialog - responsive on mobile */` 那行**之前**插入：

```css
/* ========== Dialog 表單預設層（2026-09-06，spec 2026-09-06-admin-form-dialog-defaults）==========
 * DESIGN.md 規定表單型 dialog 用 label-position="top"，但 84 個 dialog 表單中只有 12 檔設定。
 * 這裡以 CSS 模擬 EP label-top，讓其餘檔案零改動拿到堆疊標籤；
 * 已明確設 label-position="top" 的表單走 EP 自己的規則，結果同構。
 * opt-out：<el-form class="form-labels-inline"> 保留左右排（刻意緊湊的短表單）；inline 表單自動排除。
 * !important 是必要的：EP 把 label-width 寫成 label 的 inline style width，
 * 無 label 的 item 則在 content 上寫 inline margin-left（手機斷點既有規則同一手法）。 */
.el-dialog .el-form:not(.el-form--inline):not(.form-labels-inline) .el-form-item {
  display: block;
}
.el-dialog .el-form:not(.el-form--inline):not(.form-labels-inline) .el-form-item__label {
  display: inline-block;
  width: auto !important;
  height: auto;
  line-height: 22px;
  padding: 0;
  margin-bottom: 8px;
  justify-content: flex-start;
  text-align: left;
}
.el-dialog .el-form:not(.el-form--inline):not(.form-labels-inline) .el-form-item__content {
  margin-left: 0 !important;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/assets/mainCssFormDefaults.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 6: stylelint 與 token 棘輪**

Run: `npx stylelint src/assets/main.css && npm run lint:tokens`
Expected: 皆 exit 0（本段沒有新增顏色）

- [ ] **Step 7: Commit**

```bash
git add src/assets/main.css tests/unit/assets/mainCssFormDefaults.test.ts
git commit -m "fix(admin): dialog 表單預設層——手機標籤左對齊、桌機預設堆疊標籤（含 opt-out）" -m "手機 --to-sm 規則只寫 text-align，EP label-right 的 justify-content:flex-end 沒被蓋掉，
標籤靠右浮在輸入框上方（staging 實測 15 張表單 8 張中招）。同時以 CSS 模擬 label-top
讓 84 個 dialog 表單零改動拿到堆疊標籤；.form-labels-inline 可 opt-out。
spec：docs/superpowers/specs/2026-09-06-admin-form-dialog-defaults-design.md §3.1" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- src/assets/main.css tests/unit/assets/mainCssFormDefaults.test.ts
```

---

### Task 2: 棘輪守衛 `check-form-dialogs.mjs`＋CI 接線

**Files:**
- Create: `scripts/check-form-dialogs.mjs`
- Test: `tests/unit/ci/checkFormDialogs.test.ts`
- Modify: `package.json`（scripts 區塊，`"check:a11y"` 之後加一行）、`.github/workflows/ci.yml`（`check:error-detail` step 之後）

**Interfaces:**
- Produces: CLI `node scripts/check-form-dialogs.mjs [--list] [--root <dir>]`；輸出一行 `A=<n> B=<n> C=<n> D=<n>`；exit 0 = 符合 baseline，1 = 超標或 baseline 未調降。Task 9 會調降 `BASELINE`。

- [ ] **Step 1: 寫失敗的 fixture 測試**

建立 `tests/unit/ci/checkFormDialogs.test.ts`：

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(process.cwd(), 'scripts/check-form-dialogs.mjs')
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ivy-form-dialogs-'))
  dirs.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  return root
}

function run(root: string): string {
  return execFileSync(process.execPath, [script, '--list', '--root', root], { encoding: 'utf8', stdio: 'pipe' })
}

describe('check-form-dialogs 四指標偵測', () => {
  it('A：含 el-dialog＋el-form 但無 FormDialog 的檔案計 1；用了 FormDialog 不計', () => {
    const root = fixture({
      'src/views/RawView.vue': '<el-dialog v-model="v" width="480px"><el-form label-width="90px"><el-form-item /></el-form></el-dialog>',
      'src/views/GoodView.vue': '<FormDialog v-model="v"><el-form label-position="top"><el-form-item /></el-form></FormDialog>',
      'src/views/ConfirmOnly.vue': '<el-dialog v-model="v" width="420px">確定嗎？</el-dialog>',
    })
    const out = run(root)
    expect(out).toMatch(/A=1\b/)
    expect(out).toContain('src/views/RawView.vue')
    expect(out).not.toContain('GoodView.vue')
  })

  it('B／C：dialog 檔內 label-width 與硬寫 px 寬度逐次計數（純確認框不計 B）', () => {
    const root = fixture({
      'src/views/RawView.vue': '<el-dialog v-model="v" width="480px"><el-form label-width="90px"><el-form-item /></el-form></el-dialog><el-dialog width="360px"><el-form label-width="80px" /></el-dialog>',
    })
    const out = run(root)
    expect(out).toMatch(/B=2\b/)
    expect(out).toMatch(/C=2\b/)
  })

  it('D：新增主鈕 type=success 與文字「＋」各計一次', () => {
    const root = fixture({
      'src/views/Btn.vue': '<el-button type="success" @click="open">新增申領</el-button><el-button type="primary">＋ 新增事件</el-button><el-button type="success" size="small">核准</el-button>',
    })
    expect(run(root)).toMatch(/D=2\b/)
  })

  it('排除 portal／parent／__tests__ 路徑', () => {
    const root = fixture({
      'src/views/portal/P.vue': '<el-dialog><el-form /></el-dialog>',
      'src/parent/X.vue': '<el-dialog><el-form /></el-dialog>',
      'src/views/__tests__/T.vue': '<el-dialog><el-form /></el-dialog>',
    })
    expect(run(root)).toMatch(/A=0\b/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/ci/checkFormDialogs.test.ts`
Expected: FAIL（腳本不存在，`execFileSync` 拋錯）

- [ ] **Step 3: 寫腳本**

建立 `scripts/check-form-dialogs.mjs`：

```js
#!/usr/bin/env node
/**
 * 後台表單 dialog 棘輪（只准降、不准升）。spec：docs/superpowers/specs/2026-09-06-admin-form-dialog-defaults-design.md §3.4
 *
 * 為什麼要擋：三波表單規範（FormSection／dialog 殼層／compact-standard-wide 分型）都寫進
 * DESIGN.md，但 84 個 dialog 表單裡 label-top 12、寬度常數 0、未儲存保護 6。根因是每個新
 * dialog 都從 EP 裸預設起步，規範靠人記。本腳本把四個數字鎖進版控，新表單請用
 * `src/components/common/FormDialog.vue`。
 *
 * 指標：
 *   A 裸 dialog 表單：檔案含 <el-dialog 且含 <el-form（非 el-form-item）且不含 <FormDialog（檔數）
 *   B label-width：含 <el-dialog 的檔案內 `label-width=` 出現次數（label-top 下是死屬性）
 *   C 硬寫寬度：<el-dialog … width="NNNpx"> 出現次數（應改 FORM_DIALOG_WIDTH／FormDialog size）
 *   D 按鈕誤用：新增／建立主鈕 type="success"，或按鈕文字以「＋」「+」開頭（次數）
 *
 * 用法：
 *   node scripts/check-form-dialogs.mjs            # 檢查（與 BASELINE 比）
 *   node scripts/check-form-dialogs.mjs --list     # 列出所有出現位置與四個數字
 *   node scripts/check-form-dialogs.mjs --root DIR # 掃指定根目錄（測試用）
 *
 * 退出碼：0=符合 baseline；1=任一指標超標，或低於 baseline 但未調降數字。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 修掉幾處後必須同步調降，否則棘輪鬆掉（同 check-error-detail-ratchet 慣例）。 */
const BASELINE = { A: 0, B: 0, C: 0, D: 0 } // Task 2 Step 6 會填入實際數字

/** 本來就該含 el-dialog 的檔案：FormDialog 殼本身。 */
const EXEMPT = new Set(['src/components/common/FormDialog.vue'])

const EXCLUDE_DIR = /(^|\/)(portal|parent|public|kiosk|__tests__|node_modules)(\/|$)/
const SCAN_DIRS = ['src/views', 'src/components']

const args = process.argv.slice(2)
const listMode = args.includes('--list')
const rootIdx = args.indexOf('--root')
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd()

const RE_DIALOG = /<el-dialog\b/
const RE_FORM = /<el-form(?![-\w])/
const RE_FORM_DIALOG = /<FormDialog\b/
const RE_LABEL_WIDTH = /\blabel-width=/g
const RE_PX_WIDTH = /<el-dialog\b[^>]*\swidth="\d+(?:px)?"/g
const RE_SUCCESS_CREATE = /<el-button\b[^>]*type="success"[^>]*>\s*(?:<[^>]+>\s*)*(?:新增|建立)/g
const RE_PLUS_TEXT = /<el-button\b[^>]*>\s*[＋+]\s*(?:新增|建立)/g

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(ROOT, full).replace(/\\/g, '/')
    if (EXCLUDE_DIR.test(rel)) continue
    if (statSync(full).isDirectory()) { walk(full, out); continue }
    if (entry.endsWith('.vue')) out.push({ full, rel })
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
const hits = { A: [], B: [], C: [], D: [] }

for (const { full, rel } of files) {
  if (EXEMPT.has(rel)) continue
  const src = readFileSync(full, 'utf8')
  const hasDialog = RE_DIALOG.test(src)
  if (hasDialog) {
    if (RE_FORM.test(src) && !RE_FORM_DIALOG.test(src)) hits.A.push(rel)
    for (const m of src.matchAll(RE_LABEL_WIDTH)) hits.B.push(`${rel}:${lineOf(src, m.index)}`)
    for (const m of src.matchAll(RE_PX_WIDTH)) hits.C.push(`${rel}:${lineOf(src, m.index)}`)
  }
  for (const m of src.matchAll(RE_SUCCESS_CREATE)) hits.D.push(`${rel}:${lineOf(src, m.index)}`)
  for (const m of src.matchAll(RE_PLUS_TEXT)) hits.D.push(`${rel}:${lineOf(src, m.index)}`)
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length
}

const counts = { A: hits.A.length, B: hits.B.length, C: hits.C.length, D: hits.D.length }
const summary = `A=${counts.A} B=${counts.B} C=${counts.C} D=${counts.D}`

if (listMode) {
  for (const key of ['A', 'B', 'C', 'D']) {
    console.log(`\n[${key}] ${counts[key]} 處`)
    for (const h of hits[key]) console.log(`  ${h}`)
  }
  console.log(`\n${summary}`)
  process.exit(0)
}

const over = Object.keys(counts).filter((k) => counts[k] > BASELINE[k])
if (over.length) {
  console.error(
    `✗ 表單 dialog 棘輪超標：${summary}（baseline A=${BASELINE.A} B=${BASELINE.B} C=${BASELINE.C} D=${BASELINE.D}）\n` +
      `  超標指標：${over.join(', ')}\n\n` +
      `新的表單 dialog 請用 <FormDialog size="compact|standardNarrow|standard|wide">（src/components/common/FormDialog.vue），\n` +
      `el-form 用 label-position="top"、不寫 label-width；新增主鈕用 type="primary" + :icon="Plus"。\n` +
      `跑 \`node scripts/check-form-dialogs.mjs --list\` 看完整清單。`
  )
  process.exit(1)
}

const under = Object.keys(counts).filter((k) => counts[k] < BASELINE[k])
if (under.length) {
  console.error(
    `✗ 存量已降（${summary}）但 baseline 仍是 A=${BASELINE.A} B=${BASELINE.B} C=${BASELINE.C} D=${BASELINE.D}。\n` +
      `請把 scripts/check-form-dialogs.mjs 的 BASELINE 改成現值，把成果鎖進版控。`
  )
  process.exit(1)
}

console.log(`✓ 表單 dialog 棘輪維持 ${summary}`)
```

- [ ] **Step 4: 跑 fixture 測試確認通過**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/ci/checkFormDialogs.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 對真實 repo 跑 `--list`，記下四個數字**

Run: `node scripts/check-form-dialogs.mjs --list | tail -1`
Expected: 類似 `A=84 B=1xx C=1xx D=6`（實際數字以輸出為準；A 應接近 84，D 應為 6：SubsidiesView／LeaveView／OvertimeView／ActivityRegistrationView 的 success 新增鈕 4 處＋StudentIncidentView／StudentAssessmentView 的「＋」2 處；IepView／YearEndRulesPanel 的「+ 新增目標／成員／班別」是 plain 小鈕也會被計入，屬既有存量）

- [ ] **Step 6: 把數字填進 BASELINE**

把腳本裡 `const BASELINE = { A: 0, B: 0, C: 0, D: 0 }` 改成 Step 5 的實際數字（保留註解改成「2026-09-06 基線」）。

Run: `node scripts/check-form-dialogs.mjs`
Expected: `✓ 表單 dialog 棘輪維持 A=… B=… C=… D=…`，exit 0

- [ ] **Step 7: 接線 package.json 與 CI**

`package.json` scripts 區塊，在 `"check:a11y": "node scripts/check-a11y-clickable.mjs"` 之後加：

```json
        "check:form-dialogs": "node scripts/check-form-dialogs.mjs"
```

（注意前一行結尾要補逗號。）

`.github/workflows/ci.yml` 在

```yaml
      - name: 錯誤處理棘輪（直讀 response.data.detail 只准降不准升）
        run: npm run check:error-detail
```

之後插入：

```yaml
      # 表單 dialog 棘輪：裸 el-dialog 表單／label-width／硬寫 px 寬度／新增鈕誤用 success 或「＋」
      # 只准降不准升；新表單一律 FormDialog（spec 2026-09-06-admin-form-dialog-defaults）。
      - name: 表單 dialog 棘輪（FormDialog 採用、label-width、px 寬度、按鈕誤用）
        run: npm run check:form-dialogs
```

Run: `npm run check:form-dialogs && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log('package.json ok')"`
Expected: 皆成功

- [ ] **Step 8: Commit**

```bash
git add scripts/check-form-dialogs.mjs tests/unit/ci/checkFormDialogs.test.ts package.json .github/workflows/ci.yml
git commit -m "ci(admin): 表單 dialog 四指標棘輪（FormDialog 採用／label-width／px 寬度／按鈕誤用）" -m "比照 check-error-detail-ratchet：四個數字只准降不准升，低於 baseline 未調降也紅。
基線以 origin/staging 現況寫死；Task 7／8 遷移旗艦後於 Task 9 調降。
spec §3.4" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- scripts/check-form-dialogs.mjs tests/unit/ci/checkFormDialogs.test.ts package.json .github/workflows/ci.yml
```

---

### Task 3: `useFormDirty` 通用 dirty 快照

**Files:**
- Create: `src/composables/useFormDirty.ts`
- Test: `tests/unit/composables/useFormDirty.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function useFormDirty<T extends object>(
    state: MaybeRefOrGetter<T>,
    opts?: { exclude?: string[] },
  ): { isDirty: ComputedRef<boolean>; snapshot: () => void }
  ```
  `snapshot()` 於開啟 dialog、載入初值後呼叫；`isDirty` 為 JSON 比對 computed。Task 5 的 `dirty` prop 與 Task 7 使用。

- [ ] **Step 1: 寫失敗測試**

建立 `tests/unit/composables/useFormDirty.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { useFormDirty } from '@/composables/useFormDirty'

describe('useFormDirty', () => {
  it('snapshot 前為 clean；改值後 dirty；再 snapshot 回 clean', () => {
    const form = reactive({ name: '', price: 0 })
    const { isDirty, snapshot } = useFormDirty(form)
    expect(isDirty.value).toBe(false)
    form.name = '美語'
    expect(isDirty.value).toBe(true)
    snapshot()
    expect(isDirty.value).toBe(false)
  })

  it('exclude 的欄位變動不計 dirty', () => {
    const form = reactive({ name: '', updated_at: 't1' })
    const { isDirty } = useFormDirty(form, { exclude: ['updated_at'] })
    form.updated_at = 't2'
    expect(isDirty.value).toBe(false)
  })

  it('接受 ref 整包重指派（openEdit 慣例：form.value = {...}）', () => {
    const form = ref({ name: 'a' })
    const { isDirty, snapshot } = useFormDirty(form)
    form.value = { name: 'b' }
    snapshot()
    expect(isDirty.value).toBe(false)
    form.value.name = 'c'
    expect(isDirty.value).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/composables/useFormDirty.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作**

建立 `src/composables/useFormDirty.ts`：

```ts
import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

/**
 * 通用表單 dirty 快照（spec 2026-09-06 §3.2）。
 *
 * - `snapshot()`：於 dialog 開啟／載入初值後呼叫，拍下目前值。
 * - `isDirty`：目前值與快照的 JSON 比對；透過 `toValue` 支援 reactive 物件、ref 或 getter，
 *   所以 `form.value = {...}` 整包重指派（openEdit 慣例）也能追蹤。
 * - 與 `useFormDraft` 不同：這裡只判斷，不持久化；與 `useEmployeeFormDirty` 不同：不分欄位群、不回傳 diff。
 *
 * 首次呼叫即拍一次快照，讓「開啟後沒動」為 clean。
 */
export function useFormDirty<T extends object>(
  state: MaybeRefOrGetter<T>,
  opts: { exclude?: string[] } = {},
): { isDirty: ComputedRef<boolean>; snapshot: () => void } {
  const exclude = new Set(opts.exclude ?? [])

  const serialize = (): string => {
    const src = toValue(state) as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      if (!exclude.has(k)) picked[k] = v
    }
    return JSON.stringify(picked)
  }

  const baseline = ref(serialize())
  const snapshot = (): void => { baseline.value = serialize() }
  const isDirty = computed(() => serialize() !== baseline.value)

  return { isDirty, snapshot }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/composables/useFormDirty.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add src/composables/useFormDirty.ts tests/unit/composables/useFormDirty.test.ts
git commit -m "feat(common): useFormDirty 通用表單 dirty 快照" -m "供 FormDialog 的 dirty prop 與遷移表單使用；不持久化、不分欄位群。spec §3.2" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- src/composables/useFormDirty.ts tests/unit/composables/useFormDirty.test.ts
```

---

### Task 4: 驗證 helper `validators/rules.ts`

**Files:**
- Create: `src/validators/rules.ts`
- Test: `tests/unit/validators/rules.test.ts`

**Interfaces:**
- Produces（皆回傳 Element Plus `FormItemRule`）：
  ```ts
  required(label: string, opts?: { kind?: 'input' | 'select'; trigger?: 'blur' | 'change' }): FormItemRule
  phone(label?: string): FormItemRule              // 手機 09xxxxxxxx，沿用 utils/phone.ts 的 TW_MOBILE_RE
  email(): FormItemRule
  idNumber(): FormItemRule                         // 身分證／居留證
  money(opts?: { min?: number }): FormItemRule
  ```
  Task 7 使用 `required`、`money`。

- [ ] **Step 1: 寫失敗測試**

建立 `tests/unit/validators/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { FormItemRule } from 'element-plus'
import { email, idNumber, money, phone, required } from '@/validators/rules'

type Validator = (rule: unknown, value: unknown, cb: (err?: Error) => void) => void
function runValidator(rule: FormItemRule, value: unknown): string | null {
  let out: string | null = null
  ;(rule.validator as Validator)(rule, value, (err) => { out = err ? err.message : null })
  return out
}

describe('validators/rules 文案與規則', () => {
  it('required：輸入類「請輸入{label}」、選擇類「請選擇{label}」', () => {
    expect(required('課程名稱')).toMatchObject({ required: true, message: '請輸入課程名稱', trigger: 'blur' })
    expect(required('年級', { kind: 'select' })).toMatchObject({ required: true, message: '請選擇年級', trigger: 'change' })
  })

  it('phone：空值放行、09 開頭十碼通過、其他拒絕', () => {
    const r = phone()
    expect(runValidator(r, '')).toBeNull()
    expect(runValidator(r, '0912345678')).toBeNull()
    expect(runValidator(r, '02-12345678')).toBe('手機格式應為 09 開頭共 10 碼')
  })

  it('email：格式錯誤拒絕', () => {
    expect(runValidator(email(), 'a@b.c')).toBeNull()
    expect(runValidator(email(), 'nope')).toBe('Email 格式不正確')
  })

  it('idNumber：身分證與居留證通過、亂碼拒絕', () => {
    expect(runValidator(idNumber(), 'A123456789')).toBeNull()
    expect(runValidator(idNumber(), 'AB12345678')).toBeNull()
    expect(runValidator(idNumber(), '1234')).toBe('身分證／居留證字號格式不正確')
  })

  it('money：低於 min 拒絕、null 放行（必填交給 required）', () => {
    const r = money({ min: 0 })
    expect(runValidator(r, null)).toBeNull()
    expect(runValidator(r, 100)).toBeNull()
    expect(runValidator(r, -1)).toBe('請輸入 0 以上的金額')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/validators/rules.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作**

建立 `src/validators/rules.ts`：

```ts
import type { FormItemRule } from 'element-plus'
import { TW_MOBILE_RE } from '@/utils/phone'

/**
 * Element Plus FormItemRule 產生器（spec 2026-09-06 §3.3）。
 * 統一必填文案：輸入類「請輸入{label}」、選擇類「請選擇{label}」；
 * 格式類規則對空值放行（必填與否交給 required），避免選填欄位被格式規則卡住。
 */

type Callback = (error?: Error) => void

export function required(
  label: string,
  opts: { kind?: 'input' | 'select'; trigger?: 'blur' | 'change' } = {},
): FormItemRule {
  const kind = opts.kind ?? 'input'
  return {
    required: true,
    message: kind === 'select' ? `請選擇${label}` : `請輸入${label}`,
    trigger: opts.trigger ?? (kind === 'select' ? 'change' : 'blur'),
  }
}

export function phone(label = '手機'): FormItemRule {
  return {
    trigger: 'blur',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      if (TW_MOBILE_RE.test(String(value).replace(/[\s-]/g, ''))) return cb()
      cb(new Error(`${label}格式應為 09 開頭共 10 碼`))
    },
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function email(): FormItemRule {
  return {
    trigger: 'blur',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      EMAIL_RE.test(String(value)) ? cb() : cb(new Error('Email 格式不正確'))
    },
  }
}

/** 身分證（1 字母＋9 數字）或新式居留證（2 字母＋8 數字）；只驗格式，不驗檢查碼。 */
const ID_NUMBER_RE = /^[A-Z](?:\d{9}|[A-Z]\d{8})$/
export function idNumber(): FormItemRule {
  return {
    trigger: 'blur',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      ID_NUMBER_RE.test(String(value).toUpperCase()) ? cb() : cb(new Error('身分證／居留證字號格式不正確'))
    },
  }
}

export function money(opts: { min?: number } = {}): FormItemRule {
  const min = opts.min ?? 0
  return {
    trigger: 'change',
    validator: (_rule: unknown, value: unknown, cb: Callback) => {
      if (value == null || value === '') return cb()
      const n = Number(value)
      if (Number.isFinite(n) && n >= min) return cb()
      cb(new Error(`請輸入 ${min} 以上的金額`))
    },
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/unit/validators/rules.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/validators/rules.ts tests/unit/validators/rules.test.ts
git commit -m "feat(validators): EP rule 產生器與統一必填文案（required／phone／email／idNumber／money）" -m "現況四種必填文案（請輸入／請選擇／必填／不可為空）由遷移時順手替換；格式類規則對空值放行。spec §3.3" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- src/validators/rules.ts tests/unit/validators/rules.test.ts
```

---

### Task 5: `FormDialog.vue` 薄封裝殼

**Files:**
- Create: `src/components/common/FormDialog.vue`
- Test: `tests/components/FormDialog.test.ts`
- Modify: `components.d.ts`（在 `FormSection:` 那行之前加一行）

**Interfaces:**
- Consumes: `FORM_DIALOG_WIDTH`／`FormDialogSize`（`src/constants/formDialog.ts`）、`confirmDiscardChanges()`（`src/composables/useUnsavedChangesGuard.ts`，回傳 `Promise<boolean>`）、`useIsMobile()`（`src/composables/useIsMobile.ts`）。
- Produces（Task 7／8 使用）：
  - Props：`modelValue: boolean`、`title: string`、`size?: FormDialogSize = 'compact'`、`dirty?: boolean | (() => boolean) = false`、`loading?: boolean`、`disabled?: boolean`、`submitText?: string = '儲存'`、`cancelText?: string = '取消'`、`enterSubmit?: boolean = true`、`autofocus?: boolean = true`、`fullscreenOnMobile?: boolean`（預設 `size === 'wide'`）、`requiredLegend?: string | false = false`
  - Emits：`update:modelValue`、`submit`、`cancel`、`opened`、`closed`
  - Slots：`default`、`title-extra`、`footer-extra`、`footer`
  - Expose：`requestClose(): Promise<void>`、`scrollToFirstError(): boolean`
  - 根元素 class：`ivy-form-dialog ivy-form-dialog--{size}`；body 容器 `data-test="form-dialog-body"`；footer 主鈕 `data-test="form-dialog-submit"`、取消鈕 `data-test="form-dialog-cancel"`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/components/FormDialog.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import ElementPlus from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'

const confirmDiscardChanges = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ confirmDiscardChanges }))

// el-dialog 會 teleport 到 body；stub 成就地渲染並保留我們要驗的 props／事件。
const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'fullscreen', 'destroyOnClose', 'closeOnClickModal', 'beforeClose'],
  emits: ['update:modelValue', 'opened', 'closed'],
  setup(props, { slots, emit }) {
    return () => h('div', { class: 'el-dialog-stub', 'data-width': props.width }, [
      h('div', { class: 'stub-header' }, slots.header?.({}) ?? props.title),
      h('div', { class: 'stub-body' }, slots.default?.()),
      h('div', { class: 'stub-footer' }, slots.footer?.()),
      h('button', { class: 'stub-x', onClick: () => props.beforeClose?.(() => emit('update:modelValue', false)) }, 'x'),
    ])
  },
})

function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(FormDialog, {
    attachTo: document.body,
    props: { modelValue: true, title: '新增課程', ...props },
    slots: { default: '<input class="first" /><textarea class="ta"></textarea>', ...slots },
    global: { plugins: [ElementPlus], stubs: { 'el-dialog': ElDialogStub } },
  })
}

describe('FormDialog', () => {
  it('依 size 套 FORM_DIALOG_WIDTH 與 class，預設 compact', () => {
    const w = mountDialog()
    expect(w.find('.el-dialog-stub').attributes('data-width')).toBe('520px')
    expect(w.classes()).toContain('ivy-form-dialog--compact')
    const wide = mountDialog({ size: 'wide' })
    expect(wide.find('.el-dialog-stub').attributes('data-width')).toBe('min(1040px, 94vw)')
  })

  it('footer 預設「取消／儲存」，submitText 可改，主鈕 loading 時 disabled', async () => {
    const w = mountDialog({ submitText: '建立課程', loading: true })
    expect(w.find('[data-test="form-dialog-cancel"]').text()).toBe('取消')
    const submit = w.find('[data-test="form-dialog-submit"]')
    expect(submit.text()).toBe('建立課程')
    expect(submit.attributes('disabled')).toBeDefined()
  })

  it('點主鈕 emit submit；點取消在 clean 時直接關閉並 emit cancel', async () => {
    const w = mountDialog()
    await w.find('[data-test="form-dialog-submit"]').trigger('click')
    expect(w.emitted('submit')).toHaveLength(1)
    await w.find('[data-test="form-dialog-cancel"]').trigger('click')
    await nextTick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
  })

  it('dirty 時關閉（X／before-close）先問 confirmDiscardChanges；拒絕則不關', async () => {
    confirmDiscardChanges.mockResolvedValueOnce(false)
    const w = mountDialog({ dirty: true })
    await w.find('.stub-x').trigger('click')
    await nextTick(); await nextTick()
    expect(confirmDiscardChanges).toHaveBeenCalledTimes(1)
    expect(w.emitted('update:modelValue')).toBeUndefined()
    confirmDiscardChanges.mockResolvedValueOnce(true)
    await w.find('.stub-x').trigger('click')
    await nextTick(); await nextTick()
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('dirty 可為 getter，每次關閉重新求值', async () => {
    let dirty = false
    confirmDiscardChanges.mockResolvedValue(true)
    const w = mountDialog({ dirty: () => dirty })
    await w.find('.stub-x').trigger('click'); await nextTick()
    expect(confirmDiscardChanges).not.toHaveBeenCalled()
    dirty = true
    await w.find('.stub-x').trigger('click'); await nextTick(); await nextTick()
    expect(confirmDiscardChanges).toHaveBeenCalledTimes(1)
  })

  it('Enter：在 input 上 emit submit；在 textarea、isComposing、loading 時不 emit', async () => {
    const w = mountDialog()
    const input = w.find('input.first')
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toHaveLength(1)
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))
    expect(w.emitted('submit')).toHaveLength(1)
    w.find('textarea.ta').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toHaveLength(1)
    await w.setProps({ loading: true })
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toHaveLength(1)
  })

  it('enterSubmit=false 時 Enter 不 emit', () => {
    const w = mountDialog({ enterSubmit: false })
    w.find('input.first').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('opened 後聚焦第一個可輸入欄，並轉發 opened 事件', async () => {
    const w = mountDialog()
    w.findComponent(ElDialogStub).vm.$emit('opened')
    await nextTick(); await nextTick()
    expect(document.activeElement).toBe(w.find('input.first').element)
    expect(w.emitted('opened')).toHaveLength(1)
  })

  it('scrollToFirstError 捲到第一個 is-error 欄並聚焦其 input；沒有錯誤回 false', async () => {
    const w = mountDialog({}, {
      default: '<div class="el-form-item"><input class="ok" /></div><div class="el-form-item is-error"><input class="bad" /></div>',
    })
    const bad = w.find('input.bad').element as HTMLInputElement
    const scrolled = vi.fn()
    ;(bad.closest('.el-form-item') as HTMLElement).scrollIntoView = scrolled
    const vm = w.vm as unknown as { scrollToFirstError: () => boolean }
    expect(vm.scrollToFirstError()).toBe(true)
    expect(scrolled).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(document.activeElement).toBe(bad)
    const clean = mountDialog()
    expect((clean.vm as unknown as { scrollToFirstError: () => boolean }).scrollToFirstError()).toBe(false)
  })

  it('footer-extra 插在主鈕左側；footer slot 整個取代；requiredLegend 為字串時渲染', () => {
    const w = mountDialog({ requiredLegend: '* 為必填' }, { 'footer-extra': '<button class="extra">儲存並新增下一筆</button>' })
    const footer = w.find('.stub-footer')
    expect(footer.find('.extra').exists()).toBe(true)
    expect(footer.html().indexOf('extra')).toBeLessThan(footer.html().indexOf('form-dialog-submit'))
    expect(w.find('.required-legend').text()).toBe('* 為必填')
    const replaced = mountDialog({}, { footer: '<span class="mine">自訂</span>' })
    expect(replaced.find('[data-test="form-dialog-submit"]').exists()).toBe(false)
    expect(replaced.find('.mine').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/components/FormDialog.test.ts`
Expected: FAIL（元件不存在）

- [ ] **Step 3: 實作元件**

建立 `src/components/common/FormDialog.vue`：

```vue
<!-- src/components/common/FormDialog.vue
     表單型 dialog 標準殼（spec 2026-09-06-admin-form-dialog-defaults §3.2）。
     只管殼層行為：尺寸 token、footer 樣板、關閉保護、開啟聚焦、Enter 送出、錯誤捲動。
     **不擁有 el-form**：表單 ref／rules／送出 API 全留在使用端，避免大遷移耦合。
     與 EP 預設不同的預設值：destroy-on-close=true、close-on-click-modal=false。
     label 位置由 main.css 全域預設層（dialog 內表單堆疊標籤）處理，使用端仍建議明寫
     label-position="top"；刻意要左右排的短表單在 el-form 加 class="form-labels-inline"。 -->
<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import { FORM_DIALOG_WIDTH, type FormDialogSize } from '@/constants/formDialog'
import { confirmDiscardChanges } from '@/composables/useUnsavedChangesGuard'
import { useIsMobile } from '@/composables/useIsMobile'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  size?: FormDialogSize
  /** 為 true（或 getter 回 true）時，關閉前經 confirmDiscardChanges() 確認 */
  dirty?: boolean | (() => boolean)
  loading?: boolean
  disabled?: boolean
  submitText?: string
  cancelText?: string
  /** 單行輸入框按 Enter 送出（textarea、picker 內、IME 選字中不觸發） */
  enterSubmit?: boolean
  /** 開啟後聚焦第一個可輸入欄 */
  autofocus?: boolean
  /** 手機滿版；未指定時 wide 分型預設滿版 */
  fullscreenOnMobile?: boolean
  /** 字串時於 body 頂端顯示必填圖例（沿用 DESIGN.md 的 .required-legend） */
  requiredLegend?: string | false
}>(), {
  size: 'compact',
  dirty: false,
  loading: false,
  disabled: false,
  submitText: '儲存',
  cancelText: '取消',
  enterSubmit: true,
  autofocus: true,
  fullscreenOnMobile: undefined,
  requiredLegend: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
  cancel: []
  opened: []
  closed: []
}>()

const attrs = useAttrs()
const { isMobile } = useIsMobile()
const bodyRef = ref<HTMLElement | null>(null)

const width = computed(() => FORM_DIALOG_WIDTH[props.size])
const fullscreen = computed(() => isMobile.value && (props.fullscreenOnMobile ?? props.size === 'wide'))
// 透傳給 el-dialog 的其餘屬性；使用端可覆寫 destroy-on-close / close-on-click-modal 等預設
const dialogAttrs = computed(() => ({
  destroyOnClose: true,
  closeOnClickModal: false,
  ...attrs,
}))

const isDirty = (): boolean => (typeof props.dirty === 'function' ? props.dirty() : props.dirty)

/** el-dialog before-close：X／Esc／遮罩三條路徑 */
async function handleBeforeClose(done: () => void): Promise<void> {
  if (!isDirty() || (await confirmDiscardChanges())) done()
}

/** footer 取消鈕與使用端自訂 footer 共用：dirty 檢查後關閉 */
async function requestClose(): Promise<void> {
  if (isDirty() && !(await confirmDiscardChanges())) return
  emit('cancel')
  emit('update:modelValue', false)
}

function handleSubmit(): void {
  if (props.loading || props.disabled) return
  emit('submit')
}

const PICKER_WRAPPER = '.el-select, .el-date-editor, .el-time-picker, .el-cascader, .el-autocomplete'

function onBodyKeydown(event: KeyboardEvent): void {
  if (!props.enterSubmit || event.key !== 'Enter' || event.isComposing) return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (!target || target.tagName !== 'INPUT') return
  if (target.closest(PICKER_WRAPPER)) return
  event.preventDefault()
  handleSubmit()
}

const FOCUSABLE = 'input:not([readonly]):not([disabled]):not([type="hidden"]), textarea:not([readonly]):not([disabled])'

function focusFirstField(): void {
  const body = bodyRef.value
  if (!body) return
  const candidates = Array.from(body.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !el.closest(PICKER_WRAPPER))
  ;(candidates[0] ?? body).focus()
}

function onOpened(): void {
  if (props.autofocus) focusFirstField()
  emit('opened')
}

/** 使用端在 validate 失敗的 callback 呼叫；回傳是否找到錯誤欄 */
function scrollToFirstError(): boolean {
  const item = bodyRef.value?.querySelector<HTMLElement>('.el-form-item.is-error')
  if (!item) return false
  item.scrollIntoView({ block: 'center', behavior: 'smooth' })
  item.querySelector<HTMLElement>('input, textarea, [tabindex]')?.focus()
  return true
}

defineExpose({ requestClose, scrollToFirstError })
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="width"
    :fullscreen="fullscreen"
    :before-close="handleBeforeClose"
    :class="['ivy-form-dialog', `ivy-form-dialog--${size}`]"
    v-bind="dialogAttrs"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @opened="onOpened"
    @closed="emit('closed')"
  >
    <template v-if="$slots['title-extra']" #header>
      <span class="el-dialog__title">{{ title }}</span>
      <slot name="title-extra" />
    </template>

    <div
      ref="bodyRef"
      class="ivy-form-dialog__body"
      data-test="form-dialog-body"
      tabindex="-1"
      @keydown="onBodyKeydown"
    >
      <p v-if="requiredLegend" class="required-legend">{{ requiredLegend }}</p>
      <slot />
    </div>

    <template #footer>
      <slot name="footer">
        <div class="ivy-form-dialog__footer">
          <el-button data-test="form-dialog-cancel" @click="requestClose">{{ cancelText }}</el-button>
          <slot name="footer-extra" />
          <el-button
            type="primary"
            :loading="loading"
            :disabled="loading || disabled"
            data-test="form-dialog-submit"
            @click="handleSubmit"
          >{{ submitText }}</el-button>
        </div>
      </slot>
    </template>
  </el-dialog>
</template>

<style scoped>
.ivy-form-dialog__body { outline: none; }
.ivy-form-dialog__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.required-legend {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/components/FormDialog.test.ts`
Expected: PASS（10 tests）。兩個 happy-dom 後備：① 若 `scrollToFirstError` 測試因無 `scrollIntoView` 報錯，測試已用 mock 覆蓋該元素的方法；若仍報錯，在元件內改成 `item.scrollIntoView?.({ … })` 並保留測試。② 若 happy-dom 的 `KeyboardEvent` 不接受 `isComposing` init，測試改成先 `const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })` 再 `Object.defineProperty(ev, 'isComposing', { value: true })`，元件邏輯不變。

- [ ] **Step 5: 補 `components.d.ts`**

在 `components.d.ts` 的 `FormSection: typeof import('./src/components/common/FormSection.vue')['default']` 那行**之前**加：

```ts
    FormDialog: typeof import('./src/components/common/FormDialog.vue')['default']
```

- [ ] **Step 6: typecheck 與 lint**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx vue-tsc --noEmit && npx eslint src/components/common/FormDialog.vue tests/components/FormDialog.test.ts`
Expected: 皆 exit 0

- [ ] **Step 7: Commit**

```bash
git add src/components/common/FormDialog.vue tests/components/FormDialog.test.ts components.d.ts
git commit -m "feat(common): FormDialog 表單型 dialog 標準殼（尺寸 token、關閉保護、聚焦、Enter 送出、錯誤捲動）" -m "不擁有 el-form；預設 destroy-on-close、不允許點遮罩關閉；dirty 走既有 confirmDiscardChanges。
spec §3.2" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- src/components/common/FormDialog.vue tests/components/FormDialog.test.ts components.d.ts
```

---

### Task 6: 文件——DESIGN.md 與還原分型盤點文件

**Files:**
- Modify: `DESIGN.md`（§元件詞彙，「表單型 dialog 的內容規範」段）
- Create: `docs/analysis/2026-08-18-admin-create-form-inventory.md`（自 commit `17215c3a` 還原）

- [ ] **Step 1: 還原盤點文件並加註**

```bash
mkdir -p docs/analysis
git show 17215c3a:docs/analysis/2026-08-18-admin-create-form-inventory.md > docs/analysis/2026-08-18-admin-create-form-inventory.md
```

在檔案最上方（`# Admin「新增／建立」入口與表單全站盤點` 之前）插入：

```markdown
> **歷史快照（2026-09-06 自 commit 17215c3a 還原）**：本檔是 2026-08-18 分型盤點的原文，
> 「處置」欄描述的全站遷移 commit 已於 2026-09-03 棄用（與 staging 衝突過多）。
> 現行做法為機會式遷移，優先序與守衛見
> `docs/superpowers/specs/2026-09-06-admin-form-dialog-defaults-design.md` §7；
> 2026-08-13 之後新增的 fees／bus／POS／enrollment 表單不在本表內。

```

Run: `head -8 docs/analysis/2026-08-18-admin-create-form-inventory.md && grep -c '^| ' docs/analysis/2026-08-18-admin-create-form-inventory.md`
Expected: 看到加註與原標題；表格列數 > 70

- [ ] **Step 2: 更新 DESIGN.md**

把 `DESIGN.md` 中這一行：

```markdown
表單型 dialog 的內容規範（範例實作：`src/components/recruitment/RecruitmentRecordDialog.vue`；分型盤點：`docs/analysis/2026-08-18-admin-create-form-inventory.md`）：
```

改成：

```markdown
**表單型 dialog 一律用 `FormDialog`**（`src/components/common/FormDialog.vue`，2026-09-06 起；spec `2026-09-06-admin-form-dialog-defaults-design.md`）：它只管殼層——`size="compact|standardNarrow|standard|wide"` 對應 `FORM_DIALOG_WIDTH`、footer「取消／{動詞}{型}」樣板、`dirty` 關閉保護（走 `confirmDiscardChanges`）、開啟聚焦第一欄、單行輸入 Enter 送出、`scrollToFirstError()`；`el-form`／`rules`／送出仍在使用端。預設 `destroy-on-close`、不允許點遮罩關閉。`main.css` 另有全域預設層：dialog 內非 inline 表單一律堆疊標籤，刻意左右排的短表單在 `el-form` 加 `class="form-labels-inline"`。四指標棘輪 `npm run check:form-dialogs`（裸 `el-dialog` 表單／`label-width`／硬寫 px 寬度／新增鈕誤用）在 CI blocking，只准降不准升。必填與格式規則用 `src/validators/rules.ts`（`required(label, { kind })` 統一「請輸入／請選擇」文案）。

表單型 dialog 的內容規範（範例實作：`src/components/recruitment/RecruitmentRecordDialog.vue`；FormDialog 旗艦：`src/views/activity/ActivityCourseView.vue` 課程對話框、`src/components/signoff/SignoffPanel.vue`；分型盤點歷史快照：`docs/analysis/2026-08-18-admin-create-form-inventory.md`）：
```

Run: `grep -n 'FormDialog' DESIGN.md | head -3`
Expected: 至少 2 行命中

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md docs/analysis/2026-08-18-admin-create-form-inventory.md
git commit -m "docs(design): FormDialog 為表單 dialog 標準殼；還原 2026-08-18 分型盤點文件為歷史快照" -m "DESIGN.md 原本指向不存在的盤點檔（只存在被棄用的 17215c3a）。spec §3.6" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- DESIGN.md docs/analysis/2026-08-18-admin-create-form-inventory.md
```

---

### Task 7: 旗艦 F1——課程新增／編輯改 FormDialog＋form-grid＋rules

**Files:**
- Modify: `src/views/activity/ActivityCourseView.vue`（template 第 190–304 行的課程 `el-dialog` 區塊；script：imports 第 586–612 行、state 第 718–745 行、`openCreate`/`openEdit` 第 1119–1146 行、`handleSave` 第 1158–1160 行）
- Test: `src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts`

**Interfaces:**
- Consumes：`FormDialog`（Task 5：props `size`／`dirty`／`loading`／`submitText`、emit `submit`、expose `scrollToFirstError()`）、`useFormDirty`（Task 3）、`required`／`money`（Task 4）、`FormSection`（既有）。
- 行為不變式：`payload` 組裝、`createCourse`／`updateCourse` 呼叫、學期帶入、DM 上傳只在編輯模式、`data-test="allowed-grades-group"`／`select-instructor-employee` 錨點、`isWeekdayScheduleIncomplete` alert、起訖時刻檢查全部保留。

- [ ] **Step 1: 寫失敗測試**

建立 `src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// F1 旗艦（spec 2026-09-06 §3.5）：課程對話框改 FormDialog standardNarrow、label-top、
// form-grid 語意配對，必填改 EP rules（不再只靠送出時 toast）。

const getCoursesMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  getCourses: getCoursesMock,
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  sweepExpiredWaitlist: vi.fn(),
  reorderCourses: vi.fn(),
  reorderCourseEnrolled: vi.fn(),
  getCoursePaymentSlipsPdf: vi.fn(),
}))
vi.mock('@/api/employees', () => ({ getEmployees: vi.fn().mockResolvedValue({ data: [] }) }))
vi.mock('@/stores/academicTerm', () => ({ useAcademicTermStore: () => ({ school_year: 114, semester: 1 }) }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import ActivityCourseView from '../ActivityCourseView.vue'

// el-dialog teleport → 就地渲染；重型元件 stub 掉，el-form/el-form-item 用真的以驗 is-required
const STUBS = {
  'el-dialog': { props: ['modelValue', 'width'], template: '<div class="el-dialog-stub" :data-width="width"><slot /><slot name="footer" /></div>' },
  'el-drawer': { template: '<div><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-select': true,
  'el-option': true,
  'el-time-picker': true,
  'el-date-picker': true,
  draggable: { template: '<div><slot /></div>' },
  AcademicTermSelector: { template: '<div />' },
  AdminListToolbar: { template: '<div><slot name="actions" /></div>' },
  AdminListCards: { template: '<div />' },
  CourseDmUploader: { template: '<div />' },
}

interface Vm { openCreate: () => void; openEdit: (row: Record<string, unknown>) => void; dialogVisible: boolean }

async function mountView() {
  getCoursesMock.mockResolvedValue({ data: [] })
  const wrapper = mount(ActivityCourseView, { global: { plugins: [ElementPlus], stubs: STUBS } })
  await flushPromises()
  return wrapper
}

describe('ActivityCourseView 課程對話框（FormDialog 旗艦）', () => {
  beforeEach(() => { getCoursesMock.mockReset() })

  it('新增：FormDialog standardNarrow、主鈕「建立課程」、label-top 表單', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const dialog = w.find('.ivy-form-dialog--standardNarrow')
    expect(dialog.exists()).toBe(true)
    expect(w.find('.el-dialog-stub').attributes('data-width')).toBe('760px')
    expect(w.find('[data-test="form-dialog-submit"]').text()).toBe('建立課程')
    expect(w.find('form.el-form').classes()).toContain('el-form--label-top')
    expect(w.find('form.el-form').classes()).toContain('form-grid')
  })

  it('必填：課程名稱與價格帶 is-required，其餘不帶', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const required = w.findAll('.el-form-item.is-required').map((i) => i.find('.el-form-item__label').text())
    expect(required).toEqual(['課程名稱', '價格（元）'])
  })

  it('編輯：主鈕「儲存」，欄位帶入 row 值', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openEdit({ id: 7, name: '美語', price: 3000, capacity: 20, allow_waitlist: true })
    await flushPromises()
    expect(w.find('[data-test="form-dialog-submit"]').text()).toBe('儲存')
    expect((w.find('[data-test="course-name-input"] input').element as HTMLInputElement).value).toBe('美語')
  })

  it('版面：名稱 fg-8＋價格 fg-4；說明、年級、影片 fg-12；上課時段在 FormSection 內', async () => {
    const w = await mountView()
    ;(w.vm as unknown as Vm).openCreate()
    await flushPromises()
    const cls = (testId: string) => w.find(`[data-test="${testId}"]`).classes()
    expect(cls('course-name-input')).toContain('fg-8')
    expect(cls('course-price-input')).toContain('fg-4')
    expect(cls('course-description-input')).toContain('fg-12')
    expect(w.find('[data-test="section-schedule"] .form-section__label').text()).toContain('上課時段')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `VITEST_MAX_FORKS=2 npx vitest run src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts`
Expected: FAIL（找不到 `.ivy-form-dialog--standardNarrow` 等）

- [ ] **Step 3: script 側改動**

在 `src/views/activity/ActivityCourseView.vue` 的 imports 區加入（放在 `import CourseDmUploader from './components/CourseDmUploader.vue'` 之後）：

```ts
import FormDialog from '@/components/common/FormDialog.vue'
import FormSection from '@/components/common/FormSection.vue'
import { useFormDirty } from '@/composables/useFormDirty'
import { required, money } from '@/validators/rules'
import type { FormInstance, FormRules } from 'element-plus'
```

在 `const form = ref<CourseForm>(defaultForm())` 之後加：

```ts
const courseFormRef = ref<FormInstance>()
const courseDialogRef = ref<InstanceType<typeof FormDialog>>()
// 開啟／載入初值後 snapshot()；關閉前 FormDialog 依 isDirty 決定是否詢問捨棄
const { isDirty: courseDirty, snapshot: snapshotCourse } = useFormDirty(form)
const courseRules: FormRules<CourseForm> = {
  name: [required('課程名稱')],
  price: [required('價格', { kind: 'input', trigger: 'change' }), money({ min: 0 })],
}
```

`openCreate()` 與 `openEdit()` 各在 `dialogVisible.value = true` 之前加一行 `snapshotCourse()`（`openEdit` 要放在 `editingDm.value = …` 之後、`dialogVisible.value = true` 之前）。

`handleSave()` 開頭把

```ts
  if (!form.value.name || form.value.price == null) {
    return ElMessage.warning('請填寫課程名稱和價格')
  }
```

改成

```ts
  // 必填改走 EP rules（inline 標紅＋捲到第一個錯誤欄），不再只跳 toast
  const valid = await courseFormRef.value?.validate().catch(() => false)
  if (valid === false) {
    courseDialogRef.value?.scrollToFirstError()
    return
  }
```

（`handleSave` 已是 `async`；起訖時刻的跨欄位檢查維持原本的 `ElMessage.warning`。）

- [ ] **Step 4: template 側改動**

把第 190 行起的整段課程 `<el-dialog … >…</el-dialog>`（到 `</el-dialog>` 為止，含 footer）替換為：

```vue
    <FormDialog
      ref="courseDialogRef"
      v-model="dialogVisible"
      :title="editingId ? '編輯課程' : '新增課程'"
      size="standardNarrow"
      :dirty="courseDirty"
      :loading="saving"
      :submit-text="editingId ? '儲存' : '建立課程'"
      @submit="handleSave"
    >
      <el-form
        ref="courseFormRef"
        :model="form"
        :rules="courseRules"
        label-position="top"
        class="form-grid"
        scroll-to-error
        @submit.prevent
      >
        <el-form-item label="課程名稱" prop="name" class="fg-8" data-test="course-name-input">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="價格（元）" prop="price" class="fg-4" data-test="course-price-input">
          <el-input-number v-model="form.price" :min="0" :max="999999" :step="1" :precision="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="堂數" prop="sessions" class="fg-4">
          <el-input-number v-model="form.sessions" :min="1" :step="1" :precision="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="容量" prop="capacity" class="fg-4">
          <el-input-number v-model="form.capacity" :min="1" :step="1" :precision="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="允許候補" prop="allow_waitlist" class="fg-4">
          <el-switch v-model="form.allow_waitlist" />
        </el-form-item>
        <el-form-item label="講師" prop="instructor_name" class="fg-6">
          <el-input v-model="form.instructor_name" maxlength="50" placeholder="講師姓名（選填，前台課程卡顯示）" />
        </el-form-item>
        <el-form-item label="負責老師" prop="instructor_employee_id" class="fg-6">
          <el-select
            v-model="form.instructor_employee_id"
            clearable
            filterable
            placeholder="選擇負責老師"
            style="width: 100%"
            data-test="select-instructor-employee"
          >
            <el-option v-for="emp in employeeOptions" :key="emp.id" :label="String(emp.name)" :value="emp.id" />
          </el-select>
          <div class="form-hint">年終教課獎勵金依此歸屬自動計算</div>
        </el-form-item>
        <el-form-item label="限定年級" prop="allowed_grades" class="fg-12">
          <el-checkbox-group v-model="form.allowed_grades" data-test="allowed-grades-group">
            <el-checkbox v-for="g in GRADES_ORDER" :key="g" :value="g" :label="g">{{ g }}</el-checkbox>
          </el-checkbox-group>
          <div class="form-hint">不勾＝不限年級。僅供前台顯示與報名管理標示，不會擋報名</div>
        </el-form-item>
        <el-form-item label="說明" prop="description" class="fg-12" data-test="course-description-input">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="影片 URL" prop="video_url" class="fg-12">
          <el-input v-model="form.video_url" />
        </el-form-item>
        <el-form-item label="課程 DM" class="fg-12">
          <CourseDmUploader
            v-if="editingId"
            :course-id="editingId"
            :dm-url="editingDm.dm_url"
            :dm-pages="editingDm.dm_pages"
            @updated="onDmUpdated"
          />
          <span v-else class="dm-hint-create">儲存課程後即可上傳 DM</span>
        </el-form-item>

        <FormSection title="上課時段（公開報名頁顯示用；空白＝不限制）" class="fg-12" data-test="section-schedule">
          <div class="form-grid">
            <el-form-item label="上課星期" prop="meeting_weekdays" class="fg-4">
              <el-select v-model="form.meeting_weekdays" placeholder="可複選" multiple clearable style="width: 100%;">
                <el-option :value="0" label="週一" />
                <el-option :value="1" label="週二" />
                <el-option :value="2" label="週三" />
                <el-option :value="3" label="週四" />
                <el-option :value="4" label="週五" />
                <el-option :value="5" label="週六" />
                <el-option :value="6" label="週日" />
              </el-select>
            </el-form-item>
            <el-form-item label="起始時間" prop="meeting_start_time" class="fg-4">
              <el-time-picker v-model="form.meeting_start_time" value-format="HH:mm" format="HH:mm" placeholder="起始" style="width: 100%" />
            </el-form-item>
            <el-form-item label="結束時間" prop="meeting_end_time" class="fg-4">
              <el-time-picker v-model="form.meeting_end_time" value-format="HH:mm" format="HH:mm" placeholder="結束" style="width: 100%" />
            </el-form-item>
            <el-alert
              v-if="isWeekdayScheduleIncomplete(form)"
              class="fg-12"
              title="已選上課星期但未填完整起訖時間：報名頁只會顯示星期，且不參與衝堂提醒。"
              type="warning"
              :closable="false"
              show-icon
            />
          </div>
        </FormSection>
      </el-form>
    </FormDialog>
```

注意：
- `<el-form class="form-grid">` 讓 `.fg-*` 直接作用在 `el-form-item`（`.form-grid > *`）；`FormSection` 內再包一層 `.form-grid`。
- 移除了原本的 `el-divider` 與「上課時間」用 flex 併排兩個 picker 的自訂 div，改成兩個獨立 form-item。
- 若 `.dm-hint-create` 樣式在 `<style scoped>` 仍存在就保留，不新增樣式。

- [ ] **Step 5: 跑新測試與既有課程測試**

Run: `VITEST_MAX_FORKS=2 npx vitest run src/views/activity/__tests__/ tests/unit/views/activityCanWriteGate.test.js`
Expected: 全綠。若既有測試因 `FormDialog` 內的 `el-button` 未 stub 而出現「Failed to resolve component」警告，屬 warning 不影響結果；若既有測試以 `'el-dialog'` stub 的 `template` 找 footer 按鈕文字，改成用 `[data-test="form-dialog-submit"]` 查找。

- [ ] **Step 6: typecheck 與 lint**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx vue-tsc --noEmit && npx eslint src/views/activity/ActivityCourseView.vue src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts`
Expected: exit 0

- [ ] **Step 7: 棘輪應顯示存量下降（此時預期紅，Task 9 調降）**

Run: `node scripts/check-form-dialogs.mjs --list | tail -1`
Expected: 相對 Task 2 Step 5，A 少 1、B 少 1、C 少 1（其餘不變）。記下數字供 Task 9。

- [ ] **Step 8: Commit**

```bash
git add src/views/activity/ActivityCourseView.vue src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts
git commit -m "feat(activity): 課程新增／編輯改 FormDialog standardNarrow＋form-grid 語意配對＋EP rules" -m "F1 旗艦（重排版面路徑）：480px 塞 13 欄→760px 兩欄語意配對；必填由送出時 toast 改 inline 標紅＋捲到第一個錯誤欄；
上課時段改 FormSection；payload、DM 上傳只在編輯模式、data-test 錨點全數保留。spec §3.5" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- src/views/activity/ActivityCourseView.vue src/views/activity/__tests__/ActivityCourseView.formDialog.test.ts
```

---

### Task 8: 旗艦 F2——收付款 SignoffPanel 只換殼

**Files:**
- Modify: `src/components/signoff/SignoffPanel.vue`（template 第 227–234 行 `el-dialog` 開頭與第 504 行 `</el-dialog>`；footer 第 439–447 行；script imports 第 552 行附近；第 1007–1041 行 dirty／`handleDialogBeforeClose`／`requestClose`）

**Interfaces:**
- Consumes：`FormDialog`（Task 5：`dirty` 接 getter、`footer` slot 整個取代、expose `requestClose()`）。
- 行為不變式：`formSnapshot`／`editableSnapshot()`／`isFormDirty()` 判定不動；footer 五種狀態（草稿／送審中／核准／對帳／鎖定）與 hint 文字不動；`data-test="save-draft"`／`save-submit`／`reject-btn`／`lock-reason` 錨點不動。唯一文案變化：未儲存確認框改為全站統一的 `confirmDiscardChanges` 文案。

- [ ] **Step 1: 記錄基線（無既有單元測試）**

`SignoffPanel.vue` 沒有單元測試；本 task 以 typecheck、ESLint、FormDialog 自身測試與 Task 9 的視覺驗證為閘。先確認：

Run: `grep -rl 'SignoffPanel' tests src --include='*.test.*' | wc -l`
Expected: `0`

- [ ] **Step 2: 換殼**

（a）import：在 `import FormSection from '@/components/common/FormSection.vue'` 之後加

```ts
import FormDialog from '@/components/common/FormDialog.vue'
```

（b）template：把

```vue
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="640px"
      destroy-on-close
      :before-close="handleDialogBeforeClose"
      class="so-dialog"
    >
```

改成

```vue
    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      :title="dialogTitle"
      size="standardNarrow"
      :dirty="isFormDirty"
      class="so-dialog"
    >
```

對應的結尾 `</el-dialog>`（第 504 行）改成 `</FormDialog>`。

（c）footer：`<template #footer>` 保留（整個取代預設 footer），但把

```vue
          <el-button @click="requestClose">關閉</el-button>
```

改成

```vue
          <el-button @click="formDialogRef?.requestClose()">取消</el-button>
```

（d）script：在 `const formRef = ref<FormInstance>()` 之後加

```ts
const formDialogRef = ref<InstanceType<typeof FormDialog>>()
```

刪除前先 `grep -n 'requestClose\|handleDialogBeforeClose' src/components/signoff/SignoffPanel.vue`：除了 template 的關閉鈕與這兩個定義之外，若還有其他呼叫點（例如某個成功流程後呼叫 `requestClose()`），一律改成 `formDialogRef.value?.requestClose()`。然後刪除整個 `handleDialogBeforeClose(done)` 函式與 `requestClose()` 函式（第 1023–1041 行），保留 `formSnapshot`／`editableSnapshot()`／`isFormDirty`。

（e）確認 `ElMessageBox` 仍有其他使用處（第 895 行送審確認），import 不動。

- [ ] **Step 3: typecheck、lint、棘輪**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx vue-tsc --noEmit && npx eslint src/components/signoff/SignoffPanel.vue && node scripts/check-form-dialogs.mjs --list | tail -1`
Expected: typecheck／lint exit 0；棘輪數字相對 Task 7 Step 7 再 A 少 1、C 少 1（B 不變，因該檔原本沒有 label-width）

- [ ] **Step 4: 跑 fees／signoff 相鄰測試確認無連帶紅**

Run: `VITEST_MAX_FORKS=2 npx vitest run tests/components tests/unit/components 2>&1 | tail -15`
Expected: 全綠（若出現與本檔無關的既有紅燈，記下測試 id 回報，不在本 task 修）

- [ ] **Step 5: Commit**

```bash
git add src/components/signoff/SignoffPanel.vue
git commit -m "refactor(signoff): 收付款對話框改 FormDialog 殼（只換殼、footer 與 dirty 判定不動）" -m "F2 旗艦（只換殼路徑）：證明既有合規表單換殼是幾行 diff。寬度 640→standardNarrow 760；
未儲存確認文案統一走 confirmDiscardChanges。spec §3.5" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- src/components/signoff/SignoffPanel.vue
```

---

### Task 9: 收尾——棘輪調降、全套 gate、build、視覉驗證

**Files:**
- Modify: `scripts/check-form-dialogs.mjs`（`BASELINE`）
- 可能還原：`components.d.ts`（build 重生後）

- [ ] **Step 1: 調降 BASELINE**

Run: `node scripts/check-form-dialogs.mjs --list | tail -1`
把輸出的四個數字填進 `BASELINE`（相對 Task 2：A −2、B −1、C −2、D 不變）。

Run: `node scripts/check-form-dialogs.mjs`
Expected: `✓ 表單 dialog 棘輪維持 …`

- [ ] **Step 2: 兩棵測試樹相關檔全跑**

Run:
```bash
VITEST_MAX_FORKS=2 npx vitest run \
  tests/unit/assets/mainCssFormDefaults.test.ts \
  tests/unit/ci/checkFormDialogs.test.ts \
  tests/unit/composables/useFormDirty.test.ts \
  tests/unit/validators/rules.test.ts \
  tests/components/FormDialog.test.ts \
  tests/components/FormSection.test.ts \
  src/views/activity/__tests__/ \
  tests/unit/views/activityCanWriteGate.test.js
```
Expected: 全綠

- [ ] **Step 3: 全套靜態 gate**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx vue-tsc --noEmit && npm run lint && npm run lint:tokens && npm run check:error-detail && npm run check:a11y && npm run check:form-dialogs`
Expected: 全部 exit 0（`lint:tokens` 基底若本來就紅，比對 diff 確認本分支零新增再回報）

- [ ] **Step 4: build 與 components.d.ts 還原**

Run: `npm run build 2>&1 | tail -8`
Expected: build 成功且 `check-entry-chunks` 綠（`FormDialog` 只被 admin 端 import，不會被吸進 parent／portal entry）。

然後還原 build 重生的 `components.d.ts`，只保留本計畫那一行：

```bash
git show HEAD:components.d.ts > components.d.ts
git status --short components.d.ts   # 應為空
```

- [ ] **Step 5: 視覺驗證（需使用者前景跑 `start.sh`，或於 staging 部署後執行）**

主 loop 以 `ivyManageSystem/.scratch/admin-form-uiux-2026-09-05/shots.mjs` 為底，把 `BASE` 改成本機 `http://localhost:5173`（或 staging），對下列項目截桌機＋手機圖並人工比對：
1. 任一 label-right 舊表單（如 `/leaves` 新增請假）：桌機標籤堆疊在欄位上方、手機標籤左對齊。
2. `/activity/courses` 新增課程：760px、名稱＋價格同列、時段區塊、空表單按「建立課程」時課程名稱與價格標紅並捲到位。
3. `/finance-signoffs?tab=vendor` 新增付款：外觀與改前一致、輸入後按 X 出現「尚有未儲存的變更」確認框。
4. 任一 dialog 開啟後游標已在第一欄；在單行欄按 Enter 觸發送出（空表單只會標紅）。

若本機無法起服務，此步改在使用者授權 push staging 後執行，並把截圖存到 `ivyManageSystem/.scratch/admin-form-uiux-2026-09-05/after/`。

- [ ] **Step 6: Commit 收尾**

```bash
git add scripts/check-form-dialogs.mjs
git commit -m "ci(admin): 表單 dialog 棘輪 baseline 調降（旗艦 F1／F2 遷移後）" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011kHoFu7nT8StQFf9ZVM9Qh" -- scripts/check-form-dialogs.mjs
git log --oneline origin/staging..HEAD
```

Expected: 9 個 commit（spec 1＋Task 1–8 各 1＋本 commit）。回報「本地實作／驗證完成」；push staging 與升 prod 需使用者授權。
