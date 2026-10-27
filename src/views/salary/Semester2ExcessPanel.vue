<script setup lang="ts">
// 下學期（2–7 月）超額獎金 7 月表外批次（義華 Q11，category=excess_enrollment_s2）。
// 預覽唯讀；「產生／更新批次」寫入表外獎金（計入補充保費年累計），須在 7 月薪資封存前執行。
// 冪等：系統列重跑即更新、人工登錄的同類列不覆寫、操作者本人跳過（職權分離）。
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { applySemester2Excess, previewSemester2Excess } from '@/api/extraBonuses'
import type { Schema } from '@/api/_generated/typed'
import {
  applyResultCountsText,
  coexistConfirmNote,
  coexistCount,
  defaultSemester2AcademicYear,
  removalDescriptionParts,
  semester2PeriodLabel,
  sortedMonthEntries,
} from './semester2Excess'

type PreviewOut = Schema<'Semester2ExcessPreviewOut'>
type ApplyOut = Schema<'Semester2ExcessApplyOut'>

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
  (preview.value?.rows ?? []).map((r) => ({ ...r, monthEntries: sortedMonthEntries(r.months) })),
)
// 人工列與系統產生列並存：套用時系統列會被移除（人工優先、不重複發放）
const coexistRows = computed(() => coexistCount(preview.value?.rows ?? []))
const eligibleCount = computed(() => (preview.value?.rows ?? []).filter((r) => r.eligible && r.amount > 0).length)

let seq = 0
const fetchPreview = async () => {
  if (!canView.value) return
  const mine = ++seq
  loading.value = true
  try {
    const res = await previewSemester2Excess({ academic_year: academicYear.value })
    if (mine !== seq) return
    preview.value = res.data
  } catch (e) {
    if (mine !== seq) return
    preview.value = null
    ElMessage.error(friendlyError('載入下學期超額獎金預覽失敗', e))
  } finally {
    if (mine === seq) loading.value = false
  }
}

const doApply = async () => {
  const p = preview.value
  if (!p) return
  try {
    await ElMessageBox.confirm(
      `即將產生 ${academicYear.value} 學年下學期超額獎金表外批次（歸屬 ${p.period_year}/${p.period_month}），` +
        `符合資格 ${eligibleCount.value} 位、預覽合計 ${formatCurrency(p.total_amount)}。` +
        '此批計入補充保費年累計，須於 7 月薪資封存前執行；重跑會更新系統產生的金額，不覆寫人工登錄。' +
        coexistConfirmNote(coexistRows.value) +
        '確定執行？',
      '產生下學期超額獎金批次',
      { confirmButtonText: '確定產生', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  applying.value = true
  try {
    const res = await applySemester2Excess({ academic_year: academicYear.value })
    applyResult.value = res.data
    ElMessage.success(`已完成：${applyResultCountsText(res.data)}，共 ${formatCurrency(res.data.total_amount)}`)
    await fetchPreview()
  } catch (e) {
    ElMessage.error(friendlyError('產生下學期超額獎金批次失敗', e))
  } finally {
    applying.value = false
  }
}

const applyResultTitle = computed(() =>
  applyResult.value
    ? `本次執行：${applyResultCountsText(applyResult.value)}，共 ${formatCurrency(applyResult.value.total_amount)}`
    : '',
)
const applyResultDescription = computed(() => {
  const r = applyResult.value
  if (!r) return ''
  const parts: string[] = []
  if (r.skipped_manual.length > 0) parts.push(`已有人工登錄（未覆寫）：${r.skipped_manual.map((b) => b.employee_name).join('、')}`)
  if (r.skipped_self.length > 0) parts.push(`執行者本人未產生：${r.skipped_self.map((b) => b.employee_name).join('、')}，請由其他有權限的人員再執行一次`)
  parts.push(...removalDescriptionParts(r))
  return parts.join('；')
})

watch(academicYear, () => {
  applyResult.value = null
  fetchPreview()
})
onMounted(fetchPreview)
</script>

<template>
  <div class="semester2-excess-panel">
    <el-alert
      v-if="!canView"
      type="warning"
      :closable="false"
      show-icon
      title="下學期超額獎金僅限具全員薪資視野的角色查看"
    />
    <el-card v-else shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <h3 class="card-title">下學期超額獎金（7 月表外發放）</h3>
            <span class="hint">
              {{ semester2PeriodLabel(academicYear) }}逐月超額獎金加總，寫入表外獎金「下學期超額獎金」，計入補充保費年累計。
              需於 7 月薪資封存前執行。
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
      />
      <el-alert
        v-for="(w, i) in preview?.warnings ?? []"
        :key="`warn-${i}`"
        type="info"
        :closable="false"
        show-icon
        class="mb-2"
        :title="w"
      />
      <el-alert
        v-if="applyResult"
        type="success"
        :closable="false"
        show-icon
        class="mb-2"
        :title="applyResultTitle"
        :description="applyResultDescription"
      />

      <p v-if="preview" class="summary">
        歸屬 {{ preview.period_year }}/{{ preview.period_month }}；符合資格 {{ eligibleCount }} 位，合計
        <strong>{{ formatCurrency(preview.total_amount) }}</strong>
      </p>

      <el-table v-loading="loading" :data="tableRows" stripe style="width: 100%" empty-text="該學年下學期查無超額獎金資料">
        <el-table-column prop="employee_name" label="員工" min-width="120" />
        <el-table-column label="金額" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="逐月" min-width="260">
          <template #default="{ row }">
            <span v-for="m in row.monthEntries" :key="m.ym" class="month-chip">{{ m.ym }}：{{ m.value }}</span>
          </template>
        </el-table-column>
        <el-table-column label="資格" width="160">
          <template #default="{ row }">
            <el-tag :type="row.eligible ? 'success' : 'info'">{{ row.eligible ? '符合資格' : '不符合' }}</el-tag>
            <div v-if="!row.eligible && row.ineligible_reason" class="hint">{{ row.ineligible_reason }}</div>
          </template>
        </el-table-column>
        <el-table-column label="已產生" width="220">
          <template #default="{ row }">
            <template v-if="row.has_manual_payment">
              <span class="hint">已有人工登錄（不覆寫）</span>
              <div v-if="row.auto_and_manual_coexist" class="coexist" data-test="coexist-note">
                <el-tag type="warning" size="small">並存</el-tag>
                <span class="hint">
                  套用時會移除系統產生的{{ row.existing_auto_amount != null ? ` ${formatCurrency(row.existing_auto_amount)}` : '列' }}，避免重複發放
                </span>
              </div>
            </template>
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
.coexist {
  margin-top: 4px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}
.month-chip {
  display: inline-block;
  margin: 0 8px 4px 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
</style>
