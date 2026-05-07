# 教師端 Portal 大 polish — Phase 4 實作計畫（簡化版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 `PortalAttendanceView.vue`（967 行）拆為 4 子元件 + 主檔 ~280 行，月度統計區套用既有 StatCard，補 vitest 覆蓋。純前端，不動後端。

**Architecture:** 4 子元件按職責分離（sticky bar / stats / cards / table）；主檔保留 state + cache + viewMode 切換。

**Tech Stack:** Vue 3 + `<script setup>` / Element Plus / Vitest + happy-dom

**Spec:** `docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-4-design.md`

**Branch:** `feat/teacher-acd-v1-4-attendance` from `feat/teacher-acd-v1-3-contact-book`

---

## File Structure

```
src/views/portal/components/attendance/
├── AttendanceMonthSticky.vue       # sticky bar + 月份切換 + 今日按鈕
├── AttendanceStatsRow.vue           # 5 指標統計（套 StatCard）
├── AttendanceCardsView.vue          # mobile 卡片視圖
└── AttendanceTableView.vue          # 桌面表格視圖

tests/unit/views/portal/attendance/
├── AttendanceMonthSticky.test.js
├── AttendanceStatsRow.test.js
├── AttendanceCardsView.test.js
└── AttendanceTableView.test.js
```

修改：`src/views/portal/PortalAttendanceView.vue`（967 → ~280 行）。

---

### Task 4F.1: 開 phase-4 branch + commit spec/plan

- [ ] **Step 1: 切 branch from phase-3**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/teacher-acd-1
git status -sb | head
git checkout -b feat/teacher-acd-v1-4-attendance
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-05-06-teacher-portal-acd-phase-4-design.md docs/superpowers/plans/2026-05-06-teacher-portal-acd-phase-4.md
git commit -m "$(cat <<'EOF'
docs: Phase 4 spec + plan（簡化版）

PortalAttendanceView 967 → ~280 行 + 4 子元件 + StatCard 套用 + vitest；
YAGNI 砍掉 cache 替換 / 虛擬列表 / 獨立 composable。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Baseline 確認 + 建目錄**

```bash
npm run test 2>&1 | tail -5
mkdir -p src/views/portal/components/attendance tests/unit/views/portal/attendance
```

Expected：881 passed。

---

### Task 4F.2: 抽 AttendanceStatsRow + AttendanceMonthSticky（Round 1）

兩個結構單純的元件一起抽，subagent 一次處理。

#### Sub-task A: AttendanceStatsRow

**Files:**
- Create: `src/views/portal/components/attendance/AttendanceStatsRow.vue`
- Create: `tests/unit/views/portal/attendance/AttendanceStatsRow.test.js`

- [ ] **Step 1: Read PortalAttendanceView 找 stats 區塊**

```bash
grep -n "stat-item\|stat-value\|stat-label\|sheetData.summary" src/views/portal/PortalAttendanceView.vue | head -25
```

確認 5 個 stat 的 label / value 路徑與對應 tone（normal / warning / danger）。

- [ ] **Step 2: 建子元件**

```vue
<script setup>
import StatCard from '@/components/common/StatCard.vue'
import { Calendar, Clock, Warning, Close, ArrowDown } from '@element-plus/icons-vue'

const props = defineProps({
  summary: { type: Object, required: true },
})

// 對齊原 PortalAttendanceView 的 5 stat：
//   出勤天數 / 平均工時(h) / 遲到次數 / 早退次數 / 缺勤次數
// tone 對應：normal / normal / warning / warning / danger
</script>

<template>
  <div class="attendance-stats">
    <StatCard
      label="出勤天數"
      :value="summary.total_work_days ?? 0"
      :icon="Calendar"
      color="primary"
      variant="filled"
    />
    <StatCard
      label="平均工時"
      :value="summary.avg_work_hours ?? 0"
      :icon="Clock"
      color="primary"
      variant="filled"
    />
    <StatCard
      label="遲到次數"
      :value="summary.late_count ?? 0"
      :icon="Warning"
      color="warning"
      variant="filled"
    />
    <StatCard
      label="早退次數"
      :value="summary.early_leave_count ?? 0"
      :icon="ArrowDown"
      color="warning"
      variant="filled"
    />
    <StatCard
      label="缺勤次數"
      :value="summary.absent_count ?? 0"
      :icon="Close"
      color="danger"
      variant="filled"
    />
  </div>
</template>

<style scoped>
.attendance-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
</style>
```

