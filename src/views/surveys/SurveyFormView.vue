<template>
  <div v-if="authorized" class="survey-form">
    <PageHeader
      :title="isEdit ? '編輯調查' : '建立調查'"
      :subtitle="isEdit ? draft.title : '建立後先存成草稿，到詳情頁確認題目再發布推播給家長。'"
    />

    <el-alert
      v-if="locked"
      type="info"
      show-icon
      :closable="false"
      title="調查已結束，內容僅供檢視"
      class="form-alert"
    />
    <el-alert
      v-else-if="lockStructure"
      type="warning"
      show-icon
      :closable="false"
      title="已發布：題目、調查對象與活動日期已鎖定"
      description="仍可修改標題、說明、地點、費用備註與回覆截止日；要延長截止就改截止日後儲存。"
      class="form-alert"
      data-test="lock-alert"
    />

    <el-form label-position="top" :disabled="locked" class="form">
      <section class="form-section">
        <h3 class="form-section__title">活動資訊</h3>
        <el-form-item label="調查標題" required>
          <el-input v-model="draft.title" maxlength="100" show-word-limit placeholder="例如：秋季戶外教學參加調查" />
        </el-form-item>
        <el-form-item label="活動說明">
          <el-input
            v-model="draft.description"
            type="textarea"
            :rows="4"
            placeholder="家長在 LINE 會看到這段說明：活動內容、集合時間地點、注意事項…"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="活動日期">
            <el-date-picker v-model="draft.event_date" type="date" value-format="YYYY-MM-DD" :disabled="lockStructure" placeholder="選擇日期" class="form-grid__picker" />
          </el-form-item>
          <el-form-item label="地點">
            <el-input v-model="draft.location" maxlength="200" placeholder="例如：宜蘭綠色博覽會園區" />
          </el-form-item>
          <el-form-item label="費用備註">
            <el-input v-model="draft.fee_note" maxlength="200" placeholder="例如：每人 350 元，活動當天現場繳交" />
            <div class="field-hint">純文字告知，不會產生繳費紀錄。</div>
          </el-form-item>
        </div>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">對象與截止</h3>
        <el-form-item label="調查對象">
          <el-radio-group v-model="draft.audience_type" :disabled="lockStructure">
            <el-radio value="all">全園</el-radio>
            <el-radio value="classrooms">指定班級</el-radio>
          </el-radio-group>
          <div v-if="draft.audience_type === 'classrooms'" class="classroom-picker" data-test="classroom-picker">
            <el-checkbox-group v-model="draft.classroom_ids" :disabled="lockStructure">
              <el-checkbox v-for="c in classroomOptions" :key="c.id" :value="c.id">{{ c.name }}</el-checkbox>
            </el-checkbox-group>
            <div class="field-hint">
              已選 {{ draft.classroom_ids.length }} 個班級<template v-if="!draft.classroom_ids.length">，發布前至少要選一個</template>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="回覆截止日" required>
          <el-date-picker v-model="draft.reply_deadline" type="date" value-format="YYYY-MM-DD" placeholder="選擇日期" class="form-grid__picker" />
          <div class="field-hint">家長可填寫至截止當日；截止後只能由老師或行政代填。</div>
          <div v-for="hint in deadlineWarnings" :key="hint" class="field-hint field-hint--warn" data-test="deadline-hint">{{ hint }}</div>
        </el-form-item>
      </section>

      <section class="form-section">
        <h3 class="form-section__title">
          題目
          <span class="form-section__hint">家長先回答是否參加；回答「不參加」就不用填附加題</span>
        </h3>

        <div class="fixed-question" data-test="fixed-question">
          <div class="question-row">
            <span class="question-index">主題目</span>
            <span class="fixed-question__text">是否參加</span>
            <el-tag size="small" effect="plain">固定</el-tag>
            <el-tag size="small" type="danger" effect="plain">必填</el-tag>
          </div>
          <div class="fixed-question__options">選項：參加／不參加</div>
        </div>

        <div class="questions">
          <div v-for="(q, i) in draft.questions" :key="i" class="question-card" data-test="question-card">
            <div class="question-row">
              <span class="question-index">附加題 {{ i + 1 }}</span>
              <el-select v-model="q.question_type" placeholder="題型" class="question-type" :disabled="lockStructure" @change="onTypeChange(i)">
                <el-option label="單選" :value="SURVEY_QUESTION_TYPES.SINGLE_CHOICE" />
                <el-option label="多選" :value="SURVEY_QUESTION_TYPES.MULTI_CHOICE" />
                <el-option label="數字" :value="SURVEY_QUESTION_TYPES.NUMBER" />
                <el-option label="文字" :value="SURVEY_QUESTION_TYPES.TEXT" />
              </el-select>
              <el-input v-model="q.question_text" :placeholder="questionPlaceholder(q.question_type)" maxlength="200" :disabled="lockStructure" class="question-text" />
              <el-switch v-model="q.is_required" active-text="必填" :disabled="lockStructure" class="question-required" />
              <el-button-group class="question-tools">
                <el-button :disabled="lockStructure || i === 0" :icon="ArrowUp" aria-label="上移" @click="moveQuestion(draft, i, -1)" />
                <el-button :disabled="lockStructure || i === draft.questions.length - 1" :icon="ArrowDown" aria-label="下移" @click="moveQuestion(draft, i, 1)" />
                <el-button :disabled="lockStructure" :icon="Delete" aria-label="刪除題目" @click="removeQuestion(draft, i)" />
              </el-button-group>
            </div>
            <div v-if="q.options" class="options-list">
              <div v-for="(_, oi) in q.options" :key="oi" class="option-item">
                <span class="option-item__index">{{ oi + 1 }}.</span>
                <el-input v-model="q.options[oi]" placeholder="選項內容" maxlength="50" :disabled="lockStructure" class="option-item__input" />
                <el-button
                  :disabled="lockStructure || q.options.length <= 2"
                  :icon="Close"
                  link
                  aria-label="移除選項"
                  @click="q.options?.splice(oi, 1)"
                />
              </div>
              <el-button :disabled="lockStructure" link type="primary" class="add-option" @click="q.options?.push('')">＋ 新增選項</el-button>
            </div>
          </div>

          <div v-if="!lockStructure" class="add-question-bar">
            <span class="add-question-bar__label">新增附加題</span>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.SINGLE_CHOICE)">單選</el-button>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.MULTI_CHOICE)">多選</el-button>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.NUMBER)">數字</el-button>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.TEXT)">文字</el-button>
            <span v-if="!draft.questions.length" class="field-hint">沒有附加題也可以發布，家長只回答是否參加。</span>
          </div>
          <div v-else-if="!draft.questions.length" class="field-hint">沒有附加題。</div>
        </div>
      </section>
    </el-form>

    <div class="form-footer">
      <ul v-if="errors.length" class="form-errors" role="alert" data-test="form-errors">
        <li v-for="err in errors" :key="err">{{ err }}</li>
      </ul>
      <div class="form-footer__actions">
        <template v-if="!locked">
          <el-button type="primary" :loading="submitting" data-test="submit" @click="onSubmit">{{ isEdit ? '儲存' : '建立草稿' }}</el-button>
          <el-button @click="onCancel">取消</el-button>
          <span v-if="!isEdit" class="field-hint">建立後家長還看不到，要到詳情頁按「發布並推播」。</span>
        </template>
        <el-button v-else @click="router.push(surveyId ? { name: 'survey-detail', params: { id: surveyId } } : { name: 'surveys' })">返回</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Close, Delete } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { createSurvey, getSurvey, updateSurvey } from '@/api/surveys'
