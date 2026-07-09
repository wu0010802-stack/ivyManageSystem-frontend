# 新學年預編班 — 拖曳搬班（Drag-and-Drop 搬班）設計

- 日期：2026-07-09
- 範圍：**純前端**（`ivy-frontend`），後端契約與 emit 經路皆沿用現有實作
- 相關：[[SPEC-012]]（`docs/spec/SPEC-012_classroom-year-plan.md`）、後端設計 `ivy-backend/docs/superpowers/specs/2026-07-05-classroom-year-plan-design.md`
- 主檔：`src/components/enrollment/planning/PlanRosterTable.vue`

## 背景

新學年預編班工作台的編班表（`PlanRosterTable.vue`）為「試算表型」`<table>`：**欄＝班（依年級分組）／列＝順序號**，每格 0~1 名學生（以 `plan_class_id` 分桶）。此版面刻意模擬紙本編班表。

功能落地時，**checkbox 批次移動優先完成，拖曳搬班延後**（元件註解 `PlanRosterTable.vue:199-200` 與 `YearPlanWorkspaceView.vue:331-332` 已明示）。**派發基盤已完成**：

- `PlanRosterTable` 已定義 `student-move` emit，型別對齊後端 `BulkStudentsRequest`。
- `YearPlanWorkspaceView.onStudentMove` 已接住此事件 → `useYearPlanWorkspace.bulkUpdateStudents(op, studentIds, planClassId, excludeReason)`。

**唯一缺口**：實際觸發 `student-move` 的拖曳 UI 操作尚未接線。本設計補上此段。

## 決策（brainstorm 已與業主確認）

1. **版面方式**：維持現行試算表 `<table>`，採**原生 HTML5 Drag-and-Drop**。不改為 kanban 型 `vuedraggable`（會失去紙本編班表版面：年級 header／順序號／容量 badge／教師列）。
2. **拖放範圍**：僅**班列之間的搬班**（`op: 'assign'`）。畢業／排除／還原建議維持既有工具列與 checkbox 經路，側欄（畢業／排除／待分班）不作為拖放目標。
3. **識別子**：`student-move` 的 `studentIds` 使用 `PlanStudentOut.id`（＝ `Student.id`；後端 `BulkStudentsRequest.student_ids` 即指此值。`student_id` 為學號顯示碼，非此用途）。與既有 checkbox 批次經路完全一致。
4. **單一學生**：一次拖曳只移動被抓取的 1 名（`studentIds: [id]`）。多筆一次仍走 checkbox＋工具列；拖曳連同勾選集合一起動屬 v1 對象外（易造成「拖 1 動 5」的意外）。
5. **桌機限定**：原生 HTML5 DnD 不支援觸控。admin 為桌機運用，可接受。

## 後端語意（已核實，無需改動）

`POST /api/classroom-year-plans/{plan_id}/students`（`post_bulk_students`）：

- `op: 'assign'` → `disposition = promote` + `plan_class_id = 目標班`，`manually_adjusted = True`。**無年級檢驗**（跨年級亦允許，與工具列「移至班級」一致）。
- `op: 'retain'` 才有 `retain_grade_mismatch` 檢驗；搬班用 `assign`，不觸及。
- 留級(retain)學生被拖至他班 → 依 `assign` 轉為 promote。此即「搬班（移到別班）」的語意，與工具列「移至班級」行為相同。
- 版本樂觀鎖（`base_version`）、`_require_draft`、`CLASSROOMS_WRITE` 守衛皆由既有端點與 `bulkUpdateStudents` 處理，前端不重複實作。

## 元件設計（全部收斂於 `PlanRosterTable.vue`）

### 內部 state（新增 2 個 ref）

- `draggingStudent: { id: number; planClassId: number | null } | null` — `dragstart` 設定，`dragend` 清空。
- `dragOverClassId: number | null` — `dragover` 中的目標班 id，用於**整欄高亮**。

### 拖曳來源

