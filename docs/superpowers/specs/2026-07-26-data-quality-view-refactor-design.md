# 資料品質報告頁重構設計

- 日期：2026-07-26
- 代號：`dqview01`
- 影響 repo：`ivy-frontend`（主）、`ivy-backend`（新增唯讀端點）
- 路由：`/data-quality`

## 1. 背景

`/data-quality` 是 `data_quality_reports` 表的檢視與處理介面。後端 `services/data_quality/`
定義 5 條資料不變式規則，由 `services/data_quality_scheduler.py` 每日 03:00 掃全庫一次，
違規寫入該表。

現行 5 條規則：

| 嚴重度 | `rule_code` | 語意 |
|---|---|---|
| P0 | `contact_book_orphan_student` | `ContactBookEntry.student_id` 指向不存在的 student |
| P0 | `salary_record_orphan_employee` | `SalaryRecord.employee_id` 指向不存在的 employee |
| P0 | `guardian_orphan_user` | `Guardian.user_id` 指向不存在的 user |
| P1 | `employee_active_but_offboarded` | 員工 `resign_date` 已過但 `is_active` 仍 True |
| P1 | `student_active_but_lifecycle_terminal` | 學生 lifecycle 為終態但 `is_active` 仍 True |

頁面上的「確認／修正／忽略」只變更報告的處理狀態，**不修改被指涉的業務資料**。

## 2. 問題

### 2.1 缺陷

1. **標題統計數字錯誤。** `counts` 由當前頁的 `rows` 即時計算，只涵蓋當頁 20 筆，
   並非全站待處理總數；且因統計條件寫死 `status === 'open'`，切到其他狀態篩選時歸零。
   頁面最顯眼的指標不可信。
2. **篩選未重置分頁。** `reload()` 不重置 `filters.page`，於第 N 頁變更篩選會落在空頁。
3. **`filters.rule_code` 為死碼。** 已宣告並送出，但 UI 無任何輸入點。
4. **手寫 API 型別。** `ReportRow` interface 為手寫，違反 CLAUDE.md「禁止手寫前端對應型別」；
   且漏了後端 `ReportOut` 實際回傳的 `last_seen_at` / `ack_at` / `resolved_at` / `resolution_note`。
   `listReports(params as never)` 亦繞過既有 codegen 型別。
5. **無錯誤處理。** `ack` / `resolve` / `ignore` / `runNow` 皆無 catch。後端於非法狀態轉換
   回 400（如 `cannot ack from status=ack`）時畫面無任何回饋。

### 2.2 可理解性

6. 規則欄顯示原始英文 slug，無中文說明、無影響描述、無修正指引。
7. 嚴重度、狀態、實體型別皆為英文原文。
8. `detected_at` 未經 `formatDateTimeTW`，違反 CLAUDE.md datetime 規範。
9. 無空狀態，零違規時與載入失敗在視覺上無法區分。
10. 實體欄無法跳轉至對應業務頁面。
11. 「修正」按鈕名稱暗示會自動修資料，實際只寫狀態。
12. 標題未顯示最後掃描時間，無從判斷資料新舊。

## 3. 設計

### 3.1 後端（ivy-backend）— 只加不改

**新增 `GET /api/data-quality/summary`**，權限 `DATA_QUALITY_READ`：

```python
class SummaryOut(BaseModel):
    open_by_severity: dict[str, int]   # {"P0": 2, "P1": 5, "P2": 0}
    total_open: int
    last_run_at: Optional[date]
```

- `open_by_severity`：對 `status == "open"` 做 `group_by(severity)` 聚合；
  P0/P1/P2 三鍵**恆存在**（無資料補 0），避免前端做鍵存在性判斷。
- `last_run_at`：讀排程器 watermark。新增公開薄殼 `get_last_run_date(session)` 供 api 層呼叫。
  **不**把既有的 `_load_last_run_date` 改名：該私有名在 `finance_reconciliation` /
  `medication_reminder` 三個 scheduler 是一致慣例，且已被 offload 測試 monkeypatch，
  改名會破壞兩者。

不修改任何規則判定邏輯、不修改既有端點。5 條規則的 `description` 經確認**已全部填妥**，
無需補寫；前端亦不依賴此欄位（見 3.2）。

#### 實際 `entity_type` 值（前端跳轉對照用）

`student`、`employee`、`contact_book_entry`、`guardian`、`salary_record`

### 3.2 前端（ivy-frontend）

#### 檔案結構

