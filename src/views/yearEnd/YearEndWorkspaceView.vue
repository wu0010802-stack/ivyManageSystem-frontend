<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { WORKSPACE_STEPS, normalizeStep, type WorkspaceStepKey } from './workspaceSteps'

const YearEndConfigView = defineAsyncComponent(() => import('./YearEndConfigView.vue'))
const YearEndGridView = defineAsyncComponent(() => import('./YearEndGridView.vue'))
const YearEndDetailView = defineAsyncComponent(() => import('./YearEndDetailView.vue'))

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const step = computed<WorkspaceStepKey>(() => normalizeStep(route.query.step))
function goStep(key: WorkspaceStepKey) {
  if (key === step.value) return
  router.replace({ query: { ...route.query, step: key } })
}

const RAIL_COLLAPSE_KEY = 'ye-workspace-rail-collapsed'
const collapsed = ref(localStorage.getItem(RAIL_COLLAPSE_KEY) === '1')
function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem(RAIL_COLLAPSE_KEY, collapsed.value ? '1' : '0')
}
</script>

<template>
  <div class="ye-workspace" :class="{ 'ye-workspace--collapsed': collapsed }">
    <nav class="ye-rail" aria-label="年終流程導軌">
      <button class="ye-rail__toggle" type="button" @click="toggleCollapse"
        :aria-label="collapsed ? '展開導軌' : '收合導軌'">{{ collapsed ? '»' : '«' }}</button>
      <ul class="ye-rail__steps">
        <li v-for="s in WORKSPACE_STEPS" :key="s.key">
          <button
            type="button"
            class="ye-rail__step"
            :class="{ 'is-active': step === s.key }"
            :data-test="`rail-step-${s.key}`"
            :aria-current="step === s.key ? 'step' : undefined"
            @click="goStep(s.key)"
          >
            <span class="ye-rail__label">{{ s.label }}</span>
            <span v-if="!collapsed" class="ye-rail__hint">{{ s.hint }}</span>
          </button>
        </li>
      </ul>
    </nav>
    <section class="ye-workspace__body">
      <YearEndConfigView v-if="step === 'config'" :cycle-id="cycleId" />
      <YearEndGridView v-else-if="step === 'grid'" :cycle-id="cycleId" />
      <YearEndDetailView v-else :cycle-id="cycleId" />
    </section>
  </div>
</template>

<style scoped>
.ye-workspace { display: flex; gap: var(--space-4); align-items: flex-start; padding: var(--space-4); }
.ye-rail { flex: 0 0 200px; position: sticky; top: var(--space-4); }
.ye-workspace--collapsed .ye-rail { flex-basis: 56px; }
.ye-rail__toggle { border: none; background: transparent; cursor: pointer; color: var(--text-secondary); margin-bottom: var(--space-2); }
.ye-rail__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.ye-rail__step { width: 100%; text-align: left; border: none; background: transparent; cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border-left: 3px solid transparent; display: flex; flex-direction: column; gap: 2px; }
.ye-rail__step.is-active { background: var(--el-color-primary-light-9); border-left-color: var(--el-color-primary); }
.ye-rail__label { font-weight: 600; font-size: var(--text-sm); }
.ye-rail__hint { font-size: var(--text-xs); color: var(--text-secondary); }
.ye-workspace__body { flex: 1; min-width: 0; }
</style>
