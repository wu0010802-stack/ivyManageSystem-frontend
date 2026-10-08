<script setup lang="ts">
/**
 * 首頁孩子狀態卡（2026-10-08 改版，方向 A＋C）。
 *
 * 每位孩子一張、多寶家庭直接並列，不必先切換才看得到另一個孩子今天的狀態
 * （取代原本 HomeHeroHeader 照片＋姓名、ChildContextHeader 切換器、底部
 * ChildrenStrip 三處各管一部分的做法）。卡片內容：
 *  - 頭：近照（無照片退回姓名首字）、姓名、班級、在籍狀態、生日皇冠 → 點擊進孩子檔案
 *  - 大字狀態＋「到校 → 接送 → 離園」進度（utils/childTodayStatus.ts，只用既有資料）
 *  - 今日用藥提示、今日聯絡簿入口（三態文案由 TodayView 依當日紀錄決定）
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CrownIcon from '@/components/brand/CrownIcon.vue'
import { LIFECYCLE_LABELS_PARENT } from '@/constants/lifecycle'
import { fetchChildPhotos } from '../../api/childPhotos'
import { childTodayStatus, type TodayChildLike } from '../../utils/childTodayStatus'

type TodayChild = TodayChildLike & {
  medication?: { has_order?: boolean; order_count?: number } | null
}

const props = defineProps<{
  studentId: number
  name: string
  classroomName?: string | null
  birthday?: string | null
  lifecycleStatus?: string | null
  today: TodayChild | null
  contactBookHref: string
  contactBookSub: string
  contactBookUnread?: boolean
}>()

/**
 * open：點卡片頭 → 父層設為選定孩子並進孩子檔案。
 * select：點聯絡簿／用藥 → 先把這位孩子設為選定，目標頁（聯絡簿、用藥）依
 * 「目前選定的孩子」顯示，才不會點小樹的卡卻看到小禾的聯絡簿。
 */
const emit = defineEmits<{ open: [studentId: number]; select: [studentId: number] }>()

const router = useRouter()

const status = computed(() => childTodayStatus(props.today))

/** 頭像字取名字最後一字：兄弟姊妹同姓，取首字（姓）會每張卡都一樣 */
const initial = computed(() => String(props.name || '孩').slice(-1))

/** 在學是常態，不顯示；休學／轉出等才標出來 */
const lifecycleLabel = computed(() => {
  const s = props.lifecycleStatus
  if (!s || s === 'enrolled' || s === 'active') return ''
  return LIFECYCLE_LABELS_PARENT[s] || ''
})

const isBirthday = computed(() => {
  const parts = String(props.birthday || '').split('-')
  if (parts.length < 3) return false
  const [, m, d] = parts.map(Number)
  const now = new Date()
  return now.getMonth() + 1 === m && now.getDate() === d
})

const medicationCount = computed(() => {
  const med = props.today?.medication
  return med?.has_order ? med.order_count || 1 : 0
})

/**
 * 近照：只用 /parent/photos 真實回傳的第一張，抓不到（無照片／API 失敗）
 * 一律退回姓名首字，不捏造照片。切換 studentId 時以 seq 丟棄舊回應。
 */
const photoUrl = ref('')
let photoSeq = 0
watch(
  () => props.studentId,
  async (sid) => {
    const mySeq = ++photoSeq
    photoUrl.value = ''
    try {
      const res = await fetchChildPhotos(sid, { limit: 1 })
      if (mySeq !== photoSeq) return
      const first = ((res.data?.items || []) as { thumb_url?: string; url?: string }[])[0] // TODO(ts-strict): waiting on backend response_model
      photoUrl.value = first?.thumb_url || first?.url || ''
    } catch {
      if (mySeq === photoSeq) photoUrl.value = ''
    }
  },
  { immediate: true },
)

function goMedications(): void {
  emit('select', props.studentId)
  router.push('/medications')
}
</script>

