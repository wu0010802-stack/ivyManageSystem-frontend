<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { listEvents, acknowledgeEvent } from '../api/events'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface EventItem {
  id: number
  title?: string
  event_type: string
  event_date?: string
  end_date?: string
  is_all_day?: boolean
  start_time?: string
  end_time?: string
  location?: string
  description?: string
  requires_acknowledgment?: boolean
  ack_deadline?: string
  acked_student_ids?: (number | string)[]
  need_ack_student_ids?: (number | string)[]
  [key: string]: unknown
}

interface AckTarget {
  event: EventItem
  student_id: number | string
  signature_name: string
}

const router = useRouter()

const childrenStore = useChildrenStore()
const items = ref<EventItem[]>([])
const loading = ref(false)
const ackTarget = ref<AckTarget | null>(null)

const ackModalOpen = computed({
  get: () => ackTarget.value !== null,
  set: (v: boolean) => {
    if (!v) ackTarget.value = null
  },
})

const TYPE_LABEL: Record<string, string> = {
  meeting: '會議',
  activity: '活動',
  holiday: '假日',
  general: '一般',
}

const studentNameMap = computed(() => {
  const m = new Map<number | string, string>()
  for (const c of (childrenStore.items || []) as { student_id: number; name?: string }[]) m.set(c.student_id, c.name || '')
  return m
})

const needsAckCount = computed(() =>
  items.value.filter((ev) => ev.requires_acknowledgment && ev.need_ack_student_ids?.length).length
)

async function fetchData() {
  loading.value = true
  try {
    const { data } = await listEvents()
    items.value = (data as { items?: EventItem[] })?.items || []
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

function openAck(event: EventItem) {
  if (!event.need_ack_student_ids?.length) return
  ackTarget.value = {
    event,
    student_id: event.need_ack_student_ids[0],
    signature_name: '',
  }
}

async function submitAck() {
  const t = ackTarget.value
  if (!t) return
  try {
    await acknowledgeEvent(t.event.id, {
      student_id: Number(t.student_id),
      signature_name: t.signature_name.trim() || null,
    })
    toast.success('已簽閱')
    ackTarget.value = null
    fetchData()
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '簽閱失敗'))
  }
}

onMounted(async () => {
  await childrenStore.load()
  fetchData()
})
</script>

