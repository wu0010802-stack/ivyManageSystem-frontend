<template>
  <div class="iep-page">
    <aside class="left-pane">
      <h3>身障幼生</h3>
      <el-select v-model="filterClassroom" placeholder="班級" clearable size="small">
        <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <ul class="student-list">
        <li v-for="s in filteredStudents" :key="s.id"
            :class="{ active: selectedStudent?.id === s.id }"
            @click="selectStudent(s)">
          <div class="name">{{ s.name }}</div>
          <el-tag size="small" :type="statusTagType(iepStatusByStudent[s.id])">
            {{ iepStatusLabel(iepStatusByStudent[s.id]) }}
          </el-tag>
        </li>
        <li v-if="!filteredStudents.length" class="empty">無身障幼生</li>
      </ul>
    </aside>

    <section class="right-pane" v-if="selectedStudent">
      <header class="toolbar">
        <div>
          <strong>{{ selectedStudent.name }}</strong>
          <el-select v-model="period.year" size="small" style="width:110px">
            <el-option v-for="y in [2024, 2025, 2026, 2027]" :key="y" :label="`${y} 學年`" :value="y" />
          </el-select>
          <el-select v-model="period.semester" size="small" style="width:110px">
            <el-option :label="'第 1 學期'" :value="1" />
            <el-option :label="'第 2 學期'" :value="2" />
          </el-select>
          <el-tag :type="statusTagType(currentIep?.status)">
            {{ iepStatusLabel(currentIep?.status) || '尚無 IEP' }}
          </el-tag>
        </div>
        <div class="actions">
          <el-button v-if="!currentIep" type="primary" @click="onCreate">新建本學期 IEP</el-button>
          <el-button v-if="!currentIep" @click="onClone">複製上學期</el-button>
          <el-button v-if="currentIep?.status === 'draft'" type="success" @click="onSubmit">提交審核</el-button>
          <el-button v-if="currentIep?.status === 'pending_review' && canApprove"
                     type="success" @click="onApprove">核准</el-button>
          <el-button v-if="currentIep?.status === 'approved' && canApprove"
                     @click="onClose">關閉</el-button>
          <el-button v-if="currentIep" @click="onExport">匯出 PDF</el-button>
        </div>
      </header>

      <el-tabs v-if="currentIep" v-model="activeTab" class="iep-tabs">
        <el-tab-pane label="狀況評估" name="status">
          <el-form label-width="120px" :disabled="readonly">
            <el-form-item label="目前發展狀況">
              <el-input v-model="form.current_status" type="textarea" :rows="4" />
            </el-form-item>
            <el-form-item label="長期目標">
              <el-input v-model="form.long_term_goals" type="textarea" :rows="3" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="短期目標" name="short">
          <el-table :data="form.short_term_goals || []">
            <el-table-column label="目標">
              <template #default="{ row }">
                <el-input v-model="row.goal" :disabled="readonly" />
              </template>
            </el-table-column>
            <el-table-column label="達成標準">
              <template #default="{ row }">
                <el-input v-model="row.criteria" :disabled="readonly" />
              </template>
            </el-table-column>
            <el-table-column label="到期日" width="160">
              <template #default="{ row }">
                <el-date-picker v-model="row.due_date" :disabled="readonly" value-format="YYYY-MM-DD" />
              </template>
            </el-table-column>
            <el-table-column label="狀態" width="120">
              <template #default="{ row }">
                <el-select v-model="row.status" :disabled="readonly" size="small">
                  <el-option label="進行中" value="active" />
                  <el-option label="已達成" value="done" />
                  <el-option label="未達成" value="incomplete" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="" width="60">
              <template #default="{ $index }">
                <el-button v-if="!readonly" size="small" type="danger" link
                           @click="removeGoal($index)">刪</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button v-if="!readonly" size="small" plain @click="addGoal">＋ 新增目標</el-button>
        </el-tab-pane>

        <el-tab-pane label="評估" name="eval">
          <el-form label-width="120px" :disabled="readonly">
            <el-form-item label="期中評估">
              <el-input v-model="form.mid_term_evaluation" type="textarea" :rows="4" />
            </el-form-item>
            <el-form-item label="期末評估">
              <el-input v-model="form.final_evaluation" type="textarea" :rows="4" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="會議與團隊" name="meet">
          <el-form label-width="120px" :disabled="readonly">
            <el-form-item label="團隊成員">
              <div v-for="(m, i) in (form.iep_team_members || [])" :key="i" class="member-row">
                <el-input v-model="m.role" placeholder="角色" style="width:120px" />
                <el-input v-model="m.name" placeholder="姓名" style="width:160px" />
                <el-button v-if="!readonly" size="small" type="danger" link
                           @click="removeMember(i)">刪</el-button>
              </div>
              <el-button v-if="!readonly" size="small" plain @click="addMember">＋ 新增成員</el-button>
            </el-form-item>
            <el-form-item label="初擬會議">
              <el-date-picker v-model="form.meeting_dates_initial" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="期中會議">
              <el-date-picker v-model="form.meeting_dates_mid" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="期末會議">
              <el-date-picker v-model="form.meeting_dates_final" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div v-if="currentIep && !readonly" class="save-bar">
        <el-button type="primary" @click="save">儲存草稿</el-button>
      </div>
    </section>

    <section v-else class="right-pane empty-state">請從左側選擇學生</section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listIeps, createIep, updateIep, cloneIep,
  submitIep, approveIep, closeIep, exportIepPdf,
} from '@/api/govMoe'
import { getStudents } from '@/api/students'
import { useClassroomStore } from '@/stores/classroom'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'

