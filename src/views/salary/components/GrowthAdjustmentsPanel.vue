<template>
  <section class="growth-adjustments">
    <div class="section-header">
      <h3>月額覆寫與扣抵</h3>
    </div>
    <el-tabs v-model="activeTab">
      <!-- 職務異動月額覆寫區段 -->
      <el-tab-pane label="職務異動月額覆寫" name="segments">
        <p class="hint">
          學年中途職務異動（例：副班導升班導）時，指定月份改用另一個職務的月額與每學期應修時數；區段外沿用現職。
          同一月份有多段時以後建的為準。
        </p>
        <div class="toolbar">
          <el-button
            v-if="canWrite"
            type="primary"
            size="small"
            :icon="Plus"
            data-testid="add-rate-segment"
            @click="openSegmentDialog"
          >新增覆寫區段</el-button>
        </div>
        <EmptyState
          v-if="!segmentsLoading && segments.length === 0"
          variant="inline"
          title="本學年無月額覆寫"
          description="沒有職務異動時不需設定"
        />
        <el-table v-else v-loading="segmentsLoading" :data="segments" stripe size="small" style="width: 100%">
          <el-table-column prop="employee_name" label="員工" min-width="110" />
          <el-table-column label="期間" min-width="150">
            <template #default="{ row }">{{ segmentRangeLabel(row.start_month, row.end_month) }}</template>
          </el-table-column>
          <el-table-column label="改用職務" min-width="120">
            <template #default="{ row }">{{ growthPositionLabel(row.position_key) }}</template>
          </el-table-column>
          <el-table-column label="月額" width="100">
            <template #default="{ row }">{{ formatCurrency(row.monthly_rate) }}</template>
          </el-table-column>
          <el-table-column prop="note" label="備註" min-width="160" />
          <el-table-column v-if="canWrite" label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" type="danger" @click="confirmDeleteSegment(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 扣抵 -->
      <el-tab-pane label="扣抵" name="deductions">
        <p class="hint">
          例：節慶獎金不足額、未扣完的警告款，改由本學年自主成長獎勵金扣抵。實發＝時數比例後金額－扣抵合計（最低 0），
          扣不完的部分會在預覽標示。已結算者不會自動追扣。
        </p>
        <div class="toolbar">
          <el-button
            v-if="canWrite"
            type="primary"
            size="small"
            :icon="Plus"
            data-testid="add-growth-deduction"
            @click="openDeductionDialog"
          >新增扣抵</el-button>
        </div>
        <EmptyState
          v-if="!deductionsLoading && deductions.length === 0"
          variant="inline"
          title="本學年無扣抵"
          description="需要以本獎勵金扣抵時再新增"
        />
        <el-table v-else v-loading="deductionsLoading" :data="deductions" stripe size="small" style="width: 100%">
          <el-table-column prop="employee_name" label="員工" min-width="110" />
          <el-table-column label="金額" width="110">
            <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="200" />
          <el-table-column label="來源" width="90">
            <template #default="{ row }">{{ row.source === 'manual' ? '人工' : row.source }}</template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" type="danger" @click="confirmDeleteDeduction(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增覆寫區段 -->
    <el-dialog v-model="segmentDialogVisible" title="新增職務異動月額覆寫" width="480px">
      <el-form label-width="100px">
        <el-form-item label="員工">
          <el-select v-model="segmentForm.employee_id" filterable style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="起月">
          <el-date-picker
            v-model="segmentForm.start_month"
            type="month"
            value-format="YYYY-MM"
            format="YYYY-MM"
            :disabled-date="outsideSchoolYear"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="迄月">
          <el-date-picker
            v-model="segmentForm.end_month"
            type="month"
            value-format="YYYY-MM"
            format="YYYY-MM"
            :disabled-date="outsideSchoolYear"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="改用職務">
          <el-select v-model="segmentForm.position_key" style="width: 100%">
            <el-option
              v-for="p in positionRates"
              :key="p.key"
              :value="p.key"
              :label="`${growthPositionLabel(p.key)}（月額 ${formatCurrency(p.monthly_rate)}／每學期 ${p.required_hours_per_semester} 小時）`"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="segmentForm.note" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <p class="hint">起訖月含兩端，須在 {{ bounds.first }}～{{ bounds.last }} 之間。</p>
      <template #footer>
        <el-button @click="segmentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitSegment">新增</el-button>
      </template>
    </el-dialog>

    <!-- 新增扣抵 -->
    <el-dialog v-model="deductionDialogVisible" title="新增自主成長獎勵金扣抵" width="440px">
      <el-form label-width="90px">
        <el-form-item label="員工">
          <el-select v-model="deductionForm.employee_id" filterable style="width: 100%">
            <el-option v-for="emp in employeeOptions" :key="emp.id" :value="emp.id" :label="emp.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="金額">
          <el-input-number
            v-model="deductionForm.amount"
            :min="1"
            :step="100"
            :precision="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="deductionForm.reason" maxlength="200" show-word-limit placeholder="例：115.02 警告款節慶不足額結轉" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deductionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitDeduction">新增</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import {
  listGrowthPositionRates,
  listGrowthRateSegments,
  createGrowthRateSegment,
  deleteGrowthRateSegment,
  listGrowthDeductions,
  createGrowthDeduction,
  deleteGrowthDeduction,
} from '@/api/growthContract'
import type { Schema } from '@/api/_generated/typed'
import {
  growthPositionLabel,
  schoolYearMonthBounds,
  segmentRangeLabel,
  validateRateSegmentDraft,
  validateDeductionDraft,
  type RateSegmentDraft,
  type DeductionDraft,
} from '../growthAdjustments'

// 義華第二批 growth2：職務異動月額覆寫（落差報告 #11 ①）與扣抵（#11 ③）。
// 任一異動都會改變預覽金額，成功後 emit('changed') 讓父頁重抓預覽。

type RateSegment = Schema<'GrowthRateSegmentOut'>
type Deduction = Schema<'GrowthDeductionOut'>
type PositionRate = Schema<'GrowthPositionRateOut'>

interface EmployeeOption {
  id: number
  name: string
}

const props = defineProps<{
  schoolYear: number
  canWrite: boolean
  employeeOptions: EmployeeOption[]
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const activeTab = ref<'segments' | 'deductions'>('segments')
const saving = ref(false)
const bounds = computed(() => schoolYearMonthBounds(props.schoolYear))

// ---- 職務月額表 ----
const positionRates = ref<PositionRate[]>([])
const fetchPositionRates = async () => {
  try {
    const res = await listGrowthPositionRates()
    positionRates.value = res.data
  } catch (e) {
    ElMessage.error(friendlyError('載入職務月額表失敗', e))
  }
}

// ---- 覆寫區段 ----
const segments = ref<RateSegment[]>([])
const segmentsLoading = ref(false)
let segmentSeq = 0
const fetchSegments = async () => {
  const seq = ++segmentSeq
  segmentsLoading.value = true
  try {
    const res = await listGrowthRateSegments({ school_year: props.schoolYear })
    if (seq !== segmentSeq) return
    segments.value = res.data.items
  } catch (e) {
    if (seq !== segmentSeq) return
    ElMessage.error(friendlyError('載入月額覆寫失敗', e))
  } finally {
    if (seq === segmentSeq) segmentsLoading.value = false
  }
}

const segmentDialogVisible = ref(false)
const segmentForm = reactive<RateSegmentDraft>({
  employee_id: null,
  school_year: props.schoolYear,
  start_month: '',
  end_month: '',
  position_key: '',
  note: '',
})

/** month picker 只開放本學年 8 月～次年 7 月。 */
const outsideSchoolYear = (d: Date): boolean => {
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return ym < bounds.value.first || ym > bounds.value.last
}

const openSegmentDialog = () => {
  segmentForm.employee_id = null
  segmentForm.school_year = props.schoolYear
  segmentForm.start_month = ''
  segmentForm.end_month = ''
  segmentForm.position_key = ''
  segmentForm.note = ''
  if (positionRates.value.length === 0) fetchPositionRates()
  segmentDialogVisible.value = true
}

const submitSegment = async () => {
  const err = validateRateSegmentDraft(segmentForm)
  if (err) {
    ElMessage.warning(err)
    return
  }
  saving.value = true
  try {
    const res = await createGrowthRateSegment({
      employee_id: segmentForm.employee_id as number,
      school_year: segmentForm.school_year,
      start_month: segmentForm.start_month,
      end_month: segmentForm.end_month,
      position_key: segmentForm.position_key,
      note: segmentForm.note.trim() || null,
    })
    ElMessage.success(`已新增覆寫區段（月額 ${formatCurrency(res.data.monthly_rate)}）`)
    segmentDialogVisible.value = false
    await fetchSegments()
    emit('changed')
  } catch (e) {
    ElMessage.error(friendlyError('新增月額覆寫失敗', e))
  } finally {
    saving.value = false
  }
}

const confirmDeleteSegment = async (row: RateSegment) => {
  try {
    await ElMessageBox.confirm(
      `確定刪除 ${row.employee_name ?? ''} ${segmentRangeLabel(row.start_month, row.end_month)} 的月額覆寫？刪除後該期間改回現職月額。`,
      '確認刪除',
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteGrowthRateSegment(row.id)
    ElMessage.success('已刪除月額覆寫')
    await fetchSegments()
    emit('changed')
  } catch (e) {
    ElMessage.error(friendlyError('刪除月額覆寫失敗', e))
  }
}

// ---- 扣抵 ----
const deductions = ref<Deduction[]>([])
const deductionsLoading = ref(false)
let deductionSeq = 0
const fetchDeductions = async () => {
  const seq = ++deductionSeq
  deductionsLoading.value = true
  try {
    const res = await listGrowthDeductions({ school_year: props.schoolYear })
    if (seq !== deductionSeq) return
    deductions.value = res.data.items
  } catch (e) {
    if (seq !== deductionSeq) return
    ElMessage.error(friendlyError('載入扣抵失敗', e))
  } finally {
    if (seq === deductionSeq) deductionsLoading.value = false
  }
}

const deductionDialogVisible = ref(false)
const deductionForm = reactive<DeductionDraft>({
  employee_id: null,
  school_year: props.schoolYear,
  amount: null,
  reason: '',
})

const openDeductionDialog = () => {
  deductionForm.employee_id = null
  deductionForm.school_year = props.schoolYear
  deductionForm.amount = null
  deductionForm.reason = ''
  deductionDialogVisible.value = true
}

const submitDeduction = async () => {
  const err = validateDeductionDraft(deductionForm)
  if (err) {
    ElMessage.warning(err)
    return
  }
  saving.value = true
  try {
    await createGrowthDeduction({
      employee_id: deductionForm.employee_id as number,
      school_year: deductionForm.school_year,
      amount: deductionForm.amount as number,
      reason: deductionForm.reason.trim(),
    })
    ElMessage.success('已新增扣抵')
    deductionDialogVisible.value = false
    await fetchDeductions()
    emit('changed')
  } catch (e) {
    ElMessage.error(friendlyError('新增扣抵失敗', e))
  } finally {
    saving.value = false
  }
}

const confirmDeleteDeduction = async (row: Deduction) => {
  try {
    await ElMessageBox.confirm(
      `確定刪除 ${row.employee_name ?? ''} 的扣抵 ${formatCurrency(row.amount)}（${row.reason}）？`,
      '確認刪除',
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteGrowthDeduction(row.id)
    ElMessage.success('已刪除扣抵')
    await fetchDeductions()
    emit('changed')
  } catch (e) {
    ElMessage.error(friendlyError('刪除扣抵失敗', e))
  }
}

watch(
  () => props.schoolYear,
  () => {
    fetchSegments()
    fetchDeductions()
  },
)

onMounted(() => {
  fetchSegments()
  fetchDeductions()
  fetchPositionRates()
})
</script>

<style scoped>
.growth-adjustments {
  margin-top: var(--space-5);
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: var(--space-4) 0 var(--space-2);
}
.section-header h3 {
  margin: 0;
}
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-2);
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
</style>
