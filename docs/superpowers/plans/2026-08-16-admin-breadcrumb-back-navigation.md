# 管理端「返回上一層」導航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓管理端頂列的父層路徑（如「薪資管理 / 自主成長獎勵金」）成為可點的返回入口，並收斂全站散落的自刻返回鍵。

**Architecture:** 父層資訊不再由 router 手寫字串提供，改由既有的 `NAVIGATION_MANIFEST`（側邊欄與權限守衛的單一事實來源）反查產生。純函式分兩層：`deriveBreadcrumbParents` 從 manifest 產生候選表（module-level 執行一次），`resolveBreadcrumbParent` 依四條規則解析當前路徑的父層。`AdminHeader.vue` 是管理端唯一標題渲染點，改它一處即涵蓋全站。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、vue-router 4、Element Plus、Vitest（happy-dom）+ @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-08-16-admin-breadcrumb-back-navigation-design.md`

## Global Constraints

- **工作目錄**：`~/Desktop/ivy-frontend/.claude/worktrees/breadcrumb-back`（worktree，分支 `feat/admin-breadcrumb-back-navigation`，基準 `origin/staging`）。**不要**在 `~/Desktop/ivy-frontend` 主 checkout 動手，那是落後 64 commit 的 main。
- **TS-only**：`src/` 業務碼 100% TypeScript，新 SFC 一律 `<script setup lang="ts">`。**禁 `: any` / `as any`**，需要時用 `: unknown` + narrow。
- **語言**：commit message、程式碼註解、UI 文案一律繁體中文（台灣用語）。
- **Commit**：Conventional Commits，一個 commit 只做一件事，全部落在本 worktree 分支上。
- **色值**：不新增色值、不寫死品牌色，一律用既有 CSS 變數（`var(--text-tertiary)`、`var(--el-color-primary)` 等）。
- **測試指令**：`npm test -- <路徑>`（`test` script = `vitest run`，路徑當 filter）。單一 case 加 `-t '<關鍵字>'`。typecheck：`npm run typecheck`。
- **⚠ 測試指令禁止接 `| tail` 或任何 pipe**——exit code 會變成 pipe 末端指令的，測試紅了照樣 exit 0。要摘要就導檔再 grep。
- **⚠ vitest v4 沒有 `--reporter=basic`**（會 Startup Error），不要加。
- **測試環境**：`happy-dom`、`globals: true`、alias `@` → `./src`、`setupFiles: ['./tests/setup.js']`。
- **不得回頭走手寫字串老路**：新增頁面的父層一律由 manifest 反查或 `meta.parent` 提供，`meta.parentTitle` 本計畫後為 0 宣告並由測試凍結。

### 父層解析四規則（Task 2 實作，全計畫共用語彙）

依序判定，先命中者勝：

1. **自己是側邊欄項目** → 無父層（`route.path` 完全等於某個 manifest 選單項的 `routePath`）
2. **`meta.parent` 明示** → 以該路徑為父層
3. **最長前綴反查** → 最長的選單項 `routePath` 使 `path.startsWith(routePath + '/')`
4. **父層是 redirect 容器 → 撤銷**（對規則 2、3 的結果都套用，維持「顯示的父層一律點得動」）

### 既有測試慣例（務必沿用）

- 檔頭寫一段 block comment 說明「這支守什麼、為何守」，點名對應 spec 章節。
- 攤平 manifest 的標準寫法：`[...NAVIGATION_MANIFEST.topLevel, ...NAVIGATION_MANIFEST.groups.flatMap((g) => [...g.pages])]`。
- 斷言一律收集 `offenders: string[]` 再 `expect(offenders, '<繁中失敗訊息含修法>').toEqual([])`，**不用** `toBe(0)` 這種看不到內容的斷言。
- 每個 describe 第一個 it 放「防假綠」哨兵（`length > N` + `toContain` 釘代表值），否則過濾條件寫壞會全綠。
- 凍結清單維持精確斷言，**不放寬成 `>=`**。

---

## File Structure

| 檔案 | 責任 | 動作 |
|---|---|---|
| `src/constants/navigation/derive.ts` | manifest 衍生層（純函式） | 新增 `deriveBreadcrumbParents` |
| `src/constants/navigation/index.ts` | 衍生結果 module-level 匯出 | 新增 `BREADCRUMB_PARENTS` |
| `src/utils/breadcrumb.ts` | **新檔**：runtime 父層解析（純函式，依賴注入 router 能力） | 建立 |
| `src/components/layout/AdminHeader.vue` | 管理端唯一標題渲染點 | 接線 + 樣式 |
| `src/types/index.d.ts` | vue-router `RouteMeta` 擴充（全 repo 唯一處） | 新增 `parent?: string` |
| `src/router/index.ts` | 路由 meta | 移除 18 處 `parentTitle`、新增 6 處 `parent` |
| 階段三 6 支 view/component | 移除／收斂自刻返回鍵 | Task 7–10 |

分層理由：`deriveBreadcrumbParents` 只依賴 manifest（靜態、可 module-level 跑一次）；`resolveBreadcrumbParent` 需要當前路徑與 router 解析能力（runtime），兩者職責不同故分檔。`resolveBreadcrumbParent` 以**依賴注入**接收 `isContainer` / `titleOf`，才能不 mock router 就完整單元測試。

### 實作前必知的既有事實（已實測，勿再假設）

1. `AdminHeader.spec.ts` 用 `vi.mock('vue-router', ...)` **整包 mock**，只提供 `useRoute().meta.title` 與 `useRouter().push`（**無 `resolve`**）。因此麵包屑測試必須放**新檔**（Task 3），不能加在既有檔內。
2. `RouteMeta` 型別擴充在 `src/types/index.d.ts`（全 repo 唯一 `declare module 'vue-router'`），**不在** router 檔內。該介面目前沒宣告 `parentTitle`（靠 vue-router 預設 index signature 才沒報錯）。
3. `manifestRouteParity.test.ts` 用 `import { routes } from '@/router/index'` + 自寫 `flattenRoutes` 攤平，**不 import router 實例**。Task 5 沿用此手法。
4. 檔案實際位置（與直覺不同，勿猜）：`src/views/EmployeeDetailView.vue`、`src/views/StudentAttendanceView.vue`、`src/views/StudentLeavesListView.vue`、`src/views/StudentAssessmentView.vue`、`src/views/StudentIncidentView.vue`、`src/views/kiosk/KioskPunchView.vue`。
5. `/activity` 群組**沒有** `path: '/activity'` 這條路由（模組首頁是 `/activity/dashboard`）。

---

## 階段一：麵包屑父層可點

### Task 1: manifest 父層候選表

**Files:**
- Modify: `src/constants/navigation/derive.ts`（在 `deriveActiveMenuPaths` 之後，約 `:150`）
- Modify: `src/constants/navigation/index.ts`
- Test: `src/constants/navigation/__tests__/deriveBreadcrumbParents.test.ts`（新檔）

**Interfaces:**
- Consumes: `NavigationManifest`、`allPages`（`derive.ts` 內既有 private helper，`:13-15`）
- Produces:
  - `export interface BreadcrumbParent { path: string; title: string }`（於 `derive.ts`，由 `index.ts` re-export type）
  - `export function deriveBreadcrumbParents(m: NavigationManifest): BreadcrumbParent[]`
  - `export const BREADCRUMB_PARENTS: BreadcrumbParent[]`（於 `index.ts`，**已依 path 長度降冪排序**）

- [ ] **Step 1: 寫失敗測試**

建立 `src/constants/navigation/__tests__/deriveBreadcrumbParents.test.ts`：

```ts
/**
 * 麵包屑父層候選表衍生測試（spec §3.4）。
 *
 * 守的是：候選表 = 「有 menu 且有 routePath」的選單項，且依 path 長度降冪
 * ——後者是 resolveBreadcrumbParent 用 find 取最長前綴的前提，排序壞掉會讓
 * /activity/pos/approval 誤配到較短的前綴，症狀是父層指到錯的模組。
 */
import { describe, expect, it } from 'vitest'
import { NAVIGATION_MANIFEST } from '@/constants/navigation'
import { deriveBreadcrumbParents } from '../derive'

