---
name: admin-page-lifecycle
description: Claude Code compatibility entry for adding, changing, moving, or removing an Ivy admin page, menu item, route, page permission, or backend-admin feature surface. Delegates to the repository's canonical agent skill instead of maintaining a second checklist.
---

# Admin Page Lifecycle（相容入口）

本檔只供 Claude Code 相容路由，**不是工作流程或專案事實的權威來源**。不要從本檔、歷史版本或快取重建舊 checklist。

## 必做路由

1. 在分析、編輯或執行驗證前，先**完整讀取** repo-local canonical skill：
   `.agents/skills/ivy-admin-page-change/SKILL.md`。
2. 依 canonical skill 執行，並以目前的 `AGENTS.md`、原始碼、測試及 `package.json` 為事實來源。本檔與它們衝突時，以 canonical skill 與可驗證現況為準並回報衝突。
3. 若工作涉及新增、刪除、改名、scope、grant、guard 或 DB catalog 等跨端權限異動，再進入正確的 sibling repo `../ivy-backend`，完整讀取：
   - `../ivy-backend/AGENTS.md`
   - `../ivy-backend/.agents/skills/ivy-permission-change/SKILL.md`
4. 若上述 canonical skill 缺失或無法完整讀取，停止使用本 adapter，明確回報斷鏈；不要退回這裡曾經存在的長篇舊流程。

## 相容層邊界

- 不在此複製 manifest、router、OpenAPI、worktree 或測試命令；這些細節只在 canonical skill 或當前 repo 設定維護。
- 舊路徑 `../ivyManageSystem-backend`、`../ivyManageSystem-frontend` 均不得使用；目前 sibling repos 是 `../ivy-backend` 與 `../ivy-frontend`。
- 不自行開 GUI、push、deploy 或操作 production。
