<template>
  <div v-if="authorized" class="survey-form">
    <el-form label-width="100px" :disabled="locked">
      <el-form-item label="標題" required>
        <el-input v-model="draft.title" maxlength="100" show-word-limit />
      </el-form-item>
      <el-form-item label="說明">
        <el-input v-model="draft.description" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="活動日期" :disabled="lockStructure">
        <el-date-picker v-model="draft.event_date" type="date" value-format="YYYY-MM-DD" :disabled="lockStructure" />
      </el-form-item>
      <el-form-item label="地點">
        <el-input v-model="draft.location" />
      </el-form-item>
      <el-form-item label="費用備註">
        <el-input v-model="draft.fee_note" />
      </el-form-item>
      <el-form-item label="回覆截止日" required>
        <el-date-picker v-model="draft.reply_deadline" type="date" value-format="YYYY-MM-DD" />
      </el-form-item>

      <el-form-item label="調查對象" :disabled="lockStructure">
        <el-radio-group v-model="draft.audience_type" :disabled="lockStructure">
          <el-radio label="all">全園</el-radio>
          <el-radio label="classrooms">指定班級</el-radio>
        </el-radio-group>
        <div v-if="draft.audience_type === 'classrooms'" class="classroom-picker">
          <el-checkbox-group v-model="draft.classroom_ids" :disabled="lockStructure">
            <el-checkbox v-for="c in classroomOptions" :key="c.id" :label="c.id">{{ c.name }}</el-checkbox>
          </el-checkbox-group>
        </div>
      </el-form-item>

      <el-form-item label="題目" :disabled="lockStructure">
        <div class="questions">
          <el-card v-for="(q, i) in draft.questions" :key="i" class="question-card" shadow="never">
            <div class="question-row">
              <el-select v-model="q.question_type" placeholder="題型" style="width: 140px" :disabled="lockStructure" @change="onTypeChange(i)">
                <el-option label="單選" :value="SURVEY_QUESTION_TYPES.SINGLE_CHOICE" />
                <el-option label="多選" :value="SURVEY_QUESTION_TYPES.MULTI_CHOICE" />
                <el-option label="數字" :value="SURVEY_QUESTION_TYPES.NUMBER" />
                <el-option label="文字" :value="SURVEY_QUESTION_TYPES.TEXT" />
              </el-select>
              <el-input v-model="q.question_text" placeholder="題目文字" maxlength="200" :disabled="lockStructure" />
              <el-switch v-model="q.is_required" active-text="必填" :disabled="lockStructure" />
              <el-button-group>
                <el-button :disabled="lockStructure || i === 0" :icon="ArrowUp" @click="moveQuestion(draft, i, -1)" />
                <el-button :disabled="lockStructure || i === draft.questions.length - 1" :icon="ArrowDown" @click="moveQuestion(draft, i, 1)" />
                <el-button :disabled="lockStructure" :icon="Delete" type="danger" @click="removeQuestion(draft, i)" />
              </el-button-group>
            </div>
            <div v-if="q.options" class="options-row">
              <div v-for="(_, oi) in q.options" :key="oi" class="option-item">
                <el-input v-model="q.options[oi]" placeholder="選項內容" maxlength="50" :disabled="lockStructure" />
                <el-button :disabled="lockStructure || q.options.length <= 2" :icon="Close" circle size="small" @click="q.options?.splice(oi, 1)" />
              </div>
              <el-button :disabled="lockStructure" size="small" @click="q.options?.push('')">新增選項</el-button>
            </div>
          </el-card>
          <div class="add-question-bar" v-if="!lockStructure">
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.SINGLE_CHOICE)">+ 單選題</el-button>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.MULTI_CHOICE)">+ 多選題</el-button>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.NUMBER)">+ 數字題</el-button>
            <el-button @click="addQuestion(draft, SURVEY_QUESTION_TYPES.TEXT)">+ 文字題</el-button>
          </div>
        </div>
      </el-form-item>

      <el-form-item v-if="!locked">
        <el-button type="primary" :loading="submitting" @click="onSubmit">{{ isEdit ? '儲存' : '建立' }}</el-button>
        <el-button @click="onCancel">取消</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Close, Delete } from '@element-plus/icons-vue'
import { createSurvey, getSurvey, updateSurvey } from '@/api/surveys'
import { getClassrooms } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { SURVEY_QUESTION_TYPES, isSurveyChoiceType } from '@/constants/surveyQuestionTypes'
import {
  addQuestion,
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

// closed：全鎖；published：僅結構（event_date/對象/題目）鎖，其餘（title/description/location/fee_note/reply_deadline）可改
const locked = computed(() => status.value === 'closed')
const lockStructure = computed(() => status.value === 'published' || status.value === 'closed')

interface ClassroomOption { id: number; name: string }
const classroomOptions = ref<ClassroomOption[]>([])

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
  const errors = validateDraft(draft.value, forPublish)
  if (errors.length > 0) {
    ElMessage.warning(errors[0])
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
      router.push({ name: 'survey-detail', params: { id: surveyId.value } })
    } else {
      const res = await createSurvey(payload)
      const data = res.data as unknown as { id: number }
      ElMessage.success('已建立')
      router.push({ name: 'survey-detail', params: { id: data.id } })
    }
  } catch (e) {
    ElMessage.error(friendlyError(isEdit.value ? '儲存調查失敗' : '建立調查失敗', e))
  } finally {
    submitting.value = false
  }
}

const onCancel = async () => {
  if (isDraftDirty(baseline.value, draft.value)) {
    try {
      await ElMessageBox.confirm('尚未儲存的變更將會遺失，確定離開？', '放棄編輯', {
        confirmButtonText: '放棄變更',
        cancelButtonText: '繼續編輯',
        type: 'warning',
      })
    } catch {
      return // 使用者選擇繼續編輯
    }
  }
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
.question-card {
  margin-bottom: 12px;
}
.question-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.options-row {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.add-question-bar {
  display: flex;
  gap: 8px;
}
.classroom-picker {
  margin-top: 8px;
}
</style>
