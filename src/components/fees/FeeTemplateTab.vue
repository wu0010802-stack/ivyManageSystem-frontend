<template>
  <div class="fee-template-tab">
    <div class="toolbar">
      <div class="filters">
        <el-select v-model="filterYear" placeholder="學年" style="width: 130px">
          <el-option v-for="y in availableYears" :key="y" :value="y" :label="`${y} 學年度`" />
        </el-select>
        <el-select v-model="filterSemester" placeholder="學期" style="width: 110px">
          <el-option :value="1" label="上學期" />
          <el-option :value="2" label="下學期" />
        </el-select>
      </div>
      <div class="view-actions">
        <!-- TODO(fees-overview): FeeQuickEditDialog 子元件在 stash 半成品內未隨附，先移除「編輯費用設定」入口 -->
        <el-button text @click="expandAll">展開全部</el-button>
        <el-button text @click="collapseAll">收合全部</el-button>
        <el-button @click="loadOverview">重新載入</el-button>
      </div>
    </div>

    <div v-loading="overviewLoading" class="overview">
      <el-alert
        v-if="!overviewLoading && templates.length === 0"
        type="warning"
        :closable="false"
        show-icon
      >
        該學期尚未建立任何費用範本。
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
              <span>每生小計 <strong>{{ grade.per_student_total.toLocaleString() }}</strong></span>
              <span>年級合計 <strong>{{ grade.grade_total.toLocaleString() }}</strong></span>
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
                    <span>每生 {{ cls.per_student_total.toLocaleString() }}</span>
                    <span>班級合計 <strong>{{ cls.class_total.toLocaleString() }}</strong></span>
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
                    <span v-else>{{ col.amount.toLocaleString() }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="合計" width="120" align="right" fixed="right">
                  <template #default>
                    <strong>{{ cls.per_student_total.toLocaleString() }}</strong>
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFeeTemplates } from '@/api/fees'
import { getGrades, getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import { getCurrentAcademicTerm, currentRocYear } from '@/utils/academic'

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

// 註：學費等同於註冊費，不另設欄位
const FEE_TYPE_LABELS: Record<string, string> = {
  registration: '註冊費',
  miscellaneous: '雜費',
  monthly: '月費',
  transport: '交通費',
  summer_uniform: '夏制',
  summer_sports: '夏運',
}

// 月費仍是唯一會展開為 6 個月的類型
const OVERVIEW_FEE_TYPES = [
  'registration', 'miscellaneous', 'monthly', 'transport',
  'summer_uniform', 'summer_sports',
]

function formatMoney(n: number | null | undefined) {
  return n != null ? `NT$ ${Number(n).toLocaleString()}` : '—'
}

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
    studentsList.value = stuData?.items || []
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

  const columns = OVERVIEW_FEE_TYPES.map((ft) => {
    const tpl = templateByGradeType.value.get(`${cls.grade_id}:${ft}`)
    if (!tpl) return { fee_type: ft, label: FEE_TYPE_LABELS[ft], amount: null, detail: '無範本' }
    if (ft === 'monthly') {
      const total = (tpl.amount || 0) * MONTHS_PER_SEMESTER
      return {
        fee_type: ft,
        label: FEE_TYPE_LABELS[ft],
        amount: total,
        detail: `${formatMoney(tpl.amount)} × ${MONTHS_PER_SEMESTER} 月`,
      }
    }
    return { fee_type: ft, label: FEE_TYPE_LABELS[ft], amount: tpl.amount, detail: null }
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
})
</script>

<style scoped>
.fee-template-tab {
  padding-top: var(--space-2, 8px);
  font-variant-numeric: tabular-nums;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--el-bg-color, #fff);
  padding: var(--space-2, 8px) 0;
  border-bottom: 1px solid var(--el-border-color-lighter, #e4e7ed);
}
.filters {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
  flex-wrap: wrap;
}
.view-actions {
  display: flex;
  gap: var(--space-2, 8px);
}

.overview {
  min-height: 120px;
}
.grade-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
}
.grade-section {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 10px;
  padding: var(--space-3, 12px);
  background: var(--el-bg-color, #fff);
}
.grade-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-3, 12px);
  padding-bottom: var(--space-2, 8px);
  border-bottom: 2px solid var(--el-border-color-lighter, #e4e7ed);
}
.grade-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2, 8px);
}
.grade-name {
  font-weight: 700;
  font-size: var(--text-xl, 18px);
  color: var(--el-color-primary, #409eff);
}
.grade-totals {
  display: flex;
  gap: var(--space-4, 16px);
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #555);
}

.class-collapse-title {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
  padding-right: var(--space-3, 12px);
}
.class-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2, 8px);
}
.class-name {
  font-weight: 600;
  font-size: var(--text-base, 14px);
}
.class-totals {
  display: flex;
  gap: var(--space-3, 12px);
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #555);
}

.col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}
.col-detail {
  font-size: 11px;
  color: var(--text-tertiary, #999);
  font-weight: normal;
}

.muted {
  color: var(--text-tertiary, #999);
}
</style>
