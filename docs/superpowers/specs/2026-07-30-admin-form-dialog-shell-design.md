# 後台表單對話框殼層優化：body 內捲 + 區段視覺統一

- 日期：2026-07-30
- 範圍：ivy-frontend（純前端 CSS ＋ 元件樣式；不動任何表單邏輯）
- 旗艦範例：招生入學「新增訪視記錄」（`RecruitmentRecordDialog.vue`）
- 前置 spec：`2026-06-02-form-ux-single-column-collapsible-design.md`（單欄＋收合＋錯誤展開機制）

## 1. 問題

2026-06-02 spec 解決了表單的**結構**（分段、收合、驗證展開），但**殼層視覺**仍是 Element Plus 裸預設，全站 80 個 `el-dialog`+`el-form` 對話框共同中招：

1. **整頁捲動**：EP 預設 dialog 跟著 overlay 捲動。內容超過視窗時（訪視 20 欄、學生 41 欄、公告 24 欄…），標題被捲出畫面上緣、「取消／儲存」被推出下緣——使用者填到一半看不到自己在哪個對話框、也找不到儲存鈕（staging 截圖實錄）。
2. **兩套區段視覺**：`FormSection` 常駐標籤是 11px 藍色小字（看起來像連結），可收合標頭是灰底框（看起來像停用狀態），同一表單內並存。
3. **全寬輸入框**：680px dialog 裡「序號」「電話」等短欄位拉滿 640px。
4. `size="small"` 控制項在寬鬆 dialog 裡顯得侷促，觸控目標也偏小。

## 2. 決策

### 2.1 全域 dialog 殼層（`main.css`，一次覆蓋 80 個 dialog，零逐檔改動）

```
.el-dialog          → flex column、padding 下放、--radius-lg、margin 7vh
.el-dialog__header  → 常駐（flex:0）、全寬 hairline 下分隔線、標題 600
.el-dialog__body    → flex:1 + overflow-y:auto（唯一捲動區）、overscroll-behavior:contain
.el-dialog__footer  → 常駐（flex:0）、全寬 hairline 上分隔線
max-height          → calc(100dvh - margin-top - 7vh)，`top=` 屬性仍自適應
```

相容性確認：
- popper 類（select/date-picker/autocomplete）全站**無** `:teleported="false"`，body 內捲不會裁切下拉。
- `.is-fullscreen`（員工表單／證照 mobile 滿版）同樣受益：footer 常駐，EP 原生 width/height 不被覆蓋。
- 既有 mobile 斷點規則（95% 寬、el-col 收單欄）原樣保留，另補 mobile `max-height`。
- `top="5vh"` 的三個 dialog：EP 以 inline `--el-dialog-margin-top` 傳入，max-height 以 var 計算自動跟隨。
- `crisp.css` 的 `.crisp-surface` header/footer 分隔線與本規則同構，後載覆蓋，無雙線。

### 2.2 `FormSection` 視覺統一（7 個已採用的 dialog 自動受益）

常駐標籤與可收合標頭共用同一套標題樣式（`--text-base`／600／text-primary），區段之間以 hairline 分隔（`.form-section + .form-section`），移除灰框卡片。hover 標題轉主色、`:focus-visible` 外框補齊。class 名稱與 DOM 結構**全部不變**（測試錨點 `data-test`／`.form-section__body`／`.form-section__badge` 不受影響）。

### 2.3 成對短欄位雙欄（旗艦示範，2026-06-02 spec §4.2 既有例外的落地）

`RecruitmentRecordDialog`：參觀日期＋序號、幼生姓名＋適讀班級、生日＋電話、是否預繳＋收預繳人員、已註冊＋轉其他學期改 `el-row :gutter="16"` + `el-col :span="12"`；地址、textarea、法律同意維持全寬。mobile 收單欄由 `main.css` 既有規則免費取得。移除 `el-form` 的 `size="small"`。

## 3. 非目標

- 不動 2026-06-02 的收合／錯誤展開機制與 `recruitmentFormSections.ts` 對照表。
- 不逐檔改其餘 73 個 flat 表單的內容結構（殼層已由全域 CSS 覆蓋）；FormSection 採用清單仍為 opt-in follow-up。
- 不做共用 `FormDialog.vue` wrapper：殼層行為已全在 CSS 層強制，wrapper 只剩 footer 按鈕樣板價值，暫不引入（YAGNI，避免 80 檔大遷移）。

## 4. 驗收

- vitest：`FormSection`、`RecruitmentRecordDialog` 兩測試群綠（錨點不變）。
- typecheck + lint 綠。
- 視覺：訪視 dialog 開啟時標題與儲存鈕常駐；區段標題單一視覺語言；短欄位成對。
