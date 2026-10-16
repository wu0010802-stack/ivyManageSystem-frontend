---
paths:
  - "src/api/**"
  - "scripts/**"
  - "package.json"
---

# OpenAPI codegen（跨端契約管道）

> 自 CLAUDE.md 拆出（2026-09-03，path-scoped rule）：在本 repo 內開 session 且碰到 `paths` 內檔案時自動載入；從 workspace session（add-dir 不觸發 path rule）或 Codex（不讀 .claude/rules）動這些檔前請先讀本檔。

### OpenAPI codegen（跨端契約管道）

後端 FastAPI 的 Pydantic schema 是事實上的契約 single source of truth；前端 TS 型別由 codegen 自動衍生。**禁止手寫前端對應型別**（會與後端漂移）。

決策見 workspace `docs/adr/ADR-001_openapi-typescript-codegen.md`，運維手冊見 `docs/infra/INFRA-001_cross-repo-contract-sync.md`。

**跨端變更 SOP**（後端 schema 改動時）：

```bash
# 後端先行：改 router + Pydantic + pytest
cd ~/Desktop/ivy-backend
python scripts/dump_openapi.py       # 產 openapi.json（local-only，.gitignore 擋）

# 前端 codegen
cd ~/Desktop/ivy-frontend
npm run gen:api                       # 跑 openapi-typescript → src/api/_generated/schema.d.ts
# 只 commit schema.d.ts；不 commit openapi.json
```

**型別 helper**（`src/api/_generated/typed.d.ts`）：

```ts
import type { ApiBody, ApiQuery, AxiosResp, Schema } from '@/api/_generated/typed'

// Request body 型別
const body: ApiBody<'/employees', 'post'> = { ... }

// Query 型別
const params: ApiQuery<'/salaries/records', 'get'> = { year: 2026, month: 5 }

// Response 型別（注意：用 AxiosResp，因 axios wrapper 不解包 .data）
const resp: AxiosResp<'/employees', 'get'> = await api.get('/employees')
```

**重要慣例**：
- **dispatch path 不帶 `/api`**：`api.get('/employees')` 而非 `api.get('/api/employees')`；後端 `dump_openapi.py` 預設剝掉 `/api` prefix
- **`AxiosResp` 而非 `Schema`**：axios wrapper 不自動解包 `.data`，return type 必須含 `AxiosResp`；少數例外（如 `fees.ts` / `portalClassHub.ts` / `reports.ts` / `monthlyFixedCost.ts` 等內部自己解包）保留手動處理
- **缺 `response_model=` 過渡寫法**：後端 router 未標 `response_model=` 時前端會收到 `unknown`，用 `as Shape // TODO(ts-strict): waiting on backend response_model`；後端補上後型別自動下放
- **不換 `src/api/index.ts` axios wrapper**：dedupe / refresh / displayMessage / PII 過濾邏輯保留

**漂移檢查**：
- 本地：`npm run gen:api:check`（regen + porcelain check，含 untracked）
- CI：兩 repo 的 `openapi-drift` job 跑 dump + check；schema.d.ts 漂移即 fail（公開 repo 用 default `GITHUB_TOKEN`，若改 private 需建 PAT）
