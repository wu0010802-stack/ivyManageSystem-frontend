<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import {
  previewAppraisalPayout, generateAppraisalPayout,
  listAppraisalPayouts, voidAppraisalPayouts,
} from '@/api/yearEnd'
import { formatCurrency } from '@/utils/currency'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface PreviewRow {
  employee_id: number
  employee_name: string
  role_group: string
  earlier_summary_id: number | null
  earlier_amount: string
  earlier_cycle_finalized: boolean
  later_summary_id: number | null
  later_amount: string
  later_cycle_finalized: boolean
  total_amount: string
  is_inactive: boolean
  warnings: string[]
}

interface PayoutItem {
  id: number
  employee_id: number
  employee_name: string
  bonus_type: string
  period_label: string
  amount: string
  source_ref?: string | null
  calc_meta: Record<string, unknown>
}

const route = useRoute()
const router = useRouter()
// year 持久化進 URL query，F5 / 分享連結可保留篩選狀態（比照 CycleListView 慣例）。
const year = ref<number>(Number(route.query.year) || new Date().getFullYear())
const loading = ref(false)
const rows = ref<PreviewRow[]>([])
const selected = ref<Set<number>>(new Set())
const tab = ref<'preview' | 'generated'>('preview')
const generatedRows = ref<PayoutItem[]>([])
const generatedLoading = ref(false)

// 考核年終 payout 兩分量 = 前一學年的上/下學期。後端 resolve_target_cycles：
// source_academic_year = civil_year_to_target_academic_year(year) - 1 = year - 1913
// （civil_year_to_target_academic_year(N) = N - 1912）。動態計算避免寫死
// （原寫死 113下/114上 兩者皆錯，正確為 113上/113下）。
const sourceAcademicYear = computed(() => year.value - 1913)
const earlierLabel = computed(() => `${sourceAcademicYear.value}上`)
const laterLabel = computed(() => `${sourceAcademicYear.value}下`)

const anyCycleNotFinalized = computed(() =>
  rows.value.some((r) => !r.earlier_cycle_finalized || !r.later_cycle_finalized)
)
// 後端 generate 契約：一律發放「全部在職員工」，只額外接受 included_inactive_employee_ids
// 對「非在職」員工做 opt-in（後端不支援排除在職員工）。因此前端必須誠實化：
//   payoutRows = 全部在職 + 已勾選的非在職
// 不可用 selectedRows（含對在職列的取消勾選）來算 confirm 筆數/合計，
// 否則畫面顯示與實際寫入金流不一致（bug #27）。
// 若日後業主需要逐人排除在職員工，需後端 generate 增加 excluded ids 支援，
// 本次先讓前端與後端實際行為一致。
const activeRows = computed(() => rows.value.filter((r) => !r.is_inactive))
const selectedInactiveRows = computed(() =>
  rows.value.filter((r) => r.is_inactive && selected.value.has(r.employee_id))
)
const payoutRows = computed(() => [...activeRows.value, ...selectedInactiveRows.value])
const payoutTotal = computed(() =>
  payoutRows.value.reduce((s, r) => s + Number(r.total_amount), 0)
)
const payoutTotalDisplay = computed(() => formatCurrency(payoutTotal.value))
const includedInactiveIds = computed(() =>
  selectedInactiveRows.value.map((r) => r.employee_id)
)

async function loadPreview() {
  loading.value = true
  try {
    const res = await previewAppraisalPayout(year.value)
    rows.value = res.data as PreviewRow[]
    selected.value = new Set(rows.value.filter((r) => !r.is_inactive).map((r) => r.employee_id))
  } catch (e) {
    ElMessage.error(friendlyError('載入發放預覽失敗', e))
  } finally {
    loading.value = false
  }
}

async function loadGenerated() {
  generatedLoading.value = true
  try {
    const res = await listAppraisalPayouts(year.value)
    generatedRows.value = res.data as PayoutItem[]
  } catch (e) {
    ElMessage.error(friendlyError('載入已生成列表失敗', e))
  } finally {
    generatedLoading.value = false
  }
}

function toggleSelect(employeeId: number, checked: boolean) {
  // 在職員工一律納入發放（後端契約），不可被排除——對在職列的取消勾選視為 no-op，
  // 避免畫面顯示「已排除」但實際仍會發放（bug #27）。只允許切換非在職員工的 opt-in。
  const row = rows.value.find((r) => r.employee_id === employeeId)
  if (row && !row.is_inactive) return
  if (checked) selected.value.add(employeeId)
  else selected.value.delete(employeeId)
}

