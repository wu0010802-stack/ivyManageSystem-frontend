<template>
  <div v-loading="loading" class="report-statement">
    <LoadErrorState
      v-if="loadError"
      compact
      title="統計表載入失敗"
      description="載入成功前請勿視為尚無歸屬資料，也不要以此作為發放依據，請重新載入。"
      :retrying="loading"
      @retry="reload"
    />
    <template v-else>
    <div v-if="report && report.settled_mismatches.length" class="mismatch-banner">
      ⚠ 結算後歸屬資料與實際入帳不一致（{{ report.settled_mismatches.length }} 位員工），請勿以本表為發放依據，改查「已發放明細」確認實際入帳。
    </div>
    <div v-if="report && report.unassigned_rows.length" class="unassigned-banner">
      {{ report.unassigned_rows.length }} 筆招生人待指定：{{ report.unassigned_rows.map((r) => r.child_name || `#${r.attribution_id}`).join('、') }}（請至「歸屬核對」處理）
    </div>

    <div v-for="block in report?.blocks || []" :key="block.employee_id ?? block.employee_name" class="teacher-block">
      <div class="teacher-block__head">
        <span class="teacher-name">
          {{ block.employee_name }}
          <el-tag v-if="block.resigned" type="danger" size="small">已離職</el-tag>
        </span>
        <span class="teacher-meta">
          {{ block.counted_persons }} 人 × 單價 {{ formatCurrency(block.unit_price) }}
        </span>
      </div>
      <div class="student-strip">
        <table class="student-table">
          <tbody>
            <tr>
              <th>姓名</th>
              <td v-for="row in block.rows" :key="row.attribution_id" :class="rowClass(row)">
                {{ row.child_name || `#${row.attribution_id}` }}
              </td>
              <template v-if="block.deferred_rows.length">
                <th class="deferred-head">下次核算</th>
                <td v-for="row in block.deferred_rows" :key="row.attribution_id" class="deferred-cell">
                  {{ row.child_name || `#${row.attribution_id}` }}
                </td>
              </template>
            </tr>
            <tr>
              <th>來源</th>
              <td v-for="row in block.rows" :key="row.attribution_id" :class="rowClass(row)">
                <el-tooltip :content="row.point_label" placement="top">
                  <span>{{ row.points }}</span>
                </el-tooltip>
              </td>
              <template v-if="block.deferred_rows.length">
                <th />
                <td v-for="row in block.deferred_rows" :key="row.attribution_id" class="deferred-cell">{{ row.points }}</td>
              </template>
            </tr>
            <tr>
              <th>班別</th>
              <td v-for="row in block.rows" :key="row.attribution_id" :class="rowClass(row)">{{ row.grade_multiplier }}</td>
              <template v-if="block.deferred_rows.length">
                <th />
                <td v-for="row in block.deferred_rows" :key="row.attribution_id" class="deferred-cell">{{ row.grade_multiplier }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="teacher-block__total">
        <strong>{{ formatCurrency(block.total_amount) }}</strong>
        <span class="formula-label">計算式</span><code class="formula">{{ block.formula_text }}</code>
      </div>
    </div>

    <div v-if="report" class="grand-total">合計 <strong>{{ formatCurrency(report.total_amount) }}</strong></div>
    <EmptyState
      v-if="report && report.blocks.length === 0"
      title="尚無歸屬資料"
      description="先於「歸屬核對」同步候選並確認歸屬"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadErrorState from '@/components/salary/LoadErrorState.vue'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import { getCampaignReport } from '@/api/recruitmentBonus'
import type { Schema } from '@/api/_generated/typed'

// 統計表（仿園方 Excel）：每師一區塊、橫向逐生「姓名/來源/班別」三列＋
// 計算式字串（後端 report 聚合產生，金額與結算引擎同源）。編輯不在此 tab
// ——pending／待歸類格只標色，操作去「歸屬核對」tab。

type Report = Schema<'RecruitmentBonusReportOut'>
type ReportRow = Schema<'RecruitmentBonusReportRowOut'>

const props = defineProps<{ campaignId: number }>()

const report = ref<Report | null>(null)
const loading = ref(false)
// 失敗時清掉舊報表：統計表是發放依據，不能在重抓失敗後繼續顯示過期數字
const loadError = ref(false)

const rowClass = (row: ReportRow) => ({
  'cell-pending': row.status === 'pending',
  'cell-uncategorized': row.uncategorized,
})

const reload = async () => {
  loading.value = true
  loadError.value = false
  try {
    const res = await getCampaignReport(props.campaignId)
    report.value = res.data
  } catch (e) {
    report.value = null
    loadError.value = true
    ElMessage.error(friendlyError('載入統計表失敗', e))
  } finally {
    loading.value = false
  }
}
onMounted(reload)
defineExpose({ reload })
</script>

<style scoped>
.teacher-block { border: 1px solid var(--el-border-color); border-radius: 6px; padding: var(--space-3); margin-bottom: var(--space-3); }
.teacher-block__head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin-bottom: var(--space-2); }
.teacher-name { font-weight: 700; display: flex; gap: var(--space-2); align-items: center; }
.teacher-meta { color: var(--el-text-color-secondary); font-size: 13px; }
.student-strip { overflow-x: auto; }
.student-table { border-collapse: collapse; white-space: nowrap; }
.student-table th, .student-table td { border: 1px solid var(--el-border-color-lighter); padding: 4px 10px; font-size: 13px; text-align: center; }
.student-table th { background: var(--el-fill-color-light); position: sticky; left: 0; }
.deferred-head { color: var(--el-color-warning); }
.deferred-cell { color: var(--el-text-color-secondary); background: var(--el-fill-color-lighter); }
.cell-pending { background: var(--el-color-warning-light-9); }
.cell-uncategorized { outline: 1px dashed var(--el-color-danger); outline-offset: -1px; }
.teacher-block__total { margin-top: var(--space-2); display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); align-items: baseline; }
.formula { color: var(--el-text-color-secondary); font-size: 12px; word-break: break-all; }
.formula-label { color: var(--el-text-color-secondary); font-size: 12px; }
.grand-total { text-align: right; font-size: 15px; margin-top: var(--space-2); }
.mismatch-banner { color: var(--el-color-danger); background: var(--el-color-danger-light-9); padding: var(--space-2) var(--space-3); border-radius: 4px; margin-bottom: var(--space-3); }
.unassigned-banner { color: var(--el-color-warning); background: var(--el-color-warning-light-9); padding: var(--space-2) var(--space-3); border-radius: 4px; margin-bottom: var(--space-3); }
</style>
