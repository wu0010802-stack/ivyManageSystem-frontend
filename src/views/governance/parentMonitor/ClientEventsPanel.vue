<template>
  <div class="client-events-panel">
    <div v-if="errorMessage" data-testid="events-error" class="client-events-panel__error">
      {{ errorMessage }}
    </div>

    <div v-else-if="enabled === false" data-testid="events-disabled" class="client-events-panel__disabled">
      <EmptyState
        title="家長端監控尚未啟用"
        description="此環境尚未開啟家長端監控功能，前端事件無法顯示。"
      />
    </div>

    <template v-else>
      <div class="client-events-panel__counts">
        <el-card
          v-for="entry in byTypeEntries"
          :key="entry.key"
          class="client-events-panel__count-card"
        >
          <div class="client-events-panel__count-label">{{ entry.label }}</div>
          <div :data-testid="`count-${entry.key}`" class="client-events-panel__count-value">
            {{ entry.count }}
          </div>
        </el-card>
      </div>
      <p class="client-events-panel__window">統計區間：近 24 小時（不受下方型別篩選影響）</p>

      <div class="client-events-panel__filter">
        <el-select
          v-model="typeFilter"
          data-testid="events-type-filter"
          placeholder="事件型別"
          @change="handleTypeChange"
        >
          <el-option label="全部" value="" />
          <el-option v-for="t in EVENT_TYPES" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </div>

      <EmptyState
        v-if="!loading && items.length === 0"
        data-testid="events-empty"
        title="近 24 小時無前端事件"
        description="沒有事件是好事——代表家長端 LIFF 初始化、登入、API 呼叫這段時間都順利，不是資料沒送到。"
      />

      <template v-else>
        <el-table :data="displayItems" data-testid="events-table">
          <el-table-column label="時間" prop="occurred_at_label" />
          <el-table-column label="型別" prop="type_label" />
          <el-table-column label="路由" prop="route_label" />
          <el-table-column label="LINE 版本" prop="line_version_label" />
          <el-table-column label="OS" prop="os_label" />
          <el-table-column label="訊息" prop="message" />
          <el-table-column label="Request ID" prop="request_id_label" />
        </el-table>

        <el-pagination
          data-testid="events-pagination"
          layout="total, prev, pager, next"
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          @current-change="handlePageChange"
        />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 前端事件分頁（SPEC-023 批次 3，Task 6）。
 *
 * `GET /parent-monitor/client-events?type=&hours=24&page=&page_size=` 的分頁
 * 列表 + `by_type` 計數卡。`hours` 固定用後端預設 24（不在本頁曝露成控制項，
 * 比照 `ParentActivityPanel` 的「近 24 小時」慣例，不重複造一套時間窗選擇器）。
 *
 * ⚠ `by_type` 一律涵蓋 24 小時窗內全部事件型別、**不受** `type` 篩選影響
 * （後端 `queries.list_client_events` docstring：這是給值班的人看「事件分佈
 * 長怎樣、要不要篩某一種來看」的總覽；`items`／`total` 才吃 `type` 篩選）。
 * 計數卡動態渲染 `by_type` 實際回來的鍵，不硬編七個型別都顯示（沒發生過的
 * 型別不佔卡片版面）。
 *
 * ⚠ 型別一律顯示中文對照名（`EVENT_TYPES`／`TYPE_LABELS`），不把
 * `liff_init_failed` 這種除錯用的內部 key 直接丟給使用者看——比照
 * `LightsBoard.vue` 的 `LIGHT_LABELS` 寫法；對不到的 key fallback 顯示原字串
 * （後端之後加第八種型別，畫面不會炸掉，但正常情況不該讓使用者看到）。
 *
 * ⚠ 請求序號守衛（比照 `TrafficPanel.vue`）：切換型別篩選或換頁時，慢的舊
 * 回應不得蓋掉快的新回應。
 */
