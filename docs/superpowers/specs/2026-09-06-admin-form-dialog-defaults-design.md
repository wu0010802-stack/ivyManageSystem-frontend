# 後台新增／編輯表單：預設層、FormDialog 薄封裝與棘輪守衛（方案 A）

- 日期：2026-09-06
- 範圍：ivy-frontend 後台管理端（`src/views/**`、`src/components/**`，排除 `parent/`、`portal/`、`public`、`kiosk`）
- 基底：origin/staging `224895fc`
- 前置 spec：`2026-06-02-form-ux-single-column-collapsible-design.md`（FormSection 收合＋錯誤展開）、`2026-07-30-admin-form-dialog-shell-design.md`（dialog 殼層全域 CSS）、`DESIGN.md` §元件詞彙（compact／standard／wide 分型，2026-08-18）
- 使用者裁定：2026-09-05 三方案中選 **A**（全域預設層＋薄封裝＋守衛＋機會式遷移）

## 1. 問題與根因

三波表單規範都已寫進 `DESIGN.md`，但落地率極低。2026-08-18 分型那波只在 09-03 進了基礎層（`c317307c`），全站遷移 commit `17215c3a` 因與 staging 上千檔衝突被棄用，改為「動到哪個改哪個」，卻沒有任何守衛；之後新增的 fees 18 個對話框照舊用 Element Plus 裸預設。

以 origin/staging 統計 84 個「`el-dialog` 內含 `el-form`」的後台檔案：

| 規範項目 | 採用檔數 |
|---|---|
| `FORM_DIALOG_WIDTH` 寬度常數 | 0 |
| `FormSection` 分段 | 5 |
| `label-position="top"` | 12（69 檔走 EP 預設 right） |
| `destroy-on-close` | 11 |
| 未儲存變更保護（before-close／useUnsavedChangesGuard） | 6 |
| 有客端 `:rules` | 15 |
| `AdminCreateButton`／`FormSectionNav` | 0 |

staging 實測 15 張新增表單：對話框寬度 8 種、送出文案 7 種、開啟後自動聚焦 0 張、關閉保護未儲存內容 3 張、驗證回饋三種模式（EP inline／只跳 toast 不標紅欄位／草稿還原提示）、4 張明顯有必填欄卻無 `is-required` 標記；殘留舊值 0 張（好）。手機版 8/15 張表單的標籤靠右浮在輸入框上方，根因是 `main.css` 的 `--to-sm` 規則只改 `text-align`，沒蓋掉 EP label-right 的 `justify-content: flex-end`。

**根因不是缺設計，是每個新 dialog 都從 EP 裸預設起步，規範靠人記，且沒有任何機制讓數字只降不升。**

## 2. 目標與非目標

目標：
1. 新表單用一個元件就自動合規（尺寸、footer、關閉保護、聚焦、鍵盤、錯誤定位）。
2. 既有 84 檔零逐檔改動就拿到全域修正（手機標籤對齊、桌機標籤位置）。
3. 守衛把「裸 dialog 表單」「手寫 px 寬度」「label-width」「按鈕誤用」四個數字鎖成只降不升，並進 CI。
4. 兩張旗艦驗證兩條遷移路徑：「重排版面」與「只換殼」。

非目標：
- 不重啟 `17215c3a` 全站遷移；不動任何驗證語意、API payload、權限判斷。
- 不做金額千分位／`MoneyInput`（另案）；不動教師端 Portal 與家長端。
- 不強制既有 13 檔命令式 `openCreate()/openEdit()` 介面改宣告式；遷移時順手改。

## 3. 決策

### 3.1 全域 CSS 預設層（`src/assets/main.css`）

**3.1.1 手機標籤對齊修正（無條件做）**

`@media (--to-sm)` 內既有的 `.el-dialog .el-form-item__label` 規則補 `justify-content: flex-start`。一行，純 bug 修正，影響所有 label-right 表單在手機上的呈現。

**3.1.2 桌機 dialog 內表單預設 label-top（開放決策 D1，預設納入）**

以 CSS 模擬 EP `label-position="top"`，作用域限定 `.el-dialog .el-form:not(.el-form--inline):not(.form-labels-inline)`：

```
.el-form-item            → display: block
.el-form-item__label     → display: inline-block; width: auto !important; height: auto;
                           line-height: 22px; padding: 0; margin-bottom: 8px;
                           justify-content: flex-start; text-align: left
.el-form-item__content   → margin-left: 0 !important
```

