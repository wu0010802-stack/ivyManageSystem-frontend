---
name: admin-page-lifecycle
description: 新增或移除後台管理端頁面（選單項、路由、頁面權限、操作按鈕 gate）時的完整跨 repo checklist——manifest 節點 → router → view/按鈕 gate → 後端守衛 → API codegen → 測試 → 驗證指令；含移除頁面反向流程與「防漏測試紅了去哪修」對照表。
user-invocable: true
---

# Admin Page Lifecycle（ivyManageSystem-frontend）

新增/移除**管理端**頁面的標準流程。選單樹的唯一事實來源是
`src/constants/navigation/manifest.ts`（`NAVIGATION_MANIFEST`）：側邊欄、
`ROUTE_PERMISSION_RULES`、權限編輯器樹全部由它衍生，**不再有任何一處手寫**。
權限模型背景（三層語意 / scope / 守衛選擇）先讀後端
`../ivyManageSystem-backend/docs/sop/permission-model.md`。

> 本 checklist 含後端步驟（守衛、codegen），跨 repo 一份不拆兩份。
> Portal（`/portal/*`）與公開頁（`PUBLIC_ROUTES`）**不走本流程**——它們不在
> manifest 範圍（見 `src/constants/permissions.ts`）。

## 什麼時候用

- 新增一個後台頁面 / 側邊欄選單項 / 隱藏頁（有路由無選單）。
- 移除既有頁面（或把頁面收斂成 redirect）。
- 調整某頁的檢視權限（誰看得到）或操作權限（誰能按按鈕）。

## Step 0：先判斷——需要新權限碼嗎？（決策表）

| 情境 | 判定 | 動作 |
|---|---|---|
| 新頁是既有業務域的延伸（如 `/students/year-plan` 之於班級管理）| **復用既有模組碼**（多數情況）| 直接走下方 checklist，檢視碼填既有碼 |
| 新頁是全新業務域，或需要獨立授權粒度（有人該看 A 不該看 B）| **需要新碼** | **先**跑後端 skill `../ivyManageSystem-backend/.claude/skills/permission-code-lifecycle/SKILL.md` 完成加碼 7 步，**再**回來走本 checklist |
| 只是把既有頁拆頁/搬路徑 | 不需新碼 | 走「移除」+「新增」，注意 redirect 保留規則（extraRoutes）|

## 新增頁面 checklist

### 1. manifest 節點：`src/constants/navigation/manifest.ts`

在對應 `groups[].pages` 加節點（型別 `ManifestPage`，權限碼欄位綁
`PermissionName`——打錯字直接 typecheck error）：

```ts
{
  key: 'myFeature', title: '我的功能', routePath: '/my-feature',
  views: [{ code: 'MY_FEATURE_READ' }],          // 檢視碼（OR 語意可多碼）
  actions: [{ code: 'MY_FEATURE_WRITE' }],       // 操作碼（按鈕 gate + picker）
  menu: { icon: icon('Document') },              // 省略 menu = 隱藏頁（有路由無選單）
},
```

五種節點型態（照 manifest.ts 內既有範例抄）：

| 型態 | 寫法 | 既有範例（key）|
|---|---|---|
| 一般選單頁 | `routePath` + `menu` + owned `views` | `employees` |
| 隱藏頁（有路由無選單）| 有 `routePath`、省略 `menu` | `studentsHealth` |
| route-only 規則（redirect 保留、子頁）| 掛某頁 `extraRoutes[]` | `admissions` 的 `/recruitment` |
| picker-only 節點（無路由、僅授權）| `routePath: null` | `specialNeeds`、`portalOps` |
| 共用碼頁（借道別頁的碼）| `views: []` + `sharedViews: [...]` | `enrollmentStats`、活動群組各頁 |

鐵律：

- **每個權限碼「主屬」恰好一處**（某頁 `views` / 某頁 `actions` /
  `standalonePermissions`）；多頁共用同一碼時，其他頁用 `sharedViews` 借道。
  `manifestIntegrity.test.ts` 會 enforce 唯一性。
- 整段子路徑同權限才用 `routePrefix: true`；`/settings` 這種「子路由權限不同」
  的頁**禁用 prefix**（外溢提權，見 manifest.ts 內註解）。

### 2. 路由：`src/router/index.ts`

加 route（lazy import view）。**不要**手改 `ROUTE_PERMISSION_RULES`——它自
2026-07-31 起由 manifest 衍生（`src/constants/navigation/derive.ts`），
`src/constants/permissions.ts` 只剩檔尾 re-export；在 permissions.ts 手寫規則
會被 manifest 測試擋下。