import { computed, onMounted, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import { getParentMonitorClientEvents } from '@/api/parentMonitor'
import { getErrorMessage } from '@/utils/errorHandler'
import { formatDateTimeTW } from '@/utils/format'
import type { ApiQuery } from '@/api/_generated/typed'

type ClientEventsQuery = ApiQuery<'/parent-monitor/client-events', 'get'>
type ClientEventsData = Awaited<ReturnType<typeof getParentMonitorClientEvents>>['data']
type ClientEventItem = NonNullable<ClientEventsData['items']>[number]
type ClientEventType = Exclude<NonNullable<ClientEventsQuery>['type'], null | undefined>

// 七種事件型別的中文名稱。value 與後端 `ClientEventTypeLiteral`（七值聯集）
// 一一對應，後端加新型別要一起補這裡（沒對到的 key 會 fallback 顯示原字串）。
const EVENT_TYPES: { value: ClientEventType; label: string }[] = [
  { value: 'liff_init_failed', label: 'LIFF 初始化失敗' },
  { value: 'login_failed', label: '登入失敗' },
  { value: 'chunk_load_failed', label: '前端資源載入失敗' },
  { value: 'api_timeout', label: 'API 逾時' },
  { value: 'api_5xx', label: 'API 伺服器錯誤' },
  { value: 'error_boundary', label: '前端例外邊界攔截' },
  { value: 'maintenance_hit', label: '維護模式攔截' },
]

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t.label]),
)

const EVENT_TYPE_VALUES: readonly string[] = EVENT_TYPES.map((t) => t.value)

function isClientEventType(v: string): v is ClientEventType {
  return EVENT_TYPE_VALUES.includes(v)
}

function typeLabelFor(key: string): string {
  return TYPE_LABELS[key] ?? key
}

const typeFilter = ref<string>('')
const page = ref(1)
const pageSize = ref(50)
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const enabled = ref<boolean | null>(null)
const byType = ref<Record<string, number> | null>(null)
const items = ref<ClientEventItem[]>([])
const total = ref(0)

// 依計數由大到小排序，方便值班的人一眼看出哪個型別最吵。
const byTypeEntries = computed(() =>
  Object.entries(byType.value ?? {})
    .map(([key, count]) => ({ key, count, label: typeLabelFor(key) }))
    .sort((a, b) => b.count - a.count),
)

interface DisplayEvent {
  occurred_at_label: string
  type_label: string
  route_label: string
  line_version_label: string
  os_label: string
  message: string
  request_id_label: string
}

const displayItems = computed<DisplayEvent[]>(() =>
  items.value.map((it) => ({
    occurred_at_label: formatDateTimeTW(it.occurred_at),
    type_label: typeLabelFor(it.event_type),
    route_label: it.route_name ?? '—',
    line_version_label: it.line_version ?? '—',
    os_label: it.os ?? '—',
    message: it.message,
    request_id_label: it.request_id ?? '—',
  })),
)

/**
 * 請求序號：只有「最後發出的那一份」回應可以寫進畫面（比照 TrafficPanel.vue）。
 * 快速切換型別篩選或連續換頁時，先發的請求很可能後到，沒有這道守衛就會把
 * 較新的結果蓋掉。
 */
let requestSeq = 0

async function fetchData(): Promise<void> {
  const seq = ++requestSeq
  loading.value = true
  errorMessage.value = null
  try {
    const params: ClientEventsQuery = { page: page.value, page_size: pageSize.value }
    if (typeFilter.value && isClientEventType(typeFilter.value)) {
      params.type = typeFilter.value
    }
    const res = await getParentMonitorClientEvents(params)
    if (seq !== requestSeq) return
    enabled.value = res.data.enabled
    if (res.data.enabled) {
      byType.value = res.data.by_type ?? null
      items.value = res.data.items ?? []
      total.value = res.data.total ?? 0
    }
  } catch (e) {
    if (seq !== requestSeq) return
    errorMessage.value = getErrorMessage(e, '前端事件載入失敗，請稍後再試')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function handleTypeChange(): void {
  page.value = 1
  void fetchData()
}

function handlePageChange(newPage: number): void {
  page.value = newPage
  void fetchData()
}

onMounted(() => {
  void fetchData()
})
</script>

<style scoped>
.client-events-panel__counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}

.client-events-panel__count-card :deep(.el-card__body) {
  text-align: center;
}

.client-events-panel__count-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: 6px;
}

.client-events-panel__count-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary, #303133);
}

.client-events-panel__window {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  margin: 0 0 16px;
}

.client-events-panel__filter {
  margin-bottom: 16px;
}

.client-events-panel__error {
  color: var(--el-color-danger, #f56c6c);
  padding: 12px 0;
}
</style>
