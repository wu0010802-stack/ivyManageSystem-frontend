# 新學年預編班 拖曳搬班 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓新學年預編班編班表能以原生 HTML5 拖曳，把學生從一個班列搬到另一個班列（op=assign）。

**Architecture:** 全部收斂於 `PlanRosterTable.vue`：學生 entry 設 `:draggable`，各班欄（班名 header + tbody 格子）為拖放目標，`drop` 時 emit 既有的 `student-move`；父層 `YearPlanWorkspaceView.onStudentMove` → `useYearPlanWorkspace.bulkUpdateStudents('assign', ...)` 的派發經路已存在，不改動。純前端，不觸發 OpenAPI/後端契約異動。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Vitest + @vue/test-utils。原生 HTML5 Drag-and-Drop（不用 vuedraggable，維持試算表版面）。

## Global Constraints

- 語言一律繁體中文（註解、commit message）。
- TS-only：禁 `: any`／`as any`，用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`。新 SFC/邏輯全 TypeScript。
- CI 阻擋門：`npm run typecheck`（vue-tsc）、`npm run lint`（eslint）、`npm run test`（vitest run）皆須綠。
- Conventional Commits；一個 commit 只做一件事。
- 識別子：`student-move` 的 `studentIds` 用 `PlanStudentOut.id`（＝ `Student.id`；後端 bulk `student_ids` 即指此值）。
- 拖曳只在 `editable=true`（draft 且有 `CLASSROOMS_WRITE`）時可用；同班放回為 no-op；桌機限定（原生 DnD 不支援觸控）。
- 既有試算表外觀、年級 header、順序號、容量 badge、教師列**不得變動**。
- 每個 commit message 末尾加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: PlanRosterTable 原生 HTML5 拖曳搬班

**Files:**
- Modify: `src/components/enrollment/planning/PlanRosterTable.vue`
  - 班名 header cell：`16-32`（加拖放目標 handler + 高亮 class）
  - tbody 學生格子：`92-117`（加拖放目標 handler + 高亮 class + 可拖 entry wrapper）
  - script：`328` 的佔位註解替換為拖曳 state + handlers
  - `<style scoped>`：新增拖曳游標／拖曳中／drop 高亮樣式
- Test: `src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts`（在既有 `describe` 內追加）

**Interfaces:**
- Consumes（既有，不改）：`props.editable: boolean`、`props.plan: PlanDetailOut`、`type PlanStudent = Schema<'PlanStudentOut'>`（含 `id: number`、`plan_class_id: number | null`）、`emit('student-move', payload)`，payload 型別 `{ studentIds: number[]; op: BulkOp; planClassId?: number | null; excludeReason?: string | null }`（`PlanRosterTable.vue:196-202`）。
- Produces：新增內部 handler `onDragStart(student, event)`、`onDragOver(classId)`、`onDragLeave(classId)`、`onDrop(classId)`、`onDragEnd()`，以及 ref `draggingStudent`、`dragOverClassId`。CSS class `.student-entry`、`.dragging`、`.drop-target-active`。這些皆為元件內部，不對外曝露新 prop/emit。

- [ ] **Step 1: 寫失敗測試（4 條）**

在 `PlanRosterTable.spec.ts` 既有 `describe('PlanRosterTable', () => {` 區塊內、最後一個 `it(...)` 之後、關閉 `})` 之前，貼上：

```ts
  // ── 拖曳搬班（原生 HTML5 DnD）──
  // buildPlan 版面：class 10（小班A）／class 11（中班A）；學生 1/2/3 皆在 class 10。
  // .student-cell 依 row×class 排列 → index 0,2,4=class10 欄；index 1,3,5=class11 欄。
  it('拖曳學生到別班欄 drop → emit student-move（op=assign、單一學生、目標班 id）', async () => {
    const w = mountTable()
    // 第一個 .student-entry = 小明（student.id=1，原 class 10）
    await w.findAll('.student-entry')[0].trigger('dragstart')
    // index 1 = 第一列的 class 11 欄（空格）
    await w.findAll('.student-cell')[1].trigger('drop')
    const events = w.emitted('student-move')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ studentIds: [1], op: 'assign', planClassId: 11 })
  })

  it('拖回原班（同一班欄）drop → 不 emit student-move（no-op）', async () => {
    const w = mountTable()
    await w.findAll('.student-entry')[0].trigger('dragstart') // 小明，原 class 10
    await w.findAll('.student-cell')[0].trigger('drop') // index 0 = class 10 欄（原班）
    expect(w.emitted('student-move')).toBeFalsy()
  })

  it('editable=false：學生 entry 不可拖（draggable=false），drop 也不 emit', async () => {
    const w = mountTable({}, false)
    const entry = w.findAll('.student-entry')[0]
    expect(entry.attributes('draggable')).toBe('false')
    await entry.trigger('dragstart')
    await w.findAll('.student-cell')[1].trigger('drop')
    expect(w.emitted('student-move')).toBeFalsy()
  })

  it('dragover 目標班欄 → 該欄所有格子帶 drop-target-active，原班欄不高亮', async () => {
    const w = mountTable()
    await w.findAll('.student-entry')[0].trigger('dragstart')
    await w.findAll('.student-cell')[1].trigger('dragover') // class 11 欄
    const cells = w.findAll('.student-cell')
    expect(cells[1].classes()).toContain('drop-target-active') // class 11 欄格子
    expect(cells[3].classes()).toContain('drop-target-active')
    expect(cells[0].classes()).not.toContain('drop-target-active') // class 10 欄不高亮
  })
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts`
Expected: 4 條新測試 FAIL（`.student-entry` 找不到 / 無 `student-move` emit / 無 `drop-target-active`）；既有 8 條仍 PASS。

- [ ] **Step 3: 實作 script（state + handlers）**

在 `PlanRosterTable.vue` `<script setup>` 內，將 `328` 行的佔位註解：

```ts
// student-move：拖曳搬班留待未來接線，本 task 僅先把事件型別對齊 BulkStudentsRequest。
```

整行替換為：

```ts
// ── 拖曳搬班（原生 HTML5 DnD）：拖曳學生到別班欄 → emit student-move（op=assign）──
// 僅 editable 時可拖；同班放回 no-op；派發經路（student-move → 父層 onStudentMove →
// bulkUpdateStudents）與後端契約沿用既有實作，本元件只補 UI 觸發。
const draggingStudent = ref<{ id: number; planClassId: number | null } | null>(null)
const dragOverClassId = ref<number | null>(null)

