# L5 stores/ + parent/stores/ + parent/services/ TS 轉換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 把 `src/stores/` 17 檔 + `src/parent/stores/` 3 檔 + `src/parent/services/` 1 檔 = **21 檔 / 1463 行**轉為 TypeScript。順手解 L4 carry-forward #3 — `utils/domainBus.ts` 加 event map type。

**Architecture:**
- Rename `.js` → `.ts`，**不改變行為**
- Pinia store 用 setup syntax (`defineStore('name', () => { ... })`) 的型別在 Pinia 4 內建良好；ref/computed 顯式 `<T>` 註型
- 利用 L1 已 .ts 的 constants、L2 已 .ts 的 utils、L3 已 .ts 的 api、L4 已 .ts 的 composables 提供的型別
- L4 composables 已 .ts 並 import store；本層轉檔後 composable 端會自動拿到 store 型別

**Tech Stack:** TypeScript 5.9 / vue-tsc 2.2 / strict:true / Pinia 2 / mitt 3

**Prerequisites**：
1. L0–L4 已 merge 進 origin/main（截至 `634074c4`）
2. main 工作樹乾淨：`git status -s` 應只剩 user WIP（schema.d.ts / DismissalQueueView 系列）與 `.claude/`，不影響 L5
3. **npm 必須 10.9.8**

**Branch:** `feat/ts-migration-l5-stores-2026-05-18-frontend`
**Working directory:** Task 1 完成後 cwd 應為 `~/Desktop/ivy-frontend/.claude/worktrees/ts-l5`

**Spec reference:** spec §4 (L5)

---

## L0–L4 carry-forward（implementer 必讀）

1. **`@vue/tsconfig` 默開 `verbatimModuleSyntax: true`** → 純型別 import 用 `import type`
2. **不要 `: any`** → 用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`
3. **`auto-imports.d.ts` / `components.d.ts` 已 commit 進 repo**（L3 prep）；vite dev/build 會 regenerate，若 modify 出現在 git status 一併 commit
4. **L4 19 個 pragmatic exception named types 已接受** — L5 同精神：同檔內 3+ 處用且 inline 嚴重損 DX 的 type alias 可保留，明確違反（單一次用、`as const`）應 inline
5. **`useAbortableFetch` 已收緊為 `(config: AxiosRequestConfig) => Promise<T>`**（L3 #4 解了）
6. **`fees.ts` / `portalClassHub.ts:7` / `reports.ts:36` 自己 `.then(res => res.data)` unwrap** — store/composable 用時別重複 `.data`

---

## Pre-authorized collateral updates

### vite.config.js — 3 行（pre-flight grep'd）
- Line 75: `id.includes('/src/stores/_createFetchStore.js')` → `.ts`
- Line 76: `id.includes('/src/stores/employee.js')` → `.ts`
- Line 88: `id.includes('/src/stores/activity.js')` → `.ts`

### src/stores/portalMessages comment — 1 行（pre-flight grep'd）
- Line 4: `* 仿 src/parent/stores/messages.js 設計` → `messages.ts`

### Bonus task：`utils/domainBus.ts` event map（L4 carry-forward #3）
**Why**：3 個 store（syncBridge / student / studentRecords）+ 5 個 component 用 `domainBus.emit(STUDENT_EVENTS.CREATED, payload)` 與 `domainBus.on(STUDENT_EVENTS.UPDATED, ({ id, patch }) => ...)`。L4 implementer 沒補是因為 utils 屬 L2 範圍；本 plan 跨層補一層 type map。

**修改** `src/utils/domainBus.ts`：定 `DomainEventMap` 並讓 `mitt` 接受 generic：

```ts
import mitt, { type Emitter } from 'mitt'

// 事件名稱常數（既有）
export const STUDENT_EVENTS = {
  CREATED: 'student:created',
  UPDATED: 'student:updated',
  DELETED: 'student:deleted',
  TRANSFERRED: 'student:transferred',
  LIFECYCLE_CHANGED: 'student:lifecycle_changed',
} as const  // ← 允許 const 物件加 `as const`（值常數定義，不是 type 衍生工具）