### 3. View 元件 + 操作級按鈕 gate

`src/views/` 下建 SFC（`<script setup lang="ts">`）。寫入類按鈕加 gate：

```ts
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
const canWrite = computed(() => hasPermission(PERMISSION_NAMES.MY_FEATURE_WRITE))
```

### 4. 後端 endpoint 守衛（ivyManageSystem-backend）

每個 API 掛 `Depends(require_staff_permission(Permission.MY_FEATURE_READ))`
（管理端**一律** staff 版——結構性擋 teacher/parent；何時可用
`require_permission` 的判準見 `docs/sop/permission-model.md` §4）。
mutation 端點漏掛會被 `tests/test_mutation_guard_coverage.py` 抓；GET 端點
**沒有** sweep（已知缺口），要自覺掛守衛並補 403 測試。

**姊妹 sweep：`tests/test_audit_route_coverage.py`**——新 mutation 端點還必須被稽核
覆蓋：要嘛在 `utils/audit.py` 的 `ENTITY_PATTERNS` 補一條 `(regex, entity_type)`，
要嘛列入該測試檔的 `AUDIT_EXEMPT` 白名單**附理由**。守衛與稽核是兩條獨立防線，
只補守衛照樣紅。

### 5. API 模組 + OpenAPI codegen

`src/api/<x>.ts` 新模組（不在元件內直接 axios）。後端 schema 定案後：

```bash
cd ../ivyManageSystem-backend && .venv/bin/python scripts/dump_openapi.py
cd ../ivyManageSystem-frontend && npm run gen:api   # 讀 ../ivy-backend/openapi.json（symlink）
```

只 commit `src/api/_generated/schema.d.ts`，不 commit openapi.json。

> ⚠ **在 worktree 內工作時不能用上面這組指令**。`npm run gen:api` 寫死讀
> `../ivy-backend/openapi.json`，而 `ivy-backend` 是指向**主 checkout**
> `ivyManageSystem-backend` 的 symlink；`dump_openapi.py` 又固定輸出到自己所在
> checkout 的根目錄。照抄的後果是：openapi.json 被倒進主 checkout（污染你沒在改
> 的樹），前端則讀到主 checkout 的**舊 schema**，你這次的後端改動根本沒進 codegen。
>
> worktree 用法——在**你目前所在的那個 BE checkout 內**產 openapi.json，再用絕對
> 路徑餵給 openapi-typescript（繞過 `gen:api` 的寫死路徑）：
>
> ```bash
> # 1) 在你正在改的 BE checkout（worktree）內產 schema
> cd /path/to/wt-<your-branch> && .venv/bin/python scripts/dump_openapi.py
> # 2) 回前端，用該 checkout 的絕對路徑做 codegen
> cd /path/to/ivyManageSystem-frontend
> npx openapi-typescript /path/to/wt-<your-branch>/openapi.json \
>   -o src/api/_generated/schema.d.ts --alphabetize
> ```
>
> （旗標與 `gen:api` 一致，只換輸入路徑；CI 的 `openapi-drift` job 跑在主 checkout
> 語境，分支合回後即回到 symlink 路徑，無需保留這段變通。）

### 6. 測試

- manifest 完整性/路由覆蓋測試（`src/constants/navigation/__tests__/`）會自動
  抓漏（漏 manifest 節點、漏 route、碼主屬重複），通常**不用改**它們——紅了
  照錯誤訊息修 manifest/router。
- fixture set-equality 測試（`manifestIntegrity.test.ts` 尾段
  `LEGACY_ROUTE_PERMISSION_RULES`）釘住的是遷移前的手寫規則集合：新增頁面屬
  **預期變更**，會紅在「衍生輸出多出…」——把新頁的三元組
  （`{ path, permission, prefix? }`，即你在 manifest 加的主路由×各檢視碼 +
  extraRoutes）補進該 fixture 陣列即可（該段若日後已刪除則略過）。
- 按 repo 慣例補 per-page 測試（403/顯示條件）；後端補該 endpoint 的 pytest。

### 7. 驗證指令（必實跑）

