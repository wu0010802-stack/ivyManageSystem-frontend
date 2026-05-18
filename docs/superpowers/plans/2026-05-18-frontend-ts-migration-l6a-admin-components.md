# L6a admin components TS 轉換 Implementation Plan

**Goal:** `src/components/` 1 .js (`feeTypes.js`) + 153 .vue → TS（lang="ts"）。

**Architecture:**
- `.js` → `.ts` rename（feeTypes）
- `.vue` `<script setup>` → `<script setup lang="ts">`，內容用 type-based `defineProps<>` / `defineEmits<>` / `ref<T>()` / `computed<T>()`
- 不改 template，不改 styles
- **無行為變動**

**Prerequisites:** L0-L5 已 merged main（HEAD `1d498e69` 之後可能含 user 並行 commit）。npm 10.9.8。

**Branch:** `feat/ts-migration-l6a-admin-components-2026-05-18-frontend`
**Worktree:** `~/Desktop/ivy-frontend/.claude/worktrees/ts-l6a`

---

## L0-L5 carry-forward（implementer 必讀）

1. `@vue/tsconfig` 默開 `verbatimModuleSyntax: true` → 純型別 import 用 `import type`
2. **禁 `: any` / `as any`** → `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`
3. `auto-imports.d.ts` / `components.d.ts` 已 commit 進 repo；build 重生若 modify 一併 commit
4. **L5 `DomainEventMap` 已就位**：用 `domainBus.emit/on(STUDENT_EVENTS.X, payload)` 自動有型別檢查
5. **L4 19 個 + L5 5 個 named types pragmatic exception 已建立先例**：同檔內 3+ 處用 + inline 損 DX 的 type alias / interface 可保留並 PR description 列出
6. **defineProps / defineEmits 必用 type-based macros**（spec §6 要求）：
   ```ts
   const props = defineProps<{ x: string; y?: number }>()
   const emit = defineEmits<{ change: [value: number]; submit: [payload: { id: number }] }>()
   // 預設值用 withDefaults：
   const props = withDefaults(defineProps<{ size?: number }>(), { size: 16 })
   ```

---

## Pre-authorized collateral

無（pre-flight grep 確認：vite.config.js 與 components.d.ts 提及 .vue 但 .vue 檔名不變，components.d.ts 由 build 自動 regenerate）。

---

## Task 1: 建 worktree + pre-flight

```bash
cd ~/Desktop/ivy-frontend
git fetch origin main
git worktree add .claude/worktrees/ts-l6a -b feat/ts-migration-l6a-admin-components-2026-05-18-frontend main
cd .claude/worktrees/ts-l6a
npm run typecheck 2>&1 | tail -3  # baseline exit 0
```

## Task 2: 轉檔（17 個 commit，按 subdir 分批）

按子目錄逐批轉，**每個子目錄一個 commit**，方便中途中斷時 resume：

| Subdir | 檔數 | Commit message |
|---|---|---|
| `feeTypes.js → .ts` + `fees/` | 1 .js + 7 .vue | `feat(ts-l6a): 轉 fees 元件為 TS（feeTypes + 7 .vue）` |
| `components/common/` | 12 .vue | `feat(ts-l6a): 轉 components/common 12 元件為 TS` |
| `layout/` | 3 .vue | `feat(ts-l6a): 轉 components/layout 3 元件為 TS` |
| `brand/` | 6 .vue | `feat(ts-l6a): 轉 components/brand 6 元件為 TS` |
| `activity/` | 16 .vue | `feat(ts-l6a): 轉 components/activity 16 元件為 TS` |
| `recruitment/` | 16 .vue | `feat(ts-l6a): 轉 components/recruitment 16 元件為 TS` |
| `portal/` | 32 .vue | `feat(ts-l6a): 轉 components/portal 32 元件為 TS` |
| `student/` | 40 .vue | `feat(ts-l6a): 轉 components/student 40 元件為 TS` |
| `settings/` | 4 .vue | `feat(ts-l6a): 轉 components/settings 4 元件為 TS` |
| `classroom/` | 3 .vue | `feat(ts-l6a): 轉 components/classroom 3 元件為 TS` |
| `dashboard/` | 1 .vue | `feat(ts-l6a): 轉 components/dashboard 1 元件為 TS` |
| `employee/` | 3 .vue | `feat(ts-l6a): 轉 components/employee 3 元件為 TS` |
| `enrollment/` | 2 .vue | `feat(ts-l6a): 轉 components/enrollment 2 元件為 TS` |
| `overtime/` | 1 .vue | `feat(ts-l6a): 轉 components/overtime 1 元件為 TS` |
| `portfolio/` | 3 .vue | `feat(ts-l6a): 轉 components/portfolio 3 元件為 TS` |
| `students/` | 1 .vue | `feat(ts-l6a): 轉 components/students 1 元件為 TS` |
| **top-level** (`GlobalSearch.vue` / `OfflineIndicator.vue` / `VendorPaymentSignDialog.vue`) | 3 .vue | `feat(ts-l6a): 轉 components 頂層 3 元件為 TS` |

每批跑 `npm run typecheck`（針對該子目錄相關錯誤）、`npm test`，全綠才 commit 下一批。

### `.vue lang="ts"` 轉換 pattern

**Before**:
```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  size: { type: Number, default: 16 },
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['change', 'submit'])
const count = ref(0)
const double = computed(() => count.value * 2)
</script>
```

**After**:
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  size?: number
  items?: unknown[]
}>(), {
  size: 16,
  items: () => [],
})

const emit = defineEmits<{
  change: [value: number]
  submit: [payload: unknown]
}>()

const count = ref<number>(0)
const double = computed<number>(() => count.value * 2)
</script>
```

### Error handling

不可加 `: any`。常見 error：
- prop type narrow：能寫具體 type 就寫（`string` / `number` / `boolean` / `unknown[]` / `Record<string, unknown>`），不確定用 `unknown`
- emit payload：能找到具體 shape 就寫，否則 `unknown` / `[payload: unknown]`
- ref<T>：顯式註型
- template ref：`const el = ref<HTMLElement | null>(null)`
- ElMessage / ElMessageBox：型別由 element-plus 自帶
- props 用於 v-for 等的 array 元素 narrow：caller 端定 inline shape

### Pragmatic exception 規範

同 L4/L5：同檔內 3+ 處用的複雜 shape 可加 named type alias；single-use 應 inline。**禁 type-derived `as const`**。

---

## Task 3: 整體驗證

```bash
npm run typecheck 2>&1 | tail -3; echo "exit=$?"
npm test 2>&1 | tail -5
npm run build 2>&1 | tail -3
find src/components -name "*.js" 2>&1  # 應為空（除非 git mv detect 不到）
git diff main..HEAD -- 'src/components/**/*.vue' 'src/components/**/*.ts' | grep -nE ':\s*any\b|as\s+any\b' | head  # 應為空
```

## Task 4: PR + merge

push → open PR → 等 CI → local merge → cleanup。
