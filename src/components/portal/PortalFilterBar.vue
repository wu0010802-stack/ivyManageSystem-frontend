<script setup lang="ts">
/**
 * 教師端清單頁的篩選列（2026-09-03 UI/UX 稽核 P2-06）。
 *
 * 桌機：控制項直接平鋪，行為與原本的 el-row 篩選列相同。
 * 手機：收成一顆「篩選」鈕（帶已套用條件數），點開底部 sheet 才展開控制項。
 *
 * 原因：事件紀錄、學期評量這類頁面在 390px 下，篩選列＋表頭就吃掉半個螢幕，
 * 而篩選是偶爾才用的動作，清單才是主體。
 */
import { ref } from 'vue'
import { Filter } from '@element-plus/icons-vue'
import TeacherBottomSheet from './TeacherBottomSheet.vue'
import { useIsMobile } from '@/composables/useIsMobile'

withDefaults(defineProps<{
  /** 已套用的條件數，>0 時按鈕顯示數字並高亮 */
  activeCount?: number
  title?: string
}>(), {
  activeCount: 0,
  title: '篩選條件',
})

const emit = defineEmits<{ apply: []; reset: [] }>()

const { isMobile } = useIsMobile()
const sheetOpen = ref(false)

function apply() {
  emit('apply')
  sheetOpen.value = false
}

function reset() {
  emit('reset')
  sheetOpen.value = false
}
</script>

<template>
  <!-- 桌機：平鋪 -->
  <div v-if="!isMobile" class="pfb-inline">
    <slot name="controls" />
    <div class="pfb-inline__actions">
      <el-button @click="emit('apply')">查詢</el-button>
      <el-button @click="emit('reset')">重置</el-button>
    </div>
  </div>

  <!-- 手機：收成一顆按鈕 -->
  <div v-else class="pfb-mobile">
    <el-button
      :icon="Filter"
      :type="activeCount > 0 ? 'primary' : 'default'"
      :plain="activeCount > 0"
      class="pfb-mobile__trigger"
      @click="sheetOpen = true"
    >
      篩選<template v-if="activeCount > 0">（{{ activeCount }}）</template>
    </el-button>
    <el-button v-if="activeCount > 0" link type="primary" @click="emit('reset')">
      清除
    </el-button>
  </div>

  <TeacherBottomSheet
    v-if="isMobile"
    v-model="sheetOpen"
    :title="title"
    :snap-points="['mid', 'full']"
    default-snap="mid"
  >
    <div class="pfb-sheet">
      <slot name="controls" />
    </div>
    <template #footer>
      <div class="pfb-sheet__actions">
        <el-button @click="reset">重置</el-button>
        <el-button type="primary" @click="apply">套用</el-button>
      </div>
    </template>
  </TeacherBottomSheet>
</template>

<style scoped>
.pfb-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.pfb-inline__actions {
  display: flex;
  gap: var(--space-2);
}
.pfb-mobile {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.pfb-mobile__trigger {
  min-height: var(--touch-target-min, 44px);
}
/* sheet 內控制項一律撐滿一列，不與桌機共用橫排 */
.pfb-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}
.pfb-sheet :deep(.el-select),
.pfb-sheet :deep(.el-date-editor),
.pfb-sheet :deep(.el-input) {
  width: 100%;
}
.pfb-sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
}
</style>
