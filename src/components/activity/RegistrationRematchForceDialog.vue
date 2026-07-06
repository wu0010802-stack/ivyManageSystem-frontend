<template>
  <el-dialog
    v-model="state.visible"
    :title="state.action === 'force' ? '強行收件（跳過比對，標記 forced）' : '重新比對（可修正家長填錯的欄位）'"
    width="520px"
  >
    <el-alert
      v-if="state.action === 'force'"
      type="warning"
      :closable="false"
      show-icon
      title="此操作會跳過三欄比對，直接將這筆報名插入正式報名管理，並以「強行收件」標記。常用於校外生或資料永遠無法比對的情境。"
      class="dialog-alert"
    />
    <el-alert
      v-else
      type="info"
      :closable="false"
      show-icon
      title="三欄比對以 姓名 + 生日 + 家長手機 為準。若家長打錯字，校方可直接修正後再比對。"
      class="dialog-alert"
    />
    <el-form label-width="90px" label-position="right">
      <el-form-item label="幼兒姓名">
        <el-input v-model="state.form.name" maxlength="50" />
      </el-form-item>
      <el-form-item label="生日">
        <el-date-picker
          v-model="state.form.birthday"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="家長手機">
        <el-input v-model="state.form.parent_phone" placeholder="09 開頭 10 碼" maxlength="15" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="state.visible = false">取消</el-button>
      <el-button
        :type="state.action === 'force' ? 'danger' : 'primary'"
        :loading="state.submitting"
        @click="onConfirm"
      >
        {{ state.action === 'force' ? '確認強行收件' : '儲存並重新比對' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ReviewRow } from '@/composables/useActivityReview'

interface EditDialogState {
  visible: boolean
  action: 'rematch' | 'force'
  row: ReviewRow | null
  submitting: boolean
  form: { name: string; birthday: string; parent_phone: string }
}

defineProps<{ state: EditDialogState; onConfirm: () => void }>()
</script>

<style scoped>
.dialog-alert { margin-bottom: 12px; }
</style>
