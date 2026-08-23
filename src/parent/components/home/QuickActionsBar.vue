<script setup lang="ts">
/**
 * 首頁「常用功能」：聯絡簿滿版大按鈕 ＋ 三個可替換模組按鈕。
 *
 * 2026-08-16 首頁改版（quickact01），見該次對話 Artifact 預覽稿。三格內容
 * 家長各自在自己手機上編輯、存 DB（不是 localStorage，也不是租戶層級統一
 * 配置——設計討論中間繞了一圈，見 useQuickActionSlots.ts 檔頭）。點右上角
 * 「編輯」進入編輯態後，點任一格開底部選單換成其他模組。
 *
 * 聯絡簿大按鈕上疊一顆出席狀態小 pill（statusLabel/statusTone），延續
 * 「3 秒內看到孩子當日狀態」的既有產品決策。
 *
 * 三格模組按鈕的載入態（2026-08-16 使用者實測回報）：composable 的 slots
 * 初值是 DEFAULT_SLOTS，掛載後才 fetch 家長實際存的設定，中間這段空窗如果
 * 直接渲染按鈕，家長重新整理後會先閃一次預設三格、API 回來才跳成自己存的
 * 設定，像是編輯沒生效。改在 loading 期間用共用 SkeletonBlock 佔位（比照
 * TodayView / NotificationPrefsView 既有 loading 慣例），不提前渲染任何
 * 一組模組內容。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ParentBottomSheet from '../ParentBottomSheet.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import { toast } from '../../utils/toast'
import { QUICK_ACTION_CATALOG, useQuickActionSlots } from '../../composables/useQuickActionSlots'
import { useChildSelection } from '../../composables/useChildSelection'

type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

withDefaults(defineProps<{
  contactBookHref: string
  contactBookSub: string
  statusLabel?: string
  statusTone?: StatusTone
}>(), {
  statusLabel: '',
  statusTone: 'neutral',
})

const router = useRouter()
const { slots, loading, isDefault, persisting, availableModules, swap, resetToDefault, load } =
  useQuickActionSlots()
onMounted(load)

// 孩子相關四個模組（child*）的 route 帶 `:studentId` 佔位符（見
// quickActionModules.ts 檔頭註解）；useChildSelection() 是模組層級單例
// ref，跟 TodayView 讀的是同一份「目前選定孩子」，不用另外傳 prop。
const { selectedId } = useChildSelection()

function resolveRoute(route: string): string {
  if (!route.includes(':studentId')) return route
  // 理論上 QuickActionsBar 只在 TodayView 已解出 selectedChild 後才會渲染，
  // 這裡仍防禦性 fallback 到孩子 hub，避免任何邊界情況下 push 出 `/children/null`。
  return selectedId.value ? route.replace(':studentId', String(selectedId.value)) : '/child'
}

const editing = ref(false)
const sheetOpen = ref(false)
const activeSlotIndex = ref<number | null>(null)

function toggleEditing(): void {
  editing.value = !editing.value
}

function onModuleClick(idx: number): void {
  if (editing.value) {
    activeSlotIndex.value = idx
    sheetOpen.value = true
    return
  }
  router.push(resolveRoute(QUICK_ACTION_CATALOG[slots.value[idx]].route))
}

/** 家長端慣例：axios 攔截器 normalize 出 displayMessage，優先顯示後端實際原因
 * （例：模組目錄 FE/BE drift 時的 422），沒有才退回通用文案（比照 NotificationPrefsView.vue）。*/
function errorMessage(err: unknown, fallback: string): string {
  const e = err as Record<string, unknown>
  return String(e?.displayMessage || fallback)
}

async function pickModule(key: string): Promise<void> {
  if (activeSlotIndex.value === null || persisting.value) return
  const idx = activeSlotIndex.value
  try {
    await swap(idx, key)
    sheetOpen.value = false
    activeSlotIndex.value = null
  } catch (err) {
    toast.error(errorMessage(err, '替換失敗，請稍後再試'))
  }
}

async function onReset(): Promise<void> {
  if (persisting.value) return
  try {
    await resetToDefault()
    toast.success('已恢復預設')
  } catch (err) {
    toast.error(errorMessage(err, '恢復預設失敗，請稍後再試'))
  }
}

const activeSlotLabel = computed(() =>
  activeSlotIndex.value === null ? '' : QUICK_ACTION_CATALOG[slots.value[activeSlotIndex.value]].label,
)
const sheetCandidates = computed(() => availableModules())
</script>