import { getClassrooms } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { todayTaipeiISO } from '@/utils/format'
import { SURVEY_QUESTION_TYPES, isSurveyChoiceType } from '@/constants/surveyQuestionTypes'
import {
  addQuestion,
  deadlineHints,
  emptyDraft,
  isDraftDirty,
  moveQuestion,
  removeQuestion,
  validateDraft,
  type SurveyDraft,
} from './surveyFormModel'

const route = useRoute()
const router = useRouter()

// 驗收條件（2026-08-10 controller 追加，Task 13 審查裁定；2026-08-10 審查修正②：
// 光是導頁不夠，導頁完成前 template 會以完全可編輯狀態渲染、onMounted 仍會照發請求，
// 必須用 authorized 旗標同時擋渲染與資料載入）：
// 動態路由 /surveys/:id/edit 在路由層無法表達 SURVEYS_WRITE 門檻（僅 SURVEYS_READ prefix 涵蓋），
// 本頁必須自行檢查權限，無權者導回列表、不渲染表單、不發任何請求。
const authorized = hasPermission('SURVEYS_WRITE')
if (!authorized) {
  ElMessage.warning('您沒有管理調查的權限')
  router.replace({ name: 'surveys' })
}

const surveyId = computed(() => {
  const raw = route.params.id
  const idStr = Array.isArray(raw) ? raw[0] : raw
  return idStr ? Number(idStr) : null
})
const isEdit = computed(() => surveyId.value !== null)

