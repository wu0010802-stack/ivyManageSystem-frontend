<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import { aeySideOfPath, visibleRuleTabs, type AyeSide } from './ruleTabs'

interface SectionDef { key: string; label: string; to: string; can: () => boolean }

// 2026-10-29 後台 IA 重整 批次 3（S1）：側欄把「考核與年終」拆成「考核」「年終」兩個選單項，
// 考核／年終的切換改由側欄負責，頂列不再放「待辦／考核／年終」三段。
// 待辦（總覽）與待補資料（例外中心）是兩邊共用的入口，所以留在本 layout 頂列：
// 不論從哪一邊進來，頁首都有這兩個入口。路由 /todo、/exceptions 不變。
// 規則設定仍是齒輪按鈕（不佔 segmented 名額），依目前所在邊帶到該邊第一個可見的規則頁籤。
const SECTIONS: SectionDef[] = [
  { key: 'todo', label: '待辦', to: '/appraisal-year-end/todo',
    can: () => ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'].some((p) => hasPermission(p)) },
  // 待補資料的路由規則為 APPRAISAL_READ／YEAR_END_READ 任一（見 manifest extraRoutes）。
  { key: 'exceptions', label: PAGE_TERMS.yearEndExceptions, to: '/appraisal-year-end/exceptions',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ') },
]

const route = useRoute()
const router = useRouter()
const sections = computed(() => SECTIONS.filter((s) => s.can()))
const canRules = computed(() => hasPermission('APPRAISAL_READ') || hasPermission('SETTINGS_READ'))
// 只有待辦、待補資料兩段會高亮；考核／年終／規則頁都不佔段（'' 不匹配任何 option.value）。
const activeKey = computed(() => {
  const seg = route.path.split('/')[2] ?? 'todo'
  if (seg === 'todo' || seg === 'overview') return 'todo'
  if (seg === 'exceptions') return 'exceptions'
  return ''
})
const segmentedOptions = computed(() => sections.value.map((s) => ({ label: s.label, value: s.key })))
const onSectionChange = (val: string | number) => {
  const target = SECTIONS.find((s) => s.key === String(val))
  if (target && activeKey.value !== target.key) router.push(target.to)
}

// 齒輪目的地：在年終側 → 年終側第一個可見規則頁籤；其餘（考核側、待辦、待補資料）→ /rules，
// 由路由 redirect 依權限落在考核側 scoring（無 APPRAISAL_READ 則年終規則）。
// 年終側若沒有任何可見頁籤（canRules 為真時不會發生）退回 /rules。
const currentSide = computed<AyeSide | null>(() => aeySideOfPath(route.path))
const goRules = () => {
  if (currentSide.value === 'year-end') {
    const first = visibleRuleTabs('year-end')[0]
    if (first) {
      router.push(`/appraisal-year-end/rules/${first.name}`)
      return
    }
  }
  router.push('/appraisal-year-end/rules')
}
</script>

<template>
  <div class="aye-layout">
    <div class="aye-topbar">
      <el-segmented
        v-if="segmentedOptions.length > 0"
        class="aye-nav"
        :model-value="activeKey"
        :options="segmentedOptions"
        size="large"
        @change="onSectionChange"
      />
      <button
        v-if="canRules"
        type="button"
        class="aye-gear"
        aria-label="規則與進階設定"
        title="規則與進階設定"
        @click="goRules"
      >
        <el-icon><Setting /></el-icon>
      </button>
    </div>
    <div class="aye-body">
      <router-view />
    </div>
    <el-empty v-if="segmentedOptions.length === 0" description="無權限檢視此頁" />
  </div>
</template>

<style scoped>
.aye-layout { padding: var(--space-5); }
.aye-topbar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.aye-nav { flex: 0 0 auto; }
.aye-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 150ms, color 150ms;
}
.aye-gear:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.aye-gear:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
</style>
