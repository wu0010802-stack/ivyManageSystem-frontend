<script setup lang="ts">
// 下學期（2–7 月）推動才藝獎勵金＋教課教師獎勵金 8 月表外批次（義華 2026-10-27）。
// 預覽唯讀；「產生／更新批次」寫入表外獎金（歸屬 8 月、計入補充保費年累計），須在 8 月薪資封存前執行。
// 冪等：系統列重跑即更新、人工登錄的同類列不覆寫、操作者本人跳過（職權分離）。
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { applySemester2Activity, previewSemester2Activity } from '@/api/extraBonuses'
import type { Schema } from '@/api/_generated/typed'
import { applyResultCountsText, defaultSemester2AcademicYear, semester2PeriodLabel } from './semester2Excess'
import { activityApplyDescription, activityDetailLines, payableActivityCount } from './semester2Activity'

type PreviewOut = Schema<'Semester2ActivityPreviewOut'>
type ApplyOut = Schema<'Semester2ActivityApplyOut'>

const canView = computed(() => hasPermission('SALARY_READ') && hasFullSalaryView())
const canApply = computed(() => canView.value && hasPermission('SALARY_WRITE'))

const baseYear = defaultSemester2AcademicYear()
const academicYear = ref(baseYear)
const yearOptions = computed(() => [baseYear - 1, baseYear, baseYear + 1])

const preview = ref<PreviewOut | null>(null)
const loading = ref(false)
const applying = ref(false)
const applyResult = ref<ApplyOut | null>(null)

const tableRows = computed(() =>
  (preview.value?.rows ?? []).map((r) => ({ ...r, detailLines: activityDetailLines(r.category, r.detail) })),
)
const payableCount = computed(() => payableActivityCount(preview.value?.rows ?? []))

let seq = 0
const fetchPreview = async () => {
  if (!canView.value) return
  const mine = ++seq
  loading.value = true
  try {
    const res = await previewSemester2Activity({ academic_year: academicYear.value })
    if (mine !== seq) return
    preview.value = res.data
  } catch (e) {
    if (mine !== seq) return
    preview.value = null
    ElMessage.error(friendlyError('載入下學期才藝獎勵金預覽失敗', e))
  } finally {
    if (mine === seq) loading.value = false
  }
}

const doApply = async () => {
  const p = preview.value
  if (!p || applying.value) return
  try {
    await ElMessageBox.confirm(
      `即將產生 ${academicYear.value} 學年下學期才藝獎勵金表外批次（歸屬 ${p.period_year}/${p.period_month}），` +
        `預計寫入 ${payableCount.value} 筆、預覽合計 ${formatCurrency(p.total_amount)}。` +
        '此批計入補充保費年累計，須於 8 月薪資封存前執行；重跑會更新系統產生的金額，不覆寫人工登錄。確定執行？',
      '產生下學期才藝獎勵金批次',
      { confirmButtonText: '確定產生', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  applying.value = true
  try {
    const res = await applySemester2Activity({ academic_year: academicYear.value })
    applyResult.value = res.data
    ElMessage.success(`已完成：${applyResultCountsText(res.data)}，共 ${formatCurrency(res.data.total_amount)}`)
    await fetchPreview()
  } catch (e) {
    ElMessage.error(friendlyError('產生下學期才藝獎勵金批次失敗', e))
  } finally {
    applying.value = false
  }
}

const applyResultTitle = computed(() =>
  applyResult.value
    ? `本次執行：${applyResultCountsText(applyResult.value)}，共 ${formatCurrency(applyResult.value.total_amount)}`
    : '',
)
const applyResultDescription = computed(() => (applyResult.value ? activityApplyDescription(applyResult.value) : ''))

watch(academicYear, () => {
  applyResult.value = null
  fetchPreview()
})
onMounted(fetchPreview)

defineExpose({ preview, applyResult, payableCount, tableRows, doApply, fetchPreview, academicYear })
</script>

<template>
  <div class="semester2-activity-panel">
    <el-alert
      v-if="!canView"
      type="warning"
      :closable="false"
      show-icon
      title="下學期才藝獎勵金僅限具全員薪資視野的角色查看"
    />
    <el-card v-else shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <h3 class="card-title">下學期才藝獎勵金（8 月表外發放）</h3>
            <span class="hint">
              {{ semester2PeriodLabel(academicYear) }}的推動才藝獎勵金與教課教師獎勵金，寫入表外獎金並歸屬 8 月，計入補充保費年累計。
              需於 8 月薪資封存前執行。
            </span>
          </div>
          <div class="panel-actions">
            <el-select v-model="academicYear" style="width: 120px" aria-label="學年">
              <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 學年`" />
            </el-select>
            <el-button :loading="loading" @click="fetchPreview">重新整理</el-button>
            <el-button
              v-if="canApply"
              type="danger"
              :loading="applying"
              :disabled="!preview || loading"
              data-test="apply-button"
              @click="doApply"
            >產生／更新批次</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-for="(w, i) in preview?.pending_rules ?? []"
        :key="`rule-${i}`"
        type="warning"
        :closable="false"
        show-icon
        class="mb-2"
        :title="w"
        data-test="pending-rule"
      />
      <el-alert
        v-for="(w, i) in preview?.warnings ?? []"
        :key="`warn-${i}`"
        type="info"
        :closable="false"
        show-icon
        class="mb-2"
        :title="w"
        data-test="preview-warning"
      />
      <el-alert
        v-if="applyResult"
        type="success"
        :closable="false"
        show-icon
        class="mb-2"
        :title="applyResultTitle"
        :description="applyResultDescription"
        data-test="apply-result"
      />

      <p v-if="preview" class="summary" data-test="summary">
        歸屬 {{ preview.period_year }}/{{ preview.period_month }}；預計寫入 {{ payableCount }} 筆，合計
        <strong>{{ formatCurrency(preview.total_amount) }}</strong>
      </p>

      <el-table v-loading="loading" :data="tableRows" stripe style="width: 100%" empty-text="該學年下學期查無才藝獎勵金資料">
        <el-table-column prop="employee_name" label="員工" min-width="110" />
        <el-table-column prop="category_label" label="類別" width="140" />
        <el-table-column label="金額" width="110" align="right">
          <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="計算明細" min-width="320">
          <template #default="{ row }">
            <div v-for="(line, i) in row.detailLines" :key="i" class="detail-line">{{ line }}</div>
            <span v-if="row.detailLines.length === 0" class="hint">—</span>
          </template>
        </el-table-column>
        <el-table-column label="已產生" width="150">
          <template #default="{ row }">
            <span v-if="row.has_manual_payment" class="hint">已有人工登錄（不覆寫）</span>
            <span v-else-if="row.existing_auto_amount != null">{{ formatCurrency(row.existing_auto_amount) }}</span>
            <span v-else class="hint">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.card-title {
  margin: 0 0 4px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.panel-actions {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
}
.mb-2 {
  margin-bottom: var(--space-2, 8px);
}
.summary {
  margin: var(--space-2, 8px) 0 var(--space-3, 12px);
}
.detail-line {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
</style>
