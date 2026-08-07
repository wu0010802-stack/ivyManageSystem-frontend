<template>
  <div class="platform-audit">
    <PageHeader title="跨分校稽核" subtitle="預設為單一分校檢視；全租戶模式會留下高風險稽核痕跡">
      <template #filters>
        <el-select
          v-model="tenantChoice"
          filterable
          data-testid="audit-tenant"
          class="filter-item filter-item--wide"
          @change="onTenantChange"
        >
          <el-option
            v-for="t in selectableSchools"
            :key="t.id"
            :label="`${t.display_name || t.name}（${t.slug}）`"
            :value="String(t.id)"
          />
          <el-option label="⚠ 全部租戶（會產生高風險告警）" value="all" />
        </el-select>
        <el-input v-model="filters.action" placeholder="動作（如 UPDATE）" clearable class="filter-item" data-testid="audit-action" />
        <el-input v-model="filters.entity_type" placeholder="對象類型" clearable class="filter-item" data-testid="audit-entity" />
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          unlink-panels
          range-separator="→"
          start-placeholder="起"
          end-placeholder="迄"
          value-format="YYYY-MM-DD"
          class="filter-item"
          data-testid="audit-range"
        />
        <el-button type="primary" :loading="loading" data-testid="audit-search" @click="search()">查詢</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="crossTenant"
      type="warning"
      :closable="false"
      data-testid="audit-cross-warning"
      title="目前為全租戶模式：每次查詢都會寫入一則高風險稽核告警（這是刻意設計）。"
      class="platform-audit__alert"
    />
    <el-alert
      v-if="errorText"
      type="error"
      :closable="false"
      data-testid="audit-error"
      :title="errorText"
      class="platform-audit__alert"
    />

    <el-table :data="rows" v-loading="loading" data-testid="audit-table" row-key="id">
      <el-table-column label="時間" width="180">
        <template #default="{ row }">{{ row.created_at || '—' }}</template>
      </el-table-column>
      <el-table-column label="分校" width="140">
        <template #default="{ row }">{{ row.tenant_slug || row.tenant_id || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作者" width="140">
        <template #default="{ row }">{{ row.username || row.user_id || '—' }}</template>
      </el-table-column>
      <el-table-column label="動作" width="120">
        <template #default="{ row }">{{ row.action || '—' }}</template>
      </el-table-column>
      <el-table-column label="對象" min-width="180">
        <template #default="{ row }">
          <span>{{ row.entity_type || '—' }}</span>
          <span v-if="row.entity_id" class="muted"> #{{ row.entity_id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="摘要" min-width="240">
        <template #default="{ row }">{{ row.summary || '—' }}</template>
      </el-table-column>
      <el-table-column label="來源 IP" width="140">
        <template #default="{ row }">{{ row.ip_address || '—' }}</template>
      </el-table-column>
      <template #empty>
        <EmptyState title="沒有稽核紀錄" description="調整條件或時間區間後再查詢。" />
      </template>
    </el-table>

    <el-pagination
      v-if="total > 0"
      class="platform-audit__pagination"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      data-testid="audit-pagination"
      @current-change="onPageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { getErrorMessage } from '@/utils/errorHandler'
import { getPlatformAudit, type PlatformAuditRow } from '@/api/platform'
import { usePlatformTenants } from './usePlatformTenants'

const { selectableSchools } = usePlatformTenants({ schoolsOnly: true })

/** 後端 `tenant_id` 為**必填**字串參數：`<id>` 走 pin、`'all'` 走 bypass（CT-P-07）。 */
const tenantChoice = ref<string>('')
const filters = ref({ action: '', entity_type: '' })
const dateRange = ref<[string, string] | null>(null)
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const rows = ref<PlatformAuditRow[]>([])
const loading = ref(false)
const errorText = ref<string | null>(null)
/** 「全租戶」模式每次查詢都要重新確認，避免一次同意後整個 session 無痛掃全平台。 */
const crossTenant = computed(() => tenantChoice.value === 'all')

// 預設選第一間分校：`tenant_id` 必填，沒有預設值會讓使用者一進頁面就撞 422。
watch(
  selectableSchools,
  (list) => {
    if (!tenantChoice.value && list.length) {
      tenantChoice.value = String(list[0].id)
      search()
    }
  },
  { immediate: true },
)

async function onTenantChange(value: string): Promise<void> {
  if (value === 'all') {
    try {
      await ElMessageBox.confirm(
        '全租戶查詢會以跨租戶 bypass 讀取，並**刻意**產生一則高風險稽核告警（總部掃描全平台本就該留下痕跡）。確定切換嗎？',
        '切換為全租戶模式',
        { type: 'warning', confirmButtonText: '我了解，繼續', cancelButtonText: '取消' },
      )
    } catch {
      // 取消時退回第一間分校，不留在需要確認的模式上
      tenantChoice.value = selectableSchools.value.length ? String(selectableSchools.value[0].id) : ''
      return
    }
  }
  page.value = 1
  await search()
}

async function search(): Promise<void> {
  if (!tenantChoice.value) return
  loading.value = true
  errorText.value = null
  try {
    const res = await getPlatformAudit({
      tenant_id: tenantChoice.value,
      ...(filters.value.action.trim() ? { action: filters.value.action.trim() } : {}),
      ...(filters.value.entity_type.trim() ? { entity_type: filters.value.entity_type.trim() } : {}),
      ...(dateRange.value?.[0] ? { start: dateRange.value[0] } : {}),
      ...(dateRange.value?.[1] ? { end: dateRange.value[1] } : {}),
      page: page.value,
      page_size: pageSize.value,
    })
    rows.value = res.data?.items ?? []
    total.value = res.data?.total ?? 0
  } catch (err) {
    errorText.value = getErrorMessage(err, '稽核查詢失敗')
    rows.value = []
    total.value = 0
    ElMessage.error(errorText.value)
  } finally {
    loading.value = false
  }
}

function onPageChange(next: number): void {
  page.value = next
  search()
}
</script>

<style scoped>
.platform-audit__alert {
  margin: var(--space-3) 0;
}

.filter-item {
  min-width: 150px;
}

.filter-item--wide {
  min-width: 260px;
}

.platform-audit__pagination {
  margin-top: var(--space-4);
  display: flex;
  justify-content: flex-end;
}

.muted {
  color: var(--text-tertiary);
}
</style>
