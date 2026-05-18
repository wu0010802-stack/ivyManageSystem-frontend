# L1 constants/ + validators/ TS 轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/constants/` (12 .js) + `src/validators/` (1 .js) = 13 個 leaf-layer 純值匯出檔轉成 `.ts`，建立 L2-L9 後續轉換的依賴基底。

**Architecture:**
- Rename `.js` → `.ts`，**不改變行為**
- 不添加 `as const`、不引入新 type alias、不重構結構 — 只做最小型 TS 化讓 vue-tsc 通過
- TypeScript 自動推論型別；不顯式註型除非 strict mode 需要
- 13 檔總共 634 行，全部純 export const（無 vue API 引用、無 bit operations、無動態邏輯）

**Tech Stack:** TypeScript 5.9.x, vue-tsc 2.2.x（L0 已裝），既有 strict:true tsconfig

**Prerequisites (本 plan 才能開工)**：
1. L0 已 merge 進 origin/main ✅（commit a3b463d8..34040250）
2. main 工作樹乾淨：`git status -s` 應只剩 `.claude/` untracked
3. **npm 版本必須是 10.9.8**（不是 11.x）— 否則 lockfile 會壞 CI（L0 已踩過此坑）

**Branch:** `feat/ts-migration-l1-constants-validators-2026-05-18-frontend`
**Working directory:** Task 1 完成後 cwd 應為 `~/Desktop/ivy-frontend/.claude/worktrees/ts-l1`

**Spec reference:** `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md` §4 (L1)

---

## L0 carry-forward（implementer 必讀）

1. **`@vue/tsconfig` 默開 `verbatimModuleSyntax: true`**：任何純型別 import 必須用 `import type { Foo } from "./bar"`，bare `import { Foo }` 會 TS 錯（不過 L1 檔案幾乎沒有 import，這點主要 L2+ 用到）
2. **不要使用 `: any` 顯式註型**（spec §13 規定 0 處）
3. **如需過渡標註**用 `// @ts-expect-error TODO(ts-strict): <reason>` 並在 PR description 列出

---

## File Structure

### Rename（13 檔 `.js` → `.ts`）

| Path | 行數 | 內容性質 |
|---|---|---|
| `src/constants/activity.js` | 70 | 課程類別、狀態列舉 |
| `src/constants/approvalEnums.js` | 36 | 審核狀態列舉 |
| `src/constants/employee.js` | 41 | 員工角色列舉 |
| `src/constants/employeeFields.js` | 86 | 員工欄位中文標籤 map |
| `src/constants/index.js` | 5 | barrel re-export |
| `src/constants/laborCompliance.js` | 9 | 勞基法常數 |
| `src/constants/permissions.js` | 156 | 權限位元 + ROUTE_PERMISSION_RULES |
| `src/constants/pos.js` | 80 | POS 系統列舉 |
| `src/constants/recruitment.js` | 11 | 招生狀態 |
| `src/constants/routes.js` | 42 | 前端路由常數 |
| `src/constants/student.js` | 11 | 學生狀態列舉 |
| `src/constants/studentRecords.js` | 30 | 學生紀錄類型列舉 |
| `src/validators/employeeForm.js` | 57 | employee form validation 純函式 |

### Modify
- 無（不動 import 路徑 — Vite 與 TS 對副檔名 agnostic）

### Delete
- 對應 13 個 `.js` 檔（由 `git mv` 完成）

---

## Task 1: 建立 worktree 切到 L1 分支

**Files:** N/A（git 操作）

- [ ] **Step 1: 確認 main 同步**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
echo "behind: $(git rev-list --count HEAD..origin/main) | ahead: $(git rev-list --count origin/main..HEAD)"
git status -s
```
Expected: behind=0, ahead=0, status 只有 `?? .claude/`。

如果不乾淨，stop 並報告 user。

- [ ] **Step 2: 建立 L1 worktree**

```bash
cd ~/Desktop/ivy-frontend
git worktree add .claude/worktrees/ts-l1 -b feat/ts-migration-l1-constants-validators-2026-05-18-frontend main
cd .claude/worktrees/ts-l1
```
Expected: worktree 建立成功，head 為 main 最新 commit (`5cfbcf21` 或之後)。

- [ ] **Step 3: 驗證 worktree typecheck baseline**

```bash
npm run typecheck 2>&1 | tail -3
echo "exit=$?"
```
Expected: exit 0（L0 已建立 tsconfig + 工具鏈）。

如果這裡就 fail，stop — 可能是 worktree node_modules symlink 問題（L0 已踩過），need `npx --yes npm@10.9.8 install`。

---

## Task 2: 轉換 constants/ 12 檔

**Files:**
- Rename: `src/constants/{activity,approvalEnums,employee,employeeFields,index,laborCompliance,permissions,pos,recruitment,routes,student,studentRecords}.js` → `.ts`

- [ ] **Step 1: 用 git mv 一次性 rename 12 檔**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/ts-l1
for f in activity approvalEnums employee employeeFields index laborCompliance permissions pos recruitment routes student studentRecords; do
  git mv src/constants/${f}.js src/constants/${f}.ts
done
git status -s | head -20
```
Expected: 24 個變動（12 個 `D` + 12 個 `A`，或 12 個 `R` 視 git rename detection 而定）。

