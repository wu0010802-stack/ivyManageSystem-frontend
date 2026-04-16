<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getStudents, createStudent, updateStudent, graduateStudent, bulkTransferStudents } from '@/api/students'
import { getClassrooms } from '@/api/classrooms'
import { createDismissalCall, getDismissalCalls } from '@/api/dismissalCalls'
import { ElMessage } from 'element-plus'
import { Search, Plus, Edit, Delete, Warning, Van } from '@element-plus/icons-vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useCrudDialog, useConfirmDelete } from '@/composables'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'
import { getCurrentAcademicTerm, normalizeSchoolYear, buildSchoolYearOptions } from '@/utils/academic'
import { STUDENT_STATUS_TAG_OPTIONS } from '@/utils/student'
import BonusImpactPreview from '@/components/students/BonusImpactPreview.vue'

const route = useRoute()
const router = useRouter()
const students = ref([])
const classrooms = ref([])
const totalStudents = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const selectedStudents = ref([])
const searchQuery = ref('')
const debouncedSearch = ref('')
const activeTab = ref('active')  // 'active' | 'graduated'
const transferDialogVisible = ref(false)
const transferTargetClassroomId = ref(null)
const transferSourceClassroomId = computed(() => {
  if (!selectedStudents.value.length) return null
  return selectedStudents.value[0].classroom_id ?? null
})
const showAllClassrooms = ref(false)
const handledRouteActionKey = ref('')