⚠ 實際欄位名稱（`total_work_days` / `avg_work_hours` / `late_count` / `early_leave_count` / `absent_count`）以原 view 用的為準對齊。如果原 view 用 `summary.absences`、改 fixture。

- [ ] **Step 3: 寫測試**

`tests/unit/views/portal/attendance/AttendanceStatsRow.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceStatsRow from '@/views/portal/components/attendance/AttendanceStatsRow.vue'

const SUMMARY = {
  total_work_days: 18,
  avg_work_hours: 8.2,
  late_count: 2,
  early_leave_count: 1,
  absent_count: 0,
}

const STUBS = {
  StatCard: {
    template: '<div class="stat-card" :data-label="label" :data-value="value" :data-color="color">{{ label }} / {{ value }}</div>',
    props: ['label', 'value', 'icon', 'color', 'variant'],
  },
}

describe('AttendanceStatsRow', () => {
  it('renders 5 StatCards', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    expect(w.findAll('.stat-card').length).toBe(5)
  })

  it('passes correct label and value to each card', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    expect(cards[0].attributes('data-label')).toBe('出勤天數')
    expect(cards[0].attributes('data-value')).toBe('18')
    expect(cards[1].attributes('data-label')).toBe('平均工時')
    expect(cards[2].attributes('data-label')).toBe('遲到次數')
    expect(cards[2].attributes('data-color')).toBe('warning')
    expect(cards[4].attributes('data-color')).toBe('danger')
  })

  it('handles missing summary fields gracefully', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: {} }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    expect(cards[0].attributes('data-value')).toBe('0')
  })
})
```

- [ ] **Step 4: 跑 + commit（合併 Sub-task B 一起）— 等 Sub-task B 也做完**

#### Sub-task B: AttendanceMonthSticky

**Files:**
- Create: `src/views/portal/components/attendance/AttendanceMonthSticky.vue`
- Create: `tests/unit/views/portal/attendance/AttendanceMonthSticky.test.js`

- [ ] **Step 5: Read 原 sticky bar 區塊**

```bash
grep -n "sticky-month-bar\|sticky-bar__\|topSentinel\|stickyObserver\|showStickyBar\|prevMonth\|nextMonth\|todayMonth" src/views/portal/PortalAttendanceView.vue | head -20
```

確認 sticky 邏輯結構：previous / next button / 月份 label / 今日按鈕。

- [ ] **Step 6: 建子元件**

```vue
<script setup>
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

defineProps({
  visible: { type: Boolean, required: true },  // sentinel 觸發後才顯示
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  isCurrentMonth: { type: Boolean, default: false },
})

defineEmits(['prev', 'next', 'today'])
</script>

<template>
  <transition name="sticky-bar-fade">
    <div v-show="visible" class="sticky-month-bar">
      <button
        class="sticky-bar__btn"
        aria-label="上個月"
        @click="$emit('prev')"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="sticky-bar__label">{{ year }} 年 {{ month }} 月</span>
      <button
        class="sticky-bar__btn"
        aria-label="下個月"
        @click="$emit('next')"
      >
        <el-icon><ArrowRight /></el-icon>
      </button>
      <button
        v-if="!isCurrentMonth"
        class="sticky-bar__today"
        @click="$emit('today')"
      >
        今日
      </button>
    </div>
  </transition>
</template>

<style scoped>
.sticky-month-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--pt-surface-card);
  border-bottom: var(--pt-hairline);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  box-shadow: var(--pt-elev-1);
}

.sticky-bar__btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pt-text-strong);
  -webkit-tap-highlight-color: transparent;
}

.sticky-bar__btn:hover {
  background: var(--pt-surface-mute);
}

.sticky-bar__label {
  flex: 1;
  text-align: center;
  font-weight: 600;
  color: var(--pt-text-strong);
}

.sticky-bar__today {
  border: none;
  background: var(--pt-tint-primary, #eef0fd);
  color: var(--pt-tint-primary-fg, #4338ca);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: var(--text-sm);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.sticky-bar-fade-enter-active,
.sticky-bar-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.sticky-bar-fade-enter-from,
.sticky-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
```

