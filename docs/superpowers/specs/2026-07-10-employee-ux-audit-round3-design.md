# 員工模組 UX 體檢第三輪修繕（2026-07-10）

## 背景

員工模組已歷經 07-07 全面改版與 07-10 兩批外部 review 修繕。本輪為**全新實機體檢**：以 Chrome 實際操作清單／詳情／表單／離職流程（桌機 1470px 與手機 ~606px 視口），逐項對原始碼核實 root cause。前三輪落地項（URL 同步、離開保護、必填 inline 錯誤、個資收合、手機卡片化等）驗證皆正常，本輪只收新發現問題與兩條既有 backlog。

範圍裁定（user 2026-07-10）：方案 A（下列 #1–#8）＋既有 backlog 兩條（#9、#10）。**純前端批次，後端零改動。**

## 修繕清單

### #1（P2）手機版詳情頁區塊寬度縮水

- **現象**：viewport 606px 時 `.detail-sections` 只有 476px，右側浪費 ~20% 寬度，與摘要卡右緣不對齊。
- **Root cause**（已核實）：`EmployeeDetailView.vue:225` `.detail-layout { align-items: flex-start }`；`.is-mobile` 分支（:247-248）只給 `.detail-aside` 補了 `width: 100%`，`.detail-sections` 沒補 → column 方向不 stretch，縮成內容寬。
- **修法**：`.detail-layout.is-mobile .detail-sections { width: 100%; }`。
- **驗證**：CSS-only，瀏覽器手機視口實測右緣對齊；不強造單元測試。

### #2（P3）清單搜尋框雙清除鈕

- **現象**：輸入後同時出現瀏覽器原生藍色 ✕（webkit search cancel）與 el-input 灰色 ⊗（clearable），重複且風格不搭。
- **Root cause**：batch 2 a11y 加了 `type="search"`（`EmployeeListView.vue:337`）與既有 `clearable`（:342）疊加。
- **修法**：scoped CSS 隱藏原生鈕 `input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }`，保留 el-input clearable（有 aria、樣式一致）。
- **驗證**：CSS-only，瀏覽器實測單一清除鈕。

### #3（P3）手機編輯／新增彈窗「假滿版」

- **現象**：手機視口下 `el-dialog` 已掛 `is-fullscreen` class（實測確認），但外觀仍留 8–17px 邊距、圓角、露出背景；量測寬 568px < viewport 606px。
- **Root cause**：待實作時定位——懷疑 `:width` inline style 或 overlay padding 蓋過 fullscreen 樣式（`EmployeeFormDialog.vue:547-549` 同時設 `:width`、`:top`、`:fullscreen`）。
- **修法**：fullscreen 時不傳 `width`/`top`（`:width="isMobile ? undefined : '800px'"`）或以 CSS 對 `.employee-form-dialog.is-fullscreen` 強制 `width:100%; margin:0; border-radius:0`，以實測結果為準。
- **驗證**：瀏覽器手機視口實測滿版無邊距；既有 dialog 測試（兩棵樹）綠。

### #4（P3）清單頁雙層巢狀捲動

- **現象**：`el-main` 可捲（884/580）＋ el-table 固定高度內捲（1731/564）雙層疊加：滾輪在表格上被內捲吃掉、表格下方留 ~300px 死捲動空白、無單一捲動語境。
- **修法**：收斂為**單一捲動語境**——表格高度改以視口計算（`max-height: calc(100dvh - <頁首與工具列實際佔高>)`），使清單頁本身不再外捲、死空白消失，同時保留表頭固定。offset 值以實測為準，並確認手機卡片模式不受影響。
- **驗證**：瀏覽器實測（無外層捲動、表頭固定、視窗縮放不破版）；既有清單測試綠。

### #5（P4）個資收合列文案不隨狀態變化

