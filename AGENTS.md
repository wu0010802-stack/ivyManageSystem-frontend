# AGENTS.md

> **本檔不承載規則，單一權威來源是同目錄的 [`CLAUDE.md`](./CLAUDE.md)。** 任何 agent（Codex、Claude Code、其他 AI 工具）在本 repo 工作前，請完整讀取並遵循 `CLAUDE.md`；跨前後端任務另見 `../ivyManageSystem/CLAUDE.md`。

本檔過去是 CLAUDE.md 的獨立複本，長期未同步導致規則漂移，2026-07-28 起改為純指向。若在歷史版本或快取中看到以下舊規則，一律無效：

- ~~「權限位元遮罩超過 32-bit 時必須用 `BigInt` 處理」~~ → 2026-05-21 起 Permission 為 **str enum**，**禁止**任何 BigInt／位元遮罩寫法，權限檢查一律走 `src/utils/auth.ts` 的 `hasPermission`。
- ~~「直接 `git push origin main` 即可」~~ → 2026-07-13 起一律在 feature branch（worktree 內）commit，收束走 staging 閘門 promotion 流程（見 workspace `CLAUDE.md`「分支與 Worktree 規則」）。
- ~~`router/index.js`~~ → 全 codebase TS-only（2026-05-19 起），業務檔一律 `.ts`，現為 `router/index.ts`。
- ~~後端 repo 名 `ivyManageSystem-backend`~~ → 後端為 `~/Desktop/ivy-backend`。
