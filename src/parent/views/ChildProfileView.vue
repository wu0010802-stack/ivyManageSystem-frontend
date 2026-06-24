<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getChildProfile } from '../api/profile'
import { fetchChildPhotos } from '../api/childPhotos'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import SectionHeader from '../components/SectionHeader.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'
import LaurelWreath from '@/components/brand/LaurelWreath.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import CrownIcon from '@/components/brand/CrownIcon.vue'
import MilestoneCarousel from '../components/MilestoneCarousel.vue'
import TimelineItem from '../components/TimelineItem.vue'
import { useChildTimeline } from '../composables/useChildTimeline'

function isBirthdayToday(child: { birthday?: string | null } | null | undefined) {
  if (!child?.birthday) return false
  const parts = String(child.birthday).split('-')
  if (parts.length < 3) return false
  const [, m, day] = parts.map(Number)
  const d = new Date()
  return d.getMonth() + 1 === m && d.getDate() === day
}

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const data = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const loadError = ref(false)

const SEVERITY_LABEL: Record<string, string> = { mild: '輕度', moderate: '中度', severe: '嚴重' }

async function fetchData() {
  if (!studentId.value) return
  loading.value = true
  loadError.value = false
  try {
    const { data: d } = await getChildProfile(studentId.value)
    data.value = d
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
    if (!data.value) loadError.value = true
  } finally {
    loading.value = false
  }
}

