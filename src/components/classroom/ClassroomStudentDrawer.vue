<script setup>
import { ref, computed } from 'vue'
import { Delete, Edit, Plus, SwitchButton, Search, Warning } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { useConfirmDelete } from '@/composables'
import StudentCrudDialog from './StudentCrudDialog.vue'
import GraduateDialog from './GraduateDialog.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  classroom: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'student-updated'])

const canWriteStudents = hasPermission('STUDENTS_WRITE')

const studentSearch = ref('')
const studentGenderFilter = ref('')
const studentDialogVisible = ref(false)
const isStudentEdit = ref(false)
const currentStudentData = ref(null)
const graduateDialogVisible = ref(false)
const graduateTarget = ref(null)

const showInactive = ref(false)

// is_active = null 也算在讀（與後端邏輯一致）
const activeStudents = computed(() =>
  (props.classroom?.students || []).filter((s) => s.is_active !== false),
)
const inactiveStudents = computed(() =>
  (props.classroom?.students || []).filter((s) => s.is_active === false),
)

const visibleStudents = computed(() => {
  const base = showInactive.value
    ? (props.classroom?.students || [])
    : activeStudents.value
  return base.filter((s) => {
    const matchSearch = !studentSearch.value
      || s.name.includes(studentSearch.value)
      || s.student_id?.includes(studentSearch.value)
    const matchGender = !studentGenderFilter.value || s.gender === studentGenderFilter.value
    return matchSearch && matchGender
  })
})

// 相容舊程式碼（template 中仍用 filteredStudents）
const filteredStudents = visibleStudents

const studentStats = computed(() => {
  const students = activeStudents.value
  return students.reduce(
    (acc, s) => {
      if (s.gender === '男') acc.maleCount++
      else if (s.gender === '女') acc.femaleCount++
      if (s.allergy || s.medication || s.special_needs) acc.healthAlertCount++
      return acc
    },
    { maleCount: 0, femaleCount: 0, healthAlertCount: 0 },
  )
})

const avatarBgColor = (gender) => {
  if (gender === '男') return 'var(--el-color-primary)'
  if (gender === '女') return '#e91e8c'
  return '#909399'
}

const handleStudentAdd = () => {
  currentStudentData.value = null
  isStudentEdit.value = false
  studentDialogVisible.value = true
}

const handleStudentEdit = (student) => {
  currentStudentData.value = { ...student }
  isStudentEdit.value = true
  studentDialogVisible.value = true
}

const openGraduateDialog = (student) => {
  graduateTarget.value = student
  graduateDialogVisible.value = true
}

const { confirmDelete: handleStudentDelete } = useConfirmDelete({
  endpoint: '/students',
  onSuccess: () => emit('student-updated'),
  successMsg: '刪除成功',
})

const onStudentSaved = () => emit('student-updated')
const onGraduated = () => emit('student-updated')
const close = () => emit('update:visible', false)
</script>

