<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="批次產生費用單"
    width="700"
  >
    <el-form :model="form" label-width="100">
      <el-form-item label="學年">
        <el-input-number v-model="form.school_year" :min="100" :max="200" />
      </el-form-item>
      <el-form-item label="學期">
        <el-radio-group v-model="form.semester">
          <el-radio :value="1">上學期</el-radio>
          <el-radio :value="2">下學期</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="費用類型">
        <el-checkbox-group v-model="form.fee_types">
          <el-checkbox v-for="t in TEMPLATE_FEE_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}{{ t.value === 'monthly' ? '（展開為 6 張）' : '' }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>
    </el-form>

    <el-alert type="info" :closable="false" class="mb-12">
      已存在的（學生 × 範本 × 月份）組合會自動跳過，不會重複產生；範本修改後的差額不會自動補單。
    </el-alert>

    <el-button type="primary" plain :loading="loading" @click="onPreview">
      預覽
    </el-button>

    <div v-if="preview" class="preview-block">
      <el-alert type="info" :closable="false">
        將新建 <b>{{ preview.created }}</b> 筆 ·
        已存在跳過 <b>{{ preview.skipped }}</b> 筆
      </el-alert>
      <el-table :data="preview.preview || []" max-height="300" class="mt-12">
        <el-table-column prop="student_name" label="學生" />
        <el-table-column prop="classroom_name" label="班級" />
        <el-table-column prop="fee_item_name" label="費用" />
        <el-table-column prop="amount_due" label="金額" align="right">
          <template #default="{ row } = {}">NT$ {{ formatAmount(row?.amount_due) }}</template>
        </el-table-column>
      </el-table>
      <p v-if="preview.created > (preview.preview?.length || 0)" class="muted">
        ...等 {{ preview.created }} 筆(顯示前 {{ preview.preview?.length || 0 }} 筆)
      </p>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="confirming"
        :disabled="!preview || preview.created === 0"
        @click="onConfirm"
      >
        確認產生 ({{ preview?.created || 0 }} 筆)
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { generateFeeRecords } from '@/api/fees'
import { currentRocYear } from '@/utils/academic'
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
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  generated: [result: PreviewResult]
}>()

const form = reactive<FormState>({
  school_year: currentRocYear(),
  semester: 1,
  fee_types: ['registration', 'miscellaneous'],
})

const loading = ref<boolean>(false)
const confirming = ref<boolean>(false)
const preview = ref<PreviewResult | null>(null)

// preview.preview 的欄位型別為 unknown（後端未標 response_model）；顯示前先窄化為 number。
function formatAmount(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

// F-1: 表單（學年／學期／類型）一旦變動，舊 preview 對應的參數已過期，須清空避免用過期參數送出確認
watch(form, () => { preview.value = null }, { deep: true })
// F-1: 每次重新開啟 modal 都視為新一輪操作，清掉上一輪殘留的 preview
watch(() => props.modelValue, (v) => { if (v) preview.value = null })

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
    ElMessage.success(`已產生 ${result.created} 筆,跳過 ${result.skipped} 筆`)
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
.preview-block { margin-top: 16px; }
.mt-12 { margin-top: 12px; }
.mb-12 { margin-bottom: 12px; }
.muted { color: #888; font-size: 12px; margin-top: 8px; }
</style>
