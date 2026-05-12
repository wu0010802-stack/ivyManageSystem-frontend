<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getChildProfile } from '../api/profile'
import { fetchChildPhotos } from '../api/childPhotos'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MilestoneCarousel from '../components/MilestoneCarousel.vue'
import TimelineItem from '../components/TimelineItem.vue'
import { useChildTimeline } from '../composables/useChildTimeline'

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const data = ref(null)
const loading = ref(false)

const SEVERITY_LABEL = { mild: '輕度', moderate: '中度', severe: '嚴重' }
const SEVERITY_COLOR = {
  mild:     { bg: 'var(--pt-severity-mild-bg)',     color: 'var(--pt-severity-mild-fg)' },
  moderate: { bg: 'var(--pt-severity-mod-bg)',      color: 'var(--pt-severity-mod-fg)' },
  severe:   { bg: 'var(--pt-severity-severe-bg)',   color: 'var(--pt-severity-severe-fg)' },
}

async function fetchData() {
  if (!studentId.value) return
  loading.value = true
  try {
    const { data: d } = await getChildProfile(studentId.value)
    data.value = d
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

function goMessages() {
  // 把建議文字塞到 sessionStorage，MessagesView 進去後可預填（若未實作 prefill 也只是個無害值）
  try {
    sessionStorage.setItem(
      'parent_message_prefill',
      `想反應 ${data.value?.student?.name || '孩子'} 的資料修改，內容：`,
    )
  } catch {
    /* ignore */
  }
  router.push('/messages')
}

function goReports() {
  router.push(`/children/${studentId.value}/reports`)
}

function goPhotos() {
  router.push(`/children/${studentId.value}/photos`)
}

function goMeasurements() {
  router.push(`/children/${studentId.value}/measurements`)
}

const photos = ref([])
const photosLoading = ref(false)
async function loadPhotos() {
  if (!studentId.value) return
  photosLoading.value = true
  try {
    const r = await fetchChildPhotos(studentId.value, { limit: 4 })
    photos.value = r.data.items || []
  } catch {
    /* silent — photo strip is non-critical */
  } finally {
    photosLoading.value = false
  }
}

// 成長動態 timeline feed
const {
  items: timelineItems,
  loading: timelineLoading,
  nextCursor,
  loadMore,
  error: timelineError,
  reload: reloadTimeline,
} = useChildTimeline(studentId)

onMounted(() => {
  fetchData()
  loadPhotos()
})
</script>

<template>
  <div class="profile-view">
    <!-- 成長里程碑 carousel -->
    <section class="card growth-section">
      <h3 class="section-title">🏆 成長里程碑</h3>
      <MilestoneCarousel v-if="studentId" :student-id="studentId" />
    </section>

    <!-- 最新動態 timeline feed -->
    <section class="card growth-section">
      <h3 class="section-title">📖 最新動態</h3>
      <div v-if="timelineError && !timelineItems.length" class="empty timeline-error">
        <span>{{ timelineError }}</span>
        <button class="retry-btn" :disabled="timelineLoading" @click="() => reloadTimeline(false)">
          重試
        </button>
      </div>
      <div v-else-if="timelineLoading && !timelineItems.length" class="empty">載入中…</div>
      <div v-else-if="timelineItems.length === 0" class="empty">最近沒有動態</div>
      <div v-else class="feed">
        <TimelineItem v-for="item in timelineItems" :key="item.id" :item="item" />
        <button v-if="nextCursor" class="load-more-btn" :disabled="timelineLoading" @click="loadMore">
          {{ timelineLoading ? '載入中…' : '載入更多' }}
        </button>
      </div>
    </section>

    <template v-if="loading && !data">
      <SkeletonBlock variant="card" :count="2" />
    </template>

    <template v-else-if="data">
      <section class="card">
        <div class="head">
          <div class="name">{{ data.student.name }}</div>
          <div class="sub">
            學號 {{ data.student.student_no || '—' }}
            <span v-if="data.student.gender">・{{ data.student.gender }}</span>
            <span v-if="data.student.birthday">・{{ data.student.birthday }}</span>
          </div>
        </div>
        <div class="row">
          <span class="label">班級</span>
          <span>{{ data.classroom?.name || '未分班' }}</span>
        </div>
        <div v-if="data.teachers.length" class="row">
          <span class="label">老師</span>
          <span class="teachers">
            <span v-for="t in data.teachers" :key="t.role" class="teacher-tag">
              {{ t.label }}：{{ t.name || '—' }}
            </span>
          </span>
        </div>
      </section>

      <section class="card">
        <h3 class="section-title">監護人 / 接送人</h3>
        <div v-if="!data.guardians.length" class="empty">尚未登記</div>
        <div v-for="g in data.guardians" :key="g.id" class="guardian-row">
          <div>
            <span class="guardian-name">{{ g.name }}</span>
            <span v-if="g.relation" class="guardian-rel">（{{ g.relation }}）</span>
          </div>
          <div class="guardian-tags">
            <span v-if="g.is_self" class="tag self">您本人</span>
            <span v-if="g.is_primary" class="tag primary">主要聯絡人</span>
            <span v-if="g.can_pickup" class="tag pickup">可接送</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h3 class="section-title">過敏 / 用藥提醒</h3>
        <div v-if="!data.allergies.length" class="empty">尚未登記</div>
        <div
          v-for="a in data.allergies"
          :key="a.id"
          class="allergy-row"
        >
          <div class="allergy-head">
            <span class="allergen">{{ a.allergen }}</span>
            <span
              class="severity"
              :style="{
                background: SEVERITY_COLOR[a.severity]?.bg,
                color: SEVERITY_COLOR[a.severity]?.color,
              }"
            >{{ SEVERITY_LABEL[a.severity] || a.severity }}</span>
          </div>
          <div v-if="a.reaction_symptom" class="allergy-text">症狀：{{ a.reaction_symptom }}</div>
          <div v-if="a.first_aid_note" class="allergy-text">處置：{{ a.first_aid_note }}</div>
        </div>
      </section>

      <!-- 修改申請：走訊息給導師，不直接寫 DB -->
      <section class="card change-card">
        <h3 class="section-title">資料有誤？</h3>
        <p class="change-text">
          孩子個人資料、過敏資訊、接送人資訊如有錯誤或變更，請透過訊息聯絡導師處理；
          不會在此頁直接修改，以確保校方記錄一致。
        </p>
        <button class="primary-btn" type="button" @click="goMessages">
          <ParentIcon name="envelope" size="sm" />
          開啟訊息聯絡導師
        </button>
      </section>
    </template>

    <!-- 最新照片 -->
    <section class="card growth-section">
      <div class="section-header">
        <h3 class="section-title">📷 最新照片</h3>
        <button class="more-link" @click="goPhotos">查看全部 →</button>
      </div>
      <div v-if="photosLoading" class="placeholder small">載入中…</div>
      <div v-else-if="photos.length === 0" class="placeholder small">尚無照片</div>
      <div v-else class="photo-strip">
        <div
          v-for="p in photos.slice(0, 4)"
          :key="p.id"
          class="strip-thumb"
          @click="goPhotos"
        >
          <img :src="p.thumb_url || p.display_url || p.url" loading="lazy" />
        </div>
      </div>
    </section>

    <!-- 成長量測 -->
    <section class="card growth-section">
      <h3 class="section-title">📏 成長量測</h3>
      <button class="link-btn" @click="goMeasurements">查看身高/體重曲線 →</button>
    </section>

    <!-- 歷次報告 -->
    <section class="card growth-section">
      <h3 class="section-title">📄 歷次報告</h3>
      <button class="link-btn" @click="goReports">查看歷次成長報告 →</button>
    </section>
  </div>
</template>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: var(--pt-page-gap, 18px);
}
.card {
  background: var(--pt-surface-card, var(--neutral-0));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: var(--pt-card-radius, 14px);
  padding: 15px;
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
}
.head {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--pt-border-light);
  padding-bottom: 12px;
}
.name {
  font-size: 20px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--pt-text-placeholder);
}
.row {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--pt-text-strong);
}
.row .label {
  width: 56px;
  color: var(--pt-text-placeholder);
  flex-shrink: 0;
}
.teachers {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.teacher-tag {
  font-size: 13px;
  color: var(--pt-text-muted);
}
.section-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--pt-text-soft);
  margin: 0 0 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.empty {
  color: var(--pt-text-placeholder);
  font-size: 13px;
  padding: 6px 0;
}
.guardian-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid var(--pt-surface-mute-warm);
}
.guardian-row:first-of-type {
  border-top: none;
}
.guardian-name {
  font-weight: 600;
  color: var(--pt-text-strong);
}
.guardian-rel {
  color: var(--pt-text-placeholder);
  font-size: 13px;
}
.guardian-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.tag {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--pt-surface-mute);
  color: var(--pt-text-soft);
  font-weight: 700;
}
.tag.self {
  background: var(--color-info-soft);
  color: var(--pt-info-text);
}
.tag.primary {
  background: var(--color-success-soft);
  color: var(--pt-success-text);
}
.tag.pickup {
  background: var(--color-warning-soft);
  color: var(--pt-warning-text);
}
.allergy-row {
  padding: 8px 0;
  border-top: 1px solid var(--pt-surface-mute-warm);
}
.allergy-row:first-of-type {
  border-top: none;
}
.allergy-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.allergen {
  font-weight: 600;
  color: var(--pt-text-strong);
}
.severity {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}
.allergy-text {
  margin-top: 4px;
  font-size: 13px;
  color: var(--pt-text-muted);
}
.change-card {
  background: var(--pt-tint-sun, var(--color-warning-soft));
  border: 1px solid color-mix(in srgb, var(--pt-warning-text) 28%, transparent);
}
.change-text {
  font-size: 13px;
  color: var(--pt-warning-text-soft);
  margin: 0 0 10px;
  line-height: 1.5;
}
.primary-btn {
  width: 100%;
  min-height: 44px;
  padding: 10px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: var(--pt-control-radius, 12px);
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background var(--transition-fast, 0.15s ease);
}
.primary-btn:active {
  background: var(--brand-primary-hover);
}
.growth-section .section-title {
  font-size: 15px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  color: #0d9053;
  margin: 0 0 10px;
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.load-more-btn {
  align-self: center;
  margin-top: 4px;
  padding: 8px 16px;
  background: var(--pt-surface-mute, #f3f4f6);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--pt-text-muted);
}
.load-more-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.timeline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--pt-warning-text, #b85c00);
}
.retry-btn {
  padding: 4px 12px;
  background: var(--pt-surface-mute, #f3f4f6);
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--pt-text-muted);
}
.retry-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.link-btn {
  background: #f3f4f6;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 14px;
  color: #0d9053;
  font-weight: 600;
  cursor: pointer;
}
.link-btn:hover { background: #e5e7eb; }
.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.section-header .section-title {
  flex: 1;
  margin: 0;
}
.more-link {
  background: none;
  border: none;
  color: #0d9053;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.photo-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.strip-thumb {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
  cursor: pointer;
}
.strip-thumb > img { width: 100%; height: 100%; object-fit: cover; }
.placeholder.small { padding: 12px; font-size: 13px; }
</style>
