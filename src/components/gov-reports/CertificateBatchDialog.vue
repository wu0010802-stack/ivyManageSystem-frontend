<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import { batchGenerateCertificates } from '@/api/govMoe'
import { getErrorMessage } from '@/utils/errorHandler'
import { todayISO } from '@/utils/format'

// 契約沿用後端 BatchGenerateCertRequest（1~60 位學生，重複自動去重）。
const MAX_STUDENTS = 60

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  generated: []
}>()

interface ClassroomOption {
  id: number
  name: string
}

interface StudentRow {
  id: number
  name: string
  selected: boolean
}

interface ResultItem {
  student_id: number
  name: string
  ok: boolean
  error: string | null
}

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const classroomOptions = ref<ClassroomOption[]>([])
const classroomId = ref<number | null>(null)
const rows = ref<StudentRow[]>([])
const loadingClassrooms = ref(false)
const loadingStudents = ref(false)
const submitting = ref(false)
const resultSummary = ref<{ succeeded: number; failed: number; items: ResultItem[] } | null>(null)

const form = reactive({
  issue_date: todayISO(),
  purpose: '',
  copies: 1,
})

const selectedCount = computed(() => rows.value.filter((r) => r.selected).length)
const allSelected = computed({
  get: () => rows.value.length > 0 && rows.value.every((r) => r.selected),
  set: (v: boolean) => {
    rows.value.forEach((r) => { r.selected = v })
  },
})

async function loadClassrooms(): Promise<void> {
  loadingClassrooms.value = true
  try {
    const { data } = await getClassrooms()
    classroomOptions.value = (data ?? []).map((c) => ({ id: c.id, name: c.name }))
  } catch (err) {
    classroomOptions.value = []
    ElMessage.error(getErrorMessage(err, '載入班級列表失敗'))
  } finally {
    loadingClassrooms.value = false
  }
}

async function loadStudents(cid: number): Promise<void> {
  loadingStudents.value = true
  rows.value = []
  try {
    // is_active 預設在籍；classroom_id 篩定該班——比照後端 batch-generate 對象範圍。
    const { data } = await getStudents({ classroom_id: cid, is_active: true, limit: 500 })
    rows.value = (data.items ?? []).map((s) => ({ id: s.id, name: s.name, selected: true }))
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '載入班級學生失敗'))
  } finally {
    loadingStudents.value = false
  }
}

watch(classroomId, (cid) => {
  if (cid != null) void loadStudents(cid)
  else rows.value = []
})

function resetState(): void {
  classroomId.value = null
  rows.value = []
  form.issue_date = todayISO()
  form.purpose = ''
  form.copies = 1
  resultSummary.value = null
}

// 對話框開啟時重置（immediate 確保 mount 時 modelValue=true 也會跑，比照 BatchOvertimeDialog）
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    resetState()
    if (classroomOptions.value.length === 0) void loadClassrooms()
  },
  { immediate: true },
)

function downloadBatchPdf(base64: string): void {
  const blob = new Blob(
    [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
    { type: 'application/pdf' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `在學證明_批次_${form.issue_date}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

async function submit(): Promise<void> {
  if (!form.purpose.trim()) {
    ElMessage.warning('請填寫申請用途')
    return
  }
  const selectedRows = rows.value.filter((r) => r.selected)
  if (selectedRows.length === 0) {
    ElMessage.warning('請至少選擇一位學生')
    return
  }
  if (selectedRows.length > MAX_STUDENTS) {
    ElMessage.warning(`最多 ${MAX_STUDENTS} 位，請分批送出`)
    return
  }

  submitting.value = true
  resultSummary.value = null
  try {
    const { data } = await batchGenerateCertificates({
      student_ids: selectedRows.map((r) => r.id),
      issue_date: form.issue_date,
      purpose: form.purpose,
      copies: form.copies,
    })

    const nameOf = (sid: number) => rows.value.find((r) => r.id === sid)?.name ?? `#${sid}`
    const items: ResultItem[] = data.results.map((r) => ({
      student_id: r.student_id,
      name: nameOf(r.student_id),
      ok: r.ok,
      error: r.error ?? null,
    }))
    resultSummary.value = { succeeded: data.succeeded, failed: data.failed, items }

    if (data.pdf_base64) downloadBatchPdf(data.pdf_base64)

    if (data.failed === 0) {
      ElMessage.success(`已成功開立 ${data.succeeded} 份在學證明`)
      visible.value = false
      emit('generated')
    } else {
      ElMessage.warning(`部分成功：成功 ${data.succeeded} 份，失敗 ${data.failed} 份`)
      // 部分成功也要讓查詢頁的開立紀錄刷新；對話框留在畫面上顯示失敗清單供使用者檢視。
      if (data.succeeded > 0) emit('generated')
    }
  } catch (err) {
    ElMessage.error(getErrorMessage(err, '批次開立失敗'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="批次開立在學證明" width="640px" top="5vh">
    <el-form label-width="90px">
      <el-form-item label="班級" required>
        <el-select
          v-model="classroomId"
          placeholder="選擇班級"
          filterable
          style="width: 100%"
          :loading="loadingClassrooms"
        >
          <el-option v-for="c in classroomOptions" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="開立日期" required>
        <el-date-picker v-model="form.issue_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
      </el-form-item>
      <el-form-item label="申請用途" required>
        <el-input v-model="form.purpose" maxlength="200" show-word-limit />
      </el-form-item>
      <el-form-item label="份數">
        <el-input-number v-model="form.copies" :min="1" :max="20" />
      </el-form-item>

      <el-divider>選擇學生（在籍）</el-divider>
      <p v-if="classroomId === null" class="dialog-hint">請先選擇班級</p>
      <template v-else>
        <div class="batch-actions">
          <el-checkbox v-model="allSelected" :disabled="rows.length === 0">全選</el-checkbox>
          <span class="text-muted">已選 {{ selectedCount }} / {{ rows.length }} 位（上限 {{ MAX_STUDENTS }}）</span>
        </div>
        <div v-loading="loadingStudents" class="student-list">
          <el-empty v-if="!loadingStudents && rows.length === 0" description="此班級無在籍學生" :image-size="60" />
          <div v-for="row in rows" :key="row.id" class="student-item">
            <el-checkbox v-model="row.selected">{{ row.name }}</el-checkbox>
          </div>
        </div>
      </template>

      <el-alert
        v-if="resultSummary && resultSummary.failed > 0"
        type="warning"
        :closable="false"
        show-icon
        class="result-alert"
      >
        <template #title>成功 {{ resultSummary.succeeded }} 份，失敗 {{ resultSummary.failed }} 份：</template>
        <ul class="result-fail-list">
          <li v-for="item in resultSummary.items.filter((i) => !i.ok)" :key="item.student_id">
            {{ item.name }}：{{ item.error }}
          </li>
        </ul>
      </el-alert>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ resultSummary ? '關閉' : '取消' }}</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">確認開立</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-hint {
  color: var(--text-tertiary);
  margin: 8px 0;
}
.batch-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.text-muted {
  color: var(--text-tertiary);
}
.student-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.student-item {
  padding: 6px 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.result-alert {
  margin-top: 12px;
}
.result-fail-list {
  margin: 6px 0 0;
  padding-left: 18px;
}
</style>
