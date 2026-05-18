# L0 TypeScript 工具鏈基建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ivy-frontend/` 安裝 TypeScript 工具鏈、補 `tsconfig.json` / shims / typecheck scripts、CI 加 `typecheck` step（warning 模式），讓後續 L1–L9 layer-by-layer 遷移有穩定的基礎可運作。

**Architecture:**
- 新增 `typescript` + `vue-tsc` + `@vue/tsconfig` + `@types/node` 四套 devDependency
- `tsconfig.json` 取代 `jsconfig.json`，採 `strict: true` + `allowJs: true` + `checkJs: false`（過渡期讓既有 .js 共存且不檢查）
- 新增 `src/types/shims-vue.d.ts` 讓 TS 能 import `.vue`
- `package.json` 加 `typecheck` / `typecheck:watch` scripts
- `.gitignore` 加 `auto-imports.d.ts` / `components.d.ts`（unplugin 自動產，本機 + CI 各自重生）
- `.github/workflows/ci.yml` 加 `typecheck` step、**用 `continue-on-error: true`** 不阻擋
- L0 不轉任何 `.js` 為 `.ts`、不動任何業務檔

**Tech Stack:** TypeScript 5.6.x, vue-tsc 2.1.x, Vue 3.4 + Vite 5 + Vitest 4

**Prerequisite:** L0 因為不動任何業務碼，**可在並行 WIP 未清理前開工**。spec §2 列的並行 WIP 清理是 L1 才需要的前置條件。但仍要確認：
- `git status` 顯示乾淨或只剩無關 untracked
- 當前在 `main` 分支且與 origin 同步

**Branch:** `feat/ts-migration-l0-toolchain-2026-05-18-frontend`

**Working directory:** Task 1 完成後，所有後續 `npm` / `git` 指令的 cwd 都應該是 worktree 路徑 `~/Desktop/ivy-frontend/.claude/worktrees/ts-l0`。若 shell 不保留 cwd（如每個 Bash 呼叫各自起 shell），每次呼叫前自行 `cd` 過去。

**Spec reference:** `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md` §3, §9

---

## File Structure

### Create
- `tsconfig.json` — 取代 jsconfig.json，TypeScript 設定主檔
- `src/types/shims-vue.d.ts` — 讓 TS 能 import `.vue` SFC
- `src/types/index.d.ts` — 集中第三方 ambient module declaration 用（先建空殼，L3/L6 才用）

### Modify
- `package.json` — 加 4 個 devDeps、2 個 scripts
- `.gitignore` — 加 `auto-imports.d.ts`、`components.d.ts`
- `.github/workflows/ci.yml` — 加 `typecheck` step（warning 模式）

### Delete
- `jsconfig.json` — 由 `tsconfig.json` 取代

---

## Task 1: 建立 worktree 並切到 L0 分支

**Files:** N/A（git 操作）

- [ ] **Step 1: 確認 main 乾淨**

Run: `cd ~/Desktop/ivy-frontend && git status -s`
Expected: 只有預期內的 untracked（如 `auto-imports.d.ts`、`.claude/`、user 的 WIP），無 `M`/`A`/`D` 開頭的已 stage 變更。

如果有非預期已 stage 變更，先 stop 並請 user 處理。

- [ ] **Step 2: 確認 main 與 origin 同步**

Run: `cd ~/Desktop/ivy-frontend && git fetch origin main && git rev-list --count HEAD..origin/main && git rev-list --count origin/main..HEAD`
Expected: 第一個數字 `0`（main 沒落後）；第二個數字可以是任意（local 領先 origin 的未 push commit）。

- [ ] **Step 3: 建立並切到 L0 worktree**

Run:
```bash
cd ~/Desktop/ivy-frontend
git worktree add .claude/worktrees/ts-l0 -b feat/ts-migration-l0-toolchain-2026-05-18-frontend main
cd .claude/worktrees/ts-l0
```
Expected: worktree 建立成功，當前在新 worktree 路徑、新分支。