export const RECORD_EVENTS = {
  CREATED: 'record:created',
  UPDATED: 'record:updated',
  DELETED: 'record:deleted',
} as const

export const ATTENDANCE_EVENTS = {
  CHANGED: 'attendance:changed',
} as const

// 對應 payload 型別
export type DomainEventMap = {
  'student:created': { id: number; [key: string]: unknown }
  'student:updated': { id: number; patch: Record<string, unknown> }
  'student:deleted': { id: number }
  'student:transferred': { ids: number[]; to_classroom_id?: number; [key: string]: unknown }
  'student:lifecycle_changed': { id: number; to_status: string; [key: string]: unknown }
  'record:created': { id: number; student_id?: number; [key: string]: unknown }
  'record:updated': { id: number; student_id?: number; [key: string]: unknown }
  'record:deleted': { id: number; student_id?: number; [key: string]: unknown }
  'attendance:changed': { [key: string]: unknown }
}

export const domainBus: Emitter<DomainEventMap> = mitt<DomainEventMap>()
```

**注意**：
- `as const` 對 event 名稱**值物件**是合理的 — spec 的禁令是 type-derived `as const`（如 L4 `useAnalyticsTimeRange` 的 `Preset = typeof PRESETS[number]`），不是值常數定義
- 新增 `DomainEventMap` type 是 L4 carry-forward #3 明訂要做、spec `domainBus` 例外條款明文接受
- payload shape 用 `{ id: number; [key: string]: unknown }` 寬鬆允許 store 多傳欄位（既有 .emit 都帶額外 metadata）

---

## File Structure

### Rename
- `src/stores/*.js` × 17 → `.ts`
- `src/parent/stores/*.js` × 3 → `.ts`
- `src/parent/services/*.js` × 1 → `.ts`

### Modify (collateral + bonus)
- `vite.config.js` 3 行
- `src/stores/portalMessages.ts:4` comment
- `src/utils/domainBus.ts` 加 `DomainEventMap` + typed `Emitter<DomainEventMap>`（解 L4 #3）

### Delete
- 對應 21 個 `.js`（git mv）

---

## Task 1: 建立 worktree + pre-flight

- [ ] **Step 1: main 同步**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
echo "behind: $(git rev-list --count HEAD..origin/main) | ahead: $(git rev-list --count origin/main..HEAD)"
git status -s
```

- [ ] **Step 2: re-grep hardcoded refs**

```bash
grep -rn "src/stores/.*\.js\|src/parent/stores/.*\.js\|src/parent/services/.*\.js" --include="*.js" --include="*.ts" --include="*.vue" --include="*.mjs" --include="*.json" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v package-lock | grep -v "\.git/" | grep -v "\.claude/worktrees/" | head -15
```
Expected 命中：vite.config.js:75/76/88 + src/stores/portalMessages.js:4 comment。

- [ ] **Step 3: 建 worktree**

```bash
git worktree add .claude/worktrees/ts-l5 -b feat/ts-migration-l5-stores-2026-05-18-frontend main
cd .claude/worktrees/ts-l5
```

- [ ] **Step 4: baseline typecheck**

```bash
npm run typecheck 2>&1 | tail -3; echo "exit=$?"
```

---

## Task 2: 轉換 src/stores/ 17 檔 + collateral + utils/domainBus event map

**Files:**
- Rename: `src/stores/*.js` × 17 → `.ts`
- Modify: `vite.config.js` 3 行（lines 75, 76, 88）
- Modify: `src/stores/portalMessages.ts:4` comment（rename 後在 .ts 版本內）
- Modify: `src/utils/domainBus.ts` 加 `DomainEventMap` + typed `Emitter<DomainEventMap>`

- [ ] **Step 1: git mv rename 17 個 store**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/ts-l5
for f in $(ls src/stores/ | grep "\.js$" | sed 's/\.js$//'); do
  git mv src/stores/${f}.js src/stores/${f}.ts
done
git status -s | head -20
```

- [ ] **Step 2: vite.config.js collateral**

Use Edit tool: lines 75, 76, 88 — `.js` → `.ts`。

驗證：`grep -nE "src/stores/.*\.(js|ts)" vite.config.js` 應 3 條 `.ts`、0 條 `.js`。

- [ ] **Step 3: portalMessages.ts comment fix**

```bash
sed -i '' 's|src/parent/stores/messages\.js|src/parent/stores/messages.ts|g' src/stores/portalMessages.ts
grep -n "messages\.\(js\|ts\)" src/stores/portalMessages.ts
```

- [ ] **Step 4: utils/domainBus.ts 加 event map（L4 carry-forward #3）**

Read `src/utils/domainBus.ts` 看當前內容（L2 已轉 .ts 但未加 type map）。改為（保留所有既有 export，加 `DomainEventMap` 與 typed `domainBus`）：

```ts
import mitt, { type Emitter } from 'mitt'

export const STUDENT_EVENTS = {
  CREATED: 'student:created',
  UPDATED: 'student:updated',
  DELETED: 'student:deleted',
  TRANSFERRED: 'student:transferred',
  LIFECYCLE_CHANGED: 'student:lifecycle_changed',
} as const

export const RECORD_EVENTS = {
  CREATED: 'record:created',
  UPDATED: 'record:updated',
  DELETED: 'record:deleted',
} as const

export const ATTENDANCE_EVENTS = {
  CHANGED: 'attendance:changed',
} as const

export type DomainEventMap = {
  'student:created': { id: number; [key: string]: unknown }
  'student:updated': { id: number; patch: Record<string, unknown> }
  'student:deleted': { id: number }
  'student:transferred': { ids: number[]; to_classroom_id?: number; [key: string]: unknown }
  'student:lifecycle_changed': { id: number; to_status: string; [key: string]: unknown }
  'record:created': { id: number; student_id?: number; [key: string]: unknown }
  'record:updated': { id: number; student_id?: number; [key: string]: unknown }
  'record:deleted': { id: number; student_id?: number; [key: string]: unknown }
  'attendance:changed': { [key: string]: unknown }
}

export const domainBus: Emitter<DomainEventMap> = mitt<DomainEventMap>()
```

**確認**：
- 若原本還有其他 export（如 helper 函式），保留
- `as const` 用在值常數對象（mapping string keys to event name string）— spec 允許（L4 `useAnalyticsTimeRange` 違反的是 type-derivation `as const`，這裡不是）
- 不刪 / 不改 const 名稱

- [ ] **Step 5: typecheck，處理 error**

```bash
npm run typecheck 2>&1 | tail -40
```

**Common errors（禁 `: any`）：**

| Error 型態 | 處理 |
|---|---|
| `Parameter 'x' implicitly has an 'any' type` | inline type or `: unknown` |
| store action 參數 | inline type；caller 端 narrow（L4 composables 已 .ts，會自動拿到型別） |
| `ref<unknown>` | 顯式 `ref<T>(initial)` |
| Pinia store getter return | inferred OK；如 explicit return type，用 inline |
| `Cannot find module` | path alias 問題，stop 報告 |
| `Property 'X' does not exist on type` | type guard / narrow |
| `domainBus.emit` payload 不符 event map | 確認 emit 第二參數符合 `DomainEventMap[event_name]`；通常 store 都帶足夠欄位 |

**❌ 禁觸**：
- 不可改 store action signature 的回傳結構
- 不可改 state shape（reactive 物件的 keys）
- 不可加新 dep
- 不可加 `: any`

**`auto-imports.d.ts` / `components.d.ts`**：build regenerate 時一併 commit。

**`_createFetchStore.ts` / `_createKeyedFetchStore.ts`**（factory function）：可能要 `<T>` generic 並讓 store consumer 自然帶型別。寫法類似 useCachedAsync。

- [ ] **Step 6: vitest（特別關注 store tests）**

```bash
npm test 2>&1 | tail -10
```

特別關注：
- store 相關 test（位於 `tests/unit/stores/`）
- L4 composables 對 store 的引用測試（composable tests 使用 store mock）
- `syncBridge` 整合測試（如有）

- [ ] **Step 7: build**

```bash
npm run build 2>&1 | tail -3; echo "exit=$?"
```

- [ ] **Step 8: 統計 markers**

```bash
grep -rn "@ts-expect-error\|TODO(ts-strict)" src/stores/*.ts src/utils/domainBus.ts | wc -l
```

- [ ] **Step 9: Commit**

```bash
git add src/stores/ vite.config.js src/utils/domainBus.ts
git status -s | grep -E "auto-imports|components\.d\.ts" && git add auto-imports.d.ts components.d.ts 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(ts-l5): 轉 src/stores/ 17 檔為 TypeScript + domainBus event map

無行為變動。17 個 Pinia store，含 _createFetchStore / _createKeyedFetchStore
factory + 各域 store（employee / student / activity / classroom 等）+
syncBridge / portalMessages / portalCache 等。

附帶連動更新：
- vite.config.js:75-76, 88 3 條 manualChunks .js → .ts
- src/stores/portalMessages.ts:4 comment messages.js → .ts

附帶 L4 carry-forward #3：src/utils/domainBus.ts 加 DomainEventMap
type + typed `Emitter<DomainEventMap>`。9 個 event payload shape（student
五事件 / record 三事件 / attendance changed）寬鬆 schema 允許 store 多
傳欄位但 id 強型別。emit/on 自此有型別檢查。

過渡標註：N 處（如有）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 轉換 src/parent/stores/ 3 + src/parent/services/ 1

**Files:**
- Rename: `src/parent/stores/{children,messages,parentAuth}.js` → `.ts`
- Rename: `src/parent/services/liff.js` → `.ts`

- [ ] **Step 1: git mv**

```bash
for f in children messages parentAuth; do
  git mv src/parent/stores/${f}.js src/parent/stores/${f}.ts
done
git mv src/parent/services/liff.js src/parent/services/liff.ts
```

- [ ] **Step 2: typecheck + 修 error（同 Task 2 Step 5 規則）**

```bash
npm run typecheck 2>&1 | tail -20
```

**`liff.ts` 特別**：LIFF SDK 是 `@line/liff`，型別由套件自帶（`@line/liff` 套件內含 .d.ts）。`liffInit()` / `getProfile()` 等用 SDK 既有型別。

**`parentAuth.ts`** 走 LIFF login + httpOnly cookie + refresh token rotation。複雜邏輯逐行保留。

**`children.ts`** 39 行（最小），純資料 store。

**`messages.ts`** 183 行（與 admin `portalMessages.ts` 同樣 thread + cursor + 樂觀送出 + 撤回 pattern）。

- [ ] **Step 3: vitest + build**

```bash
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add src/parent/stores/ src/parent/services/
git status -s | grep -E "auto-imports|components\.d\.ts" && git add auto-imports.d.ts components.d.ts 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(ts-l5): 轉 src/parent/stores/ 3 + src/parent/services/ 1 為 TypeScript

無行為變動。
- src/parent/stores/: children / messages / parentAuth
- src/parent/services/: liff（LIFF SDK 包裝）

parentAuth 維持 LIFF login + httpOnly cookie + refresh rotation 邏輯
逐行保留。messages 維持 thread + cursor + 樂觀送出 + 撤回 pattern。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 整體驗證

- [ ] **Step 1: 全綠**

```bash
npm run typecheck 2>&1 | tail -3; echo "tc exit=$?"
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3; echo "build exit=$?"
```

- [ ] **Step 2: 沒有遺漏 .js**

```bash
find src/stores src/parent/stores src/parent/services -name "*.js" 2>&1
```

- [ ] **Step 3: 沒有 `: any` / `as any`**

```bash
git diff main..HEAD -- 'src/stores/*.ts' 'src/parent/stores/*.ts' 'src/parent/services/*.ts' 'src/utils/domainBus.ts' | grep -nE ':\s*any\b|as\s+any\b' | head -5
```

- [ ] **Step 4: domainBus 整合驗證**

```bash
# 確認 store 與 component 的 domainBus.emit / .on 都通過 type check
grep -rn "domainBus.emit\|domainBus.on" src/ | head -10
```
（前一步 typecheck 已驗證，這只是 sanity）

---

## Task 5: Push + 開 PR

- [ ] **Step 1: push**

```bash
git push -u origin feat/ts-migration-l5-stores-2026-05-18-frontend
```

- [ ] **Step 2: 開 PR**

```bash
gh pr create --title "feat(ts-l5): 轉 stores/ + parent/stores/ + parent/services/ 為 TypeScript（21 檔）+ domainBus event map" --body "$(cat <<'EOF'
## Summary
- **21 檔 `.js` → `.ts`**：`src/stores/` 17 + `src/parent/stores/` 3 + `src/parent/services/` 1 = **1463 行**
- **L4 carry-forward #3 解**：`src/utils/domainBus.ts` 加 `DomainEventMap` + typed `Emitter<DomainEventMap>` — 9 個 event payload type-safe
- 連動：`vite.config.js` 3 條 manualChunks + 1 處 comment
- **無行為變動**

## L4 carry-forward #3：domainBus event map
3 個 store（syncBridge / student / studentRecords）+ 5 個 component 用 domainBus emit/on。本 PR 在 `utils/domainBus.ts`（L2 已 .ts）加 9 event 的 type map，emit/on 自此有編譯期 type 檢查。Spec §13 `domainBus` 例外條款明文允許。

## Test plan
- [x] `npm run typecheck` exit 0
- [x] `npm test` 2316+/2316+ 全綠
- [x] `npm run build` 成功
- [x] `find src/stores src/parent/stores src/parent/services -name "*.js"` 空
- [x] 0 個 `: any` / `as any`
- [ ] CI 全綠

## L6 carry-forward
（implementer 補完）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 等 CI**

```bash
sleep 180 && gh pr view --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.name): \(.conclusion)"'
```

---

## Task 6: Merge + cleanup（user 確認後）

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main && git checkout main && git pull
git merge feat/ts-migration-l5-stores-2026-05-18-frontend  # --ff-only 或 --no-ff
npx --yes npm@10.9.8 install
npm run typecheck && npm test && npm run build
git worktree remove --force .claude/worktrees/ts-l5
git worktree prune
git branch -d feat/ts-migration-l5-stores-2026-05-18-frontend
git push origin main
```

---

## 驗收

1. `find src/stores src/parent/stores src/parent/services -name "*.js"` 空
2. main 上 `npm run typecheck` exit 0
3. CI Type check pass
4. vitest baseline 維持 2316+
5. 無 `: any` 新增
6. `domainBus` event map 已落地、emit/on 有 type 檢查

---

## L6 寫 plan 時的 carry-forward

- L6 components: `src/components/` 1 .js + 152 .vue + `src/parent/components/` 17 .js + 66 .vue = **236 檔**，估 5 天（依 plan 拆 L6a / L6b 兩 PR）
- L5 stores 已 .ts，component 用 store 會直接打到 store 型別（強迫 component prop / emit 寫對）
- L4 19 個 named types 仍保留；L6 view 用這些 composable 時自然會吃到 type
- domainBus 已 type 化；L6 components 用 `domainBus.on(STUDENT_EVENTS.CREATED, ...)` 自動帶型別
- `_toBig` object input guard（L2 #3）— L6 SettingsUsersTab 對應 view 可能觸發；如有，加 guard 或在 caller narrow
- Sentry `@ts-expect-error` 3 處 — 等 L7c entry points 解
- `auto-imports.d.ts` 自 L3 起 commit 進 repo，L6 build 後若有變動 commit 進對應 PR
