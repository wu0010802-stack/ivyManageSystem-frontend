<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getSalaryContributors } from '@/api/reports'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'

const props = defineProps<{
  modelValue: boolean
  year: number
  month: number
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const data = ref<{ top_gross?: unknown[]; top_overtime?: unknown[] } | null>(null)

const load = async () => {
  if (!props.year || !props.month) return
  loading.value = true
  try {
    const res = await getSalaryContributors(props.year, props.month)
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入薪資榜首失敗'))
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

const topGross = computed(() => data.value?.top_gross || [])
const topOvertime = computed(() => data.value?.top_overtime || [])

const formatAmount = (v: number | null | undefined) => (v == null ? '—' : money(v))
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${year} 年 ${month} 月 薪資榜首`"
    width="800px"
    append-to-body
  >
    <el-row :gutter="16" v-loading="loading">
      <el-col :span="12">
        <h4 class="section-title">應發前 5 名</h4>
        <el-table :data="topGross" border size="small" empty-text="無資料">
          <el-table-column prop="employee_name" label="員工" width="120" />
          <el-table-column label="應發" align="right">
            <template #default="{ row }">{{ formatAmount(row.gross_salary) }}</template>
          </el-table-column>
          <el-table-column label="封存" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_finalized" size="small" type="info">已封存</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-col>
      <el-col :span="12">
        <h4 class="section-title">加班費前 5 名</h4>
        <el-table :data="topOvertime" border size="small" empty-text="無加班費">
          <el-table-column prop="employee_name" label="員工" width="120" />
          <el-table-column label="加班費" align="right">
            <template #default="{ row }">{{ formatAmount(row.overtime_pay) }}</template>
          </el-table-column>
          <el-table-column label="封存" width="70" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_finalized" size="small" type="info">已封存</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-col>
    </el-row>
  </el-dialog>
</template>

<style scoped>
.section-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
