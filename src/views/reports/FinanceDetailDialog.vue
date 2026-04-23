<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getFinanceSummaryDetail } from '@/api/reports'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  year: { type: Number, required: true },
  month: { type: Number, default: null },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const data = ref(null)
const activeTab = ref('tuition')

const load = async () => {
  if (!props.year || !props.month) return
  loading.value = true
  try {
    const res = await getFinanceSummaryDetail(props.year, props.month)
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入明細失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.year, props.month],
  ([open]) => {
    if (open) load()
  },
)

const tuitionRows = computed(() => data.value?.tuition || [])
const activityRows = computed(() => data.value?.activity || [])
const salaryRows = computed(() => data.value?.salary || [])

const kindLabel = (k) => (k === 'payment' ? '繳費' : k === 'refund' ? '退款' : k)
const kindTag = (k) => (k === 'payment' ? 'success' : 'warning')
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${year} 年 ${month} 月 收支明細`"
    width="960px"
    append-to-body
  >
    <el-tabs v-model="activeTab" v-loading="loading">
      <el-tab-pane :label="`學費 (${tuitionRows.length})`" name="tuition">
        <el-table :data="tuitionRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column label="類型" width="80">
            <template #default="{ row }">
              <el-tag :type="kindTag(row.kind)">{{ kindLabel(row.kind) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="student_name" label="學生" width="110" />
          <el-table-column prop="classroom_name" label="班級" width="90" />
          <el-table-column prop="fee_item_name" label="費用項目" min-width="120" />
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="payment_method" label="付款方式" width="100" />
          <el-table-column prop="reason" label="備註" min-width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`才藝 (${activityRows.length})`" name="activity">
        <el-table :data="activityRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column label="類型" width="80">
            <template #default="{ row }">
              <el-tag :type="kindTag(row.kind)">{{ kindLabel(row.kind) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="student_name" label="學生" min-width="110" />
          <el-table-column label="金額" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="payment_method" label="付款方式" width="100" />
          <el-table-column prop="operator" label="操作人" width="100" />
          <el-table-column prop="receipt_no" label="收據號" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`薪資 (${salaryRows.length})`" name="salary">
        <el-table :data="salaryRows" border stripe max-height="480" size="small" empty-text="無資料">
          <el-table-column prop="employee_name" label="員工" width="120" fixed />
          <el-table-column label="應發" width="110" align="right">
            <template #default="{ row }">{{ money(row.gross_salary) }}</template>
          </el-table-column>
          <el-table-column label="實發" width="110" align="right">
            <template #default="{ row }">{{ money(row.net_salary) }}</template>
          </el-table-column>
          <el-table-column label="雇主保費+勞退" width="140" align="right">
            <template #default="{ row }">{{ money(row.employer_benefit) }}</template>
          </el-table-column>
          <el-table-column label="園方真實支出" width="140" align="right">
            <template #default="{ row }">
              <strong>{{ money(row.real_cost) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="封存" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_finalized" size="small" type="info">已封存</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>
