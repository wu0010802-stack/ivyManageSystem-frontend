<template>
  <el-dialog v-model="state.visible" title="手動匹配在校生" width="640px">
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="請務必確認這筆報名就是該生本人（以免資料串接錯誤）。"
      class="dialog-alert"
    />
    <div v-if="state.row" class="target-info">
      <div><b>家長填寫：</b>{{ state.row.student_name }} · {{ state.row.birthday }} · {{ state.row.parent_phone }}</div>
      <div class="muted">家長填寫班級：{{ state.row.class_name || '（未填）' }}</div>
    </div>

    <el-input
      v-model="state.searchQuery"
      placeholder="輸入姓名 / 學號 / 家長手機搜尋"
      clearable
      @input="onSearch"
    >
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>

    <el-table
      v-loading="state.loading"
      :data="state.candidates"
      highlight-current-row
      :row-key="(r) => r.id"
      style="margin-top: 12px"
      @current-change="(row) => (state.selected = row)"
    >
      <el-table-column prop="student_id" label="學號" width="100" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="birthday" label="生日" width="120" />
      <el-table-column prop="classroom_name" label="班級" width="110" />
      <el-table-column prop="parent_phone" label="家長手機" />
    </el-table>

    <template #footer>
      <el-button @click="state.visible = false">取消</el-button>
      <el-button type="primary" :disabled="!state.selected" @click="onConfirm">確認匹配</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import type { ReviewRow, StudentCandidate } from '@/composables/useActivityReview'

interface MatchDialogState {
  visible: boolean
  row: ReviewRow | null
  searchQuery: string
  candidates: StudentCandidate[]
  selected: StudentCandidate | null
  loading: boolean
}

defineProps<{ state: MatchDialogState; onSearch: () => void; onConfirm: () => void }>()
</script>

<style scoped>
.dialog-alert { margin-bottom: 12px; }
.target-info {
  margin: 8px 0 12px;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 14px;
}
.target-info .muted { color: var(--el-text-color-secondary); margin-top: 4px; font-size: 13px; }
</style>