- `!important` 是必要的：EP 把 `label-width` 寫成 label 的 inline `style="width"`，無 label 的 item 則在 content 上寫 inline `margin-left`。手機斷點既有規則已用同一手法。
- **opt-out**：`<el-form class="form-labels-inline">` 保留左右排（給刻意緊湊的短表單或篩選列）；`el-form--inline` 自動排除。
- 已明確寫 `label-position="top"` 的 12 檔不受影響（EP 自己的 class 規則同構）。
- 風險：無 label 的 item 原本靠 `margin-left` 與上方欄位對齊（例如欄位下方的 checkbox 列），改為貼左。堆疊版面下這是正確行為。
- 驗證：以 `shots.mjs` 對 15 張表單做前後截圖比對；`el-row`/`el-col` 成對欄位不受影響。
- 桌機區塊包在 `@media (--bp-sm)`（≥768px）並限定 `html.ivy-admin`；手機由既有 `--to-sm` 規則獨佔，選擇器 (0,3,0) 壓過 EP。

若 D1 否決，只做 3.1.1，label-top 改由 FormDialog 使用端各自設定。

### 3.2 `FormDialog.vue`（`src/components/common/`）

表單型 dialog 的標準殼。它**不擁有** `el-form`（表單邏輯、`ref`、`rules`、送出 API 全留在使用端），只負責殼層行為，避免 80 檔大遷移的耦合。

Props：

| prop | 型別／預設 | 說明 |
|---|---|---|
| `modelValue` | `boolean` | `v-model` 開關 |
| `title` | `string` | 標題 |
| `size` | `FormDialogSize`，預設 `'compact'` | 對應 `FORM_DIALOG_WIDTH`，加 class `ivy-form-dialog--{size}` |
| `dirty` | `boolean \| (() => boolean)`，預設 `false` | 為真時關閉前經 `confirmDiscardChanges()` |
| `loading` | `boolean` | 主按鈕 loading（同時 disable，防重複送出） |
| `disabled` | `boolean` | 主按鈕 disabled |
| `submitText` | `string`，預設 `'儲存'` | 主按鈕文案；建立流程建議傳「建立{型}」 |
| `cancelText` | `string`，預設 `'取消'` | |
| `enterSubmit` | `boolean`，預設 `true` | 單行輸入框按 Enter 送出 |
| `autofocus` | `boolean`，預設 `true` | 開啟後聚焦第一個可輸入欄 |
| `fullscreenOnMobile` | `boolean`，預設 `size === 'wide'` | 手機滿版（沿用員工表單慣例） |
| `requiredLegend` | `string \| false`，預設 `false` | 為字串時在 body 頂端顯示必填圖例（如「* 為必填，其餘可日後補」） |

其他屬性透傳 `el-dialog`（`inheritAttrs: false` ＋ `v-bind="$attrs"`），但下列預設與 EP 不同：`destroy-on-close` 預設 **true**、`close-on-click-modal` 預設 **false**（開放決策 D2）、`close-on-press-escape` 沿用 true。使用端可覆寫。

Emits：`update:modelValue`、`submit`、`cancel`、`opened`、`closed`。

Slots：`default`（表單本體）、`title-extra`（標題旁 chip，如「序號 自動產生」）、`footer-extra`（主按鈕左側的次要動作，如「儲存並新增下一筆」「儲存草稿」）、`footer`（整個取代預設 footer）。

Expose：
- `scrollToFirstError()`：在 body 內找第一個 `.el-form-item.is-error`，`scrollIntoView({ block: 'center' })` 後聚焦其內的 input。使用端在 `validate` 失敗的 callback 呼叫；FormSection 收合區的自動展開沿用 06-02 spec 既有機制，不由本元件接管。
- `requestClose(): Promise<void>`：dirty 判定後關閉（同 `before-close`／footer 取消鈕路徑）。自訂 `footer` slot 的取消鈕必走它，才會保有離開保護。

行為細則：
- **關閉保護**：`before-close`、footer 取消鈕、Esc、遮罩點擊四條路徑統一走 `dirty` 判定 → `confirmDiscardChanges()`（既有 `useUnsavedChangesGuard.ts` 匯出的函式，文案「尚有未儲存的變更，確定離開並捨棄？」）。使用 `useFormDraft` 的表單（員工、請假）傳 `dirty=false`，靠草稿還原，不重複攔截。
- **自動聚焦**：`opened` 後找 body 內第一個 `input:not([readonly]):not([disabled]):not([type=hidden]), textarea` 且不在 `.el-select / .el-date-editor / .el-time-picker / .el-cascader / .el-autocomplete` 內的元素；找不到時聚焦 body 容器（`tabindex="-1"`），確保鍵盤使用者不會落在背景頁。
- **Enter 送出**：body `keydown.enter`；只在 target 是 `input`（非 textarea）、不在上述 picker 容器內、`!event.isComposing`（中文輸入法選字時的 Enter 不得觸發）、無 shift／ctrl／meta 時 `preventDefault` 並 emit `submit`；`loading` 或 `disabled` 時不 emit。
- **寬度**：`:width="FORM_DIALOG_WIDTH[size]"`；手機由 `main.css` 既有 95%／fullscreen 規則接管，元件不寫 RWD。
- **必填圖例**：`requiredLegend` 為字串時渲染 `<p class="required-legend">`，沿用 DESIGN.md 的 class 名。

