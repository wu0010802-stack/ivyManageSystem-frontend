<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { getSalaryPreview } from '@/api/portal'
import type { ApiResponse } from '@/api/_generated/typed'
import { useIsMobile } from '@/composables/useIsMobile'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

// 2026-08-24 起吃後端 PortalSalaryPreviewOut 生成型別：salary 為
// build_history_breakdown 三區明細（income/deductions/separate_transfer 皆為
// {key,label,amount} 明細列陣列），不再有 base_salary/total_bonus 等 flat 欄位
// ——舊版讀 flat 欄位在真實資料下整頁明細恆為 0。
type SalaryPreview = ApiResponse<'/portal/salary-preview', 'get'>
type SalaryDetail = NonNullable<SalaryPreview['salary']>
type BreakdownLine = SalaryDetail['income'][number]

const loading = ref(false)
const salaryData = ref<SalaryPreview | null>(null)

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
    salaryData.value = res.data
  } catch (error) {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

function stepMonth(delta: -1 | 1) {
  if (delta === -1) {
    if (query.month === 1) { query.year -= 1; query.month = 12 } else { query.month -= 1 }
  } else if (query.month === 12) { query.year += 1; query.month = 1 } else { query.month += 1 }
}

/**
 * 進頁預設落在「最近一個已計算的月份」（P2-07）。
 *
 * 原本一律開當月，而當月薪資在月底結算前永遠是 none，於是老師每次進來
 * 都先看到「本月薪資尚未計算」的空狀態，得自己按上一月才看得到東西。
 * 往前找最多兩個月；都沒有就回到當月（維持原本的空狀態說明）。
 */
const autoFellBack = ref(false)
const initialLoad = async () => {
  await fetchSalary()
  if ((salaryData.value?.salary_status as string) !== 'none') return
  const origin = { year: query.year, month: query.month }
  for (let i = 0; i < 2; i += 1) {
    stepMonth(-1)
    await fetchSalary()
    if ((salaryData.value?.salary_status as string) !== 'none') {
      autoFellBack.value = true
      return
    }
  }
  query.year = origin.year
  query.month = origin.month
  await fetchSalary()
}

const prevMonth = () => {
  autoFellBack.value = false
  stepMonth(-1)
  fetchSalary()
}

const nextMonth = () => {
  autoFellBack.value = false
  stepMonth(1)
  fetchSalary()
}

const attendanceStats = computed(() => salaryData.value?.attendance_stats)
const salary = computed<SalaryDetail | null>(() => salaryData.value?.salary ?? null)

// 0 元列不顯示（build_history_breakdown 會回所有已知欄位含 0），
// 有 informational 子列（如健保下的二代補充保費拆列）者即使 0 元也保留。
const nonZero = (lines: BreakdownLine[] | undefined) =>
  (lines ?? []).filter((l) => l.amount !== 0 || (l.children?.length ?? 0) > 0)
const incomeLines = computed(() => nonZero(salary.value?.income))
const deductionLines = computed(() => nonZero(salary.value?.deductions))
// 獨立轉帳（節慶/超額/考核年終）：不併入 gross/net、另行撥款。
// festival_bonus 已在後端發放月扣除會議缺席扣款，這裡只渲染不可再減。
const separateLines = computed(() => nonZero(salary.value?.separate_transfer))

const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString()

onMounted(initialLoad)
</script>

<template>
  <div class="portal-salary">
    <PortalPageHeader title="薪資查詢">
      <template #actions>
        <div class="month-nav">
          <el-button class="month-nav-btn" :icon="ArrowLeft" circle aria-label="上個月" @click="prevMonth" />
          <span class="month-label">{{ query.year }} 年 {{ String(query.month).padStart(2, '0') }} 月</span>
          <el-tag v-if="autoFellBack" type="info" effect="plain" class="fallback-tag">
            當月尚未計算，顯示最近一期
          </el-tag>
          <el-button class="month-nav-btn" :icon="ArrowRight" circle aria-label="下個月" @click="nextMonth" />
        </div>
      </template>
    </PortalPageHeader>

    <div v-loading="loading">
      <!-- Salary Breakdown：三區明細直接吃後端 build_history_breakdown 契約，
           保證 收入各項相加=應發、扣款各項相加=扣款合計、應發−扣款=實發 -->
      <el-card v-if="salary" class="salary-card">
        <h3>薪資明細</h3>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item
            v-for="line in incomeLines"
            :key="line.key"
            :label="line.label"
          >
            NT$ {{ fmt(line.amount) }}
            <span v-if="line.note" class="line-note">（{{ line.note }}）</span>
          </el-descriptions-item>
          <el-descriptions-item label="應發合計">
            <strong>NT$ {{ fmt(salary.income_subtotal) }}</strong>
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top: 20px;">扣款明細</h4>
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item
            v-for="line in deductionLines"
            :key="line.key"
            :label="line.label"
          >
            -NT$ {{ fmt(line.amount) }}
            <!-- informational 子列（如健保下的二代補充保費）：金額已含在父列，僅拆示 -->
            <div v-for="child in line.children ?? []" :key="child.key" class="line-child">
              {{ child.label }} NT$ {{ fmt(child.amount) }}
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="扣款合計">
            <span class="text-danger">-NT$ {{ fmt(salary.deduction_subtotal) }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 未休折現加給：後端回傳 unused_leave_payout > 0 時才顯示 -->
        <template v-if="salary.unused_leave_payout > 0">
          <h4 style="margin-top: 20px;">未休假折現</h4>
          <el-descriptions :column="isMobile ? 1 : 2" border>
            <el-descriptions-item label="未休折現加給">
              <el-tooltip
                content="補休到期、特休週年或離職結算折算的未休假加給，已計入實發金額"
                placement="top"
                effect="light"
              >
                <span style="cursor: help;">
                  NT$ {{ fmt(salary.unused_leave_payout) }}
                  <el-icon style="vertical-align: middle; color: var(--el-color-info); width: 12px; height: 12px;">
                    <InfoFilled />
                  </el-icon>
                </span>
              </el-tooltip>
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <template v-if="separateLines.length > 0">
          <h4 style="margin-top: 20px;">獨立轉帳獎金（不併入實發）</h4>
          <el-descriptions :column="isMobile ? 1 : 2" border>
            <el-descriptions-item
              v-for="line in separateLines"
              :key="line.key"
              :label="line.label"
            >
              NT$ {{ fmt(line.amount) }}
            </el-descriptions-item>
            <el-descriptions-item label="獨立轉帳合計">
              <strong>NT$ {{ fmt(salary.separate_subtotal) }}</strong>
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <div class="net-salary-box">
          <span class="net-label">實發金額</span>
          <span class="net-value">NT$ {{ fmt(salary.base_transfer_amount) }}</span>
        </div>

        <el-tag type="success" style="margin-top: 12px;">已結算</el-tag>
      </el-card>


      <el-card v-else-if="salaryData && !salaryData.salary">
        <EmptyState variant="mobile" :title="statusMessage.title" :description="statusMessage.desc" />
      </el-card>

      <!-- 出勤統計：薪資明細才是本頁主體，統計移到明細之後（P2-07） -->
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
    </div>
  </div>
</template>

<style scoped>

.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

/* 月份切換鈕：達 44px 觸控目標（手機主要互動元素） */
.month-nav-btn {
  min-width: var(--touch-target-min, 44px);
  min-height: var(--touch-target-min, 44px);
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

.line-note {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.line-child {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

/* 實發金額強調列：保留品牌漸層強調（薪資 headline 數字的情緒收尾），
 * 但移除 floating box-shadow —— 該陰影讓它像卡中卡（嵌在 salary-card 內的
 * 浮動卡片），改為卡片內的強調頁尾列。 */
.net-salary-box {
  margin-top: var(--space-6);
  padding: var(--space-5) var(--space-6);
  background: linear-gradient(135deg, var(--color-primary) 0%, #4338ca 100%);
  border-radius: var(--radius-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.net-label {
  color: rgba(255,255,255,0.9);
  font-size: var(--text-lg);
  font-weight: 500;
}

.net-value {
  /* 白字固定於 indigo 漸層盒（原 --surface-color 在 dark 翻深 → 深字疊深底崩對比） */
  color: #fff;
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
.fallback-tag {
  margin-left: var(--space-2, 8px);
}
</style>