function onDragStart(student: PlanStudent, event: DragEvent): void {
  if (!props.editable) return
  draggingStudent.value = { id: student.id, planClassId: student.plan_class_id }
  // jsdom 程式化 dispatch 無 dataTransfer；設值僅為真實瀏覽器的游標/拖曳影像。
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(student.id))
  }
}

function onDragOver(classId: number): void {
  // @dragover.prevent 已呼叫 preventDefault 允許 drop；此處僅追蹤高亮目標欄。
  if (!draggingStudent.value) return
  dragOverClassId.value = classId
}

function onDragLeave(classId: number): void {
  if (dragOverClassId.value === classId) dragOverClassId.value = null
}

function onDrop(targetClassId: number): void {
  const dragged = draggingStudent.value
  draggingStudent.value = null
  dragOverClassId.value = null
  if (!props.editable || !dragged) return
  if (dragged.planClassId === targetClassId) return // 同班放回 no-op，免無意義 version bump
  emit('student-move', { studentIds: [dragged.id], op: 'assign', planClassId: targetClassId })
}

function onDragEnd(): void {
  draggingStudent.value = null
  dragOverClassId.value = null
}
```

（`ref` 已於 `182` 匯入；`PlanStudent`、`props`、`emit` 皆已定義，無需新增 import。`op: 'assign'` 為合法 `BulkOp` 字面值。）

- [ ] **Step 4: 實作 template（可拖 entry + 拖放目標 + 高亮）**

**(a) 班名 header cell**（`16-32`）——把開頭的 `<td ...>` 由：

```html
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="class-name-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
```

改為：

```html
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="class-name-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id), 'drop-target-active': dragOverClassId === cls.id }"
              @dragover.prevent="onDragOver(cls.id)"
              @dragleave="onDragLeave(cls.id)"
              @drop="onDrop(cls.id)"
            >