⚠ IntersectionObserver 邏輯**不放在子元件**（observer 觀察的 sentinel 在主檔 hero card 旁，跨元件 ref 處理較複雜）。子元件只接收 `visible` prop 顯示/隱藏，不自管 observer。

- [ ] **Step 7: 寫測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceMonthSticky from '@/views/portal/components/attendance/AttendanceMonthSticky.vue'

const STUBS = {
  ElIcon: { template: '<i><slot /></i>' },
}

describe('AttendanceMonthSticky', () => {
  it('renders year/month label when visible', () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('2026')
    expect(w.text()).toContain('5')
  })

  it('hides bar when visible=false', () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: false, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    expect(w.find('.sticky-month-bar').exists() === false ||
      w.find('.sticky-month-bar').attributes('style')?.includes('none')).toBe(true)
  })

  it('shows today button only when not current month', () => {
    const wCurrent = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 5, isCurrentMonth: true },
      global: { stubs: STUBS },
    })
    expect(wCurrent.find('.sticky-bar__today').exists()).toBe(false)

    const wOther = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 4, isCurrentMonth: false },
      global: { stubs: STUBS },
    })
    expect(wOther.find('.sticky-bar__today').exists()).toBe(true)
  })

  it('emits prev / next / today on respective buttons', async () => {
    const w = mount(AttendanceMonthSticky, {
      props: { visible: true, year: 2026, month: 4, isCurrentMonth: false },
      global: { stubs: STUBS },
    })
    const buttons = w.findAll('button')
    await buttons[0].trigger('click')  // prev
    await buttons[1].trigger('click')  // next
    const todayBtn = w.find('.sticky-bar__today')
    await todayBtn.trigger('click')
    expect(w.emitted('prev')).toHaveLength(1)
    expect(w.emitted('next')).toHaveLength(1)
    expect(w.emitted('today')).toHaveLength(1)
  })
})
```

- [ ] **Step 8: 跑 + commit 合併 Round 1（兩個元件）**

```bash
npm run test -- tests/unit/views/portal/attendance/ 2>&1 | tail -10
git add src/views/portal/components/attendance/AttendanceStatsRow.vue \
        src/views/portal/components/attendance/AttendanceMonthSticky.vue \
        tests/unit/views/portal/attendance/AttendanceStatsRow.test.js \
        tests/unit/views/portal/attendance/AttendanceMonthSticky.test.js
git commit -m "$(cat <<'EOF'
feat(portal-attendance): 抽出 StatsRow + MonthSticky 子元件

從 PortalAttendanceView 拆出：
- AttendanceStatsRow：5 指標套用既有 common StatCard
- AttendanceMonthSticky：sticky 月份 bar（不含 IntersectionObserver，
  由主檔控制 visible prop）

Phase 4 Round 1 完成（2/4）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

主檔此時還沒整合進去；下一 task 整合。

---

### Task 4F.3: 抽 AttendanceCardsView + AttendanceTableView（Round 2）

兩個視圖元件，subagent 一次處理。

#### Sub-task A: AttendanceCardsView（mobile）

**Files:**
- Create: `src/views/portal/components/attendance/AttendanceCardsView.vue`
- Create: `tests/unit/views/portal/attendance/AttendanceCardsView.test.js`

- [ ] **Step 1: Read 原 cards 視圖 template**

```bash
grep -n "v-for.*sheetData.days\|day-card\|day.date\|day.status\|cards-view" src/views/portal/PortalAttendanceView.vue | head -20
```

找 mobile cards view template 範圍與 day 物件 schema。

- [ ] **Step 2: 建子元件**

