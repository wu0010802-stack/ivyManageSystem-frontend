<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ChildSelector from '../components/ChildSelector.vue'
import { getTodayContactBook, listContactBook } from '../api/contactBook'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { useIncrementalRender } from '../composables/useIncrementalRender'

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId: selectedStudentId, ensureSelected } = useChildSelection()

const today = ref(null)
const history = ref([])
const loading = ref(false)

// 漸進渲染：歷史紀錄量大時不一次渲染整個 DOM
const { visible: visibleHistory, sentinelRef, hasMore } = useIncrementalRender(
  history,
  { pageSize: 20 },
)

const studentName = computed(() => {
  const c = (childrenStore.items || []).find(
    (x) => x.student_id === selectedStudentId.value,
  )
  return c?.name || ''
})

// 心情 emoji 屬於內容語意（教師選的小孩當日情緒），保留 emoji 並用
// <span role="img" aria-label="..."> 包裝，方便 screen reader 念出。
const MOOD_OPTIONS = {
  happy: { emoji: '😄', text: '開心' },
  normal: { emoji: '🙂', text: '普通' },
  tired: { emoji: '😴', text: '想睡' },
  sad: { emoji: '😢', text: '難過' },
  sick: { emoji: '🤒', text: '不舒服' },
}

async function fetchAll() {
  if (!selectedStudentId.value) return
  loading.value = true
  try {
    const [todayRes, historyRes] = await Promise.all([
      getTodayContactBook(selectedStudentId.value),
      listContactBook(selectedStudentId.value, { limit: 30 }),
    ])
    today.value = todayRes.data?.entry || null
    history.value = historyRes.data?.entries || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入聯絡簿失敗')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
})

watch(selectedStudentId, fetchAll, { immediate: true })

function goDetail(entryId) {
  router.push({ path: `/contact-book/${entryId}` })
}

function moodInfo(m) {
  return MOOD_OPTIONS[m] || null
}
</script>

<template>
  <div class="cb">
    <ChildSelector />

    <template v-if="loading">
      <SkeletonBlock variant="card" :count="3" />
    </template>

    <section v-else>
      <h3 class="section-title">今日聯絡簿</h3>
      <div v-if="today" class="card today-card" @click="goDetail(today.id)">
        <div class="row">
          <span
            v-if="moodInfo(today.mood)"
            class="emoji"
            role="img"
            :aria-label="`心情：${moodInfo(today.mood).text}`"
          >{{ moodInfo(today.mood).emoji }}</span>
          <div class="meta">
            <strong>{{ studentName }} {{ today.log_date }}</strong>
            <p v-if="today.teacher_note" class="preview">
              {{ today.teacher_note }}
            </p>
          </div>
          <span v-if="!today.my_acknowledged_at" class="dot dot-unread" />
        </div>
        <div class="chips">
          <span v-if="today.meal_lunch != null" class="chip">午餐 {{ today.meal_lunch }}/3</span>
          <span v-if="today.nap_minutes != null" class="chip">午睡 {{ today.nap_minutes }}min</span>
          <span v-if="today.temperature_c != null" class="chip">體溫 {{ today.temperature_c }}°C</span>
          <span v-if="(today.photos || []).length" class="chip chip-icon">
            <ParentIcon name="camera" size="xs" />
            {{ today.photos.length }}
          </span>
        </div>
      </div>
      <p v-else class="hint">{{ studentName }} 今日尚無聯絡簿。</p>

      <h3 class="section-title" style="margin-top:24px;">歷史聯絡簿</h3>
      <p v-if="history.length === 0" class="hint">沒有更多紀錄</p>
      <div
        v-for="e in visibleHistory"
        :key="e.id"
        class="card press-scale"
        @click="goDetail(e.id)"
      >
        <div class="row">
          <span
            v-if="moodInfo(e.mood)"
            class="emoji"
            role="img"
            :aria-label="`心情：${moodInfo(e.mood).text}`"
          >{{ moodInfo(e.mood).emoji }}</span>
          <div class="meta">
            <strong>{{ e.log_date }}</strong>
            <p v-if="e.teacher_note" class="preview">{{ e.teacher_note }}</p>
          </div>
          <span v-if="!e.my_acknowledged_at" class="dot dot-unread" />
        </div>
      </div>
      <div v-if="hasMore" ref="sentinelRef" class="render-sentinel" aria-hidden="true" />
    </section>
  </div>
</template>

<style scoped>
.cb { padding: 12px; }
.section-title { font-size: 15px; color: var(--pt-text-soft); margin: 0 0 8px; }
.hint { color: var(--pt-text-faint); text-align: center; padding: 16px 0; }
.render-sentinel { height: 1px; }
.card {
  background: var(--neutral-0);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: var(--pt-elev-1);
}
.today-card { border: 1px solid #cfe6ff; }
.row { display: flex; align-items: center; gap: 10px; }
.emoji { font-size: 24px; flex-shrink: 0; }
.meta { flex: 1; min-width: 0; }
.meta strong { display: block; font-size: 14px; }
.preview {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--pt-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dot-unread { background: #ff5252; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f0f4f8;
  color: var(--pt-text-muted);
}
.chip-icon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
