<script setup>
import ParentIcon from '../ParentIcon.vue'

const props = defineProps({
  entries: { type: Array, required: true },
  badges: { type: Object, default: () => ({}) },
})

function badgeOf(key) {
  const v = props.badges?.[key]
  return typeof v === 'number' && v > 0 ? (v > 99 ? '99+' : String(v)) : null
}
</script>

<template>
  <section class="family-entry-grid" aria-labelledby="family-entry-grid-title">
    <header class="header">
      <h2 id="family-entry-grid-title" class="title">📚 在園生活</h2>
    </header>
    <div class="grid">
      <router-link
        v-for="e in entries"
        :key="e.key"
        :to="e.path"
        class="cell"
        :data-tint="e.tint"
      >
        <span class="icon-wrap">
          <ParentIcon :name="e.icon" size="md" />
          <span v-if="badgeOf(e.key)" class="badge">{{ badgeOf(e.key) }}</span>
        </span>
        <span class="label">{{ e.label }}</span>
      </router-link>
    </div>
  </section>
</template>

<style scoped>
.family-entry-grid {
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  box-shadow: var(--pt-elev-1);
}
.title { font-size: var(--text-base, 15px); font-weight: var(--font-weight-semibold, 600); margin: 0 0 var(--space-3, 12px); }
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3, 12px);
}
.cell {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-1, 4px);
  text-decoration: none; color: inherit;
  padding: var(--space-3, 12px) var(--space-1, 4px);
  border-radius: var(--radius-md, 10px);
  background: var(--brand-tint-default, var(--neutral-50));
  min-height: 72px;
}
.cell:active { transform: scale(0.96); }
.icon-wrap {
  position: relative;
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
}
.label { font-size: var(--text-xs, 11px); }
.badge {
  position: absolute; top: -6px; right: -10px;
  background: var(--color-danger); color: var(--neutral-0);
  font-size: 10px; padding: 1px 5px;
  border-radius: var(--radius-full, 9999px); min-width: 16px; text-align: center;
  line-height: 1.4; font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 2px var(--pt-surface-card, var(--neutral-0));
}

/* tint variants — 對應 IvyKids 童彩 6 色 */
.cell[data-tint="contact"] { background: var(--brand-tint-mint, #e6f7f0); }
.cell[data-tint="attendance"] { background: var(--brand-tint-sky, #e6f0fa); }
.cell[data-tint="announcement"] { background: var(--brand-tint-yellow, #fff7d6); }
.cell[data-tint="calendar"] { background: var(--brand-tint-pink, #fde6ee); }
.cell[data-tint="leave"] { background: var(--brand-tint-peach, #ffe8d6); }
.cell[data-tint="medication"] { background: var(--brand-tint-lavender, #ede6fa); }
.cell[data-tint="activity"] { background: var(--brand-tint-mint, #e6f7f0); }
.cell[data-tint="event"] { background: var(--brand-tint-yellow, #fff7d6); }
</style>
