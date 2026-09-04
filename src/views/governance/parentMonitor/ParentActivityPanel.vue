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
 * 1. **不傳 `entity_type`**：計畫假設的 `'parent_auth'` 不存在。真實值是
 *    `'auth'`（`write_login_audit` 固定寫死，LOGIN／LOGIN_FAILED／
 *    REFRESH_FAILED／BIND_FAILED 皆走此函式，且**員工端登入也共用同一個
 *    entity_type**）與 `'parent_device_setup'`（device-setup 管道另外指定）。
 *    改用 `action` 精確查詢即可同時涵蓋兩個管道，不必為此多打兩次查詢。
 * 2. **`LOGIN`／`BIND_FAILED`／`REFRESH_FAILED` 三個 action 字串全 repo
 *    唯一**（僅 `api/parent_portal/auth.py` 使用），直接信任後端 `total`。
 * 3. **`LOGIN_FAILED` 與員工端撞名**：`api/auth.py` 的 4 處員工登入失敗
 *    稽核也是 `action='LOGIN_FAILED'`、`entity_type='auth'`，且同樣因為
 *    登入失敗當下沒有 token，`derive_actor_type` 一樣推導成
 *    `actor_type='anonymous'`——`actor_type` 對這個 action 完全沒有鑑別力。
 *    改用 `username` 二次過濾：家長端（liff 與 device-setup 兩管道皆然）
 *    刻意不寫 username（防稽核本身洩漏 LINE 帳號存在性），員工端必帶帳號
 *    名，故 `!item.username` 可同時涵蓋兩個家長端管道並排除員工端。
 * 4. **`BIND_FAILED` 的 `actor_type` 隨端點而異**：`/bind`（首綁，短效
 *    bind token）失敗回 `anonymous`；`/bind-additional`（已登入家長）失敗
 *    回 `parent`。故此查詢刻意不加 `actor_type` 篩選（會漏掉一半），直接
 *    信任 action 本身的唯一性。
 *
 * `LOGIN` 與 `REFRESH_FAILED` 兩者 `actor_type` 固定（分別恆為 parent／
 * anonymous），額外帶上作雙重保險，不影響結果、增加一層防禦縱深。
 */
import { computed, onMounted, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import { getAuditLogs } from '@/api/audit'
import { getErrorMessage } from '@/utils/errorHandler'

interface AuditLogItem {
  action: string
  actor_type: string | null
  username: string | null
  entity_type: string
  summary: string
  created_at: string
}

interface AuditLogListResponse {
  items: AuditLogItem[]
  total: number
}

// 單次查詢的頁面大小上限（後端 `page_size` le=200）。這是 24 小時健康面板，
// 不是逐筆列表，量若逼近上限本身就是值得留意的異常流量訊號。
const PAGE_SIZE = 200

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

async function fetchCount(
  action: ActionKey,
  window: { start_at: string; end_at: string },
  actorType?: 'parent' | 'anonymous',
): Promise<number> {
  const params: Record<string, unknown> = {
    action,
    start_at: window.start_at,
    end_at: window.end_at,
    page_size: PAGE_SIZE,
  }
  if (actorType) params.actor_type = actorType

  const res = await getAuditLogs(params)
  const data = res.data as AuditLogListResponse

  if (action === 'LOGIN_FAILED') {
    // 排除帶 username 的員工端登入失敗（見檔頭註解第 3 點）。
    return (data.items ?? []).filter((item) => !item.username).length
  }
  return data.total ?? 0
}

async function fetchData(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  const window = last24Hours()
  try {
    const [login, loginFailed, bindFailed, refreshFailed] = await Promise.all([
      fetchCount('LOGIN', window, 'parent'),
      fetchCount('LOGIN_FAILED', window),
      fetchCount('BIND_FAILED', window),
      fetchCount('REFRESH_FAILED', window, 'anonymous'),
    ])
    counts.value = {
      LOGIN: login,
      LOGIN_FAILED: loginFailed,
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
