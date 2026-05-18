# 前端 JS → TS 全面遷移（分層遞進）

| | |
|---|---|
| Date | 2026-05-18 |
| Scope | `ivy-frontend/src/` 全層（admin + parent） |
| Strategy | 分層遞進（B 方案）— 多 PR、永遠 mergable、可中途暫停 |
| Outcome | 全 `.js` → `.ts`、全 `.vue` → `<script setup lang="ts">`、`vue-tsc --noEmit` 通過、CI 阻擋未過 PR |

---

## 1. 目標與非目標

### 目標
- `src/` 內所有 `.js` 改為 `.ts`，所有 `.vue` 改為 `<script setup lang="ts">`
- `vue-tsc --noEmit` 通過、`tsconfig.json` 採 `strict: true`
- CI 阻擋未通過型別檢查的 PR
- 已有 `openapi-typescript` codegen 的 `schema.d.ts` 從「JSDoc 引用源」升級為「直接 import 的型別源」
- 既有 vitest 測試（4214/2161 全綠 baseline）零回歸

### 非目標
- **不** 重寫商業邏輯、**不** 重構模組邊界、**不** 改 axios wrapper（保留 dedupe / refresh / displayMessage）
- **不** 動 `src/api/_generated/` 之外的後端契約（後端不需配合改動）
- **不** 把 `.js` build artifact / config script（`vite.config.js`、`scripts/*.mjs`）也轉 TS（這些工具腳本維持 .js/.mjs）
- **不** 引入 runtime 型別驗證（zod / valibot）— 本次只做靜態型別

---

## 2. 啟動前置條件

開工前必須先把以下並行 WIP 全部 merge 進 main 並關掉 worktree，否則 layer-by-layer rebase 成本爆炸：

| WIP / 分支 | 狀態 | 動作 |
|---|---|---|
| `parent design language round3` (已 merge 4d448e4f, 未 push) | merged local | push origin |
| `feat/portal-growth-trajectory-2026-05-18-frontend` | active | 完成或捨棄 |
| `feat/appraisal-preview-i18n-2026-05-18-frontend` | active | 完成或捨棄 |
| `feat/cache-optimization-2026-05-18-frontend` (已 merge 371d89ae) | merged local | push origin |
| `refactor-fees-by-class`（user WIP，未 commit AdjustmentEditDialog.vue + getFeeAdjustments） | dirty | 落地或還原 |
| `RunningLoader.vue + tests + 3 gif`（uncommitted） | dirty | commit 或還原 |

**Gating rule**: 上述全部清理完、`git status` 只剩 `auto-imports.d.ts` / `components.d.ts`（unplugin 自動產生）才開工。

---

## 3. 工具鏈基礎建設（Layer 0）

第一個 PR 只裝工具鏈、不轉任何業務碼。

### devDependencies 新增
```json
{
  "typescript": "^5.6.0",
  "vue-tsc": "^2.1.10",
  "@vue/tsconfig": "^0.6.0",
  "@types/node": "^22.7.0"
}
```

### `tsconfig.json`（取代 `jsconfig.json`）
```jsonc
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": false,    // 過渡期關，layer-by-layer 收緊
    "noUnusedParameters": false,
    "exactOptionalPropertyTypes": false,  // 過渡期關，schema.d.ts 內部用 union 描述 optional
    "noEmit": true,
    "allowJs": true,            // 過渡期允許 .js 共存
    "checkJs": false,           // 不檢查 .js（避免遺留 JSDoc 噪音）
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vite/client", "vitest/globals"]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.vue",
    "src/**/*.js",              // 過渡期保留，最後一個 PR 移除
    "src/api/_generated/*.d.ts",
    "auto-imports.d.ts",
    "components.d.ts"
  ],
  "exclude": ["node_modules", "dist", "dist-debug", "src/**/__tests__/**"]
}
```

### 新增 `package.json` scripts
```json
{
  "typecheck": "vue-tsc --noEmit",
  "typecheck:watch": "vue-tsc --noEmit --watch"
}
```

### `unplugin-auto-import` / `unplugin-vue-components` 設定
兩個 plugin 已產出 `auto-imports.d.ts` 與 `components.d.ts`（目前 `git status` 顯示為 untracked）。
- 確認 `vite.config.js` 內 `dts: true` 已開（從現況推斷已開）
- 將 `auto-imports.d.ts` / `components.d.ts` 加入 `.gitignore`（一般 best practice，避免雜訊 PR）
- 並在 `tsconfig.json` `include` 中列入

### Vite SFC TypeScript shim
新增 `src/types/shims-vue.d.ts`：
```ts
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
```

