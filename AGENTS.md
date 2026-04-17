# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 專案概述
幼稚園考勤與薪資管理系統的前端（Vue 3 SPA）。後端為獨立 repo：`ivyManageSystem-backend`。

## 技術棧
- Vue 3 (Composition API), Vite, Vitest
- Element Plus, Pinia, Vue Router

---

## 開發指令

### 啟動前端（port 5173）
```bash
npm install
npm run dev
npm run build
```

### 測試（Vitest）
```bash
npm run test              # 執行一次
npm run test:watch        # 監視模式
npm run test:coverage     # 含覆蓋率報告
```

測試檔案位於 `tests/unit/`。

### 推送至遠端
本 repo 為獨立 git repo，直接 `git push origin main` 即可。

---

## 架構重點

### 前端路由
使用 `createWebHashHistory`（hash 模式）。管理端與教師入口（portal）路由共用同一 `router/index.js`，以 `/portal/` 前綴區分。

---

## 開發注意事項
- 回應語言：一律使用**繁體中文**

---

## 開發規範

### Git Commit 規範

使用 Conventional Commits 格式（`feat` / `fix` / `refactor` / `test` / `docs` / `chore`）。

**原則：**
- 一個 commit 只做一件事
- Commit message 說明「為什麼」
- 不 commit `.env.local`、`node_modules/`、`dist/`

---

### 程式碼品質規範

**前端：**
- API 呼叫統一透過 `src/api/` 下的模組，不在元件內直接 `fetch`/`axios`
- 狀態管理用 Pinia store，不在元件間傳遞複雜狀態
- 權限位元遮罩超過 32-bit 時必須用 `BigInt` 處理
