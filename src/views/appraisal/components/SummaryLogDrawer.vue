<script setup lang="ts">
import { computed } from 'vue'
import SummaryLogTimeline from './SummaryLogTimeline.vue'

const props = defineProps<{
  visible?: boolean
  summaryId?: number | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const drawerVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})
</script>

<template>
  <el-drawer v-model="drawerVisible" title="簽核軌跡" size="40%"
             data-test="summary-log-drawer">
    <SummaryLogTimeline :summary-id="summaryId" />
  </el-drawer>
</template>
