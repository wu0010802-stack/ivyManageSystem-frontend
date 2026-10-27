<template>
  <el-card style="max-width: 720px" v-loading="loading">
    <template #header>{{ title }}</template>
    <p class="email-template-hint">
      {{ hintText }}{{ requireBoth ? '主旨與內文都要填才會套用自訂樣板，只填一欄時整封信沿用預設。' : '' }}留空即恢復預設樣板。
    </p>
    <el-alert
      v-if="!emailEnabled"
      type="warning"
      title="目前還沒開啟 Email 寄送：測試寄送與正式通知都不會真的寄出。需要開啟請聯絡系統管理員。"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <div class="token-bar" role="group" aria-label="插入佔位符">
      <span class="token-bar__label">點一下插入：</span>
      <el-button
        v-for="p in tokenList"
        :key="p"
        size="small"
        class="token-btn"
        :data-test="`${dataTestPrefix}-token-${p}`"
        :title="`插入 {${p}}，寄出時換成${labelOf(p)}`"
        @mousedown.prevent
        @click="insertToken(p)"
      >{{ labelOf(p) }}</el-button>
    </div>

    <el-form label-width="80px">
      <el-form-item label="主旨">
        <el-input
          ref="subjectRef"
          v-model="subject"
          :data-test="`${dataTestPrefix}-subject-input`"
          :placeholder="subjectDefault"
          maxlength="200"
          show-word-limit
          @focus="lastField = 'subject'"
        />
      </el-form-item>
      <el-form-item label="內文">
        <el-input
          ref="bodyRef"
          v-model="body"
          :data-test="`${dataTestPrefix}-body-input`"
          type="textarea"
          :rows="16"
          :placeholder="bodyDefault"
          maxlength="4000"
          show-word-limit
          @focus="lastField = 'body'"
        />
        <el-button
          v-if="!subject && !body"
          link
          type="primary"
          class="start-from-default"
          :data-test="`${dataTestPrefix}-start-default`"
          @click="startFromDefault"
        >以預設內容為底開始修改</el-button>
      </el-form-item>

      <el-alert
        v-if="unknownTokens.length"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        :data-test="`${dataTestPrefix}-unknown-tokens`"
        :title="`看不懂的佔位符：${unknownTokens.map((t) => `{${t}}`).join('、')}。寄出時會原樣出現在信裡，請檢查拼字。`"
      />

      <div class="preview" :data-test="`${dataTestPrefix}-preview`">
        <div class="preview__head">預覽（以範例資料替換）</div>
        <div class="preview__subject">{{ preview.subject }}</div>
        <div class="preview__body">{{ preview.body }}</div>
      </div>

      <el-form-item>
        <el-button
          type="primary"
          :data-test="`${dataTestPrefix}-save-btn`"
          @click="emit('save')"
          :loading="saving"
        >儲存樣板</el-button>
      </el-form-item>

      <el-divider content-position="left">測試寄送</el-divider>
      <el-form-item label="收件信箱">
        <el-input
          v-model="testEmail"
          :data-test="`${dataTestPrefix}-test-send-input`"
          placeholder="輸入要試寄的信箱"
          style="max-width: 320px"
        />
        <el-button
          style="margin-left: 8px"
          :data-test="`${dataTestPrefix}-test-send-btn`"
          @click="emit('test-send')"
          :loading="testSending"
        >測試寄送</el-button>
      </el-form-item>
    </el-form>

    <el-alert
      v-if="savedAt"
      type="success"
      :title="`已於 ${savedAt} 儲存`"
      :closable="false"
      style="margin-top: 8px"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { EMAIL_TOKEN_LABELS, findUnknownTokens, renderEmailPreview } from './emailTemplateTokens'

const props = withDefaults(
  defineProps<{
    title: string
    hintText?: string
    placeholders: string[]
    loading: boolean
    subjectDefault: string
    bodyDefault: string
    emailEnabled: boolean
    saving: boolean
    savedAt: string
    testSending: boolean
    dataTestPrefix: string
    /** 後端只在主旨與內文都自訂時才套用（報名成功信） */
    requireBoth?: boolean
  }>(),
  { hintText: '', requireBoth: false }
)

const subject = defineModel<string | null>('subject', { required: true })
const body = defineModel<string | null>('body', { required: true })
const testEmail = defineModel<string>('testEmail', { required: true })

const emit = defineEmits<{
  save: []
  'test-send': []
}>()

// 後端兩種信都會替換 {org_name}，畫面上一併提供
const tokenList = computed(() => [...new Set([...props.placeholders, 'org_name'])])
const labelOf = (p: string) => EMAIL_TOKEN_LABELS[p] ?? p

const unknownTokens = computed(() =>
  findUnknownTokens(`${subject.value ?? ''}\n${body.value ?? ''}`, tokenList.value),
)
const preview = computed(() => ({
  subject: renderEmailPreview(subject.value || props.subjectDefault),
  body: renderEmailPreview(body.value || props.bodyDefault),
}))

type InputHandle = { input?: HTMLInputElement; textarea?: HTMLTextAreaElement }
const subjectRef = ref<InputHandle | null>(null)
const bodyRef = ref<InputHandle | null>(null)
const lastField = ref<'subject' | 'body' | null>(null)

function startFromDefault() {
  subject.value = props.subjectDefault
  body.value = props.bodyDefault
}

/** 插在最後聚焦欄位的游標處（沒聚焦過就插在內文結尾）；插入後游標移到 token 後方 */
function insertToken(p: string) {
  const token = `{${p}}`
  const isSubject = lastField.value === 'subject'
  const el = isSubject ? subjectRef.value?.input : bodyRef.value?.textarea
  const current = (isSubject ? subject.value : body.value) ?? ''
  // 從沒聚焦過的欄位游標位置不可靠，一律插在結尾
  const hasCaret = lastField.value !== null && el != null
  const start = hasCaret ? (el.selectionStart ?? current.length) : current.length
  const end = hasCaret ? (el.selectionEnd ?? current.length) : current.length
  const next = current.slice(0, start) + token + current.slice(end)
  if (isSubject) subject.value = next
  else body.value = next
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange(start + token.length, start + token.length)
  })
}
</script>

<style scoped>
.email-template-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 12px;
}
.token-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.token-bar__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.token-btn {
  margin-left: 0;
}
.start-from-default {
  margin-top: 4px;
}
.preview {
  margin: 0 0 16px 80px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  background: var(--el-fill-color-lighter);
}
.preview__head {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.preview__subject {
  font-weight: 600;
  margin-bottom: 8px;
}
.preview__body {
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 14px;
}
@media (--to-sm) {
  .preview { margin-left: 0; }
}
</style>