interface ShortTermGoal { goal: string; criteria: string; due_date: string | null; status: string }
interface TeamMember { role: string; name: string }
interface IepRecord {
  id: number
  student_id: number
  school_year: number
  semester: number
  status: string
  current_status?: string
  long_term_goals?: string
  short_term_goals?: ShortTermGoal[]
  mid_term_evaluation?: string
  final_evaluation?: string
  iep_team_members?: TeamMember[]
  meeting_dates?: { initial?: string | null; mid?: string | null; final?: string | null }
}

// 批核/結案顯隱與後端 require_permission(STUDENTS_IEP_APPROVE) 對齊，
// 不再讀 supervisor_role 字串（admin 走 '*' wildcard 仍 true）。
const canApprove = computed(() =>
  hasPermission(PERMISSION_NAMES.STUDENTS_IEP_APPROVE)
)

const classroomStore = useClassroomStore()
const classrooms = ref<Array<{ id: number; name: string }>>([])
const students = ref<unknown[]>([])
const ieps = ref<IepRecord[]>([])
const filterClassroom = ref<number | null>(null)
const selectedStudent = ref<{ id: number; name: string } | null>(null)
const period = reactive({ year: new Date().getFullYear(), semester: 1 })
const activeTab = ref('status')
const form = reactive<{
  current_status: string
  long_term_goals: string
  short_term_goals: ShortTermGoal[]
  mid_term_evaluation: string
  final_evaluation: string
  iep_team_members: TeamMember[]
  meeting_dates_initial: string | null
  meeting_dates_mid: string | null
  meeting_dates_final: string | null
}>({
  current_status: '', long_term_goals: '',
  short_term_goals: [], mid_term_evaluation: '', final_evaluation: '',
  iep_team_members: [],
  meeting_dates_initial: null, meeting_dates_mid: null, meeting_dates_final: null,
})

const filteredStudents = computed(() =>
  (students.value as Array<{ id: number; name: string; disability_type?: string; classroom_id?: number }>)
    .filter(s =>
      s.disability_type &&
      (!filterClassroom.value || s.classroom_id === filterClassroom.value)
    )
)

const iepStatusByStudent = computed(() => {
  const m: Record<number, string> = {}
  for (const i of ieps.value) {
    if (i.school_year === period.year && i.semester === period.semester) {
      m[i.student_id] = i.status
    }
  }
  return m
})

const currentIep = computed(() => ieps.value.find(i =>
  i.student_id === selectedStudent.value?.id &&
  i.school_year === period.year &&
  i.semester === period.semester
))

const readonly = computed(() =>
  !currentIep.value || ['approved', 'closed'].includes(currentIep.value.status)
)

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
function statusTagType(s: string | undefined): ElTagType {
  return (({
    draft: 'info', pending_review: 'warning',
    approved: 'success', closed: 'info',
  } as Record<string, ElTagType>)[s ?? '']) ?? 'info'
}
function iepStatusLabel(s: string | undefined) {
  return (({
    draft: '草稿', pending_review: '待審',
    approved: '已核准', closed: '已結案',
  } as Record<string, string>)[s ?? '']) ?? ''
}

async function loadAll() {
  const [, s, i] = await Promise.all([
    classroomStore.fetchClassrooms(false), getStudents({}), listIeps(),
  ])
  classrooms.value = classroomStore.classrooms as Array<{ id: number; name: string }>
  // getStudents 型別化前這裡誤把整個 { items, total, skip, limit } response body 當陣列存進
  // students（filteredStudents 對它 .filter() 會在 runtime 炸 TypeError）；型別化後修正為取 .items。
  students.value = s.data.items
  ieps.value = (i as { data: IepRecord[] }).data
}