function goMessages() {
  // 把建議文字塞到 sessionStorage，MessagesView 進去後可預填（若未實作 prefill 也只是個無害值）
  try {
    const student = data.value?.student as { name?: string } | null | undefined
    sessionStorage.setItem(
      'parent_message_prefill',
      `想反應 ${student?.name || '孩子'} 的資料修改，內容：`,
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

const photos = ref<{ id: number | string; thumb_url?: string; display_url?: string; url?: string }[]>([])
const photosLoading = ref(false)
const photosError = ref(false)
async function loadPhotos() {
  if (!studentId.value) return
  photosLoading.value = true
  photosError.value = false
  try {
    const r = await fetchChildPhotos(studentId.value, { limit: 4 })
    photos.value = r.data.items || []
  } catch {
    photosError.value = true
  } finally {
    photosLoading.value = false
  }
}

// Typed accessors so template doesn't operate on `unknown`
interface TimelineItemTyped { icon?: string; title?: string; occurred_at?: string; is_highlight?: boolean; summary?: string; id?: unknown; [key: string]: unknown }
interface StudentInfo { name?: string; student_no?: string; gender?: string; birthday?: string | null }
interface TeacherInfo { role: string; label: string; name?: string }
interface GuardianInfo { id: number | string; name?: string; relation?: string; is_self?: boolean; is_primary?: boolean; can_pickup?: boolean }
interface AllergyInfo { id: number | string; allergen?: string; severity: string; reaction_symptom?: string; first_aid_note?: string }
interface ClassroomInfo { name?: string }

const typedTimelineItems = computed(() => timelineItems.value as TimelineItemTyped[])
const profileStudent = computed(() => (data.value?.student as StudentInfo | undefined) || null)
const profileTeachers = computed(() => (data.value?.teachers as TeacherInfo[] | undefined) || [])
const profileGuardians = computed(() => (data.value?.guardians as GuardianInfo[] | undefined) || [])
const profileAllergies = computed(() => (data.value?.allergies as AllergyInfo[] | undefined) || [])
const profileClassroom = computed(() => (data.value?.classroom as ClassroomInfo | undefined) || null)

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
    <section class="pt-card growth-section" aria-labelledby="growth-milestones-title">
      <h2 id="growth-milestones-title" class="section-title">
        <ParentIcon name="trophy" size="sm" />
        成長里程碑
      </h2>
      <MilestoneCarousel v-if="studentId" :student-id="studentId" />
    </section>

    <!-- 最新動態 timeline feed -->
    <section class="pt-card growth-section" aria-labelledby="growth-timeline-title">
      <h2 id="growth-timeline-title" class="section-title">
        <ParentIcon name="notebook" size="sm" />
        最新動態
      </h2>
      <MobileErrorRetry
        v-if="timelineError && !timelineItems.length"
        :error="timelineError"
        @retry="() => reloadTimeline(false)"
      />
      <SkeletonBlock
        v-else-if="timelineLoading && !timelineItems.length"
        variant="row"
        :count="3"
      />
      <div v-else-if="timelineItems.length === 0" class="empty">最近沒有動態</div>
      <div v-else class="feed">
        <TimelineItem v-for="item in typedTimelineItems" :key="item.id as string" :item="item" />
        <button v-if="nextCursor" class="load-more-btn" :disabled="timelineLoading" @click="loadMore">
          {{ timelineLoading ? '載入中…' : '載入更多' }}
        </button>
      </div>
    </section>

    <template v-if="loading && !data">
      <SkeletonBlock variant="card" :count="2" />
    </template>

    <template v-else-if="loadError && !data">
      <MobileErrorRetry
        fallback-message="孩子資料載入失敗，請稍後再試"
        @retry="fetchData"
      />
    </template>

    <template v-else-if="data">
      <section class="child-hero">
        <LaurelWreath side="full" :opacity="0.15" :size="120" class="child-hero-laurel" />
        <KawaiiStar :size="32" decorative class="child-hero-star" />
        <div class="child-hero-inner">
          <div class="child-avatar-wrap">
            <CrownIcon
              v-if="isBirthdayToday(profileStudent)"
              :size="22"
              decorative
              class="child-crown"
            />
            <div class="child-avatar" aria-hidden="true">
              <template v-if="profileStudent?.name">{{ profileStudent.name.charAt(0) }}</template>
              <ParentIcon v-else name="user" size="lg" />
            </div>
          </div>
          <div class="child-info">
            <div class="child-name">{{ profileStudent?.name || '寶貝' }}</div>
            <div class="child-meta">{{ profileClassroom?.name || '' }}</div>
          </div>
        </div>
      </section>

      <section class="pt-card">
        <div class="sub-info">
          <span>學號 {{ profileStudent?.student_no || '—' }}</span>
          <span v-if="profileStudent?.gender">・{{ profileStudent.gender }}</span>
          <span v-if="profileStudent?.birthday">・{{ profileStudent.birthday }}</span>
        </div>
        <div v-if="profileTeachers.length" class="row">
          <span class="label">老師</span>
          <span class="teachers">
            <span v-for="t in profileTeachers" :key="t.role" class="teacher-tag">
              {{ t.label }}：{{ t.name || '—' }}
            </span>
          </span>
        </div>
      </section>

      <section class="pt-card" aria-labelledby="guardians-title">
        <h2 id="guardians-title" class="section-title">監護人 / 接送人</h2>
        <div v-if="!profileGuardians.length" class="empty">尚未登記</div>
        <div v-for="g in profileGuardians" :key="g.id" class="guardian-row">
          <div>
            <span class="guardian-name">{{ g.name }}</span>
            <span v-if="g.relation" class="guardian-rel">（{{ g.relation }}）</span>
          </div>
          <div class="guardian-tags">
            <span v-if="g.is_self" class="pt-pill pt-pill-info">您本人</span>
            <span v-if="g.is_primary" class="pt-pill pt-pill-success">主要聯絡人</span>
            <span v-if="g.can_pickup" class="pt-pill pt-pill-warn">可接送</span>
          </div>
        </div>
      </section>

      <section class="pt-card" aria-labelledby="allergies-title">
        <h2 id="allergies-title" class="section-title">過敏 / 用藥提醒</h2>
        <div v-if="!profileAllergies.length" class="empty">尚未登記</div>
        <div
          v-for="a in profileAllergies"
          :key="a.id"
          class="allergy-row"
        >
          <div class="allergy-head">
            <span class="allergen">{{ a.allergen }}</span>
            <span
              class="pt-pill"
              :class="{
                'pt-pill-success': a.severity === 'mild',
                'pt-pill-warn': a.severity === 'moderate',
                'pt-pill-danger': a.severity === 'severe',
              }"
            >{{ SEVERITY_LABEL[a.severity] || a.severity }}</span>
          </div>
          <div v-if="a.reaction_symptom" class="allergy-text">症狀：{{ a.reaction_symptom }}</div>
          <div v-if="a.first_aid_note" class="allergy-text">處置：{{ a.first_aid_note }}</div>
        </div>
      </section>

      <!-- 修改申請：走訊息給導師，不直接寫 DB -->
      <section class="pt-card change-card" aria-labelledby="change-card-title">
        <h2 id="change-card-title" class="section-title">資料有誤？</h2>
        <p class="change-text">
          孩子個人資料、過敏資訊、接送人資訊如有錯誤或變更，請透過訊息聯絡導師處理；
          不會在此頁直接修改，以確保校方記錄一致。
        </p>
        <button class="pt-action-btn change-btn" type="button" @click="goMessages">
          <ParentIcon name="envelope" size="sm" />
          開啟訊息聯絡導師
        </button>
      </section>
    </template>

    <!-- 最新照片 -->
    <section class="pt-card growth-section" aria-labelledby="photos-title">
      <SectionHeader title="最新照片">
        <template #action>
          <button class="more-link" type="button" @click="goPhotos">
            查看全部
            <ParentIcon name="chevron-right" size="xs" />
          </button>
        </template>
      </SectionHeader>
      <SkeletonBlock v-if="photosLoading" variant="row" :count="1" />
      <MobileErrorRetry
        v-else-if="photosError"
        fallback-message="照片載入失敗，請稍後再試"
        @retry="loadPhotos"
      />
      <div v-else-if="photos.length === 0" class="placeholder small">尚無照片</div>
      <div v-else class="photo-strip-wrap">
        <ul class="photo-strip" role="list">
          <li v-for="p in photos.slice(0, 4)" :key="p.id">
            <button
              type="button"
              class="strip-thumb"
              aria-label="查看相簿"
              @click="goPhotos"
            >
              <img
                :src="p.thumb_url || p.display_url || p.url"
                alt=""
                width="80"
                height="80"
                loading="lazy"
              />
            </button>
          </li>
        </ul>
      </div>
    </section>

    <!-- 成長量測 -->
    <section class="pt-card growth-section" aria-labelledby="measurements-title">
      <h2 id="measurements-title" class="section-title">
        <ParentIcon name="ruler" size="sm" />
        成長量測
      </h2>
      <button class="pt-ghost-btn link-btn" type="button" @click="goMeasurements">
        查看身高/體重曲線
        <ParentIcon name="chevron-right" size="xs" />
      </button>
    </section>

    <!-- 歷次報告 -->
    <section class="pt-card growth-section" aria-labelledby="reports-title">
      <h2 id="reports-title" class="section-title">
        <ParentIcon name="document" size="sm" />
        歷次報告
      </h2>
      <button class="pt-ghost-btn link-btn" type="button" @click="goReports">
        查看歷次成長報告
        <ParentIcon name="chevron-right" size="xs" />
      </button>
    </section>
  </div>
</template>

<style scoped>
.profile-view {
  display: flex;
  flex-direction: column;
  gap: var(--pt-page-gap, 18px);
}

/* ── child hero ──────────────────────────────── */
.child-hero {
  position: relative;
  margin: 0 var(--space-3, 12px);
  padding: var(--space-5, 22px) var(--space-4, 16px);
  background: var(--pt-gradient-hero);
  border: 1px solid var(--pt-tint-brand, rgba(90, 168, 66, 0.15));
  border-radius: 18px;
  box-shadow: var(--pt-elev-1);
  overflow: hidden;
  isolation: isolate;
}
.child-hero-laurel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
}
.child-hero-star {
  position: absolute;
  right: var(--space-3, 12px);
  top: var(--space-3, 12px);
  z-index: 0;
}
.child-hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}
.child-avatar-wrap {
  position: relative;
}
.child-crown {
  position: absolute;
  left: 50%;
  top: -12px;
  transform: translateX(-50%);
  z-index: 2;
}
.child-avatar {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, var(--ivy-green-deep, #0d9053), var(--ivy-green-bright, #0caf76));
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 22px;
  box-shadow: var(--pt-elev-1);
}
.child-name {
  font-size: 18px;
  font-weight: 900;
  color: var(--m3-on-surface, var(--pt-text-strong));
}
.child-meta {
  font-size: 12px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin-top: 2px;
}

/* ── info card：吃 .pt-card 不再自家 background/border/radius ───── */
.sub-info {
  font-size: 13px;
  color: var(--pt-text-placeholder);
  margin-bottom: 10px;
}
.row {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--m3-on-surface, var(--pt-text-strong));
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
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}
.section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 800;
  color: var(--pt-text-strong);
  margin: 0 0 10px;
  letter-spacing: 0.02em;
}
.section-title :deep(.parent-icon) {
  color: var(--brand-primary);
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
  color: var(--m3-on-surface, var(--pt-text-strong));
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
  color: var(--m3-on-surface, var(--pt-text-strong));
}
.allergy-text {
  margin-top: 4px;
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}
.pt-card.change-card {
  background: var(--pt-tint-sun, var(--color-warning-soft));
  border-color: color-mix(in srgb, var(--pt-warning-text) 28%, transparent);
}
.change-text {
  font-size: 13px;
  color: var(--pt-warning-text-soft);
  margin: 0 0 10px;
  line-height: 1.5;
}
.change-btn { width: 100%; }
.growth-section .section-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--pt-text-strong);
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
  background: var(--pt-surface-mute);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}
