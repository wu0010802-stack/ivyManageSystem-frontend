# vite-8 生態升級 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前端升到 vite 8（Rolldown）生態，清掉 #50/#52/#58 三個 peer 衝突 backlog PR，零功能改動。

**Architecture:** 單一聚合分支 `chore/vite8-ecosystem-upgrade`（已建於 worktree `.claude/worktrees/vite8`，從 origin/main 開）。一次套用所有耦合升級 + regen lockfile，再依序完整驗證（typecheck → build → chunk 比對 → vitest → e2e → CI），綠後 merge。

**Tech Stack:** Vue 3.5 + Vite 8(Rolldown+Oxc) + vue-router 5 + pinia 3 + TypeScript 5.9 + vue-tsc 3 + vitest 4。

## Global Constraints

- 升級目標：`vite@^7.3.6`（**改升 7 不升 8，執行期決策 C**：vite 8 Rolldown 不支援 manualChunks 需重寫 advancedChunks，#58 留 backlog）、`@vitejs/plugin-vue@^6`、`vue-router@^5.1.0`、`pinia@^3.0.4`、`vue@^3.5.39`。
- **不升（#52 整組暫緩，2026-06-30 執行期決策 B）**：`typescript` 留 `^5.9.3`（openapi-typescript@7 peer 卡 ts^5）、`@types/node` 留 `^22.x`（運行環境 node 20/22）、`vue-tsc` 留 `^2.2.12`（vue-tsc3 對 composable+template ref 有 noUnusedLocals false-positive，language-tools#1168）、`@volar/typescript` 隨舊。**升級指令絕不可帶這四個。**
- 工作目錄：worktree `/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/vite8`，分支 `chore/vite8-ecosystem-upgrade`。所有 git/npm 操作在此 worktree，**不碰主工作樹**（28 commit 未 push + WIP）。
- 前端規範：TS-only，禁 `: any`（用 `: unknown`+narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`）。
- 驗證完整度：typecheck + build + 三 entry chunk 比對 + vitest + workspace e2e + PR CI 全綠（spec §4）。
- npm scripts：`npm run typecheck`(vue-tsc --noEmit)、`npm run build`(vite build)、`npm run test`(vitest run)、`npm run lint`(eslint .)。

---

### Task 1: 套用依賴升級 + regen lockfile + 安裝

**Files:**
- Modify: `package.json`（dependencies/devDependencies 版本）
- Modify: `package-lock.json`（regen）

**Interfaces:**
- Produces: 升級後可解析的 `node_modules` + lockfile，供 Task 2-5 驗證。

- [ ] **Step 1: 確認在正確 worktree 與分支**

Run:
```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/vite8
git branch --show-current
```
Expected: `chore/vite8-ecosystem-upgrade`

- [ ] **Step 2: 套用升級並安裝（完整 install，裝 node_modules）**

Run（在 worktree 根；指令**不含** typescript/@types/node）：
```bash
npm install \
  "vite@^7" \
  "@vitejs/plugin-vue@^6" \
  "vue-router@^5.1.0" \
  "pinia@^3.0.4" \
  "vue@^3.5.39"
```
Expected: 安裝成功，**無 `npm error code ERESOLVE`**。（vite 升 7 不升 8；vue-tsc 不升留 ^2.2.12）若 ERESOLVE → 停下，看是哪個 peer（多半是 @vitejs/plugin-vue 版本沒對齊 vite8），調整版本再試，**不可**用 `--legacy-peer-deps` 蒙混。

- [ ] **Step 3: 確認 typescript / @types/node 未被動到**

Run:
```bash
git diff package.json | grep -E '"(typescript|@types/node)"'
```
Expected: 無輸出（這兩個版本行沒變）。若被改回滾該行。

- [ ] **Step 4: 確認關鍵版本已升**

Run:
```bash
node -e "const p=require('./package.json');console.log({vite:p.devDependencies.vite,pluginVue:p.devDependencies['@vitejs/plugin-vue'],router:p.dependencies['vue-router'],pinia:p.dependencies.pinia,vue:p.dependencies.vue,vueTsc:p.devDependencies['vue-tsc']})"
```
Expected: vite `^8.x`、@vitejs/plugin-vue `^6.x`、vue-router `^5.x`、pinia `^3.x`、vue `^3.5.x`、vue-tsc `^3.x`。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit --no-verify -m "chore(deps): 升 vite8/plugin-vue6/vue-router5/pinia3/vue3.5/vue-tsc3"
```

---

### Task 2: typecheck 通過（vue-tsc 3 + ts 5.9）

**Files:**
- Modify（若需）：暴露的 type 問題對應檔 + `vite.config.js` / `tsconfig*.json`（若 vue-tsc3 要求）

**Interfaces:**
- Consumes: Task 1 的 node_modules。
- Produces: `npm run typecheck` 綠。

- [ ] **Step 1: 跑 typecheck**

