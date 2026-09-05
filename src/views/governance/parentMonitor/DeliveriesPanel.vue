<template>
  <div class="deliveries-panel">
    <div v-if="errorMessage" data-testid="deliveries-error" class="deliveries-panel__error">
      {{ errorMessage }}
    </div>

    <div v-else-if="enabled === false" data-testid="deliveries-disabled" class="deliveries-panel__disabled">
      <EmptyState
        title="家長端監控尚未啟用"
        description="此環境尚未開啟家長端監控功能，推播投遞資料無法顯示。"
      />
    </div>

    <template v-else>
      <el-card data-testid="unfollowed-count-card" class="deliveries-panel__unfollowed-card">
        <div class="deliveries-panel__count-label">已封鎖官方帳號的家長</div>
        <div data-testid="unfollowed-count-value" class="deliveries-panel__count-value">
          {{ unfollowedCount ?? 0 }}
        </div>
        <p class="deliveries-panel__unfollowed-hint">
          家長在 LINE 封鎖官方帳號後推播就送不到，這是推播失敗最常見的原因。
        </p>
      </el-card>

      <EmptyState
        v-if="!loading && isEmpty"
        data-testid="deliveries-empty"
        title="近 24 小時無推播投遞紀錄"
        description="這段時間沒有嘗試過投遞給家長的通知。"
      />

      <template v-else>
        <h3 class="deliveries-panel__title">依事件類型彙總（近 24 小時）</h3>
        <el-table :data="displayByEventType" data-testid="by-event-type-table">
          <el-table-column label="事件類型" prop="event_type" />
          <el-table-column label="已嘗試" prop="attempted" />
          <el-table-column label="最終失敗" prop="final_failed" />
          <el-table-column label="失敗率" prop="rate_label" />
        </el-table>

        <template v-if="failureReasons.length > 0">
          <h3 class="deliveries-panel__title">失敗原因（前 {{ failureReasons.length }} 名）</h3>
          <el-table :data="failureReasons" data-testid="failure-reasons-table">
            <el-table-column label="原因" prop="reason" />
            <el-table-column label="次數" prop="count" />
          </el-table>
        </template>

        <template v-if="displayFailed.length > 0">
          <h3 class="deliveries-panel__title">最近失敗清單</h3>
          <el-table :data="displayFailed" data-testid="failed-table">
            <el-table-column label="時間" prop="created_at_label" />
            <el-table-column label="事件類型" prop="event_type" />
            <el-table-column label="標題" prop="title" />
            <el-table-column label="重試次數" prop="line_retry_count" />
            <el-table-column v-if="canRetry" label="操作">
              <template #default="{ row }">
                <el-button
                  size="small"
                  :data-testid="`retry-btn-${row.id}`"
                  :loading="retryingId === row.id"
                  @click="handleRetry(row.id as number)"
                >
                  重送
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 推播投遞分頁（SPEC-023 批次 3，Task 6）。
 *
 * `GET /parent-monitor/deliveries?hours=24&event_type=` 的四段內容：
 * `by_event_type` 彙總、`failure_reasons` top N、`failed[]` 最近清單、
 * `unfollowed_count`（已封鎖家長數）。本頁不曝露 `event_type` 篩選控制項
 * （後端支援，但任務範圍只要求四段內容本身，比照 ClientEventsPanel 不重複
 * 造一套控制項）。
 *
 * ⚠ **`DeliveryByEventTypeOut` 只有 `attempted`／`event_type`／`final_failed`
 * 三個欄位**——後端 `queries.collect_delivery_detail` 沒有算「成功」或
 * 「重試中」兩個獨立數字（`channels_attempted`/`channels_succeeded` 是
 * JSON 欄位，兩種 SQL 方言下沒有可攜的 containment 運算子，彙總只在
 * Python 端做這兩個數字）。失敗率由前端用 `final_failed / attempted` 算，
 * **不可假裝後端有回 `succeeded`／`retrying` 欄位**——餵不存在的欄位會讓
 * mock 綠、typecheck 綠，但線上資料是壞的（這個 repo 已踩過兩次）。
 *
 * ⚠ `failure_reasons`／`failed[]` 已由後端排序＋截斷 top N
 * （`DELIVERY_FAILURE_REASONS_LIMIT`／`DELIVERY_FAILED_LIMIT`），本元件只負責
 * 渲染，不需要再自己排序或截斷一次。
 *
 * ⚠ `unfollowed_count`（已封鎖家長數）刻意**不吃** `hours`——它是「目前」的
 * 封鎖人數快照，不是時間窗內的事件計數（後端 docstring）。因此這張卡在
 * `by_event_type`／`failed` 皆為空（本頁 EmptyState 分支）時仍然獨立顯示，
 * 不隨著「近 24 小時無投遞紀錄」一起消失。
 *
 * ⚠ 重送鈕（本頁唯一寫入動作）四個要求：
 * 1. `hasPermission('SETTINGS_WRITE')` 才渲染整欄（含表頭），不是渲染後
 *    disable——沒權限的人不該看到寫入入口。
 * 2. 點擊要跳 `ElMessageBox.confirm` 確認框（比照 `StudentIncidentView.vue`
 *    的刪除確認慣例）。
 * 3. 成功後呼叫 `fetchData()` 重抓整份列表，**不**做本地樂觀更新——重送是
 *    交給既有 retry scheduler 處理的非同步動作，本地樂觀更新會讓畫面顯示
 *    「已重送」但排程實際上還沒跑，等於說謊。
 * 4. 409（尚未達最終失敗門檻）／404（找不到或屬於別租戶／總開關關閉）皆由
 *    後端回可讀中文 `detail`，用既有 `getErrorMessage` 取用即可，不需要在
 *    這裡另外轉譯或攔截特定狀態碼。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import { getParentMonitorDeliveries, retryParentMonitorDelivery } from '@/api/parentMonitor'