> 若 user 偏好不用 worktree、直接在 main 開分支：跳過 Step 3，改執行 `git checkout -b feat/ts-migration-l0-toolchain-2026-05-18-frontend main` 留在原 repo 目錄。後續步驟所有 `cd` 命令的 worktree 路徑請替換成 `ivy-frontend` 原路徑。

---

## Task 2: 安裝 TypeScript 相關 devDependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`（npm 自動更新）

- [ ] **Step 1: 安裝四套 devDependency**

Run:
```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/ts-l0
npm install --save-dev typescript@^5.6.0 vue-tsc@^2.1.10 @vue/tsconfig@^0.6.0 @types/node@^22.7.0
```
Expected: npm 完成安裝，`package.json` `devDependencies` 多出四個 key、`package-lock.json` 同步更新。

- [ ] **Step 2: 驗證版本**

Run: `npx tsc --version && npx vue-tsc --version`
Expected:
```
Version 5.6.x
Version 2.1.x
```

- [ ] **Step 3: 確認 dev server 與 build 仍可運作**

Run（背景啟動）:
```bash
npm run dev > /tmp/ts-l0-dev.log 2>&1 &
sleep 5
curl -sf http://localhost:5173 > /dev/null && echo "OK: dev server alive"
kill %1
```
Expected: 印出 `OK: dev server alive`。

Run: `npm run build 2>&1 | tail -20`
Expected: build 成功、產出 `dist/`、無 TypeScript 相關 error（因為還沒接 typecheck）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(ts-l0): install TypeScript toolchain

typescript ^5.6 + vue-tsc ^2.1 + @vue/tsconfig + @types/node

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 建立 tsconfig.json 並刪除 jsconfig.json

**Files:**
- Create: `tsconfig.json`
- Delete: `jsconfig.json`

- [ ] **Step 1: 建立 tsconfig.json**

Create `tsconfig.json` with:

```jsonc
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "exactOptionalPropertyTypes": false,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["vite/client", "vitest/globals"]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.vue",
    "src/**/*.js",
    "src/api/_generated/*.d.ts",
    "src/types/**/*.d.ts",
    "auto-imports.d.ts",
    "components.d.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "dist-debug",
    "src/**/__tests__/**"
  ]
}
```

- [ ] **Step 2: 刪除 jsconfig.json（用 git rm 同時 stage 刪除）**

Run: `git rm jsconfig.json`
Expected: `rm 'jsconfig.json'` 印出，git index 同步標記為 deleted。

- [ ] **Step 3: 不要 commit（先做 Task 4–6 補完並驗證 typecheck，再一起 commit）**

---

## Task 4: 建立 type shims 與 types 目錄

**Files:**
- Create: `src/types/shims-vue.d.ts`
- Create: `src/types/index.d.ts`

- [ ] **Step 1: 建立 src/types/ 目錄並寫 shims-vue.d.ts**

Run: `mkdir -p src/types`

Create `src/types/shims-vue.d.ts` with:

```ts
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
```

- [ ] **Step 2: 建立 src/types/index.d.ts（空殼，後續 L3/L6 才填）**

Create `src/types/index.d.ts` with:

```ts
// Ambient module declarations for third-party libraries that lack their own
// .d.ts or @types/* package. Populated in L3 (api) / L6 (components) as
// individual libraries surface unknown imports.
//
// Example (do not enable until needed):
//
//   declare module "@line/liff/foo-subpackage" {
//     export function someThing(): void;
//   }

export {};
```

- [ ] **Step 3: 不要 commit（先做 Task 5、6 完成後一起 commit）**

---

## Task 5: 加 typecheck scripts、.gitignore 條目

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 在 package.json scripts 加兩條**

Read `package.json`，找到 `"scripts": { ... }` 區塊，加入：

```json
"typecheck": "vue-tsc --noEmit",
"typecheck:watch": "vue-tsc --noEmit --watch"
```

