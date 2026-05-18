# OpenAPI → TypeScript codegen

把 FastAPI 後端的 OpenAPI schema 自動產成前端可用的 TypeScript 型別，根除
`src/api/*.js` 與後端契約漂移。**前端不需要全面轉 TypeScript** — 用 JSDoc
即可在 IDE 取得型別提示與漂移檢查。

---

## 檔案

- `schema.d.ts` — `openapi-typescript` 產出（**不要手改**）。
- `typed.d.ts` — 手寫 helper（`ApiResponse` / `ApiBody` / `ApiQuery` /
  `ApiPath` / `AxiosResp` / `Schema`）。可以改。
- `README.md` — 本文件。

---

## 平常流程

後端只要動到 router / Pydantic schema / `prefix` / response_model：

```bash
# 1. 後端 dump（在 ivy-backend repo）— openapi.json 是 dev-time artifact，
#    被 .gitignore 擋住，不入 repo（避免把全 30+ router schema 對外洩漏）
cd ../ivy-backend
python scripts/dump_openapi.py            # → ivy-backend/openapi.json（local only）

# 2. 前端 regen（在 ivy-frontend repo）
cd ../ivy-frontend
npm run gen:api                           # → src/api/_generated/schema.d.ts

# 3. commit 前端 schema.d.ts（後端不 commit openapi.json）
```

**只 commit 前端 `schema.d.ts`**。後端 `openapi.json` 是本地 artifact，每位
dev 自己跑 `dump_openapi.py` 重產；PR 看契約變更看的是 frontend 的
`schema.d.ts` diff（schema.d.ts 是 TypeScript 結構，逐欄位 readable，比
1.3MB 的 raw JSON 還適合 review）。

### 漂移檢查

```bash
npm run gen:api:check
```

實際做兩件事：先 `npm run gen:api` 重產 `schema.d.ts`，再 `scripts/check-api-drift.mjs`
跑 `git status --porcelain` 看是否與 committed 版本有任何差異（**含 untracked
— `git diff --exit-code` 對沒 commit 過的檔案會誤判 exit 0**）。

任一情況觸發 exit 1：
- 後端契約改了 → regen 結果與 committed `schema.d.ts` 不同
- `schema.d.ts` 從未 commit 過（防呆）

**目前未接 CI**。想啟用，在 frontend CI workflow 加：

```yaml
- run: cd ../ivy-backend && python scripts/dump_openapi.py
- run: cd ivy-frontend && npm run gen:api:check
```

但要先解決下方「已知限制」第 4 條：dump 需要 DB 連得到，CI 必須提供。

---

## 在 `.js` 用 JSDoc 接型別

範例見 `src/api/employees.js`。基本模式：

```js
import api from './index'

/**
 * @typedef {import('./_generated/typed').ApiQuery<'/employees', 'get'>}    EmployeesQuery
 * @typedef {import('./_generated/typed').AxiosResp<'/employees', 'get'>}  GetEmployeesResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees', 'post'>}    EmployeeCreatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees', 'post'>} CreateEmployeeResp
 */

/**
 * @param {EmployeesQuery} [params]
 * @returns {GetEmployeesResp}
 */
export const getEmployees = (params) => api.get('/employees', { params })

/**
 * @param {EmployeeCreatePayload} data
 * @returns {CreateEmployeeResp}
 */
export const createEmployee = (data) => api.post('/employees', data)
```

### 5 個 helper

| Helper | 用途 |
|--------|------|
| `ApiResponse<P, M>` | 2xx response body 的 JSON 型別 |
| `ApiBody<P, M>`     | `application/json` request body 型別 |
| `ApiQuery<P, M>`    | `?foo=bar` query string 型別 |
| `ApiPath<P, M>`     | `{employee_id}` path params 型別 |
| `AxiosResp<P, M>`   | `Promise<AxiosResponse<ApiResponse<P, M>>>` — 給 `@returns` 用 |
| `Schema<'Name'>`    | 直接取 `components.schemas` 內單一 schema |

**為何用 `AxiosResp` 而不是 `Promise<ApiResponse>`?** `src/api/index.js`
的 axios wrapper **不解包 `.data`**，呼叫端拿到的是 `AxiosResponse<T>`，
要存取 body 必須寫 `res.data`。`AxiosResp` 正確包好 wrapper 的回傳形狀。

