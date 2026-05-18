# L4 composables/ + parent/composables/ TS 轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 把 `src/composables/` 50 檔 + `src/parent/composables/` 14 檔 = **64 檔 / 6590 行**轉為 TypeScript，建立 view/component 層 hook 的型別契約。

**Architecture:**
- Rename `.js` → `.ts`，**不改變行為**
- composables 大量用 `ref<T>(...)` / `computed<T>(...)` / `watch` — Vue 推論不到時顯式註型
- 64 檔中 57 用 vue API、20 直接 import L3 api — 利用 L3 已建立的 `import type` 型別
- 利用 L3 carry-forward 在 caller side（composable 內）narrow `unknown` api 參數
- L4 為 component/view 層提供強型別 hook 簽章

**Tech Stack:** TypeScript 5.9 / vue-tsc 2.2 / strict:true / Vue 3 composition API

**Prerequisites**：
1. L0–L3 已 merge 進 origin/main（截至 `1851d773`）
2. main 工作樹乾淨：`git status -s` 應該只剩 user 的 schema.d.ts WIP 與 `.claude/`（不影響 L4）
3. **npm 必須 10.9.8**

**Branch:** `feat/ts-migration-l4-composables-2026-05-18-frontend`
**Working directory:** Task 1 完成後 cwd 應為 `~/Desktop/ivy-frontend/.claude/worktrees/ts-l4`

**Spec reference:** spec §4 (L4)

---

## L0+L1+L2+L3 carry-forward（implementer 必讀）

1. **`@vue/tsconfig` 默開 `verbatimModuleSyntax: true`** → 純型別 import 用 `import type`
2. **不要 `: any`** → 用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`
3. **`auto-imports.d.ts` / `components.d.ts` 已 commit 進 repo**（L3 prep）；vite dev/build 會 regenerate，若 modify 出現在 git status 須 commit 進對應 PR
4. **L3 290 個 api `unknown` 參數**：composable 內呼叫 api 時，在 composable signature 處定 inline type 把 `unknown` narrow，例如：
   ```ts
   export function useFooList(params: { classroom_id?: number; status?: string } = {}) {
     return getFooList(params) // L3 api 收 unknown，這裡 caller 自己 narrow
   }
   ```
5. **L3 `.data` 已 unwrap 的 3 檔**：`@/api/fees`、`@/api/portalClassHub:7`、`@/api/reports:36` 已自己解包 `.data`，composable **不要再 `.data`**
6. **`domainBus.ts` 無 event map**（L2 留下，L4 解）— 如有 composable 用到，在本層定義 event map：
   ```ts
   import mitt from 'mitt'
   type EventMap = { 'employee:updated': { id: number }; ... }
   export const domainBus = mitt<EventMap>()
   ```
   或留 `unknown` 並標 `// TODO(ts-strict): event map L4`（看實際使用情況）
7. **`useAbortableFetch.js`**（parent composables）— L3 留下 8 處 `as object` cast 在 parent/api，這層用 `AxiosRequestConfig` 取代是契機

---

## Pre-authorized collateral updates

### vite.config.js — 1 行
- Line 48: `id.includes('/src/composables/useCachedAsync.js')` → `useCachedAsync.ts`

### test docstring — 0 處（pre-flight grep 確認）

---

## File Structure

### Rename
- `src/composables/*.js` × 50 → `.ts`
- `src/parent/composables/*.js` × 14 → `.ts`

### Modify (collateral)
- `vite.config.js` 1 行

### Delete
- 對應 64 個 `.js`（git mv）

---

## Task 1: 建立 worktree + pre-flight