describe('deriveBreadcrumbParents', () => {
  const parents = deriveBreadcrumbParents(NAVIGATION_MANIFEST)

  it('防假綠哨兵：候選數量合理且含代表項', () => {
    expect(parents.length).toBeGreaterThan(30)
    const paths = parents.map((p) => p.path)
    expect(paths).toContain('/salary')
    expect(paths).toContain('/employees')
    expect(paths).toContain('/students')
    expect(paths).toContain('/surveys')
  })

  it('title 取自 manifest 選單項名稱（與側邊欄同源）', () => {
    expect(parents.find((p) => p.path === '/salary')?.title).toBe('薪資管理')
    expect(parents.find((p) => p.path === '/surveys')?.title).toBe('調查管理')
    expect(parents.find((p) => p.path === '/employees')?.title).toBe('員工管理')
  })

  it('排除 routePath 為 null 的純授權節點', () => {
    const offenders = parents.filter((p) => typeof p.path !== 'string' || p.path.length === 0)
    expect(offenders, 'routePath 為 null 的節點混進候選表').toEqual([])
    expect(parents.some((p) => p.title === '課後才藝（全模組）')).toBe(false)
    expect(parents.some((p) => p.title === '特教需求')).toBe(false)
  })

  it('排除無 menu 的隱藏頁（pickerOnly 群組節點）', () => {
    expect(parents.some((p) => p.title === '班級相簿（教師端）')).toBe(false)
  })

  it('依 path 長度降冪排序（最長前綴匹配的前提）', () => {
    const lengths = parents.map((p) => p.path.length)
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
  })

  it('長路徑排在短路徑之前（/activity/pos 早於 /salary）', () => {
    const iPos = parents.findIndex((p) => p.path === '/activity/pos')
    const iSalary = parents.findIndex((p) => p.path === '/salary')
    expect(iPos).toBeGreaterThanOrEqual(0)
    expect(iSalary).toBeGreaterThanOrEqual(0)
    expect(iPos).toBeLessThan(iSalary)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/breadcrumb-back
npm test -- src/constants/navigation/__tests__/deriveBreadcrumbParents.test.ts
```

Expected: FAIL — `deriveBreadcrumbParents is not a function`

- [ ] **Step 3: 實作**

在 `src/constants/navigation/derive.ts` 的 `deriveActiveMenuPaths` 函式之後加入：

```ts
export interface BreadcrumbParent {
  /** 父層目標路徑（= 選單項 routePath）。 */
  path: string
  /** 顯示文字（= 選單項 title，與側邊欄字面同源）。 */
  title: string
}

/**
 * 麵包屑父層候選表：全部「有 menu 且有 routePath」的選單項。
 * 依 path 長度降冪排序 → 消費端 find 第一個命中即最長前綴，無需再比長度。
 */
export function deriveBreadcrumbParents(m: NavigationManifest): BreadcrumbParent[] {
  return allPages(m)
    .filter((p) => p.menu && p.routePath !== null)
    .map((p) => ({ path: p.routePath as string, title: p.title }))
    .sort((a, b) => b.path.length - a.path.length)
}
```

在 `src/constants/navigation/index.ts`：import 清單（既有的 `deriveActiveMenuPaths, derivePickerTree, ...` 那組）加入 `deriveBreadcrumbParents`，並在 `ACTIVE_MENU_PATHS` 之後加入：

```ts
/** 麵包屑父層候選（已依 path 長度降冪，供最長前綴匹配）。 */
export const BREADCRUMB_PARENTS = deriveBreadcrumbParents(NAVIGATION_MANIFEST)
```

檔尾 `export type { ... } from './derive'` 區塊中加入 `BreadcrumbParent`。

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test -- src/constants/navigation/__tests__/deriveBreadcrumbParents.test.ts
```

Expected: PASS（6 個 case）

- [ ] **Step 5: 跑既有 navigation 測試確認無回歸**

```bash
npm test -- src/constants/navigation/
```

Expected: PASS（含 `manifestIntegrity.test.ts` 299 行、`manifestRouteParity.test.ts` 169 行）

- [ ] **Step 6: Commit**

```bash
git add src/constants/navigation/derive.ts src/constants/navigation/index.ts src/constants/navigation/__tests__/deriveBreadcrumbParents.test.ts
git commit -m "feat(nav): 由 manifest 衍生麵包屑父層候選表"
```

---

### Task 2: 父層解析純函式

**Files:**
- Create: `src/utils/breadcrumb.ts`
- Test: `src/utils/__tests__/breadcrumb.test.ts`（新檔）

**Interfaces:**
- Consumes: `BreadcrumbParent`（Task 1，自 `@/constants/navigation` import）
- Produces:
  - `export interface BreadcrumbResolveContext { parents: readonly BreadcrumbParent[]; isContainer: (path: string) => boolean; titleOf: (path: string) => string; metaParent?: string }`
  - `export function resolveBreadcrumbParent(path: string, ctx: BreadcrumbResolveContext): BreadcrumbParent | null`

`isContainer` / `titleOf` 為依賴注入（Task 3 以 `router.resolve` 實作，Task 5 以攤平的 route records 實作），本函式保持純粹以便完整單元測試。

- [ ] **Step 1: 寫失敗測試**

建立 `src/utils/__tests__/breadcrumb.test.ts`：

```ts
/**
 * 麵包屑父層解析測試（spec §3.1 四規則 + §3.3 邊界案例表）。
 *
 * 核心不變式：**回傳非 null 者一律可點且點得到實質頁面**。
 * 任何讓「顯示了卻點不動」的情況通過，就是本檔失守。
 */
import { describe, expect, it } from 'vitest'
import type { BreadcrumbParent } from '@/constants/navigation'
import { resolveBreadcrumbParent, type BreadcrumbResolveContext } from '../breadcrumb'

// 依 path 長度降冪的候選表（模擬 BREADCRUMB_PARENTS 的排序契約）
const PARENTS: BreadcrumbParent[] = [
  { path: '/activity/pos/approval', title: 'POS 收款簽核' },
  { path: '/platform/tenants', title: '分校管理' },
  { path: '/appraisal-year-end', title: '考核與年終' },
  { path: '/activity/dashboard', title: '統計儀表板' },
  { path: '/settings/accounts', title: '帳號設定' },
  { path: '/activity/pos', title: 'POS 收銀' },
  { path: '/employees', title: '員工管理' },
  { path: '/workbench', title: '審核工作台' },
  { path: '/students', title: '學生' },
  { path: '/surveys', title: '調查管理' },
  { path: '/salary', title: '薪資管理' },
  { path: '/bus', title: '娃娃車管理' },
  { path: '/', title: '儀表板' },
]

const CONTAINERS = new Set(['/bus', '/workbench', '/appraisal-year-end'])
const TITLES: Record<string, string> = { '/appraisal-year-end/year-end': '年終' }

const ctx = (over: Partial<BreadcrumbResolveContext> = {}): BreadcrumbResolveContext => ({
  parents: PARENTS,
  isContainer: (p) => CONTAINERS.has(p),
  titleOf: (p) => TITLES[p] ?? '',
  ...over,
})

describe('resolveBreadcrumbParent', () => {
  describe('規則 3：最長前綴反查', () => {
    it('子頁取得可點父層', () => {
      expect(resolveBreadcrumbParent('/salary/growth-contract', ctx())).toEqual({
        path: '/salary',
        title: '薪資管理',
      })
    })

    it('動態參數子頁同樣命中', () => {
      expect(resolveBreadcrumbParent('/employees/123', ctx())).toEqual({
        path: '/employees',
        title: '員工管理',
      })
      expect(resolveBreadcrumbParent('/platform/tenants/7', ctx())).toEqual({
        path: '/platform/tenants',
        title: '分校管理',
      })
    })

    it('多段子路徑取最長前綴', () => {
      expect(resolveBreadcrumbParent('/students/profile/5', ctx())).toEqual({
        path: '/students',
        title: '學生',
      })
    })

    it('調查子頁父層是「調查管理」而非群組名「活動調查」', () => {
      expect(resolveBreadcrumbParent('/surveys/new', ctx())?.title).toBe('調查管理')
      expect(resolveBreadcrumbParent('/surveys/42/edit', ctx())?.title).toBe('調查管理')
      expect(resolveBreadcrumbParent('/surveys/42', ctx())?.title).toBe('調查管理')
    })

    it('要求尾隨斜線：/student-attendance 不得誤配到 /students', () => {
      expect(resolveBreadcrumbParent('/student-attendance', ctx())).toBeNull()
    })

    it('根路徑 / 不得成為任何路徑的前綴父層', () => {
      expect(resolveBreadcrumbParent('/data-quality', ctx())).toBeNull()
    })
  })

  describe('規則 1：自己是側邊欄項目 → 無父層', () => {
    it('一級頁無父層', () => {
      expect(resolveBreadcrumbParent('/employees', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/activity/dashboard', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/settings/accounts', ctx())).toBeNull()
    })

    it('本身是選單項時，即使 URL 上是別的選單項的子路徑也無父層', () => {
      expect(resolveBreadcrumbParent('/activity/pos/approval', ctx())).toBeNull()
    })

    it('規則 1 優先於 meta.parent', () => {
      expect(resolveBreadcrumbParent('/employees', ctx({ metaParent: '/salary' }))).toBeNull()
    })
  })

  describe('規則 2：meta.parent 明示', () => {
    it('指向選單項時取 manifest title', () => {
      expect(
        resolveBreadcrumbParent('/activity/audit/pos-unlock', ctx({ metaParent: '/activity/pos' })),
      ).toEqual({ path: '/activity/pos', title: 'POS 收銀' })
    })

    it('指向非選單項時以 titleOf 取路由 meta.title', () => {
      expect(
        resolveBreadcrumbParent(
          '/appraisal-year-end/year-end/cycles/9',
          ctx({ metaParent: '/appraisal-year-end/year-end' }),
        ),
      ).toEqual({ path: '/appraisal-year-end/year-end', title: '年終' })
    })

    it('優先於最長前綴反查', () => {
      expect(resolveBreadcrumbParent('/students/profile/5', ctx({ metaParent: '/salary' }))).toEqual(
        { path: '/salary', title: '薪資管理' },
      )
    })

    it('取不到顯示文字時回 null，不渲染空白連結', () => {
      expect(resolveBreadcrumbParent('/foo/bar', ctx({ metaParent: '/unknown-path' }))).toBeNull()
    })
  })

  describe('規則 4：redirect 容器撤銷', () => {
    it('父層是 redirect 容器時不顯示（點了會被轉回原頁）', () => {
      expect(resolveBreadcrumbParent('/bus/monitor', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/bus/history', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/workbench/approvals', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/appraisal-year-end/rules/scoring', ctx())).toBeNull()
    })

    it('meta.parent 指向容器時同樣撤銷（維持「顯示即可點」不變式）', () => {
      expect(resolveBreadcrumbParent('/anything/deep', ctx({ metaParent: '/bus' }))).toBeNull()
    })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test -- src/utils/__tests__/breadcrumb.test.ts
```

Expected: FAIL — 找不到模組 `../breadcrumb`

- [ ] **Step 3: 實作**

建立 `src/utils/breadcrumb.ts`：

```ts
import type { BreadcrumbParent } from '@/constants/navigation'

export interface BreadcrumbResolveContext {
  /** 父層候選表，須已依 path 長度降冪排序（BREADCRUMB_PARENTS 的契約）。 */
  parents: readonly BreadcrumbParent[]
  /** 該路徑對應的路由是否為純 redirect 容器（點下去會被轉走）。 */
  isContainer: (path: string) => boolean
  /** 以路徑取路由 meta.title，供 meta.parent 指向非選單項時取顯示文字。 */
  titleOf: (path: string) => string
  /** route.meta.parent 明示的父層路徑。 */
  metaParent?: string
}

/**
 * 解析當前路徑的麵包屑父層。四條規則依序判定（spec §3.1）：
 * 1. 自己是側邊欄項目 → 無父層（一級頁）
 * 2. meta.parent 明示
 * 3. 最長前綴反查（parents 已降冪，第一個命中即最長）
 * 4. 父層是 redirect 容器 → 撤銷
 *
 * 不變式：**回傳非 null 者一律可點且點得到實質頁面**——這是「頂列出現的父層
 * 一律可點」這條 UX 規則的實作保證。放寬它就會退回本次要修的問題：使用者
 * 分不出哪個灰字能點。
 */
export function resolveBreadcrumbParent(
  path: string,
  ctx: BreadcrumbResolveContext,
): BreadcrumbParent | null {
  // 規則 1：自己就是側邊欄項目 → 無父層
  if (ctx.parents.some((p) => p.path === path)) return null

  let candidate: BreadcrumbParent | null = null

  if (ctx.metaParent) {
    // 規則 2：meta.parent 明示（顯示文字：選單項 title 優先，否則取目標路由 meta.title）
    const known = ctx.parents.find((p) => p.path === ctx.metaParent)
    const title = known?.title || ctx.titleOf(ctx.metaParent)
    candidate = title ? { path: ctx.metaParent, title } : null
  } else {
    // 規則 3：最長前綴反查。要求尾隨 '/' 才算子路徑，
    // 否則 /student-attendance 會誤配到 /students。
    candidate = ctx.parents.find((p) => path.startsWith(`${p.path}/`)) ?? null
  }

  if (!candidate) return null

  // 規則 4：redirect 容器撤銷。這類父層點下去會被守衛轉走，
  // 常落回使用者原本那頁 = 點了沒反應。
  if (ctx.isContainer(candidate.path)) return null

  return candidate
}
```

**注意**：規則 3 對候選 `/`（儀表板）會變成 `startsWith('//')`，永不命中——這正是要的（根頁不當任何頁的父層），無需特判。

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test -- src/utils/__tests__/breadcrumb.test.ts
```

Expected: PASS（15 個 case：規則 3 六個、規則 1 三個、規則 2 四個、規則 4 兩個）

- [ ] **Step 5: Commit**

```bash
git add src/utils/breadcrumb.ts src/utils/__tests__/breadcrumb.test.ts
git commit -m "feat(nav): 新增麵包屑父層解析純函式"
```

---

### Task 3: AdminHeader 接線與樣式

**Files:**
- Modify: `src/components/layout/AdminHeader.vue`（模板 `:20-23`、script `:178-179`、樣式 `:318-329`、行動版 `:477-480`）
- Test: `src/components/layout/__tests__/AdminHeader.breadcrumb.spec.ts`（**新檔**）

**Interfaces:**
- Consumes: `BREADCRUMB_PARENTS`（Task 1）、`resolveBreadcrumbParent`（Task 2）
- Produces: 頂列父層渲染為 `<router-link class="page-title__parent">`；`parentTitle` computed 移除

**為什麼開新測試檔**：既有 `AdminHeader.spec.ts:4-7` 用 `vi.mock('vue-router', ...)` 整包 mock 且不提供 `resolve`，而本功能需要真 router 才能渲染 `<router-link>`。`vi.mock` 是模組層級的，同檔內無法混用，故獨立新檔。

- [ ] **Step 1: 寫失敗測試**

建立 `src/components/layout/__tests__/AdminHeader.breadcrumb.spec.ts`：

```ts
/**
 * 頂列麵包屑父層測試（spec §3.4）。
 *
 * 本檔刻意「不」mock vue-router（既有 AdminHeader.spec.ts 有整包 mock），
 * 因為要驗證的正是 <router-link> 的真實渲染與 to 目標。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHashHistory } from 'vue-router'

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ fetchEmployees: vi.fn(), employees: [] }),
}))
vi.mock('@/api/auth', () => ({ impersonate: vi.fn() }))
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ role: 'admin', name: '管理員' }),
  clearAuth: vi.fn(),
  setUserInfo: vi.fn(),
  hasPermission: () => false,
}))

import AdminHeader from '../AdminHeader.vue'

const passthrough = { template: '<div><slot /><slot name="dropdown" /></div>' }
const stubs = {
  ElHeader: passthrough,
  ElIcon: passthrough,
  ElButton: { template: '<button><slot /></button>' },
  ElAvatar: true,
  ElDropdown: passthrough,
  ElDropdownMenu: passthrough,
  ElDropdownItem: passthrough,
  ElDialog: passthrough,
  ElRadioGroup: passthrough,
  ElRadio: passthrough,
  ElInput: true,
  ElScrollbar: passthrough,
  GlobalSearch: true,
  AdminNotificationBell: true,
  A11yMenu: true,
}

const Blank = { template: '<div />' }
const TEST_ROUTES = [
  { path: '/', component: Blank, meta: { title: '儀表板' } },
  { path: '/employees', component: Blank, meta: { title: '員工管理' } },
  { path: '/salary', component: Blank, meta: { title: '薪資管理' } },
  { path: '/salary/growth-contract', component: Blank, meta: { title: '自主成長獎勵金' } },
  { path: '/workbench', redirect: '/workbench/approvals' },
  { path: '/workbench/approvals', component: Blank, meta: { title: '待簽核' } },
  { path: '/activity/pos', component: Blank, meta: { title: 'POS 收銀' } },
  {
    path: '/activity/audit/pos-unlock',
    component: Blank,
    meta: { title: 'POS 異常稽核軌跡', parent: '/activity/pos' },
  },
]

async function mountAt(path: string) {
  const router = createRouter({ history: createWebHashHistory(), routes: TEST_ROUTES })
  router.push(path)
  await router.isReady()
  return mount(AdminHeader, {
    props: { isMobile: false, sidebarOpen: false },
    global: { plugins: [router], stubs },
  })
}

describe('AdminHeader 頂列麵包屑父層', () => {
  it('子頁渲染可點父層，連結指向父層路徑', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    const link = wrapper.find('a.page-title__parent')
    expect(link.exists(), '子頁應渲染父層連結').toBe(true)
    expect(link.attributes('href')).toContain('/salary')
    expect(link.text()).toContain('薪資管理')
  })

  it('父層帶返回箭頭圖示', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    expect(wrapper.find('.page-title__back').exists()).toBe(true)
  })

  it('父層有無障礙標籤', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    expect(wrapper.find('a.page-title__parent').attributes('aria-label')).toBe('返回薪資管理')
  })

  it('頁名照常渲染', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    expect(wrapper.find('.page-title__current').text()).toBe('自主成長獎勵金')
  })

  it('一級頁不渲染父層與分隔符', async () => {
    const wrapper = await mountAt('/employees')
    expect(wrapper.find('a.page-title__parent').exists()).toBe(false)
    expect(wrapper.find('.page-title__sep').exists()).toBe(false)
    expect(wrapper.find('.page-title__current').text()).toBe('員工管理')
  })

  it('父層是 redirect 容器時不渲染（點了會被轉回原頁）', async () => {
    const wrapper = await mountAt('/workbench/approvals')
    expect(wrapper.find('a.page-title__parent').exists()).toBe(false)
  })

  it('meta.parent 明示時以它為父層', async () => {
    const wrapper = await mountAt('/activity/audit/pos-unlock')
    const link = wrapper.find('a.page-title__parent')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('POS 收銀')
    expect(link.attributes('href')).toContain('/activity/pos')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test -- src/components/layout/__tests__/AdminHeader.breadcrumb.spec.ts
```

Expected: FAIL — `a.page-title__parent` 不存在（目前是不可點的 `<span>`）

- [ ] **Step 3: 改模板**

`src/components/layout/AdminHeader.vue` 的 `:20-23`（`<h1 v-if="pageTitle" class="page-title">` 整段）替換為：

```vue
        <h1 v-if="pageTitle" class="page-title">
          <template v-if="parentLink">
            <router-link
              :to="parentLink.path"
              class="page-title__parent"
              :aria-label="`返回${parentLink.title}`"
            >
              <el-icon class="page-title__back"><ArrowLeft /></el-icon>
              <span class="page-title__parent-text">{{ parentLink.title }}</span>
            </router-link>
            <span class="page-title__sep" aria-hidden="true">/</span>
          </template>
          <span class="page-title__current">{{ pageTitle }}</span>
        </h1>
```

- [ ] **Step 4: 改 script**

把 `:179` 的 `parentTitle` computed **整行刪除**，改為：

```ts
const parentLink = computed(() =>
  resolveBreadcrumbParent(route.path, {
    parents: BREADCRUMB_PARENTS,
    // 純 redirect 容器（/workbench、/bus、/appraisal-year-end）點下去會被守衛
    // 轉走，常落回原頁 → 視為不可用父層。
    // ⚠ 不要用 matched.at(-1)：tsconfig 繼承 @vue/tsconfig/tsconfig.dom.json，
    // lib 鎖在 ES2020（刻意與 Vite build target 對齊），Array.at 是 ES2022。
    isContainer: (p) => {
      const matched = router.resolve(p).matched
      return Boolean(matched[matched.length - 1]?.redirect)
    },
    titleOf: (p) => {
      const title = router.resolve(p).meta?.title
      return typeof title === 'string' ? title : ''
    },
    metaParent: typeof route.meta?.parent === 'string' ? route.meta.parent : undefined,
  }),
)
```

import 補上（`ArrowLeft` 併入既有的 `@element-plus/icons-vue` import 行；其餘各新增一行）：

```ts
import { ArrowLeft } from '@element-plus/icons-vue'
import { BREADCRUMB_PARENTS } from '@/constants/navigation'
import { resolveBreadcrumbParent } from '@/utils/breadcrumb'
```

`route`（`:175`）與 `router`（`:176`）已存在，不要重複宣告。

- [ ] **Step 5: 改樣式**

`:318-329` 的 `.page-title__parent` 與 `.page-title > span` 兩段一併替換為：

```css
.page-title__parent {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--text-tertiary);
  font-weight: 400;
  white-space: nowrap;
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}

.page-title__parent:hover,
.page-title__parent:focus-visible {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.page-title__back {
  font-size: 0.9em;
}

.page-title__sep {
  color: var(--text-tertiary);
  font-weight: 400;
  margin: 0 4px;
  flex: 0 0 auto;
}

.page-title__current {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**注意**：舊的 `.page-title > span` 選擇器必須換成 `.page-title__current`——改結構後 `__sep` 也是直接子 span，套上 ellipsis 會讓分隔符被截斷。

在行動版 media query 內（`:477-480` 的 `.page-title { font-size: var(--text-lg); padding: 2px 4px; }` 之後）追加——窄螢幕收斂父層文字但**保留箭頭**（箭頭才是可點提示）：

```css
  .page-title__parent-text {
    display: inline-block;
    max-width: 6em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
```

- [ ] **Step 6: 跑新舊兩支測試**

```bash
npm test -- src/components/layout/__tests__/
```

Expected: PASS（新檔 7 個 case + 既有 AdminHeader.spec.ts 2 個 case 都要綠）

- [ ] **Step 7: typecheck**

```bash
npm run typecheck
```

Expected: 無錯誤。若 `route.meta.parent` 報型別錯，**先做 Task 4 Step 3 的型別宣告**再回來（兩者互為前置，順序可調換）。

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/AdminHeader.vue src/components/layout/__tests__/AdminHeader.breadcrumb.spec.ts
git commit -m "feat(nav): 頂列麵包屑父層改為可點返回連結"
```

---

### Task 4: router meta 切換

**Files:**
- Modify: `src/types/index.d.ts`（`declare module 'vue-router'` 的 `RouteMeta` 介面，`:11-37`）
- Modify: `src/router/index.ts`（18 處 `parentTitle` 移除；2 處 `parent` 新增；1 處 title 修正）
- Test: `src/router/__tests__/breadcrumbMeta.test.ts`（新檔）

**Interfaces:**
- Consumes: 無（純 meta 資料與型別異動）
- Produces: router 內 `meta.parentTitle` 宣告數 = 0；`RouteMeta.parent?: string` 型別可用

- [ ] **Step 1: 寫失敗測試**

建立 `src/router/__tests__/breadcrumbMeta.test.ts`：

```ts
/**
 * router 麵包屑 meta 凍結（spec §3.5、§7 測試 4）。
 *
 * parentTitle 是「純顯示、不可導航」的手寫字串，正是本次要根除的東西。
 * 凍結為 0 宣告，防止新頁面回頭走老路——反查漏掉的頁面應該補 meta.parent，
 * 不是補一個點不動的字串。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROUTER_SRC = readFileSync(resolve(__dirname, '../index.ts'), 'utf-8')

describe('router 麵包屑 meta', () => {
  it('防假綠哨兵：確實讀到 router 原始碼', () => {
    expect(ROUTER_SRC.length).toBeGreaterThan(10000)
    expect(ROUTER_SRC).toContain("path: '/salary/growth-contract'")
  })

  it('meta.parentTitle 已全數退場（父層一律由 manifest 反查或 meta.parent 提供）', () => {
    const hits = ROUTER_SRC.match(/parentTitle/g) ?? []
    expect(hits, 'parentTitle 仍有殘留；改以 manifest 反查或 meta.parent').toHaveLength(0)
  })

  it('manifest 涵蓋不到的深層頁以 meta.parent 明示', () => {
    expect(ROUTER_SRC).toContain("parent: '/activity/pos'")
    expect(ROUTER_SRC).toContain("parent: '/appraisal-year-end/year-end'")
  })

  it('年終結算工作區不再用手工「›」拼假麵包屑（層級改由 meta.parent 表達）', () => {
    expect(ROUTER_SRC).not.toContain('年終 › 結算工作區')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test -- src/router/__tests__/breadcrumbMeta.test.ts
```

Expected: FAIL — 目前有 18 個 `parentTitle` 命中，且存在 `'年終 › 結算工作區'`

- [ ] **Step 3: 加 RouteMeta 型別**

`src/types/index.d.ts` 的 `interface RouteMeta` 內，在 `title?: string` 之後加入：

```ts
    /** Admin: 麵包屑父層路徑（manifest 反查涵蓋不到時明示；spec §3.1 規則 2） */
    parent?: string
```

- [ ] **Step 4: 移除全部 18 處 parentTitle**

每處把 `, parentTitle: '…'` 或 `, parentTitle: MODULE_TERMS.activity` 整段刪掉，只留 `title`：

```ts
// 改前
meta: { title: '自主成長獎勵金', parentTitle: '薪資管理' }
// 改後
meta: { title: '自主成長獎勵金' }
```

三群位置（**行號會因先前編輯漂移，一律以 `grep -n parentTitle src/router/index.ts` 實際結果為準**）：

- 薪資 6 條：`/salary/settle`、`/salary/history`、`/salary/simulate`、`/salary/settings`、`/salary/recruitment-bonus`、`/salary/growth-contract`
- 才藝 9 條：`/activity/dashboard`、`/activity/registrations`、`/activity/pos`、`/activity/pos/approval`、`/activity/audit/pos-unlock`、`/activity/inquiries`、`/activity/settings`、`/activity/changes`、`/activity/attendance`
- 調查 3 條：`/surveys/new`、`/surveys/:id/edit`、`/surveys/:id`

- [ ] **Step 5: 加 meta.parent 兩處**

`/activity/audit/pos-unlock`（`name: 'POSAuditEvents'`）：

```ts
            meta: { title: PAGE_TERMS.activityPosAudit, parent: '/activity/pos' }
```

`/appraisal-year-end` 子樹內的 `year-end/cycles/:id`（單行風格，`name: 'year-end-cycle-workspace'`）——同時把手工拼的 `'年終 › 結算工作區'` 改為純頁名：

```ts
                { path: 'year-end/cycles/:id', name: 'year-end-cycle-workspace', component: () => import('../views/yearEnd/YearEndWorkspaceView.vue'), meta: { title: '結算工作區', parent: '/appraisal-year-end/year-end' } },
```

- [ ] **Step 6: 跑測試確認通過**

```bash
npm test -- src/router/__tests__/breadcrumbMeta.test.ts
```

Expected: PASS（4 個 case）

- [ ] **Step 7: 跑 router / layout / navigation 全區**

```bash
npm test -- src/router/ src/components/layout/ src/constants/navigation/
```

Expected: PASS

- [ ] **Step 8: typecheck**

```bash
npm run typecheck
```

Expected: 無錯誤

- [ ] **Step 9: Commit**

```bash
git add src/router/index.ts src/types/index.d.ts src/router/__tests__/breadcrumbMeta.test.ts
git commit -m "feat(nav): router 父層 meta 由手寫字串改為 manifest 反查"
```

---

### Task 5: 全路由完整性守衛

確保沒有任何管理端路由會渲染出「指向不存在路由」「指向容器」或「指向自己」的父層連結（spec §7 測試 5）。

**Files:**
- Test: `src/router/__tests__/breadcrumbIntegrity.test.ts`（新檔）

**Interfaces:**
- Consumes: `BREADCRUMB_PARENTS`（Task 1）、`resolveBreadcrumbParent`（Task 2）、`routes`（`@/router/index`）
- Produces: 無產出物（純守衛測試）

沿用 `manifestRouteParity.test.ts` 的手法：`import { routes }` + 自寫 `flattenRoutes`，**不 import router 實例**（避免觸發 guard 註冊與 auth 副作用）。

- [ ] **Step 1: 寫測試**

建立 `src/router/__tests__/breadcrumbIntegrity.test.ts`：

```ts
/**
 * 麵包屑父層全路由完整性守衛（spec §7 測試 5）。
 *
 * 守的是：任何管理端路由解析出的父層，都必須是「存在、非容器、非自己、有文字」
 * 的可導航目標。任何一條紅了代表 §3.1 規則對它有洞——**修法是補該路由的
 * meta.parent，不是放寬本檔斷言**。
 */
import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'

import { routes } from '@/router/index'
import { BREADCRUMB_PARENTS } from '@/constants/navigation'
import { resolveBreadcrumbParent } from '@/utils/breadcrumb'

interface FlatRoute {
  path: string
  hasComponent: boolean
  isRedirect: boolean
  title: string
  parent?: string
}

function joinPath(base: string, segment: string): string {
  if (segment.startsWith('/')) return segment
  if (segment === '') return base
  return base === '/' || base === '' ? `/${segment}` : `${base}/${segment}`
}

function flattenRoutes(records: readonly RouteRecordRaw[], base = ''): FlatRoute[] {
  const out: FlatRoute[] = []
  for (const record of records) {
    const full = joinPath(base, record.path)
    const title = typeof record.meta?.title === 'string' ? record.meta.title : ''
    const parent = typeof record.meta?.parent === 'string' ? record.meta.parent : undefined
    out.push({
      path: full,
      hasComponent: record.component !== undefined,
      isRedirect: record.redirect !== undefined,
      title,
      ...(parent ? { parent } : {}),
    })
    if (record.children) out.push(...flattenRoutes(record.children, full))
  }
  return out
}

const ALL = flattenRoutes(routes)
const byPath = new Map(ALL.map((r) => [r.path, r]))

const isContainer = (p: string) => byPath.get(p)?.isRedirect === true
const titleOf = (p: string) => byPath.get(p)?.title ?? ''

/** 管理端實頁：有 component、非 portal/public/kiosk、非動態參數、非錯誤頁。 */
const ADMIN_PAGES = ALL.filter(
  (r) =>
    r.hasComponent &&
    !r.path.startsWith('/portal') &&
    !r.path.startsWith('/public') &&
    !r.path.startsWith('/kiosk') &&
    !r.path.includes(':') &&
    !['/login', '/maintenance', '/error', '/change-password'].includes(r.path),
)

const resolveFor = (r: FlatRoute) =>
  resolveBreadcrumbParent(r.path, {
    parents: BREADCRUMB_PARENTS,
    isContainer,
    titleOf,
    ...(r.parent ? { metaParent: r.parent } : {}),
  })

describe('麵包屑父層完整性守衛', () => {
  it('防假綠哨兵：確實掃到足量管理端實頁', () => {
    expect(ADMIN_PAGES.length).toBeGreaterThan(40)
    const paths = ADMIN_PAGES.map((r) => r.path)
    expect(paths).toContain('/salary/growth-contract')
    expect(paths).toContain('/employees')
    expect(paths).not.toContain('/portal/home')
  })

  it('每個解析出的父層都存在、非容器、非自己、有顯示文字', () => {
    const offenders: string[] = []
    for (const r of ADMIN_PAGES) {
      const parent = resolveFor(r)
      if (parent === null) continue
      if (!byPath.has(parent.path)) offenders.push(`${r.path} → 父層 ${parent.path} 不存在於 router`)
      if (isContainer(parent.path)) offenders.push(`${r.path} → 父層 ${parent.path} 是 redirect 容器`)
      if (parent.path === r.path) offenders.push(`${r.path} → 父層等於自己（點了沒反應）`)
      if (parent.title.trim().length === 0) offenders.push(`${r.path} → 父層顯示文字為空`)
    }
    expect(
      offenders,
      '父層解析出不可用目標。修法：補該路由的 meta.parent 指向實質頁面，不要放寬本斷言。',
    ).toEqual([])
  })

  it('反查確實生效：至少 15 條管理端頁面取得父層', () => {
    const withParent = ADMIN_PAGES.filter((r) => resolveFor(r) !== null)
    expect(withParent.length).toBeGreaterThanOrEqual(15)
  })

  it('代表性路徑的父層符合設計（spec §3.3 邊界表）', () => {
    // 取不到就 throw，讓「路由被改名」這種前提失效大聲失敗，
    // 而不是靜默變成 undefined 後假綠。
    const pageAt = (p: string): FlatRoute => {
      const r = byPath.get(p)
      if (!r) throw new Error(`測試前提失效：router 中找不到 ${p}`)
      return r
    }
    expect(resolveFor(pageAt('/salary/growth-contract'))?.title).toBe('薪資管理')
    expect(resolveFor(pageAt('/salary/history'))?.title).toBe('薪資管理')
    expect(resolveFor(pageAt('/surveys/new'))?.title).toBe('調查管理')
    expect(resolveFor(pageAt('/employees'))).toBeNull()
    expect(resolveFor(pageAt('/activity/dashboard'))).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試**

```bash
npm test -- src/router/__tests__/breadcrumbIntegrity.test.ts
```

Expected: PASS。**若某條路由紅了，回頭補該路由的 `meta.parent`——這正是本守衛的用途，不要放寬斷言。**

- [ ] **Step 3: Commit**

```bash
git add src/router/__tests__/breadcrumbIntegrity.test.ts
git commit -m "test(nav): 麵包屑父層全路由完整性守衛"
```

---

## 階段二：補齊死巷與孤兒頁

### Task 6: 孤兒頁父層

階段一已自動解除 `/salary/history`、`/salary/simulate`、`/salary/settings`、`/surveys/:id` 四條死巷（各自反查到父層）。本 task 處理 manifest 反查涵蓋不到的 4 條——它們的 path 用連字號（`/student-attendance`）而非 `/students/…`，前綴反查照設計不會命中。

**Files:**
- Modify: `src/router/index.ts`（`/student-attendance`、`/student-leaves`、`/student-assessments`、`/student-incidents` 四條路由的 meta）
- Test: `src/router/__tests__/breadcrumbMeta.test.ts`（Task 4 建立，追加 case）

**Interfaces:**
- Consumes: Task 2 的規則 2（`meta.parent`）、Task 4 的 `RouteMeta.parent` 型別
- Produces: 四條學生相關孤兒路由取得父層 `/students`

- [ ] **Step 1: 追加失敗測試**

在 `src/router/__tests__/breadcrumbMeta.test.ts` 的 `describe('router 麵包屑 meta')` 內追加：

```ts
  it('學生相關孤兒頁以 meta.parent 指回學生列表', () => {
    const offenders: string[] = []
    for (const path of [
      '/student-attendance',
      '/student-leaves',
      '/student-assessments',
      '/student-incidents',
    ]) {
      const start = ROUTER_SRC.indexOf(`path: '${path}'`)
      if (start < 0) {
        offenders.push(`${path} 不存在於 router`)
        continue
      }
      const metaStart = ROUTER_SRC.indexOf('meta:', start)
      const metaEnd = ROUTER_SRC.indexOf('}', metaStart)
      const metaBlock = ROUTER_SRC.slice(metaStart, metaEnd)
      if (!metaBlock.includes("parent: '/students'")) offenders.push(`${path} 缺 meta.parent`)
    }
    expect(offenders, '孤兒頁沒有回頭路；補 meta.parent').toEqual([])
  })
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npm test -- src/router/__tests__/breadcrumbMeta.test.ts -t '孤兒頁'
```

Expected: FAIL — 四條都缺 `meta.parent`

- [ ] **Step 3: 補 meta.parent**

四條路由的 meta 各加 `parent: '/students'`（`component` 路徑照現況、不要動）：

```ts
        {
            path: '/student-attendance',
            name: 'student-attendance',
            component: () => import('../views/StudentAttendanceView.vue'),
            meta: { title: '學生出席紀錄', parent: '/students' }
        },
        {
            path: '/student-leaves',
            name: 'student-leaves',
            component: () => import('../views/StudentLeavesListView.vue'),
            meta: { title: '學生請假紀錄', parent: '/students' }
        },
        {
            path: '/student-assessments',
            name: 'student-assessments',
            component: () => import('../views/StudentAssessmentView.vue'),
            meta: { title: PAGE_TERMS.studentAssessments, parent: '/students' }
        },
        {
            path: '/student-incidents',
            name: 'student-incidents',
            component: () => import('../views/StudentIncidentView.vue'),
            meta: { title: '學生事件紀錄', parent: '/students' }
        },
```

**⚠ 注意**：`/portal` 子樹內另有一條 `path: 'student-attendance'`（`name: 'portal-student-attendance'`），**不要改到那條**——教師端不在本次範圍。

- [ ] **Step 4: 跑測試確認通過**

```bash
npm test -- src/router/__tests__/
```

Expected: PASS（含 Task 5 的完整性守衛，此時 `withParent` 數量會增加 4）

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/router/__tests__/breadcrumbMeta.test.ts
git commit -m "feat(nav): 學生相關孤兒頁補上父層返回路徑"
```

---

## 階段三：收斂既有自刻返回鍵

原則：**頂列麵包屑成為管理端唯一的「回上一層」機制**。與其功能重複的頁內返回鍵移除；語意不同者（表單取消、wizard 上一步、流程結果頁 CTA）保留但統一文案。

### Task 7: 移除三處與麵包屑重複的返回鍵

三處的返回目標與階段一產生的麵包屑父層完全相同，留著就是同一動作兩個入口、位置還各不相同（左上／右上／右上）。

**Files:**
- Modify: `src/views/EmployeeDetailView.vue`（handler `:133-136`、按鈕 `:163-165`、樣式 `:271`）
- Modify: `src/views/platform/PlatformTenantDetailView.vue`（按鈕 `:10`）
- Modify: `src/views/salary/SalarySettleView.vue`（按鈕 `:11`）
- Test: 既有 `PlatformTenantDetailView` 測試（引用了 `data-testid="back-to-list"`，需同步更新）

**Interfaces:**
- Consumes: Task 3 的麵包屑（`/employees/:id` → 「‹ 員工管理」；`/platform/tenants/:id` → 「‹ 分校管理」；`/salary/settle` → 「‹ 薪資管理」）
- Produces: 三支檔案不再有頁面級返回鍵

- [ ] **Step 1: 先找出引用 back-to-list 的測試**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/breadcrumb-back
grep -rn "back-to-list" src/ --include=*.ts --include=*.vue
```

把命中的測試檔記下來，Step 5 要一起改。

- [ ] **Step 2: EmployeeDetailView.vue**

刪除 `:163-165` 的按鈕：

```vue
    <el-button link class="back-btn" @click="goBack">
      <el-icon><ArrowLeft /></el-icon> 返回員工列表
    </el-button>
```

刪除 `:133-136` 的 handler：

```ts
const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/employees')
}
```

刪除 `:271` 的樣式 `.back-btn { margin-bottom: 12px; }`。

清理 import：`ArrowLeft` 若在本檔已無其他用途則自 `:6` 的 `import { ArrowLeft, User } from '@element-plus/icons-vue'` 移除（改為 `import { User } from '@element-plus/icons-vue'`）；`router` 若在本檔已無其他用途則連同 `useRouter` import 一併移除。**移除前先 grep 確認**：

```bash
grep -n "ArrowLeft\|router\." src/views/EmployeeDetailView.vue
```

- [ ] **Step 3: PlatformTenantDetailView.vue**

刪除 `:10` 整行：

```vue
        <el-button data-testid="back-to-list" @click="router.push('/platform/tenants')">回清單</el-button>
```

同樣 grep 確認 `router` 是否還有其他用途（本檔 `:57` 有 `const router = useRouter()`，若已無用途一併移除）。

- [ ] **Step 4: SalarySettleView.vue**

刪除 `:11` 整行：

```vue
        <el-button @click="$router.push('/salary')">← 回工作台</el-button>
```

（本檔模板用的是 `$router`，script 內的 `router`（`:53`）另有用途，**不要動 script**。）

- [ ] **Step 5: 更新受影響的測試**

把 Step 1 找到的、斷言 `back-to-list` 存在的 case 改為斷言**不存在**，並在該處加註解說明返回已上移至頂列麵包屑。例如：

```ts
  it('返回入口已上移至頂列麵包屑，頁內不再重複放返回鍵', () => {
    expect(wrapper.find('[data-testid="back-to-list"]').exists()).toBe(false)
  })
```

- [ ] **Step 6: 跑相關測試**

```bash
npm test -- src/views/platform/ src/views/salary/ src/views/__tests__/
```

Expected: PASS

- [ ] **Step 7: typecheck**

```bash
npm run typecheck
```

Expected: 無錯誤（特別是 import 清理後不得留下未使用變數——`noUnusedLocals: true` 會擋）

- [ ] **Step 8: Commit**

```bash
git add src/views/EmployeeDetailView.vue src/views/platform/PlatformTenantDetailView.vue src/views/salary/SalarySettleView.vue
git commit -m "refactor(nav): 移除與麵包屑重複的三處頁內返回鍵"
```

---

### Task 8: 學生檔案頁返回收斂

`StudentDetailPanel` 有三個返回入口：頁內 breadcrumb、「返回」鍵、以及 `StudentSummaryHeader` 下拉裡的「回到學生列表」。前兩者與頂列麵包屑重複；下拉那個位置不對（返回不該藏在「⋯」選單）。

**保留一個例外**：`fromContext === 'classroom'` 時的 `router.replace('/classrooms', { selected })` 是「回到來源班級並保留選取」的帶狀態動線，麵包屑的固定父層表達不了，改為只在該情境渲染。

**Files:**
- Modify: `src/components/student/StudentDetailPanel.vue`（handler `:297-304`、breadcrumb computed `:306-321`、template `:326-338`、樣式 `:461-472`、`handleGotoLink` `:258-270`）
- Modify: `src/components/student/StudentSummaryHeader.vue`（下拉項 `:310`）

**Interfaces:**
- Consumes: Task 3 的麵包屑（`/students/profile/:id` → 「‹ 學生」）
- Produces: `handleBack` 只保留 classroom 分支；`breadcrumbItems` computed 移除；`goto-link` 的 `'students'` command 移除

- [ ] **Step 1: 改 handler**

`:297-304` 替換為：

```ts
// 回到來源班級（帶回選取狀態）。一般返回走頂列麵包屑「‹ 學生」，
// 只有從班級名冊點進來時才需要這條帶狀態的路徑。
const showBackToClassroom = computed(
  () => props.mode === 'page' && props.fromContext === 'classroom' && Boolean(props.fromClassroomId),
)
const handleBackToClassroom = () => {
  router.replace({ path: '/classrooms', query: { selected: props.fromClassroomId } })
}
```

- [ ] **Step 2: 刪除 breadcrumbItems computed**

`:306-321` 的 `const breadcrumbItems = computed(() => { ... })` 整段刪除。連帶檢查 `PAGE_TERMS` import（`:10`）是否還有其他用途，無則移除。

- [ ] **Step 3: 改 template**

`:326-338` 的整個 `<div v-if="mode === 'page'" class="page-header">` 區塊替換為：

```vue
    <!-- 從班級名冊進來時，提供帶回選取狀態的返回；一般返回走頂列麵包屑 -->
    <div v-if="showBackToClassroom" class="page-header">
      <el-button text :icon="ArrowLeft" class="back-btn" @click="handleBackToClassroom">
        回班級名冊
      </el-button>
    </div>
```

樣式 `:461-472`：保留 `.page-header` 與 `.back-btn`，刪除 `.breadcrumb` 那條（已無元素使用）。

- [ ] **Step 4: 移除下拉中的返回項**

`src/components/student/StudentSummaryHeader.vue` `:310` 刪除整行：

```vue
              <el-dropdown-item v-else command="students">回到學生列表</el-dropdown-item>
```

刪除後該 `<el-dropdown-item v-if="context === 'students'" ...>`（`:309`）的 `v-if`/`v-else` 配對會斷開——把 `:309` 的 `v-if` 保持原樣即可（單獨 `v-if` 合法）。

對應地，`StudentDetailPanel.vue` `:258-270` 的 `handleGotoLink` 移除 `'students'` 分支：

```ts
const handleGotoLink = (cmd: string) => {
  if (cmd === 'edit') {
    openEditDialog()
  } else if (cmd === 'attendance') {
    router.push('/student-attendance')
  } else if (cmd === 'fees') {
    router.push('/fees')
  } else if (cmd === 'classrooms') {
    router.push('/classrooms')
  }
}
```

- [ ] **Step 5: 跑相關測試**

```bash
npm test -- src/components/student/
```

Expected: PASS。若有測試斷言「返回」鍵或 breadcrumb 存在，改為斷言 `showBackToClassroom` 情境下才有（並補一個非 classroom 情境不渲染的 case）。

- [ ] **Step 6: typecheck**

```bash
npm run typecheck
```

Expected: 無錯誤

- [ ] **Step 7: Commit**

```bash
git add src/components/student/StudentDetailPanel.vue src/components/student/StudentSummaryHeader.vue
git commit -m "refactor(nav): 學生檔案頁返回收斂為單一入口"
```

---

### Task 9: 移除考核年終頁內麵包屑

`AppraisalYearEndLayout.vue` 的 `el-breadcrumb` 所有項目都沒帶 `:to`（全不可點），根層還硬寫「考核與年終」與側邊欄高亮重複。它支援的 `meta.breadcrumb` / `meta.breadcrumbExtra` 在 production 宣告端為 0，是 dead code。模組內 6 段 `el-segmented` 橫向導覽保留不動。

**Files:**
- Modify: `src/views/appraisalYearEnd/AppraisalYearEndLayout.vue`（breadcrumb computed `:40-53`、template `:66-68`、樣式 `:79`）
- Test: `src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`（109 行，含 breadcrumb 相關 case 需移除）

**Interfaces:**
- Consumes: 無
- Produces: 該 layout 不再渲染 `.aye-breadcrumb`

- [ ] **Step 1: 先確認測試中哪些 case 會受影響**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/breadcrumb-back
grep -n "breadcrumb\|crumb" src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts
```

- [ ] **Step 2: 刪除 breadcrumb computed**

`:40-53` 整段刪除（`:40-42` 三行註解 + `:43` `const crumbs = computed(() => {` 到 `:53` `})`）。

**⚠ `useRoute` import 不可一併刪**——`route` 仍被 `activeKey`（`:31-32`）使用。

- [ ] **Step 3: 刪除 template 的 breadcrumb**

`:66-68` 三行刪除：

```vue
    <el-breadcrumb v-if="crumbs.length > 1" class="aye-breadcrumb" separator="›">
      <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i">{{ c }}</el-breadcrumb-item>
    </el-breadcrumb>
```

- [ ] **Step 4: 刪除樣式**

`:79` 的 `.aye-breadcrumb { margin-bottom: var(--space-4); }` 刪除。刪後 `.aye-nav` 的 `margin-bottom: var(--space-3)` 成為唯一垂直間距——這是預期的（少了一列元素，間距自然收緊）。

- [ ] **Step 5: 移除測試中的 breadcrumb case**

把 Step 1 找到的 breadcrumb 相關 case 刪除，並補一個防復活的斷言：

```ts
  it('頁內不再渲染麵包屑（層級由頂列麵包屑與 segmented 表達）', async () => {
    const wrapper = mount(AppraisalYearEndLayout, { global: { plugins: [router, ElementPlus] } })
    await flushPromises()
    expect(wrapper.find('.aye-breadcrumb').exists()).toBe(false)
  })
```

（`mount` 的 `global` 設定照該檔既有 case 抄，不要自創。）

- [ ] **Step 6: 跑測試**

```bash
npm test -- src/views/appraisalYearEnd/
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/views/appraisalYearEnd/AppraisalYearEndLayout.vue src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts
git commit -m "refactor(nav): 移除考核年終頁內不可點麵包屑"
```

---

### Task 10: 保留型返回鍵的文案與行為統一

兩處**保留**的返回鍵：`StepExport` 的流程完成 CTA（不是返回鍵，是結果頁主要動作）、`SurveyFormView` 的表單取消（語意與返回不同）。統一文案，並修掉取消鍵的兩個實際缺陷：`router.back()` 無空堆疊防護、編輯中直接丟棄輸入無確認。

**Files:**
- Modify: `src/views/salary/settle/StepExport.vue`（`:44`）
- Modify: `src/views/surveys/SurveyFormView.vue`（取消鍵 `:72`、新增 baseline 快照與確認）
- Test: `src/views/surveys/__tests__/`（若無對應測試檔則新建 `SurveyFormView.cancel.spec.ts`）

**Interfaces:**
- Consumes: `SurveyDraft`、`emptyDraft`（`./surveyFormModel`）
- Produces: `SurveyFormView` 匯出行為不變；新增內部 `baseline` ref 與 `onCancel` 函式

- [ ] **Step 1: StepExport 文案**

`:44` 的按鈕文案由「回工作台」改為「回薪資管理」（與麵包屑父層字面一致，使用者才知道會去哪）：

```vue
        <el-button type="primary" @click="$router.push('/salary')">回薪資管理</el-button>
```

- [ ] **Step 2: 寫 SurveyFormView 取消行為的失敗測試**

建立 `src/views/surveys/__tests__/SurveyFormView.cancel.spec.ts`（若既有測試檔已涵蓋此元件，改為在該檔追加同名 describe）：

```ts
/**
 * 調查表單「取消」行為（spec §6 #7）。
 *
 * 兩個實際缺陷：① router.back() 在直接開連結進來時無處可回
 * ② 編輯中按取消直接丟棄輸入、無任何確認。
 */
import { describe, expect, it, vi } from 'vitest'
import { isDraftDirty } from '../surveyFormModel'
import { emptyDraft } from '../surveyFormModel'

describe('isDraftDirty', () => {
  it('未改動時為 false', () => {
    const base = emptyDraft()
    expect(isDraftDirty(base, emptyDraft())).toBe(false)
  })

  it('改標題後為 true', () => {
    const base = emptyDraft()
    const draft = { ...emptyDraft(), title: '春季親子日' }
    expect(isDraftDirty(base, draft)).toBe(true)
  })

  it('陣列內容改動也偵測得到（非淺比較）', () => {
    const base = { ...emptyDraft(), classroom_ids: [1, 2] }
    const draft = { ...emptyDraft(), classroom_ids: [1, 3] }
    expect(isDraftDirty(base, draft)).toBe(true)
  })

  it('陣列長度改變偵測得到', () => {
    const base = { ...emptyDraft(), classroom_ids: [1] }
    const draft = { ...emptyDraft(), classroom_ids: [1, 2] }
    expect(isDraftDirty(base, draft)).toBe(true)
  })
})
```

**刻意不用 `questions` 當測試資料**：`QuestionDraft` 的精確欄位結構不在本計畫的既知範圍，硬造會需要 `as never` 之類的型別逃逸（違反 Global Constraints）。`classroom_ids: number[]` 同樣是陣列，足以驗證「非淺比較」這個關鍵性質。
```

- [ ] **Step 3: 跑測試確認失敗**

```bash
npm test -- src/views/surveys/__tests__/SurveyFormView.cancel.spec.ts
```

Expected: FAIL — `isDraftDirty` 未匯出

- [ ] **Step 4: 在 surveyFormModel.ts 加 isDraftDirty**

`src/views/surveys/surveyFormModel.ts` 加入（放在 `emptyDraft` 之後）：

```ts
/**
 * 草稿是否有未儲存變更。題目為巢狀結構，用序列化整體比對而非淺比較——
 * 淺比較會漏掉「只改了某題標題」這種最常見的編輯。
 */
export function isDraftDirty(baseline: SurveyDraft, current: SurveyDraft): boolean {
  return JSON.stringify(baseline) !== JSON.stringify(current)
}
```

- [ ] **Step 5: 跑測試確認通過**

```bash
npm test -- src/views/surveys/__tests__/SurveyFormView.cancel.spec.ts
```

Expected: PASS（4 個 case）

- [ ] **Step 6: 接上 SurveyFormView**

在 `src/views/surveys/SurveyFormView.vue` 的 script：

import 追加 `ElMessageBox`（既有 `:80` 已 import `ElMessage`，改為 `import { ElMessage, ElMessageBox } from 'element-plus'`）與 `isDraftDirty`（併入既有的 `./surveyFormModel` import 清單）。

在 `const draft = ref<SurveyDraft>(emptyDraft())` 之後加入 baseline：

```ts
// 取消時比對用的基準快照：新建模式即空草稿，編輯模式於 loadSurvey() 載入後覆寫。
const baseline = ref<SurveyDraft>(emptyDraft())
```

在 `loadSurvey()` 內、`draft.value = ...` 整包覆寫之後加入：

```ts
  baseline.value = JSON.parse(JSON.stringify(draft.value)) as SurveyDraft
```

新增取消 handler（放在 `onSubmit` 附近）：

```ts
const onCancel = async () => {
  if (isDraftDirty(baseline.value, draft.value)) {
    try {
      await ElMessageBox.confirm('尚未儲存的變更將會遺失，確定離開？', '放棄編輯', {
        confirmButtonText: '放棄變更',
        cancelButtonText: '繼續編輯',
        type: 'warning',
      })
    } catch {
      return // 使用者選擇繼續編輯
    }
  }
  // 固定回調查列表：router.back() 在直接開連結進來時無處可回。
  router.push({ name: 'surveys' })
}
```

模板 `:72` 改為：

```vue
        <el-button @click="onCancel">取消</el-button>
```

- [ ] **Step 7: 跑 surveys 全區測試**

```bash
npm test -- src/views/surveys/
```

Expected: PASS

- [ ] **Step 8: typecheck**

```bash
npm run typecheck
```

Expected: 無錯誤

- [ ] **Step 9: Commit**

```bash
git add src/views/salary/settle/StepExport.vue src/views/surveys/SurveyFormView.vue src/views/surveys/surveyFormModel.ts src/views/surveys/__tests__/SurveyFormView.cancel.spec.ts
git commit -m "fix(surveys): 取消鍵改固定目標並補未儲存變更確認"
```

---

## 收尾驗證

- [ ] **全套測試**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/breadcrumb-back
npm test 2>&1 | tee /tmp/breadcrumb-tests.log
grep -E "Tests|Test Files" /tmp/breadcrumb-tests.log
```

**注意**：`tee` 保留 exit code（`| tail` 不會），但仍以 grep 出的摘要行為準，不要用 exit code 判定。

Expected: 與動工前的基準相同或更好。動工前先在乾淨的 `origin/staging` 記下基準數字，**判定「既有紅燈」必須跟基準比對，不能看絕對數字**。

- [ ] **typecheck 與 lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **build**（麵包屑動到 layout 元件，確認 chunk 切分未受影響）

```bash
npm run build
```

- [ ] **人工驗證清單**（`npm run dev` 後逐項點）

| 路徑 | 預期 |
|---|---|
| `/salary/growth-contract` | 頂列「‹ 薪資管理 / 自主成長獎勵金」，點父層到 `/salary` |
| `/salary/history` | 同上模式（原本無任何返回） |
| `/employees/1` | 「‹ 員工管理 / 員工詳情」，頁內不再有「返回員工列表」 |
| `/students/profile/1`（從學生列表進） | 「‹ 學生 / 學生檔案」，頁內無返回鍵 |
| `/students/profile/1`（從班級名冊進） | 同上 + 頁內「回班級名冊」（帶回選取） |
| `/surveys/new` | 「‹ 調查管理 / 建立調查」；改標題後按「取消」跳確認 |
| `/activity/dashboard` | 只有頁名，無父層（一級頁） |
| `/workbench/approvals` | 無父層（容器撤銷），tabs 照常 |
| `/appraisal-year-end/overview` | 無父層，頁內麵包屑已消失，segmented 照常 |
| 窄螢幕（<768px）任一子頁 | 箭頭保留、父層文字省略號收斂、不擠壓頁名 |

---

## 交付邊界

**本計畫不做**（spec §8 已列，加上實作期新增的一項）：

1. 教師端 Portal 與家長端 Parent 的返回收斂（Portal 7 條真死巷、Parent 2 條）。
2. 孤兒路由的「入口」缺失——`/student-leaves`、`/student-assessments`、`/student-incidents` 全 repo 無任何 in-app 入口。本計畫只補出口。
3. 頂列標題與頁內 `PageHeader` 標題重複（48 支檔案受影響）。
4. 側邊欄高亮缺失（8 條路由零高亮）。
5. **`KioskPunchView` 文案統一（spec §6 #12，實作期裁定不做）**：實測後發現三項與 spec 假設不符——① 實際路徑是 `src/views/kiosk/`（非 `views/attendance/`）② 是三處按鈕（非兩處）③ 該頁 `meta.bare: true`，App.vue 直接 RouterView 不套 AdminLayout，**沒有頂列可承載麵包屑**，且三處按鈕都是 `reset()` 的**狀態機回退**而非路由返回，pin/confirm 階段叫「取消」語意本就正確。收益極低而動到打卡 critical path 的既有測試，故不處理。