async function onGenerate() {
  if (payoutRows.value.length === 0) {
    ElMessage.warning('沒有可發放的員工')
    return
  }
  try {
    await ElMessageBox.confirm(
      `將為 ${payoutRows.value.length} 名員工生成 payout（全部在職 + 已勾選非在職，合計 ${payoutTotalDisplay.value}）`,
      '確認生成',
      { confirmButtonText: '確認', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await generateAppraisalPayout({
      year: year.value,
      included_inactive_employee_ids: includedInactiveIds.value,
    })
    ElMessage.success('已生成')
    tab.value = 'generated'
  } catch (e) {
    ElMessage.error(friendlyError('生成發放名單失敗', e))
  }
}

async function onVoid() {
  try {
    await ElMessageBox.confirm('將清空本年所有考核年終 payout（不可復原）', '確認清空', { type: 'warning' })
    await ElMessageBox.confirm('再次確認：清空後須重新生成', '最終確認', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res = await voidAppraisalPayouts(year.value)
    const data = res.data as { deleted_count: number }
    ElMessage.success(`已刪除 ${data.deleted_count} 筆`)
    await loadGenerated()
  } catch (e) {
    ElMessage.error(friendlyError('清空發放名單失敗', e))
  }
}

defineExpose({
  selected, anyCycleNotFinalized, onGenerate, onVoid, loadPreview, rows, year,
  toggleSelect, payoutRows, payoutTotal, payoutTotalDisplay,
  tab, generatedRows, generatedLoading, loadGenerated,
})

onMounted(loadPreview)
watch(year, (v) => {
  loadPreview()
  if (tab.value === 'generated') loadGenerated()
  // year 同步進 URL query（F5 / 分享連結可保留），保留其餘既有 query 欄位。
  router.replace({ query: { ...route.query, year: String(v) } })
})
watch(tab, (t) => {
  if (t === 'generated') loadGenerated()
})
</script>

<template>
  <div class="appraisal-payout-view">
    <PageHeader title="考核年終獎金管理">
      <template #actions>
        <el-input-number v-model="year" :min="2024" :max="2099" />
        <el-button type="primary" @click="loadPreview">重新載入</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="anyCycleNotFinalized"
      type="warning"
      :closable="false"
      title="⚠️ 有未 finalized 的 cycle，建議先完成簽核再生成"
      data-test="not-finalized-warning"
      style="margin: var(--space-3) 0;"
    />

    <el-tabs v-model="tab">
      <el-tab-pane label="預覽" name="preview">
        <el-table v-loading="loading" :data="rows" border>
          <el-table-column label="發放" width="80">
            <template #default="{ row }">
              <!-- 在職員工一律發放、不可排除（後端契約），checkbox 唯讀全勾；
                   只有非在職員工可 opt-in 切換。bug #27：避免顯示與實際發放不一致 -->
              <el-checkbox
                :model-value="selected.has(row.employee_id)"
                :disabled="!row.is_inactive"
                :data-test="`row-checkbox-${row.employee_id}`"
                @update:model-value="(v) => toggleSelect(row.employee_id, Boolean(v))"
              />
            </template>
          </el-table-column>
          <el-table-column prop="employee_name" label="員工" />
          <el-table-column prop="earlier_amount" :label="earlierLabel" />
          <el-table-column prop="later_amount" :label="laterLabel" />
          <el-table-column prop="total_amount" label="合計" />
          <el-table-column label="在職?" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_inactive ? 'danger' : 'success'" size="small">
                {{ row.is_inactive ? '已離職' : '在職' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="warnings">
            <template #default="{ row }">
              <span v-for="w in row.warnings" :key="w" class="warning-tag">{{ w }}</span>
            </template>
          </el-table-column>
        </el-table>

        <footer class="footer">
          <el-button type="primary" size="large" data-test="generate-button" @click="onGenerate">
            確認生成 {{ payoutRows.length }} 筆 payout（合計 {{ payoutTotalDisplay }}）
          </el-button>
        </footer>
      </el-tab-pane>

      <el-tab-pane label="已生成" name="generated">
        <div class="generated-toolbar">
          <el-button type="danger" plain data-test="void-button" @click="onVoid">清空本年 payout</el-button>
        </div>
        <el-table v-loading="generatedLoading" :data="generatedRows" border>
          <template #empty>
            <EmptyState title="本年尚未生成" />
          </template>
          <el-table-column label="員工">
            <template #default="{ row }">{{ row.employee_name }}</template>
          </el-table-column>
          <el-table-column label="期別">
            <template #default="{ row }">{{ row.period_label }}</template>
          </el-table-column>
          <el-table-column label="金額" align="right">
            <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="來源">
            <template #default="{ row }">{{ row.source_ref ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.appraisal-payout-view { padding: var(--space-4); }
.footer { margin-top: var(--space-4); text-align: right; }
.generated-toolbar { margin-bottom: var(--space-3); text-align: right; }
.warning-tag {
  display: inline-block; margin-right: var(--space-1); padding: 2px 6px;
  background: var(--color-warning-soft); color: var(--color-warning-darker);
  border-radius: 4px; font-size: 12px;
}
</style>
