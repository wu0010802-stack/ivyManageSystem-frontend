import { defineStore } from 'pinia'

/**
 * 無障礙偏好設定 store
 *
 * 持久化由 useA11yPreference composable 負責（watch + localStorage）。
 * 本 store 只管 reactive 狀態。
 */
export const useA11yPreferenceStore = defineStore('a11yPreference', {
  state: () => ({
    fontSize: 'md',      // 'sm' | 'md' | 'lg' | 'xl'
    contrast: 'normal',  // 'normal' | 'high'
    colorBlind: false,   // Phase 3 才會在 UI 顯示，先保留欄位
  }),
  actions: {
    reset() {
      this.$patch({ fontSize: 'md', contrast: 'normal', colorBlind: false })
    },
  },
})
