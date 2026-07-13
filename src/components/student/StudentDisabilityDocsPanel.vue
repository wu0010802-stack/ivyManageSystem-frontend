<template>
  <div class="disability-docs-panel">
    <div class="panel-header">
      <h4>鑑定文件 / IEP / 評估報告</h4>
      <el-button type="primary" size="small" @click="openAdd">新增</el-button>
    </div>

    <el-empty v-if="!loading && docs.length === 0" description="尚無鑑定文件" />

    <el-table v-else :data="docs" size="small" style="margin-top: 12px">
      <el-table-column prop="doc_type" label="類型" width="120" />
      <el-table-column prop="file_path" label="檔案" />
      <el-table-column prop="issued_date" label="開立日" width="130" />
      <el-table-column prop="expiry_date" label="到期日" width="130" />
      <el-table-column prop="notes" label="備註" show-overflow-tooltip />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" link @click="openEdit(row)">編輯</el-button>
          <el-button size="small" link type="danger" @click="confirmDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Add/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '編輯文件' : '新增文件'" width="520px">
      <el-form :model="formData" label-width="100px">
        <el-form-item label="類型">
          <el-select v-model="formData.doc_type">
            <el-option label="鑑定證明" value="鑑定證明" />
            <el-option label="身障手冊" value="身障手冊" />
            <el-option label="IEP" value="IEP" />
            <el-option label="評估報告" value="評估報告" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="檔案路徑">
          <el-input v-model="formData.file_path" placeholder="/uploads/..." />
        </el-form-item>
        <el-form-item label="開立日">
          <el-date-picker v-model="formData.issued_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="到期日">
          <el-date-picker v-model="formData.expiry_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="formData.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSave">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as govMoe from '@/api/govMoe'

const props = defineProps<{ studentId: number }>()

const loading = ref(false)
const docs = ref<Record<string, unknown>[]>([])
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const formData = ref<{
  doc_type: string
  file_path: string
  issued_date: string | null
  expiry_date: string | null
  notes: string
}>({
  doc_type: '鑑定證明',
  file_path: '',
  issued_date: null,
  expiry_date: null,
  notes: '',
})

async function load() {
  loading.value = true
  try {
    const { data } = await govMoe.listDisabilityDocs(props.studentId)
    docs.value = data || []
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingId.value = null
  formData.value = { doc_type: '鑑定證明', file_path: '', issued_date: null, expiry_date: null, notes: '' }
  dialogVisible.value = true
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = row.id as number
  formData.value = { ...(row as typeof formData.value) }
  dialogVisible.value = true
}

async function onSave() {
  const payload = { student_id: props.studentId, ...formData.value }
  if (editingId.value) {
    await govMoe.updateDisabilityDoc(editingId.value, payload)
    ElMessage.success('已更新')
  } else {
    await govMoe.createDisabilityDoc(payload)
    ElMessage.success('已新增')
  }
  dialogVisible.value = false
  await load()
}

async function confirmDelete(row: Record<string, unknown>) {
  await ElMessageBox.confirm(`確認刪除「${row.doc_type}」？`, '提醒', { type: 'warning' })
  await govMoe.deleteDisabilityDoc(row.id as number)
  ElMessage.success('已刪除')
  await load()
}

watch(() => props.studentId, load, { immediate: true })
</script>

<style scoped>
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.panel-header h4 {
  margin: 0;
}
</style>
