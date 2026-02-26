<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import api from '@/api'
import { ElMessage } from 'element-plus'
import { Search, Plus, Edit, Delete } from '@element-plus/icons-vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useCrudDialog, useConfirmDelete } from '@/composables'
import { downloadFile } from '@/utils/download'

const students = ref([])
const totalStudents = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const searchQuery = ref('')
const debouncedSearch = ref('')
let _searchTimer = null
watch(searchQuery, (val) => {
  clearTimeout(_searchTimer)
  _searchTimer = setTimeout(() => { debouncedSearch.value = val }, 300)
})
const formRef = ref(null)

const form = reactive({
  id: null,
  student_id: '',
  name: '',
  birthday: '',
  enrollment_date: '',
  parent_name: '',
  phone: '',
  address: '',
  status_tag: ''
})

const rules = {
  student_id: [{ required: true, message: '請輸入學生編號', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }]
}

const filteredStudents = computed(() => {
  if (!debouncedSearch.value) return students.value
  const lowerQuery = debouncedSearch.value.toLowerCase()
  return students.value.filter(s =>
    s.name.toLowerCase().includes(lowerQuery) ||
    s.student_id.toLowerCase().includes(lowerQuery) ||
    (s.parent_name && s.parent_name.toLowerCase().includes(lowerQuery))
  )
})

const exportStudents = () => {
  downloadFile('/exports/students', '學生名冊.xlsx')
}

const fetchStudents = async () => {
  loading.value = true
  try {
    const skip = (currentPage.value - 1) * pageSize.value
    const response = await api.get('/students', {
      params: { skip, limit: pageSize.value },
    })
    students.value = response.data.items
    totalStudents.value = response.data.total
  } catch (error) {
    ElMessage.error('載入學生資料失敗')
  } finally {
    loading.value = false
  }
}

const handlePageChange = (page) => {
  currentPage.value = page
  fetchStudents()
}

const handleSizeChange = (size) => {
  pageSize.value = size
  currentPage.value = 1
  fetchStudents()
}

const resetForm = () => {
  form.id = null
  form.student_id = ''
  form.name = ''
  form.birthday = ''
  form.enrollment_date = ''
  form.parent_name = ''
  form.phone = ''
  form.address = ''
  form.status_tag = ''
}

const populateForm = (row) => {
  Object.assign(form, row)
}

const { dialogVisible, isEdit, openCreate: handleAdd, openEdit: handleEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

const { confirmDelete: handleDelete } = useConfirmDelete({
  endpoint: '/students',
  onSuccess: fetchStudents,
  successMsg: '刪除成功',
})

const submitForm = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        if (isEdit.value) {
          await api.put(`/students/${form.id}`, form)
        } else {
          await api.post('/students', form)
        }
        ElMessage.success(isEdit.value ? '更新成功' : '新增成功')
        closeDialog()
        fetchStudents()
      } catch (error) {
        ElMessage.error('操作失敗')
      }
    }
  })
}

onMounted(() => {
  fetchStudents()
})
</script>

<template>
  <div class="student-page">
    <div class="page-header">
      <h2>學生管理</h2>
      <div class="header-actions">
        <el-button type="success" @click="exportStudents">匯出 Excel</el-button>
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增學生</el-button>
      </div>
    </div>

    <div class="filter-section">
      <el-input
        v-model="searchQuery"
        placeholder="搜尋編號、姓名或家長..."
        prefix-icon="Search"
        clearable
        style="width: 300px"
      />
    </div>

    <TableSkeleton v-if="loading && !students.length" :columns="8" />
    <el-table v-else :data="filteredStudents" v-loading="loading" stripe style="width: 100%" max-height="600">
      <el-table-column prop="student_id" label="編號" width="100" sortable />
      <el-table-column prop="name" label="姓名" width="120" sortable />
      <el-table-column prop="birthday" label="生日" width="120" />
      <el-table-column prop="parent_name" label="家長" width="120" />
      <el-table-column prop="phone" label="電話" width="150" />
      <el-table-column prop="enrollment_date" label="入學日" width="120" sortable />
      <el-table-column prop="status_tag" label="狀態標籤" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status_tag" size="small">{{ row.status_tag }}</el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="150">
        <template #default="scope">
          <el-button size="small" :icon="Edit" @click="handleEdit(scope.row)">編輯</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(scope.row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="totalStudents > pageSize"
      style="margin-top: 16px; justify-content: flex-end;"
      background
      layout="total, sizes, prev, pager, next"
      :total="totalStudents"
      :page-size="pageSize"
      :current-page="currentPage"
      :page-sizes="[20, 50, 100]"
      @current-change="handlePageChange"
      @size-change="handleSizeChange"
    />

    <!-- Add/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '編輯學生' : '新增學生'"
      width="500px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="學生編號" prop="student_id">
          <el-input v-model="form.student_id" placeholder="例: S001" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="生日" prop="birthday">
          <el-date-picker v-model="form.birthday" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="入學日" prop="enrollment_date">
           <el-date-picker v-model="form.enrollment_date" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="家長姓名" prop="parent_name">
          <el-input v-model="form.parent_name" />
        </el-form-item>
        <el-form-item label="電話" prop="phone">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="狀態標籤">
          <el-input v-model="form.status_tag" placeholder="例: 新生、不足齡、特殊生" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeDialog">取消</el-button>
          <el-button type="primary" @click="submitForm">確認</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-section {
  margin-bottom: var(--space-5);
}
</style>
