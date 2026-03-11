<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { getStudents, createStudent, updateStudent, graduateStudent } from '@/api/students'
import { getClassrooms } from '@/api/classrooms'
import { ElMessage } from 'element-plus'
import { Search, Plus, Edit, Delete, Warning } from '@element-plus/icons-vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useCrudDialog, useConfirmDelete } from '@/composables'
import { downloadFile } from '@/utils/download'

const students = ref([])
const classrooms = ref([])
const totalStudents = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const searchQuery = ref('')
const debouncedSearch = ref('')
const activeTab = ref('active')  // 'active' | 'graduated'

// 畢業/轉出 dialog
const graduateDialogVisible = ref(false)
const graduateTarget = ref(null)
const graduateFormRef = ref(null)
const graduateForm = reactive({ graduation_date: '', status: '已畢業' })
const graduateRules = {
  graduation_date: [{ required: true, message: '請選擇離園日期', trigger: 'change' }],
  status: [{ required: true, message: '請選擇類型', trigger: 'change' }]
}
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
  gender: null,
  birthday: '',
  classroom_id: null,
  enrollment_date: '',
  parent_name: '',
  parent_phone: '',
  address: '',
  status_tag: '',
  allergy: '',
  medication: '',
  special_needs: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relation: ''
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
    const response = await getStudents({
      skip,
      limit: pageSize.value,
      is_active: activeTab.value === 'active'
    })
    students.value = response.data.items
    totalStudents.value = response.data.total
  } catch (error) {
    ElMessage.error('載入學生資料失敗')
  } finally {
    loading.value = false
  }
}

const handleTabChange = () => {
  currentPage.value = 1
  fetchStudents()
}

const openGraduateDialog = (row) => {
  graduateTarget.value = row
  graduateForm.graduation_date = ''
  graduateForm.status = '已畢業'
  graduateDialogVisible.value = true
}

const submitGraduate = async () => {
  if (!graduateFormRef.value) return
  await graduateFormRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      await graduateStudent(graduateTarget.value.id, graduateForm)
      ElMessage.success(`已將「${graduateTarget.value.name}」設為${graduateForm.status}`)
      graduateDialogVisible.value = false
      fetchStudents()
    } catch (error) {
      ElMessage.error(error.response?.data?.detail ?? '操作失敗')
    }
  })
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

const classroomName = (id) => classrooms.value.find(c => c.id === id)?.name ?? '-'

