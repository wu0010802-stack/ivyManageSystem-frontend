<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue'
import {
  createClassroom,
  deleteClassroom,
  getClassroom,
  getClassrooms,
  getGrades,
  getTeacherOptions,
  updateClassroom,
} from '@/api/classrooms'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, RefreshRight } from '@element-plus/icons-vue'
import { useClassroomStore } from '@/stores/classroom'
import { hasPermission } from '@/utils/auth'

const classroomStore = useClassroomStore()
const classrooms = ref([])
const grades = ref([])
const teachers = ref([])
const loading = ref(false)
const detailLoading = ref(false)
const dialogVisible = ref(false)
const formRef = ref(null)
const isEdit = ref(false)
const showInactive = ref(false)
const currentClassroom = ref(null)
const canWrite = hasPermission('CLASSROOMS_WRITE')

const form = reactive({
  id: null,
  name: '',
  class_code: '',
  grade_id: null,
  capacity: 30,
  head_teacher_id: null,
  assistant_teacher_id: null,
  art_teacher_id: null,
  is_active: true,
})

const rules = {
  name: [{ required: true, message: '請輸入班級名稱', trigger: 'blur' }],
  capacity: [{ required: true, message: '請輸入班級容量', trigger: 'change' }],
}

const dialogTitle = computed(() => (isEdit.value ? '編輯班級' : '新增班級'))

const resetForm = () => {
  form.id = null
  form.name = ''
  form.class_code = ''
  form.grade_id = null
  form.capacity = 30
  form.head_teacher_id = null
  form.assistant_teacher_id = null
  form.art_teacher_id = null
  form.is_active = true
  currentClassroom.value = null
}

const fetchClassrooms = async () => {
  loading.value = true
  try {
    const response = await getClassrooms({ include_inactive: showInactive.value })
    classrooms.value = response.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級資料失敗')
  } finally {
    loading.value = false
  }
}

const fetchOptions = async () => {
  try {
    const [gradesRes, teachersRes] = await Promise.all([
      getGrades(),
      getTeacherOptions(),
    ])
    grades.value = gradesRes.data
    teachers.value = teachersRes.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級選項失敗')
  }
}

const populateForm = (data) => {
  form.id = data.id
  form.name = data.name || ''
  form.class_code = data.class_code || ''
  form.grade_id = data.grade_id || null
  form.capacity = data.capacity || 30
  form.head_teacher_id = data.head_teacher_id || null
  form.assistant_teacher_id = data.assistant_teacher_id || null
  form.art_teacher_id = data.art_teacher_id || null
  form.is_active = data.is_active ?? true
}

const openCreate = async () => {
  resetForm()
  isEdit.value = false
  await fetchOptions()
  dialogVisible.value = true
}

const openEdit = async (classroom) => {
  detailLoading.value = true
  try {
    await fetchOptions()
    const response = await getClassroom(classroom.id)
    currentClassroom.value = response.data
    populateForm(response.data)
    isEdit.value = true
    dialogVisible.value = true
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級詳情失敗')
  } finally {
    detailLoading.value = false
  }
}

const closeDialog = () => {
  dialogVisible.value = false
}

const submitForm = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    const payload = {
      name: form.name,
      class_code: form.class_code || null,
      grade_id: form.grade_id,
      capacity: form.capacity,
      head_teacher_id: form.head_teacher_id,
      assistant_teacher_id: form.assistant_teacher_id,
      art_teacher_id: form.art_teacher_id,
      is_active: form.is_active,
    }

    try {
      if (isEdit.value) {
        await updateClassroom(form.id, payload)
      } else {
        await createClassroom(payload)
      }
      ElMessage.success(isEdit.value ? '班級更新成功' : '班級新增成功')
      closeDialog()
      await fetchClassrooms()
      await classroomStore.refresh()
    } catch (error) {
      ElMessage.error(error.response?.data?.detail || '操作失敗')
    }
  })
}

const handleDelete = async (classroom) => {
  try {
    await ElMessageBox.confirm(
      `確定要停用「${classroom.name}」嗎？`,
      '確認停用',
      {
        confirmButtonText: '停用',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )

    await deleteClassroom(classroom.id)
    ElMessage.success('班級已停用')
    await fetchClassrooms()
    await classroomStore.refresh()
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error.response?.data?.detail || '停用失敗')
  }
}

watch(showInactive, () => {
  fetchClassrooms()
})

onMounted(async () => {
  await fetchClassrooms()
})
</script>

