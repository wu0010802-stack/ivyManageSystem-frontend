<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getAuditLogs, getAuditLogsMeta, exportAuditLogs } from '@/api/audit'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import AuditChangesDetail from '@/components/AuditChangesDetail.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

// 手機版（≤767.98px）：清單改卡片視圖（比照 EmployeeListView 範式）
const { isMobile } = useIsMobile()

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

interface AuditLog {
  id: number
  entity_type: string
  entity_id?: number | string | null
  action: string
  username?: string
  ip_address?: string
  created_at?: string
  changes?: Record<string, unknown>
  impersonated_by?: number | null
  impersonated_by_name?: string | null
  [key: string]: unknown
}

interface MetaOption {
  value: string
  label: string
}

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const exporting = ref(false)
const logs = ref<AuditLog[]>([])
const total = ref(0)

const entityTypes = ref<MetaOption[]>([])
const actionTypes = ref<MetaOption[]>([])
const fieldLabels = ref<Record<string, string>>({})

const filters = reactive({
  search: '',
  entity_type: '',
  action: '',
  username: '',
  entity_id: '',
  ip_address: '',
  risk_tag: '',
  start_at: '',
  end_at: '',
  page: 1,
  page_size: 50,
})

// 登入活動（token 刷新）量大，預設隱藏免得業務操作被洗出畫面外；紀錄照常寫入，
// 要看時勾起來即可。顯式選了資源類型時後端不套此排除（「登入失敗」快篩才不會壞）。
const includeAuth = ref(false)

// entity_type → 前端路由生成函式。只對「有 id 專屬詳情頁」的資源建連結，
// 避免點「#5」卻跳去列表頁這種假導航（其他 entity 只有列表頁）。
const ENTITY_ROUTES: Record<string, (id: number | string | null | undefined) => { path: string; query?: Record<string, string | number> } | null> = {
  student: (id) => (id ? { path: `/students/profile/${id}` } : null),
  // 收支簽收：整合頁支援 ?tab=<模組>&highlight=<id> 自動開啟該筆編輯 dialog
  vendor_payment: (id) =>
    id ? { path: '/finance-signoffs', query: { tab: 'vendor', highlight: String(id) } } : null,
  misc_receipt: (id) =>
    id ? { path: '/finance-signoffs', query: { tab: 'misc', highlight: String(id) } } : null,
}

// 快篩：宣告式伺服端參數 patch（changes 類條件由後端 risk_tags 欄過濾，
// 全庫一致、total 正確；舊客端 predicate 已移除）
const RISK_QUICK_FILTERS: {
  key: string
  label: string
  params: { entity_type?: string; action?: string; risk_tag?: string }
}[] = [
  { key: 'leave', label: '請假', params: { entity_type: 'leave' } },
  { key: 'overtime', label: '加班', params: { entity_type: 'overtime' } },
  { key: 'fee', label: '學費', params: { entity_type: 'fee' } },
  { key: 'refund', label: '退款', params: { risk_tag: 'refund' } },
  { key: 'large_amount', label: '大額金流', params: { risk_tag: 'large_amount' } },
  { key: 'force_overlay', label: '強制放行', params: { risk_tag: 'force_overlay' } },
  { key: 'reject_approved', label: '已核准後修改', params: { risk_tag: 'reject_approved' } },
  { key: 'login_failed', label: '登入失敗', params: { entity_type: 'auth', action: 'LOGIN_FAILED' } },
  { key: 'login_blocked', label: '登入限流/鎖定', params: { risk_tag: 'login_blocked' } },
]

const activeRiskFilter = ref('')

// URL 同步的篩選 key（page_size 不進 URL——非分享語意）
const URL_FILTER_KEYS = [
  'entity_type', 'action', 'username', 'entity_id', 'ip_address',
  'risk_tag', 'start_at', 'end_at',
] as const

const hydrateFromQuery = () => {
  for (const k of URL_FILTER_KEYS) {
    const v = route.query[k]
    if (typeof v === 'string' && v) filters[k] = v
  }
  const page = Number(route.query.page)
  if (Number.isInteger(page) && page >= 1) filters.page = page
  const risk = route.query.risk
  if (typeof risk === 'string' && RISK_QUICK_FILTERS.some((f) => f.key === risk)) {
    activeRiskFilter.value = risk
  }
}

