<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue'

const props = defineProps({
  entries: { type: Array, default: () => [] },
  selectedDate: { type: String, default: null },
  days: { type: Number, default: 21 },
})
const emit = defineEmits(['select'])

const today = new Date()
today.setHours(0, 0, 0, 0)

const dateList = computed(() => {
  const out = []
  for (let i = props.days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    out.push({
      iso,
      day: d.getDate(),
      weekday: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
      isToday: d.getTime() === today.getTime(),
      hasEntry: false,
    })
  }
  return out
})

const entriesByDate = computed(() => {
  const m = new Map()
  for (const e of props.entries || []) {
    if (e?.log_date) m.set(e.log_date, e)
  }
  return m
})

const list = computed(() =>
  dateList.value.map((d) => ({
    ...d,
    hasEntry: entriesByDate.value.has(d.iso),
    unread:
      entriesByDate.value.has(d.iso) &&
      !entriesByDate.value.get(d.iso)?.my_acknowledged_at,
  })),
)

const stripRef = ref(null)
const todayChipRef = ref(null)

onMounted(async () => {
  await nextTick()
  scrollToToday()
})

watch(() => props.entries?.length, async () => {
  await nextTick()
  if (!props.selectedDate) scrollToToday()
})

function scrollToToday() {
  const el = todayChipRef.value
  const strip = stripRef.value
  if (!el || !strip) return
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  strip.scrollTo({
    left: el.offsetLeft - strip.clientWidth + el.offsetWidth + 16,
    behavior: reduce ? 'auto' : 'smooth',
  })
}

function onPick(d) {
  if (!d.hasEntry && !d.isToday) return
  emit('select', d.iso)
}
</script>

<template>
  <div ref="stripRef" class="strip" role="tablist" aria-label="月曆">
    <button
      v-for="d in list"
      :key="d.iso"
      :ref="el => { if (d.isToday) todayChipRef = el }"
      type="button"
      class="chip"
      :class="{
        'is-today': d.isToday,
        'is-selected': selectedDate === d.iso,
        'has-entry': d.hasEntry,
        'is-empty': !d.hasEntry && !d.isToday,
        'is-unread': d.unread,
      }"
      :aria-current="d.isToday ? 'date' : undefined"
      :aria-label="`${d.day} 日 星期${d.weekday}${d.hasEntry ? '（有紀錄）' : ''}`"
      @click="onPick(d)"
    >
      <span class="weekday">{{ d.weekday }}</span>
      <span class="day">{{ d.day }}</span>
      <span class="dot" :class="{ visible: d.hasEntry }" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 16px 12px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.strip::-webkit-scrollbar { display: none; }

.chip {
  flex: 0 0 auto;
  width: 44px;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--pt-text-faint);
  padding: 4px 0;
  scroll-snap-align: end;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 120ms ease;
}
.chip:disabled { cursor: not-allowed; }

.weekday {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.day {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  color: var(--pt-text-muted);
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: transparent;
  margin-top: 2px;
}
.dot.visible { background: var(--brand-primary, #0d9053); }

.chip.has-entry {
  background: var(--cream, #fffcf2);
  border-color: var(--pt-border-light);
}
.chip.has-entry .day { color: var(--pt-text-strong); }

.chip.is-unread .dot { background: var(--coral-500, #ff8b8b); }

.chip.is-today {
  background: var(--brand-primary, #0d9053);
  border-color: var(--brand-primary, #0d9053);
}
.chip.is-today .weekday,
.chip.is-today .day { color: #fff; }
.chip.is-today .dot { background: var(--sun-300, #ffe285); }

.chip.is-selected:not(.is-today) {
  background: var(--brand-primary-soft, #f5fbe6);
  border-color: var(--brand-primary, #0d9053);
}

.chip:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}

.chip.is-empty {
  opacity: 0.55;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .chip { transition: none; }
}
</style>