const draft = ref<SurveyDraft>(emptyDraft())
// 取消時比對用的基準快照：新建模式即空草稿，編輯模式於 loadSurvey() 載入後覆寫。
const baseline = ref<SurveyDraft>(emptyDraft())
const status = ref('draft')
const submitting = ref(false)
const errors = ref<string[]>([])
let allowRouteLeave = false
const today = todayTaipeiISO()

// closed：全鎖；published：僅結構（event_date/對象/題目）鎖，其餘（title/description/location/fee_note/reply_deadline）可改
const locked = computed(() => status.value === 'closed')
const lockStructure = computed(() => status.value === 'published' || status.value === 'closed')
const deadlineWarnings = computed(() => deadlineHints(draft.value, today))

interface ClassroomOption { id: number; name: string }
const classroomOptions = ref<ClassroomOption[]>([])

function questionPlaceholder(type: string): string {
  if (type === SURVEY_QUESTION_TYPES.NUMBER) return '題目文字，例如：隨行家長人數'
  if (type === SURVEY_QUESTION_TYPES.TEXT) return '題目文字，例如：飲食需求或過敏事項'
  if (type === SURVEY_QUESTION_TYPES.MULTI_CHOICE) return '題目文字，例如：需要的服務（可複選）'
  return '題目文字，例如：是否搭乘遊覽車'
}

async function loadClassrooms() {
  try {
    const res = await getClassrooms({ current_only: true })
    const list = (res.data ?? []) as ClassroomOption[]
    classroomOptions.value = list.map(c => ({ id: c.id, name: c.name }))
  } catch (e) {
    ElMessage.error(friendlyError('載入班級清單失敗', e))
  }
}

async function loadSurvey() {
  if (!surveyId.value) return
  try {
    const res = await getSurvey(surveyId.value)
    const data = res.data as unknown as SurveyDraft & { status: string }
    status.value = data.status
    draft.value = {
      title: data.title,
      description: data.description ?? '',
      event_date: data.event_date ?? null,
      location: data.location ?? '',
      fee_note: data.fee_note ?? '',
      audience_type: data.audience_type,
      classroom_ids: data.classroom_ids ?? [],
      reply_deadline: data.reply_deadline,
      questions: (data.questions ?? []).map(q => ({
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options ?? null,
        is_required: q.is_required,
        sort_order: q.sort_order,
      })),
    }
    baseline.value = JSON.parse(JSON.stringify(draft.value)) as SurveyDraft
  } catch (e) {
    ElMessage.error(friendlyError('載入調查資料失敗', e))
    router.replace({ name: 'surveys' })
  }
}

function onTypeChange(i: number) {
  const q = draft.value.questions[i]
  const isChoice = isSurveyChoiceType(q.question_type)
  q.options = isChoice ? (q.options && q.options.length >= 2 ? q.options : ['', '']) : null
}

