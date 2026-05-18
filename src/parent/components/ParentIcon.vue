<script setup lang="ts">
import { computed } from 'vue'
import M3Icon from './m3/M3Icon.vue'
import { mapIconName, mapIconSize } from '../utils/iconMapping'

/**
 * ParentIcon — 舊 SVG icon 元件的 backward-compatible wrapper。
 *
 * P4.1 改造：內部改用 Material Symbols (M3Icon)；name string 透過
 * iconMapping 自動映射。所有既有 caller 不必改 template。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §7.1
 *
 * 使用（與 P3 之前完全相同）：
 *   <ParentIcon name="home" size="md" />
 *   <ParentIcon name="close" size="lg" aria-label="關閉" />
 */
const props = withDefaults(defineProps<{
  name: string
  size?: string
  decorative?: boolean
}>(), {
  size: 'md',
  decorative: true,
})

const m3Name = computed<string>(() => mapIconName(props.name))
const m3Size = computed<number>(() => mapIconSize(props.size))
</script>

<template>
  <M3Icon :name="m3Name" :size="m3Size" />
</template>
