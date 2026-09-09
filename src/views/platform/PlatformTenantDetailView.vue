<template>
  <div class="platform-tenant-detail">
    <PageHeader :title="headerTitle" :subtitle="tenant?.slug || ''">
      <template #title-extra>
        <el-tag v-if="tenant" :type="tenantStatusTagType(tenant.status)" data-testid="detail-status">
          {{ tenantStatusLabel(tenant.status) }}
        </el-tag>
      </template>
      <template #actions>
        <el-button :loading="loading" data-testid="detail-reload" @click="load">重新載入</el-button>
        <template v-if="canManage && tenant && tenant.kind !== 'platform'">
          <el-button v-if="tenant.status === 'active'" type="warning" data-testid="detail-suspend" @click="changeStatus('suspend')">停用</el-button>
          <el-button v-else-if="tenant.status === 'suspended'" type="success" data-testid="detail-resume" @click="changeStatus('resume')">恢復</el-button>
        </template>
      </template>
    </PageHeader>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      data-testid="detail-error"
      :title="loadError"
      class="platform-tenant-detail__alert"
    />

    <el-tabs v-if="tenant" :key="tenant.id" v-model="activeTab" data-testid="detail-tabs">
      <el-tab-pane label="基本資料" name="basic">
        <TenantBasicTab :key="`basic:${tenant.id}`" :tenant="tenant" @updated="onUpdated" />
      </el-tab-pane>
      <el-tab-pane label="品牌設定" name="brand">
        <TenantBrandTab v-if="activeTab === 'brand'" :key="`brand:${tenant.id}`" :tenant-id="tenant.id" />
      </el-tab-pane>
      <el-tab-pane label="LINE 憑證" name="line">
        <TenantLineTab v-if="activeTab === 'line'" :key="`line:${tenant.id}`" :tenant-id="tenant.id" />
      </el-tab-pane>
      <el-tab-pane label="Email 設定" name="email">
        <TenantEmailTab v-if="activeTab === 'email'" :key="`email:${tenant.id}`" :tenant-id="tenant.id" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import { hasPermission } from '@/utils/auth'
import { getErrorMessage } from '@/utils/errorHandler'
import { setActingTenant } from '@/composables/useActingTenant'
import { getTenant, resumeTenant, suspendTenant, type TenantDetail } from '@/api/platform'
import TenantBasicTab from './TenantBasicTab.vue'
import TenantBrandTab from './TenantBrandTab.vue'
import TenantEmailTab from './TenantEmailTab.vue'
import TenantLineTab from './TenantLineTab.vue'
import { tenantStatusLabel, tenantStatusTagType } from './tenantDisplay'

const route = useRoute()

const canManage = computed(() => hasPermission('PLATFORM_TENANTS_MANAGE'))
const activeTab = ref<'basic' | 'brand' | 'line' | 'email'>('basic')
const tenant = ref<TenantDetail | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
let loadGeneration = 0

const tenantId = computed(() => Number(route.params.id))
const headerTitle = computed(() => tenant.value?.display_name || tenant.value?.name || '分校詳情')

/**
 * 本頁**刻意不用 `useCachedAsync`**：它是 mutation 密集頁（改基本資料 / 品牌 / LINE），
 * SWR 的「先給舊值再背景刷新」在這裡只會讓剛存好的值閃回舊的。清單與報表那類唯讀頁
 * 才走 `useCachedAsync` + `platformCacheKey()`。
 *
 * acting tenant 由本頁負責設定（CT-A-06）：換分校 = 換身分視角，`setActingTenant()`
 * 內部會 `advanceAdminSession()` 中止上一校的 in-flight 請求並清掉跨頁快取，
 * 避免甲校的回應落在乙校畫面上。
 */
async function load(): Promise<void> {
  const generation = ++loadGeneration
  const id = tenantId.value
  // 路由一換就先卸載上一校所有可寫表單，避免新租戶載入期間仍可操作舊資料。
  tenant.value = null
  loadError.value = null
  if (!Number.isFinite(id) || id <= 0) {
    loadError.value = '網址中的分校編號無效'
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await getTenant(id)
    if (generation !== loadGeneration || id !== tenantId.value) return
    const nextTenant = res.data ?? null
    tenant.value = nextTenant
    if (nextTenant) {
      setActingTenant({
        id: nextTenant.id,
        slug: nextTenant.slug,
        name: nextTenant.display_name || nextTenant.name,
        public_origin: nextTenant.public_origin,
      })
    }
  } catch (err) {
    if (generation !== loadGeneration || id !== tenantId.value) return
    loadError.value = getErrorMessage(err, '分校資料載入失敗')
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

function onUpdated(next: TenantDetail): void {
  if (next.id !== tenantId.value) return
  tenant.value = next
  setActingTenant({
    id: next.id,
    slug: next.slug,
    name: next.display_name || next.name,
    public_origin: next.public_origin,
  })
}

async function changeStatus(action: 'suspend' | 'resume'): Promise<void> {
  if (!tenant.value) return
  const targetTenantId = tenant.value.id
  const generation = loadGeneration
  const label = action === 'suspend' ? '停用' : '恢復'
  try {
    await ElMessageBox.confirm(`確定要${label}「${headerTitle.value}」嗎？`, `${label}分校`, {
      type: 'warning',
      confirmButtonText: '確定',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  if (generation !== loadGeneration || tenant.value?.id !== targetTenantId) return
  try {
    await (action === 'suspend' ? suspendTenant : resumeTenant)(targetTenantId)
    if (generation !== loadGeneration || tenantId.value !== targetTenantId) return
    ElMessage.success(`${label}完成`)
    await load()
  } catch (err) {
    if (generation !== loadGeneration || tenantId.value !== targetTenantId) return
    ElMessage.error(getErrorMessage(err, `${label}失敗`))
  }
}

watch(tenantId, load, { immediate: true, flush: 'sync' })

onUnmounted(() => {
  // 不清 acting tenant，但要讓離頁後才回來的 request 失效，避免切回舊校視角。
  loadGeneration += 1
})

// ⚠ 刻意**不在** `onUnmounted` 清 acting tenant：`setActingTenant(null)` 會
// `advanceAdminSession()`，那會中止「正要進入的下一頁」剛送出的請求，並且對其他分頁
// 廣播一次身分重置。acting tenant 只在「顯式換一間分校」時變更（＝本頁 load 成功時），
// 登入/登出/跨分頁換身分則由 adminSession 的 reset listener 自動歸零。
</script>

<style scoped>
.platform-tenant-detail__alert {
  margin: var(--space-3) 0;
}
</style>
