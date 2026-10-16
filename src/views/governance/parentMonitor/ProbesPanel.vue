<template>
  <div class="probes-panel">
    <EmptyState
      v-if="isEmpty"
      title="尚無探針或健檢資料"
      description="探針排程與設定健檢尚未產生任何結果。"
    />

    <template v-else>
      <section v-if="checkItems.length > 0" class="probes-panel__section">
        <h3 class="probes-panel__title">設定健檢</h3>
        <div
          v-for="item in checkItems"
          :key="item.key"
          :data-testid="`check-${item.key}`"
          :data-state="stateFor(item.ok)"
          class="probes-panel__check-row"
          :class="`probes-panel__check-row--${stateFor(item.ok)}`"
        >
          <div class="probes-panel__check-header">
            <span class="probes-panel__check-label">{{ labelFor(item.key) }}</span>
            <el-tag :type="tagTypeFor(item.ok)">{{ stateLabelFor(item.ok) }}</el-tag>
          </div>
          <p class="probes-panel__check-detail">{{ item.detail }}</p>
          <p v-if="item.ok !== true && item.fix_hint" class="probes-panel__check-fix-hint">
            {{ item.fix_hint }}
          </p>
          <el-link
            v-if="item.ok !== true && item.link && canShowLink(item.link)"
            :href="item.link"
            type="primary"
          >
            前往設定
          </el-link>
        </div>
      </section>

      <section v-if="probeChecks.length > 0" class="probes-panel__section">
        <h3 class="probes-panel__title">探針（近 24 小時）</h3>
        <el-card
          v-for="probe in probeChecks"
          :key="probe.check_name"
          :data-testid="`probe-${probe.check_name}`"
          class="probes-panel__probe-card"
        >
          <div class="probes-panel__probe-header">
            <span class="probes-panel__probe-label">{{ probeLabelFor(probe.check_name) }}</span>
            <span class="probes-panel__probe-availability">
              可用率 {{ availabilityPercent(probe.availability) }}%
            </span>
          </div>
          <p class="probes-panel__probe-latest">
            最近一次：{{ latestStateLabel(probe.latest) }}
            <template v-if="probe.latest?.detail"> — {{ probe.latest.detail }}</template>
          </p>
        </el-card>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 探針與設定健檢分頁（SPEC-023 批次 1，Task 14）。
 *
 * 這是整頁最實用的分頁：燈板告訴使用者「壞了」，本分頁告訴使用者「怎麼修」。
 *
 * `ok` 是三態，不是布林：`true` / `false` / `null`。`null` 代表「無法確認」
 * （LINE API 打不通、斷路器開啟、找不到對外網址），不是「設定錯了」——
 * 誤報成失敗會讓使用者不再信任這頁。每列用 `data-state` 標
 * `ok` / `error` / `unknown` 三值供測試斷言，並各自對應不同的視覺樣式
 * （綠色打勾 / 紅色驚嘆號 / 灰色問號），避免使用者把「無法確認」誤讀成紅燈。
 *
 * 失敗與無法確認項顯示後端算好的 `fix_hint`（原文顯示，不截斷不改寫）——
 * 這是後端已經把修法寫成人話的價值所在。
 *
 * ⚠ `public_origin` 的 `link` 指向 `/platform/tenants/{id}`，是平台層頁面
 * （需要 `PLATFORM_*` 權限）。分校 admin 若只持 `AUDIT_LOGS`，點了會被路由
 * 守衛擋下。判斷方式一律看 link 是否以 `/platform/` 開頭（不對單一 key
 * 硬編），有 `PLATFORM_TENANTS_MANAGE` 權限才渲染連結，否則只顯示
 * `fix_hint`（後端已把該 fix_hint 寫成「請聯絡總部管理員」）。
 *
 * key 對中文名稱的對照表放模組層，比照 LightsBoard 的 `LIGHT_LABELS`；
 * 對不到的 key fallback 顯示原字串，但正常情況不該讓使用者看到原始 key。
 */
