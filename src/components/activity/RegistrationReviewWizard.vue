<template>
  <el-dialog
    v-model="state.visible"
    title="逐筆審核"
    width="720px"
    :close-on-click-modal="false"
    :close-on-press-escape="!state.submitting"
    :show-close="!state.submitting"
    @close="onClose"
  >
    <div class="wizard-progress">
      第 {{ state.index + 1 }} / {{ state.queue.length }} 筆
      <span class="wizard-tally">
        （已匹配 {{ state.done.matched }} · 強收 {{ state.done.forced }} · 拒絕 {{ state.done.rejected }} · 略過 {{ state.done.skipped }}）
      </span>
    </div>

    <div v-if="current" class="target-info">
      <div><b>家長填寫：</b>{{ current.student_name }} · {{ current.birthday }} · {{ current.parent_phone }}</div>
      <div class="muted">家長填寫班級：{{ current.class_name || '（未填）' }}</div>
    </div>

    <!-- 系統建議（與手動匹配對話框同源）：搜尋框是子字串比對，撈不到異體字/拆字/
         漏複姓這類差異，而那正是配不上的主因。 -->
    <div v-if="state.suggestionsLoading || state.suggestions?.length" class="suggestions">
      <div class="suggestions-title">
        可能是這幾位（系統依姓名相似度推薦，<b>仍請確認後再選</b>）
      </div>
      <el-skeleton v-if="state.suggestionsLoading" :rows="1" animated />
      <div v-else class="suggestion-tags">
        <el-tag
          v-for="s in state.suggestions || []"
          :key="s.id"
          class="suggestion-tag"
          :type="s.same_class ? 'success' : 'info'"
          effect="plain"
          @click="state.selected = s"
        >
          {{ s.name }} · {{ s.classroom_name || '未編班' }}
          <span class="suggestion-meta">{{ Math.round((s.similarity ?? 0) * 100) }}%</span>
        </el-tag>
      </div>
      <div v-if="state.selected" class="suggestion-picked">
        已選擇：<b>{{ state.selected.name }}</b>（{{ state.selected.classroom_name || '未編班' }}）
      </div>
    </div>

    <el-input
      v-model="state.searchQuery"
      placeholder="搜尋在校生：姓名 / 學號 / 家長手機"
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
      max-height="260"
      @current-change="(row) => (state.selected = row)"
    >
      <el-table-column prop="student_id" label="學號" width="100" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="birthday" label="生日" width="120" />
      <el-table-column prop="classroom_name" label="班級" width="110" />
      <el-table-column prop="parent_phone" label="家長手機" />
    </el-table>

    <template #footer>
      <div class="wizard-actions">
        <el-button :disabled="state.submitting || state.index === 0" @click="onPrev">上一筆</el-button>
        <el-button :disabled="state.submitting" @click="onSkip">略過</el-button>
        <el-button
          type="danger"
          plain
          :loading="state.submitting"
          :disabled="state.submitting || rejectDisabled"
          :title="rejectDisabled ? '此筆已有繳費，需先於報名詳情處理繳費後才能拒絕' : ''"
          @click="onReject"
        >拒絕並下一筆</el-button>
        <el-button type="danger" :loading="state.submitting" :disabled="state.submitting" @click="onForce">強行收件並下一筆</el-button>
        <el-button type="primary" :loading="state.submitting" :disabled="state.submitting || !state.selected" @click="onMatch">匹配並下一筆</el-button>
        <el-button :disabled="state.submitting" @click="state.visible = false">結束</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { ReviewRow, StudentCandidate } from '@/composables/useActivityReview'

interface WizardState {
  visible: boolean
  queue: ReviewRow[]
  index: number
  searchQuery: string
  candidates: StudentCandidate[]
  selected: StudentCandidate | null
  loading: boolean
  submitting: boolean
  suggestions: StudentCandidate[]
  suggestionsLoading: boolean
  done: { matched: number; forced: number; rejected: number; skipped: number }
}

const props = defineProps<{
  state: WizardState
  current: ReviewRow | null
  onSearch: () => void
  onMatch: () => void
  onForce: () => void
  onReject: () => void
  onSkip: () => void
  onPrev: () => void
  onClose: () => void
}>()

// P3-2：與主列表 canReject 對齊——已有繳費（paid_amount>0）的待審核筆拒絕會被
// 後端 409 擋下，故預先 disable 拒絕鈕（使用者可改走略過 / 強行收件 / 匹配）。
const rejectDisabled = computed(() => ((props.current?.paid_amount ?? 0) > 0))
defineExpose({ rejectDisabled })
</script>

<style scoped>
.wizard-progress { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.wizard-tally { font-weight: 400; color: var(--el-text-color-secondary); font-size: 13px; }
.target-info {
  margin: 4px 0 12px;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  font-size: 14px;
}
.target-info .muted { color: var(--el-text-color-secondary); margin-top: 4px; font-size: 13px; }
.wizard-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.suggestions {
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}
.suggestions-title { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.suggestion-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.suggestion-tag { cursor: pointer; }
.suggestion-meta { margin-left: 6px; opacity: 0.7; font-size: 12px; }
.suggestion-picked { margin-top: 8px; font-size: 13px; }
</style>
