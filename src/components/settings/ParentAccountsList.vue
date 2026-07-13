<script setup lang="ts">
// 家長帳號清單（dumb 受控元件）：吃「已篩選」items，自管分頁，操作只有停用/啟用（emit 給父層）。
// 家長帳號由家長端 LIFF 綁定產生，不提供編輯/重設密碼/刪除。
import { ref, computed, watch } from 'vue'
import { formatDateTimeTW } from '@/utils/format'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

const props = defineProps<{
  items: Record<string, unknown>[]
  loading?: boolean
  emptyText?: string
}>()
const emit = defineEmits<{ 'toggle-active': [user: Record<string, unknown>] }>()

const PAGE_SIZE = 20
const currentPage = ref(1)

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return props.items.slice(start, start + PAGE_SIZE)
})

// 篩選使總頁數縮小時鉗回最後一頁，避免停在空頁
watch(
  () => props.items.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (currentPage.value > maxPage) currentPage.value = maxPage
  },
)

const { isMobile } = useIsMobile()

const cardColumns = [
  { label: '狀態', prop: '__status' },
  {
    label: '最後登入',
    prop: 'last_login',
    formatter: (item: Record<string, unknown>) => (item.last_login ? formatDateTimeTW(item.last_login) : '從未登入'),
  },
]

defineExpose({ currentPage, pagedItems })
</script>

<template>
  <div class="parent-accounts">
    <el-table v-if="!isMobile" :data="pagedItems" v-loading="!!loading" style="width: 100%;">
      <el-table-column prop="username" label="帳號" min-width="180" />
      <el-table-column label="狀態" width="90">
        <template #default="{ row } = {}">
          <el-tag :type="row?.is_active ? 'success' : 'info'" size="small">{{ row?.is_active ? '啟用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最後登入" min-width="170">
        <template #default="{ row } = {}">
          <span v-if="row?.last_login">{{ formatDateTimeTW(row.last_login) }}</span>
          <span v-else class="never-logged-in">從未登入</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row } = {}">
          <el-button
            v-if="row"
            link
            :type="row.is_active ? 'danger' : 'primary'"
            @click="emit('toggle-active', row)"
          >{{ row.is_active ? '停用' : '啟用' }}</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="parent-empty">{{ emptyText || '尚無家長帳號' }}</div>
      </template>
    </el-table>
    <AdminListCards
      v-else
      :items="pagedItems"
      :columns="cardColumns"
      row-key="username"
      :loading="loading"
      :empty-text="emptyText || '尚無家長帳號'"
    >
      <template #title="{ item }">{{ item.username }}</template>
      <template #cell-__status="{ item }">
        <el-tag :type="item.is_active ? 'success' : 'info'" size="small">{{ item.is_active ? '啟用' : '停用' }}</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button link :type="item.is_active ? 'danger' : 'primary'" @click="emit('toggle-active', item)">
          {{ item.is_active ? '停用' : '啟用' }}
        </el-button>
      </template>
    </AdminListCards>
    <el-pagination
      v-if="items.length > PAGE_SIZE"
      v-model:current-page="currentPage"
      :page-size="PAGE_SIZE"
      :total="items.length"
      layout="total, prev, pager, next"
      class="parent-pagination"
    />
  </div>
</template>

<style scoped>
.parent-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.never-logged-in {
  color: var(--text-tertiary);
}
.parent-empty {
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>