const syncQueryToUrl = () => {
  const query: Record<string, string> = {}
  for (const k of URL_FILTER_KEYS) {
    if (filters[k]) query[k] = String(filters[k])
  }
  if (filters.page > 1) query.page = String(filters.page)
  if (activeRiskFilter.value) query.risk = activeRiskFilter.value
  // replace 不進 history stack，避免每次查詢都多一筆返回紀錄
  router.replace({ query })
}

const applyRiskFilter = (key: string) => {
  const clearQuickParams = () => {
    filters.entity_type = ''
    filters.action = ''
    filters.risk_tag = ''
  }
  if (activeRiskFilter.value === key) {
    activeRiskFilter.value = ''
    clearQuickParams()
  } else {
    activeRiskFilter.value = key
    const def = RISK_QUICK_FILTERS.find((f) => f.key === key)
    clearQuickParams()
    if (def) {
      if (def.params.entity_type) filters.entity_type = def.params.entity_type
      if (def.params.action) filters.action = def.params.action
      if (def.params.risk_tag) filters.risk_tag = def.params.risk_tag
    }
  }
  filters.page = 1
  fetchLogs()
}

const buildFilterParams = () => {
  const params: Record<string, unknown> = {}
  if (filters.search) params.search = filters.search
  if (filters.entity_type) params.entity_type = filters.entity_type
  if (filters.action) params.action = filters.action
  if (filters.username) params.username = filters.username
  if (filters.entity_id && filters.entity_type) params.entity_id = filters.entity_id
  if (filters.ip_address) params.ip_address = filters.ip_address
  if (filters.risk_tag) params.risk_tag = filters.risk_tag
  if (filters.start_at) params.start_at = filters.start_at
  if (filters.end_at) params.end_at = filters.end_at
  // 列表與 CSV 匯出共用本函式，兩者口徑一致（畫面看到什麼就匯出什麼）
  if (!includeAuth.value) params.include_auth = false
  return params
}

const fetchMeta = async () => {
  try {
    const res = await getAuditLogsMeta()
    const d = res.data as { entity_types: MetaOption[]; actions: MetaOption[]; field_labels?: Record<string, string> }
    entityTypes.value = d.entity_types
    actionTypes.value = d.actions
    fieldLabels.value = d.field_labels || {}
  } catch {
    // meta 抓不到不影響查詢
  }
}

const fetchLogs = async () => {
  loading.value = true
  try {
    const params = {
      ...buildFilterParams(),
      page: filters.page,
      page_size: filters.page_size,
    }
    const res = await getAuditLogs(params)
    const d = res.data as { items: AuditLog[]; total: number }
    logs.value = d.items
    total.value = d.total
    syncQueryToUrl()
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 403) {
      ElMessage.error('需要管理員權限')
    } else {
      ElMessage.error(friendlyError('載入操作紀錄失敗', error))
    }
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  if (filters.entity_id && !filters.entity_type) {
    ElMessage.warning('使用「資源 ID」篩選前請先選擇資源類型')
    return
  }
  filters.page = 1
  fetchLogs()
}

const handleReset = () => {
  filters.entity_type = ''
  filters.search = ''
  filters.action = ''
  filters.username = ''
  filters.entity_id = ''
  filters.ip_address = ''
  filters.risk_tag = ''
  filters.start_at = ''
  filters.end_at = ''
  filters.page = 1
  activeRiskFilter.value = ''
  includeAuth.value = false
  fetchLogs()
}

// 空狀態文案判斷：查詢條件（篩選欄位或高風險快篩）是否有任一生效
const hasActiveFilter = computed(() =>
  Boolean(filters.search) ||
  Boolean(filters.entity_type) ||
  Boolean(filters.action) ||
  Boolean(filters.username) ||
  Boolean(filters.entity_id) ||
  Boolean(filters.ip_address) ||
  Boolean(filters.risk_tag) ||
  Boolean(filters.start_at) ||
  Boolean(filters.end_at) ||
  Boolean(activeRiskFilter.value)
)

// 手機卡片欄位（__ 前綴為 slot-only 欄）。桌機的 type="expand" 展開列在卡片
// 改用 el-collapse（見 #cell-__changes），維持「預設收合、需要才展開」的行為
const auditCardColumns = [
  { label: '時間', prop: '__time' },
  { label: '使用者', prop: '__operator' },
  { label: '操作', prop: '__action' },
  { label: '資源', prop: '__entity' },
  { label: 'IP', prop: '__ip', formatter: (r: Record<string, unknown>) => (r.ip_address as string) || '—' },
  { label: '摘要', prop: '__summary', block: true },
  { label: '變更明細', prop: '__changes', block: true },
]