- [ ] **Step 1: main 同步**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
echo "behind: $(git rev-list --count HEAD..origin/main) | ahead: $(git rev-list --count origin/main..HEAD)"
git status -s
```
Expected: behind=0, ahead=0；status 可能有 `.claude/` 與 user 並行 WIP（如 `src/api/_generated/schema.d.ts`）— 與 L4 無關，無妨。

- [ ] **Step 2: pre-flight grep**

```bash
grep -rn "src/composables/.*\.js\|src/parent/composables/.*\.js" --include="*.js" --include="*.ts" --include="*.vue" --include="*.mjs" --include="*.json" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v package-lock | grep -v "\.git/" | grep -v "\.claude/worktrees/"
```
Expected 命中：
- `vite.config.js:48` `useCachedAsync.js`

**若有其他 refs**，列入 collateral list 同 commit 處理。

- [ ] **Step 3: 建立 worktree**

```bash
git worktree add .claude/worktrees/ts-l4 -b feat/ts-migration-l4-composables-2026-05-18-frontend main
cd .claude/worktrees/ts-l4
```

- [ ] **Step 4: baseline typecheck**

```bash
npm run typecheck 2>&1 | tail -3
echo "exit=$?"
```
Expected: exit 0。

---

## Task 2: 轉換 src/composables/ 50 檔 + vite.config.js collateral

**Files:**
- Rename: `src/composables/*.js` × 50 → `.ts`
- Modify: `vite.config.js` line 48

- [ ] **Step 1: git mv rename**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/ts-l4
for f in $(ls src/composables/ | grep "\.js$" | sed 's/\.js$//'); do
  git mv src/composables/${f}.js src/composables/${f}.ts
done
git status -s | head -20
```

- [ ] **Step 2: vite.config.js collateral**

Edit `vite.config.js:48` — `useCachedAsync.js` → `useCachedAsync.ts`。

驗證：
```bash
grep -nE "src/composables/.*\.(js|ts)" vite.config.js
```
Expected: 1 行 `.ts`，0 行 `.js`。

- [ ] **Step 3: typecheck，依下表處理**

```bash
npm run typecheck 2>&1 | tail -60
```

**Common error patterns（禁 `: any`）：**

| Error 型態 | 處理 |
|---|---|
| `Parameter 'x' implicitly has an 'any' type` | composable signature 加 inline type；ref 參數 `MaybeRef<T>` 或 `Ref<T>` 或顯式 `: T` |
| `Type 'Ref<unknown>' is not assignable to type 'Ref<T>'` | `ref<T>(initial)` 顯式 type argument |
| `Object is possibly 'undefined'` | optional chain 或 type guard；不要硬塞 `!` |
| `'X' is of type 'unknown'` (從 L3 api 來) | composable 自己定 inline type narrow params |
| `'this' implicitly has type 'any'` | composable 不該用 this — 應該全 arrow / const declaration |
| `Cannot find module '@/...'` | path alias，stop 報告 |
| `Property 'X' does not exist on type '{}'` | response 對象需 narrow，如 `data as { detail?: string }` |
| `Element Plus 元件 X 沒型別` | components.d.ts 有；如真的缺，加在本 layer 而非新增 |

**特別處理**：
- `useApprovalModule.js`：用 `getApprovalLogs` from L3 api、`useApprovalPolicyStore` from store（L5 才轉）、`getUserInfo` from L2 utils。store 仍是 .js — call site 可能要 type cast。**不轉 store**。
- `useCachedAsync.js` / `useAsyncState.js`：用 generic、可能要顯式註型 `<T>` argument
- `domainBus` 使用者（需 grep 確認）：如有，定 event map
- `useAbortableFetch.js`（parent，第 14 檔）：解 L3 carry-forward #4，用 `AxiosRequestConfig`

**❌ 禁觸**：
- 不可移除 / 重命名任何 export
- 不可改 hook signature 的回傳結構（如 `{ data, loading, error }`）
- 不可加新 dep
- 不可加 `: any`

**`auto-imports.d.ts` / `components.d.ts`**：build 會 regenerate，若 modify 出現在 git status 一併 stage。

- [ ] **Step 4: 跑 vitest（特別關注 composable tests）**

```bash
npm test 2>&1 | tail -10
```
Expected: 2310+ passed, 0 failed。42 個 composable tests 全綠。

- [ ] **Step 5: 跑 build**

```bash
npm run build 2>&1 | tail -3
echo "build exit=$?"
```

- [ ] **Step 6: 統計 @ts-expect-error / TODO(ts-strict)**

```bash
grep -rn "TODO(ts-strict)\|@ts-expect-error" src/composables/*.ts | wc -l | tr -d ' '
```

- [ ] **Step 7: Commit**

```bash
# 注意：若 auto-imports.d.ts 或 components.d.ts 變動，一起 add
git add src/composables/ vite.config.js
git status -s | grep -E "auto-imports|components\.d\.ts" && git add auto-imports.d.ts components.d.ts 2>/dev/null
git commit -m "$(cat <<'EOF'
feat(ts-l4): 轉 src/composables/ 50 檔為 TypeScript

無行為變動。50 個 composable，含 useApprovalModule / useCachedAsync /
useAsyncState / useRecruitmentCharts 等。利用 L3 api 已建立的 import
type 在 caller side narrow unknown 參數。

附帶連動更新：
- vite.config.js:48 manualChunks useCachedAsync.js → .ts

過渡標註：N 處 // TODO(ts-strict): <reason>。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 轉換 src/parent/composables/ 14 檔（含 useAbortableFetch L3 carry-forward）

**Files:**
- Rename: `src/parent/composables/*.js` × 14 → `.ts`
- **Bonus**：`useAbortableFetch.ts` 用 `AxiosRequestConfig` 收緊（解 L3 #4 carry-forward）

- [ ] **Step 1: git mv**

```bash
for f in $(ls src/parent/composables/ | grep "\.js$" | sed 's/\.js$//'); do
  git mv src/parent/composables/${f}.js src/parent/composables/${f}.ts
done
```

- [ ] **Step 2: typecheck**

```bash
npm run typecheck 2>&1 | tail -30
```
依 Task 2 Step 3 表處理。

**useAbortableFetch 特別處理**：
- 讀 `src/parent/composables/useAbortableFetch.ts` 確認簽章
- 若該 composable 把 config 傳到 parent api（8 處用 `as object` cast 的 file），用 `AxiosRequestConfig` 型別
- 例如：

```ts
// Before
export function useAbortableFetch<T>(fetcher: (config: object) => Promise<T>) {
  const controller = new AbortController()
  return fetcher({ signal: controller.signal } as object)
}

// After
import type { AxiosRequestConfig } from 'axios'
export function useAbortableFetch<T>(fetcher: (config: AxiosRequestConfig) => Promise<T>) {
  const controller = new AbortController()
  return fetcher({ signal: controller.signal })
}
```

然後 8 個 parent/api 那邊的 `as object` cast 在 caller 是 useAbortableFetch 的話可以自然解掉。**但不要碰 parent/api/*.ts** — 那是 L3 的範圍；只動 composable 端的型別契約。實際清掉 parent/api 內的 `as object` 屬 follow-up 不在 L4 範圍。

- [ ] **Step 3: vitest + build**

```bash
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/composables/
git status -s | grep -E "auto-imports|components\.d\.ts" && git add auto-imports.d.ts components.d.ts 2>/dev/null
git commit -m "$(cat <<'EOF'
feat(ts-l4): 轉 src/parent/composables/ 14 檔為 TypeScript

無行為變動。useA11y / useAbortableFetch / useChildSelection /
useChildTimeline / useConnectionStatus / useFaq / useFaqSearch /
useIncrementalRender / usePullToRefresh / useSnackbar / useTheme /
useTodayStatusCache / useTodayTimeline + index。

useAbortableFetch 簽章從 `config: object` 收緊為 `config: AxiosRequestConfig`
（L3 carry-forward #4），讓 caller 自然提供 axios 型別。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 整體驗證

- [ ] **Step 1: typecheck / vitest / build**

```bash
npm run typecheck 2>&1 | tail -3; echo "tc exit=$?"
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3; echo "build exit=$?"
```

- [ ] **Step 2: 沒有遺漏 .js**

```bash
find src/composables src/parent/composables -name "*.js" 2>&1
```
Expected: 空。

- [ ] **Step 3: 沒有 `: any`**

```bash
git diff main..HEAD -- 'src/composables/*.ts' 'src/parent/composables/*.ts' | grep -nE ':\s*any\b' | head -5
```
Expected: 空。

- [ ] **Step 4: 沒有新 type alias / interface（除必要的 event map）**

```bash
git diff main..HEAD -- 'src/composables/*.ts' 'src/parent/composables/*.ts' | grep -E "^\+" | grep -E "^\+(type [A-Z]|interface )" | head
```
Spec 嚴禁，但 `domainBus` event map 是合理的例外（mitt 設計就需要 type 參數）。

---

## Task 5: Push + 開 PR

- [ ] **Step 1: push**

```bash
git push -u origin feat/ts-migration-l4-composables-2026-05-18-frontend
```

- [ ] **Step 2: 開 PR**

```bash
gh pr create --title "feat(ts-l4): 轉 composables/ + parent/composables/ 為 TypeScript（64 檔）" --body "$(cat <<'EOF'
## Summary
- **64 檔 `.js` → `.ts`**：`src/composables/` 50 + `src/parent/composables/` 14 = **6590 行**
- L3 carry-forward 順手解：`useAbortableFetch` 用 `AxiosRequestConfig` 取代 `object`
- 連動：`vite.config.js:48` useCachedAsync.js → .ts

## Why
L4 — Vue composables 層。component/view 層 hook 的型別契約。L5 (stores) / L6 (components) / L7 (views) 起會 import 這層。

詳細設計：
- Spec: `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md` §4 (L4)
- Plan: `docs/superpowers/plans/2026-05-18-frontend-ts-migration-l4-composables.md`

## Test plan
- [x] `npm run typecheck` exit 0
- [x] `npm test` 2310+/2310+ 全綠（42 個 composable tests 含）
- [x] `npm run build` 成功
- [x] `find src/composables src/parent/composables -name "*.js"` 空
- [x] 無 `: any`
- [ ] CI 全綠

## L5 carry-forward
（implementer 補完）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 等 CI**

```bash
sleep 180 && gh pr view --json statusCheckRollup --jq '.statusCheckRollup[0] | "\(.status) / \(.conclusion)"'
```
Expected: COMPLETED / SUCCESS。

---

## Task 6: Merge + cleanup（user 確認後）

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main && git checkout main && git pull
git merge feat/ts-migration-l4-composables-2026-05-18-frontend
npx --yes npm@10.9.8 install
npm run typecheck && npm test && npm run build
git worktree remove --force .claude/worktrees/ts-l4
git worktree prune
git branch -d feat/ts-migration-l4-composables-2026-05-18-frontend
git push origin main
```

---

## 驗收

1. `find src/composables src/parent/composables -name "*.js"` 空
2. main 上 `npm run typecheck` exit 0
3. CI Type check step pass
4. vitest baseline 維持 2310+
5. 無 `: any` 新增
6. `useAbortableFetch` 用 `AxiosRequestConfig`

## L5 寫 plan 時的 carry-forward

- L5 stores: `src/stores/` 17 + `src/parent/stores/` 3 + `src/parent/services/` 1 = 21 檔
- L4 composables 已用 store；L5 轉時 caller composable 已是 .ts，所以 store 簽章變化會直接出 error 在 composable — 反過來逼著 store 寫對
- L4 留下的 `domainBus` event map 若 L5 store 有用 emit/on，可以一併擴 event map
- Sentry `@ts-expect-error` 3 處在 sentry.ts 等 L5 entry points（main.ts/parent/main.ts/public/main.ts）— L7c 解
- `_retried` 兩處 module augmentation 抽 `types/axios-ext.d.ts` defer 到 L9 收尾
