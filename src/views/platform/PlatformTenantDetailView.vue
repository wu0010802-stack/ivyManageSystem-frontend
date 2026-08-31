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

    <el-tabs v-if="tenant" v-model="activeTab" data-testid="detail-tabs">
      <el-tab-pane label="基本資料" name="basic">
        <TenantBasicTab :tenant="tenant" @updated="onUpdated" />
      </el-tab-pane>
      <el-tab-pane label="品牌設定" name="brand">
        <TenantBrandTab v-if="activeTab === 'brand'" :tenant-id="tenant.id" />
      </el-tab-pane>
      <el-tab-pane label="LINE 憑證" name="line">
        <TenantLineTab v-if="activeTab === 'line'" :tenant-id="tenant.id" />
      </el-tab-pane>
      <el-tab-pane label="Email 設定" name="email">
        <TenantEmailTab v-if="activeTab === 'email'" :tenant-id="tenant.id" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  const id = tenantId.value
  if (!Number.isFinite(id) || id <= 0) {
    loadError.value = '網址中的分校編號無效'
    return
  }
  loading.value = true
  loadError.value = null
  try {
    const res = await getTenant(id)
    tenant.value = res.data ?? null
    if (tenant.value) {
      setActingTenant({
        id: tenant.value.id,
        slug: tenant.value.slug,
        name: tenant.value.display_name || tenant.value.name,
        public_origin: tenant.value.public_origin,
      })
    }
  } catch (err) {
    loadError.value = getErrorMessage(err, '分校資料載入失敗')
    tenant.value = null
  } finally {
    loading.value = false
  }
}

function onUpdated(next: TenantDetail): void {
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
  try {
    await (action === 'suspend' ? suspendTenant : resumeTenant)(tenant.value.id)
    ElMessage.success(`${label}完成`)
    await load()
  } catch (err) {
    ElMessage.error(getErrorMessage(err, `${label}失敗`))
  }
}

watch(tenantId, load, { immediate: true })

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