---

## Path 寫法（坑）

`schema.d.ts` 的 path key 已剝掉 `/api` prefix。寫 `'/employees'` 而不是
`'/api/employees'`（與 `src/api/*.js` 呼叫 `api.get('/employees', ...)` 一致，
因為 axios baseURL 已是 `/api`）。

路徑剝離由 `ivy-backend/scripts/dump_openapi.py` 在 dump 時處理；想保留原
路徑跑 `python scripts/dump_openapi.py --keep-api-prefix`。

---

## Response 是 `unknown`？

很多端點目前在 OpenAPI 描述為 `application/json: unknown`，因為後端用 dict
回傳沒指定 `response_model=`。這不是 codegen bug，是契約本身就沒寫。

**修法**：在後端 router 加 `response_model=EmployeeRead` 或類似。下次重 gen，
前端會自動拿到型別，**zero frontend change**。這正是這套 codegen 的最大價值
— 把契約鎖在後端、自動下放到前端。

---

## 漸進採用建議

1. **第 0 階段（現在）**：契約凍結 + IDE 提示。`schema.d.ts` 進 git，
   後端契約變動會在前端 PR 留 diff。
2. **第 1 階段**：高風險檔案個別加 `// @ts-check` + JSDoc（薪資、考核、
   接送等）。`employees.js` 已示範。
3. **第 2 階段**：把 `jsconfig.json` 的 `"checkJs"` 切 `true`（風險：一次
   暴露大量型別 noise，建議在 worktree 練習一次再決定）。
4. **第 3 階段**：新檔案直接寫 `.ts`，舊檔案保持 `.js` + JSDoc 不必動。

**不打算做的事**：
- 不用 orval 取代 `src/api/index.js`（既有 wrapper 有 dedupe / refresh /
  displayMessage / cookie 邏輯，價值高，不適合被 codegen wrapper 取代）。
- 不強迫前端轉 TypeScript。
- 不會自動同步既有 222 個呼叫站點 — 那是 opt-in 流程。

---

## 30 秒驗證 IDE 是否接好

開 `src/api/employees.js`，在最上面臨時加一行（**驗完刪掉**）：

```js
// @ts-check
import type {} from './_generated/typed' // noop
/** @type {import('./_generated/typed').ApiQuery<'/typo-here', 'get'>} */
const _probe = {}
```

IDE 應該紅底劃線：`Type '"/typo-here"' is not assignable to type 'keyof paths'`。
紅了 = IDE 接到型別檔；沒紅 = jsconfig 路徑或編輯器 TS server 沒重啟。

---

## 已知限制

1. **Response 多 2xx code**：`ApiResponse` 取 200/201/202/204 的聯合。若
   endpoint 只回 204 No Content，結果會是 `never`（沒 JSON body）。
2. **path key 必須字面量**：JSDoc 寫 `<'/employees', 'get'>`，動態組路徑
   （如 `` `/employees/${id}` ``）型別系統看不到，但這不影響使用 — 函式
   簽名照樣 typed。寫 path 模板時用 OpenAPI 原始格式（`'/employees/{employee_id}'`），
   不要替換成實際 id。
3. **後端必須跑得起來**：`dump_openapi.py` 載入 `main.app`，所有 router
   import 鏈都要無錯。Sentry init 預設關閉、Dev router 自動掛載。
4. **CI 接漂移檢查需要 DB**：`main.app` 啟動會跑 `SalaryEngine` config 載
   入等 service init，要連得到 PostgreSQL。CI 必須 (a) provision 一個
   ephemeral DB、或 (b) mock/stub 掉 service init、或 (c) 改 `app` 為
   lazy factory。最低成本方案是 (a) — 本地已有 `start.sh` 起來的 DB，
   照搬到 CI 即可。
5. **多 worktree 同時 dev 注意**：`openapi.json` / `schema.d.ts` 是共
   享產出。在 worktree A 改後端 router 並 dump 後，worktree B 重新
   `gen:api` 會把 A 的契約覆蓋到 B 的 `schema.d.ts`。建議 dump 與 gen
   都在 merge 入主線的 worktree 跑，分支 worktree 不另 dump。