function selectStudent(s: { id: number; name: string }) {
  selectedStudent.value = s
  syncFormFromIep()
}

watch([() => period.year, () => period.semester], () => syncFormFromIep())

function syncFormFromIep() {
  const ie = currentIep.value
  if (!ie) {
    Object.assign(form, {
      current_status: '', long_term_goals: '',
      short_term_goals: [], mid_term_evaluation: '', final_evaluation: '',
      iep_team_members: [],
      meeting_dates_initial: null, meeting_dates_mid: null, meeting_dates_final: null,
    })
    return
  }
  Object.assign(form, {
    current_status: ie.current_status || '',
    long_term_goals: ie.long_term_goals || '',
    short_term_goals: ie.short_term_goals || [],
    mid_term_evaluation: ie.mid_term_evaluation || '',
    final_evaluation: ie.final_evaluation || '',
    iep_team_members: ie.iep_team_members || [],
    meeting_dates_initial: ie.meeting_dates?.initial || null,
    meeting_dates_mid: ie.meeting_dates?.mid || null,
    meeting_dates_final: ie.meeting_dates?.final || null,
  })
}

function payloadFromForm() {
  return {
    current_status: form.current_status,
    long_term_goals: form.long_term_goals,
    short_term_goals: form.short_term_goals,
    mid_term_evaluation: form.mid_term_evaluation,
    final_evaluation: form.final_evaluation,
    iep_team_members: form.iep_team_members,
    meeting_dates: {
      initial: form.meeting_dates_initial,
      mid: form.meeting_dates_mid,
      final: form.meeting_dates_final,
    },
  }
}

async function onCreate() {
  await createIep({
    student_id: selectedStudent.value!.id,
    school_year: period.year, semester: period.semester,
    ...payloadFromForm(),
  })
  await loadAll(); syncFormFromIep()
  ElMessage.success('已建立 IEP 草稿')
}

async function onClone() {
  try {
    const src = ieps.value.find(i => i.student_id === selectedStudent.value!.id)
    if (!src) {
      ElMessage.warning('找不到可複製的上學期 IEP'); return
    }
    await cloneIep(src.id,
      { target_school_year: period.year, target_semester: period.semester }
    )
    await loadAll(); syncFormFromIep()
    ElMessage.success('已複製為新草稿（評估已清空）')
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 409) ElMessage.warning('本學期已有 IEP')
    else throw e
  }
}

async function save() {
  await updateIep(currentIep.value!.id, payloadFromForm())
  await loadAll()
  ElMessage.success('已儲存')
}

async function onSubmit() {
  await submitIep(currentIep.value!.id); await loadAll()
}
async function onApprove() {
  await ElMessageBox.confirm('核准此 IEP？', '核准確認')
  await approveIep(currentIep.value!.id); await loadAll()
}
async function onClose() {
  await closeIep(currentIep.value!.id); await loadAll()
}
async function onExport() {
  const { data } = await exportIepPdf(currentIep.value!.id)
  const url = URL.createObjectURL(data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `IEP_${selectedStudent.value!.name}_${period.year}-${period.semester}.pdf`
  a.click(); URL.revokeObjectURL(url)
}

function addGoal() {
  form.short_term_goals.push({ goal: '', criteria: '', due_date: null, status: 'active' })
}
function removeGoal(i: number) { form.short_term_goals.splice(i, 1) }
function addMember() { form.iep_team_members.push({ role: '', name: '' }) }
function removeMember(i: number) { form.iep_team_members.splice(i, 1) }

onMounted(loadAll)
</script>

<style scoped>
.iep-page { display: flex; gap: 16px; height: calc(100vh - 60px); }
.left-pane { width: 320px; border-right: 1px solid #eee; padding: 12px; overflow-y: auto; }
.right-pane { flex: 1; padding: 16px; overflow-y: auto; }
.empty-state { display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.student-list { list-style: none; padding: 0; margin: 12px 0; }
.student-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px; border-radius: 4px; cursor: pointer;
}
.student-list li.active { background: #ecf5ff; }
.student-list li.empty { color: var(--text-tertiary); cursor: default; text-align: center; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.toolbar .actions { display: flex; gap: 6px; }
.iep-tabs { margin-top: 12px; }
.member-row { display: flex; gap: 8px; margin-bottom: 6px; }
.save-bar { margin-top: 16px; text-align: right; }
</style>
