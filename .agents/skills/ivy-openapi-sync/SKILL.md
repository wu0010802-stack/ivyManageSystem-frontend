---
name: ivy-openapi-sync
description: "Regenerate and review Ivy OpenAPI TypeScript types. Use after ivy-backend router, Pydantic schema, response_model, status code, path, or docstring changes; when schema.d.ts drifts; when npm run gen:api:check or CI openapi-drift fails; or when a frontend API endpoint is typed as unknown."
---

# Ivy OpenAPI 同步

1. 先確認 backend/frontend checkout 與 `git status`；generated output 會反映目前 `../ivy-backend`，不是自動反映 feature 或 origin。
2. 在 backend 用其 `.venv` 執行 `python scripts/dump_openapi.py`，確認 import 成功且 `openapi.json` 是 local-only。
3. 在 frontend 跑 `npm run gen:api`；只預期變更 `src/api/_generated/schema.d.ts`，不要手改它，也不要 commit `openapi.json`。
4. 逐行 review generated diff：新增/刪除 path、required/optional、nullable、enum、2xx body、operation 與非預期大規模移除。型別變 `unknown` 通常表示 backend 缺 `response_model=`，先修契約而非在前端硬寫平行型別。
5. `src/api/*.ts` 使用 `ApiBody`、`ApiQuery`、`AxiosResp`；path 不帶 `/api`，保留既有 axios wrapper。
6. 跑 `npm run gen:api:check` 前知道它會再次重產並看 porcelain；工作樹若混有其他人的 schema 改動先停止。
7. 跑 targeted backend pytest、frontend typecheck/lint/Vitest，跨端交 reviewer。
8. 回報 backend SHA/branch、生成命令、schema diff 摘要與 call sites。不要用 `git checkout --`/restore 覆蓋 generated WIP，不 push/deploy。
