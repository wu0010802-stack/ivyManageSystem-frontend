# L2 utils/ + parent/utils/ TS 轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `src/utils/` 22 檔 + `src/parent/utils/` 4 檔 = **26 檔 1950 行**轉為 TypeScript。L1 已轉的 constants/+validators/ 是 L2 的 import 上游。

**Architecture:**
- Rename `.js` → `.ts`，**不改變行為**
- 最小型 type annotation；禁 `: any`，用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict):` 過渡
- **不引入新 type alias / interface / `as const`** — minimum-friction
- 26 檔無 Vue API 引用、無 hardcoded `.js` path（grep 已驗證），收尾風險低

**Tech Stack:** TypeScript 5.9 / vue-tsc 2.2（L0 已裝）/ strict:true

**Prerequisites**：
1. L0 + L1 已 merge 進 origin/main（截至 2026-05-18 `2685dd55`）
2. main 工作樹乾淨：`git status -s` 只剩 `.claude/` untracked
3. **npm 必須 10.9.8**（不是 11.x）— L0 已踩過此坑

**Branch:** `feat/ts-migration-l2-utils-2026-05-18-frontend`
**Working directory:** Task 1 完成後 cwd 應為 `~/Desktop/ivy-frontend/.claude/worktrees/ts-l2`

**Spec reference:** spec §4 (L2)

---

## L0+L1 carry-forward（implementer 必讀）

1. **`@vue/tsconfig` 默開 `verbatimModuleSyntax: true`** → 純型別 import 用 `import type`
2. **不要 `: any`** → spec §13 規定 0 處；用 `: unknown` + narrow，或 `// @ts-expect-error TODO(ts-strict): <reason>`
3. **`auto-imports.d.ts` / `components.d.ts` CI 缺檔議題**：L2 utils/ 不用 vue auto-imports（純函式），暫時不需處理。L3 (api) 或 L4 (composables) 開頭再 commit 兩檔進 repo
4. **`employeeForm.ts` `employeeType: unknown` 收緊 `: string`**：本層第一個 commit 內順手做（小 polish，L1 reviewer 建議）

---

## File Structure

### Rename（26 檔 `.js` → `.ts`）

`src/utils/` (22)：
| File | 行數 | 重點 |
|---|---|---|
| `academic.js` | 40 | 學期/學年計算純函式 |
| `apiDedupe.js` | 95 | axios request dedupe；有 cancel/AbortController 邏輯 |
| `arrayUtils.js` | 13 | 純函式 |
| `attendanceSync.js` | 96 | 考勤同步邏輯 |
| **`auth.js`** | 286 | **用 BigInt 做權限位元檢查、imports from constants/permissions（L1 已 .ts）**；最複雜的一檔 |
| `domainBus.js` | 38 | mitt event bus |
| `download.js` | 44 | axios blob download |
| `error.js` | 50 | axios error helpers |
| `errorHandler.js` | 91 | Vue app errorHandler |
| `format.js` | 85 | 格式化（數字/日期/字串）純函式 |
| `geocoding.js` | 61 | leaflet/axios 地址轉座標 |
| `highlight.js` | 22 | 文字高亮純函式 |
| `leaves.js` | 103 | 請假計算純函式 |
| `offlineQueue.js` | 148 | IndexedDB queue（教師端離線打卡） |
| `pageTitle.js` | 51 | document.title helpers |
| `passwordRules.js` | 31 | 密碼規則驗證 |
| `printAttendanceRoll.js` | 14 | 點名單下載（後端 PDF） |
| `printPdfWindow.js` | 63 | 開新視窗印 PDF |
| `scheduleUtils.js` | 22 | 排班純函式 |
| **`sentry.js`** | 273 | Sentry init + PII scrubbing（剛 2026-05-18 落地） |
| `student.js` | 14 | 學生狀態 helpers |
| `studentLinks.js` | 9 | 學生路由 helpers |

`src/parent/utils/` (4)：
| File | 行數 | 重點 |
|---|---|---|
| `date.js` | 23 | 日期格式化 |
| `datetime.js` | 107 | 完整日期時間處理 |
| `iconMapping.js` | 78 | Element Plus icon → 字串 mapping |
| `toast.js` | 93 | ElMessage 包裝 |