使用範例（新增／編輯共用）：

```vue
<FormDialog
  v-model="visible"
  :title="isEdit ? '編輯課程' : '新增課程'"
  size="standardNarrow"
  :dirty="isDirty"
  :loading="saving"
  :submit-text="isEdit ? '儲存' : '建立課程'"
  @submit="handleSubmit"
>
  <el-form ref="formRef" :model="form" :rules="rules" label-position="top" scroll-to-error>
    …
  </el-form>
</FormDialog>
```

`isDirty` 由新增的通用 `useFormDirty(form, { exclude })`（`src/composables/useFormDirty.ts`）提供：`snapshot()` 於開啟或載入初值後拍照，`isDirty` 為 JSON 比對的 computed。既有 `useEmployeeFormDirty` 是雙 tab 分欄差異的特化版本，維持不動。

### 3.3 驗證 helper（`src/validators/rules.ts`）

集中提供 EP `FormItemRule` 產生器，統一文案：

| helper | 文案 |
|---|---|
| `required(label, { kind: 'input' })` | 「請輸入{label}」 |
| `required(label, { kind: 'select' })` | 「請選擇{label}」 |
| `phone(label?)` | 沿用 `src/utils/phone.ts` 既有正規化與 pattern |
| `email()` | 「Email 格式不正確」 |
| `idNumber()` | 身分證／居留證格式；`rules.ts` 的正則即新權威（既有檔案無共用正則） |
| `money({ min = 0 })` | 「請輸入 0 以上的金額」 |

現況四種文案（請輸入 51 檔／請選擇 45／必填 33／不可為空 2）不在本期回改，由遷移時順手替換；守衛不對文案計數。

### 3.4 棘輪守衛（`scripts/check-form-dialogs.mjs`）

比照 `check-error-detail-ratchet.mjs`：掃 `src/views` 與 `src/components`（排除 `portal/`、`parent/`、`public`、`kiosk`、`__tests__`），四個數字各有 baseline 常數，只准降；低於 baseline 未調降也紅（把成果鎖進版控）。`--list` 列出出現位置。

| 指標 | 計算方式 |
|---|---|
| A 裸 dialog 表單 | 每個 `<el-dialog` 區塊（至對應 `</el-dialog>`）內含 `<el-form`（非 el-form-item）即計 1（區塊數） |
| B label-width | 上述表單檔內 `label-width=` 出現次數 |
| C 硬寫寬度 | 表單檔內 `<el-dialog … width="NNN(px)?"` 出現次數 |
| D 按鈕誤用 | 新增／建立主鈕 `type="success"`，或任何按鈕文字以「＋」「+」開頭（次數） |

例外清單（`EXEMPT`）：`FormDialog.vue` 自身、確認型 dialog 的誤判可逐檔登記並附理由。接線：`package.json` 加 `check:form-dialogs`，`ci.yml` 緊接 `check:error-detail` 之後（開放決策 D3，預設 blocking）。

### 3.5 旗艦遷移（本期兩張）

**F1 新增／編輯課程**（`src/views/activity/ActivityCourseView.vue:190`，17 個 form-item、480px、label-width 90px、必填只靠送出時 toast「請填寫課程名稱和價格」）——驗證「重排版面」路徑：
- `FormDialog size="standardNarrow"`；`el-form label-position="top" scroll-to-error` 並補 `rules`（名稱、價格用 3.3 helper），移除 toast 式檢查。
- `.form-grid` 語意配對與順序（核心 → 人員 → 對象 → 說明與媒體 → 時段）：
  1. 課程名稱 `fg-8` ＋ 價格（元） `fg-4`
  2. 堂數 `fg-4` ＋ 容量 `fg-4` ＋ 允許候補 `fg-4`
  3. 講師 `fg-6` ＋ 負責老師 `fg-6`（年終獎勵歸屬 hint 改 `.form-hint`）
  4. 限定年級 `fg-12`（checkbox 群＋既有說明改 `.form-hint`）
  5. 說明 `fg-12`、影片 URL `fg-12`、課程 DM `fg-12`
  6. 既有 `el-divider`「上課時段」改 `FormSection`（常駐、不收合）：上課星期 `fg-4` ＋ 開始 `fg-4` ＋ 結束 `fg-4`，其餘時段欄位 `fg-12`
- 行為不變式：payload、DM 上傳只在編輯模式、`editingId` 判定、`data-test` 錨點全部保留；既有測試續綠。

