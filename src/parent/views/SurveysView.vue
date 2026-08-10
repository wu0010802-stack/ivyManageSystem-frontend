<script setup lang="ts">
/**
 * 家長端「活動參加調查」列表＋填寫（Task 17）。
 *
 * 卡片＝調查 × 孩子（同一份調查、多個孩子各自一張卡）。
 * 深連結（推播）：route.params.surveyId 存在時，載入完成後自動找到「該生 × 該調查」
 * 對應的卡片開啟填寫 sheet；若清單中找不到（非自己小孩的調查等），不拋錯，僅 toast 提示。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getParentSurvey, listParentSurveys, submitSurveyResponse } from '../api/surveys'
import { useFriendlyError } from '@/composables/useFriendlyError'
import { toast } from '../utils/toast'
import M3SegmentedButton from '../components/m3/M3SegmentedButton.vue'
import StatusPill from '../components/StatusPill.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SurveyFillSheet from '../components/surveys/SurveyFillSheet.vue'

interface Question {
  id: number
  question_text: string
  question_type: string
  options: string[] | null
  is_required: boolean
}

interface SurveyDetail {
  survey_id: number
  title: string
  fee_note: string | null
  event_date: string | null
  location: string | null
  reply_deadline: string
  questions: Question[]
}

interface Card {
  survey_id: number
  title: string
  event_date: string | null
  location: string | null
  fee_note: string | null
  reply_deadline: string
  status: string
  is_open: boolean
  student_id: number
  student_name: string
  my_response: { attending: boolean; answers: Record<string, unknown>; note: string | null } | null
}

const route = useRoute()
const { getFriendly } = useFriendlyError()

function _toastFriendly(err: unknown, fallback: string) {
  const f = getFriendly(err)
  const msg = f.message || fallback
  const text = f.nextStep ? `${msg}｜${f.nextStep}` : msg
  if (f.level === 'info') toast.info(text)
  else if (f.level === 'warning') toast.warn(text)
  else toast.error(text)
}

const tab = ref<'pending' | 'done'>('pending')
const cards = ref<Card[]>([])
const loading = ref(false)
const loadError = ref(false)

const pending = computed(() => cards.value.filter((c) => c.is_open && !c.my_response))
const done = computed(() => cards.value.filter((c) => !(c.is_open && !c.my_response)))
const visibleCards = computed(() => (tab.value === 'pending' ? pending.value : done.value))

function pillFor(card: Card): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (card.is_open && !card.my_response) return { label: '待回覆', tone: 'warn' }
  if (card.my_response?.attending === true) return { label: '參加', tone: 'ok' }
  if (card.my_response?.attending === false) return { label: '不參加', tone: 'neutral' }
  return { label: '已截止未回覆', tone: 'danger' }
}

const showSheet = ref(false)
const submitting = ref(false)
const activeCard = ref<Card | null>(null)
const activeSurvey = ref<SurveyDetail | null>(null)
const form = ref<{ attending: boolean | null; answers: Record<string, unknown>; note: string }>({
  attending: null,
  answers: {},
  note: '',
})

async function openFill(card: Card) {
  activeCard.value = card
  try {
    const res = await getParentSurvey(card.survey_id)
    activeSurvey.value = res.data as SurveyDetail
  } catch (err) {
    _toastFriendly(err, '載入失敗')
    activeCard.value = null
    return
  }
  const mine = card.my_response
  form.value = mine
    ? { attending: mine.attending, answers: { ...mine.answers }, note: mine.note ?? '' }
    : { attending: null, answers: {}, note: '' }
  showSheet.value = true
}

async function submit() {
  if (!activeCard.value || form.value.attending === null) return
  submitting.value = true
  try {
    await submitSurveyResponse(activeCard.value.survey_id, activeCard.value.student_id, {
      attending: form.value.attending,
      answers: form.value.answers,
      note: form.value.note || null,
    })
    toast.success('已送出回覆')
    showSheet.value = false
    await fetchData()
  } catch (err) {
    _toastFriendly(err, '送出失敗')
  } finally {
    submitting.value = false
  }
}

async function fetchData() {
  loading.value = true
  loadError.value = false
  try {
    const { data } = await listParentSurveys()
    cards.value = (data as { items?: Card[] })?.items || []
    await maybeOpenDeepLink()
  } catch (err) {
    loadError.value = true
    _toastFriendly(err, '載入失敗')
  } finally {
    loading.value = false
  }
}

async function maybeOpenDeepLink() {
  const surveyId = route.params.surveyId
  if (!surveyId) return
  const id = Number(surveyId)
  const card = cards.value.find((c) => c.survey_id === id)
  if (!card) {
    toast.info('找不到這份調查，可能不屬於您的孩子')
    return
  }
  await openFill(card)
}

onMounted(fetchData)

async function pullRefresh() {
  await fetchData()
}

defineExpose({ pullRefresh })
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="surveys-view">
    <h1 class="surveys-title">活動參加調查</h1>

    <M3SegmentedButton
      :model-value="tab"
      :items="[
        { value: 'pending', label: '待回覆', icon: 'pending_actions' },
        { value: 'done', label: '已回覆', icon: 'task_alt' },
      ]"
      @update:model-value="tab = $event as 'pending' | 'done'"
    />

    <SkeletonBlock v-if="loading && cards.length === 0" variant="card" :count="3" />

    <MobileErrorRetry v-else-if="loadError && cards.length === 0" @retry="fetchData" />

    <template v-else>
      <EmptyState
        v-if="visibleCards.length === 0"
        variant="mobile"
        title="目前沒有調查"
      />

      <button
        v-for="card in visibleCards"
        :key="`${card.survey_id}-${card.student_id}`"
        type="button"
        class="survey-card"
        @click="openFill(card)"
      >
        <div class="survey-card-head">
          <span class="survey-card-title">{{ card.title }}</span>
          <StatusPill :label="pillFor(card).label" :tone="pillFor(card).tone" />
        </div>
        <span class="survey-card-child">{{ card.student_name }}</span>
        <div class="survey-card-meta">
          <span v-if="card.event_date">📅 {{ card.event_date }}</span>
          <span v-if="card.fee_note">💰 {{ card.fee_note }}</span>
          <span v-if="card.is_open">回覆截止：{{ card.reply_deadline }}</span>
        </div>
      </button>
    </template>

    <SurveyFillSheet
      v-model="showSheet"
      :survey="activeSurvey"
      :student-name="activeCard?.student_name ?? ''"
      :form-data="form"
      :submitting="submitting"
      @update:form-data="form = $event"
      @submit="submit"
    />
  </PullToRefresh>
</template>

<style scoped>
.surveys-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.surveys-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.survey-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 14px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 12px;
  background: var(--pt-surface-card, var(--neutral-0));
  cursor: pointer;
  font-family: inherit;
}

.survey-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.survey-card-title {
  font-size: 15px;
  font-weight: 600;
}

.survey-card-child {
  font-size: 13px;
  color: var(--pt-text-muted);
}

.survey-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--pt-text-muted);
}
</style>