```

**(b) tbody 學生格子**（`92-117`）——把整段由：

```html
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="student-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id) }"
            >
              <!-- cellStudents 回傳 0~1 筆，藉 v-for 取得模板內的區域變數 student，
                   避免同一格重複 studentsByClass.get(cls.id)![rowIdx-1] 七次 -->
              <template v-for="student in cellStudents(cls.id, rowIdx)" :key="student.id">
                <label class="student-line">
                  <el-checkbox
                    v-if="editable"
                    class="student-checkbox"
                    :model-value="selected.has(student.id)"
                    @change="(val: string | number | boolean) => onToggleStudent(student.id, Boolean(val))"
                  />
                  <span class="student-name">{{ student.name }}</span>
                  <span
                    v-if="dispositionTag(student)"
                    class="disposition-tag"
                    :class="`disposition-tag-${student.disposition}`"
                  >{{ dispositionTag(student) }}</span>
                </label>
                <div class="student-source">{{ student.source_classroom_name ?? '' }}</div>
              </template>
            </td>
```

改為（td 加拖放目標 + 高亮；student 內容包一層可拖 `.student-entry`）：

```html
            <td
              v-for="cls in flatClasses"
              :key="cls.id"
              class="student-cell"
              :class="{ 'grade-border-right': lastClassIds.has(cls.id), 'drop-target-active': dragOverClassId === cls.id }"
              @dragover.prevent="onDragOver(cls.id)"
              @dragleave="onDragLeave(cls.id)"
              @drop="onDrop(cls.id)"
            >
              <!-- cellStudents 回傳 0~1 筆，藉 v-for 取得模板內的區域變數 student，
                   避免同一格重複 studentsByClass.get(cls.id)![rowIdx-1] 七次 -->
              <template v-for="student in cellStudents(cls.id, rowIdx)" :key="student.id">
                <div
                  class="student-entry"
                  :draggable="editable"
                  :class="{ dragging: draggingStudent?.id === student.id }"
                  @dragstart="onDragStart(student, $event)"
                  @dragend="onDragEnd"
                >
                  <label class="student-line">
                    <el-checkbox
                      v-if="editable"
                      class="student-checkbox"
                      :model-value="selected.has(student.id)"
                      @change="(val: string | number | boolean) => onToggleStudent(student.id, Boolean(val))"
                    />
                    <span class="student-name">{{ student.name }}</span>
                    <span
                      v-if="dispositionTag(student)"
                      class="disposition-tag"
                      :class="`disposition-tag-${student.disposition}`"
                    >{{ dispositionTag(student) }}</span>
                  </label>
                  <div class="student-source">{{ student.source_classroom_name ?? '' }}</div>
                </div>
              </template>
            </td>
```

- [ ] **Step 5: 實作 CSS（`<style scoped>` 末尾追加）**

```css
.student-entry {
  cursor: grab;
}

.student-entry[draggable="false"] {
  cursor: default;
}

.student-entry.dragging {
  opacity: 0.4;
}

.student-cell.drop-target-active,
.class-name-cell.drop-target-active {
  background: var(--color-primary-soft);
  outline: 2px dashed var(--color-primary);
  outline-offset: -2px;
}
```

- [ ] **Step 6: 執行測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts`
Expected: 12 條全 PASS（8 既有 + 4 新增）。

- [ ] **Step 7: typecheck + lint**

Run: `cd ~/Desktop/ivy-frontend && npm run typecheck && npm run lint`
Expected: 皆無錯誤。

- [ ] **Step 8: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/enrollment/planning/PlanRosterTable.vue src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts
git commit -m "$(cat <<'EOF'
feat(year-plan): 編班表拖曳搬班（原生 HTML5 DnD）

學生 entry 可拖曳到別班欄（op=assign），拖放目標含班名 header 與
tbody 格子並整欄高亮；同班放回 no-op、唯讀時不可拖。派發經路
（student-move → onStudentMove → bulkUpdateStudents）沿用既有實作。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 父層 onStudentMove → bulkUpdateStudents 配線保證測試