const currentAcademicTerm = getCurrentAcademicTerm()
const filterSchoolYear = ref(currentAcademicTerm.school_year)
const filterSemester = ref(currentAcademicTerm.semester)
const filterClassroomId = ref(null)
const semesterOptions = [
  { label: '上學期（8 月 - 1 月）', value: 1 },
  { label: '下學期（2 月 - 7 月）', value: 2 },
]

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
onUnmounted(() => {
  if (_searchTimer) clearTimeout(_searchTimer)
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

const schoolYearOptions = computed(() => {
  const years = new Set(buildSchoolYearOptions(currentAcademicTerm.school_year))
  classrooms.value.forEach((item) => item.school_year && years.add(Number(item.school_year)))
  years.add(normalizeSchoolYear(filterSchoolYear.value))
  return Array.from(years).sort((a, b) => b - a)
})

const classroomLabel = (classroom) => {
  if (!classroom) return '-'
  return `${classroom.name}｜${classroom.semester_label || '-'}｜${classroom.grade_name || '未設定年級'}`
}

const filteredClassroomOptions = computed(() => {
  if (showAllClassrooms.value) return classrooms.value
  return classrooms.value.filter((item) => (
    item.school_year === normalizeSchoolYear(filterSchoolYear.value)
    && item.semester === filterSemester.value
  ))
})

const dialogClassroomOptions = computed(() => {
  const options = [...filteredClassroomOptions.value]
  if (
    form.classroom_id
    && !options.some((item) => item.id === form.classroom_id)
  ) {
    const selected = classrooms.value.find((item) => item.id === form.classroom_id)
    if (selected) options.push(selected)
  }
  return options
})

watch(debouncedSearch, () => {
  currentPage.value = 1
  fetchStudents()
})

const exportStudents = () => {
  downloadFile('/exports/students', '學生名冊.xlsx')
}

// 接送通知：有 pending/acknowledged 通知的學生 ID 集合
const activeCallStudentIds = ref(new Set())

const fetchActiveCallIds = async () => {
  try {
    const res = await getDismissalCalls({ status: undefined })
    const activeIds = new Set(
      (res.data || [])
        .filter(c => c.status === 'pending' || c.status === 'acknowledged')
        .map(c => c.student_id)
    )
    activeCallStudentIds.value = activeIds
  } catch {
    // silent
  }
}

const fetchStudents = async () => {
  loading.value = true
  try {
    const skip = (currentPage.value - 1) * pageSize.value
    const response = await getStudents({
      skip,
      limit: pageSize.value,
      is_active: activeTab.value === 'active',
      school_year: normalizeSchoolYear(filterSchoolYear.value),
      semester: filterSemester.value,
      classroom_id: filterClassroomId.value || undefined,
      search: debouncedSearch.value || undefined,
    })
    students.value = response.data.items
    totalStudents.value = response.data.total
    if (activeTab.value === 'active') {
      fetchActiveCallIds()
    }
  } catch (error) {
    ElMessage.error('載入學生資料失敗')
  } finally {
    loading.value = false
  }
}

const handleNotifyDismissal = async (row) => {
  if (!row.classroom_id) {
    ElMessage.warning('此學生尚未分班，無法發送接送通知')
    return
  }
  try {
    await createDismissalCall({
      student_id: row.id,
      classroom_id: row.classroom_id,
    })
    ElMessage.success(`已通知 ${row.name} 的班級老師`)
    fetchActiveCallIds()
  } catch (error) {
    ElMessage.error(apiError(error, '通知失敗'))
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
      ElMessage.error(apiError(error, '操作失敗'))
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

const classroomName = (id) => classroomLabel(classrooms.value.find(c => c.id === id))
const handleSelectionChange = (rows) => {
  selectedStudents.value = rows
}
const openTransferDialog = () => {
  transferTargetClassroomId.value = null
  transferDialogVisible.value = true
}
const submitTransfer = async () => {
  if (!selectedStudents.value.length) return
  if (!transferTargetClassroomId.value) {
    ElMessage.warning('請先選擇目標班級')
    return
  }
  try {
    await bulkTransferStudents({
      student_ids: selectedStudents.value.map((student) => student.id),
      target_classroom_id: transferTargetClassroomId.value,
    })
    ElMessage.success('學生轉班成功')
    transferDialogVisible.value = false
    selectedStudents.value = []
    fetchStudents()
  } catch (error) {
    ElMessage.error(apiError(error, '轉班失敗'))
  }
}

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

const { confirmDelete: handleDelete, deleting: deleteLoading } = useConfirmDelete({
  endpoint: '/students',
  onSuccess: fetchStudents,
  successMsg: '刪除成功',
})

const applyRouteContext = () => {
  const parsedSemester = Number(route.query.semester)
  const parsedClassroomId = Number(route.query.classroom_id)
  filterSchoolYear.value = normalizeSchoolYear(route.query.school_year)
  filterSemester.value = [1, 2].includes(parsedSemester) ? parsedSemester : currentAcademicTerm.semester
  filterClassroomId.value = Number.isFinite(parsedClassroomId) ? parsedClassroomId : null
  showAllClassrooms.value = route.query.show_all === '1'
}

const clearRouteAction = async () => {
  if (!route.query.action) return
  const nextQuery = { ...route.query }
  delete nextQuery.action
  await router.replace({ query: nextQuery })
}

const handleRouteAction = async () => {
  const actionKey = JSON.stringify(route.query)
  if (handledRouteActionKey.value === actionKey) return

  if (route.query.action === 'create' && route.query.classroom_id) {
    handleAdd()
    form.classroom_id = Number(route.query.classroom_id)
    handledRouteActionKey.value = actionKey
    await clearRouteAction()
    return
  }

  if (route.query.action === 'transfer' && route.query.classroom_id && activeTab.value === 'active') {
    selectedStudents.value = students.value.filter((student) => student.classroom_id === Number(route.query.classroom_id))
    if (selectedStudents.value.length > 0) {
      transferTargetClassroomId.value = null
      transferDialogVisible.value = true
    } else {
      ElMessage.warning('目前班級沒有可轉班的在讀學生')
    }
    handledRouteActionKey.value = actionKey
    await clearRouteAction()
    return
  }

  handledRouteActionKey.value = actionKey
}

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
        const detail = error.response?.data?.detail
        const msg = Array.isArray(detail)
          ? detail.map(e => e.msg).join('；')
          : (detail ?? '操作失敗')
        ElMessage.error(msg)
      }
    }
  })
}

const loadClassrooms = async () => {
  try {
    const res = await getClassrooms({ current_only: false })
    classrooms.value = res.data
  } catch {
    ElMessage.error('載入班級資料失敗')
  }
}

let _applyingRoute = false

watch([filterSchoolYear, filterSemester, filterClassroomId], () => {
  if (_applyingRoute) return
  currentPage.value = 1
  fetchStudents()
})

watch(
  () => route.query,
  async () => {
    _applyingRoute = true
    applyRouteContext()
    await nextTick()
    _applyingRoute = false
    await fetchStudents()
    await handleRouteAction()
  },
)

onMounted(async () => {
  applyRouteContext()
  await loadClassrooms()
  await fetchStudents()
  await handleRouteAction()
})
</script>

