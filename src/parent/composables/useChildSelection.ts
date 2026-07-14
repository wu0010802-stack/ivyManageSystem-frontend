/**
 * 多寶家庭子女選擇 composable
 *
 * localStorage 持久化（v2 key），跨 PWA session 保留上次選擇。
 * caller 自行取 children list 並餵給 setOptions() / ensureSelected()。
 */

import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'parent_selected_student_id_v2'

function loadStored(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function saveStored(id: number | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, String(id))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode 等 throw 時忽略 */
  }
}

const selectedId = ref<number | null>(loadStored())

watch(selectedId, (v) => saveStored(v))

/** 登出時清除跨 PWA session 的孩子選擇，避免下一位家長短暫看到舊 student id。 */
export function clearChildSelection(): void {
  selectedId.value = null
  saveStored(null)
}

export function useChildSelection() {
  const setSelected = (id: number | null | undefined): void => {
    selectedId.value = id ? Number(id) : null
  }

  const ensureSelected = (children: { student_id: number }[]): number | null => {
    if (!children || children.length === 0) {
      selectedId.value = null
      return null
    }
    const ids = children.map((c) => c.student_id)
    if (selectedId.value && ids.includes(selectedId.value)) {
      return selectedId.value
    }
    selectedId.value = ids[0]
    return ids[0]
  }

  const selectedChild = (children: { value?: { student_id: number }[] | null }) =>
    computed(() => children.value?.find((c) => c.student_id === selectedId.value) || null)

  return {
    selectedId,
    setSelected,
    ensureSelected,
    selectedChild,
  }
}
