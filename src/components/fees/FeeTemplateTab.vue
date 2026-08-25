<template>
  <div class="fee-template-tab">
    <div class="toolbar">
      <div class="filters">
        <el-select v-model="filterYear" placeholder="學年" aria-label="學年" class="filter-year">
          <el-option v-for="y in availableYears" :key="y" :value="y" :label="`${y} 學年度`" />
        </el-select>
        <el-select v-model="filterSemester" placeholder="學期" aria-label="學期" class="filter-semester">
          <el-option :value="1" label="上學期" />
          <el-option :value="2" label="下學期" />
        </el-select>
      </div>
      <!-- 產單已改每日排程自動化（無手動入口），本頁只管範本與總覽。
           頂層兩個 action：主要（管理範本）、檢視選單（其餘收斂） -->
      <div class="view-actions">
        <el-button type="primary" @click="manageVisible = true">管理範本</el-button>
        <el-dropdown trigger="click" @command="onViewCommand">
          <el-button aria-label="檢視選項">
            檢視<el-icon class="view-actions__caret"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="expand">展開全部</el-dropdown-item>
              <el-dropdown-item command="collapse">收合全部</el-dropdown-item>
              <el-dropdown-item command="reload" divided>重新載入</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div v-loading="overviewLoading" class="overview">
      <el-alert
        v-if="!overviewLoading && templates.length === 0"
        type="warning"
        :closable="false"
        show-icon
      >
        該學期尚未建立任何費用範本：請先用右上「管理範本」逐年級建立，
        啟用後系統將於每日自動產生費用單。
      </el-alert>
      <el-empty
        v-else-if="!overviewLoading && gradeSections.length === 0"
        description="目前沒有班級資料"
      />

      <div v-else class="grade-list">
        <section
          v-for="grade in gradeSections"
          :key="grade.grade_id || grade.grade_name"
          class="grade-section"
        >
          <header class="grade-header">
            <div class="grade-title">
              <span class="grade-name">{{ grade.grade_name }}</span>
              <el-tag size="small">{{ grade.classrooms.length }} 班</el-tag>
              <el-tag size="small" type="info">{{ grade.total_students }} 位學生</el-tag>
              <el-tag v-if="!grade.has_any_template" size="small" type="warning">
                該年級尚無範本
              </el-tag>
            </div>
            <div class="grade-totals">
              <span>每生小計 <strong>{{ formatCurrency(grade.per_student_total) }}</strong></span>
              <span>年級合計 <strong>{{ formatCurrency(grade.grade_total) }}</strong></span>
            </div>
          </header>

          <el-collapse v-model="expandedClassrooms[grade.grade_id || grade.grade_name]">
            <el-collapse-item
              v-for="cls in grade.classrooms"
              :key="cls.classroom_id"
              :name="cls.classroom_id"
            >
              <template #title>
                <div class="class-collapse-title">
                  <div class="class-title">
                    <span class="class-name">{{ cls.classroom_name }}</span>
                    <el-tag size="small" type="info">{{ cls.students.length }} 位學生</el-tag>
                  </div>
                  <div class="class-totals">
                    <span>每生 {{ formatCurrency(cls.per_student_total) }}</span>
                    <span>班級合計 <strong>{{ formatCurrency(cls.class_total) }}</strong></span>
                  </div>
                </div>
              </template>

              <el-table :data="cls.students" border size="small" stripe>
                <el-table-column label="學號" prop="student_no" width="100" />
                <el-table-column label="學生" prop="student_name" min-width="110" />
                <el-table-column
                  v-for="col in cls.columns"
                  :key="col.fee_type"
                  align="center"
                  min-width="130"
                >
                  <template #header>
                    <div class="col-header">
                      <span>{{ col.label }}</span>
                      <span v-if="col.detail" class="col-detail">{{ col.detail }}</span>
                    </div>
                  </template>
                  <template #default>
                    <span v-if="col.amount == null" class="muted">—</span>
                    <span v-else>{{ formatCurrency(col.amount) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="合計" width="120" align="right" fixed="right">
                  <template #default>
                    <strong>{{ formatCurrency(cls.per_student_total) }}</strong>
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </section>
      </div>
    </div>

    <FeeTemplateManageDrawer
      v-model="manageVisible"
      :school-year="filterYear"
      :semester="filterSemester"
      :grades="drawerGrades"
      @changed="loadOverview"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { getFeeTemplates } from '@/api/fees'
import { getGrades, getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import { getCurrentAcademicTerm, currentRocYear } from '@/utils/academic'
import { formatCurrency } from '@/utils/currency'
import { FEE_TYPES } from '@/components/fees/feeTypes'
import FeeTemplateManageDrawer from '@/components/fees/FeeTemplateManageDrawer.vue'

interface FeeTemplate {
  grade_id: number | null
  fee_type: string
  amount: number | null
  is_active?: boolean
  grade_name?: string
  [key: string]: unknown
}

interface Grade {
  id: number | string
  name: string
  sort_order?: number | null
  [key: string]: unknown
}

interface Classroom {
  id: number | string
  name: string
  grade_id?: number | null
  grade_name?: string
  [key: string]: unknown
}

interface Student {
  id: number | string
  name?: string
  student_id?: string
  classroom_id?: number | string
  [key: string]: unknown
}

interface Column {
  fee_type: string
  label: string
  amount: number | null
  detail: string | null
}

interface ClassroomSection {
  classroom_id: number | string
  classroom_name: string
  grade_id?: number | null
  grade_name?: string
  students: { student_id: number | string; student_no?: string; student_name?: string }[]
  columns: Column[]
  per_student_total: number
  class_total: number
  has_any_template: boolean
}

interface GradeGroup {
  grade_id: number | null
  grade_name: string
  grade_sort: number
  classrooms: ClassroomSection[]
}

const _initTerm = getCurrentAcademicTerm()
const filterYear = ref(_initTerm.school_year)
const filterSemester = ref(_initTerm.semester)

// 產單已改每日排程自動化（無手動入口）；本頁只管範本與總覽
const manageVisible = ref(false)
// 本檔 Grade.id 為 number | string（展示用寬鬆型別），Drawer/Dialog 需 number
const drawerGrades = computed(() =>
  grades.value
    .filter((g) => typeof g.id === 'number')
    .map((g) => ({ id: g.id as number, name: g.name })),
)

// 各年級下哪些班級被展開（key = grade_id 或 grade_name，value = classroom_id 陣列）
const expandedClassrooms = ref<Record<string | number, (string | number)[]>>({})

function expandAll() {
  const map: Record<string | number, (string | number)[]> = {}
  for (const g of gradeSections.value) {
    map[g.grade_id ?? g.grade_name] = g.classrooms.map((c: ClassroomSection) => c.classroom_id)
  }
  expandedClassrooms.value = map
}
function collapseAll() {
  expandedClassrooms.value = {}
}

// 檢視選單（展開全部／收合全部／重新載入收進 dropdown，降低頂層 action 密度）
function onViewCommand(cmd: string) {
  if (cmd === 'expand') expandAll()
  else if (cmd === 'collapse') collapseAll()
  else if (cmd === 'reload') void loadOverview()
}

const templates = ref<FeeTemplate[]>([])
const grades = ref<Grade[]>([])
const classroomsList = ref<Classroom[]>([])
const studentsList = ref<Student[]>([])
const overviewLoading = ref(false)

// 月費展開為幾個月（與後端 _semester_months 一致：上下學期皆 6 個月）
const MONTHS_PER_SEMESTER = 6

const availableYears = computed(() => {
  const current = currentRocYear()
  return [current - 1, current, current + 1]
})

// 總覽欄位＝可建立範本的費別，與 FeeTemplateDialog 同源（皆取 FEE_TYPES 的 record 類），
// 避免兩份清單漂移。此處原本自帶一份 6 項的硬編碼清單，漏了代購品與保險費，
// 造成這兩類建得出範本、卻不會出現在總覽表格，每生小計也漏算。
// 註：學費等同於註冊費，不另設欄位（tuition 是月費 breakdown 的 key，不是獨立費別）。
// 月費仍是唯一會展開為 6 個月的類型。
const OVERVIEW_FEE_COLUMNS = FEE_TYPES.filter((t) => t.source === 'record')

async function loadOverview() {
  overviewLoading.value = true
  try {
    const params = {
      school_year: filterYear.value,
      semester: filterSemester.value,
    }
    const [tplList, clsRes, stuRes] = await Promise.all([
      getFeeTemplates(params),
      getClassrooms({ ...params, current_only: false, include_inactive: false }),
      getStudents({ ...params, is_active: true, limit: 500, skip: 0 }),
    ])
    const gradeMap: Record<string | number, string> = Object.fromEntries(grades.value.map((g) => [g.id, g.name]))
    templates.value = ((tplList || []) as FeeTemplate[]).map((t) => ({
      ...t,
      grade_name: (t.grade_id != null ? gradeMap[t.grade_id] : undefined) || `#${t.grade_id}`,
    }))
    const clsData = (clsRes?.data ?? clsRes) as Classroom[] | { items?: Classroom[] }
    classroomsList.value = Array.isArray(clsData) ? clsData : ((clsData as { items?: Classroom[] })?.items || [])
    const stuData = stuRes?.data ?? stuRes
    // getStudents 型別化後 StudentListItemOut.classroom_id 含 null，與本檔寬鬆展示用
    // Student.classroom_id?: number | string 不完全對齊；此處僅供表格展示，維持既有寬鬆轉型。
    studentsList.value = (stuData?.items || []) as unknown as Student[]
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '載入總覽失敗')
  } finally {
    overviewLoading.value = false
  }
}

watch([filterYear, filterSemester], () => loadOverview())

// 樞紐：班級 → 學生 × fee_type ───────────────────────────────────────────
const templateByGradeType = computed(() => {
  const m = new Map<string, FeeTemplate>()
  for (const t of templates.value) {
    if (!t.is_active) continue
    m.set(`${t.grade_id}:${t.fee_type}`, t)
  }
  return m
})

const studentsByClassroom = computed(() => {
  const m = new Map<number | string, Student[]>()
  for (const s of studentsList.value) {
    if (!s.classroom_id) continue
    if (!m.has(s.classroom_id)) m.set(s.classroom_id, [])
    m.get(s.classroom_id)!.push(s)
  }
  return m
})

function buildClassroomSection(cls: Classroom) {
  const students = (studentsByClassroom.value.get(cls.id) || [])
    .slice()
    .sort((a: Student, b: Student) =>
      (String(a.student_id || '')).localeCompare(String(b.student_id || '')) ||
      (String(a.name || '')).localeCompare(String(b.name || ''), 'zh-Hant'),
    )

  const columns = OVERVIEW_FEE_COLUMNS.map((ft) => {
    const tpl = templateByGradeType.value.get(`${cls.grade_id}:${ft.value}`)
    if (!tpl) return { fee_type: ft.value, label: ft.label, amount: null, detail: '無範本' }
    if (ft.value === 'monthly') {
      const total = (tpl.amount || 0) * MONTHS_PER_SEMESTER
      return {
        fee_type: ft.value,
        label: ft.label,
        amount: total,
        detail: `${formatCurrency(tpl.amount)} × ${MONTHS_PER_SEMESTER} 月`,
      }
    }
    return { fee_type: ft.value, label: ft.label, amount: tpl.amount, detail: null }
  })
  const perStudentTotal = columns.reduce((s: number, c: Column) => s + (c.amount || 0), 0)
  const hasAnyTemplate = columns.some((c: Column) => c.amount != null)

  return {
    classroom_id: cls.id,
    classroom_name: cls.name,
    grade_id: cls.grade_id,
    grade_name: cls.grade_name,
    students: students.map((s) => ({
      student_id: s.id,
      student_no: s.student_id,
      student_name: s.name,
    })),
    columns,
    per_student_total: perStudentTotal,
    class_total: perStudentTotal * students.length,
    has_any_template: hasAnyTemplate,
  }
}

// grade_id → sort_order（無 sort_order 時退化為陣列 index，仍保留穩定順序）
const gradeOrderMap = computed(() => {
  const m = new Map<number | string, number>()
  grades.value.forEach((g, idx) => m.set(g.id, g.sort_order ?? idx))
  return m
})

// 樞紐：依年級分組，年級下列出各班（班級預設折疊）
const gradeSections = computed(() => {
  const groups = new Map<string | number, GradeGroup>()
  for (const cls of classroomsList.value) {
    const key = cls.grade_id ?? `__nograde_${cls.grade_name || '未分年級'}`
    if (!groups.has(key)) {
      groups.set(key, {
        grade_id: cls.grade_id ?? null,
        grade_name: cls.grade_name || '未分年級',
        grade_sort:
          cls.grade_id != null
            ? gradeOrderMap.value.get(cls.grade_id) ?? Number.MAX_SAFE_INTEGER - 1
            : Number.MAX_SAFE_INTEGER,
        classrooms: [],
      })
    }
    groups.get(key)!.classrooms.push(buildClassroomSection(cls))
  }

  const sections: (GradeGroup & { total_students: number; per_student_total: number; grade_total: number; has_any_template: boolean })[] = []
  for (const g of groups.values()) {
    g.classrooms.sort((a: ClassroomSection, b: ClassroomSection) =>
      (a.classroom_name || '').localeCompare(b.classroom_name || '', 'zh-Hant'),
    )
    const totalStudents = g.classrooms.reduce((s: number, c: ClassroomSection) => s + c.students.length, 0)
    const perStudentTotal = g.classrooms[0]?.per_student_total ?? 0
    const gradeTotal = g.classrooms.reduce((s: number, c: ClassroomSection) => s + c.class_total, 0)
    const hasAnyTemplate = g.classrooms.some((c: ClassroomSection) => c.has_any_template)
    sections.push({
      grade_id: g.grade_id,
      grade_name: g.grade_name,
      grade_sort: g.grade_sort,
      classrooms: g.classrooms,
      total_students: totalStudents,
      per_student_total: perStudentTotal,
      grade_total: gradeTotal,
      has_any_template: hasAnyTemplate,
    })
  }
  // 年級依 grade_id（grades 排序）排，沒 grade_id 的擺最後
  sections.sort((a, b) => a.grade_sort - b.grade_sort)
  return sections
})

onMounted(async () => {
  try {
    const res = await getGrades()
    grades.value = (res.data || []).slice().sort(
      (a: Grade, b: Grade) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '載入年級失敗')
  }
  loadOverview()
})

defineExpose({
  filterYear,
  filterSemester,
  loadOverview,
  gradeSections,
  expandedClassrooms,
  expandAll,
  collapseAll,
  onViewCommand,
})
</script>

<style scoped>
.fee-template-tab {
  padding-top: var(--space-2);
  font-variant-numeric: tabular-nums;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--el-bg-color);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.filters {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.view-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.view-actions__caret {
  margin-left: var(--space-1);
}
.filter-year {
  width: 130px;
}
.filter-semester {
  width: 110px;
}

.overview {
  min-height: 120px;
}
.grade-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.grade-section {
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  background: var(--el-bg-color);
}
.grade-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 2px solid var(--el-border-color-lighter);
}
.grade-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.grade-name {
  font-weight: 700;
  font-size: var(--text-xl);
  color: var(--el-color-primary);
}
.grade-totals {
  display: flex;
  gap: var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.class-collapse-title {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding-right: var(--space-3);
}
.class-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.class-name {
  font-weight: 600;
  font-size: var(--text-base);
}
.class-totals {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}
.col-detail {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: normal;
}

.muted {
  color: var(--text-secondary);
}
</style>
