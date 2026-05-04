<script setup>
/**
 * 家長首頁「我的孩子」清單區塊。
 *
 * 接受 children 陣列，渲染每位子女卡片（姓名 / 班級 / 關係 / 標籤）。
 * 為純呈現元件，路由由父層透過 `@navigate="go"` 接住。
 *
 * lifecycle 標籤對應表內嵌於本元件，避免父層仍須提供 helper。
 */
import ParentIcon from '../ParentIcon.vue'

defineProps({
  children: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['navigate'])

const LIFECYCLE_LABELS = {
  active: '在學',
  enrolled: '在學',
  on_leave: '休學中',
  withdrawn: '已退學',
  transferred: '已轉出',
  graduated: '已畢業',
  prospect: '招生中',
}

function lifecycleLabel(s) {
  return LIFECYCLE_LABELS[s] || s || ''
}
</script>

<template>
  <section class="children-section">
    <h3 class="section-title">我的小孩（{{ children.length }}）</h3>
    <div v-if="children.length === 0" class="empty">
      尚未綁定任何學生，請聯絡園所協助。
    </div>
    <button
      v-for="c in children"
      :key="c.guardian_id"
      type="button"
      class="child-card press-scale"
      @click="emit('navigate', `/children/${c.student_id}`)"
    >
      <div class="child-row">
        <span class="child-name">{{ c.name }}</span>
        <span class="child-classroom">{{ c.classroom_name || '未分班' }}</span>
      </div>
      <div class="child-meta">
        <span v-if="c.guardian_relation">{{ c.guardian_relation }}</span>
        <span v-if="c.is_primary" class="tag primary">主要聯絡人</span>
        <span v-if="c.can_pickup" class="tag pickup">可接送</span>
        <span class="tag status">{{ lifecycleLabel(c.lifecycle_status) }}</span>
        <ParentIcon name="chevron-right" size="sm" class="child-arrow" />
      </div>
    </button>
  </section>
</template>

<style scoped>
.section-title {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-muted);
  margin: 0 0 8px 4px;
  letter-spacing: 0.02em;
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
.child-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  width: 100%;
  text-align: left;
  display: block;
  cursor: pointer;
}
.child-card:active {
  background: var(--pt-surface-mute-soft);
}
.child-arrow {
  margin-left: auto;
  color: var(--pt-text-disabled);
  background: transparent;
  padding: 0;
  flex-shrink: 0;
}
.child-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.child-name {
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-strong);
}
.child-classroom { font-size: var(--text-sm, 13px); color: var(--pt-text-faint); }
.child-meta {
  margin-top: 8px;
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
</style>