### Layer 0 驗收
- `npm run typecheck` 通過（此時 src 內仍全 .js，allowJs+checkJs:false 讓它通過）
- `npm run dev` 正常啟動
- `npm test` 全綠
- CI 加入 `typecheck` step（**warning 模式**，第一個 PR 不阻擋）

---

## 4. 分層順序與每層交付物

每層 = 一個 PR、一支 `feat/ts-migration-layerN-2026-MM-DD-frontend` 分支。
**順序按「依賴方向由葉到根」**，先轉沒人依賴的層、後轉依賴它的層。
`parent/` 子目錄與 `src/` 同名子目錄折進同一層（admin 與 parent 同步推進，§決策 5）。

| Layer | 範圍 | 檔數 | 估時 |
|---|---|---|---|
| **L0** | 工具鏈（§3） | 0 業務檔 | 0.5 天 |
| **L1** | `constants/` (12) + `validators/` (1) | 13 | 0.5 天 |
| **L2** | `utils/` (22) + `parent/utils/` (4) | 26 | 1 天 |
| **L3** | `api/` (64) + `parent/api/` (21) | 85 | 3 天 |
| **L4** | `composables/` (50) + `parent/composables/` (14) | 64 | 2 天 |
| **L5** | `stores/` (17) + `parent/stores/` (3) + `parent/services/` (1) | 21 | 1 天 |
| **L6a** | `components/` (1 .js + 152 .vue) — admin/common | 153 | 3 天 |
| **L6b** | `parent/components/` (17 .js + 66 .vue) | 83 | 2 天 |
| **L7a** | `views/` (21 .js + 148 .vue) — admin | 169 | 4 天 |
| **L7b** | `parent/views/` (27 .vue) + `layouts/` (2) + `parent/layouts/` (1) | 30 | 1 天 |
| **L7c** | `router/` (1) + `parent/router.js` + `App.vue` + `parent/App.vue` + `main.js` + `parent/main.js` | 6 | 0.5 天 |
| **L9** | 收尾：移除 `allowJs`、`noUnusedLocals` / `noUnusedParameters` 開回、CI 改成 **阻擋模式** | 設定變更 | 0.5 天 |
| | **總計** | **650 檔**、~118K 行 | **19 天**（≈ 4 週工作日） |

> L6/L7 預先拆 a/b/c，原因：components 233 / views 169 / 整支 router-and-entry 6 各自相依鏈不同（components 多被 views import；parent 與 admin 用各自 router / entry），拆開 review 負擔合理且可平行。L6a 與 L6b 在 L5 完成後可平行推進。

### 每層 PR 模板
1. **轉檔**：`.js` → `.ts`（檔名改、`<script>` 加 `lang="ts"`）
2. **修型別**：`vue-tsc` 報的紅線全清；無解時用過渡標註（§10）
3. **更新依賴的 import 路徑**：因為 `.js` 變 `.ts`，但 Vite 不需要副檔名所以多半無感；少數 `from './foo.js'` 顯式寫副檔名的要改
4. **跑測試**：該層 vitest 全綠
5. **跑 typecheck**：`npm run typecheck` 通過
6. **commit**：每層一個 commit（必要時拆 2-3 個小 commit，例：先轉檔再修型別）
7. **PR**：對 main 開 PR、過 CI、merge、本地刪分支

---

## 5. 設定檔細節

### `auto-imports.d.ts` / `components.d.ts` 怎麼處理
- 由 `unplugin-auto-import` / `unplugin-vue-components` 在 dev / build 時自動更新
- 列入 `.gitignore`，但 `tsconfig.json` 仍 include — `vue-tsc` 跑時會吃到本機 fresh 版本
- CI 流程：`npm install` → `vite build`（觸發 plugin 產 .d.ts）→ `vue-tsc --noEmit`

### Vitest 設定
`vitest.config.ts`（取代現有 `.js`）需確保：
- `globals: true`、`environment: 'happy-dom'`（與目前一致）
- `setupFiles`、`include` pattern 不變
- `types/setup-test-types.d.ts` 補 `axios-mock-adapter` 等 mock 工具的型別輔助

### `axios-mock-adapter` 型別
這套自帶 `.d.ts`，但既有測試大量使用未型別化的 mock instance；過渡期可在 setup 中 `as any` cast，或補 typed factory helper。

---

## 6. `.vue` SFC 轉換 pattern

### Before (JS + JSDoc)
```vue
<script setup>
import { ref, computed } from 'vue'

/** @type {import('vue').Ref<number>} */
const count = ref(0)

const props = defineProps({
  label: { type: String, required: true },
  size: { type: Number, default: 16 },
})

const emit = defineEmits(['change', 'submit'])

const double = computed(() => count.value * 2)
</script>
```

### After (TS)
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const count = ref<number>(0)

const props = defineProps<{
  label: string
  size?: number
}>()

