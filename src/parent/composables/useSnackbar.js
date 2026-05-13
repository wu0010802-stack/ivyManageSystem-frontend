import { defineStore, storeToRefs } from 'pinia'

/**
 * Snackbar global queue store + composable.
 *
 * 使用：
 *   const { show, dismiss, snackbars } = useSnackbar()
 *   show({ message: '已儲存', action: { label: '復原', onClick: undo }, duration: 5000 })
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.3
 */
let nextId = 1

const useSnackbarStore = defineStore('parentSnackbar', {
  state: () => ({
    entries: [],
  }),
  actions: {
    show({ message, action = null, duration = 4000 }) {
      const id = nextId++
      this.entries.push({ id, message, action, duration })
      return id
    },
    dismiss(id) {
      this.entries = this.entries.filter((e) => e.id !== id)
    },
  },
})

export function useSnackbar() {
  const store = useSnackbarStore()
  const { entries } = storeToRefs(store)
  return {
    snackbars: entries,
    show: (payload) => store.show(payload),
    dismiss: (id) => store.dismiss(id),
  }
}
