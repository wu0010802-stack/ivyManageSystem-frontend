# 考核與年終 V2 Phase 1 — Batch 3：考核工作區正式接線（路由切換）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Batch 2 建好但尚未接線的 `AppraisalWorkspaceView.vue` 正式掛上 `/appraisal-year-end/appraisal` 路由，取代舊的 `appraisal/current`＋`appraisal/history`＋`AppraisalManagementView.vue` tab 殼；同步修正 7 個既有引用點的連結目標；`appraisal/calibration`／`appraisal/institution-events`／`appraisal/disciplinary` 三條路由**保持不變、不動**（校準頁尚未併入工作區內容，現在切斷它是真的功能倒退，留待未來 fidelity 批次）。

**Architecture:** 新路由結構：`appraisal`（leaf，掛 `AppraisalWorkspaceView.vue`，內部用 `?cycle=&stage=` 管理狀態）＋`appraisal/institution-events`／`appraisal/disciplinary`／`appraisal/calibration`（三條 sibling leaf，原樣保留，只是從「`appraisal` 的 children」拉平成「`/appraisal-year-end` 的 children」，URL 完全不變）。舊 `appraisal/current`／`appraisal/history` 改為 `redirect`（保留查詢字串語意：`history` 帶的 `cycle`/`view` 轉存到新路由並補上 `stage=sign`）。6 個「連結目標寫死舊路徑」的檔案改指新路徑；其中 2 個帶 `cycle`/`view` query 的連結（`WorkbenchAppraisalCard.vue`、`nextStep.ts`）要補上 `stage=sign`。`CycleDetailPanel.vue` 的 `view` query 讀寫邏輯全程用自己的 `useRoute()/useRouter()`，不吃 props，本批次確認過（無論巢狀在哪個元件底下，`useRoute()` 拿到的都是全域當前 route）不需額外轉接，故 `CycleDetailPanel.vue` 本身**不修改**。

**Tech Stack:** Vue 3、Vue Router 4、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/ux-spec.md` §1.1-1.2（IA 對照表、redirect 清單）；Batch 2 計畫（`2026-08-16-appraisal-yearend-v2-phase1-batch2.md`，本批次的前置積木）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫、權限判斷語意。
- **`appraisal/calibration`／`appraisal/institution-events`／`appraisal/disciplinary` 三條路由的 URL、掛載元件、行為必須逐字不變**——只能改變它們在 `router/index.ts` 陣列中的巢狀層級（從 `appraisal` 的 children 拉平成 sibling），不能改 path 字串本身。
- `CycleDetailPanel.vue`、`CurrentSemesterOverview.vue`（除 Task 1 指定的那一行）、`AppraisalCycleExceptionsSummary.vue`、`workspaceSteps.ts` 皆不得修改（Batch 2 產物，已審查通過）。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`（Batch 2 驗證過此法可在本機取得乾淨結果，不要再把 OOM 當環境限制放行）。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: 批次修正 6 個連結目標（同類型小改動，一次派工）

