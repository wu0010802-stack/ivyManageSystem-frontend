# L3 api/ + parent/api/ TS 轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 把 `src/api/` 65 檔 + `src/parent/api/` 21 檔 = **86 檔 / 2845 行**轉為 TypeScript，並開始用 `_generated/typed.d.ts` 的 `ApiResponse` / `ApiBody` / `AxiosResp` 替代 JSDoc，讓上層（composables / views / components）拿到實際型別。

**Architecture:**
- Rename `.js` → `.ts`，**不改變行為**
- 既有 4 檔 JSDoc 接線（appraisal / classrooms / employees / salary）升級為真正 `import type` + 簽章註型
- 其他 ~80 檔以最小型 annotation 為主（function 參數用 `unknown` + axios `AxiosResponse<unknown>`）
- 後端缺 `response_model=` 的 endpoint OpenAPI 回 `unknown` — 用 `as ResponseShape // TODO(ts-strict): waiting on backend response_model` 過渡標註並列出 backlog
- **Prep step：commit `auto-imports.d.ts` + `components.d.ts` 進 repo**（L2 carry-forward #1，L4 之前必做）

**Tech Stack:** TypeScript 5.9 / vue-tsc 2.2 / strict:true / openapi-typescript schema.d.ts

**Prerequisites**：
1. L0 + L1 + L2 已 merge 進 origin/main（截至 `999b17d1`）
2. main 工作樹乾淨：`git status -s` 只剩 `.claude/` untracked
3. **npm 必須 10.9.8**
4. `_generated/schema.d.ts` 為前一份 OpenAPI dump（如後端有改 endpoint 後需 regen：`cd ivy-backend && python scripts/dump_openapi.py && cd ../ivy-frontend && npm run gen:api`，但本 plan 假設 schema 為當前 baseline）

**Branch:** `feat/ts-migration-l3-api-2026-05-18-frontend`
**Working directory:** Task 1 完成後 cwd 應為 `~/Desktop/ivy-frontend/.claude/worktrees/ts-l3`

**Spec reference:** spec §4 (L3) + §7 (API 層整合)

---

## L0+L1+L2 carry-forward（implementer 必讀）

1. **`@vue/tsconfig` 默開 `verbatimModuleSyntax: true`** → 純型別 import 用 `import type`
2. **不要 `: any`** → 用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`
3. **使用 `import type` 從 `./_generated/typed`** import `ApiResponse` / `ApiBody` / `ApiQuery` / `ApiPath` / `AxiosResp` / `Schema`
4. **axios wrapper 不解包 `.data`** — caller 用 `res.data`，本層回傳用 `AxiosResp<P, M>` 對齊
5. **後端缺 `response_model=`** → endpoint 回 `unknown`，需 `as ShapeName // TODO(ts-strict): waiting on backend response_model`
6. **不要新增 type alias / interface / `as const`** — minimum-friction
7. **`auto-imports.d.ts` / `components.d.ts` 已在 prep step commit 進 repo**，不再 ignore

---

## Pre-authorized collateral updates（pre-flight grep 抓到）

### vite.config.js — 8 條 manualChunks `.js` → `.ts`

| 行號 | 原值 | 新值 |
|---|---|---|
| 69 | `/src/api/auth.js` | `auth.ts` |
| 70 | `/src/api/employees.js` | `employees.ts` |
| 71 | `/src/api/studentAssessments.js` | `studentAssessments.ts` |
| 72 | `/src/api/studentIncidents.js` | `studentIncidents.ts` |
| 73 | `/src/api/classrooms.js` | `classrooms.ts` |
| 74 | `/src/api/index.js` | `index.ts` |
| 87 | `/src/api/activity.js` | `activity.ts` |
| 96 | `/src/api/portal.js` | `portal.ts` |

### tests/unit/api/*.test.js — 多檔 comment（**僅 comment**）

Pattern `* 驗證 src/api/<name>.js wrapper`、`* 薄殼測試：驗 src/api/<name>.js`。

每個 .test.js 約 1-2 行 comment 提及對應 `src/api/<name>.js`。**不改 readFileSync 邏輯**（這些 test 不像 RecruitmentIvykidsTab.test.js 用 readFileSync 讀 source；他們是 axios-mock-adapter 測 wrapper 行為）。

