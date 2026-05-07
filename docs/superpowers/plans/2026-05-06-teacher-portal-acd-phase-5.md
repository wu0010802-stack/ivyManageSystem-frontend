# 教師端 Portal 大 polish — Phase 5 實作計畫（簡化版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** PortalScheduleView 701 → ~250 行 + 4 子元件 + 1 composable；mobile 換班 dialog 改 TeacherBottomSheet；mobile 日曆格子加大；補 vitest。

**Architecture:** 拆 4 子元件按職責（month header / calendar / swap table / swap dialog）+ 抽 useScheduleCalendar composable 集中日曆計算邏輯。主檔留 state + handlers。

**Tech Stack:** Vue 3 + `<script setup>` / Element Plus / Vitest + happy-dom

**Spec:** `docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-5-design.md`

**Branch:** `feat/teacher-acd-v1-5-schedule` from `feat/teacher-acd-v1-4-attendance`

---

### Task 5F.1: 開 phase-5 branch + commit docs + 建目錄

- [ ] **Step 1: 切 branch**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1
git checkout -b feat/teacher-acd-v1-5-schedule
```

- [ ] **Step 2: Commit spec + plan + 建目錄**

```bash
git add docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-5-design.md \
        docs/superpowers/plans/2026-05-06-teacher-portal-acd-phase-5.md
git commit -m "docs: Phase 5 spec + plan（簡化版）

PortalScheduleView 701 → ~250 行 + 4 子元件 + useScheduleCalendar +
TeacherBottomSheet 套 mobile 換班 dialog。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

mkdir -p src/views/portal/components/schedule tests/unit/views/portal/schedule
```

- [ ] **Step 3: Baseline**

```bash
npm run test 2>&1 | tail -5
```

Expected：910 passed。

---

### Task 5F.2: useScheduleCalendar composable + 測試

**Files:**
- Create: `src/composables/useScheduleCalendar.js`
- Create: `tests/unit/composables/useScheduleCalendar.test.js`

抽日曆計算邏輯。**先建 composable** 後續元件直接用。

- [ ] **Step 1: Read PortalScheduleView 找 calendarWeeks / isToday / isFutureDate / _todayStr**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1
grep -n "calendarWeeks\|_todayStr\|_todayMidnight\|isToday\|isFutureDate" src/views/portal/PortalScheduleView.vue | head -15
```

- [ ] **Step 2: 寫測試（先 fail）**

```javascript
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useScheduleCalendar } from '@/composables/useScheduleCalendar'

describe('useScheduleCalendar', () => {
  it('returns empty weeks when scheduleData is null', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)
    expect(calendarWeeks.value).toEqual([])
  })

  it('builds 7 columns per week with leading null padding', () => {
    // 2026-05-01 是週五 → 前面要 5 個 null（週日=0, 週一=1, ... 週四=4 共 5 cells）
    const data = ref({
      days: [
        { date: '2026-05-01', day: 1, weekday: '週五' },
        { date: '2026-05-02', day: 2, weekday: '週六' },
      ],
    })
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)

    expect(calendarWeeks.value.length).toBeGreaterThan(0)
    const firstWeek = calendarWeeks.value[0]
    expect(firstWeek.length).toBe(7)
    // 前 5 cell 為 null（週日 ~ 週四）
    expect(firstWeek[0]).toBe(null)
    expect(firstWeek[4]).toBe(null)
    // 第 6 cell（週五）為 May 1
    expect(firstWeek[5]).toEqual({ date: '2026-05-01', day: 1, weekday: '週五' })
  })

  it('pads end of last week with null', () => {
    const data = ref({
      days: [
        // 31 days of May 2026
        ...Array.from({ length: 31 }, (_, i) => ({
          date: `2026-05-${String(i + 1).padStart(2, '0')}`,
          day: i + 1,
        })),
      ],
    })
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)

    const lastWeek = calendarWeeks.value[calendarWeeks.value.length - 1]
    expect(lastWeek.length).toBe(7)
    // 31 May 2026 是週日，最後一週只有第 1 cell 有資料；2-7 為 null
    expect(lastWeek[0]).toEqual(expect.objectContaining({ day: 31 }))
    expect(lastWeek[1]).toBe(null)
  })

  it('isToday returns true for today day', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { isToday } = useScheduleCalendar(data, year, month)

    const t = new Date()
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    expect(isToday({ date: todayStr })).toBe(true)
    expect(isToday({ date: '1990-01-01' })).toBe(false)
    expect(isToday(null)).toBe(false)
  })

  it('isFutureDate returns true for today and after', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { isFutureDate } = useScheduleCalendar(data, year, month)

    const t = new Date()
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    expect(isFutureDate(todayStr)).toBe(true)
    expect(isFutureDate('1990-01-01')).toBe(false)
  })

  it('calendarWeeks reactive to data changes', async () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)
    expect(calendarWeeks.value).toEqual([])

    data.value = { days: [{ date: '2026-05-01', day: 1 }] }
    expect(calendarWeeks.value.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 跑確認 fail**

```bash
npm run test -- tests/unit/composables/useScheduleCalendar.test.js 2>&1 | tail -10
```

- [ ] **Step 4: 實作 composable**

`src/composables/useScheduleCalendar.js`：

```javascript
import { computed } from 'vue'