放在 `"test:coverage"` 之後、`"parent:audit"` 之前。完整 `scripts` 區塊應為：

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "postbuild": "find dist -name '*.map' -type f -delete 2>/dev/null; true",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "typecheck": "vue-tsc --noEmit",
  "typecheck:watch": "vue-tsc --noEmit --watch",
  "parent:audit": "bash scripts/parent-audit-grep.sh",
  "gen:m3-tokens": "node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css",
  "gen:api": "openapi-typescript ../ivy-backend/openapi.json -o src/api/_generated/schema.d.ts --alphabetize",
  "gen:api:check": "npm run gen:api && node scripts/check-api-drift.mjs"
}
```

- [ ] **Step 2: 在 .gitignore 加 unplugin auto-generated d.ts**

Read `.gitignore`，在最末段加入：

```
# unplugin-auto-import / unplugin-vue-components auto-generated, regenerated by vite dev/build
auto-imports.d.ts
components.d.ts
```

- [ ] **Step 3: 確認 .gitignore 生效**

Run: `git status -s auto-imports.d.ts components.d.ts`
Expected: 空輸出（兩檔已被 ignore，git 不再追蹤）。

如果 git 已經追蹤過這兩個檔案（output 顯示為 `M`），執行：
```bash
git rm --cached auto-imports.d.ts components.d.ts
```
然後重跑 Step 3 驗證。

---

## Task 6: 跑 typecheck 驗證 baseline

**Files:** N/A（驗證）

- [ ] **Step 1: 跑 typecheck**

Run: `npm run typecheck 2>&1 | tail -50`
Expected: **exit code 0**、無 error。

說明：`tsconfig.json` 用 `allowJs: true` + `checkJs: false`，所以雖然 `include` 含 `src/**/*.js`，TS 不會檢查 .js 內容；shims-vue.d.ts 處理 .vue import；`auto-imports.d.ts` / `components.d.ts` 的 `// @ts-nocheck` header 讓它們也跳過檢查。整支應通過。

- [ ] **Step 2: 若有 error，依下表處理**

| Error 型態 | 處理 |
|---|---|
| `Cannot find module '*.vue'` | 確認 `src/types/shims-vue.d.ts` 存在且在 `tsconfig.json` `include` 內 |
| `Cannot find name 'Component'` 之類 unplugin auto-import | 確認 `auto-imports.d.ts` 在 `tsconfig.json` `include` 內，且 file 開頭有 `// @ts-nocheck` |
| `Cannot find type definition file for 'node'` | 確認 `@types/node` 安裝完整、`tsconfig.json` 有 `"types": ["vite/client", "vitest/globals"]`（不需顯式列 node，因 `@vue/tsconfig` 已處理） |
| `schema.d.ts` 內部 error | 加 `"skipLibCheck": true`（已加），如還報錯把 `src/api/_generated/*.d.ts` 從 `include` 移到 `tsconfig.json` 同層的 `exclude` |
| 其他 `.js` 檔 error | 不應出現（`checkJs: false`）；若出現，回頭檢查 tsconfig 是否誤被 inherit override |

- [ ] **Step 3: 跑 vitest 確認測試零回歸**

Run: `npm test 2>&1 | tail -20`
Expected: 4214/2161 全綠（或當前 baseline 數字，總之 0 failed）。

- [ ] **Step 4: 跑 build 確認生產 build 不破**

Run: `npm run build 2>&1 | tail -20`
Expected: build 成功、`dist/` 產出。

---

## Task 7: Commit Task 3–6（tsconfig + shims + scripts + .gitignore）

**Files:** 已在 Task 3–5 修改完成

- [ ] **Step 1: 確認 staging diff**

Run: `git status && git diff --stat`
Expected staging：
```
deleted:    jsconfig.json
new file:   tsconfig.json
new file:   src/types/shims-vue.d.ts
new file:   src/types/index.d.ts
modified:   package.json
modified:   .gitignore
```

- [ ] **Step 2: Stage + commit**