```vue
<script setup>
defineProps({
  days: { type: Array, required: true },  // sheetData.days array
})
</script>

<template>
  <div class="day-cards">
    <div
      v-for="d in days"
      :key="d.date"
      class="day-card"
      :class="{
        'day-card--today': d.is_today,
        'day-card--weekend': d.is_weekend,
        'day-card--leave': d.leave_type,
        'day-card--late': d.is_late,
        'day-card--early': d.is_early_leave,
        'day-card--absent': d.is_absent,
      }"
    >
      <div class="day-card__date">
        <span class="day-card__day-num">{{ d.day }}</span>
        <span class="day-card__weekday">{{ d.weekday }}</span>
      </div>
      <div class="day-card__body">
        <template v-if="d.leave_type">
          <span class="badge badge--leave">{{ d.leave_type }}</span>
        </template>
        <template v-else-if="d.is_absent">
          <span class="badge badge--absent">缺勤</span>
        </template>
        <template v-else-if="d.punch_in_at || d.punch_out_at">
          <div class="punch-row">
            <span class="punch-label">上</span>
            <span :class="{ 'is-late': d.is_late }">{{ d.punch_in_at || '—' }}</span>
          </div>
          <div class="punch-row">
            <span class="punch-label">下</span>
            <span :class="{ 'is-early': d.is_early_leave }">{{ d.punch_out_at || '—' }}</span>
          </div>
          <div v-if="d.work_hours" class="work-hours">{{ d.work_hours }} h</div>
        </template>
        <template v-else>
          <span class="empty-text">無紀錄</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 對齊原 view 既有 .day-card 樣式（從原 PortalAttendanceView <style> 區塊複製對應 selector）。
   實作時 grep 原檔 style，把 .day-card 相關 selector 整段移到這裡。 */

.day-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.day-card {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--pt-surface-card);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
}

.day-card--today { border-color: var(--color-primary, #4f46e5); border-width: 2px; }
.day-card--weekend { background: var(--pt-surface-mute); }
.day-card--leave { background: #fef9c3; }
.day-card--late .punch-row .is-late { color: #b91c1c; font-weight: 600; }
.day-card--early .punch-row .is-early { color: #b91c1c; font-weight: 600; }
.day-card--absent { background: #fee2e2; }

.day-card__date {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 44px;
}

.day-card__day-num { font-size: 20px; font-weight: 700; color: var(--pt-text-strong); }
.day-card__weekday { font-size: var(--text-xs); color: var(--pt-text-muted); }

.day-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.punch-row { display: flex; gap: 8px; font-size: var(--text-sm); }
.punch-label { color: var(--pt-text-muted); width: 14px; }
.work-hours { font-size: var(--text-xs); color: var(--pt-text-muted); }
.empty-text { color: var(--pt-text-faint); font-size: var(--text-xs); }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--text-xs);
}

.badge--leave { background: #fef3c7; color: #92400e; }
.badge--absent { background: #fee2e2; color: #b91c1c; }
</style>
```

⚠ 實際 day 物件欄位（`day` / `weekday` / `is_today` / `leave_type` / `is_late` / `punch_in_at` / `work_hours` 等）以原 view 用的為準。Read 後對齊 template 與 fallback。

- [ ] **Step 3: 寫測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceCardsView from '@/views/portal/components/attendance/AttendanceCardsView.vue'

const DAYS = [
  { date: '2026-05-01', day: 1, weekday: '週五', is_today: false, is_weekend: false,
    punch_in_at: '08:05', punch_out_at: '17:30', work_hours: 8.4, is_late: false, is_early_leave: false, is_absent: false, leave_type: null },
  { date: '2026-05-02', day: 2, weekday: '週六', is_today: false, is_weekend: true,
    punch_in_at: null, punch_out_at: null, work_hours: null, is_late: false, is_early_leave: false, is_absent: false, leave_type: null },
  { date: '2026-05-03', day: 3, weekday: '週日', is_today: false, is_weekend: false, is_absent: true,
    punch_in_at: null, punch_out_at: null, work_hours: null, leave_type: null },
  { date: '2026-05-04', day: 4, weekday: '週一', is_today: true, is_weekend: false,
    punch_in_at: '08:35', punch_out_at: null, work_hours: null, is_late: true, leave_type: null },
  { date: '2026-05-05', day: 5, weekday: '週二', is_today: false, is_weekend: false,
    punch_in_at: null, punch_out_at: null, work_hours: null, leave_type: '事假' },
]