const emit = defineEmits<{
  change: [value: number]
  submit: [payload: { id: number; name: string }]
}>()

const double = computed(() => count.value * 2)
</script>
```

### 統一規則
- `defineProps` / `defineEmits` 用 **type-based**（不用 runtime declaration），避免 runtime declaration 與 type 兩邊維護
- props default 用 `withDefaults` 或 `?` + 變數內處理（按情境）
- `ref<T>(initial)` 顯式註型，避免 inferred to `Ref<number | undefined>` 之類常見坑
- `<template>` 內的 ref / props 享有自動推論，無需額外處理

### Slot 型別
有 typed slot 的元件（如 `DataTable`、`Modal` 系列）用 `defineSlots<>` 標註。

---

## 7. API 層整合（L3）

現況：64 個 `src/api/*.js`、約 30 個有完整 JSDoc `@typedef`、其餘無型別（memory: 4 個 file 共 31 函式 JSDoc 接線）。

### 轉換策略
- `import('./_generated/typed').ApiResponse<...>` JSDoc 形式 → 改為 `import type { ApiResponse } from './_generated/typed'` 直接 import
- 每個 endpoint 函式簽章用 `ApiBody<P, M>`、`ApiQuery<P, M>`、`AxiosResp<P, M>`
- 維持 axios wrapper 不變（不解包 `.data`，呼叫端用 `res.data`）
- 範例：

```ts
// src/api/employees.ts
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export const getEmployees = (params: ApiQuery<'/employees', 'get'>) =>
  api.get('/employees', { params }) as AxiosResp<'/employees', 'get'>

export const createEmployee = (payload: ApiBody<'/employees', 'post'>) =>
  api.post('/employees', payload) as AxiosResp<'/employees', 'post'>
```

### 缺 `response_model` 的端點怎麼辦
後端大量 endpoint 在 OpenAPI 顯示 `application/json: unknown`（缺 `response_model=`）。
- 前端遇到 `unknown` 不要硬填 `any`，**保留 unknown** — 呼叫端必須顯式 cast 或加 type guard，這會自然推動後端補 `response_model`
- 例外：`unknown` 拖累 L7（views）進度時，個別 endpoint 允許 `as ResponseShape` cast 並加 `// TODO(ts-strict): waiting on backend response_model`

### `index.js` (axios wrapper) 轉換
這是 222 站點的源頭，型別很關鍵。重點：
- `AxiosInstance` extend 加 dedupe / refresh / displayMessage 屬性（用 module augmentation 而非 cast）
- 攔截器型別用 `InternalAxiosRequestConfig`（axios v1.x 命名）

---

## 8. 測試（per-layer）

每層 PR 必須：
- 該層直接相關的測試全綠（targeted run）
- 全套 `npm test` 全綠（避免遠端連鎖破壞）
- 不**新增**測試（除非修型別過程發現真 bug 需要回歸測試）
- 不**刪減**測試

### Mock 策略
- `axios-mock-adapter` instance 在每個 test file 內用 typed factory（轉檔時定義一次共用）
- `vi.mock('vue-router')` 等 plugin mock 仍可 untyped（vitest 接受）

### Vitest 已支援 TS
無需額外 transformer；唯一改動是把 `vitest.config.js` → `.ts`。

---

## 9. CI gate

### Phase 1（L0–L8）— warning 模式
`.github/workflows/frontend-ci.yml`（假設既有檔名）加入：
```yaml
- name: Type check
  run: npm run typecheck
  continue-on-error: true   # 過渡期不擋
```

### Phase 2（L9 收尾）— blocking 模式
- 移除 `continue-on-error`
- 移除 `tsconfig.json` 的 `allowJs: true`
- 開啟 `noUnusedLocals: true` / `noUnusedParameters: true`
- 移除 `tsconfig.json` `include` 中的 `src/**/*.js`
- 同步移除 `jsconfig.json`（若 L0 沒刪）

### `gen:api:check` 配合
`scripts/check-api-drift.mjs` 已用 `git status --porcelain` 抓 drift，無需動。
TS 化後 codegen 仍輸出 `.d.ts`，流程無變化。

---

## 10. 過渡標註規範

層內無法當下解的型別，用以下標註並 grep 追蹤：

| 標註 | 用途 | 收斂時機 |
|---|---|---|
| `// @ts-expect-error TODO(ts-strict): <reason>` | 當下無解的型別錯誤 | L9 前清空（保留則 PR 拒收） |
| `as unknown as T` | 雙重 cast（避免直接 `as T` 觸發 unrelated overlap error） | L9 前 ≤ 20 處 |
| `: any` 顯式註型 | 拒絕用，改用 `: unknown` + type guard | 永遠 0 |
| `// TODO(ts-strict): waiting on backend response_model` | 後端契約洞 | 後端補完即清 |

