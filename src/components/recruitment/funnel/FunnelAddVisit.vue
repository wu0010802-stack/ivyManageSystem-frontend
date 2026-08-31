<template>
  <span class="funnel-add-visit">
    <el-button
      v-if="canWrite"
      type="primary"
      size="small"
      @click="openDialog"
    >新增訪視</el-button>

    <RecruitmentRecordDialog
      v-model:visible="dialogVisible"
      mode="add"
      :form="form"
      :saving="saving"
      :source-suggestions="sourceSuggestions"
      :referrer-suggestions="referrerSuggestions"
      :no-deposit-reasons="noDepositReasons"
      @save="handleSave"
      @save-next="handleSaveAndNext"
    />
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { createRecruitmentRecord } from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { emptyVisitForm, type VisitFormState } from '@/constants/recruitment'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'

const props = defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
}>()

const emit = defineEmits<{
  created: [record: { id: number; [k: string]: unknown }]
}>()

// 與「訪視明細」tab 同一把鎖：無 RECRUITMENT_WRITE 不顯示按鈕
const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))

const dialogVisible = ref(false)
const saving = ref(false)
const form = ref<VisitFormState>(emptyVisitForm())

// dashboard 提供 autocomplete 建議來源（與 AdmissionsRecordsPanel 取法一致）
const { options, fetchOptions } = props.dashboard

const sourceSuggestions = computed((): string[] =>
  (options.value.sources as string[] | undefined) || [],
)
const referrerSuggestions = computed((): string[] =>
  (options.value.referrers as string[] | undefined) || [],
)
const noDepositReasons = computed((): string[] =>
  (options.value.no_deposit_reasons as string[] | undefined) || [],
)

async function openDialog(): Promise<void> {
  await fetchOptions()
  form.value = emptyVisitForm()
  dialogVisible.value = true
}

async function handleSave(): Promise<void> {
  saving.value = true
  // 排除前端內部用的 month_raw，不送後端（與 AdmissionsRecordsPanel.handleSave 一致）
  const { month_raw: _mr, ...payload } = form.value
  try {
    const res = await createRecruitmentRecord(payload)
    ElMessage.success('新增成功')
    dialogVisible.value = false
    // TODO(ts-strict): waiting on backend response_model — createRecruitmentRecord 回傳 unknown
    emit('created', (res as { data: { id: number; [k: string]: unknown } }).data)
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

// 儲存並新增下一筆：成功後不關 dialog，換空白表單續填（入學學期沿用上一筆）。
async function handleSaveAndNext(): Promise<void> {
  saving.value = true
  const { month_raw: _mr, ...payload } = form.value
  try {
    const res = await createRecruitmentRecord(payload)
    ElMessage.success('已儲存，可繼續新增下一筆')
    emit('created', (res as { data: { id: number; [k: string]: unknown } }).data)
    const next = emptyVisitForm()
    next.target_school_year = form.value.target_school_year
    next.target_semester = form.value.target_semester
    form.value = next
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

defineExpose({ form, dialogVisible, saving, openDialog, handleSave, handleSaveAndNext })
</script>