- 每個學生 entry 包一層 `:draggable="editable"`（`editable=false`＝唯讀或無權限時不可拖）。
- checkbox 維持可點（click 與 drag 由瀏覽器區分）。
- `@dragstart`：設定 `draggingStudent`，`event.dataTransfer.effectAllowed = 'move'`（供原生游標／拖曳影像）。
- `@dragend`：清空 `draggingStudent` 與 `dragOverClassId`。

### 拖放目標

- `tbody` 各 `student-cell`（每班列的格子）與該班的班名 header cell 皆為同一 `cls.id` 的拖放目標（擴大命中區）。
- 空格仍以 `maxRowCount` 渲染，學生較少的班列亦可放。
- `@dragover.prevent`：設 `dragOverClassId = cls.id`（允許 drop＋觸發整欄高亮）。
- `@dragleave`：離開時視需要收斂高亮（以 `dragOverClassId` 比對避免閃爍）。
- `@drop`：取目標 `cls.id`，通過守衛後 `emit('student-move', { studentIds: [draggingStudent.id], op: 'assign', planClassId: cls.id })`。

### 守衛 / 邊界

- **同班拖放 no-op**：`draggingStudent.planClassId === cls.id` 時不 emit（避免無意義 version bump）。
- **`editable=false`**：不掛 `draggable`、`drop` 亦不 emit。既由 `:editable="editable && canWrite"` 排除唯讀／無權限。
- **loading 中**：`bulkUpdateStudents` 的 `_runMutation` in-flight 短路已防二重發火；成功後 `load()` 重繪。
- **超額**：後端不擋（容量僅 warning），放行；重繪後容量 badge 依 `isOverCapacity` 標紅。
- **跨年級**：`assign` 無年級檢驗，放行（與工具列一致，屬刻意）。

### 視覺回饋（CSS，scoped）

- 拖曳來源：`cursor: grab`；拖曳中 `.dragging`（降 opacity）。
- 拖放目標欄：`.drop-target-active`（背景高亮＋點線框），套用於整欄格子與班名 header。
- 既有試算表外觀、年級 header、順序號、容量 badge、教師列**完全不動**。

## 資料流（端到端）

```
dragstart(學生行) → draggingStudent = { id, planClassId }
dragover.prevent(班格) → dragOverClassId = cls.id（整欄高亮）
drop(班格) → 守衛（非同班）通過
          → emit('student-move', { studentIds:[id], op:'assign', planClassId: cls.id })
YearPlanWorkspaceView.onStudentMove → bulkUpdateStudents('assign', [id], cls.id)
          → 成功後 load() 重繪（version 遞增、勾選重置）
dragend → 清空 draggingStudent / dragOverClassId
```

## 測試（Vitest，追加於 `__tests__/PlanRosterTable.spec.ts`）

1. `dragstart` 後對**別班**格子 `drop` → emit `student-move`，payload `{ studentIds:[id], op:'assign', planClassId: 目標id }`。
2. 對**同班**格子 `drop` → **不** emit（no-op）。
3. `editable=false`：學生行無 `draggable` 屬性；`drop` 亦不 emit。
4. `dragover` 於目標欄 → 該欄格子帶 `.drop-target-active`。
5. 親層 `onStudentMove → bulkUpdateStudents` 配線由既有測試涵蓋；必要時於 `YearPlanWorkspaceView.test.ts` 補 1 件。

## 對象外（YAGNI）

- 側欄（畢業／排除／待分班）作為拖放目標。
- 班內並排順序調整（後端無順序欄位，不會持久化）。
- 觸控拖曳。
- 拖曳連動 checkbox 選擇集合一次搬多人。

## 完成準則（DoD）

- 上述 4~5 項 Vitest 綠。
- `npm run typecheck`、`lint` 綠（TS-only、無 `any`）。
- dev stack 實走：草稿狀態下拖曳一名學生到別班，重繪後該班容量 badge 與名單正確更新；唯讀（published/applied）或無 `CLASSROOMS_WRITE` 時不可拖。
- 後端契約、`schema.d.ts` 無異動（純前端，不觸發 OpenAPI 漂移）。
