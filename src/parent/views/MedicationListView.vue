<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { useAbortableFetch } from '../composables/useAbortableFetch'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import { listMedicationOrders } from '../api/medications'
import { toast } from '../utils/toast'
import { todayISO } from '@/utils/format'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

interface MedLog {
  id: number | string
  scheduled_time?: string
  status: string
}

interface MedOrder {
  id: number | string
  medication_name?: string
  order_date?: string
  dose?: string
  time_slots?: string[]
  source?: string
  logs?: MedLog[]
}

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId: selectedStudentId, ensureSelected } = useChildSelection()

// 改用 useAbortableFetch：切換小孩時舊 request 自動 abort，
// 避免「列表閃前一個孩子的資料」競態（P1-19）。
const { data: medData, error: medError, pending: loading, refresh: refreshMed } =
  useAbortableFetch((config) =>
    listMedicationOrders({ student_id: selectedStudentId.value }, config),
  )
const items = computed(() => ((medData.value as { data?: { items?: MedOrder[] } })?.data?.items) || [])

const STATUS_LABEL: Record<string, string> = {
  pending: '待餵',
  administered: '已餵',
  skipped: '已跳過',
  correction: '已修正',
}
const STATUS_TONE: Record<string, string> = {
  pending: 'warn',
  administered: 'success',
  skipped: 'info',
  correction: 'violet',
}

const studentName = computed(() => {
  const c = ((childrenStore.items || []) as { student_id: number; name?: string }[]).find(
    (x) => x.student_id === selectedStudentId.value,
  )
  return c?.name || ''
})

async function fetchData() {
  if (!selectedStudentId.value) return
  try {
    await refreshMed()
  } catch {
    /* error 由 watch 統一彈 toast */
  }
}

watch(medError, (err) => {
  const e = err as Record<string, unknown> | null
  if (e) toast.error(String(e?.displayMessage || '載入用藥單失敗'))
})

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  fetchData()
})

watch(selectedStudentId, fetchData)

function goNew() {
  if (((childrenStore.items || []) as unknown[]).length === 0) {
    toast.warn('尚未綁定子女')
    return
  }
  router.push({
    path: '/medications/new',
    query: { student_id: selectedStudentId.value },
  })
}

function goDetail(orderId: number | string) {
  router.push({ path: `/medications/${orderId}` })
}

function statusLabel(s: string) { return STATUS_LABEL[s] || s }

const today = todayISO()
</script>

<template>
  <div class="med-list">
    <ChildContextHeader variant="page" />

    <div class="pt-eyebrow-row">
      <p class="pt-eyebrow">用藥紀錄</p>
      <button type="button" class="pt-action-btn new-btn" @click="goNew">
        <span class="material-symbols-rounded" aria-hidden="true">add</span>
        新增
      </button>
    </div>

    <template v-if="loading && items.length === 0">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="2" />
      </div>
    </template>

    <EmptyState
      v-else-if="items.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      :title="studentName ? `${studentName} 沒有用藥紀錄` : '沒有用藥紀錄'"
      description="如孩子需要在園所服用藥物，請點右上「新增」"
    />

    <div v-else class="cards pt-section-pad-x">
      <button
        v-for="o in items"
        :key="o.id"
        type="button"
        class="med-card"
        :class="{ today: o.order_date === today }"
        @click="goDetail(o.id)"
      >
        <div class="card-icon" aria-hidden="true">
          <span class="material-symbols-rounded">medication</span>
        </div>
        <div class="card-main">
          <div class="card-head">
            <strong class="med-name">{{ o.medication_name }}</strong>
            <span class="date">{{ o.order_date }}</span>
          </div>
          <div class="meta">
            <span>劑量 {{ o.dose }}</span>
            <span class="dot-sep">·</span>
            <span>{{ (o.time_slots || []).join('、') }}</span>
            <span v-if="o.source === 'parent'" class="pt-pill pt-pill-info source-tag">家長提交</span>
          </div>
          <div v-if="o.logs?.length" class="logs">
            <span
              v-for="lg in o.logs"
              :key="lg.id"
              class="pt-pill"
              :class="`pt-pill-${STATUS_TONE[lg.status] || 'info'}`"
            >
              {{ lg.scheduled_time }} · {{ statusLabel(lg.status) }}
            </span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.med-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 24px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }

.new-btn {
  margin-left: auto;
  padding: 7px 14px;
  font-size: 13px;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.med-card {
  display: flex;
  gap: 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 16px;
  padding: 14px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: background 160ms ease, transform 120ms ease;
}
.med-card:hover { background: var(--pt-surface-mute-soft, #fefcf3); }
.med-card:active { transform: scale(0.99); }
.med-card.today {
  background: linear-gradient(135deg, var(--cream, #fffcf2) 0%, var(--pt-surface-card, #ffffff) 70%);
  border-color: var(--sun-300, #ffe285);
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--grape-100, #ebe0f5);
  color: var(--grape-700, #6e3f94);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.card-icon .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}

.card-main { flex: 1; min-width: 0; }
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.med-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--pt-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.date {
  font-size: 12px;
  color: var(--pt-text-faint);
  font-weight: 500;
  flex-shrink: 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--pt-text-muted);
}
.dot-sep { color: var(--pt-text-faint); }
.source-tag { margin-left: 4px; }

.logs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .med-card { transition: none; }
}
</style>