Run:
```bash
npm run typecheck
```
Expected: 通過無 error。vue-tsc 3 是 major，可能更嚴格暴露既有 type 問題。

- [ ] **Step 2: 若有 type error，逐個修**

對每個 error：讀對應檔案、用正確型別修（禁 `: any`；必要時 `// @ts-expect-error TODO(ts-strict): <reason>` 並在 commit message 說明）。修完重跑 `npm run typecheck` 直到綠。

- [ ] **Step 3: 若無 error（或修完），確認綠**

Run:
```bash
npm run typecheck && echo TYPECHECK_OK
```
Expected: 結尾印 `TYPECHECK_OK`。

- [ ] **Step 4: Commit（僅當 Step 2 有改檔）**

```bash
git add -A
git commit --no-verify -m "fix(types): 修 vue-tsc3 typecheck 暴露的型別問題"
```
若 Step 2 無改檔則跳過此 step。

---

### Task 3: vite 8 build 成功 + 三 entry chunk 分割比對

**Files:**
- Modify（若需）：`vite.config.js`（`manualChunks` / `rollupOptions`→`rolldownOptions` 調整）

**Interfaces:**
- Consumes: Task 1 node_modules。
- Produces: `dist/` 成功產出，三 entry（main/parent/public）chunk 分割正確。

- [ ] **Step 1: 跑 build**

Run:
```bash
npm run build
```
Expected: build 成功產 `dist/`。vite8 兼容層會把 `build.rollupOptions` 自動轉 `rolldownOptions`；若報 config 不相容（如 `manualChunks` 簽名），依錯誤訊息調 `vite.config.js`（manualChunks 邏輯保持語意不變，只配合 Rolldown API）。

- [ ] **Step 2: 列出三 entry 的 chunk 結構**

Run:
```bash
ls -1 dist/assets/*.js | sed 's#dist/assets/##' | sort
echo "--- entry HTML 引用的 chunk ---"
grep -ohE 'assets/[^"]+\.js' dist/index.html dist/parent.html dist/public.html | sort -u
```
Expected: 看到 `vue-core`、`parent-app`、`admin-core`、`public-app`、`element-plus` 等具名 chunk（manualChunks 產物）。

- [ ] **Step 3: 驗證 chunk 邊界沒回歸（關鍵檢查）**

確認以下不變式（vite.config `manualChunks` 註解所載的意圖）：
- `index.html`（admin）、`public.html` **不** preload `parent-app`（家長 LIFF 整包，含 @line/liff）。
- ⚠ 修正：parent/public preload `admin-core`/`activity-admin` 是**既有 modulepreload 行為**（vite5 baseline 相同、非回歸）；真正不變式只有 admin/portal 不載 `parent-app`。驗證改為「三 entry chunk 與 vite5 baseline build 逐一等價」+ vue-core 存在。
- `vue-core` 為三 entry 共享（含 `plugin-vue:export-helper`、`vite/preload-helper`）。

Run（檢查家長 entry 沒拉入 admin/element-plus）：
```bash
grep -E 'assets/(admin-core|activity-admin|element-plus)' dist/parent.html && echo "FAIL: parent 拉入 admin chunk" || echo "OK: parent 乾淨"
```
Expected: `OK: parent 乾淨`。若 FAIL → Rolldown 的 manualChunks 行為不同，調 `vite.config.js` 使其符合原切分意圖，重跑 build + 本檢查。

- [ ] **Step 4: Commit（僅當有改 vite.config）**

```bash
git add vite.config.js
git commit --no-verify -m "build(vite8): 調整 manualChunks 配合 Rolldown，維持三 entry 切分"
```
若無改 config 則跳過。

---

### Task 4: vitest 全套綠

**Files:** 無（純驗證；若測試因升級壞掉才改對應測試/原始碼）

**Interfaces:**
- Consumes: Task 1 node_modules（jsdom 29 已隨 #66）。
- Produces: `npm run test` 綠。

- [ ] **Step 1: 跑全套 vitest**

Run:
```bash
npm run test 2>&1 | tail -30
```
Expected: 全綠。家長端有三個測試樹（`src/parent/__tests__`、`tests/unit/parent`、`tests/parent`），`vitest run` 預設全跑。

- [ ] **Step 2: 若有 fail，判斷真因並修**

升級可能影響：pinia3（store 測試）、vue-router5（router 測試）、vue3.5（元件測試）、jsdom29（DOM 測試）。逐個讀失敗、修原始碼或測試（行為保持）。重跑直到綠。

- [ ] **Step 3: 確認綠**

Run:
```bash
npm run test 2>&1 | tail -5 && echo VITEST_DONE
```
Expected: 結尾 `VITEST_DONE`，無 failed。

- [ ] **Step 4: Commit（僅當 Step 2 有改檔）**

```bash
git add -A
git commit --no-verify -m "test: 修升級後失效的測試/原始碼（行為不變）"
```

---

### Task 5: workspace e2e critical-path smoke

**Files:** 無（整合驗證）