- [ ] **Step 2: 跑 typecheck 看哪些檔需要修**

```bash
npm run typecheck 2>&1 | tail -30
```
Expected: 大多數可能直接通過。**若有 error，依下表處理**：

| Error 型態 | 處理方式 |
|---|---|
| `Type 'X' is not assignable to type 'Y'` 在 const 賦值 | TS 推論偏窄，加 `as Type` 或調整 const 結構（**不可加 `any`**） |
| `Object literal may only specify known properties` | 對應的 type alias 太窄；移除 type 註型讓 TS 推論 |
| `'foo' is declared but its value is never read` | 不應出現（`noUnusedLocals: false`）；若出現，回頭檢查 tsconfig |
| `Cannot redeclare block-scoped variable` | 兩個 `.js` 與 `.ts` 同時存在；確認 git mv 正確 rename |
| `Cannot find module` | import 對方還是 `.js`，但這層轉換不應影響到別人 — 如果出現，可能 vite/typescript module resolution issue，停下報告 |

**不修任何業務邏輯，只調整型別讓 strict 過。**

- [ ] **Step 3: 跑 vitest 確認測試沒破**

```bash
npm test 2>&1 | tail -5
```
Expected: 2287+ 通過、0 failed（與 L0 完成時 baseline 一致）。

- [ ] **Step 4: 確認 build 通過**

```bash
npm run build 2>&1 | tail -3
echo "build exit=$?"
```
Expected: build exit 0。

