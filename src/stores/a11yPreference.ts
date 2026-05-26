import { defineStore } from 'pinia'

/**
 * 無障礙偏好設定 store
 *
 * 持久化由 useA11yPreference composable 負責（watch + localStorage）。
 * 本 store 只管 reactive 狀態。
 */
export const useA11yPreferenceStore = defineStore('a11yPreference', {
  state: () => ({
    fontSize: 'md',   // 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    theme: 'light',   // 'light' | 'dark'
    colorBlind: false,
  }),
  actions: {
    reset() {
      this.$patch({ fontSize: 'md', theme: 'light', colorBlind: false })
    },
  },
})