<template>
  <div class="classroom-page">
    <div class="page-header">
      <h2>班級管理</h2>
      <div class="header-actions">
        <el-switch
          v-model="showInactive"
          inline-prompt
          active-text="顯示停用"
          inactive-text="僅顯示啟用"
        />
        <el-button :icon="RefreshRight" @click="fetchClassrooms">重新整理</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新增班級</el-button>
      </div>
    </div>

    <div class="classroom-grid" v-if="classrooms.length > 0" v-loading="loading">
      <el-card
        v-for="classroom in classrooms"
        :key="classroom.id"
        class="classroom-card"
        shadow="hover"
        @click="openEdit(classroom)"
      >
        <template #header>
          <div class="card-header">
            <div class="header-title">
              <span>{{ classroom.name }}</span>
              <el-tag v-if="!classroom.is_active" type="info" size="small">已停用</el-tag>
            </div>
            <el-tag size="small" :type="classroom.is_active ? 'success' : 'info'">
              {{ classroom.grade_name || '未設定年級' }}
            </el-tag>
          </div>
        </template>

        <div class="card-content">
          <p><strong>班級代號:</strong> {{ classroom.class_code || '-' }}</p>
          <p><strong>學生人數:</strong> {{ classroom.current_count }} / {{ classroom.capacity }}</p>

          <div class="teacher-info">
            <p v-if="classroom.head_teacher_name">👩‍🏫 {{ classroom.head_teacher_name }}</p>
            <p v-else class="text-muted">未指派班導師</p>
            <p v-if="classroom.assistant_teacher_name">👨‍🏫 {{ classroom.assistant_teacher_name }}</p>
            <p v-if="classroom.art_teacher_name">🎨 {{ classroom.art_teacher_name }}</p>
          </div>

          <div class="card-actions" v-if="canWrite">
            <el-button size="small" :icon="Edit" @click.stop="openEdit(classroom)">編輯</el-button>
            <el-button
              v-if="classroom.is_active"
              size="small"
              type="danger"
              plain
              :icon="Delete"
              @click.stop="handleDelete(classroom)"
            >
              停用
            </el-button>
          </div>
        </div>
      </el-card>
    </div>
    <el-empty v-else description="尚無班級資料" />

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px">
      <div v-loading="detailLoading">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="班級名稱" prop="name">
                <el-input v-model="form.name" :disabled="!canWrite" placeholder="例如：向日葵班" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="班級代號">
                <el-input v-model="form.class_code" :disabled="!canWrite" placeholder="例如：SUN-01" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="年級">
                <el-select v-model="form.grade_id" :disabled="!canWrite" placeholder="選擇年級" clearable style="width: 100%">
                  <el-option v-for="grade in grades" :key="grade.id" :label="grade.name" :value="grade.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="班級容量" prop="capacity">
                <el-input-number v-model="form.capacity" :disabled="!canWrite" :min="1" :max="200" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item v-if="isEdit" label="啟用狀態">
            <el-switch v-model="form.is_active" :disabled="!canWrite" inline-prompt active-text="啟用" inactive-text="停用" />
          </el-form-item>

          <h4>教師指派</h4>
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="班導師" label-width="90px">
                <el-select v-model="form.head_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="teacher.name" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="副班導" label-width="90px">
                <el-select v-model="form.assistant_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="teacher.name" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="美術老師" label-width="90px">
                <el-select v-model="form.art_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="teacher.name" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <div v-if="isEdit && currentClassroom" class="detail-section">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="班級名稱">{{ currentClassroom.name }}</el-descriptions-item>
            <el-descriptions-item label="年級">{{ currentClassroom.grade_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="學生人數">{{ currentClassroom.current_count }}</el-descriptions-item>
          </el-descriptions>

          <h4 style="margin-top: 20px;">學生名單</h4>
          <div class="student-list">
            <el-tag
              v-for="student in currentClassroom.students"
              :key="student.id"
              class="student-tag"
              :type="student.gender === 'male' ? 'primary' : 'danger'"
              effect="plain"
            >
              {{ student.name }}
            </el-tag>
            <p v-if="!currentClassroom.students || currentClassroom.students.length === 0" class="text-muted">
              尚無學生
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button v-if="canWrite" type="primary" @click="submitForm">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.header-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.classroom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

.classroom-card {
  cursor: pointer;
  transition: transform var(--transition-base);
}

.classroom-card:hover {
  transform: translateY(-5px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.teacher-info p {
  margin: 0 0 6px;
  font-size: 0.9em;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.detail-section {
  margin-top: var(--space-5);
}

.text-muted {
  color: #909399;
}

.student-list {
  display: flex;
  flex-wrap: wrap;
}

.student-tag {
  margin-right: 5px;
  margin-bottom: 5px;
}

@media (max-width: 767px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    flex-wrap: wrap;
  }
}
</style>