<template>
  <div class="events-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">家長簽閱</p>
      <h1 class="pt-page-hero-title">事件公告</h1>
      <p class="pt-page-hero-note">
        <template v-if="needsAckCount > 0">{{ needsAckCount }} 筆待簽閱</template>
        <template v-else-if="items.length > 0">全數簽閱完成</template>
        <template v-else>目前沒有事件</template>
      </p>
    </header>

    <EmptyState
      v-if="!loading && items.length === 0"
      variant="mobile"
      title="尚無事件"
    />

    <div
      v-for="ev in items"
      :key="ev.id"
      class="event-card pt-card"
      :class="{ require: ev.requires_acknowledgment }"
    >
      <div class="event-row1">
        <span class="pt-pill pt-pill-info">{{ TYPE_LABEL[ev.event_type] || ev.event_type }}</span>
        <span class="event-title">{{ ev.title }}</span>
      </div>
      <div class="event-row2">
        {{ ev.event_date }}<span v-if="ev.end_date && ev.end_date !== ev.event_date"> ~ {{ ev.end_date }}</span>
        <span v-if="!ev.is_all_day && (ev.start_time || ev.end_time)">
          ・ {{ ev.start_time || '' }}-{{ ev.end_time || '' }}
        </span>
      </div>
      <div v-if="ev.location" class="event-loc">
        <ParentIcon name="location" size="xs" />
        {{ ev.location }}
      </div>
      <div v-if="ev.description" class="event-desc">{{ ev.description }}</div>

      <template v-if="ev.requires_acknowledgment">
        <div class="ack-info">
          <span v-if="ev.ack_deadline">截止：{{ ev.ack_deadline }}</span>
          <span v-if="ev.acked_student_ids?.length">
            已簽：{{ ev.acked_student_ids.map(id => studentNameMap.get(id) || id).join('、') }}
          </span>
        </div>
        <div v-if="ev.need_ack_student_ids?.length" class="ack-actions">
          <span class="pt-pill pt-pill-warn">{{ ev.need_ack_student_ids.length }} 位待簽</span>
          <button class="pt-action-btn" @click="openAck(ev)">
            快速簽閱
          </button>
          <button
            class="pt-ghost-btn"
            @click="router.push({ path: `/events/${ev.id}/ack`, query: { student_id: ev.need_ack_student_ids[0] } })"
          >
            <ParentIcon name="signature" size="sm" />
            手寫簽名
          </button>
        </div>
        <div v-else class="ack-done">
          <span class="pt-pill pt-pill-success">已全部簽閱</span>
        </div>
      </template>
    </div>

    <!-- 簽閱 modal -->
    <AppModal
      v-model:open="ackModalOpen"
      labelled-by="event-ack-title"
    >
      <template v-if="ackTarget">
        <div class="ack-header">
          <span id="event-ack-title" class="ack-title">簽閱事件</span>
          <button class="close" type="button" aria-label="關閉" @click="ackTarget = null">
            <ParentIcon name="close" size="sm" />
          </button>
        </div>
        <div class="form">
          <div class="event-summary">
            <div class="event-summary-title">{{ ackTarget.event.title }}</div>
            <div class="event-summary-date">{{ ackTarget.event.event_date }}</div>
          </div>
          <div class="field">
            <label for="event-ack-student">代表哪位小孩簽？</label>
            <select id="event-ack-student" v-model="ackTarget.student_id">
              <option
                v-for="sid in ackTarget.event.need_ack_student_ids"
                :key="sid"
                :value="sid"
              >{{ studentNameMap.get(sid) || `學生 #${sid}` }}</option>
            </select>
          </div>
          <div class="field">
            <label for="event-ack-signame">簽章姓名（選填）</label>
            <input
              id="event-ack-signame"
              type="text"
              v-model="ackTarget.signature_name"
              maxlength="50"
              autocomplete="name"
            />
          </div>
        </div>
        <div class="ack-footer">
          <button type="button" class="pt-ghost-btn" @click="ackTarget = null">取消</button>
          <button type="button" class="pt-action-btn" @click="submitAck">確認簽閱</button>
        </div>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.events-view { padding-bottom: 24px; }
.events-view > .pt-card + .pt-card { margin-top: 12px; }
.events-view > .pt-page-hero + .pt-card,
.events-view > .pt-page-hero + .empty-state + .pt-card { margin-top: 12px; }

.event-card.require {
  border-color: color-mix(in srgb, var(--pt-warning-text-mid) 36%, var(--pt-border-light, #ecf5f9));
  background: linear-gradient(135deg, var(--pt-tint-sun, var(--color-warning-soft)) 0%, var(--pt-surface-card, #fff) 100%);
}

.event-row1 {
  display: flex;
  gap: 8px;
  align-items: center;
}

.event-title {
  flex: 1;
  font-weight: 700;
  color: var(--pt-text-strong);
  font-size: 15px;
}

.event-row2 {
  margin-top: 6px;
  color: var(--pt-text-muted);
  font-size: 13px;
}

.event-loc {
  margin-top: 4px;
  color: var(--pt-text-faint);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.event-desc {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.5;
}

.ack-info {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--pt-text-placeholder);
  font-size: 12px;
}

.ack-actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ack-done { margin-top: 8px; }

/* modal 內部 */
.ack-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pt-border-light);
}

.ack-title {
  flex: 1;
  font-weight: 600;
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--pt-text-placeholder);
}

.form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-summary {
  background: var(--pt-surface-thread-bg);
  padding: 10px 12px;
  border-radius: var(--pt-control-radius, 12px);
}

.event-summary-title {
  font-weight: 600;
  font-size: 14px;
}

.event-summary-date {
  color: var(--pt-text-placeholder);
  font-size: 12px;
  margin-top: 2px;
}

.field label {
  display: block;
  font-size: 13px;
  color: var(--pt-text-muted);
  margin-bottom: 4px;
}

.field input,
.field select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--pt-border-strong);
  border-radius: var(--pt-control-radius, 12px);
  font-size: 14px;
}

.ack-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--pt-border-light);
}
</style>
