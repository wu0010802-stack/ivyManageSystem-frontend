<template>
  <div class="bonus-dashboard" v-loading="loading">
    <!-- 月份選擇器 -->
    <div class="month-selector">
      <el-date-picker
        v-model="selectedMonth"
        type="month"
        placeholder="選擇月份"
        value-format="YYYY-MM"
        :clearable="false"
        style="width: 160px"
      />
      <el-tag v-if="data?.is_festival_month" type="success" effect="plain">發放月</el-tag>
      <el-tag v-else type="info" effect="plain">非發放月</el-tag>
    </div>

    <!-- 摘要卡片 -->
    <el-row :gutter="16" class="summary-cards" v-if="data">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" :class="['summary-card']">
          <div class="summary-value">{{ data.school_wide.total_enrollment }}</div>
          <div class="summary-label">在籍總人數</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="summary-card summary-card--blue">
          <div class="summary-value">{{ data.school_wide.total_target }}</div>
          <div class="summary-label">全校目標</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" :class="['summary-card', rateClass(data.school_wide.achievement_rate)]">
          <div class="summary-value">{{ formatPct(data.school_wide.achievement_rate) }}</div>
          <div class="summary-label">整體達成率</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover" class="summary-card summary-card--purple">
          <div class="summary-value">{{ formatMoney(data.school_wide.estimated_total_bonus) }}</div>
          <div class="summary-label">預估獎金總額</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 各班明細表 -->
    <el-card v-if="data" style="margin-top: 16px">
      <template #header>
        <span>各班獎金達成明細</span>
      </template>
      <el-table
        :data="tableRows"
        border
        stripe
        style="width: 100%"
        :row-class-name="tableRowClassName"
        default-sort="{ prop: 'achievement_rate', order: 'ascending' }"
      >
        <el-table-column label="班級" prop="classroom_name" width="120" />
        <el-table-column label="年級" prop="grade_name" width="100" align="center" />
        <el-table-column label="在籍人數" prop="current_enrollment" width="100" align="center" />
        <el-table-column label="目標人數" prop="target_enrollment" width="100" align="center" />
        <el-table-column label="達成率" width="180" align="center" sortable prop="achievement_rate">
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
        <el-table-column label="教師獎金明細" min-width="240">
          <template #default="{ row }">
            <div v-for="t in row.teachers" :key="t.employee_id" class="teacher-bonus-item">
              <span class="teacher-name">{{ t.name }}</span>
              <el-tag size="small" :type="roleTagType(t.role)" effect="plain">{{ t.role }}</el-tag>
              <span class="bonus-amount">{{ formatMoney(t.estimated_bonus) }}</span>
              <span class="bonus-base">（基數 {{ formatMoney(t.base_amount) }}）</span>
            </div>
            <div v-if="!row.teachers.length" class="no-teacher">尚無帶班教師</div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div v-if="!loading && !data" class="empty-hint">暫無資料</div>
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

const formatPct = (rate) => `${Math.round(rate * 100)}%`
const formatMoney = (val) => `$${(val ?? 0).toLocaleString()}`

const rateClass = (rate) => {
  if (rate >= 1) return 'summary-card--green'
  if (rate >= 0.8) return 'summary-card--orange'
  return 'summary-card--red'
}

const progressColor = (rate) => {
  if (rate >= 1) return '#67c23a'
  if (rate >= 0.8) return '#e6a23c'
  return '#f56c6c'
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
</script>

<style scoped>
.month-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.summary-cards {
  margin-bottom: 8px;
}

.summary-card {
  text-align: center;
  border-radius: 8px;
}

.summary-card .summary-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.summary-card .summary-label {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
}

.summary-card--blue { border-top: 3px solid #409eff; }
.summary-card--green { border-top: 3px solid #67c23a; }
.summary-card--orange { border-top: 3px solid #e6a23c; }
.summary-card--red { border-top: 3px solid #f56c6c; }
.summary-card--purple { border-top: 3px solid #a855f7; }

.teacher-bonus-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 13px;
}

.teacher-name {
  font-weight: 500;
  min-width: 56px;
}

.bonus-amount {
  font-weight: 600;
  color: #303133;
}

.bonus-base {
  color: #909399;
  font-size: 12px;
}

.no-teacher {
  color: #c0c4cc;
  font-size: 13px;
}

.empty-hint {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
}

:deep(.row-above) {
  background-color: #f0f9eb !important;
}

:deep(.row-below td) {
  color: #f56c6c;
}
</style>