import { computed, onMounted, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import { getParentMonitorConfigCheck, getParentMonitorProbes } from '@/api/parentMonitor'
import { hasPermission } from '@/utils/auth'

type ConfigCheckData = Awaited<ReturnType<typeof getParentMonitorConfigCheck>>['data']
type ConfigCheckItem = NonNullable<ConfigCheckData['items']>[number]
type ProbesData = Awaited<ReturnType<typeof getParentMonitorProbes>>['data']
type ProbeCheckSummary = NonNullable<ProbesData['checks']>[number]
type ProbeRun = NonNullable<ProbeCheckSummary['latest']>

// 八個健檢 key 的中文名稱。key 與後端 services/parent_monitor/config_check.py
// 的規則一一對應，後端改名要一起改這裡（沒對到的 key 會 fallback 顯示原字串）。
const CHECK_LABELS: Record<string, string> = {
  line_login_channel_id: 'LINE 登入 channel ID',
  liff_id: 'LIFF ID',
  channel_secret: 'Channel Secret',
  channel_access_token: 'Channel Access Token',
  line_enabled: 'LINE 功能開關',
  public_origin: '對外網址',
  webhook_endpoint_matches: 'Webhook 端點比對',
  rich_menu_exists: 'Rich Menu',
}

// 三個探針 check_name 的中文名稱。
const PROBE_LABELS: Record<string, string> = {
  tenant_meta: '租戶中繼資料',
  liff_login_negative: 'LIFF 登入（反向探測）',
  fe_entry: '前端入口',
}

type CheckState = 'ok' | 'error' | 'unknown'

function stateFor(ok: boolean | null | undefined): CheckState {
  if (ok === true) return 'ok'
  if (ok === false) return 'error'
  return 'unknown'
}

function tagTypeFor(ok: boolean | null | undefined): 'success' | 'danger' | 'info' {
  const state = stateFor(ok)
  if (state === 'ok') return 'success'
  if (state === 'error') return 'danger'
  return 'info'
}

function stateLabelFor(ok: boolean | null | undefined): string {
  const state = stateFor(ok)
  if (state === 'ok') return '通過'
  if (state === 'error') return '失敗'
  return '無法確認'
}

function labelFor(key: string): string {
  return CHECK_LABELS[key] ?? key
}

function probeLabelFor(checkName: string): string {
  return PROBE_LABELS[checkName] ?? checkName
}

/**
 * 平台層連結只在使用者持有 `PLATFORM_TENANTS_MANAGE` 時渲染。判斷依 link
 * 是否以 `/platform/` 開頭，不對單一 key（如 `public_origin`）硬編——
 * 之後若有別的健檢項也連到平台層頁面，同一條規則自動適用。
 */
function canShowLink(link: string): boolean {
  if (link.startsWith('/platform/')) {
    return hasPermission('PLATFORM_TENANTS_MANAGE')
  }
  return true
}

function availabilityPercent(availability: number | null | undefined): number {
  if (availability === null || availability === undefined) return 0
  return Math.round(availability * 100)
}

function latestStateLabel(latest: ProbeRun | null | undefined): string {
  if (!latest) return '尚無資料'
  return stateLabelFor(latest.ok)
}

const checkItems = ref<ConfigCheckItem[]>([])
const probeChecks = ref<ProbeCheckSummary[]>([])
const loading = ref(true)

const isEmpty = computed(
  () => !loading.value && checkItems.value.length === 0 && probeChecks.value.length === 0,
)

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [probesRes, configCheckRes] = await Promise.all([
      getParentMonitorProbes({ hours: 24 }),
      getParentMonitorConfigCheck(),
    ])
    probeChecks.value = probesRes.data.checks ?? []
    checkItems.value = configCheckRes.data.items ?? []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})
</script>

<style scoped>
.probes-panel__section {
  margin-bottom: 20px;
}

.probes-panel__title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--el-text-color-primary, #303133);
}

.probes-panel__check-row {
  padding: 12px 16px;
  border-left: 4px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  background: var(--el-fill-color-blank, #fff);
  margin-bottom: 10px;
}

.probes-panel__check-row--ok {
  border-left-color: var(--el-color-success, #67c23a);
}

.probes-panel__check-row--error {
  border-left-color: var(--el-color-danger, #f56c6c);
}

.probes-panel__check-row--unknown {
  border-left-color: var(--el-color-info, #909399);
}

.probes-panel__check-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.probes-panel__check-label {
  font-weight: 600;
}

.probes-panel__check-detail {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-regular, #606266);
}

.probes-panel__check-fix-hint {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.probes-panel__probe-card {
  margin-bottom: 10px;
}

.probes-panel__probe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.probes-panel__probe-label {
  font-weight: 600;
}

.probes-panel__probe-availability {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.probes-panel__probe-latest {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-regular, #606266);
}
</style>