<template>
  <el-dialog
    :model-value="visible"
    width="800px"
    :show-header="false"
    class="student-list-dialog"
    @update:model-value="emit('update:visible', $event)"
    @close="close"
  >
    <div v-loading="loading">
      <template v-if="classroom">
        <!-- 彩色漸層 Banner -->
        <div class="student-dialog-banner">
          <div class="banner-left">
            <div class="banner-title">{{ classroom.name }}</div>
            <div class="banner-subtitle">{{ classroom.semester_label }} · {{ classroom.grade_name || '未設定年級' }}</div>
          </div>
          <div class="banner-right">
            <el-tag :type="classroom.is_active ? 'success' : 'info'" effect="dark">
              {{ classroom.is_active ? '啟用中' : '已停用' }}
            </el-tag>
            <el-button
              v-if="canWriteStudents"
              type="primary"
              size="small"
              :icon="Plus"
              @click="handleStudentAdd"
              style="background:rgba(255,255,255,0.2); border-color:rgba(255,255,255,0.5); color:#fff"
            >新增學生</el-button>
          </div>
        </div>

        <!-- 統計 Stat Pills -->
        <div class="stat-pills-row">
          <div class="stat-pill stat-pill--primary">
            <div class="stat-pill-value">{{ activeStudents.length }} / {{ classroom.capacity }}</div>
            <div class="stat-pill-label">在讀人數</div>
          </div>
          <div class="stat-pill stat-pill--info">
            <div class="stat-pill-value">{{ studentStats.maleCount }}</div>
            <div class="stat-pill-label">男生</div>
          </div>
          <div class="stat-pill stat-pill--danger">
            <div class="stat-pill-value">{{ studentStats.femaleCount }}</div>
            <div class="stat-pill-label">女生</div>
          </div>
          <div class="stat-pill stat-pill--warning">
            <div class="stat-pill-value">{{ studentStats.healthAlertCount }}</div>
            <div class="stat-pill-label">需注意</div>
          </div>
        </div>

        <!-- 搜尋 + 性別篩選 -->
        <div class="student-filter-bar">
          <el-input
            v-model="studentSearch"
            placeholder="搜尋姓名或學號"
            clearable
            style="width: 200px"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-radio-group v-model="studentGenderFilter" size="small">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="男">男</el-radio-button>
            <el-radio-button value="女">女</el-radio-button>
          </el-radio-group>
          <el-switch
            v-if="inactiveStudents.length > 0"
            v-model="showInactive"
            size="small"
            :active-text="`含離班 ${inactiveStudents.length} 人`"
            inactive-text=""
          />
        </div>

        <!-- 學生表格 -->
        <div class="student-table-wrap">
          <el-empty
            v-if="!classroom.students || classroom.students.length === 0"
            description="目前沒有學生"
          />
          <template v-else>
            <el-empty
              v-if="filteredStudents.length === 0"
              description="找不到符合條件的學生"
            />
            <el-table
              v-else
              :data="filteredStudents"
              size="small"
              style="width: 100%"
              :row-class-name="({ row }) => row.is_active === false ? 'row-inactive' : ''"
            >
              <el-table-column width="50" align="center">
                <template #default="{ row }">
                  <el-avatar
                    :size="28"
                    :style="{ backgroundColor: row.is_active === false ? '#c0c4cc' : avatarBgColor(row.gender), fontSize: '12px', flexShrink: 0 }"
                  >{{ row.name?.[0] }}</el-avatar>
                </template>
              </el-table-column>
              <el-table-column label="姓名" min-width="80">
                <template #default="{ row }">
                  <span>{{ row.name }}</span>
                  <el-tag v-if="row.is_active === false" size="small" type="info" style="margin-left: 4px">{{ row.status || '已離班' }}</el-tag>
                  <el-tooltip
                    v-if="row.allergy || row.medication || row.special_needs"
                    placement="top"
                    :content="[row.allergy && `過敏：${row.allergy}`, row.medication && `用藥：${row.medication}`, row.special_needs && `特殊需求：${row.special_needs}`].filter(Boolean).join(' ／ ')"
                  >
                    <el-icon style="color: #e6a23c; margin-left: 4px; vertical-align: middle"><Warning /></el-icon>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column prop="student_id" label="學號" width="80" />
              <el-table-column label="性別" width="60">
                <template #default="{ row }">
                  <el-tag v-if="row.gender === '男'" type="primary" size="small" effect="light">男</el-tag>
                  <el-tag v-else-if="row.gender === '女'" type="danger" size="small" effect="light">女</el-tag>
                  <span v-else class="text-muted">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="parent_phone" label="家長電話" min-width="110" />
              <el-table-column v-if="canWriteStudents" label="操作" width="110" align="center">
                <template #default="{ row }">
                  <el-tooltip content="編輯" placement="top">
                    <el-button size="small" :icon="Edit" type="primary" plain circle @click="handleStudentEdit(row)" />
                  </el-tooltip>
                  <el-tooltip content="畢業/轉出" placement="top">
                    <el-button size="small" :icon="SwitchButton" type="warning" plain circle @click="openGraduateDialog(row)" />
                  </el-tooltip>
                  <el-tooltip content="刪除" placement="top">
                    <el-button size="small" :icon="Delete" type="danger" plain circle @click="handleStudentDelete(row)" />
                  </el-tooltip>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="close">關閉</el-button>
    </template>

    <!-- 學生新增/編輯 Dialog -->
    <StudentCrudDialog
      v-model:visible="studentDialogVisible"
      :is-edit="isStudentEdit"
      :classroom-id="classroom?.id"
      :initial-data="currentStudentData"
      @saved="onStudentSaved"
    />

    <!-- 畢業/轉出 Dialog -->
    <GraduateDialog
      v-model:visible="graduateDialogVisible"
      :student="graduateTarget"
      @graduated="onGraduated"
    />
  </el-dialog>
</template>

<style scoped>
.student-list-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.student-dialog-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 18px;
  background: linear-gradient(135deg, var(--el-color-primary) 0%, var(--el-color-primary-light-3) 100%);
  border-radius: 8px 8px 0 0;
  color: #fff;
  gap: 12px;
}

.banner-left {
  min-width: 0;
}

.banner-title {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 4px;
}

.banner-subtitle {
  font-size: 0.85rem;
  opacity: 0.85;
}

.banner-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.stat-pills-row {
  display: flex;
  gap: 12px;
  padding: 16px 24px 8px;
  flex-wrap: wrap;
}

.stat-pill {
  flex: 1;
  min-width: 80px;
  padding: 10px 14px;
  border-radius: 8px;
  text-align: center;
  border: 1px solid transparent;
}

.stat-pill--primary {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}

.stat-pill--info {
  background: var(--el-color-info-light-9);
  border-color: var(--el-color-info-light-5);
  color: var(--el-color-info);
}

.stat-pill--danger {
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-5);
  color: var(--el-color-danger);
}

.stat-pill--warning {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
  color: var(--el-color-warning);
}

.stat-pill-value {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-pill-label {
  font-size: 0.78rem;
  opacity: 0.8;
}

.student-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 24px 12px;
}

.student-table-wrap {
  padding: 0 24px 4px;
  max-height: 380px;
  overflow-y: auto;
}

.text-muted {
  color: #909399;
}

:deep(.row-inactive) td {
  color: #c0c4cc;
}
</style>
