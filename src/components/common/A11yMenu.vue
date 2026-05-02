<template>
  <el-popover
    placement="bottom-end"
    :width="280"
    trigger="click"
    popper-class="a11y-menu-popover"
  >
    <template #reference>
      <button
        type="button"
        class="a11y-trigger"
        aria-label="無障礙設定"
        title="無障礙設定"
        data-testid="a11y-menu-trigger"
      >
        <el-icon :size="20"><View /></el-icon>
      </button>
    </template>

    <div class="a11y-menu">
      <div class="a11y-section">
        <div class="a11y-label">字級</div>
        <div class="a11y-size-row" role="radiogroup" aria-label="字級">
          <button
            v-for="opt in sizeOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="store.fontSize === opt.value"
            :class="['a11y-size-btn', { active: store.fontSize === opt.value }]"
            :data-testid="`a11y-size-${opt.value}`"
            @click="store.fontSize = opt.value"
          >
            <span :style="{ fontSize: opt.preview }">Aa</span>
            <span class="a11y-size-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>

      <div class="a11y-section">
        <div class="a11y-row">
          <span class="a11y-label">高對比</span>
          <el-switch
            :model-value="store.contrast === 'high'"
            data-testid="a11y-contrast-toggle"
            @update:model-value="(v) => (store.contrast = v ? 'high' : 'normal')"
          />
        </div>
      </div>

      <div class="a11y-section a11y-footer">
        <button
          type="button"
          class="a11y-reset"
          data-testid="a11y-reset"
          @click="store.reset()"
        >
          重設
        </button>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { View } from '@element-plus/icons-vue'
import { useA11yPreferenceStore } from '@/stores/a11yPreference'

const store = useA11yPreferenceStore()

const sizeOptions = [
  { value: 'sm', label: '小', preview: '13px' },
  { value: 'md', label: '中', preview: '15px' },
  { value: 'lg', label: '大', preview: '17px' },
  { value: 'xl', label: '特大', preview: '19px' },
]
</script>

<style scoped>
.a11y-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: background 0.15s ease;
}
.a11y-trigger:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.a11y-menu {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.a11y-section { display: flex; flex-direction: column; gap: 8px; }

.a11y-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.a11y-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.a11y-size-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.a11y-size-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--el-text-color-primary);
}

.a11y-size-btn.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.a11y-size-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.a11y-footer { align-items: flex-end; }

.a11y-reset {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 13px;
}
.a11y-reset:hover { color: var(--el-color-primary); }
</style>