- [ ] **Step 5: Commit constants/**

```bash
git add src/constants/
git commit -m "$(cat <<'EOF'
feat(ts-l1): 轉 src/constants/ 12 檔為 TypeScript

純 export const，無行為變動。包含 permissions / activity / employee /
employeeFields / approvalEnums / pos / recruitment / routes / student /
studentRecords / laborCompliance / index 12 檔。

permissions.js 的 BigInt 位元運算議題（> 32-bit 位元）不在本層處理 —
實際 bit op 在 utils/auth.js 等，屬 L2 範圍。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: 確認 commit 成功**

```bash
git log -1 --stat
```
Expected: 顯示 12 個 R（rename）或 24 個 A/D entry。

---

## Task 3: 轉換 validators/employeeForm.js

**Files:**
- Rename: `src/validators/employeeForm.js` → `.ts`

- [ ] **Step 1: 用 git mv rename**

```bash
git mv src/validators/employeeForm.js src/validators/employeeForm.ts
```

- [ ] **Step 2: 跑 typecheck**

```bash
npm run typecheck 2>&1 | tail -15
```
Expected: exit 0。

**若 employeeForm 有純函式需要 type annotation**：employee form validators 可能接收 form data object 並返回 errors object。typical pattern:

```ts
// Before (JS):
export function validateEmployee(form) { ... }

// After (TS, minimum-friction):
export function validateEmployee(form: Record<string, unknown>): Record<string, string> { ... }
```

只在 TS 報錯時才加註型；能不加就不加（讓 implicit any 觸發後再來補）。**禁用 `: any`，改用 `: unknown`。**

- [ ] **Step 3: 跑相關 test**

```bash
npm test -- tests/unit/validators 2>&1 | tail -5
```
Expected: 0 failed（如果有對應 test）。如果沒有 validators test，跳過此步。

- [ ] **Step 4: Commit validators/**

```bash
git add src/validators/
git commit -m "$(cat <<'EOF'
feat(ts-l1): 轉 src/validators/employeeForm.js 為 TypeScript

純 function exports，無行為變動。參數型別使用 unknown 並依需要 narrow。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 整體驗證

**Files:** N/A（驗證）

- [ ] **Step 1: 完整 typecheck**

```bash
npm run typecheck 2>&1 | tail -10
echo "exit=$?"
```
Expected: exit 0。

- [ ] **Step 2: 完整 vitest**

```bash
npm test 2>&1 | tail -10
```
Expected: 2287+ passed, 0 failed。

- [ ] **Step 3: 完整 build**

```bash
npm run build 2>&1 | tail -10
echo "build exit=$?"
```
Expected: build exit 0。

- [ ] **Step 4: 確認沒有遺漏 .js 檔**

```bash
find src/constants src/validators -name "*.js" 2>&1
```
Expected: **空輸出**（全部已轉 .ts）。

- [ ] **Step 5: 確認新 .ts 檔行為與舊 .js 一致（手動 sanity）**

```bash
# 對其中一個檔抽樣比對：先取 git show HEAD~2:src/constants/permissions.js（轉換前版本）
# 與 HEAD:src/constants/permissions.ts 內容（轉換後版本）— 應 byte-identical 除了副檔名
diff <(git show HEAD~2:src/constants/permissions.js) <(cat src/constants/permissions.ts) | head -20
```
Expected: 空輸出（內容完全一致）或只有 type annotation 新增的少量 diff。

**若內容有實質差異**（非註型添加），stop — implementer 改動了行為，需 review。

- [ ] **Step 6: 沒有 `: any` 出現**

```bash
git diff main..HEAD -- 'src/constants/*.ts' 'src/validators/*.ts' | grep -nE ':\s*any\b' | head -5
```
Expected: 空輸出（spec §13 規定）。

如果有出現，回頭檢查是否能改 `unknown` + type guard，或用 `// @ts-expect-error TODO(ts-strict): ...`。

---

## Task 5: Push + 開 PR

- [ ] **Step 1: Push 分支**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/ts-l1
git push -u origin feat/ts-migration-l1-constants-validators-2026-05-18-frontend
```

- [ ] **Step 2: 開 PR**

```bash
gh pr create --title "feat(ts-l1): 轉 constants/ + validators/ 為 TypeScript" --body "$(cat <<'EOF'
## Summary
- 13 檔 `.js` → `.ts`：constants/ 12 檔 + validators/ 1 檔
- **無行為變動** — 純檔案 rename + 必要時最小型 type annotation
- permissions.js 的 BigInt 位元運算議題 defer 到 L2（utils 層才會碰）

## Why
TS 全面遷移 L1 — 葉子層轉換。L2 (utils) 開始有 import 依賴這層的型別。

詳細設計：spec §4 (L1)
- Spec: `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md`
- Plan: `docs/superpowers/plans/2026-05-18-frontend-ts-migration-l1-constants-validators.md`

## Test plan
- [x] `npm run typecheck` exit 0
- [x] `npm test` 2287+/2287+ 全綠
- [x] `npm run build` 成功
- [x] `find src/constants src/validators -name "*.js"` 空
- [x] 無 `: any` 顯式註型

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL 印出。

- [ ] **Step 3: 等 CI**

```bash
sleep 60 && gh pr view --json statusCheckRollup --jq '.statusCheckRollup[0].conclusion'
```
若仍 IN_PROGRESS，再 sleep 60 重跑。Expected 最終 SUCCESS。

如果 CI fail：抓 log
```bash
gh run view <run_id> --log-failed | head -30
```
依錯誤類型修：
- `npm ci EUSAGE`：lockfile 問題，**不應該發生**（L1 沒動 lockfile）— 若發生 stop 報告
- `typecheck error`：本地未跑過嗎？回 Task 4
- `test fail`：實際測試破了，回 Task 4 修

---

## Task 6: Merge + cleanup（user 確認後）

**user 選 local merge / GitHub merge / 留 PR 後再回來處理**。預設 GitHub squash 或 merge button。

完成後本地清理：
```bash
cd ~/Desktop/ivy-frontend
git worktree remove --force .claude/worktrees/ts-l1
git worktree prune
git fetch origin main && git checkout main && git pull
git branch -D feat/ts-migration-l1-constants-validators-2026-05-18-frontend
```

---

## L2 carry-forward（寫 L2 plan 時要包進去）

- L2 起 utils/ 22 檔會有實際邏輯 — permissions BigInt 議題、bit op、date 處理 都會碰到
- 若 L4 之前不解 `auto-imports.d.ts` CI 問題、L4 composables 會炸（用到 ref/computed auto-import）— 預計在 L2 或 L3 加一個小 PR：commit `auto-imports.d.ts` + `components.d.ts` 進 repo（從 .gitignore 移除）
- L2 開始才會有 implicit any 型別錯誤湧出 — 注意過渡標註 budget

---

## 驗收（PR merge 後）

1. `find src/constants src/validators -name "*.js"` 空
2. main 上 `npm run typecheck` exit 0
3. CI Type check step 仍 warning 模式但 pass
4. vitest baseline 2287+/2287+ 維持
5. 無 `: any` 顯式註型新增
