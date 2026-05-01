<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getWeekAgenda } from '../api/calendar'
import { toast } from '../utils/toast'

const router = useRouter()
const data = ref(null)
const loading = ref(false)
const days = ref(7)

const CATEGORY_META = {
  event: { icon: '📅', label: '活動', color: '#1d4ed8' },
  fee_due: { icon: '💴', label: '繳費截止', color: '#c0392b' },
  announcement: { icon: '📢', label: '公告', color: '#92400e' },
  holiday: { icon: '🏖', label: '假日', color: '#3f7d48' },
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
  if (it.category === 'fee_due') router.push('/fees')
  else if (it.category === 'event') router.push('/events')
  else if (it.category === 'announcement') router.push('/announcements')
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
      <span class="title">本週行程</span>
      <select v-model.number="days" class="days-select" @change="fetchData">
        <option :value="3">3 天</option>
        <option :value="7">7 天</option>
        <option :value="14">14 天</option>
      </select>
    </div>

    <div v-if="loading && !data" class="state">載入中…</div>

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
            :style="{ background: CATEGORY_META[it.category]?.color || '#888' }"
          />
          <span class="icon">{{ CATEGORY_META[it.category]?.icon || '•' }}</span>
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
  color: #2c3e50;
}
.days-select {
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
}
.state {
  text-align: center;
  padding: 40px 16px;
  color: #888;
}
.day-block {
  background: #fff;
  border-radius: 12px;
  padding: 8px 0 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.day-head {
  padding: 8px 14px;
  font-size: 12px;
  color: #888;
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
  border-top: 1px solid #f3f4f6;
  text-align: left;
  cursor: pointer;
}
.item:active {
  background: #f6f8fa;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.icon {
  font-size: 16px;
  flex-shrink: 0;
}
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.t {
  font-size: 14px;
  color: #2c3e50;
}
.s {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}
.badge {
  font-size: 11px;
  padding: 2px 6px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  flex-shrink: 0;
}
</style>
