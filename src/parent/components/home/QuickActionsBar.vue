<script setup lang="ts">
/**
 * 首頁「常用功能」：聯絡簿滿版大按鈕 ＋ 三個模組按鈕。
 *
 * 2026-08-16 首頁改版，見該次對話 Artifact 預覽稿。三格內容原規劃家長可各自
 * 替換（存裝置本機），業主當次對話後段改裁定為「統一配置」：由園所後台設定
 * 全體家長看到同一組，不是家長自行編輯——因此本元件**沒有編輯態**，`slots`
 * 完全由外部（TodayView，最終資料源是 home-summary 的後台設定值）決定，
 * 元件本身只負責渲染與導覽。驗證／預設回退邏輯在 utils/quickActionModules。
 *
 * 聯絡簿大按鈕上疊一顆出席狀態小 pill（statusLabel/statusTone），延續
 * 「3 秒內看到孩子當日狀態」的既有產品決策——聯絡簿卡本身雖然被往下推到
 * 這個區塊之後，但狀態不必等捲到那張卡才看得到。
 */
import { useRouter } from 'vue-router'
import { DEFAULT_SLOTS, QUICK_ACTION_CATALOG } from '../../utils/quickActionModules'

type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

const props = withDefaults(defineProps<{
  contactBookHref: string
  contactBookSub: string
  statusLabel?: string
  statusTone?: StatusTone
  /** 園所後台設定的三格；未帶入或驗證失敗時已由呼叫端 resolveQuickActionSlots() 處理成預設值。 */
  slots?: string[]
}>(), {
  statusLabel: '',
  statusTone: 'neutral',
  slots: () => DEFAULT_SLOTS.slice(),
})

const router = useRouter()

function onModuleClick(key: string): void {
  const mod = QUICK_ACTION_CATALOG[key]
  if (mod) router.push(mod.route)
}
</script>

<template>
  <section class="qa">
    <h3 class="qa-title">常用功能</h3>

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

    <div class="qa-row" role="group" aria-label="常用功能">
      <button
        v-for="key in props.slots"
        :key="key"
        type="button"
        class="qa-mod"
        :class="`tone-${QUICK_ACTION_CATALOG[key].tone}`"
        :aria-label="QUICK_ACTION_CATALOG[key].label"
        @click="onModuleClick(key)"
      >
        <span class="qa-mod-icon">
          <span class="material-symbols-rounded" aria-hidden="true">{{ QUICK_ACTION_CATALOG[key].icon }}</span>
        </span>
        <span class="qa-mod-label">{{ QUICK_ACTION_CATALOG[key].label }}</span>
        <span class="qa-mod-sub">{{ QUICK_ACTION_CATALOG[key].sub }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.qa { padding: 4px var(--space-4, 16px) 0; display: flex; flex-direction: column; gap: 10px; }
.qa-title { margin: 0; font-size: 13.5px; font-weight: 800; color: var(--pt-text-muted); letter-spacing: 0.01em; }

.qa-cb-bar {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 15px 16px;
  border-radius: var(--pt-hero-radius, 30px);
  background: var(--brand-primary, #0d9053);
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
.qa-mod {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 13px 4px 11px;
  border-radius: var(--pt-card-radius, 26px);
  border: none;
  background: var(--m3-surface-container-low, #f3f4ef);
  box-shadow: var(--pt-shadow-card);
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.qa-mod:active { transform: scale(0.96); }
.qa-mod-icon {
  width: 36px; height: 36px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
}
.qa-mod-icon .material-symbols-rounded { font-size: 19px; }
.qa-mod-label { font-size: 12.5px; font-weight: 700; color: var(--pt-text-strong); }
.qa-mod-sub { font-size: 10px; font-weight: 600; color: var(--pt-text-faint); }

/* 色調沿用既有 StatTile 的 tonal 語意（tone-amber/coral/sky/leaf/brand 完全同義），
   teal/grape 是本次新增（分別對齊既有 --pt-tint-pickup 與 --pt-accent-grape-*）。 */
.tone-amber .qa-mod-icon { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-coral .qa-mod-icon { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-sky .qa-mod-icon { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.tone-leaf .qa-mod-icon { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.tone-grape .qa-mod-icon { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-brand .qa-mod-icon { background: var(--m3-primary-container); color: var(--m3-on-primary-container); }
.tone-teal .qa-mod-icon { background: var(--pt-tint-pickup); color: var(--pt-tint-pickup-fg); }

/* 出席狀態 pill 色調對齊既有 status tone vocabulary（見 ContactBookDayCard 用法） */
.qa-cb-pill.tone-ok { background: rgba(255, 255, 255, 0.28); }
.qa-cb-pill.tone-warn, .qa-cb-pill.tone-danger { background: rgba(255, 235, 205, 0.35); }

@media (prefers-reduced-motion: reduce) {
  .qa-cb-bar, .qa-mod { transition: none; }
}
</style>
