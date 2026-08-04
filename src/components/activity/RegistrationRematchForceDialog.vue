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
      title="此操作會跳過比對，直接將這筆報名插入正式報名管理，並以「強行收件」標記。常用於校外生或資料永遠無法比對的情境。"
      class="dialog-alert"
    />
    <el-alert
      v-else
      type="info"
      :closable="false"
      show-icon
      title="比對以 姓名 + 班級 為準（家長手機不參與比對）。家長打錯字或選錯班級時，校方在此修正後再比對即可。"
      class="dialog-alert"
    />
    <el-form label-width="90px" label-position="right">
      <el-form-item label="幼兒姓名">
        <el-input v-model="state.form.name" maxlength="50" />
      </el-form-item>
      <el-form-item label="班級">
        <el-select
          v-model="state.form.class_name"
          placeholder="選擇班級"
          filterable
          clearable
          style="width: 100%"
        >
          <el-option v-for="n in classroomOptions" :key="n" :label="n" :value="n" />
        </el-select>
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
  form: { name: string; birthday: string; parent_phone: string; class_name: string }
}

withDefaults(
  defineProps<{ state: EditDialogState; onConfirm: () => void; classroomOptions?: string[] }>(),
  { classroomOptions: () => [] },
)
</script>

<style scoped>
.dialog-alert { margin-bottom: 12px; }
</style>