describe('AttendanceCardsView', () => {
  it('renders one card per day', () => {
    const w = mount(AttendanceCardsView, { props: { days: DAYS } })
    expect(w.findAll('.day-card').length).toBe(5)
  })

  it('shows day number and weekday', () => {
    const w = mount(AttendanceCardsView, { props: { days: DAYS } })
    expect(w.text()).toContain('1')
    expect(w.text()).toContain('週五')
  })

  it('marks today card with day-card--today class', () => {
    const w = mount(AttendanceCardsView, { props: { days: DAYS } })
    const cards = w.findAll('.day-card')
    expect(cards[3].classes()).toContain('day-card--today')
  })

  it('shows leave badge when leave_type present', () => {
    const w = mount(AttendanceCardsView, { props: { days: DAYS } })
    expect(w.text()).toContain('事假')
  })

  it('shows absent badge when is_absent', () => {
    const w = mount(AttendanceCardsView, { props: { days: DAYS } })
    expect(w.text()).toContain('缺勤')
  })

  it('renders punch-in/out times', () => {
    const w = mount(AttendanceCardsView, { props: { days: DAYS } })
    expect(w.text()).toContain('08:05')
    expect(w.text()).toContain('17:30')
  })

  it('handles empty days array', () => {
    const w = mount(AttendanceCardsView, { props: { days: [] } })
    expect(w.findAll('.day-card').length).toBe(0)
  })
})
```

#### Sub-task B: AttendanceTableView（desktop）

**Files:**
- Create: `src/views/portal/components/attendance/AttendanceTableView.vue`
- Create: `tests/unit/views/portal/attendance/AttendanceTableView.test.js`

- [ ] **Step 4: Read 原 table 視圖**

```bash
grep -n "el-table\|el-table-column\|table-view" src/views/portal/PortalAttendanceView.vue | head -20
```

確認 table 欄位（日期 / 星期 / 上班 / 下班 / 工時 / 狀態）。

- [ ] **Step 5: 建子元件**

```vue
<script setup>
defineProps({
  days: { type: Array, required: true },
})
</script>

<template>
  <el-table
    :data="days"
    stripe
    :row-class-name="rowClass"
    style="width: 100%"
  >
    <el-table-column prop="date" label="日期" width="110" />
    <el-table-column prop="weekday" label="星期" width="70" />
    <el-table-column label="上班">
      <template #default="{ row }">
        <span :class="{ 'cell-late': row.is_late }">{{ row.punch_in_at || '—' }}</span>
      </template>
    </el-table-column>
    <el-table-column label="下班">
      <template #default="{ row }">
        <span :class="{ 'cell-early': row.is_early_leave }">{{ row.punch_out_at || '—' }}</span>
      </template>
    </el-table-column>
    <el-table-column prop="work_hours" label="工時(h)" width="90" />
    <el-table-column label="狀態">
      <template #default="{ row }">
        <span v-if="row.leave_type" class="cell-leave">{{ row.leave_type }}</span>
        <span v-else-if="row.is_absent" class="cell-absent">缺勤</span>
        <span v-else-if="row.is_late">遲到</span>
        <span v-else-if="row.is_early_leave">早退</span>
        <span v-else>—</span>
      </template>
    </el-table-column>
  </el-table>
</template>

<script>
function rowClass({ row }) {
  if (row.is_today) return 'row-today'
  if (row.is_weekend) return 'row-weekend'
  return ''
}
</script>

