<template>
  <el-dialog
    :model-value="modelValue"
    title="登記新生預繳（現金 5,000）"
    width="600px"
    append-to-body
    data-test="ppd-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="intro">新生預繳只收現金；註冊費批產單時會自動把此額度標記已套用（繳費單淨額已含 −5,000）。</p>
    <el-radio-group v-model="mode" size="small" class="mode">
      <el-radio-button value="student" data-test="ppd-mode-student">已建檔學生</el-radio-button>
      <el-radio-button value="visit" data-test="ppd-mode-visit">招生訪視（尚未建檔）</el-radio-button>
    </el-radio-group>

    <div v-if="mode === 'student'" class="block">
      <el-button data-test="ppd-pick-student" @click="pickerVisible = true">挑選學生</el-button>
      <span class="target" data-test="ppd-target">{{ student ? `${student.name}${student.classroom_name ? `（${student.classroom_name}）` : ''}` : '尚未選擇' }}</span>
    </div>
    <div v-else class="block">
      <div class="search-row">
        <el-input v-model="visitKeyword" placeholder="幼生姓名" clearable data-test="ppd-visit-keyword" @keyup.enter="searchVisits" />
        <el-button data-test="ppd-visit-search" :loading="searching" @click="searchVisits">搜尋</el-button>
      </div>
      <table v-if="visits.length" class="rows">
        <tbody>
          <tr v-for="v in visits" :key="v.id" data-test="ppd-visit-row" :class="{ 'row--on': visit?.id === v.id }">
            <td>{{ v.child_name }}</td>
            <td>{{ v.visit_date || '—' }}</td>
            <td>{{ v.has_deposit ? '訪視已記預繳' : '' }}</td>
            <td><el-button size="small" text type="primary" data-test="ppd-visit-pick" @click="visit = v">選這筆</el-button></td>
          </tr>
        </tbody>
      </table>
      <span class="target" data-test="ppd-target">{{ visit ? `${visit.child_name}（訪視 #${visit.id}）` : '尚未選擇' }}</span>
    </div>

    <div class="footer-row">
      <label>目標學期
        <el-select v-model="targetYear" size="small" style="width: 100px" data-test="ppd-year">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y}`" />
        </el-select>
        <el-select v-model="targetSemester" size="small" style="width: 70px" data-test="ppd-semester">
          <el-option :value="1" label="上" />
          <el-option :value="2" label="下" />
        </el-select>
      </label>
      <label>收款日
        <el-date-picker v-model="receivedDate" type="date" value-format="YYYY-MM-DD" size="small" data-test="ppd-date" />
      </label>
      <strong class="amount">NT$5,000</strong>
    </div>

    <StudentPickerDialog v-model="pickerVisible" title="挑選預繳學生" @pick="onPick" />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" data-test="ppd-submit" :loading="submitting" :disabled="!canSubmit" @click="submit">確認收款</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 新生預繳現金登記（SPEC-019 §7.2）：自 CashHandoverTab「含預繳款」流程抽出成獨立 dialog。
 * 對象＝已建檔學生（StudentPickerDialog）或招生訪視（關鍵字搜尋）；固定 5,000；
 * 目標學期預設「下一學期」（本學期上→本學年下、本學期下→次學年上）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createCashReceipt } from '@/api/fees'
import { getRecruitmentRecords } from '@/api/recruitment'
import { friendlyError } from '@/utils/errorMessages'
import { todayISO } from '@/utils/format'
import { getCurrentAcademicTerm } from '@/utils/academic'
import StudentPickerDialog from './StudentPickerDialog.vue'

interface VisitLite {
  id: number
  child_name: string | null
  visit_date?: string | null
  has_deposit?: boolean | null
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; received: [] }>()

const mode = ref<'student' | 'visit'>('student')
const student = ref<{ id: number; name: string; classroom_name: string | null } | null>(null)
const visit = ref<VisitLite | null>(null)
const visits = ref<VisitLite[]>([])
const visitKeyword = ref('')
const searching = ref(false)
const submitting = ref(false)
const pickerVisible = ref(false)
const receivedDate = ref(todayISO())

function nextTerm(): { year: number; semester: number } {
  const t = getCurrentAcademicTerm()
  return t.semester === 1 ? { year: t.school_year, semester: 2 } : { year: t.school_year + 1, semester: 1 }
}
const initial = nextTerm()
const targetYear = ref(initial.year)
const targetSemester = ref(initial.semester)
const yearOptions = computed(() => [initial.year - 1, initial.year, initial.year + 1])

const canSubmit = computed(
  () => !submitting.value && (mode.value === 'student' ? !!student.value : !!visit.value),
)

function onPick(s: { id: number; name: string; classroom_name: string | null }) {
  student.value = s
}

async function searchVisits() {
  const kw = visitKeyword.value.trim()
  if (!kw) return
  searching.value = true
  try {
    const res = await getRecruitmentRecords({ keyword: kw, page: 1, page_size: 20 })
    visits.value = (res.data as unknown as { records?: VisitLite[] }).records ?? []
  } catch (e) {
    ElMessage.error(friendlyError('搜尋招生訪視失敗', e))
  } finally {
    searching.value = false
  }
}

async function submit() {
  if (!canSubmit.value) return
  const part =
    mode.value === 'student' && student.value
      ? {
          part_type: 'prepayment' as const,
          student_id: student.value.id,
          amount: 5000,
          target_school_year: targetYear.value,
          target_semester: targetSemester.value,
        }
      : {
          part_type: 'prepayment' as const,
          recruitment_visit_id: visit.value!.id,
          amount: 5000,
          target_school_year: targetYear.value,
          target_semester: targetSemester.value,
        }
  submitting.value = true
  try {
    await createCashReceipt({
      amount: 5000,
      received_date: receivedDate.value,
      parts: [part],
      idempotency_key: `ppdlg-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    })
    ElMessage.success('已登記預繳現金 NT$5,000（進當日交接批）')
    emit('received')
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error(friendlyError('登記預繳失敗', e))
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    mode.value = 'student'
    student.value = null
    visit.value = null
    visits.value = []
    visitKeyword.value = ''
    receivedDate.value = todayISO()
  },
)
</script>

<style scoped>
.intro { margin: 0 0 10px; font-size: 12.5px; color: var(--el-text-color-secondary); }
.mode { margin-bottom: 10px; }
.block { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.search-row { display: flex; gap: 8px; }
.rows { width: 100%; border-collapse: collapse; font-size: 13px; }
.rows td { padding: 5px 8px; border-bottom: 1px dashed var(--el-border-color-lighter); }
.row--on td { background: var(--el-color-primary-light-9); }
.target { font-size: 13px; }
.footer-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12.5px; }
.footer-row label { display: inline-flex; align-items: center; gap: 6px; }
.amount { margin-left: auto; font-size: 15px; }
</style>
