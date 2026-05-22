<template>
  <div class="academic-terms-tab">
    <div class="toolbar">
      <el-button type="primary" size="small" class="add-btn" @click="openCreate">新增學期</el-button>
    </div>

    <el-table :data="terms" v-loading="loading" border>
      <el-table-column prop="school_year" label="學年" width="100" />
      <el-table-column label="學期" width="100">
        <template #default="{ row }">{{ row.semester === 1 ? '上' : '下' }}</template>
      </el-table-column>
      <el-table-column prop="start_date" label="開學日" />
      <el-table-column prop="end_date" label="結束日" />
      <el-table-column label="動作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="confirmDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogOpen"
      :title="dialogMode === 'create' ? '新增學期' : '編輯學期'"
      class="term-edit-dialog"
    >
      <el-form label-position="top">
        <el-form-item label="學年（民國）">
          <el-input-number v-model="dialogForm.school_year" :min="100" :max="200" />
        </el-form-item>
        <el-form-item label="學期">
          <el-select v-model="dialogForm.semester">
            <el-option :value="1" label="上學期" />
            <el-option :value="2" label="下學期" />
          </el-select>
        </el-form-item>
        <el-form-item label="開學日">
          <el-date-picker v-model="dialogForm.start_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="結束日">
          <el-date-picker v-model="dialogForm.end_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button
          v-if="dialogMode === 'create'"
          type="primary"
          class="confirm-create-btn"
          @click="onCreate"
        >新增</el-button>
        <el-button
          v-else
          type="primary"
          class="confirm-update-btn"
          @click="onUpdate"
        >更新</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  ElButton,
  ElTable,
  ElTableColumn,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElDatePicker,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import {
  listAcademicTerms,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
} from '@/api/academicTerms'
import type { ApiBody } from '@/api/_generated/typed'

type TermPayload = ApiBody<'/academic-terms', 'post'>

interface AcademicTermRow extends TermPayload {
  id: number
}

const terms = ref<AcademicTermRow[]>([])
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    const resp = await listAcademicTerms()
    terms.value = (resp.data as AcademicTermRow[]) ?? []
  } finally {
    loading.value = false
  }
}

const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const dialogForm = ref<TermPayload>({
  school_year: 115,
  semester: 1,
  start_date: '',
  end_date: '',
})

defineExpose({ dialogForm })

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  dialogForm.value = { school_year: 115, semester: 1, start_date: '', end_date: '' }
  dialogOpen.value = true
}

function openEdit(row: AcademicTermRow) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  dialogForm.value = { school_year: row.school_year, semester: row.semester, start_date: row.start_date, end_date: row.end_date }
  dialogOpen.value = true
}

async function onCreate() {
  try {
    await createAcademicTerm(dialogForm.value)
    ElMessage.success('已新增')
    dialogOpen.value = false
    await refresh()
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { detail?: string } } }
    const msg =
      e?.response?.status === 409
        ? (e.response?.data?.detail ?? '已存在相同學年/學期')
        : '新增失敗'
    ElMessage.error(msg)
  }
}

async function onUpdate() {
  if (editingId.value == null) return
  try {
    await updateAcademicTerm(editingId.value, dialogForm.value)
    ElMessage.success('已更新')
    dialogOpen.value = false
    await refresh()
  } catch {
    ElMessage.error('更新失敗')
  }
}

async function confirmDelete(row: AcademicTermRow) {
  try {
    await ElMessageBox.confirm(
      `刪除此學期會讓 scheduler 失去推進觸發點，確定？\n${row.school_year} 學年 ${row.semester === 1 ? '上' : '下'}學期`,
      '刪除確認',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteAcademicTerm(row.id)
    ElMessage.success('已刪除')
    await refresh()
  } catch {
    ElMessage.error('刪除失敗')
  }
}

onMounted(refresh)
</script>

<style scoped>
.academic-terms-tab {
  padding: 16px 0;
}
.toolbar {
  margin-bottom: 12px;
}
</style>
