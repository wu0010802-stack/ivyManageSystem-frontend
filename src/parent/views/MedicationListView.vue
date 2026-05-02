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
.med-list { padding: 16px; }
.header-row { display: flex; gap: 12px; align-items: center; justify-content: flex-end; margin-bottom: 12px; }
.new-btn { padding: 8px 14px; background: var(--pt-info-link); color: var(--neutral-0); border: none; border-radius: 6px; font-size: 14px; }
.hint { color: var(--pt-text-placeholder); padding: 24px 0; text-align: center; }
.cards { display: flex; flex-direction: column; gap: 10px; }
.card { background: var(--neutral-0); border-radius: 8px; padding: 12px; border: 1px solid var(--pt-border-light); cursor: pointer; }
.card.today { border-color: var(--pt-info-link); box-shadow: 0 1px 4px rgba(44,123,229,.1); }
.card-row { display: flex; justify-content: space-between; align-items: baseline; }
.date { color: var(--pt-text-placeholder); font-size: 13px; }
.meta { font-size: 13px; color: var(--pt-text-muted); margin-top: 4px; }
.tag { display: inline-block; padding: 1px 6px; margin-left: 6px; border-radius: 3px; font-size: 11px; }
.tag.self { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }
.logs { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.slot { padding: 2px 8px; border-radius: 10px; font-size: 12px; background: var(--pt-surface-mute); color: var(--pt-text-muted); }
.slot.pending { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }
.slot.administered { background: var(--brand-primary-soft); color: var(--pt-success-text); }
.slot.skipped { background: var(--pt-surface-mute); color: var(--pt-text-placeholder); text-decoration: line-through; }
.slot.correction { background: #ede4ff; color: #5a3da5; }
</style>