**F2 收付款新增**（`src/components/signoff/SignoffPanel.vue`，已有 FormSection、必填、關閉確認、「儲存草稿／送出審核」雙鈕）——驗證「只換殼」路徑：
- 以 `FormDialog` 取代 `el-dialog` 殼，雙鈕透過 `footer-extra` 保留，`dirty` 接既有判定，其餘零改動。
- 目的：證明既有合規表單換殼是幾行 diff，作為後續 fees 18 檔遷移的樣板。

### 3.6 文件

- `DESIGN.md` §元件詞彙：新增「表單型 dialog 一律用 `FormDialog`」條目與 3.1.2 的 opt-out class；引用本 spec。
- 把 `17215c3a` 中的 `docs/analysis/2026-08-18-admin-create-form-inventory.md` 還原到同路徑並加註「歷史快照，處置欄以本 spec §7 為準」，修正 DESIGN.md 指向不存在檔案的問題。

## 4. 手機行為

沿用 `main.css` 既有規則：非滿版 dialog 95% 寬、`el-col` 收單欄、`.form-grid` 在 `--to-sm` 全收單欄。FormDialog 只多做 `fullscreenOnMobile`（透過 `useIsMobile`）。3.1.1 修正後，所有表單標籤在手機上左對齊堆疊。

## 5. 邊界與錯誤處理

- 中文輸入法：Enter 送出必檢查 `isComposing`。
- 巢狀 dialog／drawer 內的 dialog：`append-to-body` 由使用端透傳；FormDialog 不預設。
- `destroy-on-close` 預設 true 會讓使用端每次開啟重掛；持有昂貴狀態（大型選項清單）的表單可覆寫為 false，但此時必須自行重置欄位。
- `dirty` 為 getter 時每次關閉都重新求值，避免關閉瞬間拿到過期值。
- 守衛的正則以「標籤起始」比對，不解析 AST；誤判走 `EXEMPT` 並附理由，不放寬正則。

## 6. 測試

- `tests/components/FormDialog.test.ts`（happy-dom，`el-dialog` 用既有 stub 慣例解 teleport）：尺寸 class 與寬度、footer 文案、`dirty=true` 時關閉呼叫 `confirmDiscardChanges`（mock）且被拒時不關、Enter 在 input 上 emit `submit` 而在 textarea／`isComposing` 時不 emit、`loading` 時不 emit、`footer-extra` 與 `footer` slot、`requiredLegend` 渲染。
- `tests/unit/composables/useFormDirty.test.ts`：snapshot 前不 dirty、改值後 dirty、exclude 欄位不計。
- `tests/unit/validators/rules.test.ts`：文案與 pattern。
- 守衛：以 fixture 目錄跑 `--list` 的 smoke 測試，並把 baseline 數字寫進腳本。
- 旗艦：`ActivityCourseView` 與 `SignoffPanel` 既有測試續綠（兩棵測試樹 `tests/` 與 `src/**/__tests__` 都跑），F1 新增 rules 測試（必填斷言用 `.el-form-item.is-required`，不用「點儲存看 emit」，happy-dom 下 `validate()` 對空值恆 true）。
- 全套 gate：`vue-tsc`、`eslint`、`lint:tokens` 零新增、`npm run build`（`check-entry-chunks`：`FormDialog` 放 `components/common/`，只要 parent／portal 不 import 就不會被吸進其他 entry；若被吸入，照 `vite.config.js` manualChunks 慣例 pin 進 shared-common）。
- 視覺：`shots.mjs` 對 15 張表單做桌機＋手機前後截圖，人工比對 3.1.1／3.1.2 與兩張旗艦。

## 7. 分期與交付

| 階段 | 內容 | 產出 |
|---|---|---|
| 0 | 3.1.1（＋3.1.2 若 D1 通過）、守衛腳本＋baseline＋CI 接線 | 1 commit |
| 1 | FormDialog、useFormDirty、rules.ts、測試、DESIGN.md、還原盤點文件 | 1–2 commit |
| 2 | F1 課程、F2 收付款 | 各 1 commit |
| 後續 | 機會式遷移，優先序：fees 18 檔 → 員工／學生／班級／請假／加班 → 其餘；每批 5–8 檔、每批先確認切法 | 另開分支 |

收束：本分支只回報「本地實作／驗證完成」；push staging 與升 prod 需使用者授權（見 workspace CLAUDE.md 收尾紀律）。

## 8. 開放決策

| # | 決策 | 預設 |
|---|---|---|
| D1 | 桌機 dialog 內表單以全域 CSS 強制 label-top（3.1.2） | 做，附 `.form-labels-inline` opt-out |
| D2 | FormDialog `close-on-click-modal` 預設 false | 是 |
| D3 | 守衛進 CI blocking | 是，比照 `check:error-detail` |