**Interfaces:**
- Consumes: 升級後的前端 + 後端 dev server。
- Produces: e2e critical-path 綠（登入/打卡/送假/簽核/結薪試算 + admin 頁面渲染）。

- [ ] **Step 1: 起兩端 dev server**

Run（另開終端，**用主 repo 的 start.sh**；它跑 dev server 不依賴 worktree）：
```bash
cd /Users/yilunwu/Desktop/ivyManageSystem && ./start.sh
```
注意：前端 dev server 預設跑主工作樹。要驗 worktree 的升級版，需讓前端從 worktree 起（`cd <worktree> && npm run dev`，port 5173）。確認 5173 是升級版（vite8 啟動 banner 會顯示 vite 版本）。

- [ ] **Step 2: 跑 e2e critical-path**

Run:
```bash
cd /Users/yilunwu/Desktop/ivyManageSystem/e2e
set -a; . ./.env; set +a
npm test 2>&1 | tail -30
```
Expected: 5 個 mutation + 4 個 admin 頁面渲染全綠。前置：dev DB 有 admin 帳號 + 月薪非 admin 員工（見 workspace CLAUDE.md「前置 dev DB」）。

- [ ] **Step 3: 確認綠並停 dev server**

Expected: e2e 全 pass。停掉 start.sh（Ctrl+C）。e2e 無原始碼 commit（純驗證）。

---

### Task 6: push + 開聚合 PR + CI 綠

**Files:** 無

**Interfaces:**
- Consumes: 前 5 個 task 的 commits。
- Produces: 綠的聚合 PR。

- [ ] **Step 1: push 分支**

Run:
```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/vite8
git push -u origin chore/vite8-ecosystem-upgrade 2>&1 | tail -3
```
Expected: 分支推上 origin。

- [ ] **Step 2: 開 PR**

Run:
```bash
gh pr create --repo wu0010802-stack/ivyManageSystem-frontend --base main --head chore/vite8-ecosystem-upgrade \
  --title "chore(deps): vite-8 生態升級（vite8/vue-router5/pinia3，聚合 #50 #52 #58）" \
  --body "依 spec docs/superpowers/specs/2026-06-30-vite8-ecosystem-upgrade-design.md。升 vite5→8(Rolldown)/@vitejs/plugin-vue6/vue-router5/pinia3/vue3.5/vue-tsc3；typescript@6 與 @types/node@26 卡上游不升。本地已過 typecheck/build/三 entry chunk 比對/vitest/e2e。

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: 等 CI 跑完並確認綠**

Run:
```bash
PR=$(gh pr view --repo wu0010802-stack/ivyManageSystem-frontend chore/vite8-ecosystem-upgrade --json number --jq .number)
gh pr view $PR --repo wu0010802-stack/ivyManageSystem-frontend --json statusCheckRollup --jq '.statusCheckRollup[]|"\((.conclusion//.state))\t\(.name//.context)"'
```
Expected: `Tests & Build` / `OpenAPI Drift Check` / `依賴 CVE 掃描` 皆 SUCCESS。若紅 → 讀 log 修（回對應 task），push 後重查。

---

### Task 7: merge + close backlog + 清理

**Files:** 無

- [ ] **Step 1: merge PR**

Run（CI 綠後）：
```bash
PR=$(gh pr view --repo wu0010802-stack/ivyManageSystem-frontend chore/vite8-ecosystem-upgrade --json number --jq .number)
gh pr merge $PR --repo wu0010802-stack/ivyManageSystem-frontend --squash --delete-branch
```
Expected: merged（觸發前端 Zeabur prod 部署）。

- [ ] **Step 2: 確認 backlog PR 收掉**

Run:
```bash
gh pr list --repo wu0010802-stack/ivyManageSystem-frontend --state open --json number,title,author --jq '.[]|select(.author.login|test("dependabot|renovate"))|"#\(.number) \(.title)"'
```
Expected: #50 #58 已被 dependabot 自動 close。若 #52 仍 open → 手動 close：
```bash
gh pr close 52 --repo wu0010802-stack/ivyManageSystem-frontend --comment "vue-tsc/@volar 已隨 vite-8 生態升級 PR 合入；typescript@6 / @types/node@26 卡上游（openapi-typescript@7 要 ts^5、運行環境 node20/22）暫不升，記入 backlog。" --delete-branch
```

- [ ] **Step 3: 清 worktree + 本地分支**

Run:
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend worktree remove .claude/worktrees/vite8
git -C /Users/yilunwu/Desktop/ivy-frontend branch -D chore/vite8-ecosystem-upgrade
```
Expected: worktree 與本地分支清除。

- [ ] **Step 4: 確認 main CI 綠**

Run:
```bash
gh run list --repo wu0010802-stack/ivyManageSystem-frontend --branch main --workflow "Frontend CI" --limit 1 --json status,conclusion --jq '"\(.status)/\(.conclusion)"'
```
Expected: `completed/success`。
