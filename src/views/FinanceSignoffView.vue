<template>
  <div class="finance-signoff-view" :class="{ 'finance-signoff-view--mobile-cta': showMobileCta }">
    <PageHeader title="收付款管理" subtitle="登記廠商付款與雜項收款，走送審、收付、補憑證到對帳的內控流程">
      <template #actions>
        <!-- 桌面版主要新增入口：active tab 方向為主按鈕，另一方向收在下拉 -->
        <el-dropdown
          v-if="!isMobile && creatableModules.length"
          split-button
          type="primary"
          data-test="header-create"
          @click="createFor(primaryCreateModule!.key)"
          @command="(key: string) => createFor(key)"
        >
          <el-icon class="fs-create-icon"><Plus /></el-icon>
          {{ primaryCreateModule!.texts.addButton }}
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="m in secondaryCreateModules"
                :key="m.key"
                :command="m.key"
                data-test="header-create-secondary"
              >{{ m.texts.addButton }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </PageHeader>

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
      ref="panelRef"
      :key="activeModule.key"
      :config="activeModule"
      :highlight-id="highlightId"
      :is-mobile="isMobile"
    />

    <!-- 行動版底部 sticky 新增（與桌面 header CTA 互斥，不同時顯示） -->
    <div
      v-if="showMobileCta"
      class="fs-mobile-cta"
      data-test="mobile-sticky-cta"
    >
      <el-button
        type="primary"
        class="fs-mobile-cta__primary tap-target"
        data-test="mobile-create-primary"
        @click="createFor(primaryCreateModule!.key)"
      >
        <el-icon class="fs-create-icon"><Plus /></el-icon>
        {{ primaryCreateModule!.texts.addButton }}
      </el-button>
      <el-dropdown
        v-if="secondaryCreateModules.length"
        trigger="click"
        @command="(key: string) => createFor(key)"
      >
        <el-button
          class="fs-mobile-cta__more tap-target"
          aria-label="新增其他方向"
          data-test="mobile-create-more"
        >⋯</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="m in secondaryCreateModules"
              :key="m.key"
              :command="m.key"
            >{{ m.texts.addButton }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { useIsMobile } from '@/composables/useIsMobile'
import { SIGNOFF_MODULES, type SignoffModuleConfig } from '@/config/signoffModules'
import PageHeader from '@/components/common/PageHeader.vue'
import SignoffPanel from '@/components/signoff/SignoffPanel.vue'

const route = useRoute()
const router = useRouter()
const { isMobile } = useIsMobile()

const panelRef = ref<InstanceType<typeof SignoffPanel> | null>(null)

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

// ─── 新增入口（桌面 header split / 行動 sticky 共用同一 create 流程）────
const creatableModules = computed(() =>
  visibleModules.value.filter((m) => hasPermission(m.permissions.write)),
)

/** 主按鈕＝active tab 方向（若無 WRITE 則退第一個可新增方向） */
const primaryCreateModule = computed<SignoffModuleConfig | null>(() => {
  const active = creatableModules.value.find((m) => m.key === activeKey.value)
  return active ?? creatableModules.value[0] ?? null
})

const secondaryCreateModules = computed(() =>
  creatableModules.value.filter((m) => m.key !== primaryCreateModule.value?.key),
)

const showMobileCta = computed(
  () => isMobile.value && !!primaryCreateModule.value,
)

/** 跨方向新增：非 active tab 先切 tab（panel 以 :key 重掛）再開新增表單 */
async function createFor(key: string) {
  if (key !== activeKey.value) {
    activeKey.value = key
    await nextTick()
    await nextTick()
  }
  panelRef.value?.openCreate()
}
</script>

<style scoped>
.finance-signoff-view {
  padding: var(--space-4, 16px);
}
/* sticky CTA 出現時保留底部空間，最後幾列不被蓋住 */
.finance-signoff-view--mobile-cta {
  padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
}
.fs-tabs {
  margin-bottom: var(--space-2, 8px);
}
.fs-create-icon {
  margin-right: 4px;
}

/* ── 行動版 sticky 新增列（滿寬主按鈕 + 44px 選單鈕，避開 safe-area）── */
.fs-mobile-cta {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-sticky, 100);
  display: flex;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-3, 12px)
    calc(var(--space-2, 8px) + env(safe-area-inset-bottom, 0px));
  background: var(--neutral-0, #fff);
  border-top: 1px solid var(--neutral-200);
}
.fs-mobile-cta__primary {
  flex: 1 1 auto;
  min-height: var(--touch-target-min, 44px);
}
.fs-mobile-cta__more {
  flex: 0 0 auto;
  min-height: var(--touch-target-min, 44px);
  min-width: var(--touch-target-min, 44px);
  font-weight: 700;
}
</style>