**背景：** `YearPlanWorkspaceView.onStudentMove`（`333-347`）在拖曳功能落地前無任何觸發點，現有測試僅涵蓋 `onBulkOp`（工具列 `bulk-op`）路徑，`onStudentMove` 從未被測試/執行。本 task 補一條測試鎖住此新啟用經路的 payload 映射，避免「emit 送出但 mutation 映射錯」的漏網。

**Files:**
- Test: `src/views/students/__tests__/YearPlanWorkspaceView.test.ts`（追加 1 條測試 + 1 個 import）
- 無 production code 變更（`onStudentMove` 已存在且正確）。

**Interfaces:**
- Consumes：既有 mock `bulkUpdateClassroomYearPlanStudents`（`mockBulkStudents`）、`statusDraft()`、`detailDraftWithClasses()`、`mountView()`；真實子元件 `PlanRosterTable`（emit 來源）。
- Produces：無新介面（純測試）。

- [ ] **Step 1: 加入 PlanRosterTable import**

在 `YearPlanWorkspaceView.test.ts` 既有 import `PlanBatchToolbar`（`42`）之後加一行：

```ts
import PlanRosterTable from '@/components/enrollment/planning/PlanRosterTable.vue'
```

- [ ] **Step 2: 寫測試（在最後一個 `it(...)` 之後、`describe` 關閉 `})` 之前）**

```ts
  it('拖曳搬班：PlanRosterTable emit student-move → 呼叫 bulk API（assign、單一學生、含 base_version）', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })

    const w = mountView()
    await flushPromises()

    const roster = w.findComponent(PlanRosterTable)
    expect(roster.exists()).toBe(true)
    // 模擬拖曳搬班產生的 emit（把 student 1 搬到 class 11）
    roster.vm.$emit('student-move', { studentIds: [1], op: 'assign', planClassId: 11 })
    await flushPromises()

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [1], plan_class_id: 11, exclude_reason: null,
    })
  })
```

- [ ] **Step 3: 執行測試**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
Expected: 全 PASS（新測試立即通過——`onStudentMove` 配線已存在；本測試為覆蓋新啟用經路的 characterization/lock，非驅動新 production code）。

- [ ] **Step 4: typecheck + lint**

Run: `cd ~/Desktop/ivy-frontend && npm run typecheck && npm run lint`
Expected: 皆無錯誤。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/students/__tests__/YearPlanWorkspaceView.test.ts
git commit -m "$(cat <<'EOF'
test(year-plan): 鎖住 onStudentMove → bulkUpdateStudents 配線

拖曳搬班新啟用的 student-move 經路：PlanRosterTable emit 應以
assign/單一學生/base_version 正確映射到 bulk API。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 整合驗證（兩 task 完成後）

- [ ] 全套前端測試綠：`cd ~/Desktop/ivy-frontend && npm run test`
- [ ] `npm run typecheck && npm run lint` 綠。
- [ ] dev stack 實走（`./start.sh` 由使用者前景跑）：草稿狀態下把一名學生從 A 班拖到 B 班，放開後重繪，B 班名單與容量 badge 正確更新；拖回原班無效果；published/applied 或無 `CLASSROOMS_WRITE` 時學生不可拖。
- [ ] 確認 `schema.d.ts` 無異動（純前端）。

## Self-Review（撰寫時已核）

- **Spec coverage**：spec「元件設計／資料流／守衛／視覺回饋／測試」皆對應 Task 1；「必要時補 1 件於 YearPlanWorkspaceView.test.ts」對應 Task 2。對象外項（側欄拖放／班內排序／觸控／選擇集合一起搬）皆未納入。
- **Placeholder scan**：無 TBD/TODO；每步含實際程式碼與指令。
- **Type consistency**：`draggingStudent: { id: number; planClassId: number | null }`、`onDrop(targetClassId: number)`、emit payload `{ studentIds:[id], op:'assign', planClassId }` 與既有 emit 型別（`PlanRosterTable.vue:201`）及後端 `student_ids/plan_class_id` 映射一致。識別子統一用 `student.id`。