// 高風險旗標：用於行內顯示警示徽章
const getRiskBadges = (row: AuditLog) => {
  const c = (row.changes || {}) as Record<string, unknown>
  const badges: { type: ElTagType; label: string }[] = []
  const tags = (c.risk_tags as string[]) || []
  if (tags.includes('force_overlap')) badges.push({ type: 'danger', label: '強制重疊' })
  if (tags.includes('force_without_substitute'))
    badges.push({ type: 'danger', label: '無代理人' })
  if (tags.includes('reject_of_approved'))
    badges.push({ type: 'warning' as ElTagType, label: '駁回已核准' })
  if (c.action === 'leave_update' && c.was_approved)
    badges.push({ type: 'warning' as ElTagType, label: '修改已核准' })
  if (c.action === 'overtime_update' && c.was_approved)
    badges.push({ type: 'warning' as ElTagType, label: '修改已核准' })
  if (c.action === 'fee_refund') badges.push({ type: 'info' as ElTagType, label: '退款' })
  // 大額金流（本次本筆 > 5000）
  const amounts = [c.delta, c.refund_amount, c.new_paid]
  if (amounts.some((v) => typeof v === 'number' && Math.abs(v) >= 5000))
    badges.push({ type: 'danger' as ElTagType, label: '大額' })
  return badges
}

const handlePageChange = (page: number) => {
  filters.page = page
  fetchLogs()
}

const handlePageSizeChange = (size: number) => {
  filters.page_size = size
  filters.page = 1
  fetchLogs()
}

const setQuickRange = (kind: string) => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  if (kind === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  } else if (kind === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  } else if (kind === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    filters.start_at = fmt(start)
    filters.end_at = fmt(now)
  }
  handleSearch()
}

