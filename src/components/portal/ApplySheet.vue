<script setup lang="ts">
/**
 * 申請集中入口（Phase 1 殼層改版）。
 *
 * 底部導覽中央「＋」FAB 開啟本 sheet，收攏原側欄「假勤申請」群組的四個入口；
 * Phase 1 只做導頁，不在 sheet 內做表單（表單 sheet 化屬後續 phase）。
 */
import { useRouter } from 'vue-router'
import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  /** 側欄「請假申請」badge 同源：待處理代理人確認數 */
  substitutePendingCount?: number
}>(), {
  modelValue: false,
  substitutePendingCount: 0,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const router = useRouter()

interface ApplyItem {
  kind: 'leave' | 'overtime' | 'punch' | 'anomaly'
  label: string
  desc: string
  path: string
}

const ITEMS: ApplyItem[] = [
  { kind: 'leave', label: '請假申請', desc: '特休・病假・事假・家庭照顧假', path: '/portal/leave' },
  { kind: 'overtime', label: '加班申請', desc: '平日延長・假日活動支援', path: '/portal/overtime' },
  { kind: 'punch', label: '補打卡申請', desc: '忘刷卡・缺卡補登', path: '/portal/punch-correction' },
  { kind: 'anomaly', label: '異常確認', desc: '出勤異常紀錄確認', path: '/portal/anomalies' },
]

function go(item: ApplyItem) {
  emit('update:modelValue', false)
  router.push(item.path)
}
</script>

<template>
  <TeacherBottomSheet
    :model-value="props.modelValue"
    title="我要申請"
    :snap-points="['mid', 'full']"
    default-snap="mid"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="apply-sheet">
      <button
        v-for="item in ITEMS"
        :key="item.kind"
        type="button"
        class="apply-sheet__row"
        @click="go(item)"
      >
        <span class="apply-sheet__icon" :class="`apply-sheet__icon--${item.kind}`">
          <svg v-if="item.kind === 'leave'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="16" rx="2" />
            <path d="M3.5 9.5h17" />
            <path d="M8 2.5V6M16 2.5V6" />
          </svg>
          <svg v-else-if="item.kind === 'overtime'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          <svg v-else-if="item.kind === 'punch'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
            <path d="M9 4.5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8v.7" />
            <path d="M9 12.5l2.2 2.2 4.3-4.4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3.5 22 20H2Z" />
            <path d="M12 10v4.5" />
            <path d="M12 17.5h.01" />
          </svg>
        </span>
        <span class="apply-sheet__text">
          <span class="apply-sheet__label">{{ item.label }}</span>
          <span class="apply-sheet__desc">{{ item.desc }}</span>
        </span>
        <span
          v-if="item.kind === 'leave' && props.substitutePendingCount > 0"
          class="apply-sheet__badge"
        >{{ props.substitutePendingCount }}</span>
        <svg class="apply-sheet__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.5 6.5 15 12l-5.5 5.5" />
        </svg>
      </button>
    </div>
  </TeacherBottomSheet>
</template>

<style scoped>
.apply-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
}

.apply-sheet__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-3);
  background: var(--pt-surface-card);
  border: 1px solid var(--pt-border);
  border-radius: var(--radius-lg);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.apply-sheet__row:active {
  transform: scale(0.97);
}

.apply-sheet__row:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.apply-sheet__icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.apply-sheet__icon svg {
  width: 20px;
  height: 20px;
}

.apply-sheet__icon--leave { background: var(--pt-tint-leave); color: var(--pt-tint-leave-fg); }
.apply-sheet__icon--overtime { background: var(--pt-tint-event); color: var(--pt-tint-event-fg); }
.apply-sheet__icon--punch { background: var(--pt-tint-message); color: var(--pt-tint-message-fg); }
.apply-sheet__icon--anomaly { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }

.apply-sheet__text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.apply-sheet__label {
  font-size: 15px;
  font-weight: 600;
  color: var(--pt-text-strong);
}

.apply-sheet__desc {
  font-size: var(--text-xs);
  color: var(--pt-text-faint);
}

.apply-sheet__badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-danger);
  color: #ffffff;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.apply-sheet__chev {
  width: 16px;
  height: 16px;
  color: var(--pt-text-faint);
  flex-shrink: 0;
}
</style>
