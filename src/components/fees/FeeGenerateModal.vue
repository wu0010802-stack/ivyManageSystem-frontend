<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="批次產生費用單"
    width="700"
  >
    <el-form :model="form" label-width="100">
      <el-form-item label="學年">
        <el-input-number v-model="form.school_year" :min="100" :max="200" aria-label="學年" />
      </el-form-item>
      <el-form-item label="學期">
        <el-radio-group v-model="form.semester" aria-label="學期">
          <el-radio :value="1">上學期</el-radio>
          <el-radio :value="2">下學期</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="費用類型">
        <el-checkbox-group v-model="form.fee_types" aria-label="費用類型">
          <el-checkbox v-for="t in TEMPLATE_FEE_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}{{ t.value === 'monthly' ? '（逐月產單）' : '' }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>
    </el-form>

    <el-alert type="info" :closable="false" class="notice">
      系統每日排程仍會自動產單；此入口用於立即補產、不需等隔日。已存在的（學生 ×
      範本 × 月份）組合會自動跳過，不會重複產生；範本修改後的差額不會自動補單。
    </el-alert>

    <!-- 已預覽：摘要（學年/學期/類型/新建/跳過）＋前 N 筆清單。表單一變動即失效。 -->
    <div v-if="preview" class="preview-block" data-test="generate-preview-summary">
      <el-alert type="info" :closable="false">
        {{ form.school_year }} 學年度{{ form.semester === 1 ? '上' : '下' }}學期 ·
        {{ selectedTypeLabels }}：將新建 <b>{{ preview.created }}</b> 筆，已存在跳過
        <b>{{ preview.skipped }}</b> 筆
      </el-alert>
      <el-table :data="preview.preview || []" max-height="300" class="preview-table">
        <el-table-column prop="student_name" label="學生" />
        <el-table-column prop="classroom_name" label="班級" />
        <el-table-column prop="fee_item_name" label="費用" />
        <el-table-column prop="amount_due" label="金額" align="right" class-name="num-cell">
          <template #default="{ row } = {}">{{ formatAmount(row?.amount_due) }}</template>
        </el-table-column>
      </el-table>
      <p v-if="preview.created > (preview.preview?.length || 0)" class="muted">
        …等 {{ preview.created }} 筆（顯示前 {{ preview.preview?.length || 0 }} 筆）
      </p>
    </div>

    <!-- 兩階段 footer：未預覽 → 預覽產單；已預覽 → 確認產生 N 筆 -->
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button v-if="!preview" type="primary" :loading="loading" @click="onPreview">
        預覽產單
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="confirming"
        :disabled="preview.created === 0"
        @click="onConfirm"
      >
        確認產生 {{ preview.created }} 筆
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { generateFeeRecords } from '@/api/fees'
import { currentRocYear } from '@/utils/academic'
import { formatCurrency } from '@/utils/currency'
import { FEE_TYPES } from '@/components/fees/feeTypes'
import { apiError } from '@/utils/error'

// 批次產單可選類型：僅 source === 'record'（正金額應收，與 FeeTemplateDialog 一致）
const TEMPLATE_FEE_TYPES = FEE_TYPES.filter((t) => t.source === 'record')

interface PreviewResult {
  created: number
  skipped: number
  preview?: Record<string, unknown>[]
}

interface FormState {
  school_year: number
  semester: number
  fee_types: string[]
}

const props = defineProps<{
  modelValue: boolean
  /** 繼承父層（FeeBillingWorkspace）目前聚焦的學年；每次開啟時重新同步 */
  schoolYear?: number
  /** 繼承父層目前聚焦的學期；每次開啟時重新同步 */
  semester?: number
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  generated: [result: PreviewResult]
}>()

const form = reactive<FormState>({
  school_year: props.schoolYear ?? currentRocYear(),
  semester: props.semester ?? 1,
  fee_types: ['registration', 'miscellaneous'],
})

const loading = ref<boolean>(false)
const confirming = ref<boolean>(false)
const preview = ref<PreviewResult | null>(null)

const selectedTypeLabels = computed(() =>
  TEMPLATE_FEE_TYPES.filter((t) => form.fee_types.includes(t.value))
    .map((t) => t.label)
    .join('、'),
)

// preview.preview 的欄位型別為 unknown（後端未標 response_model）；顯示前先窄化為 number。
function formatAmount(value: unknown): string {
  return typeof value === 'number' ? formatCurrency(value) : formatCurrency(0)
}

// F-1: 表單（學年／學期／類型）一旦變動，舊 preview 對應的參數已過期，須清空避免用過期參數送出確認
watch(form, () => { preview.value = null }, { deep: true })
// F-1: 每次重新開啟 modal 都視為新一輪操作：清掉上一輪殘留的 preview，
// 並重新同步父層目前聚焦的學年/學期（不繼承上一輪殘值）
watch(() => props.modelValue, (v) => {
  if (!v) return
  preview.value = null
  if (props.schoolYear != null) form.school_year = props.schoolYear
  if (props.semester != null) form.semester = props.semester
})

async function onPreview() {
  if (!form.fee_types.length) {
    ElMessage.warning('請至少選一項費用類型')
    return
  }
  loading.value = true
  try {
    preview.value = await generateFeeRecords({ ...form, dry_run: true })
  } catch (e: unknown) {
    ElMessage.error(apiError(e, '預覽失敗'))
  } finally {
    loading.value = false
  }
}

async function onConfirm() {
  confirming.value = true
  try {
    const result = await generateFeeRecords({ ...form, dry_run: false })
    ElMessage.success(`已產生 ${result.created} 筆，跳過 ${result.skipped} 筆`)
    emit('generated', result)
    emit('update:modelValue', false)
  } catch (e: unknown) {
    ElMessage.error(apiError(e, '產生失敗'))
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.notice {
  margin-bottom: var(--space-3);
}
.preview-block {
  margin-top: var(--space-4);
}
.preview-table {
  margin-top: var(--space-3);
}
.muted {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  margin-top: var(--space-2);
}
</style>
