---
name: ui-design-preview
description: Create a reviewable UI preview only for large or high-ambiguity Ivy frontend changes, such as a new workflow, information-architecture change, broad redesign, or multiple materially different visual directions. Do not impose a preview gate on clear, localized UI edits.
---

# UI Design Preview

這支 skill 是**高歧義 UI 決策工具**，不是所有畫面異動的強制前置關卡。

## 先判斷是否需要 preview

需要 preview：

- 全新頁面或跨頁工作流程，且資訊架構／互動仍有多個合理方向。
- 大幅重排 layout、navigation、資料密度或跨 Admin／Portal／Parent／Public 的視覺系統。
- 實作前需要使用者在兩個以上 materially different 方案中裁定。
- 使用者明確要求 mockup、前後對照或先看設計稿。

直接實作：

- 文案、錯字、單一欄位／按鈕、局部 spacing/token、明確的 responsive 或 accessibility 修正。
- 既有 pattern 已足以唯一決定做法，或使用者明確要求直接改。

若只是不熟悉現況，先讀程式碼與觀察實際頁面；不要把「agent 不知道」誤判成產品歧義。

## 建立可信現況

1. 先讀 repo 指引，再完整讀 `PRODUCT.md` 與 `DESIGN.md`。
2. 讀本次畫面的實際 view/component、layout、共用元件與相關 styles/tokens；涉及 sidebar 時另讀 `src/constants/navigation/manifest.ts`。實際原始碼是現況權威，不能只看舊 mockup 或模板。
3. 若 dev server 已在執行且當前環境有可用的 in-app browser／browser-control 工具，可用它觀察頁面與視口；沒有就以本地程式碼與資產為證據，並明說未做 live capture。
4. 不假設 repo 有 Playwright MCP、`.playwright-mcp/` 截圖、e2e script 或已登入瀏覽器。只使用當下實際可用的工具與設定。

## 產出 preview

1. 把尚待裁定的設計選項與取捨寫清楚；若只有一個合理方案，通常不需要另做 mockup。
2. 需要 HTML mockup 時，存到 `docs/mockups/YYYY-MM-DD-<slug>.html`。可選用 `references/admin-shell-template.html` 作為**過時骨架素材**，但它不是現況快照：使用前必須逐項對照實際 layout、tokens、manifest 與頁面，更新後才可移除模板內的 stale 警示。
3. 改既有頁時只對真正變動區做必要的前後對照；互動以理解決策所需的最小程度為準。範例資料使用擬真但非真實個資。
4. 有 browser-control 時用它開啟或截圖；沒有時回報可點擊的本地檔案路徑。不要自行執行 macOS `open` 或虛構瀏覽結果。
5. preview 承載實質產品選擇時，呈交差異與取捨後等待使用者裁定；確認後才實作該選擇。

## 實作與驗證

- 實作遵循 `PRODUCT.md`、`DESIGN.md` 與實際元件 pattern。設計稿可以自足地使用快照值，但不要把其 hex／inline style 直接複製進 `src/`。
- 新增或改動後台頁面、navigation 或頁面權限時，轉入 `.claude/skills/admin-page-lifecycle/SKILL.md`。
- 驗證命令以當前 `package.json`、CI 與相關測試為準。不要宣稱 stylelint 全域阻擋 hardcoded hex，也不要發明不存在的 e2e／Playwright 命令。
