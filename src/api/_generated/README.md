# OpenAPI → TypeScript 契約

本目錄把 FastAPI OpenAPI schema 轉成前端可檢查的 TypeScript 型別。前端已是
TypeScript-only；API 契約變更必須同步更新產物，不能用 `any` 或手寫重複型別掩蓋漂移。

## 檔案分工

- `schema.d.ts`：由 `openapi-typescript` 產生，禁止手改。
- `typed.d.ts`：共用 helper 型別，可人工維護。
- `README.md`：流程與限制。

後端 `openapi.json` 是本機產物且不進 Git；可 review 的權威差異是前端
`schema.d.ts`。

## 標準流程

後端 router、Pydantic schema、prefix 或 `response_model` 改動後：

```bash
cd ../ivy-backend
.venv/bin/python scripts/dump_openapi.py

cd ../ivy-frontend
npm run gen:api
npm run typecheck
```

確認 `schema.d.ts` 的差異符合預期後，連同前端契約更新一起提交。只改前端 API
wrapper 時，先確認目前 schema 已與目標 backend branch 對齊。

### 漂移檢查

```bash
npm run gen:api:check
```

此命令會重產 schema，再檢查 `schema.d.ts` 是否與 Git 版本相同；它會改寫工作樹，執行前先確認沒有需要保留的未提交產物。CI 已包含 OpenAPI drift job，但 private backend checkout 或 CI secret 不可用時，workflow 可能依其明示條件跳過；不要把「job 被跳過」描述成契約已驗證。

## 在 TypeScript API 模組使用

```ts
import type { ApiBody, ApiQuery, ApiResponse } from './_generated/typed'

type EmployeesQuery = ApiQuery<'/employees', 'get'>
type EmployeesResponse = ApiResponse<'/employees', 'get'>
type EmployeeCreate = ApiBody<'/employees', 'post'>
```

可用 helper：

| Helper | 用途 |
| --- | --- |
| `ApiResponse<P, M>` | 2xx response body |
| `ApiBody<P, M>` | JSON request body |
| `ApiQuery<P, M>` | query string |
| `ApiPath<P, M>` | path parameters |
| `AxiosResp<P, M>` | Axios response promise |
| `Schema<N>` | `components.schemas` 的單一 schema |

`src/api/index.ts` 回傳 Axios response，通常需從 `response.data` 取得 body。path key
已移除 `/api` prefix，所以使用 `'/employees'`，而非 `'/api/employees'`；動態路徑的
型別參數仍要寫 OpenAPI 樣式，例如 `'/employees/{employee_id}'`。

## 契約品質與限制

- Response 顯示 `unknown` 通常表示後端缺少精確 `response_model`；應先補後端契約，
  不要在前端斷言成任意型別。
- 僅有 `204 No Content` 的 endpoint 可能得到 `never`，呼叫端需依實際 status 處理。
- dump 會 import backend app，router import chain 與必要環境必須可用；不要為產 schema
  啟動 `start.sh`，也不要連 staging／production DB。
- 多 worktree 並行時，每個 worktree 使用自己的 backend dump 與 frontend schema；產生前
  先核對 branch 與 repo 路徑，避免把另一分支的契約帶入目前工作樹。
- codegen 只產型別，不取代 `src/api/index.ts` 的 dedupe、refresh、錯誤訊息與 cookie 行為。

## 最小驗收

```bash
npm run typecheck
npm run lint
npm run test -- --run
```

實際只宣告跑過的 gate；若 OpenAPI drift 因 backend checkout、環境或權限未執行，交付時要明確列出原因。
