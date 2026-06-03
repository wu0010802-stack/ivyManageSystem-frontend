<script setup lang="ts">
/**
 * 家長首頁「我的孩子」selector cards。
 *
 * 點卡片本體 = 切換 selected child（emit select）。
 * 點右上 IconButton = 進 child profile（emit navigate）。
 */
import ParentIcon from '../ParentIcon.vue'
import CrownIcon from '@/components/brand/CrownIcon.vue'
import { LIFECYCLE_LABELS_PARENT as LIFECYCLE_LABELS } from '@/constants/lifecycle'

interface Child {
  guardian_id: number
  student_id: number
  name?: string
  classroom_name?: string
  guardian_relation?: string
  is_primary?: boolean
  can_pickup?: boolean
  lifecycle_status?: string
  birthday?: string
}

withDefaults(defineProps<{
  children?: Child[]
  selectedId?: number | null
}>(), {
  children: () => [],
  selectedId: null,
})

const emit = defineEmits<{
  'select': [studentId: number]
  'navigate': [path: string]
}>()

// lifecycle label（家長受眾用語）改用單一來源 @/constants/lifecycle
function lifecycleLabel(s: string | undefined): string {
  return (s ? LIFECYCLE_LABELS[s] : null) || s || ''
}

function isBirthdayToday(child: Child): boolean {
  if (!child.birthday) return false
  const parts = String(child.birthday).split('-')
  if (parts.length < 3) return false
  const [, m, day] = parts.map(Number)
  const d = new Date()
  return d.getMonth() + 1 === m && d.getDate() === day
}

function openProfile(e: Event, c: Child) {
  e.stopPropagation()
  emit('navigate', `/children/${c.student_id}`)
}
</script>

<template>
  <section class="children-section">
    <div class="pt-section-head">
      <h3 class="pt-section-title">我的孩子</h3>
      <span v-if="children.length" class="section-count">{{ children.length }} 位</span>
    </div>
    <div v-if="children.length === 0" class="empty">
      尚未綁定任何學生，請聯絡園所協助。
    </div>
    <div v-else class="children-track" aria-label="孩子清單">
      <button
        v-for="c in children"
        :key="c.guardian_id"
        type="button"
        class="child-card press-scale"
        :class="{ 'child-card--active': selectedId === c.student_id }"
        :aria-pressed="selectedId === c.student_id"
        @click="emit('select', c.student_id)"
      >
        <span class="child-avatar-wrap">
          <CrownIcon
            v-if="isBirthdayToday(c)"
            :size="18"
            decorative
            class="child-crown"
          />
          <span class="child-avatar">{{ String(c.name || '孩').slice(0, 1) }}</span>
        </span>
        <span class="child-copy">
          <span class="child-row">
            <span class="child-name">{{ c.name }}</span>
            <button
              type="button"
              class="child-profile-icon"
              data-action="open-profile"
              aria-label="查看孩子資料"
              @click="(e) => openProfile(e, c)"
            >
              <ParentIcon name="user" size="sm" />
            </button>
          </span>
          <span class="child-classroom">{{ c.classroom_name || '未分班' }}</span>
          <span class="child-meta">
            <span v-if="c.guardian_relation">{{ c.guardian_relation }}</span>
            <span v-if="c.is_primary" class="tag primary">主要聯絡人</span>
            <span v-if="c.can_pickup" class="tag pickup">可接送</span>
            <span class="tag status">{{ lifecycleLabel(c.lifecycle_status) }}</span>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.section-count {
  color: var(--pt-text-faint);
  font-size: 12px;
  font-weight: 700;
}

.children-section { display: flex; flex-direction: column; }
.empty {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 24px 16px;
  text-align: center;
  color: var(--pt-text-placeholder);
  font-size: var(--text-base, 14px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
}
.children-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(240px, 82%);
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 4px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.children-track::-webkit-scrollbar { display: none; }
.child-card {
  background: var(--pt-surface-card);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  width: 100%;
  text-align: left;
  display: flex;
  gap: 12px;
  scroll-snap-align: start;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.child-card:active {
  background: var(--pt-surface-mute-soft);
}
.child-card--active {
  border-color: var(--brand-primary);
  border-width: 2px;
  box-shadow: 0 0 0 3px var(--brand-primary-soft);
}

.child-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.child-name {
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-strong);
}
.child-profile-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 12px;
  color: var(--pt-text-soft);
  cursor: pointer;
  flex-shrink: 0;
}
.child-profile-icon:hover { background: var(--pt-surface-mute-soft); color: var(--brand-primary); }
.child-profile-icon:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}

.child-classroom { font-size: var(--text-sm, 13px); color: var(--pt-text-faint); }
.child-meta {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-soft);
  align-items: center;
}
.tag {
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: var(--pt-surface-mute);
  font-weight: var(--font-weight-medium, 500);
}
.tag.primary { background: var(--brand-primary-soft); color: var(--brand-primary); }
.tag.pickup { background: var(--color-warning-soft); color: var(--pt-warning-text-mid); }
.tag.status { background: var(--pt-surface-mute-warm); color: var(--pt-text-muted); }

.child-avatar-wrap { position: relative; display: inline-flex; flex-shrink: 0; }
.child-avatar {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)));
  color: var(--brand-primary);
  font-size: 18px;
  font-weight: 900;
}
.child-copy {
  min-width: 0;
  flex: 1;
}
.child-crown {
  position: absolute;
  left: 50%;
  top: -10px;
  transform: translateX(-50%);
  z-index: 2;
}
</style>
