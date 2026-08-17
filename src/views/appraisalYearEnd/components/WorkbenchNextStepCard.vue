<script setup lang="ts">
import type { NextStep } from '../nextStep'

defineProps<{ step: NextStep | null; partialError: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <el-card shadow="never" class="wb-next" data-test="next-step-card">
    <el-skeleton v-if="!step" :rows="1" animated />
    <template v-else>
      <div class="wb-next__row">
        <div>
          <p class="wb-next__title">
            <template v-if="step.key === 'done'">✓ {{ step.title }}</template>
            <template v-else>下一步：{{ step.title }}</template>
          </p>
          <p class="wb-next__reason">{{ step.reason }}</p>
          <p v-if="partialError" class="wb-next__warn">
            部分卡片載入失敗，建議內容可能不完整。
            <el-button size="small" text type="warning" data-test="next-step-retry-all" @click="$emit('retry')">重試全部</el-button>
          </p>
        </div>
        <router-link v-if="step.to" :to="step.to">
          <el-button type="primary">{{ step.ctaLabel }}</el-button>
        </router-link>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.wb-next { border-left: 4px solid var(--el-color-primary); }
.wb-next__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.wb-next__title { font-weight: 600; font-size: var(--text-base); margin: 0; }
.wb-next__reason { font-size: var(--text-sm); color: var(--text-secondary); margin: 4px 0 0; }
.wb-next__warn { font-size: var(--text-xs); color: var(--el-color-warning); margin: 4px 0 0; display: flex; align-items: center; gap: var(--space-2); }
</style>