- **現象**：展開後標題仍是「展開查看聯絡電話・身分證・地址・緊急聯絡人」。
- **Root cause**：`EmployeeDetailView.vue:188` `el-collapse-item` title 寫死。
- **修法**：追蹤 collapse active 狀態，展開時 title 改「收合個資」（或等義文案）。
- **驗證**：元件測試——toggle 前後斷言 title 文案切換（注意兩棵測試樹同名檔）。

### #6（P4）離開保護確認框預設焦點為破壞性動作

- **現象**：「尚未儲存」確認框中「捨棄變更並離開」是 primary 且持鍵盤焦點，Enter 直接丟資料。
- **修法**：預設焦點改「繼續編輯」；「捨棄變更並離開」改 danger 視覺、不持預設焦點（ElMessageBox `confirmButtonClass` / focus 選項組合，實作時以能通過鍵盤實測為準）。
- **驗證**：單元測試斷言傳給 ElMessageBox 的選項；瀏覽器鍵盤實測 Enter 不觸發捨棄。

### #7（P4）離職管理表員工名非連結

- **現象**：離職管理 tab 員工名純文字；員工管理 tab 姓名為 router-link，不一致。
- **修法**：離職管理表員工名改 `router-link` 至 `/employees/:id`（資料需含 employee id，實作時確認；若無 id 則此項改記 backlog 不硬做）。
- **驗證**：元件測試斷言連結 href。

### #8（P4）Vue Router `next()` deprecation 警告

- **現象**：console 每次導航出現 `The next() callback in navigation guards is deprecated`（全站 guard，非員工模組專屬，順手收）。
- **修法**：router guard 改 return-style（回傳 boolean / 路由目標，去掉 next() 呼叫）。
- **驗證**：既有 router/guard 測試綠；console 警告消失。

### #9（P4・舊 backlog）編輯彈窗薪資 tab 遮罩 null 顯示 0

- **現況核實**：`EmployeeFormSalary.vue:110-113` 已有 `isReadonly` 分流（fmtRO null→'—' + Lock 圖示），07-07 backlog 記載的「顯示 0」可能已被該分流修掉。
- **修法**：先以測試固化兩條不變量——①遮罩 null 任何路徑不得渲染為 0（含 el-input-number 初始化）②儲存時遮罩欄位不得以 0 送出。測試 RED 才修、GREEN 則標記 backlog 已清（測試留下防回歸）。
- **驗證**：單元測試（isReadonly＋null 值渲染與 payload 斷言）。

### #10（P4・舊 backlog）出勤區塊英文 raw status

- **現象**：`AttendanceSection.vue:128,147` 兩處（桌機 el-table＋手機 AdminListCards）直接渲染 raw `status`。
- **Root cause / 值域**（已核實 BE `api/attendance/_shared.py:76-82`）：`normal`／`late`／`early_leave`／`late+early_leave`。
- **修法**：新增中文對照（正常／遲到／早退／遲到+早退，fallback 顯示原值），單一來源常數，**兩處渲染點都套**；`getAttendanceStatusType` 顏色映射沿用。
- **驗證**：元件測試覆蓋四值＋fallback，桌機與手機兩渲染路徑皆斷言。

## 非目標

- #8 polish 項（桌機欄寬填滿、快速標記離職 danger 樣式、頭像首字色塊）——user 裁定暫緩。
- 清單分頁——batch 2 已判 YAGNI 維持。
- 後端任何改動、OpenAPI regen。

## 執行紀律

- 每項獨立 commit、**path 限定**（`git commit -m ... -- <檔>`，`-m` 在 `--` 前）；BASE=`68579b91`。
- Working tree 有平行 session 的 public/portal WIP（12 檔），與本批目標檔零交集，不得掃入。
- Gate：員工模組兩棵測試樹全綠＋`vue-tsc` 0 errors＋ESLint 0；CSS-only 項以瀏覽器實測代替強造測試。
- 併 local main 不 push（交回 user 背靠背）。