<template>
  <article class="ctc" :data-child-card="studentId" :aria-label="`${name}今天的狀態`">
    <button
      type="button"
      class="ctc-head"
      :aria-label="`查看${name}的孩子檔案`"
      @click="emit('open', studentId)"
    >
      <span class="ctc-avatar">
        <img v-if="photoUrl" :src="photoUrl" alt="" class="ctc-avatar-img" />
        <span v-else class="ctc-avatar-initial">{{ initial }}</span>
        <CrownIcon v-if="isBirthday" :size="18" decorative class="ctc-crown" />
      </span>
      <span class="ctc-who">
        <span class="ctc-name">{{ name }}</span>
        <span class="ctc-class">
          {{ classroomName || '未分班' }}
          <span v-if="isBirthday" class="ctc-tag">今天生日</span>
          <span v-if="lifecycleLabel" class="ctc-tag">{{ lifecycleLabel }}</span>
        </span>
      </span>
      <span class="material-symbols-rounded ctc-chev" aria-hidden="true">chevron_right</span>
    </button>

    <div class="ctc-status" :class="`tone-${status.tone}`" data-child-status>
      <span class="material-symbols-rounded ctc-status-icon" aria-hidden="true">{{ status.icon }}</span>
      <span class="ctc-status-copy">
        <span class="ctc-status-label">{{ status.label }}</span>
        <span class="ctc-status-detail">{{ status.detail }}</span>
      </span>
    </div>

    <ol v-if="status.steps" class="ctc-steps" aria-label="今日進度">
      <li
        v-for="s in status.steps"
        :key="s.key"
        class="ctc-step"
        :class="`is-${s.state}`"
        :data-step="s.key"
        :data-state="s.state"
      >
        <span class="ctc-dot" aria-hidden="true">
          <span v-if="s.state === 'done'" class="material-symbols-rounded">check</span>
        </span>
        <span class="ctc-step-label">{{ s.label }}</span>
        <span class="ctc-step-caption">{{ s.caption }}</span>
      </li>
    </ol>

    <button
      v-if="medicationCount > 0"
      type="button"
      class="ctc-med"
      data-child-medication
      @click="goMedications"
    >
      <span class="material-symbols-rounded" aria-hidden="true">medication</span>
      今日用藥委託 {{ medicationCount }} 次
    </button>

    <router-link
      :to="contactBookHref"
      class="ctc-cb"
      data-child-contact-book
      @click="emit('select', studentId)"
    >
      <span class="material-symbols-rounded ctc-cb-icon" aria-hidden="true">auto_stories</span>
      <span class="ctc-cb-copy">
        <span class="ctc-cb-title">
          今日聯絡簿
          <span v-if="contactBookUnread" class="ctc-new">未讀</span>
        </span>
        <span class="ctc-cb-sub">{{ contactBookSub }}</span>
      </span>
      <span class="material-symbols-rounded ctc-chev" aria-hidden="true">chevron_right</span>
    </router-link>
  </article>
</template>

<style scoped>
/* 元件內別名：同一個主色在本元件多處使用，集中一處引用（token 遷移時只改這裡） */
.ctc {
  --ctc-accent: var(--m3-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  border-radius: var(--pt-card-radius);
  background: var(--pt-surface-card);
  box-shadow: var(--pt-shadow-card);
}

.ctc-head {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.ctc-avatar {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
}
.ctc-avatar-img,
.ctc-avatar-initial {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  object-fit: cover;
  font-size: 18px;
  font-weight: 900;
  background: var(--pt-accent-leaf-container);
  color: var(--pt-accent-leaf-on);
}
.ctc-crown { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); }
.ctc-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ctc-name { font-size: 18px; font-weight: 900; line-height: 1.2; }
.ctc-class { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; opacity: 0.78; }
.ctc-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--pt-accent-sun-container);
  color: var(--pt-accent-sun-on);
}
.ctc-chev { font-size: 22px; opacity: 0.6; flex-shrink: 0; }

/* 大字狀態：色調只是輔助，文字本身就說明狀態（不以純色作唯一指示） */
.ctc-status {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) 14px;
  border-radius: 18px;
}
.ctc-status.tone-ok { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.ctc-status.tone-info { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.ctc-status.tone-neutral { background: var(--m3-surface-container); }
.ctc-status-icon {
  font-size: 28px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.ctc-status-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ctc-status-label { font-size: 20px; font-weight: 900; line-height: 1.2; }
.ctc-status-detail { font-size: 13px; font-weight: 600; }

/* 三步驟進度：連接線畫在 li 之間 */
.ctc-steps {
  list-style: none;
  margin: 0;
  padding: 0 4px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.ctc-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.ctc-step + .ctc-step::before {
  content: '';
  position: absolute;
  top: 11px;
  right: calc(50% + 14px);
  width: calc(100% - 28px);
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0.2;
}
.ctc-dot {
  width: 24px;
  height: 24px;
  box-sizing: border-box;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed currentColor;
  opacity: 0.45;
}
.ctc-dot .material-symbols-rounded { font-size: 16px; }
.ctc-step.is-done .ctc-dot,
.ctc-step.is-current .ctc-dot { opacity: 1; border-style: solid; color: var(--ctc-accent); }
.ctc-step.is-done .ctc-dot { background: var(--ctc-accent); }
.ctc-step.is-done .ctc-dot .material-symbols-rounded { color: var(--pt-on-accent); }
.ctc-step.is-current .ctc-dot { border-width: 3px; }
.ctc-step-label { font-size: 13px; font-weight: 800; }
.ctc-step-caption { font-size: 12px; font-weight: 600; opacity: 0.72; font-variant-numeric: tabular-nums; }

.ctc-med {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  background: var(--pt-accent-grape-container);
  color: var(--pt-accent-grape-on);
  cursor: pointer;
}
.ctc-med .material-symbols-rounded { font-size: 18px; }

.ctc-cb {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  min-height: var(--touch-target-min, 44px);
  padding-top: var(--space-3, 12px);
  border-top: 1px solid var(--m3-outline-variant);
  color: inherit;
  text-decoration: none;
}
.ctc-cb-icon { font-size: 22px; color: var(--ctc-accent); }
.ctc-cb-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ctc-cb-title { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 800; }
.ctc-cb-sub { font-size: 13px; font-weight: 600; opacity: 0.72; }
.ctc-new {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--ctc-accent);
  color: var(--pt-on-accent);
}
</style>