<template>
  <section class="qa">
    <div class="qa-head">
      <h3 class="qa-title">常用功能</h3>
      <button
        type="button"
        class="qa-edit"
        :class="{ 'is-active': editing }"
        :disabled="loading"
        @click="toggleEditing"
      >
        <span class="material-symbols-rounded" aria-hidden="true">{{ editing ? 'check' : 'edit_note' }}</span>
        {{ editing ? '完成' : '編輯' }}
      </button>
    </div>

    <router-link :to="contactBookHref" class="qa-cb-bar">
      <span class="qa-cb-icon">
        <span class="material-symbols-rounded" aria-hidden="true">auto_stories</span>
      </span>
      <span class="qa-cb-text">
        <span class="qa-cb-title">
          聯絡簿
          <span v-if="statusLabel" class="qa-cb-pill" :class="`tone-${statusTone}`">{{ statusLabel }}</span>
        </span>
        <span class="qa-cb-sub">{{ contactBookSub }}</span>
      </span>
      <span class="material-symbols-rounded qa-cb-chev" aria-hidden="true">chevron_right</span>
    </router-link>

    <div class="qa-row" :class="{ 'is-editing': editing }" role="group" aria-label="常用功能模組（可替換）">
      <SkeletonBlock v-if="loading" variant="line" :count="3" height="88px" />
      <template v-else>
        <button
          v-for="(key, idx) in slots"
          :key="key"
          type="button"
          class="qa-mod"
          :class="`tone-${QUICK_ACTION_CATALOG[key].tone}`"
          :aria-label="`${QUICK_ACTION_CATALOG[key].label}${editing ? '，點擊可替換' : ''}`"
          @click="onModuleClick(idx)"
        >
          <span v-if="editing" class="qa-mod-badge" aria-hidden="true">
            <span class="material-symbols-rounded">edit_note</span>
          </span>
          <span class="qa-mod-icon">
            <span class="material-symbols-rounded" aria-hidden="true">{{ QUICK_ACTION_CATALOG[key].icon }}</span>
          </span>
          <span class="qa-mod-label">{{ QUICK_ACTION_CATALOG[key].label }}</span>
          <span class="qa-mod-sub">{{ QUICK_ACTION_CATALOG[key].sub }}</span>
        </button>
      </template>
    </div>

    <p v-if="editing" class="qa-edit-hint">
      點任一按鈕即可替換成其他功能
      <button
        v-if="!isDefault"
        type="button"
        class="qa-reset"
        :disabled="persisting"
        @click="onReset"
      >
        <span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>
        恢復預設
      </button>
    </p>

    <ParentBottomSheet
      v-model="sheetOpen"
      :title="`替換「${activeSlotLabel}」`"
      :snap-points="['mid']"
      default-snap="mid"
    >
      <p class="qa-sheet-sub">選一個功能模組放到這一格</p>
      <ul class="qa-sheet-list">
        <li v-for="m in sheetCandidates" :key="m.key">
          <button type="button" class="qa-sheet-item" :disabled="persisting" @click="pickModule(m.key)">
            <span class="qa-sheet-icon" :class="`tone-${m.tone}`">
              <span class="material-symbols-rounded" aria-hidden="true">{{ m.icon }}</span>
            </span>
            <span class="qa-sheet-text">
              <span class="qa-sheet-label">{{ m.label }}</span>
              <span class="qa-sheet-desc">{{ m.sub }}</span>
            </span>
          </button>
        </li>
      </ul>
    </ParentBottomSheet>
  </section>
</template>

<style scoped>
.qa { padding: 4px var(--space-4, 16px) 0; display: flex; flex-direction: column; gap: 10px; }
.qa-head { display: flex; align-items: center; justify-content: space-between; }
.qa-title { margin: 0; font-size: 13.5px; font-weight: 800; color: var(--pt-text-muted); letter-spacing: 0.01em; }