async function onSubmit() {
  const forPublish = status.value === 'published'
  errors.value = validateDraft(draft.value, forPublish)
  if (errors.value.length > 0) {
    ElMessage.warning(errors.value[0])
    return
  }
  submitting.value = true
  try {
    const payload = {
      title: draft.value.title,
      description: draft.value.description || null,
      event_date: draft.value.event_date,
      location: draft.value.location || null,
      fee_note: draft.value.fee_note || null,
      audience_type: draft.value.audience_type,
      classroom_ids: draft.value.classroom_ids,
      reply_deadline: draft.value.reply_deadline,
      questions: draft.value.questions,
    }
    if (isEdit.value && surveyId.value) {
      await updateSurvey(surveyId.value, payload)
      ElMessage.success('已儲存')
      allowRouteLeave = true
      router.push({ name: 'survey-detail', params: { id: surveyId.value } })
    } else {
      const res = await createSurvey(payload)
      const data = res.data as unknown as { id: number }
      ElMessage.success('已建立草稿，確認題目後再發布')
      allowRouteLeave = true
      router.push({ name: 'survey-detail', params: { id: data.id } })
    }
  } catch (e) {
    ElMessage.error(friendlyError(isEdit.value ? '儲存調查失敗' : '建立調查失敗', e))
  } finally {
    submitting.value = false
  }
}

const confirmDiscardChanges = async (): Promise<boolean> => {
  if (allowRouteLeave || !isDraftDirty(baseline.value, draft.value)) return true
  try {
    await ElMessageBox.confirm('尚未儲存的變更將會遺失，確定離開？', '放棄編輯', {
      confirmButtonText: '放棄變更',
      cancelButtonText: '繼續編輯',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

onBeforeRouteLeave(() => confirmDiscardChanges())

const onCancel = async () => {
  if (!await confirmDiscardChanges()) return
  allowRouteLeave = true
  // 固定回調查列表：router.back() 在直接開連結進來時無處可回。
  router.push({ name: 'surveys' })
}

onMounted(async () => {
  if (!authorized) return
  // 效能（2026-08-21）：loadClassrooms 與 loadSurvey 各自獨立來源、互不依賴，
  // isEdit 時改平行發送；非 isEdit（新建）路徑行為不變，仍只呼叫 loadClassrooms。
  if (isEdit.value) {
    await Promise.all([loadClassrooms(), loadSurvey()])
  } else {
    await loadClassrooms()
  }
})
</script>

<style scoped>
.form-alert {
  margin-bottom: var(--space-4);
}
.form {
  max-width: 880px;
}
.form-section {
  padding: var(--space-4) 0 var(--space-2);
  border-bottom: 1px solid var(--neutral-200);
  margin-bottom: var(--space-4);
}
.form-section:last-of-type {
  border-bottom: 0;
}
.form-section__title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.form-section__hint {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-regular);
  color: var(--el-text-color-secondary);
}
.form-grid {
  display: grid;
  grid-template-columns: 200px 1fr 1fr;
  gap: 0 var(--space-4);
}
.form-grid__picker {
  width: 100%;
}
.field-hint {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  line-height: var(--line-height-base);
}
.field-hint--warn {
  color: var(--color-warning-darker);
}
.classroom-picker {
  width: 100%;
  margin-top: var(--space-2);
}

.fixed-question {
  background: var(--neutral-50);
  border: 1px dashed var(--neutral-300);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
}
.fixed-question__text {
  font-weight: var(--font-weight-medium);
}
.fixed-question__options {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}
.question-card {
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
}
.question-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.question-index {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  min-width: 56px;
}
.question-type {
  width: 110px;
  flex-shrink: 0;
}
.question-text {
  flex: 1 1 240px;
  min-width: 200px;
}
.question-required {
  flex-shrink: 0;
  white-space: nowrap;
}
.question-required :deep(.el-switch__label) {
  white-space: nowrap;
}
.question-tools {
  flex-shrink: 0;
  margin-left: auto;
}
.options-list {
  margin-top: var(--space-2);
  padding-left: 64px;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.option-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.option-item__index {
  width: 20px;
  text-align: right;
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.option-item__input {
  max-width: 360px;
}
.add-option {
  align-self: flex-start;
  padding-left: 28px;
}
.add-question-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.add-question-bar__label {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
  margin-right: var(--space-1);
}

.form-footer {
  position: sticky;
  bottom: 0;
  background: var(--el-bg-color, #fff);
  border-top: 1px solid var(--neutral-200);
  padding: var(--space-3) 0;
  margin-top: var(--space-4);
  max-width: 880px;
}
.form-footer__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.form-errors {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  list-style: none;
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  font-size: var(--text-sm);
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .options-list {
    padding-left: 0;
  }
  .question-tools {
    margin-left: 0;
  }
}
</style>