```bash
# 前端（repo 根目錄）
npm run test && npm run typecheck && npm run lint
# 後端：全域掃描型必跑集（這些 sweep 會因「別處漏一步」而紅）
# ⚠ worktree 情境：`../ivyManageSystem-backend` 會解析到「主 checkout」而非你的
#   後端 worktree——請 cd 到實際在改的後端 checkout（理由同第 5 步的 worktree
#   註記），否則是拿沒有你改動的樹在跑 sweep，全綠也毫無意義。
cd ../ivyManageSystem-backend && source .venv/bin/activate
pytest tests/test_permission*.py \
       tests/test_mutation_guard_coverage.py \
       tests/test_audit_route_coverage.py \
       tests/test_alembic_symmetry_lint.py \
       tests/test_route_registration_order.py \
       tests/test_no_bare_get_session_dep.py \
       tests/test_reference_data_authority.py -q
```

⚠ **後端本機不要跑 `pytest tests/ -x -q`**：全套 1.1 萬筆，且上游常有與本次改動
無關的既有失敗，`-x` 會在那裡中斷，跑不完也拿不到有效訊號。本機跑上面那組必跑集
即可，**全套交給 CI**。

## 移除頁面 checklist（反向）

1. **manifest 節點刪除**（或改成 route-only：主節點刪、redirect 舊路徑的規則
   以 `extraRoutes` 掛到承接頁——前例 `/recruitment`、`/student-enrollment`）。
2. **router route 刪除**（或改 redirect）。manifest 與 router 要同步動，否則
   路由覆蓋測試雙向斷言會紅。
3. **view / 元件 / 測試清理**：刪 SFC 與 per-page 測試；grep 確認無殘留 import。
4. **後端 endpoint 是否同刪**：若刪，`test_mutation_guard_coverage.py` 的
   `KNOWN_UNGUARDED` 白名單、`test_audit_route_coverage.py` 的 `AUDIT_EXEMPT`
   白名單（該檔有殭屍豁免 canary `test_audit_exempt_has_no_stale_entries`，
   留過時項會紅）與該 feature 的守衛測試同步清；跑 `npm run gen:api` 更新
   schema.d.ts（worktree 情境見第 5 步註記）。
5. **權限碼是否成孤兒**：該頁的 views/actions 碼若無其他頁使用——
   - 要刪碼 → 走後端 skill `permission-code-lifecycle` 的刪碼反向流程；
   - 刻意保留（業主裁定類）→ 碼移入 manifest `standalonePermissions` 豁免表
     **附 note 理由**（前例 `BUSINESS_ANALYTICS`），並在兩 repo CLAUDE.md 註記。
6. 跑上方第 7 步的驗證指令（前端三連 + 後端必跑集；非 pytest 全套）。

## 防漏測試清單（紅了去哪修）

| 測試紅了 | 位置 | 代表你漏了 | 修法 |
|---|---|---|---|
| manifest 完整性（每碼恰好主屬一處 / 借道碼幽靈）| FE `src/constants/navigation/__tests__/manifestIntegrity.test.ts` | 碼沒掛 manifest、或掛了兩處 owned | 掛進恰好一處 views/actions，共用改 `sharedViews` |
| fixture set-equality | 同上檔尾段 `LEGACY_ROUTE_PERMISSION_RULES` | 衍生規則集合改變（新增/移除頁屬**預期變更**）| 同步增/刪 fixture 內對應三元組；非預期差集才是 manifest 抄錯 |
| 路由覆蓋（router ↔ manifest 雙向）| FE `src/constants/navigation/__tests__/manifestRouteParity.test.ts` | 加了 route 忘了 manifest（或 manifest 節點無對應 route）| 補 manifest 節點/extraRoutes 或補 route；真不該有規則者列 `ROUTE_COVERAGE_EXEMPT` 附 reason |
| 既有 4 支 routePermissions | FE `src/constants/__tests__/{salary,appraisal,settings,admissions}RoutePermissions.test.ts` | 動到既有頁的碼/prefix | 檢查 manifest 對應頁，行為變更需明確裁定 |
| typecheck 紅在 manifest | `npm run typecheck` | 權限碼打錯字（非 `PermissionName`）| 對照 `PERMISSION_NAMES` 修正 |
| mutation guard sweep | BE `tests/test_mutation_guard_coverage.py` | 新 mutation 端點漏守衛 | 掛 `require_staff_permission`，或有意識列白名單附理由 |
| 稽核覆蓋 sweep | BE `tests/test_audit_route_coverage.py` | 新 mutation 端點沒配稽核 | 在 `utils/audit.py` 補 `ENTITY_PATTERNS`，或列 `AUDIT_EXEMPT` 附理由 |
| 跨 repo parity | BE `tests/test_permission_parity.py`（CI）| 兩端碼表不同步 | 走 `permission-code-lifecycle` skill 補齊 |
