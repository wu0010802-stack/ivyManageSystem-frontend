<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSalaryPreview } from '@/api/portal'

const loading = ref(false)
const salaryData = ref(null)

const isMobile = ref(window.innerWidth < 768)
const checkMobile = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', checkMobile))
onUnmounted(() => window.removeEventListener('resize', checkMobile))

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const fetchSalary = async () => {
  loading.value = true
  try {
    const res = await getSalaryPreview({ year: query.year, month: query.month })
    salaryData.value = res.data
  } catch (error) {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

const prevMonth = () => {
  if (query.month === 1) { query.year--; query.month = 12 }
  else { query.month-- }
  fetchSalary()
}

const nextMonth = () => {
  if (query.month === 12) { query.year++; query.month = 1 }
  else { query.month++ }
  fetchSalary()
}

onMounted(fetchSalary)
</script>

<template>
  <div class="portal-salary">
    <div class="page-header">
      <h2>薪資查詢</h2>
      <div class="month-nav">
        <el-button :icon="'ArrowLeft'" circle size="small" @click="prevMonth" />
        <span class="month-label">{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
        <el-button :icon="'ArrowRight'" circle size="small" @click="nextMonth" />
      </div>
    </div>

    <div v-loading="loading">
      <!-- Attendance Stats -->
      <el-card v-if="salaryData" class="stats-card">
        <h3>出勤統計</h3>
        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value blue">{{ salaryData.attendance_stats.work_days }}</div>
            <div class="stat-label">出勤天數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value orange">{{ salaryData.attendance_stats.late_count }}</div>
            <div class="stat-label">遲到次數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value orange">{{ salaryData.attendance_stats.early_leave_count }}</div>
            <div class="stat-label">早退次數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value red">{{ salaryData.attendance_stats.missing_punch_count }}</div>
            <div class="stat-label">缺卡次數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value gray">{{ salaryData.attendance_stats.leave_days }}</div>
            <div class="stat-label">請假天數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value gray">{{ salaryData.attendance_stats.leave_hours }}h</div>
            <div class="stat-label">請假時數</div>
          </div>
        </div>
      </el-card>

      <!-- Salary Breakdown -->
      <el-card v-if="salaryData?.salary" class="salary-card">
        <h3>薪資明細</h3>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="底薪">
            NT$ {{ salaryData.salary.base_salary?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="津貼合計">
            NT$ {{ salaryData.salary.total_allowances?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="獎金合計（不含主管紅利）">
            NT$ {{ salaryData.salary.total_bonus?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="主管紅利">
            NT$ {{ salaryData.salary.supervisor_dividend?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="加班費">
            NT$ {{ salaryData.salary.overtime_pay?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="園務會議加班">
            NT$ {{ salaryData.salary.meeting_overtime_pay?.toLocaleString() || 0 }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px;">扣款明細</h4>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="勞保費">
            -NT$ {{ salaryData.salary.labor_insurance?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="健保費">
            -NT$ {{ salaryData.salary.health_insurance?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="遲到扣款">
            -NT$ {{ salaryData.salary.late_deduction?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="早退扣款">
            -NT$ {{ salaryData.salary.early_leave_deduction?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="請假扣款">
            -NT$ {{ salaryData.salary.leave_deduction?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="其他扣款">
            -NT$ {{ salaryData.salary.other_deduction?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="扣款合計">
            <span class="text-danger">-NT$ {{ salaryData.salary.total_deduction?.toLocaleString() || 0 }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px;">節慶 / 獨立獎金調整</h4>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="節慶獎金">
            NT$ {{ salaryData.salary.festival_bonus?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="超額獎金">
            NT$ {{ salaryData.salary.overtime_bonus?.toLocaleString() || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="會議缺席扣減">
            <span class="text-warning">-NT$ {{ salaryData.salary.meeting_absence_deduction?.toLocaleString() || 0 }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="獨立獎金淨額">
            NT$ {{ ((salaryData.salary.festival_bonus || 0) + (salaryData.salary.overtime_bonus || 0) - (salaryData.salary.meeting_absence_deduction || 0)).toLocaleString() }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="net-salary-box">
          <span class="net-label">實發金額</span>
          <span class="net-value">NT$ {{ salaryData.salary.net_salary?.toLocaleString() || 0 }}</span>
        </div>

        <el-tag v-if="salaryData.salary.is_finalized" type="success" style="margin-top: 12px;">
          已結算
        </el-tag>
        <el-tag v-else type="warning" style="margin-top: 12px;">
          尚未結算（金額僅供參考）
        </el-tag>
      </el-card>

      <el-card v-else-if="salaryData && !salaryData.salary">
        <el-empty description="本月薪資尚未計算" />
      </el-card>
    </div>
  </div>
</template>

<style scoped>

.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.month-label {
  font-size: var(--text-xl);
  font-weight: 600;
  min-width: 140px;
  text-align: center;
  color: var(--text-primary);
}

.stats-card, .salary-card {
  margin-bottom: var(--space-6);
  border-radius: var(--radius-lg) !important;
}

.stats-card h3, .salary-card h3 {
  margin: 0 0 var(--space-5) 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-5);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-5) var(--space-4);
  background: var(--bg-color);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-value.blue { color: var(--color-primary); }
.stat-value.orange { color: var(--color-warning); }
.stat-value.red { color: var(--color-danger); }
.stat-value.gray { color: var(--text-secondary); }

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-top: 8px;
  font-weight: 500;
}

.text-danger {
  color: var(--color-danger);
  font-weight: 600;
}

.text-warning {
  color: var(--color-warning);
  font-weight: 600;
}

.net-salary-box {
  margin-top: var(--space-6);
  padding: var(--space-6);
  background: linear-gradient(135deg, var(--color-primary) 0%, #4338ca 100%);
  border-radius: var(--radius-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);
}

.net-label {
  color: rgba(255,255,255,0.9);
  font-size: var(--text-lg);
  font-weight: 500;
}

.net-value {
  color: var(--surface-color);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

@media (max-width: 767px) {
  .month-label {
    font-size: var(--text-lg);
    min-width: 120px;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .stat-item {
    padding: var(--space-4) var(--space-3);
  }

  .stat-value {
    font-size: var(--text-3xl);
  }

  .net-salary-box {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: var(--space-4);
  }

  .net-value {
    font-size: 28px;
  }
}
</style>