**Files（全部只改 1-2 行，皆為既有檔案）：**
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue:521`
- Modify: `src/views/yearEnd/AppraisalPayoutView.vue:268`
- Modify: `src/views/appraisalYearEnd/RulesSettingsLayout.vue:82`
- Modify: `src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue`（`to="/appraisal-year-end/appraisal/history?cycle=${cycle.id}&view=kanban"` 那一行，實際行號請先 grep 確認，plan 撰寫時讀到的是模板渲染輸出行號非原始檔行號）
- Modify: `src/views/appraisalYearEnd/nextStep.ts:88`
- Modify: `src/views/appraisalYearEnd/AppraisalYearEndLayout.vue:17`
- Modify test: `src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js`（約 1075-1088 行附近，`it('已同步時點 sign 引導步驟...')` 區塊）
- Modify test: `src/views/appraisalYearEnd/__tests__/RulesSettingsLayout.spec.ts:148`

**逐項精確改動（old → new，皆為單行字串取代，用 grep 定位後 Edit）：**

1. `CurrentSemesterOverview.vue:521`
   ```ts
   router.push('/appraisal-year-end/appraisal/history')
   ```
   →
   ```ts
   router.push('/appraisal-year-end/appraisal?stage=sign')
   ```

2. `AppraisalPayoutView.vue:268`
   ```vue
   <router-link :to="{ path: '/appraisal-year-end/appraisal/history' }">
   ```
   →
   ```vue
   <router-link :to="{ path: '/appraisal-year-end/appraisal', query: { stage: 'sign' } }">
   ```

3. `RulesSettingsLayout.vue:82`
   ```vue
   <router-link to="/appraisal-year-end/appraisal/current" class="rules-open-cycle-alert__link">
   ```
   →
   ```vue
   <router-link to="/appraisal-year-end/appraisal" class="rules-open-cycle-alert__link">
   ```

4. `WorkbenchAppraisalCard.vue`（找 `` `/appraisal-year-end/appraisal/history?cycle=${cycle.id}&view=kanban` `` 這個模板字串）
   ```vue
   <router-link class="wb-card__cta" :to="`/appraisal-year-end/appraisal/history?cycle=${cycle.id}&view=kanban`">前往簽核 →</router-link>
   ```
   →
   ```vue
   <router-link class="wb-card__cta" :to="`/appraisal-year-end/appraisal?cycle=${cycle.id}&stage=sign&view=kanban`">前往簽核 →</router-link>
   ```

5. `nextStep.ts:88`
   ```ts
   to: `/appraisal-year-end/appraisal/history?cycle=${appraisalCycle.id}&view=kanban`,
   ```
   →
   ```ts
   to: `/appraisal-year-end/appraisal?cycle=${appraisalCycle.id}&stage=sign&view=kanban`,
   ```

6. `AppraisalYearEndLayout.vue:17`
   ```ts
   { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal/current', can: () => hasPermission('APPRAISAL_READ') },
   ```
   →
   ```ts
   { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal', can: () => hasPermission('APPRAISAL_READ') },
   ```

7. `CurrentSemesterOverview.spec.js`（找 `guidePushMock).toHaveBeenCalledWith('/appraisal-year-end/appraisal/history')`）
   ```js
   it('已同步時點 sign 引導步驟，導向 /appraisal-year-end/appraisal/history', async () => {
     ...
     expect(guidePushMock).toHaveBeenCalledWith('/appraisal-year-end/appraisal/history')
   })
   ```
   →（test 標題與斷言字串一併改）
   ```js
   it('已同步時點 sign 引導步驟，導向 /appraisal-year-end/appraisal?stage=sign', async () => {
     ...
     expect(guidePushMock).toHaveBeenCalledWith('/appraisal-year-end/appraisal?stage=sign')
   })
   ```

8. `RulesSettingsLayout.spec.ts:148`
   ```ts
   expect(link.attributes('href')).toBe('/appraisal-year-end/appraisal/current')
   ```
   →
   ```ts
   expect(link.attributes('href')).toBe('/appraisal-year-end/appraisal')
   ```

**Interfaces：** 無新符號產出；純字串取代，不影響任何函式簽名。

- [ ] **Step 1: 對每個檔案先確認 grep 命中且唯一**

```bash
grep -n "appraisal-year-end/appraisal/history\|appraisal-year-end/appraisal/current" \
  src/views/appraisal/CurrentSemesterOverview.vue \
  src/views/yearEnd/AppraisalPayoutView.vue \
  src/views/appraisalYearEnd/RulesSettingsLayout.vue \
  src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue \
  src/views/appraisalYearEnd/nextStep.ts \
  src/views/appraisalYearEnd/AppraisalYearEndLayout.vue \
  src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js \
  src/views/appraisalYearEnd/__tests__/RulesSettingsLayout.spec.ts
```

每個檔案應恰好命中你要改的那一處（若某檔案命中多處，先讀該檔案完整上下文確認是否都要改，本 plan 只交代了每個檔案唯一一處已知的舊路徑引用；若發現額外命中且不在上述 8 項清單內，暫停回報，不要自行臆測是否要改）。

- [ ] **Step 2: 依上面 1-8 項逐一 Edit**

- [ ] **Step 3: 跑相關測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js src/views/appraisalYearEnd/__tests__/RulesSettingsLayout.spec.ts`
Expected: PASS（含你改動的兩個斷言）

- [ ] **Step 4: 跑更廣範圍確認無其他斷言撞到舊字串**

Run: `npm run test -- --run src/views/appraisal src/views/appraisalYearEnd`
Expected: PASS。若有紅燈且斷言內容是舊路徑字串，代表 Step 1 的 grep 沒抓全，回頭處理；若紅燈與路徑字串無關（既有債），比照既有慣例（`git stash`/切到 base commit 跑同測試定責）記錄不動。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/CurrentSemesterOverview.vue src/views/yearEnd/AppraisalPayoutView.vue src/views/appraisalYearEnd/RulesSettingsLayout.vue src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue src/views/appraisalYearEnd/nextStep.ts src/views/appraisalYearEnd/AppraisalYearEndLayout.vue
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/CurrentSemesterOverview.vue src/views/yearEnd/AppraisalPayoutView.vue src/views/appraisalYearEnd/RulesSettingsLayout.vue src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue src/views/appraisalYearEnd/nextStep.ts src/views/appraisalYearEnd/AppraisalYearEndLayout.vue src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js src/views/appraisalYearEnd/__tests__/RulesSettingsLayout.spec.ts
git commit -m "refactor(appraisal): 6 處連結目標改指新工作區路由（尚未切換路由本身）

/appraisal-year-end/appraisal/history 與 /current 的寫死連結全部改指
/appraisal-year-end/appraisal（帶 stage/cycle/view query）；Task 2 才會
真正把路由切過去，此 commit 先行不會造成任何行為差異（目標路徑此刻仍是
舊的 tab 殼，query 會被忽略但不報錯）（V2 IA Phase 1 Batch 3）。"
```

---

### Task 2: 路由正式切換（掛載 AppraisalWorkspaceView，退場 AppraisalManagementView）

**Files:**
- Modify: `src/router/index.ts`（`resolveLegacySectionQuery` 函式 + `appraisal` 巢狀路由定義區塊）
- Delete: `src/views/AppraisalManagementView.vue`
- Delete: `src/views/__tests__/AppraisalManagementView.spec.ts`
- Modify: `src/router/__tests__/appraisalYearEndRedirects.spec.ts`（`CASES` 陣列，`appraisal` 相關 6 條案例）

**⚠ 前置條件：Task 1 必須先完成並 commit。**

**現有 `resolveLegacySectionQuery` 完整內容（`src/router/index.ts:8-30`，改動前）：**

```ts
function resolveLegacySectionQuery(to: RouteLocation): RouteLocationRaw | null {
    const q = { ...to.query }
    const section = Array.isArray(q.section) ? q.section[0] : q.section
    if (!section) return null
    delete q.section
    const tabRaw = Array.isArray(q.tab) ? q.tab[0] : q.tab
    delete q.tab
    if (section === 'appraisal') {
        const tab = tabRaw === 'cycles' ? 'history' : tabRaw === 'institution_events' ? 'institution-events' : tabRaw
        if (tab === 'settings') return { path: '/appraisal-year-end/rules/scoring' }
        if (tab && ['current', 'history', 'institution-events', 'disciplinary'].includes(tab)) {
            if (tab !== 'history') { delete q.cycle; delete q.view }
            return { path: `/appraisal-year-end/appraisal/${tab}`, query: q }
        }
        return { path: '/appraisal-year-end/appraisal/current' }
    }
    if (section === 'year-end') return { path: '/appraisal-year-end/year-end', query: q }
    if (section === 'payout') return { path: '/appraisal-year-end/year-end/payout', query: q }
    if (section === 'year-end-rules') return { path: '/appraisal-year-end/rules/year-end-rules' }
    if (section === 'exceptions') return { path: '/appraisal-year-end/exceptions', query: q }
    return null
}
```

**改為（只動 `section === 'appraisal'` 這個 if 區塊內部，其餘 `year-end`/`payout`/`year-end-rules`/`exceptions` 分支原樣不動）：**

```ts
if (section === 'appraisal') {
    const tab = tabRaw === 'cycles' ? 'history' : tabRaw === 'institution_events' ? 'institution-events' : tabRaw
    if (tab === 'settings') return { path: '/appraisal-year-end/rules/scoring' }
    if (tab === 'history') {
        const hq: Record<string, string> = {}
        if (typeof q.cycle === 'string') hq.cycle = q.cycle
        if (typeof q.view === 'string') hq.view = q.view
        return { path: '/appraisal-year-end/appraisal', query: { ...hq, stage: 'sign' } }
    }
    if (tab === 'current') return { path: '/appraisal-year-end/appraisal' }
    if (tab && ['institution-events', 'disciplinary', 'calibration'].includes(tab)) {
        delete q.cycle; delete q.view
        return { path: `/appraisal-year-end/appraisal/${tab}`, query: q }
    }
    return { path: '/appraisal-year-end/appraisal' }
}
```

（`'calibration'` 加進白名單是本次順手修正的既有小缺口——原本 `?section=appraisal&tab=calibration` 因不在白名單而 fallback 到 current，現在能正確落地；不是本批次目標但風險極低、範圍緊鄰，一併處理並在 commit message 註明。）

**現有 `appraisal` 巢狀路由定義（`src/router/index.ts:396-408`，改動前）：**

```ts
{
    path: 'appraisal',
    component: () => import('../views/AppraisalManagementView.vue'),
    redirect: '/appraisal-year-end/appraisal/current',
    meta: { title: '考核' },
    children: [
        { path: 'current', name: 'aye-appraisal-current', component: () => import('../views/appraisal/CurrentSemesterOverview.vue'), meta: { title: '當期總覽' } },
        { path: 'history', name: 'aye-appraisal-history', component: () => import('../views/appraisal/CycleListView.vue'), meta: { title: '歷史週期與簽核' } },
        { path: 'institution-events', name: 'aye-appraisal-events', component: () => import('../views/appraisal/components/InstitutionEventPanel.vue'), meta: { title: '活動出席' } },
        { path: 'disciplinary', name: 'aye-appraisal-disciplinary', component: () => import('../views/salary/DisciplinaryPanel.vue'), meta: { title: '懲處紀錄' } },
        { path: 'calibration', name: 'aye-appraisal-calibration', component: () => import('../views/appraisal/CalibrationView.vue'), meta: { title: '等第校準' } },
    ],
},
```

**改為（拉平成 6 個 sibling children，取代原本這一個巢狀物件；插入位置＝原本 `appraisal` 物件所在處）：**

```ts
{ path: 'appraisal', name: 'aye-appraisal', component: () => import('../views/appraisal/AppraisalWorkspaceView.vue'), meta: { title: '考核' } },
{ path: 'appraisal/institution-events', name: 'aye-appraisal-events', component: () => import('../views/appraisal/components/InstitutionEventPanel.vue'), meta: { title: '活動出席' } },
{ path: 'appraisal/disciplinary', name: 'aye-appraisal-disciplinary', component: () => import('../views/salary/DisciplinaryPanel.vue'), meta: { title: '懲處紀錄' } },
{ path: 'appraisal/calibration', name: 'aye-appraisal-calibration', component: () => import('../views/appraisal/CalibrationView.vue'), meta: { title: '等第校準' } },
{ path: 'appraisal/current', redirect: '/appraisal-year-end/appraisal' },
{ path: 'appraisal/history', redirect: (to) => ({ path: '/appraisal-year-end/appraisal', query: { ...to.query, stage: 'sign' } }) },
```

（`CycleListView.vue` 不再被任何路由掛載——它是 Batch 4+ 才會處理的「歷史週期清單」頁面，本批次不刪除該檔案，只是暫時無路由指向它；不在本 task 範圍內判斷是否該保留/刪除，若測試因此出現與 `CycleListView.vue` 相關的紅燈且明顯是「因無路由掛載」造成的既有債，記錄回報，不要順手刪除該檔案或其測試。）

- [ ] **Step 1: 刪除 `AppraisalManagementView.vue` 前，確認無其他引用**

```bash
grep -rln "AppraisalManagementView" src/ --include="*.ts" --include="*.vue"
```
預期只命中 `src/router/index.ts`（即將改掉）與它自己的測試檔 `src/views/__tests__/AppraisalManagementView.spec.ts`（即將刪除）。若命中其他檔案，暫停回報。

- [ ] **Step 2: 改 `resolveLegacySectionQuery`**（依上方新版程式碼）

- [ ] **Step 3: 改 `appraisal` 巢狀路由區塊**（依上方新版程式碼，取代原本的巢狀物件）

- [ ] **Step 4: 刪除退場檔案**

```bash
git rm src/views/AppraisalManagementView.vue src/views/__tests__/AppraisalManagementView.spec.ts
```

- [ ] **Step 5: 更新 `appraisalYearEndRedirects.spec.ts` 的 `CASES` 陣列**

原本這 6 條（`src/router/__tests__/appraisalYearEndRedirects.spec.ts:19-24`）：
```ts
  ['/appraisal-year-end?section=appraisal', '/appraisal-year-end/appraisal/current'],
  ['/appraisal-year-end?section=appraisal&tab=history&cycle=7&view=kanban', '/appraisal-year-end/appraisal/history', { cycle: '7', view: 'kanban' }],
  ['/appraisal-year-end?section=appraisal&tab=cycles', '/appraisal-year-end/appraisal/history'],
  ['/appraisal-year-end?section=appraisal&tab=institution_events', '/appraisal-year-end/appraisal/institution-events'],
  ['/appraisal-year-end?section=appraisal&tab=settings', '/appraisal-year-end/rules/scoring'],
  ['/appraisal-year-end?section=appraisal&tab=disciplinary', '/appraisal-year-end/appraisal/disciplinary'],
```
改為：
```ts
  ['/appraisal-year-end?section=appraisal', '/appraisal-year-end/appraisal'],
  ['/appraisal-year-end?section=appraisal&tab=history&cycle=7&view=kanban', '/appraisal-year-end/appraisal', { cycle: '7', view: 'kanban', stage: 'sign' }],
  ['/appraisal-year-end?section=appraisal&tab=cycles', '/appraisal-year-end/appraisal', { stage: 'sign' }],
  ['/appraisal-year-end?section=appraisal&tab=institution_events', '/appraisal-year-end/appraisal/institution-events'],
  ['/appraisal-year-end?section=appraisal&tab=settings', '/appraisal-year-end/rules/scoring'],
  ['/appraisal-year-end?section=appraisal&tab=disciplinary', '/appraisal-year-end/appraisal/disciplinary'],
```
另在陣列中新增兩條（放在上面 6 條附近即可，驗證舊子路徑本身也能正確 redirect）：
```ts
  ['/appraisal-year-end/appraisal/current', '/appraisal-year-end/appraisal'],
  ['/appraisal-year-end/appraisal/history?cycle=9', '/appraisal-year-end/appraisal', { cycle: '9', stage: 'sign' }],
```
以及一條驗證本次順手修正的 calibration 白名單缺口：
```ts
  ['/appraisal-year-end?section=appraisal&tab=calibration', '/appraisal-year-end/appraisal/calibration'],
```

`['/appraisal-management', '/appraisal-year-end/appraisal/current'],`（`legacyRedirects.spec.ts`，非本檔）**不在本檔案內**，但邏輯連動：`/appraisal-management` 會先落到 `?section=appraisal`（無 tab）→ 現在會落地 `/appraisal-year-end/appraisal`（無 query）而非 `/current`。**Task 2 的 Step 6 一併檢查並更新 `src/router/__tests__/legacyRedirects.spec.ts` 內對應這條的期望值**（若該檔案有類似斷言，改法同上：`/appraisal-year-end/appraisal/current` → `/appraisal-year-end/appraisal`）。

- [ ] **Step 6: 跑測試確認全綠**

```bash
npm run test -- --run src/router src/constants/navigation src/views/appraisal src/views/appraisalYearEnd
```
Expected: PASS。特別確認 `appraisalYearEndRedirects.spec.ts`、`legacyRedirects.spec.ts`（若有相關斷言）、`appraisalRoutePermissions.test.ts`、`appraisalYearEndRoute.spec.ts` 全綠（後兩者理論上不需改——`canAccessRoute` 只查 manifest 規則不查實際路由表，`/appraisal-year-end/appraisal/current` 這個路徑仍在 manifest 的 prefix 規則涵蓋範圍內）。

若出現與 `CycleListView.vue`（現在無路由掛載）相關的紅燈，記錄在報告內，不要修改或刪除 `CycleListView.vue` 本身（範圍外）。

- [ ] **Step 7: 全庫回歸掃描**

```bash
npm run test -- --run src
```
導出結果、grep 摘要行（不要用 exit code 判定），確認除了本 task 明確改動範圍外沒有新增紅燈。若有既有債，記錄不動。

- [ ] **Step 8: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。`npm run build` 這次**必須跑**（本 task 首次讓 `AppraisalWorkspaceView.vue` 真正進入 build graph，需要確認它不會撞到 chunk 邊界檢查 `scripts/check-entry-chunks.mjs`）。

- [ ] **Step 9: Commit**

```bash
git add -- src/router/index.ts src/router/__tests__/appraisalYearEndRedirects.spec.ts
git rm src/views/AppraisalManagementView.vue src/views/__tests__/AppraisalManagementView.spec.ts
git commit -m "feat(appraisal): 路由正式切換到 AppraisalWorkspaceView，退場 AppraisalManagementView

/appraisal-year-end/appraisal 改掛 Batch2 的工作區 shell；current/history 兩條
子路由改為 redirect（history 保留 cycle/view query 並補上 stage=sign）；
institution-events/disciplinary/calibration 三條路由 URL 與行為不變，只是
從巢狀 children 拉平成 sibling。順手修正 resolveLegacySectionQuery 遺漏
calibration 白名單的既有小缺口（V2 IA Phase 1 Batch 3）。"
```

若 legacyRedirects.spec.ts 有獨立修改，另開一個 commit（`git add -- src/router/__tests__/legacyRedirects.spec.ts`），訊息說明只改期望值不改邏輯。

---

## Self-Review 記錄

1. **Spec coverage**：ux-spec §1.1「考核・當期總覽/歷史週期與簽核」→ 考核工作區的 IA 收斂在本批次真正落地（前兩批只做導覽層與尚未接線的元件）；「等第校準」merge 進審查例外階段仍是 deferred 項（本批次刻意保留 calibration 獨立路由，避免功能倒退），已在 Goal 段落與 commit message 明確排除範圍。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼、精確 grep 定位指令、逐條測試案例改法，無 TBD。
3. **Type consistency**：Task 1 純字串取代不涉型別；Task 2 的 router 物件結構延續既有慣例（`redirect` 函式簽名 `(to) => RouteLocationRaw`，與檔案內其他既有 redirect 函式如 `/year_end/cycles/:id/grid` 那條完全同款式）。
4. **風險守則**：`CycleListView.vue` 因失去路由掛載可能出現的既有測試紅燈，明確交代「記錄不動、不要順手刪除」——避免這批次意外擴大到「順便清理 CycleListView」的範圍外工作。