import { getErrorMessage } from '@/utils/errorHandler'
import { formatDateTimeTW } from '@/utils/format'
import { fmtPct } from '@/utils/format'
import { hasPermission } from '@/utils/auth'

type DeliveriesData = Awaited<ReturnType<typeof getParentMonitorDeliveries>>['data']
type ByEventTypeItem = NonNullable<DeliveriesData['by_event_type']>[number]
type FailedItem = NonNullable<DeliveriesData['failed']>[number]
type FailureReasonItem = NonNullable<DeliveriesData['failure_reasons']>[number]

const loading = ref(true)
const errorMessage = ref<string | null>(null)
const enabled = ref<boolean | null>(null)
const byEventType = ref<ByEventTypeItem[]>([])
const failed = ref<FailedItem[]>([])
const failureReasons = ref<FailureReasonItem[]>([])
const unfollowedCount = ref<number | null>(null)
const retryingId = ref<number | null>(null)

const canRetry = computed(() => hasPermission('SETTINGS_WRITE'))

const isEmpty = computed(() => byEventType.value.length === 0 && failed.value.length === 0)

interface DisplayByEventType {
  event_type: string
  attempted: number
  final_failed: number
  rate_label: string
}

const displayByEventType = computed<DisplayByEventType[]>(() =>
  byEventType.value.map((r) => ({
    event_type: r.event_type,
    attempted: r.attempted,
    final_failed: r.final_failed,
    rate_label: fmtPct(r.attempted > 0 ? r.final_failed / r.attempted : null, { isRatio: true }),
  })),
)

interface DisplayFailed {
  id: number
  created_at_label: string
  event_type: string
  title: string
  line_retry_count: number
}

const displayFailed = computed<DisplayFailed[]>(() =>
  failed.value.map((f) => ({
    id: f.id,
    created_at_label: formatDateTimeTW(f.created_at),
    event_type: f.event_type,
    title: f.title,
    line_retry_count: f.line_retry_count,
  })),
)

async function fetchData(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  try {
    const res = await getParentMonitorDeliveries()
    enabled.value = res.data.enabled
    if (res.data.enabled) {
      byEventType.value = res.data.by_event_type ?? []
      failed.value = res.data.failed ?? []
      failureReasons.value = res.data.failure_reasons ?? []
      unfollowedCount.value = res.data.unfollowed_count ?? null
    }
  } catch (e) {
    errorMessage.value = getErrorMessage(e, '推播投遞資料載入失敗，請稍後再試')
  } finally {
    loading.value = false
  }
}

async function handleRetry(deliveryId: number): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `確定要重送投遞 #${deliveryId} 嗎？系統會重設重試次數，由既有排程接手處理。`,
      '確認重送',
      { type: 'warning' },
    )
  } catch {
    return // 使用者取消，不視為錯誤
  }

  retryingId.value = deliveryId
  try {
    await retryParentMonitorDelivery(deliveryId)
    ElMessage.success('已排入重送，將由排程接手處理')
    // 重送是交給排程處理的非同步動作，重抓整份列表而非本地樂觀更新——
    // 本地直接把這筆從 failed[] 移除會讓畫面說謊（顯示已重送，但排程實際
    // 上還沒跑）。
    await fetchData()
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '重送失敗，請稍後再試'))
  } finally {
    retryingId.value = null
  }
}

onMounted(() => {
  void fetchData()
})
</script>

<style scoped>
.deliveries-panel__unfollowed-card {
  max-width: 280px;
  margin-bottom: 20px;
}

.deliveries-panel__count-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: 6px;
}

.deliveries-panel__count-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary, #303133);
}

.deliveries-panel__unfollowed-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.deliveries-panel__title {
  font-size: 14px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: var(--el-text-color-primary, #303133);
}

.deliveries-panel__error {
  color: var(--el-color-danger, #f56c6c);
  padding: 12px 0;
}
</style>
