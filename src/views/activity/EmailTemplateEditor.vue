<template>
  <el-card style="max-width: 720px" v-loading="loading">
    <template #header>{{ title }}</template>
    <p class="email-template-hint">
      {{ hintText }}可用佔位符：<template v-for="(p, i) in placeholders" :key="p"
        ><code>{{ '{' + p + '}' }}</code><template v-if="i < placeholders.length - 1">、</template></template
      >；留空即恢復預設樣板。
    </p>
    <el-alert
      v-if="!emailEnabled"
      type="warning"
      title="目前環境尚未啟用 Email 寄送（ACTIVITY_EMAIL_ENABLED / RESEND_API_KEY 未設定），測試寄送與正式通知都不會真的送出"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-form label-width="80px">
      <el-form-item label="主旨">
        <el-input
          v-model="subject"
          :data-test="`${dataTestPrefix}-subject-input`"
          :placeholder="subjectDefault"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="內文">
        <el-input
          v-model="body"
          :data-test="`${dataTestPrefix}-body-input`"
          type="textarea"
          :rows="20"
          :placeholder="bodyDefault"
          maxlength="4000"
          show-word-limit
        />
      </el-form-item>
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
withDefaults(
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
  }>(),
  { hintText: '' }
)

const subject = defineModel<string | null>('subject', { required: true })
const body = defineModel<string | null>('body', { required: true })
const testEmail = defineModel<string>('testEmail', { required: true })

const emit = defineEmits<{
  save: []
  'test-send': []
}>()
</script>

<style scoped>
.email-template-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 12px;
}
.email-template-hint code {
  background: var(--el-fill-color-light, #f3f4f6);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
