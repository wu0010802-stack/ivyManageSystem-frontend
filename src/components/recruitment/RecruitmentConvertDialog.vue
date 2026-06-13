<!-- src/components/recruitment/RecruitmentConvertDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="轉為正式學生"
    width="520px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-alert
      v-if="visit"
      :title="`訪視紀錄：${visit.child_name}（${visit.grade || '未指定年級'}，${visit.phone || '未留電話'}）`"
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
    />
    <el-alert
      v-if="visit?.enrolled"
      type="warning"
      title="此訪視已標記為已報到，重複轉化將被後端拒絕"
      :closable="false"
      style="margin-bottom: 12px"
    />
    <el-alert
      type="info"
      title="學籍編號由系統自動配發；性別與其他資料可於轉化後到學生檔案補齊"
      :closable="false"
      style="margin-bottom: 12px"
    />

    <el-form label-width="110px">
      <el-form-item label="分班">
        <el-select
          v-model="form.classroom_id"
          placeholder="可留空"
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="c in classroomOptions"
            :key="c.id"
            :label="`${c.name}（${c.school_year}-${c.semester}）`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">確認轉化</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { transitionVisit } from '@/api/recruitmentFunnel'

interface ClassroomOption { id: number; name: string; [key: string]: unknown }
interface Visit { id: number | string; [key: string]: unknown }

const props = withDefaults(defineProps<{
  modelValue?: boolean
  visit?: Visit | null
  classroomOptions?: ClassroomOption[]
}>(), {
  modelValue: false,
  visit: null,
  classroomOptions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'converted': [data: Record<string, unknown>]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<{ classroom_id: number | null }>({ classroom_id: null })
const submitting = ref(false)

function resetForm() {
  form.classroom_id = null
}

watch(
  () => props.visit,
  () => resetForm(),
)

async function handleSubmit() {
  if (!props.visit) return
  submitting.value = true
  try {
    const { data } = await transitionVisit(Number(props.visit.id), {
      to_stage: 'enrolled',
      classroom_id: form.classroom_id ?? undefined,
    })
    ElMessage.success('已成功轉為正式學生')
    emit('converted', data as unknown as Record<string, unknown>)
    visible.value = false
  } catch (err) {
    ElMessage.error((err as { displayMessage?: string }).displayMessage || '轉化失敗')
  } finally {
    submitting.value = false
  }
}

defineExpose({ form, handleSubmit })
</script>
