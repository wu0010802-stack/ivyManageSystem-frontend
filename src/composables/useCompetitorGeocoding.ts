/**
 * useCompetitorGeocoding — 競爭者學校批次地理編碼（每批最多 500 筆，自動連續執行）
 *
 * 拆分自 RecruitmentAddressHeatmap.vue（2026-07-12 元件邊界拆分），行為零改動：
 * - autoGeocodeIfNeeded()：先查有沒有待補的座標，有才觸發批次迴圈（避免浪費 Google API 流量）
 * - handleGeocodeCompetitors()：while(true) 批次 loop 跨多個 await；元件卸載後用
 *   geocodeAborted 旗標中止，避免對已銷毀元件繼續打 API / 寫 reactive state
 */
import { onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import { geocodeCompetitorSchools, getGeocodePendingCount } from '@/api/recruitment'

export function useCompetitorGeocoding(canWrite: Ref<boolean>) {
  const geocodingCompetitors = ref(false)
  const geocodeCompetitorResult = ref('')
  // 元件卸載旗標：while(true) 批次 loop 跨多個 await，卸載後若不中止會繼續打
  // API（浪費 Google 流量）並對已銷毀元件寫 reactive state。卸載時翻 true 即 break。
  let geocodeAborted = false

  const handleGeocodeCompetitors = async () => {
    if (geocodingCompetitors.value) return
    geocodingCompetitors.value = true
    geocodeCompetitorResult.value = ''
    let totalGeocoded = 0
    let totalFailed = 0
    let batchCount = 0
    try {
      // 每批最多 500 筆，重複執行直到沒有剩餘待 geocode 的學校
      while (true) {
        // 卸載後中止：避免對已銷毀元件繼續打 API / 寫 reactive state
        if (geocodeAborted) break
        batchCount += 1
        geocodeCompetitorResult.value = `第 ${batchCount} 批處理中…（累計成功 ${totalGeocoded} 筆）`
        const res = await geocodeCompetitorSchools(500)
        // await 期間可能已卸載，回來再檢查一次
        if (geocodeAborted) break
        const { geocoded = 0, failed = 0, total = 0 } = res.data ?? {}
        totalGeocoded += geocoded
        totalFailed += failed
        // total === 0 表示已無待處理的學校；geocoded === 0 表示本批全失敗，停止避免無限迴圈
        if (total === 0 || geocoded === 0) break
      }
      geocodeCompetitorResult.value = `完成：${totalGeocoded} 筆成功、${totalFailed} 筆失敗（共 ${batchCount} 批）`
    } catch {
      geocodeCompetitorResult.value = `地理編碼中斷：已成功 ${totalGeocoded} 筆、失敗 ${totalFailed} 筆`
    } finally {
      geocodingCompetitors.value = false
    }
  }

  const autoGeocodeIfNeeded = async () => {
    if (!canWrite.value || geocodingCompetitors.value) return
    try {
      const res = await getGeocodePendingCount()
      if ((res.data?.pending ?? 0) > 0) {
        handleGeocodeCompetitors()
      }
    } catch {
      // 靜默失敗
    }
  }

  onBeforeUnmount(() => {
    geocodeAborted = true
  })

  return {
    geocodingCompetitors,
    geocodeCompetitorResult,
    autoGeocodeIfNeeded,
    handleGeocodeCompetitors,
  }
}
