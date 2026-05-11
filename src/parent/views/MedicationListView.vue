<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildSelector from '../components/ChildSelector.vue'
import { listMedicationOrders } from '../api/medications'
import { toast } from '../utils/toast'
import { todayISO } from '@/utils/format'
import SkeletonBlock from '../components/SkeletonBlock.vue'

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId: selectedStudentId, ensureSelected } = useChildSelection()
const items = ref([])
const loading = ref(false)

const STATUS_LABEL = {
  pending: '待餵',
  administered: '已餵',
  skipped: '已跳過',
  correction: '已修正',
}

const studentName = computed(() => {
  const c = (childrenStore.items || []).find(
    (x) => x.student_id === selectedStudentId.value,
  )
  return c?.name || ''
})

async function fetchData() {
  if (!selectedStudentId.value) return
  loading.value = true
  try {
    const { data } = await listMedicationOrders({
      student_id: selectedStudentId.value,
    })
    items.value = data?.items || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入用藥單失敗')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
})

watch(selectedStudentId, fetchData, { immediate: true })

function goNew() {
  if ((childrenStore.items || []).length === 0) {
    toast.warn('尚未綁定子女')
    return
  }
  router.push({
    path: '/medications/new',
    query: { student_id: selectedStudentId.value },
  })
}

function goDetail(orderId) {
  router.push({ path: `/medications/${orderId}` })
}

function statusLabel(s) {
  return STATUS_LABEL[s] || s
}

const today = todayISO()
</script>

<template>
  <div class="med-list">
    <ChildSelector />
    <div class="header-row">
      <button class="new-btn" @click="goNew">+ 新增</button>
    </div>

    <template v-if="loading">
      <SkeletonBlock variant="card" :count="3" />
    </template>
    <p v-else-if="items.length === 0" class="hint">{{ studentName }} 沒有用藥紀錄</p>

    <div v-else class="cards">
      <div
        v-for="o in items"
        :key="o.id"
        class="card"
        :class="{ today: o.order_date === today }"
        @click="goDetail(o.id)"
      >
        <div class="card-row">
          <strong>{{ o.medication_name }}</strong>
          <span class="date">{{ o.order_date }}</span>
        </div>
        <div class="meta">
          劑量 {{ o.dose }} · {{ (o.time_slots || []).join('、') }}
          <span v-if="o.source === 'parent'" class="tag self">家長提交</span>
        </div>
        <div class="logs">
          <span
            v-for="lg in o.logs"
            :key="lg.id"
            class="slot"
            :class="lg.status"
          >{{ lg.scheduled_time }} · {{ statusLabel(lg.status) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.med-list { padding: 0; }
.header-row { display: flex; gap: 12px; align-items: center; justify-content: flex-end; margin-bottom: 14px; }
.new-btn { min-height: 40px; padding: 8px 14px; background: var(--brand-primary); color: var(--neutral-0); border: none; border-radius: var(--pt-control-radius, 12px); font-size: 14px; font-weight: 800; transition: background var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease); }
.new-btn:active { background: var(--brand-primary-hover); }
.hint { color: var(--pt-text-placeholder); padding: 24px 0; text-align: center; }
.cards { display: flex; flex-direction: column; gap: 10px; }
.card { background: var(--pt-surface-card, var(--neutral-0)); border-radius: var(--pt-card-radius, 14px); padding: 14px; border: 1px solid var(--pt-page-border, var(--pt-border)); box-shadow: var(--pt-shadow-card, var(--pt-elev-1)); cursor: pointer; }
.card.today { border-color: color-mix(in srgb, var(--brand-primary) 34%, var(--pt-border)); background: linear-gradient(135deg, var(--pt-tint-brand, var(--brand-primary-soft)) 0%, var(--pt-surface-card, var(--neutral-0)) 100%); }
.card-row { display: flex; justify-content: space-between; align-items: baseline; }
.date { color: var(--pt-text-placeholder); font-size: 13px; }
.meta { font-size: 13px; color: var(--pt-text-muted); margin-top: 4px; }
.tag { display: inline-block; padding: 1px 6px; margin-left: 6px; border-radius: 3px; font-size: 11px; }
.tag.self { background: var(--pt-tint-money); color: var(--pt-tint-money-fg); }
.logs { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.slot { padding: 2px 8px; border-radius: 10px; font-size: 12px; background: var(--pt-surface-mute); color: var(--pt-text-muted); }
/* status pill：[data-status] 等效 class pattern */
.slot.pending      { background: var(--pt-tint-money);        color: var(--pt-tint-money-fg); }
.slot.administered { background: var(--pt-tint-calendar);     color: var(--pt-tint-calendar-fg); }
.slot.skipped      { background: var(--pt-tint-pickup);       color: var(--pt-tint-pickup-fg); text-decoration: line-through; }
.slot.correction   { background: var(--pt-tint-medication);   color: var(--pt-tint-medication-fg); }
</style>