```bash
git add tsconfig.json src/types/shims-vue.d.ts src/types/index.d.ts package.json .gitignore
# jsconfig.json 在 Task 3 Step 2 已用 git rm 同時 stage 刪除，這裡不重做
git commit -m "$(cat <<'EOF'
feat(ts-l0): tsconfig + shims + typecheck scripts

- 取代 jsconfig.json 為 tsconfig.json（strict:true、allowJs:true、checkJs:false）
- 新增 src/types/shims-vue.d.ts 讓 TS 能 import .vue
- package.json 加 typecheck / typecheck:watch scripts
- .gitignore 加 auto-imports.d.ts / components.d.ts（unplugin 自動產）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 確認 commit 成功**

Run: `git log -1 --stat`
Expected: 顯示 6 個檔案變動（5 個 file change + 1 個 delete）。

---

## Task 8: CI 加 typecheck step（warning 模式）

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 修改 ci.yml**

Read `.github/workflows/ci.yml`，在 `Build check` step 之前加入 `Type check` step。完整檔案應為：

```yaml
name: Frontend CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Tests & Build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: 依賴 CVE 掃描（HIGH-1）
        run: npm audit --production --audit-level=moderate

      - name: Run tests
        run: npm run test

      - name: Type check（過渡期 warning 模式，不阻擋 PR；L9 收尾改 blocking）
        run: npm run typecheck
        continue-on-error: true

      - name: Build check
        run: npm run build
```

- [ ] **Step 2: 本機跑 typecheck 再驗一次**

Run: `npm run typecheck`
Expected: exit code 0。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci(ts-l0): add typecheck step in warning mode

continue-on-error: true，過渡期不阻擋 PR；
L9 收尾移除此 flag、改為 blocking。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 開 PR

**Files:** N/A（git push + gh）

- [ ] **Step 1: Push 分支**

Run:
```bash
git push -u origin feat/ts-migration-l0-toolchain-2026-05-18-frontend
```
Expected: push 成功。

- [ ] **Step 2: 開 PR**

Run:
```bash
gh pr create --title "feat(ts-l0): TypeScript 工具鏈基建" --body "$(cat <<'EOF'
## Summary
- 安裝 typescript / vue-tsc / @vue/tsconfig / @types/node
- 取代 jsconfig.json 為 tsconfig.json（strict:true、allowJs:true、checkJs:false 過渡期共存）
- 加 typecheck / typecheck:watch scripts
- 加 src/types/shims-vue.d.ts
- CI 加 typecheck step（warning 模式，continue-on-error）
- .gitignore 加 unplugin 自動產的 .d.ts

## Why
為 L1–L9 layer-by-layer JS→TS 遷移建立基礎。本 PR 不動任何業務碼，先讓工具鏈在 main 落地。

詳細設計：`docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md`

## Test plan
- [x] `npm run typecheck` 通過（exit 0）
- [x] `npm test` baseline 全綠
- [x] `npm run build` 成功
- [x] `npm run dev` 啟動正常
- [ ] CI 全綠（含 typecheck warning step）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL 印出。

- [ ] **Step 3: 等 CI 通過、merge、刪 worktree**

Run（user 確認 merge 後）:
```bash
cd ~/Desktop/ivy-frontend
git worktree remove .claude/worktrees/ts-l0
git fetch origin main && git checkout main && git pull
git branch -d feat/ts-migration-l0-toolchain-2026-05-18-frontend
```
Expected: worktree 清掉、main 同步、L0 分支本地刪除。

---

## 驗收（PR merge 後）

L0 完成的標誌：
1. `main` 上有 `tsconfig.json`、無 `jsconfig.json`
2. `npm run typecheck` 在 main 通過
3. CI ci.yml 有 `Type check` step，warning 模式
4. `auto-imports.d.ts` / `components.d.ts` 已 ignore
5. `package.json` `devDependencies` 含 typescript / vue-tsc / @vue/tsconfig / @types/node
6. vitest baseline 4214/2161 全綠不變
7. `npm run build` dist 產出不變

驗收通過後可開始寫 **L1 plan**（`constants/` + `validators/`，13 個 .js 檔）。
