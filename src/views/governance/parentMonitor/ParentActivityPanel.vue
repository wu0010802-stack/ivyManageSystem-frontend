<template>
  <div class="parent-activity-panel">
    <div v-if="errorMessage" data-testid="activity-error" class="parent-activity-panel__error">
      {{ errorMessage }}
    </div>

    <EmptyState
      v-else-if="!loading && isEmpty"
      title="近 24 小時無家長行為紀錄"
      description="尚未有家長登入、綁定或連線續期相關的稽核事件。"
    />

    <template v-else>
      <div class="parent-activity-panel__grid">
        <el-card class="parent-activity-panel__count-card">
          <div class="parent-activity-panel__count-label">登入成功</div>
          <div data-testid="count-login" class="parent-activity-panel__count-value">
            {{ counts.LOGIN }}
          </div>
        </el-card>
        <el-card class="parent-activity-panel__count-card">
          <div class="parent-activity-panel__count-label">登入失敗</div>
          <div data-testid="count-login-failed" class="parent-activity-panel__count-value">
            {{ counts.LOGIN_FAILED }}
          </div>
        </el-card>
        <el-card class="parent-activity-panel__count-card">
          <div class="parent-activity-panel__count-label">綁定失敗</div>
          <div data-testid="count-bind-failed" class="parent-activity-panel__count-value">
            {{ counts.BIND_FAILED }}
          </div>
        </el-card>
        <el-card class="parent-activity-panel__count-card">
          <div class="parent-activity-panel__count-label">連線續期失敗</div>
          <div data-testid="count-refresh-failed" class="parent-activity-panel__count-value">
            {{ counts.REFRESH_FAILED }}
          </div>
        </el-card>
      </div>

      <p class="parent-activity-panel__window">統計區間：近 24 小時</p>

      <router-link
        data-testid="goto-audit-logs"
        :to="{ path: '/governance/audit-logs', query: { actor_type: 'parent' } }"
      >
        在操作紀錄查看全部
      </router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 家長行為分頁（SPEC-023 批次 1，Task 15）。
 *
 * 這個分頁回答「家長剛才做了什麼」：近 24 小時的登入成功／失敗、綁定失敗、
 * 連線續期失敗四個計數，資料來源是既有的 `@/api/audit` `getAuditLogs`
 * （不是 parentMonitor 那三支端點）。
 *
 * ⚠ 查詢設計偏離原計畫草稿，理由詳見同目錄測試檔頂端註解，這裡只記結論：
 *
 * 後端已補 `entity_type='parent_auth'`（BE commit `6a576dec`）：家長端
 * `write_login_audit` 五個呼叫點（liff 登入成功／失敗、refresh 失敗、bind
 * 首綁失敗、bind-additional 二胎綁定失敗）皆顯式傳
 * `entity_type="parent_auth"`，與員工端共用的 `entity_type="auth"` 分開。
 * 故不必再靠 `username` 是否為空這種間接訊號去猜「這筆是不是家長事件」——
 * 直接用 `entity_type='parent_auth' + action` 精確查詢，信任後端回傳的
 * `total`（不受 `page_size` 上限影響，比對 `items` 過濾更準確）。
 *
 * `device_setup` 管道（無 LINE 家長以 staff 簽發碼登入）維持獨立的
 * `entity_type='parent_device_setup'`（後端刻意不併入 `parent_auth`，因為
 * 它不屬於「量大的登入雜訊」，不需要進 `include_auth=false` 排除集合）。
 * 但它確實是一條真實的家長登入管道，漏算會讓「家長登入成功/失敗幾次」
 * 偏低——本面板**納入**它：`LOGIN`／`LOGIN_FAILED` 兩個計數皆為
 * `parent_auth` 與 `parent_device_setup` 兩個 entity_type 各自查詢後加總；
 * `BIND_FAILED`／`REFRESH_FAILED` 只存在於 `parent_auth`（device-setup 沒有
 * 綁定與 refresh 流程），各查一次即可。
 *
 * 一共 6 次查詢（4 個 action × parent_auth，2 個 action × device_setup），
 * 每次都是 `entity_type + action` 雙重鎖定，全部只取 `total`（`page_size`
 * 給後端允許的最小值即可，反正不讀 `items`）。
 */
import { computed, onMounted, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import { getAuditLogs } from '@/api/audit'
import { getErrorMessage } from '@/utils/errorHandler'

interface AuditLogListResponse {
  total: number
}

type ActionKey = 'LOGIN' | 'LOGIN_FAILED' | 'BIND_FAILED' | 'REFRESH_FAILED'

const counts = ref<Record<ActionKey, number>>({
  LOGIN: 0,
  LOGIN_FAILED: 0,
  BIND_FAILED: 0,
  REFRESH_FAILED: 0,
})
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const isEmpty = computed(() =>
  Object.values(counts.value).every((n) => n === 0),
)

function formatLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** 近 24 小時區間，格式與 `AuditLogView` 的 `el-date-picker` `value-format` 一致。 */
function last24Hours(): { start_at: string; end_at: string } {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { start_at: formatLocal(start), end_at: formatLocal(end) }
}

/** `entity_type + action` 精確查詢一次，回傳 `total`。不讀 `items`，`page_size`
 * 給允許的最小值（後端 `ge=1`）以減少不必要的 payload。 */
async function fetchTotal(
  entityType: 'parent_auth' | 'parent_device_setup',
  action: ActionKey,
  window: { start_at: string; end_at: string },
): Promise<number> {
  const res = await getAuditLogs({
    entity_type: entityType,
    action,
    start_at: window.start_at,
    end_at: window.end_at,
    page_size: 1,
  })
  return (res.data as AuditLogListResponse).total ?? 0
}

async function fetchData(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  const window = last24Hours()
  try {
    const [parentLogin, parentLoginFailed, bindFailed, refreshFailed, deviceLogin, deviceLoginFailed] =
      await Promise.all([
        fetchTotal('parent_auth', 'LOGIN', window),
        fetchTotal('parent_auth', 'LOGIN_FAILED', window),
        fetchTotal('parent_auth', 'BIND_FAILED', window),
        fetchTotal('parent_auth', 'REFRESH_FAILED', window),
        fetchTotal('parent_device_setup', 'LOGIN', window),
        fetchTotal('parent_device_setup', 'LOGIN_FAILED', window),
      ])
    counts.value = {
      LOGIN: parentLogin + deviceLogin,
      LOGIN_FAILED: parentLoginFailed + deviceLoginFailed,
      BIND_FAILED: bindFailed,
      REFRESH_FAILED: refreshFailed,
    }
  } catch (e) {
    errorMessage.value = getErrorMessage(e, '家長行為紀錄載入失敗，請稍後再試')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})
</script>

<style scoped>
.parent-activity-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.parent-activity-panel__count-card :deep(.el-card__body) {
  text-align: center;
}

.parent-activity-panel__count-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: 6px;
}

.parent-activity-panel__count-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary, #303133);
}

.parent-activity-panel__window {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  margin: 0 0 12px;
}

.parent-activity-panel__error {
  color: var(--el-color-danger, #f56c6c);
  padding: 12px 0;
}
</style>