<template>
  <div class="student-page">
    <div class="page-header">
      <h2>學生管理</h2>
      <div class="header-actions">
        <el-button type="success" @click="exportStudents">匯出 Excel</el-button>
        <el-button
          v-if="activeTab === 'active'"
          plain
          :disabled="selectedStudents.length === 0"
          @click="openTransferDialog"
        >
          批次轉班
        </el-button>
        <el-button type="primary" :icon="Plus" @click="handleAdd">新增學生</el-button>
      </div>
    </div>

    <div class="filter-section">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange" style="margin-bottom: 0">
        <el-tab-pane label="在讀中" name="active" />
        <el-tab-pane label="已離園" name="graduated" />
      </el-tabs>
      <div class="filter-toolbar">
        <el-select v-model="filterSchoolYear" filterable allow-create default-first-option style="width: 150px">
          <el-option
            v-for="year in schoolYearOptions"
            :key="year"
            :label="`${year}學年度`"
            :value="year"
          />
        </el-select>
        <el-select v-model="filterSemester" style="width: 190px">
          <el-option
            v-for="option in semesterOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-select v-model="filterClassroomId" clearable placeholder="全部班級" style="width: 300px">
          <el-option
            v-for="classroom in filteredClassroomOptions"
            :key="classroom.id"
            :label="classroomLabel(classroom)"
            :value="classroom.id"
          />
        </el-select>
        <el-switch
          v-model="showAllClassrooms"
          inline-prompt
          active-text="全部學期"
          inactive-text="本學期"
        />
        <el-input
          v-model="searchQuery"
          placeholder="搜尋編號、姓名或家長..."
          :prefix-icon="Search"
          clearable
          style="width: 300px"
        />
      </div>
    </div>

    <TableSkeleton v-if="loading && !students.length" :columns="8" />
    <el-table
      v-else
      :data="students"
      v-loading="loading"
      stripe
      style="width: 100%"
      max-height="600"
      @selection-change="handleSelectionChange"
    >
      <el-table-column v-if="activeTab === 'active'" type="selection" width="48" />
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
      <el-table-column label="操作" min-width="260">
        <template #default="scope">
          <el-button size="small" :icon="Edit" @click="handleEdit(scope.row)">編輯</el-button>
          <el-button
            v-if="activeTab === 'active'"
            size="small"
            type="primary"
            :icon="Van"
            :disabled="activeCallStudentIds.has(scope.row.id)"
            @click="handleNotifyDismissal(scope.row)"
          >{{ activeCallStudentIds.has(scope.row.id) ? '已通知' : '通知放學' }}</el-button>
          <el-button
            v-if="activeTab === 'active'"
            size="small"
            type="warning"
            @click="openGraduateDialog(scope.row)"
          >畢業/轉出</el-button>
          <el-button v-if="activeTab === 'active'" size="small" type="danger" :icon="Delete" @click="handleDelete(scope.row)" :loading="deleteLoading">刪除</el-button>
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
              v-for="c in dialogClassroomOptions"
              :key="c.id"
              :label="classroomLabel(c)"
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
          <el-select
            v-model="form.status_tag"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="選擇或輸入標籤"
            style="width: 100%"
          >
            <el-option
              v-for="tag in STUDENT_STATUS_TAG_OPTIONS"
              :key="tag"
              :label="tag"
              :value="tag"
            />
          </el-select>
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
      <BonusImpactPreview
        v-if="!isEdit && form.classroom_id"
        operation="add"
        :classroom-id="form.classroom_id"
      />
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
      <BonusImpactPreview
        v-if="graduateTarget?.classroom_id"
        operation="graduate"
        :source-classroom-id="graduateTarget.classroom_id"
      />
      <template #footer>
        <el-button @click="graduateDialogVisible = false">取消</el-button>
        <el-button type="warning" @click="submitGraduate">確認離園</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialogVisible" title="批次轉班" width="420px">
      <el-form label-width="100px">
        <el-form-item label="已選學生">
          <span>{{ selectedStudents.length }} 位</span>
        </el-form-item>
        <el-form-item label="目標班級">
          <el-select v-model="transferTargetClassroomId" placeholder="選擇班級" style="width: 100%">
            <el-option
              v-for="c in filteredClassroomOptions"
              :key="c.id"
              :label="classroomLabel(c)"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <BonusImpactPreview
        v-if="transferTargetClassroomId"
        operation="transfer"
        :classroom-id="transferTargetClassroomId"
        :source-classroom-id="transferSourceClassroomId"
        :student-count="selectedStudents.length"
      />
      <template #footer>
        <el-button @click="transferDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitTransfer">確認轉班</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-section {
  margin-bottom: var(--space-5);
}

.filter-toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12px;
}
</style>
