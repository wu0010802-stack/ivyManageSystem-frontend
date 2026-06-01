# 金額格式統一（currency.ts 單一來源）

**日期**：2026-05-29
**範圍**：純前端
**對應 audit finding**：P2「金額格式三套並存（$1,000 / NT$1,000 / 1,000 元）」

## 問題

全站金額顯示至少三套並存，會計核對最痛：
- `utils/format.money()` → `$1,234`（22 檔使用）
- `constants/pos.formatTWD()` → `NT$ 1,234`（含空格，8 檔使用）
- 各頁面 inline `toLocaleString()` / `... 元` / 自有 `fmtNTD`（40+ ad-hoc）

無單一 `currency.ts`。已驗證**無任何處反向 parse** money/formatTWD 輸出，改格式安全。

## 解法（收斂版）

### canonical（業主決策）：`NT$1,234`（無空格、明確新台幣前綴）

1. 新增 `src/utils/currency.ts` 的 `formatCurrency(val)` 為全站單一來源：
   - `NT$1,234`（千分位 `toLocaleString('zh-Hant')`）
   - null / undefined / 空字串 / 非數字 → `—`（em dash，統一 sentinel）
2. `utils/format.money()` 與 `constants/pos.formatTWD()` **委派** `formatCurrency`
   → 30 個既有 call site **零改動**統一格式（含 POSPaymentPanel）。名稱保留避免大改。
3. 高價值 inline ad-hoc 會計頁面（fees 模組等）增量改用 `formatCurrency`；
   其餘長尾 incremental（後續）。

### 行為變更（非 silent）

- `money()` 輸出 `$1,234` → `NT$1,234`、sentinel `-` → `—`（22 檔可見變更）。
- `formatTWD()` 由 `NT$ 1,234`（空格）→ `NT$1,234`（無空格，8 檔）。
- 業主已知並選定此 canonical。

## 測試

- `tests/unit/utils/currency.test.js`：formatCurrency 6 案（格式 / 0 / 字串 / 負數 / 空值）。
- `tests/unit/utils/format.test.js`：money 區塊改寫為新 canonical。
- 全套件 2599 passed；15 個失敗經證實為**既有 flaky**（非金額相關、非決定性、單獨跑全過、
  不 import 本次變更檔案），零新增失敗。

## 不做（incremental follow-up）

- 40+ ad-hoc inline 金額顯示的全面收編（先收 fees 模組高價值處，其餘逐步）。
- i18n / 中文大寫金額（收據用 `numberToChinese` 已存在，不動）。
