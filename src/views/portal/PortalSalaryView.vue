<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, InfoFilled } from '@element-plus/icons-vue'
import { getSalaryPreview } from '@/api/portal'
import { useIsMobile } from '@/composables/useIsMobile'

const loading = ref(false)
const salaryData = ref<Record<string, unknown> | null>(null)

// 後端 salary_status: finalized / draft / recalc_pending / none
// 草稿/重算中不回傳 salary 欄位細節,前端依狀態顯示對應提示。
// 對齊 LINE「我的薪資」的「只看已封存且非 stale」語意。
const STATUS_MESSAGES = {
  none: { title: '本月薪資尚未計算', desc: '請待主管完成當期薪資計算後再查詢' },
  draft: { title: '薪資草稿尚未結算', desc: '本月薪資已計算但尚未結算,完成結算後即可查看明細' },
  recalc_pending: { title: '薪資需重算', desc: '相關資料(請假/加班/設定)異動,等待主管完成重算與結算' },
}
const statusMessage = computed(() => (STATUS_MESSAGES as Record<string, { title: string; desc: string }>)[(salaryData.value?.salary_status as string) || ''] || STATUS_MESSAGES.none)

const { isMobile } = useIsMobile()

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const fetchSalary = async () => {
  loading.value = true
  try {
    const res = await getSalaryPreview({ year: query.year, month: query.month })
    // 後端缺 response_model，res.data 為 unknown，narrow 成薪資物件。
    salaryData.value = res.data as Record<string, unknown> | null
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

const attendanceStats = computed(() => salaryData.value?.attendance_stats as Record<string, unknown> | undefined)
const salary = computed(() => salaryData.value?.salary as Record<string, unknown> | undefined)

// 三區明細（income / separate_transfer / deductions）由後端 build_history_breakdown
// 產出，與管理端薪資歷史同源；小計一律取 persisted 值，因此
// 「收入各項相加 == 應發」「扣款各項相加 == 扣款合計」「應發 − 扣款 == 實發」恆成立。
interface BreakdownLine {
  key: string
  label: string
  amount: number
  note?: string | null
  informational?: boolean
  children?: BreakdownLine[] | null
}
interface SalaryBreakdown {
  income: BreakdownLine[]
  income_subtotal: number
  separate_transfer: BreakdownLine[]
  separate_subtotal: number
  deductions: BreakdownLine[]
  deduction_subtotal: number
  net_salary: number
}
const EMPTY_BREAKDOWN: SalaryBreakdown = {
  income: [],
  income_subtotal: 0,
  separate_transfer: [],
  separate_subtotal: 0,
  deductions: [],
  deduction_subtotal: 0,
  net_salary: 0,
}
const salaryBreakdown = computed<SalaryBreakdown>(
  () => (salary.value as unknown as SalaryBreakdown) ?? EMPTY_BREAKDOWN,
)
// 金額為 0 的列不顯示，避免整頁被一堆 NT$ 0 淹沒；但小計一律取後端權威值，
// 所以隱藏零列不會讓加總對不起來。
const _nonZero = (lines: BreakdownLine[]) => lines.filter((l) => l.amount !== 0)
const incomeLines = computed(() => _nonZero(salaryBreakdown.value.income))
const deductionLines = computed(() => _nonZero(salaryBreakdown.value.deductions))
const separateLines = computed(() => _nonZero(salaryBreakdown.value.separate_transfer))

onMounted(fetchSalary)
</script>

<template>
  <div class="portal-salary">
    <div class="page-header">
      <h2>薪資查詢</h2>
      <div class="month-nav">
        <el-button :icon="ArrowLeft" circle size="small" @click="prevMonth" />
        <span class="month-label">{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
        <el-button :icon="ArrowRight" circle size="small" @click="nextMonth" />
      </div>
    </div>

    <div v-loading="loading">
      <!-- Attendance Stats -->
      <el-card v-if="salaryData" class="stats-card">
        <h3>出勤統計</h3>
        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value blue">{{ attendanceStats?.work_days }}</div>
            <div class="stat-label">出勤天數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value orange">{{ attendanceStats?.late_count }}</div>
            <div class="stat-label">遲到次數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value orange">{{ attendanceStats?.early_leave_count }}</div>
            <div class="stat-label">早退次數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value red">{{ attendanceStats?.missing_punch_count }}</div>
            <div class="stat-label">缺卡次數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value gray">{{ attendanceStats?.leave_days }}</div>
            <div class="stat-label">請假天數</div>
          </div>
          <div class="stat-item">
            <div class="stat-value gray">{{ attendanceStats?.leave_hours }}h</div>
            <div class="stat-label">請假時數</div>
          </div>
        </div>
      </el-card>

      <!-- Salary Breakdown -->
      <el-card v-if="salary" class="salary-card">
        <!-- 三區明細由後端 build_history_breakdown 產出，與管理端薪資歷史同源。
             改版前是手工挑欄位，導致：節慶／超額獎金同時出現在「獎金合計」與
             「獨立獎金」（同一筆錢畫面上出現三次）、時薪制老師底薪顯示 0、
             補充保費重複列、曠職扣款漏列、應發合計完全沒顯示。 -->
        <h3>收入明細</h3>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item
            v-for="line in incomeLines"
            :key="line.key"
            :label="line.label"
          >
            NT$ {{ line.amount.toLocaleString() }}
            <span v-if="line.note" class="line-note">（{{ line.note }}）</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="subtotal-row">
          <span>應發合計</span>
          <strong>NT$ {{ salaryBreakdown.income_subtotal.toLocaleString() }}</strong>
        </div>

        <h4 style="margin-top: 20px;">扣款明細</h4>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item
            v-for="line in deductionLines"
            :key="line.key"
            :label="line.label"
          >
            <span class="text-warning">-NT$ {{ line.amount.toLocaleString() }}</span>
            <!-- 補充保費已併入健保費，僅作資訊列不重複計入合計 -->
            <div v-for="child in (line.children || [])" :key="child.key" class="line-child">
              {{ child.label }} NT$ {{ child.amount.toLocaleString() }}
              <span class="line-note">（已含於上列，不重複計）</span>
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <div class="subtotal-row">
          <span>扣款合計</span>
          <strong class="text-warning">-NT$ {{ salaryBreakdown.deduction_subtotal.toLocaleString() }}</strong>
        </div>

        <div class="net-salary-box">
          <span class="net-label">實發金額</span>
          <span class="net-value">NT$ {{ salaryBreakdown.net_salary.toLocaleString() }}</span>
        </div>
        <p class="net-formula">應發合計 − 扣款合計 = 實發金額</p>

        <!-- 另行轉帳：這幾項不在實發金額內，會另外匯款 -->
        <template v-if="separateLines.length">
          <h4 style="margin-top: 20px;">
            另行轉帳
            <el-tooltip
              content="以下項目不計入上方「實發金額」，由園所另行匯款"
              placement="top"
              effect="light"
            >
              <el-icon class="hint-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </h4>
          <el-descriptions :column="isMobile ? 1 : 2" border>
            <el-descriptions-item
              v-for="line in separateLines"
              :key="line.key"
              :label="line.label"
            >
              NT$ {{ line.amount.toLocaleString() }}
            </el-descriptions-item>
          </el-descriptions>
          <div class="subtotal-row">
            <span>另行轉帳合計</span>
            <strong>NT$ {{ salaryBreakdown.separate_subtotal.toLocaleString() }}</strong>
          </div>
        </template>

        <el-tag type="success" style="margin-top: 12px;">已結算</el-tag>
      </el-card>

      <el-card v-else-if="salaryData && !salaryData.salary">
        <el-empty :description="statusMessage.title">
          <template #description>
            <p style="margin: 0; font-weight: 600;">{{ statusMessage.title }}</p>
            <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: var(--text-sm);">
              {{ statusMessage.desc }}
            </p>
          </template>
        </el-empty>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.subtotal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-top: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 14px;
}

.net-formula {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.line-note {
  font-size: 12px;
  color: var(--text-secondary);
}

.line-child {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.hint-icon {
  vertical-align: middle;
  color: var(--el-color-info);
  cursor: help;
}


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

@media (--to-sm) {
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