const handleExport = async () => {
  if (total.value === 0) {
    ElMessage.info('目前查詢結果為空，沒有可匯出內容')
    return
  }
  exporting.value = true
  try {
    const res = await exportAuditLogs(buildFilterParams())
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    a.download = `audit_logs_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('匯出成功')
  } catch (error) {
    // 超量匯出是 400。其 detail：api interceptor 已把 application/json 的 blob 錯誤體解碼成
    // 物件（少數情況仍可能是未解碼 Blob，故兩形態都處理），避免 interceptor 改動後丟失下方引導。
    const err = error as {
      response?: { status?: number; data?: unknown }
      displayMessage?: string | null
    }
    if (err.response?.status === 400) {
      let detail = ''
      const data = err.response.data
      if (data instanceof Blob) {
        try {
          detail = (JSON.parse(await data.text()) as { detail?: string }).detail || ''
        } catch { /* 解析失敗：留空，走通用文案 */ }
      } else {
        detail = (data as { detail?: string })?.detail || err.displayMessage || ''
      }
      // 超量 400：補可操作引導，避免使用者只看到硬訊息卻不知如何縮小範圍
      ElMessage.error({
        message: `${detail || '匯出失敗'}　請縮小範圍後再試：設定起訖時間（或用快捷時段），並可加上資源類型／操作者等篩選。`,
        duration: 6000,
      })
    } else {
      ElMessage.error(
        (err.response?.data as { detail?: string })?.detail || err.displayMessage || '匯出失敗',
      )
    }
  } finally {
    exporting.value = false
  }
}

const getActionTag = (action: string) => {
  const map: Record<string, { type: ElTagType; label: string }> = {
    CREATE: { type: 'success', label: '新增' },
    UPDATE: { type: 'warning', label: '修改' },
    DELETE: { type: 'danger', label: '刪除' },
    EXPORT: { type: 'info', label: '匯出' },
    READ: { type: 'info', label: '查看' },
    LOGIN_SUCCESS: { type: 'success', label: '登入成功' },
    LOGIN_FAILED: { type: 'warning', label: '登入失敗' },
    LOGIN_RATE_LIMITED: { type: 'danger', label: '登入被限流' },
    LOGIN_LOCKED: { type: 'danger', label: '帳號鎖定中' },
    LOGOUT: { type: 'info', label: '登出' },
    TOKEN_REFRESH: { type: 'info', label: 'Token 刷新' },
    TOKEN_REFRESH_FAILED: { type: 'warning', label: 'Token 刷新失敗' },
    BLOCKED_CREATE: { type: 'danger', label: '拒絕新增' },
    BLOCKED_UPDATE: { type: 'danger', label: '拒絕修改' },
    BLOCKED_DELETE: { type: 'danger', label: '拒絕刪除' },
  }
  return map[action] || { type: 'info' as ElTagType, label: action }
}

const entityLabelMap = computed(() => {
  const m: Record<string, string> = {}
  for (const e of entityTypes.value) m[e.value] = e.label
  return m
})

const getEntityLabel = (type: string) => entityLabelMap.value[type] || type

const formatTime = (iso: string | undefined) => {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const resolveRoute = (row: AuditLog) => {
  const fn = ENTITY_ROUTES[row.entity_type]
  if (!fn) return null
  return fn(row.entity_id)
}

const canNavigate = (row: AuditLog) => !!resolveRoute(row)

const goToEntity = (row: AuditLog) => {
  const to = resolveRoute(row)
  if (to) router.push(to)
}

onMounted(async () => {
  hydrateFromQuery()
  await fetchMeta()
  fetchLogs()
})

const formatOperator = (row: Pick<AuditLog, 'username' | 'impersonated_by_name'>) => {
  const base = row.username ?? ''
  return row.impersonated_by_name ? `${base}（代操作：${row.impersonated_by_name}）` : base
}

const HISTORY_PAGE_SIZE = 200

const historyDrawer = reactive({
  visible: false,
  entityType: '',
  entityId: '' as string | number,
  items: [] as AuditLog[],
  total: 0,
  page: 1,
  loading: false,
})

const openHistory = async (row: AuditLog) => {
  if (!row.entity_id) return
  historyDrawer.entityType = row.entity_type
  historyDrawer.entityId = row.entity_id
  historyDrawer.items = []
  historyDrawer.total = 0
  historyDrawer.page = 1
  historyDrawer.visible = true
  await fetchHistoryPage()
}

// 歷史軌跡請求序號：丟棄過期回應（連點/換列時舊請求後到，避免跨資源污染）
let historyRequestSeq = 0

const fetchHistoryPage = async (targetPage: number = historyDrawer.page) => {
  const seq = ++historyRequestSeq
  historyDrawer.loading = true
  try {
    // 不帶 start_at/end_at：後端對 entity_type+entity_id 查詢不套 30 天窗，
    // 才能看到完整歷史（走 ix_audit_entity 索引）
    const res = await getAuditLogs({
      entity_type: historyDrawer.entityType,
      entity_id: historyDrawer.entityId,
      page: targetPage,
      page_size: HISTORY_PAGE_SIZE,
    })
    if (seq !== historyRequestSeq) return
    historyDrawer.page = targetPage // 成功才 commit，失敗重試不跳頁
    const d = res.data as { items: AuditLog[]; total: number }
    historyDrawer.items.push(...d.items)
    historyDrawer.total = d.total
  } catch {
    if (seq === historyRequestSeq) ElMessage.error('載入歷史軌跡失敗')
  } finally {
    if (seq === historyRequestSeq) historyDrawer.loading = false
  }
}

const loadOlderHistory = async () => {
  await fetchHistoryPage(historyDrawer.page + 1)
}

const historyHasMore = computed(() => historyDrawer.items.length < historyDrawer.total)

defineExpose({ formatOperator })
</script>

<template>
  <div class="audit-page">
    <el-card class="filter-card">
      <div class="filters">
        <el-input
          v-model="filters.search"
          placeholder="關鍵字（操作者或摘要）"
          clearable
          style="width: 200px;"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="filters.entity_type" placeholder="資源類型" clearable style="width: 130px;">
          <el-option v-for="et in entityTypes" :key="et.value" :label="et.label" :value="et.value" />
        </el-select>
        <el-select v-model="filters.action" placeholder="操作類型" clearable style="width: 110px;">
          <el-option v-for="at in actionTypes" :key="at.value" :label="at.label" :value="at.value" />
        </el-select>
        <el-input v-model="filters.username" placeholder="使用者名稱" clearable style="width: 140px;" />
        <el-input
          v-model="filters.entity_id"
          :placeholder="filters.entity_type ? '資源 ID' : '資源 ID（先選類型）'"
          :disabled="!filters.entity_type"
          clearable
          style="width: 150px;"
        />
        <el-input v-model="filters.ip_address" placeholder="IP 包含" clearable style="width: 130px;" />
        <el-date-picker
          v-model="filters.start_at"
          type="datetime"
          placeholder="起始時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px;"
        />
        <el-date-picker
          v-model="filters.end_at"
          type="datetime"
          placeholder="結束時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px;"
        />
        <el-checkbox v-model="includeAuth" @change="handleSearch">
          含登入活動
        </el-checkbox>
        <el-button type="primary" @click="handleSearch">查詢</el-button>
        <el-button @click="handleReset">重置</el-button>
        <el-button :loading="exporting" @click="handleExport">匯出 CSV</el-button>
      </div>
      <div class="quick-ranges">
        <span class="quick-label">快捷時段：</span>
        <el-button size="small" link @click="setQuickRange('today')">今日</el-button>
        <el-button size="small" link @click="setQuickRange('7d')">近 7 日</el-button>
        <el-button size="small" link @click="setQuickRange('month')">本月</el-button>
        <span v-if="!filters.start_at && !filters.end_at" class="risk-hint">
          未設定起訖時間時預設只顯示最近 30 天；要查更早的紀錄請設定起始時間或用快捷時段
        </span>
      </div>
      <div class="quick-ranges">
        <span class="quick-label">高風險快篩：</span>
        <el-button
          v-for="rf in RISK_QUICK_FILTERS"
          :key="rf.key"
          size="small"
          :type="activeRiskFilter === rf.key ? 'primary' : ''"
          @click="applyRiskFilter(rf.key)"
        >
          {{ rf.label }}
        </el-button>
        <el-button v-if="activeRiskFilter" size="small" link @click="applyRiskFilter(activeRiskFilter)">
          清除
        </el-button>
      </div>
    </el-card>

    <el-table
      v-if="!isMobile"
      :data="logs"
      border
      stripe
      style="width: 100%; margin-top: 20px;"
      v-loading="loading"
      max-height="600"
    >
      <template #empty>
        <EmptyState
          :title="hasActiveFilter ? '目前篩選條件下沒有紀錄' : '尚無操作紀錄'"
          :description="hasActiveFilter ? '試著調整篩選條件或高風險快篩後再查詢' : ''"
          variant="inline"
        />
      </template>
      <el-table-column type="expand">
        <template #default="{ row }">
          <AuditChangesDetail :changes="row.changes" :field-labels="fieldLabels" />
        </template>
      </el-table-column>
      <el-table-column label="時間" width="170">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.created_at) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="使用者" width="110">
        <template #default="{ row }">
          <span>{{ formatOperator(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="getActionTag(row.action).type" size="small">
            {{ getActionTag(row.action).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="資源類型" width="110">
        <template #default="{ row }">{{ getEntityLabel(row.entity_type) }}</template>
      </el-table-column>
      <el-table-column label="資源 ID" width="100">
        <template #default="{ row }">
          <el-button
            v-if="row.entity_id && canNavigate(row)"
            link
            type="primary"
            size="small"
            @click="goToEntity(row)"
          >
            #{{ row.entity_id }}
          </el-button>
          <span v-else>{{ row.entity_id || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="摘要" min-width="200">
        <template #default="{ row }">
          <div class="summary-cell">
            <span class="summary-text" :title="row.summary">{{ row.summary }}</span>
            <div v-if="getRiskBadges(row).length > 0" class="risk-badges">
              <el-tag
                v-for="b in getRiskBadges(row)"
                :key="b.label"
                :type="b.type"
                size="small"
                effect="dark"
              >
                {{ b.label }}
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="ip_address" label="IP" width="130" />
      <el-table-column label="歷史" width="70" align="center" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.entity_id" link type="primary" size="small" @click="openHistory(row)">
            歷史
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <AdminListCards
      v-else
      :items="(logs as unknown as Record<string, unknown>[])"
      :columns="auditCardColumns"
      row-key="id"
      :loading="loading"
      :empty-text="hasActiveFilter ? '目前篩選條件下沒有紀錄' : '尚無操作紀錄'"
    >
      <template #title="{ item }">
        {{ getEntityLabel(item.entity_type as string) }}
        <span v-if="item.entity_id" class="card-entity-id">#{{ item.entity_id }}</span>
      </template>
      <template #cell-__time="{ item }">
        <span class="time-text">{{ formatTime(item.created_at as string) }}</span>
      </template>
      <template #cell-__operator="{ item }">{{ formatOperator(item as unknown as AuditLog) }}</template>
      <template #cell-__action="{ item }">
        <el-tag :type="getActionTag(item.action as string).type" size="small">
          {{ getActionTag(item.action as string).label }}
        </el-tag>
      </template>
      <template #cell-__entity="{ item }">
        <el-button
          v-if="item.entity_id && canNavigate(item as unknown as AuditLog)"
          link
          type="primary"
          size="small"
          @click="goToEntity(item as unknown as AuditLog)"
        >前往 #{{ item.entity_id }}</el-button>
        <span v-else>{{ item.entity_id || '—' }}</span>
      </template>
      <template #cell-__summary="{ item }">
        <div class="summary-cell">
          <span class="summary-text">{{ item.summary }}</span>
          <div v-if="getRiskBadges(item as unknown as AuditLog).length > 0" class="risk-badges">
            <el-tag
              v-for="b in getRiskBadges(item as unknown as AuditLog)"
              :key="b.label"
              :type="b.type"
              size="small"
              effect="dark"
            >{{ b.label }}</el-tag>
          </div>
        </div>
      </template>
      <template #cell-__changes="{ item }">
        <el-collapse class="card-changes-collapse">
          <el-collapse-item title="展開變更明細" :name="`changes-${item.id}`">
            <AuditChangesDetail :changes="item.changes as Record<string, unknown>" :field-labels="fieldLabels" />
          </el-collapse-item>
        </el-collapse>
      </template>
      <template #actions="{ item }">
        <el-button v-if="item.entity_id" link type="primary" size="small" @click="openHistory(item as unknown as AuditLog)">
          歷史軌跡
        </el-button>
      </template>
    </AdminListCards>

    <div class="pagination-wrapper">
      <el-pagination
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-sizes="[20, 50, 100, 200]"
        :page-size="filters.page_size"
        :current-page="filters.page"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </div>

    <el-drawer
      v-model="historyDrawer.visible"
      :title="`${getEntityLabel(historyDrawer.entityType)} #${historyDrawer.entityId} 歷史軌跡`"
      size="50%"
    >
      <div v-loading="historyDrawer.loading">
        <el-timeline>
          <el-timeline-item
            v-for="item in historyDrawer.items"
            :key="item.id"
            :timestamp="formatTime(item.created_at)"
            placement="top"
          >
            <div class="history-node">
              <div class="history-head">
                <el-tag :type="getActionTag(item.action).type" size="small">
                  {{ getActionTag(item.action).label }}
                </el-tag>
                <span class="history-operator">{{ formatOperator(item) }}</span>
              </div>
              <div class="history-summary">{{ item.summary }}</div>
              <AuditChangesDetail
                v-if="item.changes && Object.keys(item.changes).length > 0"
                :changes="item.changes"
                :field-labels="fieldLabels"
              />
            </div>
          </el-timeline-item>
        </el-timeline>
        <div v-if="historyHasMore" class="history-more">
          <el-button size="small" :disabled="historyDrawer.loading" @click="loadOlderHistory">載入更早</el-button>
        </div>
        <div v-if="!historyDrawer.loading && historyDrawer.items.length === 0" class="no-changes">
          此資源尚無稽核紀錄。
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: var(--space-4);
}
.filters {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.quick-ranges {
  margin-top: var(--space-2);
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.quick-label {
  color: var(--text-secondary, var(--neutral-600));
  font-size: var(--text-sm);
}
.risk-hint {
  color: var(--color-warning-hover);
  font-size: var(--text-sm);
  margin-left: var(--space-2);
}
.pagination-wrapper {
  margin-top: var(--space-4);
  display: flex;
  justify-content: center;
}
.time-text {
  font-size: var(--text-sm);
  font-family: monospace;
}
.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.summary-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.risk-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
/* 手機卡片：摘要恢復全文換行（表格版的 nowrap+ellipsis 是為了塞進固定欄寬，
   卡片沒有這個限制，且觸控裝置沒有 hover title 可看全文） */
.admin-list-cards .summary-text {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
}
.card-entity-id {
  color: var(--text-tertiary);
  font-weight: normal;
}
/* 變更明細 collapse 併入卡片：去掉 EP 預設外框與左右內距，貼齊卡片欄位 */
.card-changes-collapse {
  border-top: none;
  border-bottom: none;
}
.card-changes-collapse :deep(.el-collapse-item__header),
.card-changes-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.card-changes-collapse :deep(.el-collapse-item__content) {
  padding-bottom: var(--space-2);
}
.history-node {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.history-head {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.history-operator {
  font-size: var(--text-sm);
  color: var(--text-secondary, var(--neutral-600));
}
.history-summary {
  font-size: var(--text-sm);
}
.history-more {
  margin-top: var(--space-3);
  text-align: center;
}
.no-changes {
  color: var(--text-secondary, var(--neutral-500));
  padding: var(--space-2);
  font-style: italic;
}
</style>