.load-more-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.link-btn {
  background: var(--pt-surface-mute);
  padding: 10px 16px;
  font-size: 14px;
}
.link-btn:hover { background: var(--leaf-100, #dcf4e6); }
.more-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 44px;
  padding: 8px 12px;
  margin: -8px -12px -8px 0; /* 視覺對齊區塊邊緣，同時保留 44pt 觸控區 */
  background: transparent;
  border: none;
  color: var(--pt-text-strong);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  transition: background var(--transition-fast, 0.15s ease);
}
.more-link :deep(.parent-icon) { color: var(--brand-primary); }
.more-link:active {
  background: var(--pt-surface-mute);
}
/* 漸隱遮罩：暗示右側還有可滑動內容 */
.photo-strip-wrap {
  position: relative;
}
.photo-strip-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 4px;
  width: 16px;
  background: linear-gradient(
    to right,
    transparent,
    var(--pt-surface-card, var(--neutral-0))
  );
  pointer-events: none;
}
.photo-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 0 4px;
  margin: 0;
  list-style: none;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.photo-strip > li { flex-shrink: 0; scroll-snap-align: start; }
.strip-thumb {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pt-surface-mute);
  cursor: pointer;
  padding: 0;
  border: none;
  display: block;
  transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}
.strip-thumb:active {
  transform: scale(0.96);
  box-shadow: var(--pt-elev-1);
}
.strip-thumb > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder.small { padding: 12px; font-size: 13px; }
</style>