### Modify（L1 carry-forward 順手做）
- `src/validators/employeeForm.ts` — 把 3 處 `employeeType: unknown` 改為 `employeeType: string`（同 commit 內做）

### Delete
- 對應 26 個 `.js`（由 `git mv` 完成）

---

## Task 1: 建立 worktree

- [ ] **Step 1: 確認 main 同步**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
echo "behind: $(git rev-list --count HEAD..origin/main) | ahead: $(git rev-list --count origin/main..HEAD)"
git status -s
```
Expected: behind=0, ahead=0, status 只有 `?? .claude/`。不乾淨則 stop。

- [ ] **Step 2: pre-flight grep hardcoded .js path**

```bash
cd ~/Desktop/ivy-frontend
grep -rn "src/utils/.*\.js\|src/parent/utils/.*\.js" --include="*.js" --include="*.ts" --include="*.vue" --include="*.mjs" --include="*.json" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v package-lock | grep -v "\.git/" | head -20
```
Expected: 空（已預先 grep 驗證乾淨，但每層開始前再跑一次防止 main 新增）。

如果有結果，stop 並列出，implementer 需要與 rename 同 commit 修正。

- [ ] **Step 3: 建立 worktree**

```bash
git worktree add .claude/worktrees/ts-l2 -b feat/ts-migration-l2-utils-2026-05-18-frontend main
cd .claude/worktrees/ts-l2
```

- [ ] **Step 4: 驗證 baseline typecheck**

```bash
npm run typecheck 2>&1 | tail -3
echo "exit=$?"
```
Expected: exit 0。如失敗，need `npx --yes npm@10.9.8 install`。

---

## Task 2: 轉換 src/utils/ 22 檔 + 順手做 employeeForm.ts polish

**Files:**
- Rename: `src/utils/*.js` × 22 → `.ts`
- Modify: `src/validators/employeeForm.ts`（L1 carry-forward: `employeeType: unknown` → `: string` × 3 處）

- [ ] **Step 1: 用 git mv 一次性 rename 22 檔**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/ts-l2
for f in academic apiDedupe arrayUtils attendanceSync auth domainBus download error errorHandler format geocoding highlight leaves offlineQueue pageTitle passwordRules printAttendanceRoll printPdfWindow scheduleUtils sentry student studentLinks; do
  git mv src/utils/${f}.js src/utils/${f}.ts
done
git status -s | head -30
```
Expected: 44 變動（22 D + 22 A，或 22 R 視 rename detection）。

- [ ] **Step 2: 處理 employeeForm.ts polish（3 處）**

Edit `src/validators/employeeForm.ts`：
- 找到 3 個 `employeeType: unknown` 改為 `employeeType: string`

可用 sed（macOS 注意 BSD 語法）：
```bash
# 在 worktree 內
sed -i '' 's/employeeType: unknown/employeeType: string/g' src/validators/employeeForm.ts
grep -n "employeeType" src/validators/employeeForm.ts
```
Expected: 3 處改為 `employeeType: string`，0 處仍是 `: unknown`。

- [ ] **Step 3: 跑 typecheck，根據 error 修**

```bash
npm run typecheck 2>&1 | tail -40
```

**常見 error 處理表**（不可加 `: any`）：

| Error 型態 | 處理 |
|---|---|
| `Parameter 'x' implicitly has an 'any' type` | 加 `: unknown` 或 specific type；參數本身可推論者改 narrow type（e.g. `: string`、`: number`） |
| `'X' is of type 'unknown'` | 用 type guard narrow：`if (typeof x === 'number')` 或 `Number(x)` cast |
| `Cannot find module '@/...' or its corresponding type declarations` | 確認 path alias 在 tsconfig 內已配置 |
| `Property 'X' does not exist on type 'Y'` | type 太窄；改用 `Record<string, unknown>` 或顯式列 property |
| BigInt 算術錯（`Operator '&' cannot be applied to types 'bigint' and 'number'`） | `Number()` 與 `BigInt()` 之間明確轉換；保留原本行為 |
| axios response type | 用 `AxiosResponse<unknown>` 或具體 schema 從 `_generated/typed`（若已有對應 endpoint） |

**禁觸**：不可移除 / 重命名任何 export、不可改商業邏輯、不可加新 dep。

**auth.js 特別注意**：BigInt 位元運算是這層核心。確保：
- `1n << 32n` 等用 BigInt literal（`n` 後綴）
- `Number()` ↔ `BigInt()` 雙向轉換正確
- 不要把 BigInt 比較改成 Number 比較（會 32-bit 截斷）

**sentry.js 特別注意**：剛在 2026-05-18 落地的 Sentry 整合，PII 過濾邏輯不可動；只加型別不改行為。

- [ ] **Step 4: 確認 vitest 沒破**

```bash
npm test 2>&1 | tail -5
```
Expected: 2287+ passed, 0 failed。

特別關注：
- `auth.test.js` / 任何 permission 相關 test
- `sentry.test.js`（PII scrubbing 邏輯）
- `offlineQueue.test.js`

如有失敗，**停止**並報告 — 可能是 BigInt 處理錯了或 sentry 邏輯被動到。

- [ ] **Step 5: 確認 build 通過**

```bash
npm run build 2>&1 | tail -3
echo "build exit=$?"
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/ src/validators/
git commit -m "$(cat <<'EOF'
feat(ts-l2): 轉 src/utils/ 22 檔為 TypeScript + employeeForm 收緊 employeeType

無行為變動。22 個 utility 檔，包含 auth (BigInt 權限位元)、sentry (PII 過濾)、
offlineQueue (IndexedDB)、apiDedupe (axios cancel) 等核心模組。

附帶 L1 carry-forward：src/validators/employeeForm.ts 的 3 處
employeeType 從 : unknown 收緊為 : string（L1 reviewer 建議）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: 確認 commit**

```bash
git log -1 --stat
```

---

## Task 3: 轉換 src/parent/utils/ 4 檔

**Files:**
- Rename: `src/parent/utils/{date,datetime,iconMapping,toast}.js` → `.ts`

- [ ] **Step 1: 用 git mv rename**

```bash
for f in date datetime iconMapping toast; do
  git mv src/parent/utils/${f}.js src/parent/utils/${f}.ts
done
```

- [ ] **Step 2: 跑 typecheck，修 error**

```bash
npm run typecheck 2>&1 | tail -30
```

按 Task 2 Step 3 的 error 處理表處理。**toast.js 注意**：用了 Element Plus 的 `ElMessage`，型別應該由 element-plus 套件自帶。

- [ ] **Step 3: 跑相關 test**

```bash
npm test 2>&1 | tail -5
```
Expected: 0 failed。

- [ ] **Step 4: 確認 build**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add src/parent/utils/
git commit -m "$(cat <<'EOF'
feat(ts-l2): 轉 src/parent/utils/ 4 檔為 TypeScript

date / datetime / iconMapping / toast。純函式，無行為變動。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 整體驗證

- [ ] **Step 1: typecheck**

```bash
npm run typecheck 2>&1 | tail -5
echo "exit=$?"
```
Expected: exit 0。

- [ ] **Step 2: vitest**

```bash
npm test 2>&1 | tail -10
```
Expected: 2287+ passed, 0 failed。

- [ ] **Step 3: build**

```bash
npm run build 2>&1 | tail -3
echo "build exit=$?"
```

- [ ] **Step 4: 沒有遺漏 .js 檔**

```bash
find src/utils src/parent/utils -name "*.js" 2>&1
```
Expected: 空。

- [ ] **Step 5: 沒有 `: any` 註型**

```bash
git diff main..HEAD -- 'src/utils/*.ts' 'src/parent/utils/*.ts' 'src/validators/*.ts' | grep -nE ':\s*any\b' | head -5
```
Expected: 空。

- [ ] **Step 6: BigInt 邏輯仍正確（auth.ts 抽樣比對）**

```bash
diff <(git show main:src/utils/auth.js) <(cat src/utils/auth.ts) | head -40
```
Expected: 只有 type annotation 新增的 + 行，無 BigInt 算術變動。

---

## Task 5: Push + 開 PR

- [ ] **Step 1: push**

```bash
git push -u origin feat/ts-migration-l2-utils-2026-05-18-frontend
```

- [ ] **Step 2: 開 PR**

```bash
gh pr create --title "feat(ts-l2): 轉 utils/ + parent/utils/ 為 TypeScript" --body "$(cat <<'EOF'
## Summary
- **26 檔 `.js` → `.ts`**：`src/utils/` 22 檔 + `src/parent/utils/` 4 檔 = **1950 行**
- **L1 carry-forward**：`src/validators/employeeForm.ts` 的 3 處 `employeeType: unknown` 收緊為 `: string`
- **無行為變動** — 純 rename + type annotation；禁 `: any`

## 關鍵檔案
- **`auth.ts`** (286 行) — BigInt 權限位元，imports L1 已轉的 `@/constants/permissions`
- **`sentry.ts`** (273 行) — 2026-05-18 才剛落地的 Sentry 整合 + PII 過濾
- **`offlineQueue.ts`** (148 行) — 教師端 IndexedDB 離線打卡佇列
- **`apiDedupe.ts`** (95 行) — axios cancel/AbortController

## Why
TS 全面遷移 L2 — utils 層。L3 (api/) 與後續 composables/components 會 import 這層。

詳細設計：
- Spec: `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md` §4 (L2)
- Plan: `docs/superpowers/plans/2026-05-18-frontend-ts-migration-l2-utils.md`

## Test plan
- [x] `npm run typecheck` exit 0
- [x] `npm test` 2287+/2287+ 全綠
- [x] `npm run build` 成功
- [x] `find src/utils src/parent/utils -name "*.js"` 空
- [x] 無 `: any` 顯式註型
- [x] auth.ts BigInt 邏輯與 L1 .js 版本邏輯等價
- [ ] CI 全綠

## L3 carry-forward
- `auto-imports.d.ts` / `components.d.ts` 缺檔議題：建議 L3 (api/) plan 開頭把兩檔 commit 進 repo（從 .gitignore 移出）
- L3 起後端缺 `response_model=` 的 endpoint 會回 `unknown`，需要 `as Shape // TODO(ts-strict): waiting on backend response_model` 過渡標註

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 等 CI**

```bash
sleep 90 && gh pr view --json statusCheckRollup --jq '.statusCheckRollup[0] | "\(.status) / \(.conclusion)"'
```
若 IN_PROGRESS，再 sleep 90 重跑。Expected: COMPLETED / SUCCESS。

CI fail 處理：
- typecheck fail：本地未跑過嗎？回 Task 4
- test fail：實測哪檔，回 Task 2/3 對應位置修
- `npm ci EUSAGE`：lockfile 問題（L2 不應動 lockfile，若 fail stop 並報告）

---

## Task 6: Merge + cleanup（user 確認後）

```bash
cd ~/Desktop/ivy-frontend
git checkout main
git fetch origin main && git pull
git merge --ff-only feat/ts-migration-l2-utils-2026-05-18-frontend  # 若 ff 不可能改 --no-ff
npx --yes npm@10.9.8 install  # 拉 deps
npm run typecheck && npm test && npm run build
git worktree remove --force .claude/worktrees/ts-l2
git worktree prune
git branch -d feat/ts-migration-l2-utils-2026-05-18-frontend
git push origin main
```

---

## 驗收（PR merge 後）

1. `find src/utils src/parent/utils -name "*.js"` 空
2. main 上 `npm run typecheck` exit 0
3. CI Type check step 仍 warning 模式但 pass
4. vitest baseline 維持 2287+
5. 無 `: any` 註型新增
6. auth.ts BigInt 行為與 L1 .js 版本等價（手動 spot check）

---

## L3 寫 plan 時的 carry-forward

- L3 (api/) 64 檔 + parent/api 21 檔 = **85 檔**，是 L1/L2 規模 3-7 倍
- 大量檔案會 import schema.d.ts 的 generated types，每個 endpoint 的 `as ApiResponse<...>` 樣板可能重複
- `auto-imports.d.ts` / `components.d.ts` commit 進 repo（從 .gitignore 移除）— L3 開工第一個 commit 做掉
- 後端缺 `response_model=` 的 endpoint backlog 需要在 L3 PR description 列出（給後端排程補）
