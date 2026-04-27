/**
 * 多孩家庭子女選擇 composable
 *
 * sessionStorage 暫存上次選擇的 student_id；首次 fetch 後若無暫存，
 * 預設選第一個小孩。caller 自行取 children list 並餵給 setOptions()。
 */

import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'parent_selected_student_id_v1'

function loadStored() {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function saveStored(id) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, String(id))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

const selectedId = ref(loadStored())

watch(selectedId, (v) => saveStored(v))

export function useChildSelection() {
  const setSelected = (id) => {
    selectedId.value = id ? Number(id) : null
  }

  const ensureSelected = (children) => {
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

  const selectedChild = (children) =>
    computed(() => children.value?.find((c) => c.student_id === selectedId.value) || null)

  return {
    selectedId,
    setSelected,
    ensureSelected,
    selectedChild,
  }
}