const _todayStr = (() => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
})()

/**
 * 排班月曆計算 helper。
 *
 * @param {Ref<Object|null>} scheduleData reactive ref，含 .days array
 * @param {Ref<number>} year reactive ref
 * @param {Ref<number>} month reactive ref（1-12）
 *
 * @returns {{
 *   calendarWeeks: ComputedRef<Array<Array<Day|null>>>,
 *   isToday: (day: Day|null) => boolean,
 *   isFutureDate: (dateStr: string) => boolean,
 * }}
 */
export function useScheduleCalendar(scheduleData, year, month) {
  const calendarWeeks = computed(() => {
    if (!scheduleData.value) return []
    const days = scheduleData.value.days
    const firstDate = new Date(year.value, month.value - 1, 1)
    const startWeekday = firstDate.getDay() // 0=Sun

    const padded = []
    for (let i = 0; i < startWeekday; i++) padded.push(null)
    for (const d of days) padded.push(d)
    while (padded.length % 7 !== 0) padded.push(null)

    const weeks = []
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7))
    }
    return weeks
  })

  const isToday = (day) => !!day && day.date === _todayStr
  const isFutureDate = (dateStr) => dateStr >= _todayStr

  return { calendarWeeks, isToday, isFutureDate }
}
```

- [ ] **Step 5: 跑直到綠 + commit**

```bash
npm run test -- tests/unit/composables/useScheduleCalendar.test.js 2>&1 | tail -10
git add src/composables/useScheduleCalendar.js tests/unit/composables/useScheduleCalendar.test.js
git commit -m "feat(portal-schedule): 新增 useScheduleCalendar composable

抽 PortalScheduleView 內 calendarWeeks / isToday / isFutureDate 邏輯。
6 條 vitest 覆蓋 weeks 結構、padding、today / future 判定、reactivity。

Phase 5 Round 1。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5F.3: 抽 ScheduleMonthHeader + ScheduleCalendarGrid（Round 2）

兩個元件 subagent 一次處理。

#### Sub-task A: ScheduleMonthHeader.vue

職責：上下月按鈕、月份 label、summary 顯示。

#### Sub-task B: ScheduleCalendarGrid.vue

職責：7×6 grid 渲染、mobile 80px+ 格子、isToday 高亮、點擊 emit。

詳細 task 內容由 subagent 透過 Read 原 view 對齊（見 dispatch 指示）。預期合計新增 ~12 條 vitest。

---

### Task 5F.4: 抽 ScheduleSwapTable + ScheduleSwapDialog（Round 3）

#### Sub-task A: ScheduleSwapTable.vue

兩個 tab（待我回覆 / 我發起）+ 換班申請列表 + 行動按鈕（回覆 / 取消）。

#### Sub-task B: ScheduleSwapDialog.vue

換班發起（select target date / target employee from candidates）+ 回覆（accept/reject）。**mobile 用 TeacherBottomSheet wrapper、desktop 用 el-dialog**，內部 form 共用。

預期合計新增 ~13 條 vitest。

---

### Task 5F.5: 主檔整合 + mobile 格子加大 + 收尾

整合 4 子元件 + composable 進主檔。日曆格子 mobile media query 改：

```css
@media (max-width: 768px) {
  .calendar-cell { min-height: 80px; padding: 6px; }
  .calendar-cell .day-num { font-size: 16px; }
}
```

跑全 vitest + dev mode 手動驗。Commit + phase 5 收尾。

---

## Phase 5 完成檢核

- [ ] useScheduleCalendar composable + 6 條 test
- [ ] 4 子元件 + 對應 vitest
- [ ] PortalScheduleView 主檔 < 280 行
- [ ] mobile 換班 dialog 改 TeacherBottomSheet
- [ ] mobile 日曆格子 ≥ 80px
- [ ] 全 vitest ~935-940 綠