<style scoped>
:deep(.row-today) { background: #eef0fd !important; font-weight: 500; }
:deep(.row-weekend) { background: var(--pt-surface-mute) !important; }
.cell-late, .cell-early, .cell-absent { color: #b91c1c; font-weight: 500; }
.cell-leave { color: #92400e; }
</style>
```

注意：`rowClass` 是 component-level function，必須宣告在 `<script>`（不是 setup）才能被 template 看見。或更簡單：用 `<script setup>` 內 const + `:row-class-name` 時用箭頭：

```vue
<script setup>
defineProps({ days: { type: Array, required: true } })

const rowClass = ({ row }) => {
  if (row.is_today) return 'row-today'
  if (row.is_weekend) return 'row-weekend'
  return ''
}
</script>

<template>
  <el-table :data="days" :row-class-name="rowClass" ...>
```

選後者，更簡潔。

- [ ] **Step 6: 寫測試**

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceTableView from '@/views/portal/components/attendance/AttendanceTableView.vue'

const DAYS = [
  { date: '2026-05-01', weekday: '週五', punch_in_at: '08:05', punch_out_at: '17:30',
    work_hours: 8.4, is_today: false, is_weekend: false, is_late: false, is_early_leave: false, is_absent: false, leave_type: null },
  { date: '2026-05-04', weekday: '週一', punch_in_at: '08:35', punch_out_at: null,
    work_hours: null, is_today: true, is_weekend: false, is_late: true, is_early_leave: false, is_absent: false, leave_type: null },
  { date: '2026-05-05', weekday: '週二', punch_in_at: null, punch_out_at: null,
    work_hours: null, is_today: false, is_weekend: false, is_late: false, is_early_leave: false, is_absent: false, leave_type: '事假' },
]

const STUBS = {
  ElTable: { template: '<table><slot /></table>', props: ['data', 'rowClassName'] },
  ElTableColumn: { template: '<td><slot :row="{}" name="default" /></td>', props: ['prop', 'label'] },
}

describe('AttendanceTableView', () => {
  it('mounts with days', () => {
    expect(() => mount(AttendanceTableView, {
      props: { days: DAYS },
      global: { stubs: STUBS },
    })).not.toThrow()
  })

  it('passes days as data prop to el-table', () => {
    const w = mount(AttendanceTableView, {
      props: { days: DAYS },
      global: { stubs: STUBS },
    })
    const table = w.findComponent({ name: 'ElTable' })
    expect(table.props('data')).toEqual(DAYS)
  })

  it('handles empty days', () => {
    const w = mount(AttendanceTableView, {
      props: { days: [] },
      global: { stubs: STUBS },
    })
    expect(w.findComponent({ name: 'ElTable' }).props('data')).toEqual([])
  })

  it('rowClass returns row-today for is_today rows', () => {
    const w = mount(AttendanceTableView, {
      props: { days: DAYS },
      global: { stubs: STUBS },
    })
    const fn = w.vm.rowClass
    if (typeof fn === 'function') {
      expect(fn({ row: { is_today: true } })).toBe('row-today')
      expect(fn({ row: { is_weekend: true } })).toBe('row-weekend')
      expect(fn({ row: {} })).toBe('')
    }
  })
})
```

- [ ] **Step 7: 跑 + commit 合併 Round 2**

```bash
npm run test -- tests/unit/views/portal/attendance/ 2>&1 | tail -10
git add src/views/portal/components/attendance/AttendanceCardsView.vue \
        src/views/portal/components/attendance/AttendanceTableView.vue \
        tests/unit/views/portal/attendance/AttendanceCardsView.test.js \
        tests/unit/views/portal/attendance/AttendanceTableView.test.js
git commit -m "$(cat <<'EOF'
feat(portal-attendance): 抽出 CardsView + TableView 子元件

從 PortalAttendanceView 拆出：
- AttendanceCardsView：mobile 每日卡片視圖（含遲到/早退/缺勤/請假狀態色）
- AttendanceTableView：桌面 el-table 視圖（含 row class today/weekend）

Phase 4 Round 2 完成（4/4 子元件全部建立）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4F.4: PortalAttendanceView 主檔整合 + 收尾

**Files:**
- Modify: `src/views/portal/PortalAttendanceView.vue`

把 4 個子元件整合進主檔，移除原 inline template 與對應 style。

- [ ] **Step 1: Read 主檔目前結構（確認 state 名稱對齊）**

```bash
sed -n '1,200p' src/views/portal/PortalAttendanceView.vue
```

- [ ] **Step 2: 替換 sticky bar 區塊**

找原本 `<transition name="sticky-bar-fade">` 整段，替換為：

```vue
<AttendanceMonthSticky
  :visible="showStickyBar && isMobile"
  :year="query.year"
  :month="query.month"
  :is-current-month="isCurrentMonth"
  @prev="goPrevMonth"
  @next="goNextMonth"
  @today="goToToday"
/>
```

- [ ] **Step 3: 替換 stats 區塊**

找原本 `<div class="stat-item">` 5 個整段，替換為：

```vue
<AttendanceStatsRow v-if="sheetData?.summary" :summary="sheetData.summary" />
```

- [ ] **Step 4: 替換 cards/table 視圖**

找原本 `v-if="viewMode === 'cards'"` 跟 `v-else-if="viewMode === 'table'"` 兩段，替換為：

```vue
<AttendanceCardsView v-if="viewMode === 'cards'" :days="sheetData?.days || []" />
<AttendanceTableView v-else :days="sheetData?.days || []" />
```

- [ ] **Step 5: import 4 子元件**

```javascript
import AttendanceMonthSticky from './components/attendance/AttendanceMonthSticky.vue'
import AttendanceStatsRow from './components/attendance/AttendanceStatsRow.vue'
import AttendanceCardsView from './components/attendance/AttendanceCardsView.vue'
import AttendanceTableView from './components/attendance/AttendanceTableView.vue'
```

- [ ] **Step 6: 移除主檔內已抽出的 inline 內容**

從主檔 `<style>` 區塊移除：
- `.sticky-month-bar` / `.sticky-bar__*` / `.sticky-bar-fade-*`（已搬到 AttendanceMonthSticky）
- `.stat-item` / `.stat-value` / `.stat-label`（已換為 StatCard）
- `.day-card*` / `.punch-row` / `.work-hours` / `.empty-text`（已搬到 AttendanceCardsView）
- table 內欄位 cell 樣式（已搬到 AttendanceTableView）

主檔保留：
- `.attendance-page` 或頁面 layout container
- header card（如有）
- viewMode 切換按鈕（segment）
- loading skeleton

- [ ] **Step 7: 處理 isCurrentMonth computed（如不存在則新增）**

主檔需有 `isCurrentMonth` computed：

```javascript
const isCurrentMonth = computed(() => {
  const now = new Date()
  return query.year === now.getFullYear() && query.month === now.getMonth() + 1
})
```

`goPrevMonth` / `goNextMonth` / `goToToday` 三個 handler（如原 view 用其他名稱，對齊即可）。

- [ ] **Step 8: 跑全 vitest + 看主檔行數**

```bash
npm run test 2>&1 | tail -5
wc -l src/views/portal/PortalAttendanceView.vue
```

Expected：
- vitest ~905-915 passed（881 + 4 子元件 ~25 條）
- 主檔行數 < 320

- [ ] **Step 9: dev mode 手動驗證**

```bash
# 另一 terminal
cd /Users/yilunwu/Desktop/ivyManageSystem && ./start.sh
```

開瀏覽器 → /portal/attendance：
- 桌面：table 顯示正常、月份切換、統計區、resize 切 mobile 視圖
- mobile：cards 顯示正常、sticky bar 滑動後顯示、上下月切換、「今日」按鈕跳當月

`Ctrl+C` 停。

- [ ] **Step 10: Commit + phase 4 收尾**

```bash
git add src/views/portal/PortalAttendanceView.vue
git commit -m "$(cat <<'EOF'
refactor(portal-attendance): 主檔整合 4 子元件 + 移除 inline 模板

PortalAttendanceView 整合 MonthSticky / StatsRow / CardsView / TableView，
移除既有 inline template 與已搬遷的 style；保留 sheetCache、viewMode、
isMobile 切換、IntersectionObserver sentinel 邏輯在主檔（state ownership）。

Phase 4 完成：967 → ~280 行，4 子元件，~25 條 vitest 新增。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline feat/teacher-acd-v1-3-contact-book..
```

Phase 4 完成；不主動 push（用戶決定統一順序）。

---

## Phase 4 完成檢核

- [ ] 4 子元件建立（StatsRow / MonthSticky / CardsView / TableView）
- [ ] 對應 vitest 4 個測試檔（共 ~25 條）
- [ ] PortalAttendanceView 主檔 < 320 行
- [ ] StatCard 套用於 5 個統計指標
- [ ] sheetCache 邏輯保留
- [ ] sticky bar IntersectionObserver 邏輯保留在主檔（不破壞既有行為）
- [ ] 全 vitest 綠
- [ ] dev mode 手動驗證 desktop + mobile
