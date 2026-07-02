<template>
  <div class="finance-signoff-view">
    <header class="fs-header">
      <h2>收支簽收</h2>
      <p class="fs-header__sub">登錄廠商付款與雜項收款，收集簽收憑證留存稽核</p>
    </header>

    <el-tabs v-if="visibleModules.length > 1" v-model="activeKey" class="fs-tabs">
      <el-tab-pane
        v-for="m in visibleModules"
        :key="m.key"
        :label="m.tabLabel"
        :name="m.key"
      />
    </el-tabs>

    <SignoffPanel
      v-if="activeModule"
      :key="activeModule.key"
      :config="activeModule"
      :highlight-id="highlightId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import { SIGNOFF_MODULES, type SignoffModuleConfig } from '@/config/signoffModules'
import SignoffPanel from '@/components/signoff/SignoffPanel.vue'

const route = useRoute()
const router = useRouter()

const visibleModules = computed<SignoffModuleConfig[]>(() =>
  SIGNOFF_MODULES.filter((m) => hasPermission(m.permissions.read)),
)

function resolveKeyFromRoute(): string {
  const q = route.query.tab
  const hit = visibleModules.value.find((m) => m.key === q)
  return hit?.key ?? visibleModules.value[0]?.key ?? ''
}

const activeKey = ref<string>(resolveKeyFromRoute())

watch(
  () => route.query.tab,
  () => {
    activeKey.value = resolveKeyFromRoute()
  },
)

// tab → query 回寫（比照 OvertimeView 慣例）；換 tab 順帶清 highlight，
// 避免舊 id 打到另一個模組的 GET 端點
watch(activeKey, async (value) => {
  const current = typeof route.query.tab === 'string' ? route.query.tab : undefined
  if (value === current) return
  const nextQuery = { ...route.query, tab: value } as Record<string, string | string[]>
  delete nextQuery.highlight
  await router.replace({ query: nextQuery })
})

const activeModule = computed(
  () => visibleModules.value.find((m) => m.key === activeKey.value) ?? null,
)

const highlightId = computed<number | null>(() => {
  // tab fallback（無效值或無該模組權限）時 query.tab ≠ activeKey，
  // 此時不得把 highlight 帶進落點模組（id 撞號會打開不相干的紀錄）
  const tab = route.query.tab
  if (typeof tab === 'string' && tab !== activeKey.value) return null
  const raw = route.query.highlight as string | string[] | undefined
  const id = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(id) && id > 0 ? id : null
})
</script>

<style scoped>
.finance-signoff-view {
  padding: var(--space-4, 16px);
}
.fs-header {
  margin-bottom: var(--space-4, 16px);
}
.fs-header h2 {
  margin: 0;
  font-size: var(--text-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
}
.fs-header__sub {
  margin: 4px 0 0;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
}
.fs-tabs {
  margin-bottom: var(--space-2, 8px);
}
</style>
