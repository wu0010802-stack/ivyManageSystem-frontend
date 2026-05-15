<template>
  <div class="bonus-dashboard" v-loading="loading">
    <!-- ===== Festival banner ===== -->
    <div
      class="festival-banner"
      :class="data?.is_festival_month ? 'festival-banner--active' : 'festival-banner--quiet'"
    >
      <div class="banner-left">
        <span class="banner-icon" v-html="data?.is_festival_month ? CROWN_SVG : MOON_SVG" />
        <div class="banner-text">
          <div class="banner-title">
            {{ data?.is_festival_month ? '本月為獎金發放月' : '本月為非發放月' }}
          </div>
          <div class="banner-sub">
            {{ data?.is_festival_month
              ? '達成目標的班級將計入本月獎金結算'
              : '此月份僅顯示達成率追蹤，獎金將累積至下次發放月' }}
          </div>
        </div>
      </div>
      <el-date-picker
        v-model="selectedMonth"
        type="month"
        placeholder="選擇月份"
        value-format="YYYY-MM"
        :clearable="false"
        class="banner-picker"
      />
    </div>

    <!-- ===== Summary cards ===== -->
    <el-row :gutter="16" class="summary-cards" v-if="data">
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card summary-card--primary">
          <div class="card-top">
            <span class="card-icon" v-html="ICON_PEOPLE" />
            <span class="card-label">在籍總人數</span>
          </div>
          <div class="card-value">{{ data.school_wide.total_enrollment }}</div>
          <div class="card-sub">全校統計</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card summary-card--blue">
          <div class="card-top">
            <span class="card-icon" v-html="ICON_TARGET" />
            <span class="card-label">全校目標</span>
          </div>
          <div class="card-value">{{ data.school_wide.total_target }}</div>
          <div class="card-sub">目標人數</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card" :class="rateCardClass(data.school_wide.achievement_rate)">
          <div class="card-top">
            <span class="card-icon" v-html="ICON_TREND" />
            <span class="card-label">整體達成率</span>
          </div>
          <div class="card-value">{{ formatPct(data.school_wide.achievement_rate) }}</div>
          <div class="card-sub">{{ rateSubText(data.school_wide.achievement_rate) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card summary-card--purple">
          <div class="card-top">
            <span class="card-icon" v-html="ICON_GIFT" />
            <span class="card-label">預估獎金總額</span>
          </div>
          <div class="card-value">{{ formatMoney(data.school_wide.estimated_total_bonus) }}</div>
          <div class="card-sub">本期估算</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===== 達成 / 未達成 概況 ===== -->
    <div v-if="data" class="achievement-stats">
      <div class="stat-pill stat-pill--above">
        <span class="pill-dot" />
        達成 <strong>{{ aboveCount }}</strong> 班
      </div>
      <div class="stat-pill stat-pill--meet">
        <span class="pill-dot" />
        持平 <strong>{{ meetCount }}</strong> 班
      </div>
      <div class="stat-pill stat-pill--below">
        <span class="pill-dot" />
        未達 <strong>{{ belowCount }}</strong> 班
      </div>
    </div>

    <!-- ===== 各班明細表 ===== -->
    <el-card v-if="data" class="table-card" shadow="never">
      <template #header>
        <div class="card-header-row">
          <span class="card-header-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M3 13l4-4 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14 5h5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            各班獎金達成明細
          </span>
          <span class="card-header-meta">依達成率由低到高排序</span>
        </div>
      </template>
      <el-table
        :data="tableRows"
        border
        style="width: 100%"
        :row-class-name="tableRowClassName"
        :default-sort="{ prop: 'achievement_rate', order: 'ascending' }"
        class="bonus-table"
      >
        <el-table-column label="狀態" width="64" align="center">
          <template #default="{ row }">
            <span class="status-badge" :class="`status-badge--${row.status || 'meet'}`">
              <span v-html="statusIcon(row.status)" />
            </span>
          </template>
        </el-table-column>
        <el-table-column label="班級" prop="classroom_name" width="130" />
        <el-table-column label="年級" prop="grade_name" width="100" align="center" />
        <el-table-column label="在籍人數" prop="current_enrollment" width="100" align="center">
          <template #default="{ row }">
            <span class="num-cell">{{ row.current_enrollment }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目標人數" prop="target_enrollment" width="100" align="center">
          <template #default="{ row }">
            <span class="num-cell num-target">{{ row.target_enrollment }}</span>
          </template>
        </el-table-column>
        <el-table-column label="達成率" width="200" align="center" sortable prop="achievement_rate">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.min(Math.round(row.achievement_rate * 100), 100)"
              :color="progressColor(row.achievement_rate)"
              :stroke-width="14"
              :text-inside="true"
              :format="() => formatPct(row.achievement_rate)"
            />
          </template>
        </el-table-column>
        <el-table-column label="教師獎金明細" min-width="260">
          <template #default="{ row }">
            <div v-for="t in row.teachers" :key="t.employee_id" class="teacher-bonus-item">
              <span class="teacher-name">{{ t.name }}</span>
              <el-tag size="small" :type="roleTagType(t.role)" effect="plain" round>{{ t.role }}</el-tag>
              <span class="bonus-amount">{{ formatMoney(t.estimated_bonus) }}</span>
              <span class="bonus-base">基數 {{ formatMoney(t.base_amount) }}</span>
            </div>
            <div v-if="!row.teachers.length" class="no-teacher">尚無帶班教師</div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div v-if="!loading && !data" class="empty-hint">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none">
          <path d="M12 8v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
        </svg>
      </div>
      <div class="empty-title">暫無獎金資料</div>
      <div class="empty-desc">請選擇有效的月份以查看達成情況</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getBonusDashboard } from '@/api/studentEnrollment'
import { apiError } from '@/utils/error'

const loading = ref(false)
const data = ref(null)

const today = new Date()
const selectedMonth = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)

const fetchData = async () => {
  loading.value = true
  try {
    const [y, m] = selectedMonth.value.split('-').map(Number)
    const res = await getBonusDashboard({ year: y, month: m })
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入獎金達成資料失敗'))
  } finally {
    loading.value = false
  }
}

watch(selectedMonth, fetchData)

onMounted(fetchData)

const tableRows = computed(() => {
  if (!data.value) return []
  return [...data.value.classrooms].sort((a, b) => a.achievement_rate - b.achievement_rate)
})

const aboveCount = computed(() =>
  data.value?.classrooms.filter(c => c.status === 'above').length ?? 0
)
const meetCount = computed(() =>
  data.value?.classrooms.filter(c => !c.status || c.status === 'meet').length ?? 0
)
const belowCount = computed(() =>
  data.value?.classrooms.filter(c => c.status === 'below').length ?? 0
)

const formatPct = (rate) => `${Math.round(rate * 100)}%`
const formatMoney = (val) => `$${(val ?? 0).toLocaleString()}`

const rateCardClass = (rate) => {
  if (rate >= 1) return 'summary-card--green'
  if (rate >= 0.8) return 'summary-card--orange'
  return 'summary-card--red'
}

const rateSubText = (rate) => {
  if (rate >= 1) return '已達整體目標'
  if (rate >= 0.8) return '接近目標'
  return '尚未達標'
}

const progressColor = (rate) => {
  if (rate >= 1) return '#0d9053'
  if (rate >= 0.8) return '#f3c630'
  return '#f65265'
}

const tableRowClassName = ({ row }) => {
  if (row.status === 'above') return 'row-above'
  if (row.status === 'below') return 'row-below'
  return ''
}

const roleTagType = (role) => {
  if (role === '班導') return 'primary'
  if (role === '副班導') return 'success'
  return 'info'
}

// ---- Icons ----
const CROWN_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="17" cy="8" r="1" fill="currentColor"/><circle cx="12" cy="5" r="1" fill="currentColor"/></svg>'
const MOON_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M21 13a9 9 0 11-10-10 7 7 0 0010 10z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
const ICON_PEOPLE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICON_TARGET = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>'
const ICON_TREND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M3 17l6-6 4 4 8-8M14 7h6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICON_GIFT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H8a2.5 2.5 0 010-5c2 0 4 5 4 5zm0 0h4a2.5 2.5 0 100-5c-2 0-4 5-4 5z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const MINUS_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
const ALERT_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 8v5M12 17h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>'

const statusIcon = (status) => {
  if (status === 'above') return CHECK_ICON
  if (status === 'below') return ALERT_ICON
  return MINUS_ICON
}
</script>

<style scoped>
.bonus-dashboard {
  color: #392a1c;
}

/* ===== Festival Banner ===== */
.festival-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 14px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.festival-banner--active {
  background: linear-gradient(135deg, #fff8d6 0%, #fffce8 60%, #f5fbe6 100%);
  border: 1px solid rgba(243, 198, 48, 0.4);
  box-shadow: 0 4px 14px rgba(243, 198, 48, 0.15);
}

.festival-banner--quiet {
  background: linear-gradient(135deg, #f0f6fb 0%, #e8f5f5 100%);
  border: 1px solid rgba(51, 170, 170, 0.22);
}

.banner-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 240px;
}

.banner-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  flex-shrink: 0;
}

.festival-banner--active .banner-icon {
  color: var(--color-warning-hover);
  box-shadow: 0 4px 12px rgba(243, 198, 48, 0.3);
}

.festival-banner--quiet .banner-icon {
  color: #1d6a6a;
  box-shadow: 0 2px 8px rgba(51, 170, 170, 0.2);
}

.banner-title {
  font-size: 15px;
  font-weight: 700;
  color: #392a1c;
}

.banner-sub {
  font-size: 12.5px;
  color: var(--neutral-600);
  margin-top: 2px;
}

.banner-picker {
  width: 160px;
}

/* ===== Summary cards ===== */
.summary-cards {
  margin-bottom: 12px;
}

.summary-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: var(--neutral-0);
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.summary-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 4px;
  height: 100%;
  background: var(--accent, #0d9053);
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(57, 42, 28, 0.08);
}

.summary-card--primary { --accent: linear-gradient(180deg, #0d9053, #0caf76); }
.summary-card--blue { --accent: linear-gradient(180deg, #0079b7, #33aaaa); }
.summary-card--green { --accent: linear-gradient(180deg, #5aa842, #0caf76); }
.summary-card--orange { --accent: linear-gradient(180deg, #f3c630, #e6a23c); }
.summary-card--red { --accent: linear-gradient(180deg, #f65265, #f3958c); }
.summary-card--purple { --accent: linear-gradient(180deg, #9f89bd, #a855f7); }

.summary-card :deep(.el-card__body) {
  padding: 16px 16px 14px 20px;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.card-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 144, 83, 0.08);
  color: #0d9053;
}

.summary-card--blue .card-icon { background: rgba(0, 121, 183, 0.08); color: #0079b7; }
.summary-card--green .card-icon { background: rgba(13, 144, 83, 0.1); color: #0d9053; }
.summary-card--orange .card-icon { background: rgba(243, 198, 48, 0.12); color: var(--color-warning-hover); }
.summary-card--red .card-icon { background: rgba(246, 82, 101, 0.1); color: #f65265; }
.summary-card--purple .card-icon { background: rgba(159, 137, 189, 0.12); color: #9f89bd; }

.card-label {
  font-size: 13px;
  color: var(--neutral-600);
  font-weight: 500;
}

.card-value {
  font-size: 1.85rem;
  font-weight: 700;
  line-height: 1.15;
  color: #392a1c;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

.summary-card--blue .card-value { color: #0079b7; }
.summary-card--green .card-value { color: #0d9053; }
.summary-card--orange .card-value { color: var(--color-warning-hover); }
.summary-card--red .card-value { color: #f65265; }
.summary-card--purple .card-value { color: #9f89bd; }

.card-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ===== Achievement stats pills ===== */
.achievement-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--neutral-600);
  background: var(--neutral-0);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.stat-pill strong {
  color: #392a1c;
  font-weight: 700;
}

.pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.stat-pill--above .pill-dot { background: #0d9053; box-shadow: 0 0 0 3px rgba(13,144,83,0.15); }
.stat-pill--above strong { color: #0d9053; }

.stat-pill--meet .pill-dot { background: var(--text-tertiary); box-shadow: 0 0 0 3px rgba(148,163,184,0.18); }

.stat-pill--below .pill-dot { background: #f65265; box-shadow: 0 0 0 3px rgba(246,82,101,0.15); }
.stat-pill--below strong { color: #f65265; }

/* ===== Table ===== */
.table-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.table-card :deep(.el-card__header) {
  background: linear-gradient(180deg, #f8fcf6 0%, #ffffff 100%);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  padding: 12px 16px;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #392a1c;
}

.card-header-title svg { color: #0d9053; }

.card-header-meta {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.bonus-table :deep(.el-table__header th) {
  background: var(--bg-color);
  color: var(--neutral-600);
  font-weight: 600;
  font-size: 13px;
}

.bonus-table :deep(td.el-table__cell) {
  padding: 10px 0;
}

.status-badge {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.status-badge--above {
  background: rgba(13, 144, 83, 0.12);
  color: #0d9053;
}

.status-badge--meet {
  background: rgba(148, 163, 184, 0.18);
  color: var(--neutral-600);
}

.status-badge--below {
  background: rgba(246, 82, 101, 0.12);
  color: #f65265;
}

.num-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #392a1c;
}

.num-target { color: var(--neutral-600); font-weight: 500; }

.teacher-bonus-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
  flex-wrap: wrap;
}

.teacher-name {
  font-weight: 600;
  min-width: 56px;
  color: #392a1c;
}

.bonus-amount {
  font-weight: 700;
  color: #0d9053;
  font-variant-numeric: tabular-nums;
}

.bonus-base {
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.no-teacher {
  color: var(--neutral-300);
  font-size: 13px;
  font-style: italic;
}

/* ===== Empty state ===== */
.empty-hint {
  text-align: center;
  padding: 48px 0 40px;
  color: var(--text-tertiary);
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #f5fbe6;
  color: #5aa842;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--neutral-600);
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

:deep(.row-above) td {
  background-color: rgba(245, 251, 230, 0.6) !important;
}

:deep(.row-below td) {
  color: #f65265;
}

:deep(.row-below) .num-cell {
  color: #f65265;
}
</style>