| 檔案 | 職責 |
|---|---|
| `src/constants/dataQualityRules.ts` | 新增。規則 metadata：中文名、說明、影響、修正指引、跳轉 resolver |
| `src/composables/useDataQualityReports.ts` | 新增。載入、篩選、分頁、統計、錯誤處理的狀態邏輯 |
| `src/components/dataQuality/RuleExplainPopover.vue` | 新增。規則說明展開卡 |
| `src/api/dataQuality.ts` | 加 `getSummary()`；型別改吃 codegen |
| `src/views/DataQualityView.vue` | 瘦身為組裝層 |

**規則 metadata 置於前端而非後端**，理由：「怎麼修」與「跳去哪一頁」本質上是前端知識
（涉及前端路由）。代價是新增規則需兩端同步；以 fallback 機制吸收——
**未知 `rule_code` 一律降級顯示原始代碼**，後端日後新增規則時前端不會壞，僅暫無中文說明。

#### 缺陷修正對應

| # | 修正 |
|---|---|
| 1 | 統計改吃 `getSummary()`，顯示全站待處理數；與列表篩選解耦 |
| 2 | 任何篩選變更先 `page = 1` 再載入 |
| 3 | 補上規則篩選下拉（後端本已支援 `rule_code` query），死碼轉活 |
| 4 | 手寫 `ReportRow` 換成 codegen 型別，移除 `as never`，取回漏掉的 4 個欄位 |
| 5 | 四個寫入操作全補 try/catch + `ElMessage.error`，失敗不重載列表 |

#### 可理解性改善

| # | 改善 |
|---|---|
| 6 | 規則欄顯示中文名 + ⓘ 展開說明卡（是什麼／影響／怎麼修） |
| 7 | 嚴重度 `P0 嚴重`／`P1 警告`／`P2 提示`；狀態 `待處理`／`已確認`／`已修正`／`已忽略` |
| 8 | 時間欄走 `formatDateTimeTW` |
| 9 | 空狀態：「目前沒有待處理的資料品質問題」+ 最後掃描時間 |
| 10 | 實體可跳轉：`student` → `/students/profile/:id`、`employee` → `/employees/:id`；`contact_book_entry` / `guardian` 無對應管理頁，顯示純文字並於說明卡標註需工程處理 |
| 11 | 「修正」改名「標記已修正」，說明卡言明本頁不會自動修資料 |
| 12 | 標題列顯示最後掃描時間 |

P2 篩選選項保留（目前無 P2 規則，但成本為零且未來相容）。

### 3.3 資料流

```
DataQualityView.vue
  └─ useDataQualityReports()
       ├─ listReports()   → 表格資料（受篩選/分頁影響）
       └─ getSummary()    → 標題統計（不受篩選影響，寫入操作後重取）
  └─ DATA_QUALITY_RULES[rule_code] → 中文名 / 說明 / 跳轉目標（純前端查表，有 fallback）
```

統計與列表為兩條獨立的載入路徑：篩選變更只重載列表；`ack`/`resolve`/`ignore`/`runNow`
成功後兩者皆重載（待處理數會變）。

### 3.4 錯誤處理

- 列表載入失敗：表格區顯示錯誤狀態，保留既有資料不清空。
- 統計載入失敗：統計區降級為 `—`，不阻斷列表顯示。
- 寫入操作失敗：`ElMessage.error` 顯示後端 message，不重載列表（避免掩蓋失敗）。
- axios wrapper（`src/api/index.ts`）既有的 displayMessage 機制保留，不重複攔截。

## 4. 測試

**前端**
- 更新 `src/views/__tests__/DataQualityView.test.ts`
- 新增 `useDataQualityReports` 測試：分頁重置、統計獨立載入、寫入失敗不重載
- 新增 `dataQualityRules` 測試：已知 code 對應正確、未知 code fallback 不拋錯

**後端**
- `tests/test_data_quality_endpoints.py` 補 summary：三鍵恆存在、只計 open、權限守衛

## 5. 執行順序

1. 後端 router + pytest（branch `feat/data-quality-summary`）
2. `python scripts/dump_openapi.py`
3. 前端 `npm run gen:api`（branch `refactor/data-quality-view`）
4. 前端實作 + 測試
5. `npm run test` / `npm run typecheck` / `npm run lint` 全綠

## 6. 非目標

- 不實作「一鍵自動修正」（會改動業務資料，需獨立的權限與稽核設計）
- 不新增、不修改任何資料品質規則
- 不調整排程時間與 scheduler 行為
