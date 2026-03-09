import { defineStore } from 'pinia'
import { getShiftTypes } from '@/api/shifts'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

export const useShiftStore = defineStore('shift', {
  state: () => ({
    shiftTypes: [],
    loading: false,
    _fetchedAt: 0,
    _pending: null,
  }),

  getters: {
    /** 供排班 View 使用：只顯示啟用中的班別 */
    activeShiftTypes: (state) => state.shiftTypes.filter(t => t.is_active),
  },

  actions: {
    async fetchShiftTypes(force = false) {
      if (!force && this.shiftTypes.length && Date.now() - this._fetchedAt < TTL) return
      if (this._pending) return this._pending

      this.loading = true
      this._pending = getShiftTypes()
        .then(res => {
          this.shiftTypes = res.data
          this._fetchedAt = Date.now()
        })
        .catch(() => { /* handled by API interceptor */ })
        .finally(() => {
          this.loading = false
          this._pending = null
        })

      return this._pending
    },

    async refresh() {
      this._fetchedAt = 0
      await this.fetchShiftTypes(true)
    },
  },
})