const resetForm = () => {
  form.id = null
  form.student_id = ''
  form.name = ''
  form.gender = null
  form.birthday = ''
  form.classroom_id = null
  form.enrollment_date = ''
  form.parent_name = ''
  form.parent_phone = ''
  form.address = ''
  form.status_tag = ''
  form.allergy = ''
  form.medication = ''
  form.special_needs = ''
  form.emergency_contact_name = ''
  form.emergency_contact_phone = ''
  form.emergency_contact_relation = ''
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
          await updateStudent(form.id, form)
        } else {
          await createStudent(form)
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

onMounted(async () => {
  fetchStudents()
  try {
    const res = await getClassrooms()
    classrooms.value = res.data
  } catch {
    ElMessage.error('載入班級資料失敗')
  }
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
      <el-tabs v-model="activeTab" @tab-change="handleTabChange" style="margin-bottom: 0">
        <el-tab-pane label="在讀中" name="active" />
        <el-tab-pane label="已離園" name="graduated" />
      </el-tabs>
      <el-input
        v-model="searchQuery"
        placeholder="搜尋編號、姓名或家長..."
        prefix-icon="Search"
        clearable
        style="width: 300px; margin-top: 12px"
      />
    </div>

    <TableSkeleton v-if="loading && !students.length" :columns="8" />
    <el-table v-else :data="filteredStudents" v-loading="loading" stripe style="width: 100%" max-height="600">
      <el-table-column prop="student_id" label="編號" width="100" sortable />
      <el-table-column label="姓名" width="130" sortable prop="name">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
          <el-tooltip
            v-if="row.allergy || row.medication || row.special_needs"
            placement="top"
            :content="[row.allergy && `過敏：${row.allergy}`, row.medication && `用藥：${row.medication}`, row.special_needs && `特殊需求：${row.special_needs}`].filter(Boolean).join(' ／ ')"
          >
            <el-icon style="color: #e6a23c; margin-left: 4px; vertical-align: middle"><Warning /></el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="性別" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.gender === '男'" type="primary" size="small">男</el-tag>
          <el-tag v-else-if="row.gender === '女'" type="danger" size="small">女</el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="班級" width="120">
        <template #default="{ row }">
          <span>{{ classroomName(row.classroom_id) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="birthday" label="生日" width="120" />
      <el-table-column prop="parent_name" label="家長" width="120" />
      <el-table-column prop="parent_phone" label="電話" width="150" />
      <el-table-column prop="enrollment_date" label="入學日" width="120" sortable />
      <el-table-column v-if="activeTab === 'graduated'" prop="graduation_date" label="離園日" width="120" sortable />
      <el-table-column v-if="activeTab === 'graduated'" label="離園類型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已畢業' ? 'success' : 'warning'" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="activeTab === 'active'" prop="status_tag" label="狀態標籤" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status_tag" size="small">{{ row.status_tag }}</el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="200">
        <template #default="scope">
          <el-button size="small" :icon="Edit" @click="handleEdit(scope.row)">編輯</el-button>
          <el-button
            v-if="activeTab === 'active'"
            size="small"
            type="warning"
            @click="openGraduateDialog(scope.row)"
          >畢業/轉出</el-button>
          <el-button v-if="activeTab === 'active'" size="small" type="danger" :icon="Delete" @click="handleDelete(scope.row)">刪除</el-button>
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
        <el-form-item label="性別" prop="gender">
          <el-radio-group v-model="form.gender">
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生日" prop="birthday">
          <el-date-picker v-model="form.birthday" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="班級" prop="classroom_id">
          <el-select v-model="form.classroom_id" placeholder="選擇班級" clearable style="width: 100%">
            <el-option
              v-for="c in classrooms"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="入學日" prop="enrollment_date">
           <el-date-picker v-model="form.enrollment_date" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="家長姓名" prop="parent_name">
          <el-input v-model="form.parent_name" />
        </el-form-item>
        <el-form-item label="電話" prop="parent_phone">
          <el-input v-model="form.parent_phone" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" type="textarea" :rows="2" />
        </el-form-item>

        <el-divider content-position="left" style="margin: 8px 0 4px">緊急聯絡人</el-divider>
        <el-form-item label="姓名">
          <el-input v-model="form.emergency_contact_name" placeholder="例: 王奶奶" />
        </el-form-item>
        <el-form-item label="電話">
          <el-input v-model="form.emergency_contact_phone" />
        </el-form-item>
        <el-form-item label="關係">
          <el-input v-model="form.emergency_contact_relation" placeholder="例: 祖母、舅舅" />
        </el-form-item>
        <el-form-item label="狀態標籤">
          <el-input v-model="form.status_tag" placeholder="例: 新生、不足齡、特殊生" />
        </el-form-item>

        <el-divider content-position="left" style="margin: 8px 0 4px">健康資訊</el-divider>
        <el-form-item label="過敏原">
          <el-input v-model="form.allergy" type="textarea" :rows="2" placeholder="例: 花生、塵蟎、青黴素" />
        </el-form-item>
        <el-form-item label="用藥說明">
          <el-input v-model="form.medication" type="textarea" :rows="2" placeholder="例: 每日午餐後服用 XXX 1 顆" />
        </el-form-item>
        <el-form-item label="特殊需求">
          <el-input v-model="form.special_needs" type="textarea" :rows="2" placeholder="例: 語言發展遲緩、需輔助進食" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeDialog">取消</el-button>
          <el-button type="primary" @click="submitForm">確認</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 畢業/轉出 Dialog -->
    <el-dialog v-model="graduateDialogVisible" title="設定離園" width="400px">
      <el-form :model="graduateForm" :rules="graduateRules" ref="graduateFormRef" label-width="90px">
        <el-form-item label="學生姓名">
          <span>{{ graduateTarget?.name }}</span>
        </el-form-item>
        <el-form-item label="離園類型" prop="status">
          <el-radio-group v-model="graduateForm.status">
            <el-radio value="已畢業">畢業</el-radio>
            <el-radio value="已轉出">轉出</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="離園日期" prop="graduation_date">
          <el-date-picker
            v-model="graduateForm.graduation_date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="graduateDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="submitGraduate">確認離園</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-section {
  margin-bottom: var(--space-5);
}
</style>
