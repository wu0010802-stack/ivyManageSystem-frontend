<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getWeekAgenda } from '../api/calendar'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'

const router = useRouter()
const data = ref(null)
const loading = ref(false)
const days = ref(7)

// 注意：holiday 暫無沙灘 icon，先以 calendar 替代
const CATEGORY_META = {
  event: { icon: 'calendar', label: '活動', color: 'var(--pt-info-text)' },
  fee_due: { icon: 'money', label: '繳費截止', color: 'var(--color-danger)' },
  announcement: { icon: 'megaphone', label: '公告', color: 'var(--pt-warning-text)' },
  holiday: { icon: 'calendar', label: '假日', color: 'var(--brand-primary)' },
  contact_book: { icon: 'notebook', label: '聯絡簿', color: '#0e8e6f' },
  leave: { icon: 'clipboard', label: '請假', color: '#7c3aed' },
  medication: { icon: 'pill', label: '用藥', color: 'var(--pt-warning-text-mid)' },
}

const groupedByDate = computed(() => {
  if (!data.value?.items) return []
  const groups = new Map()
  for (const it of data.value.items) {
    if (!groups.has(it.date)) groups.set(it.date, [])
    groups.get(it.date).push(it)
  }
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, items]) => ({ date, items }))
})

async function fetchData() {
  loading.value = true
  try {
    const { data: d } = await getWeekAgenda(days.value)
    data.value = d
  } catch (err) {
    toast.error(err?.displayMessage || '載入行事曆失敗')
  } finally {
    loading.value = false
  }
}

function gotoItem(it) {
  // 後端同時送 kind / category（向後相容），新欄位優先
  const kind = it.kind || it.category
  const id = it.target_id ?? it.ref?.id
  if (kind === 'fee_due') router.push('/fees')
  else if (kind === 'event' || kind === 'holiday') router.push('/events')
  else if (kind === 'announcement') router.push('/announcements')
  else if (kind === 'contact_book' && id) router.push(`/contact-book/${id}`)
  else if (kind === 'leave') router.push('/leaves')
  else if (kind === 'medication' && id) router.push(`/medications/${id}`)
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  if (diff === 0) return `今日 (${iso} 週${wd})`
  if (diff === 1) return `明日 (${iso} 週${wd})`
  return `${iso} 週${wd}`
}

onMounted(fetchData)
</script>

<template>
  <div class="cal-view">
    <div class="header">
      <label for="cal-days" class="title">本週行程</label>
      <select id="cal-days" v-model.number="days" class="days-select" @change="fetchData">
        <option :value="3">3 天</option>
        <option :value="7">7 天</option>
        <option :value="14">14 天</option>
      </select>
    </div>

    <template v-if="loading && !data">
      <SkeletonBlock variant="card" :count="3" />
    </template>

    <div v-else-if="data && groupedByDate.length === 0" class="state">
      未來 {{ days }} 天沒有特別行程
    </div>

    <template v-else-if="data">
      <div v-for="g in groupedByDate" :key="g.date" class="day-block">
        <div class="day-head">{{ dayLabel(g.date) }}</div>
        <button
          v-for="(it, i) in g.items"
          :key="`${it.category}-${it.ref?.id}-${i}`"
          type="button"
          class="item"
          @click="gotoItem(it)"
        >
          <span
            class="dot"
            :style="{ background: CATEGORY_META[it.category]?.color || 'var(--pt-text-placeholder)' }"
          />
          <span
            class="icon"
            :style="{ color: CATEGORY_META[it.category]?.color || 'var(--pt-text-placeholder)' }"
          >
            <ParentIcon :name="CATEGORY_META[it.category]?.icon || 'info'" size="sm" />
          </span>
          <span class="content">
            <span class="t">{{ it.title }}</span>
            <span v-if="it.subtitle" class="s">{{ it.subtitle }}</span>
          </span>
          <span v-if="it.requires_acknowledgment" class="badge">需簽閱</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cal-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 16px;
  font-weight: 600;
  color: var(--pt-text-strong);
}
.days-select {
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid var(--pt-border-strong);
  border-radius: 6px;
}
.state {
  text-align: center;
  padding: 40px 16px;
  color: var(--pt-text-placeholder);
}
.day-block {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 8px 0 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.day-head {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--pt-text-placeholder);
  font-weight: 600;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--pt-surface-mute-warm);
  text-align: left;
  cursor: pointer;
}
.item:active {
  background: var(--pt-surface-mute-soft);
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.t {
  font-size: 14px;
  color: var(--pt-text-strong);
}
.s {
  font-size: 12px;
  color: var(--pt-text-placeholder);
  margin-top: 2px;
}
.badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-danger-soft);
  color: #991b1b;
  border-radius: 8px;
  flex-shrink: 0;
}
</style>
