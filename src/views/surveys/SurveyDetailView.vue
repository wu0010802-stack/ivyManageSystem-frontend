<script setup lang="ts">
/**
 * 管理端：調查詳情（統計／回覆明細／題目）。
 *
 * 2026-09-15 UI/UX 改版：
 * - 頁首帶狀態、截止倒數與活動資訊；生命週期動作（發布／催覆／結束／刪除）依狀態
 *   出現在頁首，草稿不再是無路可走的死頁。
 * - 「統計」改回覆總覽分段長條（參加／不參加／未回覆三段加起來等於對象數）取代
 *   四張指標卡；各班依未回覆多寡排序；選擇題畫佔比長條。
 * - 未回覆名單每列可直接代填（原本只能改「已回覆」的列，行政補登口頭告知無入口）。
 * - 新增「題目」頁籤：發布前能看到家長會看到的內容（含固定主題目「是否參加」）。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import {
  adminFillResponse,
  closeSurvey,
  deleteSurvey,
  exportSurvey,
  getSurvey,
  getSurveyResponses,
  getSurveyStats,
  publishSurvey,
  remindSurvey,
} from '@/api/surveys'
import { getClassrooms } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { formatTaipeiDateTimeMinute, todayTaipeiISO } from '@/utils/format'
import { SURVEY_QUESTION_TYPES, firstUnansweredRequiredQuestion, type SurveyQuestionType } from '@/constants/surveyQuestionTypes'
import { SURVEY_STATUS_LABELS, SURVEY_STATUS_TAG, deadlineHint, deriveSurveyStatus } from './surveyListModel'
import {
  buildClassroomRows,
  buildOptionRows,
  buildOverview,
  buildTextRows,
  type StatsQuestion,
  type SurveyStats,
} from './surveyStatsModel'

interface QuestionOut {
  id: number
  question_text: string
  question_type: SurveyQuestionType
  options: string[] | null
  is_required: boolean
  sort_order: number
}
interface SurveyDetail {
  id: number
  title: string
  description: string | null
  event_date: string | null
  location: string | null
  fee_note: string | null
  audience_type: string
  classroom_ids: number[]
  status: string
  reply_deadline: string
  published_at: string | null
  questions: QuestionOut[]
}
interface StatsNotReplied { classroom_id: number | null; classroom_name: string; name: string; student_id: number }
interface Stats extends SurveyStats {
  not_replied: StatsNotReplied[]
}
interface ResponseRow {
  student_id: number
  student_name: string
  classroom_name: string
  attending: boolean
  answers: Record<string, unknown>
  note: string | null
  is_proxy: boolean
  submitted_by_user_id: number | null
  updated_at: string | null
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  [SURVEY_QUESTION_TYPES.SINGLE_CHOICE]: '單選',
  [SURVEY_QUESTION_TYPES.MULTI_CHOICE]: '多選',
  [SURVEY_QUESTION_TYPES.NUMBER]: '數字',
  [SURVEY_QUESTION_TYPES.TEXT]: '文字',
}

const route = useRoute()
const router = useRouter()
const canWrite = hasPermission('SURVEYS_WRITE')
const surveyId = Number(route.params.id)
const today = todayTaipeiISO()
// 手機寬度下各班表格放不下長條，只留數字（el-table 欄寬是 prop，CSS 藏不掉）。
const { isMobile } = useIsMobile()

const activeTab = ref('stats')
const loading = ref(false)
const survey = ref<SurveyDetail | null>(null)
const stats = ref<Stats | null>(null)
const responses = ref<ResponseRow[]>([])
const classroomNames = ref<Record<number, string>>({})

const status = computed(() => (survey.value ? deriveSurveyStatus(survey.value, today) : 'draft'))
const isDraft = computed(() => status.value === 'draft')
const statusTag = computed(() => SURVEY_STATUS_TAG[status.value])
const statusLabel = computed(() => SURVEY_STATUS_LABELS[status.value])
const deadlineText = computed(() => {
  if (!survey.value) return ''
  const hint = deadlineHint(survey.value, today)
  return hint ? `${survey.value.reply_deadline}（${hint}）` : survey.value.reply_deadline
})
const audienceText = computed(() => {
  if (!survey.value) return ''
  if (survey.value.audience_type === 'all') return '全園'
  const names = survey.value.classroom_ids.map((id) => classroomNames.value[id] ?? `班級 #${id}`)
  return names.length ? `${names.length} 個班級：${names.join('、')}` : '指定班級（尚未選擇）'
})
const subtitle = computed(() => {
  if (!survey.value) return ''
  const parts: string[] = []
  if (survey.value.event_date) parts.push(`活動日 ${survey.value.event_date}`)
  if (survey.value.location) parts.push(survey.value.location)
  parts.push(`回覆截止 ${deadlineText.value}`)
  return parts.join(' · ')
})

const overview = computed(() => (stats.value ? buildOverview(stats.value) : null))
const classroomRows = computed(() => (stats.value ? buildClassroomRows(stats.value.by_classroom) : []))
const notReplied = computed(() => stats.value?.not_replied ?? [])

const remindDisabledReason = computed(() => {
  if (status.value === 'draft') return '尚未發布，家長還看不到這份調查'
  if (status.value === 'closed') return '調查已結束'
  if (status.value === 'expired') return '已過回覆截止日，家長無法再填寫；請改用代填，或編輯延長截止日'
  if (!notReplied.value.length) return '全部已回覆'
  return ''
})
const canRemind = computed(() => canWrite && !remindDisabledReason.value)

// 回覆明細的純前端篩選
const responseClassroom = ref('')
const responseAttending = ref<'' | 'yes' | 'no'>('')
const responseClassrooms = computed(() => Array.from(new Set(responses.value.map((r) => r.classroom_name))).sort())
const filteredResponses = computed(() =>
  responses.value.filter((r) => {
    if (responseClassroom.value && r.classroom_name !== responseClassroom.value) return false
    if (responseAttending.value === 'yes' && !r.attending) return false
    if (responseAttending.value === 'no' && r.attending) return false
    return true
  }),
)

async function loadClassroomNames() {
  try {
    const res = await getClassrooms()
    const list = (res.data ?? []) as { id: number; name: string }[]
    classroomNames.value = Object.fromEntries(list.map((c) => [c.id, c.name]))
  } catch {
    // 班級名稱只是輔助顯示，載入失敗退回顯示班級數，不擋主流程。
  }
}

async function fetchAll() {
  loading.value = true
  try {
    const [surveyRes, statsRes, responsesRes] = await Promise.all([
      getSurvey(surveyId),
      getSurveyStats(surveyId),
      getSurveyResponses(surveyId),
    ])
    survey.value = surveyRes.data as unknown as SurveyDetail
    stats.value = statsRes.data as unknown as Stats
    responses.value = ((responsesRes.data as unknown as { items?: ResponseRow[] })?.items) ?? []
    if (survey.value.audience_type === 'classrooms') loadClassroomNames()
  } catch (e) {
    ElMessage.error(friendlyError('載入調查詳情失敗', e))
  } finally {
    loading.value = false
  }
}

function optionRows(q: StatsQuestion) {
  return buildOptionRows(q, stats.value?.attending_count ?? 0)
}
function textRows(q: StatsQuestion) {
  return buildTextRows(q)
}
function questionIndex(questionId: number): number {
  // 主題目「是否參加」固定不編號，附加題從 1 起算（與表單頁、驗證訊息同一套編號）。
  const idx = (survey.value?.questions ?? []).findIndex((q) => q.id === questionId)
  return idx >= 0 ? idx + 1 : 0
}
function formatAnswer(q: QuestionOut, answers: Record<string, unknown>): string {
  const v = answers?.[String(q.id)]
  if (v === undefined || v === null || v === '') return '—'
  if (Array.isArray(v)) return v.join('、')
  return String(v)
}
function formatUpdatedAt(iso: string | null): string {
  return iso ? formatTaipeiDateTimeMinute(iso) : '—'
}

function goEdit() {
  router.push({ name: 'survey-edit', params: { id: surveyId } })
}

async function onPublish() {
  if (!survey.value) return
  try {
    await ElMessageBox.confirm(
      `發布後會立即透過 LINE 推播給對象家長（${stats.value?.denominator ?? 0} 位學生），且題目與調查對象將無法再修改。`,
      `發布「${survey.value.title}」`,
      { confirmButtonText: '發布並推播', cancelButtonText: '再檢查一下' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await publishSurvey(surveyId)
    ElMessage.success('已發布並推播給家長')
    activeTab.value = 'stats'
    await fetchAll()
  } catch (e) {
    ElMessage.error(friendlyError('發布調查失敗', e))
  }
}

async function onClose() {
  if (!survey.value) return
  try {
    await ElMessageBox.confirm(
      '結束後家長無法再填寫；已收到的回覆會保留，仍可代填與匯出。',
      `結束「${survey.value.title}」`,
      { confirmButtonText: '結束調查', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await closeSurvey(surveyId)
    ElMessage.success('調查已結束')
    await fetchAll()
  } catch (e) {
    ElMessage.error(friendlyError('結束調查失敗', e))
  }
}

async function onDelete() {
  if (!survey.value) return
  try {
    await ElMessageBox.confirm(
      '草稿尚未發布，家長看不到；刪除後無法復原。',
      `刪除「${survey.value.title}」`,
      { type: 'warning', confirmButtonText: '刪除草稿', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await deleteSurvey(surveyId)
    ElMessage.success('已刪除')
    router.replace({ name: 'surveys' })
  } catch (e) {
    ElMessage.error(friendlyError('刪除調查失敗', e))
  }
}

async function onRemind() {
  try {
    await ElMessageBox.confirm(
      `會推播提醒給 ${notReplied.value.length} 位未回覆學生的家長；同一位家長 24 小時內不會重複收到。`,
      '一鍵催覆',
      { confirmButtonText: '推播提醒', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    const res = await remindSurvey(surveyId)
    const data = res.data as unknown as { sent: number }
    ElMessage.success(data.sent ? `已推播 ${data.sent} 位家長` : '沒有需要推播的家長（24 小時內已提醒過）')
  } catch (e) {
    ElMessage.error(friendlyError('催覆失敗', e))
  }
}

async function onExport() {
  try {
    const res = await exportSurvey(surveyId)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${survey.value?.title ?? `survey_${surveyId}`}_回覆.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('匯出成功')
  } catch (e) {
    ElMessage.error(friendlyError('匯出 Excel 失敗', e))
  }
}

// ── 代填／修改回覆 ─────────────────────────────────────────────────
interface FillTarget { student_id: number; student_name: string; classroom_name: string; existing: boolean }
const fillDialogVisible = ref(false)
const fillTarget = ref<FillTarget | null>(null)
const fillSubmitting = ref(false)
const fillForm = reactive<{ attending: boolean; answers: Record<string, unknown>; note: string }>({
  attending: true,
  answers: {},
  note: '',
})

function setAnswer(qid: number, v: unknown) {
  fillForm.answers[String(qid)] = v
}
function answerAsString(qid: number): string {
  const v = fillForm.answers[String(qid)]
  return typeof v === 'string' ? v : ''
}
function answerAsArray(qid: number): (string | number)[] {
  const v = fillForm.answers[String(qid)]
  return Array.isArray(v) ? v : []
}
function answerAsNumber(qid: number): number | undefined {
  const v = fillForm.answers[String(qid)]
  return typeof v === 'number' ? v : undefined
}

function openFillDialog(row: ResponseRow) {
  fillTarget.value = { student_id: row.student_id, student_name: row.student_name, classroom_name: row.classroom_name, existing: true }
  fillForm.attending = row.attending
  fillForm.answers = { ...row.answers }
  fillForm.note = row.note ?? ''
  fillDialogVisible.value = true
}
function openFillForNotReplied(row: StatsNotReplied) {
  fillTarget.value = { student_id: row.student_id, student_name: row.name, classroom_name: row.classroom_name, existing: false }
  fillForm.attending = true
  fillForm.answers = {}
  fillForm.note = ''
  fillDialogVisible.value = true
}

async function onFillSubmit() {
  if (!fillTarget.value) return
  if (fillForm.attending) {
    const missing = firstUnansweredRequiredQuestion(survey.value?.questions ?? [], fillForm.answers)
    if (missing) {
      ElMessage.warning(`「${missing}」為必填`)
      return
    }
  }
  fillSubmitting.value = true
  try {
    const answers = fillForm.attending ? fillForm.answers : {}
    await adminFillResponse(surveyId, fillTarget.value.student_id, {
      attending: fillForm.attending,
      answers,
      note: fillForm.note || null,
    })
    ElMessage.success(`已代填 ${fillTarget.value.student_name} 的回覆`)
    fillDialogVisible.value = false
    await fetchAll()
  } catch (e) {
    ElMessage.error(friendlyError('代填送出失敗', e))
  } finally {
    fillSubmitting.value = false
  }
}

onMounted(async () => {
  await fetchAll()
  // 草稿沒有回覆可看，先給「題目」讓行政確認發布前的內容。
  if (isDraft.value) activeTab.value = 'questions'
})
</script>

<template>
  <div class="survey-detail" v-loading="loading">
    <PageHeader :title="survey?.title ?? ''" :subtitle="subtitle">
      <template #title-extra>
        <el-tag v-if="survey" :type="statusTag" :effect="status === 'closed' ? 'plain' : 'light'" data-test="survey-status">
          {{ statusLabel }}
        </el-tag>
      </template>
      <template #actions>
        <template v-if="canWrite && status === 'draft'">
          <el-button link type="danger" data-test="action-delete" @click="onDelete">刪除草稿</el-button>
          <el-button data-test="action-edit" @click="goEdit">編輯</el-button>
          <el-button type="primary" data-test="action-publish" @click="onPublish">發布並推播</el-button>
        </template>
        <template v-else-if="canWrite && (status === 'open' || status === 'expired')">
          <el-button data-test="action-edit" @click="goEdit">{{ status === 'expired' ? '編輯／延長截止' : '編輯' }}</el-button>
          <el-tooltip :content="remindDisabledReason" :disabled="!remindDisabledReason" placement="bottom">
            <span>
              <el-button :disabled="!canRemind" data-test="action-remind" @click="onRemind">一鍵催覆</el-button>
            </span>
          </el-tooltip>
          <el-button :type="status === 'expired' ? 'primary' : 'default'" :plain="status === 'expired'" data-test="action-close" @click="onClose">結束調查</el-button>
        </template>
        <el-button v-if="!isDraft" :icon="Download" data-test="action-export" @click="onExport">匯出 Excel</el-button>
      </template>
    </PageHeader>

    <el-descriptions v-if="survey" :column="3" class="survey-meta" data-test="survey-meta">
      <el-descriptions-item label="調查對象">{{ audienceText }}</el-descriptions-item>
      <el-descriptions-item label="回覆截止">{{ deadlineText }}</el-descriptions-item>
      <el-descriptions-item label="活動日期">{{ survey.event_date || '未定' }}</el-descriptions-item>
      <el-descriptions-item label="地點">{{ survey.location || '—' }}</el-descriptions-item>
      <el-descriptions-item label="費用">{{ survey.fee_note || '—' }}</el-descriptions-item>
      <el-descriptions-item label="發布時間">{{ survey.published_at ? formatTaipeiDateTimeMinute(survey.published_at) : '尚未發布' }}</el-descriptions-item>
    </el-descriptions>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="統計" name="stats">
        <el-alert
          v-if="isDraft"
          type="info"
          :closable="false"
          show-icon
          title="尚未發布"
          description="發布並推播後，家長的回覆會在這裡累積；現在先到「題目」確認內容。"
          class="draft-alert"
        />

        <section v-if="overview" class="section" data-test="overview">
          <h3 class="section__title">回覆總覽</h3>
          <p class="overview__summary">
            對象 <strong>{{ overview.denominator }}</strong> 位學生 ·
            已回覆 <strong>{{ overview.replied }}</strong>（{{ overview.repliedPercent }}%）·
            參加 <strong>{{ overview.attending }}</strong> ·
            不參加 <strong>{{ overview.notAttending }}</strong> ·
            未回覆 <strong>{{ overview.notReplied }}</strong>
          </p>
          <div class="overview__bar" role="img" :aria-label="`參加 ${overview.attending}、不參加 ${overview.notAttending}、未回覆 ${overview.notReplied}`">
            <div
              v-for="seg in overview.segments"
              :key="seg.key"
              class="overview__seg"
              :class="`overview__seg--${seg.key}`"
              :style="{ width: `${seg.percent}%` }"
            />
          </div>
          <ul class="overview__legend">
            <li v-for="seg in overview.segments" :key="seg.key" class="overview__legend-item">
              <span class="overview__dot" :class="`overview__seg--${seg.key}`" aria-hidden="true" />
              {{ seg.label }} {{ seg.count }}<span class="cell-sub">（{{ seg.percent }}%）</span>
            </li>
          </ul>
        </section>

        <section v-if="classroomRows.length" class="section" data-test="classroom-progress">
          <h3 class="section__title">各班回覆進度<span class="section__hint">未回覆多的班排前面</span></h3>
          <el-table :data="classroomRows" size="small">
            <el-table-column label="班級" prop="classroom_name" :width="isMobile ? 90 : 140" />
            <el-table-column label="回覆進度" :min-width="isMobile ? 90 : 220">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress v-if="!isMobile" :percentage="row.repliedPercent" :stroke-width="8" :show-text="false" class="progress-cell__bar" />
                  <span class="progress-cell__text">{{ row.replied }} / {{ row.total }}<span v-if="isMobile" class="cell-sub">（{{ row.repliedPercent }}%）</span></span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="未回覆" :width="isMobile ? 70 : 90" align="right">
              <template #default="{ row }">
                <span :class="{ 'num--warn': row.notReplied > 0 }">{{ row.notReplied }}</span>
              </template>
            </el-table-column>
            <el-table-column label="參加" prop="attending" :width="isMobile ? 60 : 80" align="right" />
          </el-table>
        </section>

        <section v-if="stats && survey && survey.questions.length" class="section" data-test="question-stats">
          <h3 class="section__title">
            附加題統計
            <span class="section__hint">以回覆「參加」的 {{ stats.attending_count }} 位為分母</span>
          </h3>
          <div class="question-stats">
            <article v-for="q in stats.questions" :key="q.question_id" class="qstat">
              <header class="qstat__head">
                <span class="qstat__index">附加題 {{ questionIndex(q.question_id) }}</span>
                <span class="qstat__text">{{ q.question_text }}</span>
                <span class="cell-sub">{{ QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type }}</span>
              </header>
              <ul v-if="q.option_counts" class="qstat__options">
                <li v-for="opt in optionRows(q)" :key="opt.label" class="qstat__option">
                  <span class="qstat__label">{{ opt.label }}</span>
                  <span class="qstat__track"><span class="qstat__fill" :style="{ width: `${Math.min(opt.percent, 100)}%` }" /></span>
                  <span class="qstat__count">{{ opt.count }}<span class="cell-sub">（{{ opt.percent }}%）</span></span>
                </li>
              </ul>
              <p v-else-if="q.question_type === SURVEY_QUESTION_TYPES.NUMBER" class="qstat__number">
                總和 <strong>{{ q.sum ?? 0 }}</strong> · 平均 <strong>{{ (q.avg ?? 0).toFixed(1) }}</strong>
              </p>
              <ul v-else-if="textRows(q).length" class="qstat__texts">
                <li v-for="(t, i) in textRows(q)" :key="i"><span class="qstat__who">{{ t.student_name }}</span>{{ t.value }}</li>
              </ul>
              <p v-else class="cell-sub">尚無作答</p>
            </article>
          </div>
        </section>

        <section class="section" data-test="not-replied">
          <div class="section__head">
            <h3 class="section__title">未回覆名單<span class="section__hint">{{ notReplied.length }} 位</span></h3>
            <el-tooltip :content="remindDisabledReason" :disabled="!remindDisabledReason" placement="top">
              <span>
                <el-button v-if="canWrite" :disabled="!canRemind" data-test="remind-inline" @click="onRemind">一鍵催覆</el-button>
              </span>
            </el-tooltip>
          </div>
          <el-table :data="notReplied" size="small">
            <template #empty>
              <EmptyState variant="inline" :title="isDraft ? '發布後才會有對象名單' : '全部已回覆'" />
            </template>
            <el-table-column label="班級" prop="classroom_name" width="140" />
            <el-table-column label="姓名" prop="name" min-width="120" />
            <el-table-column v-if="canWrite && !isDraft" label="" width="100" align="right">
              <template #default="{ row }">
                <el-button size="small" data-test="fill-not-replied" @click="openFillForNotReplied(row)">代填</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane :label="`回覆明細 ${responses.length}`" name="responses">
        <div class="responses-toolbar">
          <el-select v-model="responseClassroom" placeholder="全部班級" clearable class="responses-toolbar__select">
            <el-option v-for="c in responseClassrooms" :key="c" :label="c" :value="c" />
          </el-select>
          <el-radio-group v-model="responseAttending" size="small">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="yes">參加</el-radio-button>
            <el-radio-button value="no">不參加</el-radio-button>
          </el-radio-group>
          <span class="cell-sub">顯示 {{ filteredResponses.length }} / 共 {{ responses.length }} 筆</span>
        </div>
        <el-table :data="filteredResponses">
          <template #empty><EmptyState variant="inline" title="尚無回覆" /></template>
          <el-table-column label="班級" prop="classroom_name" width="120" />
          <el-table-column label="姓名" prop="student_name" width="110" />
          <el-table-column label="參加" width="90">
            <template #default="{ row }">
              <el-tag :type="row.attending ? 'success' : 'info'" size="small" :effect="row.attending ? 'light' : 'plain'">
                {{ row.attending ? '參加' : '不參加' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-for="q in survey?.questions ?? []"
            :key="q.id"
            :label="q.question_text"
            min-width="140"
          >
            <template #default="{ row }">{{ formatAnswer(q, row.answers) }}</template>
          </el-table-column>
          <el-table-column label="備註" prop="note" min-width="140">
            <template #default="{ row }">{{ row.note || '—' }}</template>
          </el-table-column>
          <el-table-column label="來源" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.is_proxy" type="warning" size="small" effect="plain">代填</el-tag>
              <span v-else class="cell-sub">家長</span>
            </template>
          </el-table-column>
          <el-table-column label="更新時間" width="150">
            <template #default="{ row }">{{ formatUpdatedAt(row.updated_at) }}</template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="" width="90" align="right">
            <template #default="{ row }">
              <el-button size="small" @click="openFillDialog(row)">修改</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`題目 ${(survey?.questions.length ?? 0) + 1}`" name="questions">
        <div v-if="survey" class="preview" data-test="question-preview">
          <p v-if="survey.description" class="preview__desc">{{ survey.description }}</p>
          <p v-else class="cell-sub">沒有活動說明</p>
          <ol class="preview__list">
            <li class="preview__q preview__q--fixed">
              <div class="preview__q-head">
                <span class="preview__q-index">主題目</span>
                <span class="preview__q-text">是否參加</span>
                <el-tag size="small" effect="plain">固定</el-tag>
                <el-tag size="small" type="danger" effect="plain">必填</el-tag>
              </div>
              <ul class="preview__options"><li>參加</li><li>不參加</li></ul>
              <p class="cell-sub">家長回答「不參加」時不需填寫下面的附加題。</p>
            </li>
            <li v-for="(q, i) in survey.questions" :key="q.id" class="preview__q">
              <div class="preview__q-head">
                <span class="preview__q-index">附加題 {{ i + 1 }}</span>
                <span class="preview__q-text">{{ q.question_text }}</span>
                <el-tag size="small" effect="plain">{{ QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type }}</el-tag>
                <el-tag v-if="q.is_required" size="small" type="danger" effect="plain">必填</el-tag>
              </div>
              <ul v-if="q.options" class="preview__options">
                <li v-for="opt in q.options" :key="opt">{{ opt }}</li>
              </ul>
            </li>
          </ol>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="fillDialogVisible" :title="fillTarget?.existing ? '修改回覆' : '代填回覆'" width="520px">
      <el-form v-if="fillTarget" label-width="88px">
        <el-form-item label="學生">
          <strong>{{ fillTarget.student_name }}</strong>
          <span class="cell-sub fill-classroom">{{ fillTarget.classroom_name }}</span>
        </el-form-item>
        <el-form-item label="是否參加">
          <el-radio-group v-model="fillForm.attending">
            <el-radio :value="true">參加</el-radio>
            <el-radio :value="false">不參加</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="fillForm.attending">
          <el-form-item v-for="q in survey?.questions ?? []" :key="q.id" :label="q.question_text" :required="q.is_required">
            <el-radio-group
              v-if="q.question_type === SURVEY_QUESTION_TYPES.SINGLE_CHOICE"
              :model-value="answerAsString(q.id)"
              @update:model-value="v => setAnswer(q.id, v)"
            >
              <el-radio v-for="opt in q.options ?? []" :key="opt" :value="opt">{{ opt }}</el-radio>
            </el-radio-group>
            <el-checkbox-group
              v-else-if="q.question_type === SURVEY_QUESTION_TYPES.MULTI_CHOICE"
              :model-value="answerAsArray(q.id)"
              @update:model-value="v => setAnswer(q.id, v)"
            >
              <el-checkbox v-for="opt in q.options ?? []" :key="opt" :value="opt">{{ opt }}</el-checkbox>
            </el-checkbox-group>
            <el-input-number
              v-else-if="q.question_type === SURVEY_QUESTION_TYPES.NUMBER"
              :model-value="answerAsNumber(q.id)"
              :min="0"
              @update:model-value="v => setAnswer(q.id, v)"
            />
            <el-input
              v-else
              :model-value="answerAsString(q.id)"
              type="textarea"
              :rows="2"
              maxlength="500"
              @update:model-value="v => setAnswer(q.id, v)"
            />
          </el-form-item>
        </template>
        <el-form-item label="備註">
          <el-input v-model="fillForm.note" maxlength="500" placeholder="例如：家長電話告知" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fillDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="fillSubmitting" @click="onFillSubmit">送出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.survey-meta {
  margin-bottom: var(--space-4);
}
.draft-alert {
  margin-bottom: var(--space-4);
}
.section {
  margin-bottom: var(--space-6);
}
.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.section__title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}
.section__hint {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-regular);
  color: var(--el-text-color-secondary);
}
.cell-sub {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.num--warn {
  color: var(--color-warning-darker);
  font-weight: var(--font-weight-semibold);
}

.overview__summary {
  margin: 0 0 var(--space-2);
  color: var(--el-text-color-regular);
}
.overview__summary strong {
  font-variant-numeric: tabular-nums;
}
.overview__bar {
  display: flex;
  height: 14px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--neutral-200);
}
.overview__seg {
  height: 100%;
  transition: width var(--transition-base);
}
.overview__seg--attending { background: var(--color-success); }
.overview__seg--not_attending { background: var(--neutral-400); }
.overview__seg--not_replied { background: var(--color-warning-soft); }
.overview__legend {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.overview__legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
}
.overview__dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  display: inline-block;
  border: 1px solid var(--neutral-300);
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.progress-cell__bar {
  flex: 1;
  min-width: 80px;
}
.progress-cell__text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.question-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
}
.qstat {
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}
.qstat__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
}
.qstat__index {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.qstat__text {
  font-weight: var(--font-weight-medium);
}
.qstat__options,
.qstat__texts {
  list-style: none;
  margin: 0;
  padding: 0;
}
.qstat__option {
  display: grid;
  grid-template-columns: minmax(64px, 1fr) 2fr auto;
  align-items: center;
  gap: var(--space-2);
  padding: 2px 0;
}
.qstat__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qstat__track {
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--neutral-100);
  overflow: hidden;
}
.qstat__fill {
  display: block;
  height: 100%;
  background: var(--el-color-primary);
  border-radius: var(--radius-full);
}
.qstat__count {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.qstat__number {
  margin: 0;
}
.qstat__texts li {
  padding: 2px 0;
  border-bottom: 1px dashed var(--neutral-200);
}
.qstat__texts li:last-child {
  border-bottom: 0;
}
.qstat__who {
  color: var(--el-text-color-secondary);
  margin-right: var(--space-2);
}

.responses-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}
.responses-toolbar__select {
  width: 160px;
}

.preview {
  max-width: 720px;
}
.preview__desc {
  white-space: pre-wrap;
  margin: 0 0 var(--space-4);
  color: var(--el-text-color-regular);
}
.preview__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.preview__q {
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--neutral-200);
}
.preview__q:last-child {
  border-bottom: 0;
}
.preview__q--fixed {
  background: var(--neutral-50);
  border-radius: var(--radius-md);
  border-bottom: 0;
  margin-bottom: var(--space-2);
}
.preview__q-index {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.preview__q-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.preview__q-text {
  font-weight: var(--font-weight-medium);
}
.preview__options {
  margin: var(--space-1) 0 0;
  padding-left: var(--space-4);
  color: var(--el-text-color-regular);
}
.fill-classroom {
  margin-left: var(--space-2);
}

@media (max-width: 768px) {
  .question-stats {
    grid-template-columns: 1fr;
  }
  .survey-meta :deep(.el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