**只需要修正 comment 文字** — 用 sed 一次性處理：
```bash
sed -i '' 's|src/api/\([a-zA-Z]*\)\.js|src/api/\1.ts|g' tests/unit/api/*.test.js
```

執行後驗證 comment 內容正確、test 邏輯不變。

---

## File Structure

### Prep (Task 2)
- Modify: `.gitignore` — 移除 `auto-imports.d.ts` 與 `components.d.ts` 兩條
- Create / Add: `auto-imports.d.ts`、`components.d.ts`（從 unplugin 自動產出的當前內容 commit 進 repo）

### Rename
- `src/api/*.js` × 65 → `.ts`
- `src/parent/api/*.js` × 21 → `.ts`

### Modify (collateral)
- `vite.config.js` 8 行 `.js` → `.ts`
- `tests/unit/api/*.test.js` 多檔 comment（用 sed）

### Delete
- 對應 86 個 `.js`（由 `git mv` 完成）
- `.gitignore` 兩條 `auto-imports.d.ts` / `components.d.ts`

---

## Task 1: 建立 worktree + pre-flight 再 grep

- [ ] **Step 1: main 同步、status 乾淨**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
echo "behind: $(git rev-list --count HEAD..origin/main) | ahead: $(git rev-list --count origin/main..HEAD)"
git status -s
```
Expected: behind=0, ahead=0, status 只有 `?? .claude/`。

- [ ] **Step 2: pre-flight grep（再驗證一次，防 main 又新增引用）**

```bash
grep -rn "src/api/.*\.js\|src/parent/api/.*\.js" --include="*.js" --include="*.ts" --include="*.vue" --include="*.mjs" --include="*.json" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v package-lock | grep -v "\.git/" | grep -v "\.claude/worktrees/" | head -30
```
Expected 命中：
- `vite.config.js` 8 條（auth / employees / studentAssessments / studentIncidents / classrooms / index / activity / portal）
- `tests/unit/api/*.test.js` 多檔 comment

**若有其他 hardcoded refs**（如新加的 readFileSync），列出來、視情況加入 collateral list（同 commit 處理）。

- [ ] **Step 3: 建立 worktree**

```bash
git worktree add .claude/worktrees/ts-l3 -b feat/ts-migration-l3-api-2026-05-18-frontend main
cd .claude/worktrees/ts-l3
```

- [ ] **Step 4: 確認 baseline typecheck**

```bash
npm run typecheck 2>&1 | tail -3
echo "exit=$?"
```
Expected: exit 0。

---

## Task 2: Prep — commit auto-imports.d.ts / components.d.ts 進 repo

**Why**：L4 (composables) 起會大量用 `ref` / `computed` / Element Plus auto-registered 元件。CI 環境 typecheck 跑在 build 之前，沒有 vite-generated d.ts → ambient declarations 缺失 → typecheck 紅。把兩檔 commit 進 repo 最簡單。

**Files:**
- Modify: `.gitignore`（移除兩條）
- Add: `auto-imports.d.ts`、`components.d.ts`

- [ ] **Step 1: 確認 unplugin 已產出兩檔最新內容**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/ts-l3
ls -la auto-imports.d.ts components.d.ts
```
若不存在或老舊，跑一次 dev 啟動：
```bash
timeout 8 npm run dev > /tmp/dev.log 2>&1 || true
ls -la auto-imports.d.ts components.d.ts
```

- [ ] **Step 2: 從 .gitignore 移除兩條**

Edit `.gitignore`，刪除這兩行：
```
auto-imports.d.ts
components.d.ts
```
若上方有 comment `# unplugin-auto-import / unplugin-vue-components auto-generated...` 也一併刪掉。

- [ ] **Step 3: stage + commit**

```bash
git add .gitignore auto-imports.d.ts components.d.ts
git status -s
git commit -m "$(cat <<'EOF'
chore(ts-l3): commit auto-imports.d.ts / components.d.ts 進 repo

L4 (composables) 起 .ts 檔會用 ref/computed/Element Plus 自動註冊元件，
CI 順序為 test→typecheck→build，typecheck 跑在 build 之前看不到
vite-generated 的 ambient declarations。改 commit 兩檔進 repo 最直接。

兩檔由 unplugin-auto-import / unplugin-vue-components 在 vite dev/build
時自動 regenerate；commit 後仍會保持自動 regenerate，但會出現在
git status 的 modified — 如有變動 implementer 須 commit 進對應 PR。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 確認 typecheck 仍 exit 0**

```bash
npm run typecheck 2>&1 | tail -3
```
Expected: exit 0（這個 prep step 不改 .ts，只是把 d.ts 從 ignore 改為 tracked）。

---

## Task 3: 轉換 src/api/ 65 檔 + collateral

**Files:**
- Rename: `src/api/*.js` × 65 → `.ts`
- Modify: `vite.config.js`（8 條 `.js` → `.ts`）
- Modify: `tests/unit/api/*.test.js`（多檔 comment，用 sed）

- [ ] **Step 1: git mv rename**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/ts-l3
for f in $(ls src/api/ | grep "\.js$" | sed 's/\.js$//'); do
  git mv src/api/${f}.js src/api/${f}.ts
done
git status -s | head -30
```
Expected: ~130 變動（65 D + 65 A or 65 R）。

- [ ] **Step 2: collateral — vite.config.js 8 條**

Use Edit tool on `vite.config.js` 行 69-74, 87, 96，把 `.js` 改 `.ts`。一個檔一次處理 8 行。

驗證：
```bash
grep -nE "src/api/.*\.(js|ts)" vite.config.js | head -15
```
Expected: 8 行都是 `.ts`，0 行 `.js`。

- [ ] **Step 3: collateral — test comment sed**

```bash
sed -i '' 's|src/api/\([a-zA-Z]*\)\.js|src/api/\1.ts|g' tests/unit/api/*.test.js
grep -n "src/api/.*\.js" tests/unit/api/*.test.js | head -5
```
Expected: sed 後 grep `.js` 為空（全 `.ts`）。

- [ ] **Step 4: 跑 typecheck**

```bash
npm run typecheck 2>&1 | tail -50
```

**常見 error 處理表**（禁 `: any`）：

| Error 型態 | 處理 |
|---|---|
| `Parameter 'x' implicitly has an 'any' type` | 加 `: unknown` 或從 `_generated/typed` 取 `ApiBody<P, M>` / `ApiQuery<P, M>` 對應型別 |
| `Type 'unknown' is not assignable to type 'X'` | 用 type guard 或顯式 cast，後端缺 `response_model=` 時用 `as ShapeName // TODO(ts-strict): waiting on backend response_model` |
| axios call 回傳型別 | 用 `AxiosResp<P, M>` 從 `_generated/typed`；若 endpoint 不在 OpenAPI（罕見），用 `AxiosResponse<unknown>` |
| `Property X does not exist on type 'unknown'` | type guard 或顯式 narrow |
| `Cannot find module '@/...'` | path alias 問題，stop 報告 |

**已有 JSDoc 接線的 4 檔**（appraisal / classrooms / employees / salary）：JSDoc `@typedef {import('./_generated/typed').ApiResponse<...>}` 改為真正的 `import type { ApiResponse } from './_generated/typed'`，刪掉 JSDoc 註解，把型別直接掛在 function 簽章。

**新加 endpoint OpenAPI 沒收錄（罕見）**：用 `AxiosResponse<unknown>`，並在 PR description 列出該 endpoint，由 implementer 通知 backend 補 schema。

**❌ 禁觸**：
- 不可移除 / 重命名任何 export
- 不可改 axios call signature（method / URL / params 結構）
- 不可加新 dep
- 不可加 `: any`

- [ ] **Step 5: 跑 vitest**

```bash
npm test 2>&1 | tail -10
```
Expected: 2310+ passed, 0 failed。

特別關注：
- `tests/unit/api/*.test.js` 全部（85 檔 wrapper 都有測試覆蓋）
- 任何依賴 api wrapper 的 component test

- [ ] **Step 6: 跑 build**

```bash
npm run build 2>&1 | tail -3
echo "build exit=$?"
```
Expected: exit 0。Build artifact 內 `auto-imports.d.ts` / `components.d.ts` 會被 regenerate（無妨，commit 進 repo 後可能會被 modify 但不需 staged）。

- [ ] **Step 7: 統計 TODO(ts-strict) 過渡標註**

```bash
grep -rn "TODO(ts-strict)" src/api/*.ts | wc -l | tr -d ' '
echo "標註數量"
grep -rn "TODO(ts-strict)" src/api/*.ts | sed 's/^.*TODO(ts-strict)://' | sort -u | head -20
echo "（去重後不同原因）"
```

收集這些 endpoint 列表，後續 commit message + PR description 中列出（給後端 backlog 補 `response_model=`）。

- [ ] **Step 8: Commit src/api/ + collateral**

```bash
git add src/api/ vite.config.js tests/unit/api/
git commit -m "$(cat <<'EOF'
feat(ts-l3): 轉 src/api/ 65 檔為 TypeScript

無行為變動。65 個 axios wrapper，含 employees / salary / appraisal /
classrooms 4 檔升級既有 JSDoc 接線為真正 import type。

附帶連動更新：
- vite.config.js:69-74, 87, 96 8 條 manualChunks 規則 .js → .ts
- tests/unit/api/*.test.js 多檔 comment .js → .ts (僅 doc 字串)

過渡標註：N 處 `// TODO(ts-strict): waiting on backend response_model`
（後端缺 response_model= 的 endpoint，已列入 PR description backlog）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
（commit message 內 N 處替換為實際數量）

---

## Task 4: 轉換 src/parent/api/ 21 檔

**Files:** Rename `src/parent/api/*.js` × 21 → `.ts`

- [ ] **Step 1: git mv rename**

```bash
for f in $(ls src/parent/api/ | grep "\.js$" | sed 's/\.js$//'); do
  git mv src/parent/api/${f}.js src/parent/api/${f}.ts
done
```

- [ ] **Step 2: typecheck + 修 error（同 Task 3 Step 4 規則）**

```bash
npm run typecheck 2>&1 | tail -30
```

**Parent api 注意**：parent API endpoint OpenAPI path 一般以 `/parent/...` 開頭，例如 `ApiQuery<'/parent/calendar/week', 'get'>`。確認 schema.d.ts 內有對應 path 才能掛型別。

- [ ] **Step 3: vitest**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 4: build**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 5: 統計 TODO(ts-strict) for parent**

```bash
grep -rn "TODO(ts-strict)" src/parent/api/*.ts | wc -l | tr -d ' '
```

- [ ] **Step 6: Commit**

```bash
git add src/parent/api/
git commit -m "$(cat <<'EOF'
feat(ts-l3): 轉 src/parent/api/ 21 檔為 TypeScript

無行為變動。21 個家長端 axios wrapper（activity / announcements /
attendance / auth / calendar / childMeasurements / childMilestones /
childPhotos / childReports / childTimeline / contactBook / events /
family / fees / index / leaves / medications / messages / notifications /
profile + assistant）。

過渡標註：M 處 `// TODO(ts-strict): waiting on backend response_model`。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 整體驗證

- [ ] **Step 1: typecheck / vitest / build**

```bash
npm run typecheck 2>&1 | tail -3; echo "tc exit=$?"
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3; echo "build exit=$?"
```
全 exit 0、vitest 2310+/2310+ 全綠。

- [ ] **Step 2: 沒有遺漏 .js 檔**

```bash
find src/api src/parent/api -maxdepth 1 -name "*.js" 2>&1
```
Expected: 空。

- [ ] **Step 3: 沒有 `: any`**

```bash
git diff main..HEAD -- 'src/api/*.ts' 'src/parent/api/*.ts' | grep -nE ':\s*any\b' | head -5
```
Expected: 空。

- [ ] **Step 4: TODO(ts-strict) 總數**

```bash
git diff main..HEAD -- 'src/api/*.ts' 'src/parent/api/*.ts' | grep -c "TODO(ts-strict)"
```
紀錄總數 — 後續 PR description 列。

- [ ] **Step 5: auto-imports.d.ts / components.d.ts 仍存在且未被誤 ignore**

```bash
ls -la auto-imports.d.ts components.d.ts
git ls-files auto-imports.d.ts components.d.ts
grep -E "(auto-imports|components)\.d\.ts" .gitignore || echo "  ✓ not ignored"
```
Expected: 兩檔都 tracked、`.gitignore` 不再包含這兩條。

---

## Task 6: Push + 開 PR

- [ ] **Step 1: push**

```bash
git push -u origin feat/ts-migration-l3-api-2026-05-18-frontend
```

- [ ] **Step 2: 開 PR**

```bash
gh pr create --title "feat(ts-l3): 轉 api/ + parent/api/ 為 TypeScript" --body "$(cat <<'EOF'
## Summary
- **86 檔 `.js` → `.ts`**：`src/api/` 65 + `src/parent/api/` 21 = **2845 行**
- **既有 4 檔 JSDoc 接線升級**為真正 `import type { ApiResponse, ApiBody, AxiosResp } from './_generated/typed'`：appraisal / classrooms / employees / salary
- **Prep step**：`auto-imports.d.ts` / `components.d.ts` 從 .gitignore 移出並 commit 進 repo（L4 之前必做）
- **連動更新**：`vite.config.js` 8 條 manualChunks + `tests/unit/api/*.test.js` 多檔 comment
- **無行為變動** — axios call signature / method / URL / params 結構保持

## 後端 response_model= 缺漏 backlog（已過渡標註）

PR diff 內共 N 處 `// TODO(ts-strict): waiting on backend response_model`，按 endpoint 群組：

（implementer 在 PR description 補完此清單）

## Test plan
- [x] `npm run typecheck` exit 0
- [x] `npm test` 2310+/2310+ 全綠
- [x] `npm run build` 成功
- [x] `find src/api src/parent/api -maxdepth 1 -name "*.js"` 空
- [x] 無 `: any` 顯式註型
- [x] `auto-imports.d.ts` / `components.d.ts` 已 commit 進 repo（從 .gitignore 移出）
- [ ] CI 全綠

## Why
TS 全面遷移 L3 — api 層。L4 (composables) 起會大量 import 這層的型別。
此 PR 是 L0-L9 中最大的一個 PR（86 檔 / 2845 行），但 axios wrapper 結構機械化，
平均每檔 ~30 行。

詳細設計：
- Spec: `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md` §4 (L3) + §7
- Plan: `docs/superpowers/plans/2026-05-18-frontend-ts-migration-l3-api.md`

## L4 carry-forward
- `auto-imports.d.ts` / `components.d.ts` 在 repo 內後，每次 vite dev/build 會 regenerate；如 modify 出現在 git status，implementer 須 commit 進對應 PR
- L4 composables 大量用 ref/computed/watch — 需要 auto-imports.d.ts 提供 ambient declarations
- `OQRecord` interface 在 L4 落地後可收緊 `offlineQueue.ts` 的 `IDBPDatabase<unknown>`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 等 CI**

```bash
sleep 180 && gh pr view --json statusCheckRollup --jq '.statusCheckRollup[0] | "\(.status) / \(.conclusion)"'
```
若 IN_PROGRESS，再 sleep 120 重跑。Expected: COMPLETED / SUCCESS。

如 CI fail：
- typecheck 失敗：本地 run 沒過？或 CI 跑的 d.ts 與本地不同？確認 commit 兩 .d.ts 進 repo 後是否 push
- test fail：抓 log 看哪個 wrapper 行為被誤動

---

## Task 7: Merge + cleanup（user 確認後）

```bash
cd ~/Desktop/ivy-frontend
git checkout main
git fetch origin main && git pull
git merge feat/ts-migration-l3-api-2026-05-18-frontend  # 視情況 --ff-only 或 --no-ff
npx --yes npm@10.9.8 install
npm run typecheck && npm test && npm run build
git worktree remove --force .claude/worktrees/ts-l3
git worktree prune
git branch -d feat/ts-migration-l3-api-2026-05-18-frontend
git push origin main
```

---

## 驗收

1. `find src/api src/parent/api -maxdepth 1 -name "*.js"` 空
2. main 上 `npm run typecheck` exit 0
3. CI Type check step pass
4. vitest baseline 維持 2310+
5. 無 `: any` 註型新增
6. `auto-imports.d.ts` / `components.d.ts` 在 repo 內
7. TODO(ts-strict) 標註已記錄 backlog

---

## L4 寫 plan 時的 carry-forward

- L4 (composables) 50 + parent/composables 14 = 64 檔，估 2 天
- composables 大量用 ref / computed / watch — `auto-imports.d.ts` 已就位
- 用 L3 完成的 api/ 型別作為 composable signature 的依據
- L2 carry-forward 第 3 條：`auth.ts` `_toBig` 對 object input 加 guard — 若 SettingsUsersTab 對應的 composable 在 L4 中、可能觸發
- L2 carry-forward 第 2 條：定 `OQRecord` interface 收緊 `IDBPDatabase<unknown>`（offlineQueue 用於 `useOfflineAttendance` composable 之類）
