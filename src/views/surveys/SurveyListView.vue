<script setup lang="ts">
/**
 * 管理端：調查管理列表。
 * 對應後端 api/surveys.py（SURVEYS_READ 看、SURVEYS_WRITE 建立／發布／結束／刪除）。
 *
 * 2026-09-15 UI/UX 改版：後端列表不分頁、量級每年約十場，改成一次載入後純前端
 * 篩選——狀態段落帶計數、標題搜尋；把「已截止但還沒結束」從「已發布」裡拆出來
 * （後端不會自動翻 closed，行政要自己收尾）；進行中排最前；回覆進度改長條；
 * 操作依狀態只留當下該做的事；點列進詳情；手機走 AdminListCards。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminListToolbar, { type FilterGroup } from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { closeSurvey, deleteSurvey, listSurveys, publishSurvey } from '@/api/surveys'
import { hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { todayTaipeiISO } from '@/utils/format'
import {
  SURVEY_STATUS_LABELS,
  SURVEY_STATUS_ORDER,
  SURVEY_STATUS_TAG,
  countByStatus,
  deadlineHint,
  deriveSurveyStatus,
  filterSurveyRows,
  replyPercent,
  sortSurveyRows,
  type SurveyDisplayStatus,
  type SurveyListRow,
} from './surveyListModel'

type Row = SurveyListRow & { [key: string]: unknown }

const router = useRouter()
const canWrite = hasPermission('SURVEYS_WRITE')
const { isMobile } = useIsMobile()

const rows = ref<Row[]>([])
const loading = ref(false)
const search = ref('')
const filterValues = ref<Record<string, unknown>>({})
// 以台北日期判定「已截止」，與後端 lifecycle.is_open 的口徑一致。
const today = todayTaipeiISO()

const statusFilter = computed(() => (filterValues.value.status as SurveyDisplayStatus | undefined) ?? '')
const counts = computed(() => countByStatus(rows.value, today))
const filterGroups = computed<FilterGroup[]>(() => [
  {
    key: 'status',
    label: '狀態',
    allLabel: `全部 ${rows.value.length}`,
    options: SURVEY_STATUS_ORDER.map((s) => ({
      value: s,
      label: `${SURVEY_STATUS_LABELS[s]} ${counts.value[s]}`,
    })),
  },
])
const displayRows = computed(() =>
  sortSurveyRows(filterSurveyRows(rows.value, { search: search.value, status: statusFilter.value }, today), today),
)
const hasActiveFilter = computed(() => Boolean(search.value.trim()) || Boolean(statusFilter.value))

const CARD_COLUMNS = [
  { label: '活動日', prop: 'event_date' },
  { label: '回覆截止', prop: 'reply_deadline' },
  { label: '回覆進度', prop: 'replied_count' },
]

// AdminListCards 的 slot item 型別是 Record<string, unknown>，統一在這裡窄化回列型別
// （Vue 模板插值不支援 TS `as` 轉型）。
function asRow(item: Record<string, unknown>): SurveyListRow {
  return item as unknown as SurveyListRow
}
function statusOf(row: SurveyListRow): SurveyDisplayStatus {
  return deriveSurveyStatus(row, today)
}
function audienceLabel(row: SurveyListRow): string {
  return row.audience_type === 'all' ? '全園' : '指定班級'
}
function progressText(row: SurveyListRow): string {
  return `${row.replied_count} / ${row.denominator}`
}
function progressStatus(row: SurveyListRow): 'success' | 'warning' | undefined {
  if (!row.denominator || statusOf(row) === 'draft') return undefined
  const pct = replyPercent(row)
  if (pct >= 100) return 'success'
  if (statusOf(row) === 'expired') return 'warning'
  return undefined
}

async function fetchData() {
  loading.value = true
  try {
    const res = await listSurveys()
    const data = res.data as unknown as { items?: Row[] }
    rows.value = data?.items ?? []
  } catch (e) {
    ElMessage.error(friendlyError('載入調查列表失敗', e))
  } finally {
    loading.value = false
  }
}

function goDetail(row: SurveyListRow) {
  router.push({ name: 'survey-detail', params: { id: row.id } })
}
function goEdit(row: SurveyListRow) {
  router.push({ name: 'survey-edit', params: { id: row.id } })
}
function goCreate() {
  router.push({ name: 'survey-new' })
}

async function onPublish(row: SurveyListRow) {
  try {
    await ElMessageBox.confirm(
      `發布後會立即透過 LINE 推播給${audienceLabel(row)}家長（${row.denominator} 位學生），且題目與調查對象將無法再修改。`,
      `發布「${row.title}」`,
      { confirmButtonText: '發布並推播', cancelButtonText: '再檢查一下' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await publishSurvey(row.id)
    ElMessage.success('已發布並推播給家長')
    fetchData()
  } catch (e) {
    ElMessage.error(friendlyError('發布調查失敗', e))
  }
}

async function onClose(row: SurveyListRow) {
  try {
    await ElMessageBox.confirm(
      '結束後家長無法再填寫；已收到的回覆會保留，仍可代填與匯出。',
      `結束「${row.title}」`,
      { confirmButtonText: '結束調查', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await closeSurvey(row.id)
    ElMessage.success('調查已結束')
    fetchData()
  } catch (e) {
    ElMessage.error(friendlyError('結束調查失敗', e))
  }
}

async function onDelete(row: SurveyListRow) {
  try {
    await ElMessageBox.confirm(
      '草稿尚未發布，家長看不到；刪除後無法復原。',
      `刪除「${row.title}」`,
      { type: 'warning', confirmButtonText: '刪除草稿', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await deleteSurvey(row.id)
    ElMessage.success('已刪除')
    fetchData()
  } catch (e) {
    ElMessage.error(friendlyError('刪除調查失敗', e))
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="survey-list">
    <PageHeader
      title="調查管理"
      subtitle="建立活動參加調查、推播給家長在 LINE 填寫，並在這裡追蹤回覆、催覆與匯出。"
    >
      <template #actions>
        <el-button v-if="canWrite" type="primary" data-test="survey-create" @click="goCreate">
          <el-icon><Plus /></el-icon> 建立調查
        </el-button>
      </template>
    </PageHeader>

    <AdminListToolbar
      v-model:search="search"
      v-model:filter-values="filterValues"
      search-placeholder="搜尋調查標題"
      :filters="filterGroups"
      :total="rows.length"
      :shown="displayRows.length"
    />

    <!-- 手機：表格要橫捲才按得到操作鈕，改任務卡片 -->
    <AdminListCards
      v-if="isMobile"
      :items="displayRows"
      :columns="CARD_COLUMNS"
      row-key="id"
      :loading="loading"
      clickable
      @row-click="goDetail(asRow($event))"
    >
      <template #empty>
        <span v-if="hasActiveFilter">沒有符合條件的調查</span>
        <span v-else>還沒有任何調查；建立並發布後，家長會在 LINE 收到通知</span>
      </template>
      <template #title="{ item }">
        <div class="card-title">
          <span class="card-title__text">{{ item.title }}</span>
          <el-tag :type="SURVEY_STATUS_TAG[statusOf(asRow(item))]" size="small">
            {{ SURVEY_STATUS_LABELS[statusOf(asRow(item))] }}
          </el-tag>
        </div>
      </template>
      <template #cell-event_date="{ item }">{{ item.event_date || '未定' }}</template>
      <template #cell-reply_deadline="{ item }">
        {{ item.reply_deadline }}
        <span v-if="deadlineHint(asRow(item), today)" class="cell-sub">
          · {{ deadlineHint(asRow(item), today) }}
        </span>
      </template>
      <template #cell-replied_count="{ item }">
        {{ progressText(asRow(item)) }}
        <span class="cell-sub">· {{ replyPercent(asRow(item)) }}%</span>
      </template>
      <template v-if="canWrite" #actions="{ item }">
        <template v-if="statusOf(asRow(item)) === 'draft'">
          <el-button @click.stop="goEdit(asRow(item))">編輯</el-button>
          <el-button type="primary" @click.stop="onPublish(asRow(item))">發布</el-button>
        </template>
        <el-button
          v-else-if="statusOf(asRow(item)) !== 'closed'"
          @click.stop="onClose(asRow(item))"
        >結束調查</el-button>
      </template>
    </AdminListCards>

    <el-table
      v-else
      :data="displayRows"
      v-loading="loading"
      row-class-name="survey-row"
      @row-click="goDetail"
    >
      <template #empty>
        <EmptyState
          v-if="hasActiveFilter"
          variant="inline"
          title="沒有符合條件的調查"
          description="換個關鍵字或狀態試試"
        />
        <EmptyState
          v-else
          title="還沒有任何調查"
          description="建立調查、發布推播給家長在 LINE 填寫；回覆進度、催覆與匯出都在這裡。"
        >
          <template v-if="canWrite" #action>
            <el-button type="primary" data-test="survey-create-empty" @click="goCreate">
              <el-icon><Plus /></el-icon> 建立第一份調查
            </el-button>
          </template>
        </EmptyState>
      </template>

      <el-table-column label="調查" min-width="240">
        <template #default="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <div class="cell-sub">{{ audienceLabel(row) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="活動日" width="120">
        <template #default="{ row }">{{ row.event_date || '未定' }}</template>
      </el-table-column>
      <el-table-column label="回覆截止" width="150">
        <template #default="{ row }">
          <div>{{ row.reply_deadline }}</div>
          <div
            v-if="deadlineHint(row, today)"
            class="cell-sub"
            :class="{ 'cell-sub--warn': statusOf(row) === 'expired' }"
          >{{ deadlineHint(row, today) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="回覆進度" min-width="200">
        <template #default="{ row }">
          <div class="progress-cell">
            <el-progress
              :percentage="replyPercent(row)"
              :status="progressStatus(row)"
              :stroke-width="8"
              :show-text="false"
              class="progress-cell__bar"
            />
            <span class="progress-cell__text">{{ progressText(row) }}</span>
            <span class="cell-sub">{{ replyPercent(row) }}%</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tooltip
            :disabled="statusOf(row) !== 'expired'"
            content="已過回覆截止日，家長無法再填寫；可結束調查，或到詳情代填未回覆者。"
            placement="top"
          >
            <el-tag :type="SURVEY_STATUS_TAG[statusOf(row)]" :effect="statusOf(row) === 'closed' ? 'plain' : 'light'">
              {{ SURVEY_STATUS_LABELS[statusOf(row)] }}
            </el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="" width="230" align="right">
        <template #default="{ row }">
          <div class="row-actions" @click.stop>
            <template v-if="statusOf(row) === 'draft'">
              <el-button size="small" @click="goEdit(row)">編輯</el-button>
              <el-button size="small" type="primary" @click="onPublish(row)">發布</el-button>
              <el-button size="small" link type="danger" @click="onDelete(row)">刪除</el-button>
            </template>
            <template v-else-if="statusOf(row) === 'open'">
              <el-button size="small" @click="goEdit(row)">編輯</el-button>
              <el-button size="small" @click="onClose(row)">結束調查</el-button>
            </template>
            <template v-else-if="statusOf(row) === 'expired'">
              <el-button size="small" type="primary" plain @click="onClose(row)">結束調查</el-button>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.survey-list :deep(.survey-row) {
  cursor: pointer;
}
.cell-title {
  font-weight: var(--font-weight-medium);
  color: var(--el-text-color-primary);
}
.cell-sub {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.cell-sub--warn {
  color: var(--color-warning-darker);
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
.row-actions {
  display: inline-flex;
  gap: var(--space-1);
  justify-content: flex-end;
}
.card-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.card-title__text {
  font-weight: var(--font-weight-medium);
}
</style>