.qa-edit {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; background: transparent;
  color: var(--m3-primary, #006d3d);
  font-size: 12.5px; font-weight: 700;
  padding: 5px 8px; margin: -5px -8px;
  border-radius: 10px;
  cursor: pointer;
}
.qa-edit .material-symbols-rounded { font-size: 16px; }
/* 小字綠底一律 --m3-primary（#006d3d，白字過 AA）；--brand-primary(#0d9053) 白字僅 4.1:1（aaContrast gate） */
.qa-edit.is-active { background: var(--m3-primary, #006d3d); color: var(--pt-on-accent, #fff); }

.qa-cb-bar {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 15px 16px;
  border-radius: var(--pt-hero-radius, 30px);
  background: var(--m3-primary, #006d3d);
  color: var(--pt-on-accent, #fff);
  text-decoration: none;
  box-shadow: var(--pt-shadow-float);
  transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.qa-cb-bar:active { transform: scale(0.98); }
.qa-cb-icon {
  width: 42px; height: 42px; flex-shrink: 0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.18);
  display: flex; align-items: center; justify-content: center;
}
.qa-cb-icon .material-symbols-rounded { font-size: 23px; }
.qa-cb-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.qa-cb-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 800; }
.qa-cb-pill {
  font-size: 10.5px; font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}
.qa-cb-sub { font-size: 12px; font-weight: 600; opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qa-cb-chev { font-size: 20px !important; opacity: 0.85; flex-shrink: 0; }

.qa-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

/* 三格模組載入態：SkeletonBlock 是多 root node 元件（line 變體的 N 個
   .sk-line + 一個 sr-only 狀態文字），class/attrs 不會 fallthrough 到任何
   單一子節點，所以直接選 .qa-row 底下的 .sk-line（它們就是 .qa-row 的直接
   子節點）。蓋掉預設的直排 margin-top 與方形圓角，改成跟 .qa-mod 一致的
   圓角，避免載入態跟真實內容的視覺形狀不一致；sr-only 狀態文字是
   position:absolute，不吃 grid 版位，不用另外處理。 */
.qa-row :deep(.sk-line) {
  margin-top: 0 !important;
  border-radius: var(--pt-card-radius, 26px) !important;
}
.qa-mod {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 13px 4px 11px;
  border-radius: var(--pt-card-radius, 26px);
  border: 1px solid transparent;
  background: var(--m3-surface-container-low, #f3f4ef);
  box-shadow: var(--pt-shadow-card);
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 140ms ease;
}
.qa-mod:active { transform: scale(0.96); }
.qa-mod-icon {
  width: 36px; height: 36px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.qa-mod-icon .material-symbols-rounded { font-size: 19px; }
.qa-mod-label { font-size: 12.5px; font-weight: 700; color: var(--pt-text-strong); }
.qa-mod-sub { font-size: 10px; font-weight: 600; color: var(--pt-text-faint); }

.qa-row.is-editing .qa-mod { border-color: color-mix(in srgb, var(--brand-primary, #0d9053) 45%, transparent); border-style: dashed; }
.qa-mod-badge {
  position: absolute; top: -6px; right: -6px;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--m3-primary, #006d3d); color: var(--pt-on-accent, #fff);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}
.qa-mod-badge .material-symbols-rounded { font-size: 11px; }

.qa-edit-hint {
  margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 11.5px; font-weight: 600; color: var(--pt-text-faint);
}
.qa-reset {
  display: inline-flex; align-items: center; gap: 3px;
  border: none; background: transparent; color: var(--m3-primary, #006d3d);
  font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 2px;
}
.qa-reset .material-symbols-rounded { font-size: 14px; }

/* 色調沿用既有 StatTile 的 tonal 語意（tone-amber/coral/sky/leaf/brand 完全同義），
   teal/grape 是本次新增（分別對齊既有 --pt-tint-pickup 與 --pt-accent-grape-*）。 */
.tone-amber .qa-mod-icon, .tone-amber .qa-sheet-icon { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-coral .qa-mod-icon, .tone-coral .qa-sheet-icon { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-sky .qa-mod-icon, .tone-sky .qa-sheet-icon { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.tone-leaf .qa-mod-icon, .tone-leaf .qa-sheet-icon { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.tone-grape .qa-mod-icon, .tone-grape .qa-sheet-icon { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-brand .qa-mod-icon, .tone-brand .qa-sheet-icon { background: var(--m3-primary-container); color: var(--m3-on-primary-container); }
.tone-teal .qa-mod-icon, .tone-teal .qa-sheet-icon { background: var(--pt-tint-pickup); color: var(--pt-tint-pickup-fg); }

.qa-sheet-sub { margin: 0 0 12px; font-size: 12.5px; color: var(--pt-text-faint); font-weight: 600; }
.qa-sheet-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.qa-sheet-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 10px 12px; border: none; border-radius: 16px;
  background: var(--m3-surface-container, #edeee9);
  cursor: pointer; text-align: left;
}
.qa-sheet-item:active { transform: scale(0.98); }
.qa-sheet-item:disabled { opacity: 0.6; cursor: default; }
.qa-sheet-icon { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.qa-sheet-icon .material-symbols-rounded { font-size: 19px; }
.qa-sheet-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.qa-sheet-label { font-size: 14px; font-weight: 700; color: var(--pt-text-strong); }
.qa-sheet-desc { font-size: 11px; font-weight: 600; color: var(--pt-text-faint); }

/* 出席狀態 pill 色調對齊既有 status tone vocabulary（見 ContactBookDayCard 用法） */
.qa-cb-pill.tone-ok { background: rgba(255, 255, 255, 0.28); }
.qa-cb-pill.tone-warn, .qa-cb-pill.tone-danger { background: rgba(255, 235, 205, 0.35); }

@media (prefers-reduced-motion: reduce) {
  .qa-cb-bar, .qa-mod, .qa-sheet-item { transition: none; }
}
</style>
