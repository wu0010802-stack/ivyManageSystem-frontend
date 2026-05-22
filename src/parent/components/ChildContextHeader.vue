<script setup lang="ts">
/**
 * 家長端「正在看誰」一致性 header。
 *
 * 單孩家庭：純顯示，不可 tap。
 * 多寶家庭：tap 開 BottomSheet 切換孩子。
 *
 * state 全部從 useChildSelection + useChildrenStore 自取，
 * 不從 props 傳 child id，確保 7 view 一致性。
 */
import { computed, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ParentBottomSheet from './ParentBottomSheet.vue'

interface Child {
  student_id: number
  name?: string
  classroom_name?: string
}

withDefaults(defineProps<{
  variant?: 'page' | 'hero'
}>(), {
  variant: 'page',
})

const childrenStore = useChildrenStore()
const { selectedId, setSelected } = useChildSelection()

const items = computed<Child[]>(() => (childrenStore.items as Child[]) || [])
const isMulti = computed(() => items.value.length > 1)
const current = computed<Child | null>(() =>
  items.value.find((c) => c.student_id === selectedId.value) || items.value[0] || null,
)

const initial = computed(() => String(current.value?.name || '孩').slice(0, 1))
const sheetOpen = ref(false)

function pick(id: number) {
  setSelected(id)
  sheetOpen.value = false
}
</script>

<template>
  <button
    v-if="isMulti && current"
    type="button"
    class="child-context-header"
    :class="`child-context-header--${variant}`"
    aria-haspopup="dialog"
    aria-label="切換孩子"
    @click="sheetOpen = true"
  >
    <span class="cch-avatar">{{ initial }}</span>
    <span class="cch-copy">
      <span class="cch-name">{{ current.name }}</span>
      <span v-if="current.classroom_name" class="cch-sub">{{ current.classroom_name }}</span>
    </span>
    <span class="cch-chevron material-symbols-rounded" aria-hidden="true">expand_more</span>
  </button>

  <div
    v-else-if="!isMulti && current"
    class="child-context-header"
    :class="`child-context-header--${variant}`"
  >
    <span class="cch-avatar">{{ initial }}</span>
    <span class="cch-copy">
      <span class="cch-name">{{ current.name }}</span>
      <span v-if="current.classroom_name" class="cch-sub">{{ current.classroom_name }}</span>
    </span>
  </div>

  <ParentBottomSheet
    v-model="sheetOpen"
    title="切換孩子"
    :snap-points="['mid']"
    default-snap="mid"
  >
    <ul class="cch-list" role="listbox" aria-label="孩子清單">
      <li
        v-for="c in items"
        :key="c.student_id"
        :data-child-option="c.student_id"
        :data-active="c.student_id === selectedId ? 'true' : 'false'"
        role="option"
        :aria-selected="c.student_id === selectedId"
        tabindex="0"
        class="cch-item"
        :class="{ 'cch-item--active': c.student_id === selectedId }"
        @click="pick(c.student_id)"
        @keydown.enter="pick(c.student_id)"
        @keydown.space.prevent="pick(c.student_id)"
      >
        <span class="cch-item-avatar">{{ String(c.name || '孩').slice(0, 1) }}</span>
        <span class="cch-item-copy">
          <span class="cch-item-name">{{ c.name }}</span>
          <span v-if="c.classroom_name" class="cch-item-sub">{{ c.classroom_name }}</span>
        </span>
        <span
          v-if="c.student_id === selectedId"
          class="cch-item-check material-symbols-rounded"
          aria-hidden="true"
        >check</span>
      </li>
    </ul>
  </ParentBottomSheet>
</template>

<style scoped>
.child-context-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
  text-align: left;
  cursor: default;
}
button.child-context-header { cursor: pointer; }
button.child-context-header:active { background: var(--pt-surface-mute-soft); }

.cch-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)));
  color: var(--brand-primary);
  font-weight: 900;
  flex-shrink: 0;
}
.child-context-header--page .cch-avatar {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  font-size: 18px;
}
.child-context-header--hero .cch-avatar {
  width: 62px;
  height: 62px;
  border-radius: 20px;
  font-size: 22px;
}

.cch-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.cch-name {
  font-weight: 700;
  color: var(--pt-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.child-context-header--page .cch-name {
  font-size: var(--text-lg, 16px);
}
.child-context-header--hero .cch-name {
  font-size: 24px;
  letter-spacing: -0.01em;
}
.cch-sub {
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  margin-top: 2px;
}

.cch-chevron {
  font-size: 22px;
  color: var(--pt-text-soft);
  flex-shrink: 0;
}

/* BottomSheet 內清單 */
.cch-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cch-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  min-height: var(--touch-target-min, 44px);
}
.cch-item:hover { background: var(--pt-surface-mute-soft); }
.cch-item--active { background: var(--brand-primary-soft); }
.cch-item:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}
.cch-item-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--pt-surface-mute);
  color: var(--brand-primary);
  font-weight: 800;
  flex-shrink: 0;
}
.cch-item--active .cch-item-avatar {
  background: var(--m3-secondary-container, var(--pt-tint-brand));
}
.cch-item-copy { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.cch-item-name { font-weight: 700; color: var(--pt-text-strong); }
.cch-item-sub { font-size: 12px; color: var(--pt-text-muted); }
.cch-item-check {
  color: var(--brand-primary);
  font-size: 22px;
}
</style>