每個 PR description 列出新增的標註點。L9 開始強制清零（`// TODO(ts-strict)` 例外，列為已知技術債）。

---

## 11. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| **並行 WIP 衝突** | 每層 PR 與其他 feature 分支衝突 | 開工前已要求清理（§2）；layer 間隔 ≤ 1 天 merge |
| **`vue-tsc` 在 macOS M-series 慢（10–30s）** | 開發體驗下降 | 用 `typecheck:watch`；CI 用快取 |
| **`unplugin-vue-components` 漏掃** | 自動 import 的元件沒進 .d.ts，typecheck 紅 | L0 確認 `dts: true` 且 PR 不要漏 commit `components.d.ts` 變動（雖然 .gitignore，CI 會本機產） |
| **schema.d.ts 38K 行拖慢 typecheck** | 每次 typecheck 數十秒 | `skipLibCheck: true`（已設）；CI 加 `actions/cache` 對 `node_modules/.cache` |
| **`unknown` 體驗差** | views 層大量端點回傳 unknown 拖進度 | §7 「TODO(ts-strict): waiting on backend response_model」過渡標註；同時 backlog 推後端補 response_model |
| **轉檔過程引入無聲 bug** | template binding 與 ts type 不符 → render 失敗但 typecheck 過 | 每層 PR 跑 vitest + 手動 smoke test 該層代表性頁面 |
| **PR 越積越大** | review 負擔重 | 每層 PR 控在 ≤ 60 檔；超過則拆子層（例 components 拆 admin/common/parent） |
| **中途放棄留半 TS 半 JS** | 維護成本上升 | 設驗收標準（§13）；若 L4 後決定停，至少 L1-L4 形成穩定基底 |

---

## 12. 回滾策略

每層 PR 獨立可 revert。
- 若 L_n 合併後發現嚴重型別誤判，revert 該 PR + 該層相關 follow-up
- L0 工具鏈本身可獨立 revert（`tsconfig.json` 改回 `jsconfig.json`），對 runtime 0 影響
- 若決定全面放棄遷移：保留已轉換的層、把 `tsconfig.json` 改回 `strict: false`，當作 JSDoc 升級版繼續用（不需 revert 所有 layer）

---

## 13. 成功標準

L9 收尾後必須通過以下檢查：

1. **檔案層面**
   - `find src -name "*.js"` 為空（codegen `.d.ts` 不算）
   - `find src -name "*.vue" -exec grep -L 'lang="ts"' {} +` 為空
2. **型別層面**
   - `npm run typecheck` exit 0
   - `tsconfig.json` `strict: true` 不可關
   - `allowJs: false`、`noUnusedLocals: true`、`noUnusedParameters: true`
3. **過渡標註**
   - `git grep '@ts-expect-error'` ≤ 30 處（且全部有 `TODO(ts-strict)` reason）
   - `git grep -E ':\s*any(\s|;|,|\)|$)' src/` 0 處（顯式 `: any` 註型；regex 排除字串/註解內 `: any` 樣式）
   - `git grep 'TODO(ts-strict)'` 列為已知技術債（多半是後端契約洞，不阻擋）
4. **測試層面**
   - vitest 通過數 ≥ baseline（2026-05-18: 4214/2161）
5. **CI**
   - `typecheck` step 為 blocking、PR 未通過不可 merge
6. **OpenAPI codegen 仍可用**
   - `npm run gen:api:check` exit 0
   - `src/api/_generated/` 結構不變

---

## 14. 不在本 spec 範圍（明確 defer）

- `vite.config.js` → `vite.config.ts`（工具腳本，獨立小 PR 處理）
- `scripts/*.mjs` 轉 TS（無迫切性）
- `tests/` 目錄結構重組（與遷移正交）
- runtime 型別驗證（zod / valibot）
- 引入 `@vue/runtime-core` 的 macros 強化（如 typed slot defaults）
- `parent/` 與 `admin/` 視覺/邏輯重構（純風險獨立切分需求，與型別正交）

---

## 15. 開放問題

- **L6a 是否再拆**：admin `components/` 153 檔仍偏大（單 PR 上限約 60–80 檔）。寫 implementation plan 時若依 `components/common/`、`components/<domain>/` 自然切分過 80 檔，拆 L6a-1 / L6a-2。
- **`auto-imports.d.ts` 是否 commit**：本 spec 採 `.gitignore`，若 CI 環境 plugin 行為與本機不一致導致 typecheck 飄，改為 commit。
- **第三方 lib 缺型別**：`@liff/*`（LIFF SDK）、`leaflet`（地圖）等若無 `@types/*` 或 bundled `.d.ts`，新增 `src/types/<lib>.d.ts` 補 ambient module declaration。L3/L6 遇到時逐個補。
