import { ref } from 'vue'
import {
  getRecruitmentAddressHotspots,
  syncRecruitmentAddressHotspots,
  getRecruitmentCampusSetting,
  updateRecruitmentCampusSetting,
  getRecruitmentNearbyKindergartens,
  getRecruitmentMarketIntelligence,
  syncRecruitmentMarketIntelligence,
} from '@/api/recruitment'
import { apiError } from '@/utils/error'

export const createEmptyAreaHotspotsSummary = () => ({
  records_with_address: 0,
  total_hotspots: 0,
  geocoded_hotspots: 0,
  pending_hotspots: 0,
  remaining_hotspots: 0,
  failed_hotspots: 0,
  stale_hotspots: 0,
  provider_available: false,
  provider_name: null,
  hotspots: [],
})

export const normalizeAreaHotspotsSummary = (payload = {}) => ({
  ...createEmptyAreaHotspotsSummary(),
  ...payload,
  hotspots: payload.hotspots ?? [],
})

export const createEmptyCampus = (fallbackLat, fallbackLng) => ({
  campus_name: '本園',
  campus_address: '',
  campus_lat: fallbackLat,
  campus_lng: fallbackLng,
  travel_mode: 'driving',
  updated_at: null,
})

export const createEmptyNearbySchoolState = () => ({
  provider_available: false,
  provider_name: 'google',
  query_bounds: null,
  total: 0,
  schools: [],
  message: '',
})

export const normalizeNearbySchoolState = (payload = {}) => ({
  ...createEmptyNearbySchoolState(),
  ...payload,
  schools: [...(payload.schools ?? [])]
    .sort((a, b) => {
      const aDistance = Number.isFinite(a?.distance_km) ? a.distance_km : Number.POSITIVE_INFINITY
      const bDistance = Number.isFinite(b?.distance_km) ? b.distance_km : Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) return aDistance - bDistance
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-Hant')
    }),
})

const roundViewportValue = (value) => Number(value).toFixed(4)
export const buildNearbyViewportSignature = (bounds = {}) => {
  const parts = [
    bounds.south,
    bounds.west,
    bounds.north,
    bounds.east,
    bounds.zoom,
  ]
  if (parts.some((value) => !Number.isFinite(Number(value)))) return ''
  return [
    roundViewportValue(bounds.south),
    roundViewportValue(bounds.west),
    roundViewportValue(bounds.north),
    roundViewportValue(bounds.east),
    String(Math.round(Number(bounds.zoom))),
  ].join(':')
}

export function useRecruitmentArea({
  notifyError,
  notifyWarning,
  notifySuccess,
  displayLimit = 200,
  syncBatchSize = 20,
  maxSyncRounds = 100,
  fallbackCampusLat,
  fallbackCampusLng,
} = {}) {
  const loadingAreaHotspots = ref(false)
  const syncingAreaHotspotsMode = ref('')
  const loadingMarket = ref(false)
  const syncingMarket = ref(false)
  const savingCampus = ref(false)
  const loadingNearbySchools = ref(false)
  const areaHotspotsSummary = ref(createEmptyAreaHotspotsSummary())
  const campusSetting = ref(createEmptyCampus(fallbackCampusLat, fallbackCampusLng))
  const marketSnapshot = ref({
    campus: createEmptyCampus(fallbackCampusLat, fallbackCampusLng),
    districts: [],
    data_completeness: 'partial',
    synced_at: null,
  })
  const nearbySchools = ref([])
  const nearbySchoolsAvailable = ref(false)
  const nearbySchoolsMessage = ref('')
  const selectedMarketDistrict = ref('')
  const campusDialogVisible = ref(false)
  const campusForm = ref(createEmptyCampus(fallbackCampusLat, fallbackCampusLng))
  const nearbySchoolCache = new Map()
  const activeNearbyViewportSignature = ref('')

  const reportError = (error, fallback) => {
    if (notifyError) notifyError(apiError(error, fallback))
  }

  const buildScopeParams = (base = {}) => {
    return { ...base }
  }

  const buildSyncMessage = (mode, payload = {}) => {
    const attempted = payload.attempted ?? 0
    const synced = payload.synced ?? 0
    const failed = payload.failed ?? 0
    const skipped = payload.skipped ?? 0
    const remaining = payload.remaining_hotspots ?? payload.pending_hotspots ?? 0
    const stale = payload.stale_hotspots ?? 0

    if (mode === 'resync_google') {
      if (attempted > 0 || synced > 0 || failed > 0) {
        const staleSuffix = stale > 0 ? `，尚有 ${stale} 筆舊快取待升級` : '，本頁舊快取已升級完成'
        return `Google 重同步完成：本次處理 ${attempted} 筆，成功 ${synced} 筆、失敗 ${failed} 筆${staleSuffix}`
      }
      return stale > 0
        ? `目前沒有可立即升級的 Google 快取，本頁仍有 ${stale} 筆舊快取待後續處理`
        : '目前沒有需要 Google 重同步的舊快取'
    }

    if (attempted > 0 || synced > 0 || failed > 0) {
      const skippedSuffix = skipped > 0 ? `，略過 ${skipped} 筆已完成地址` : ''
      return `地址同步完成：本次處理 ${attempted} 筆，成功 ${synced} 筆、失敗 ${failed} 筆${skippedSuffix}，尚餘 ${remaining} 筆未同步，另有 ${stale} 筆舊快取可升級`
    }
    if (remaining > 0) {
      return `目前沒有新的地址完成同步，尚餘 ${remaining} 筆未同步，另有 ${stale} 筆舊快取可升級`
    }
    if (stale > 0) {
      return `目前沒有新的地址待同步，另有 ${stale} 筆舊快取可用 Google 重同步升級`
    }
    return '目前沒有需要同步的新地址座標'
  }

  const hasRemainingHotspots = (mode, payload = {}) => {
    if (mode === 'resync_google') return (payload.stale_hotspots ?? 0) > 0
    return (payload.remaining_hotspots ?? payload.pending_hotspots ?? 0) > 0
  }

  const buildSyncStateKey = (payload = {}) => [
    payload.remaining_hotspots ?? payload.pending_hotspots ?? 0,
    payload.stale_hotspots ?? 0,
    payload.failed_hotspots ?? 0,
    payload.geocoded_hotspots ?? 0,
  ].join(':')

  const fetchAreaHotspots = async () => {
    loadingAreaHotspots.value = true
    try {
      const response = await getRecruitmentAddressHotspots(buildScopeParams({ limit: displayLimit }))
      areaHotspotsSummary.value = normalizeAreaHotspotsSummary(response.data)
      return true
    } catch (error) {
      reportError(error, '載入地址熱點失敗')
      return false
    } finally {
      loadingAreaHotspots.value = false
    }
  }

  const fetchCampusSetting = async () => {
    try {
      const response = await getRecruitmentCampusSetting()
      campusSetting.value = {
        ...createEmptyCampus(fallbackCampusLat, fallbackCampusLng),
        ...response.data,
        campus_lat: response.data?.campus_lat ?? fallbackCampusLat,
        campus_lng: response.data?.campus_lng ?? fallbackCampusLng,
      }
      return true
    } catch (error) {
      reportError(error, '載入園所設定失敗')
      return false
    }
  }

  const fetchMarketIntelligence = async () => {
    loadingMarket.value = true
    try {
      const response = await getRecruitmentMarketIntelligence(buildScopeParams())
      marketSnapshot.value = {
        ...marketSnapshot.value,
        ...response.data,
        campus: {
          ...createEmptyCampus(fallbackCampusLat, fallbackCampusLng),
          ...(response.data?.campus || {}),
          campus_lat: response.data?.campus?.campus_lat ?? campusSetting.value.campus_lat,
          campus_lng: response.data?.campus?.campus_lng ?? campusSetting.value.campus_lng,
        },
      }
      return true
    } catch (error) {
      reportError(error, '載入生活圈情報失敗')
      return false
    } finally {
      loadingMarket.value = false
    }
  }

  const applyNearbySchoolState = (payload = {}) => {
    const normalized = normalizeNearbySchoolState(payload)
    nearbySchools.value = normalized.schools
    nearbySchoolsAvailable.value = Boolean(normalized.provider_available)
    nearbySchoolsMessage.value = normalized.message || ''
    return normalized
  }

  const fetchNearbySchools = async (bounds = {}) => {
    const signature = buildNearbyViewportSignature(bounds)
    if (!signature) return false
    if (signature === activeNearbyViewportSignature.value && nearbySchoolCache.has(signature)) {
      applyNearbySchoolState(nearbySchoolCache.get(signature))
      return true
    }

    const cached = nearbySchoolCache.get(signature)
    if (cached) {
      applyNearbySchoolState(cached)
      activeNearbyViewportSignature.value = signature
      return true
    }

    loadingNearbySchools.value = true
    activeNearbyViewportSignature.value = signature
    try {
      const params = {
        south: Number(bounds.south),
        west: Number(bounds.west),
        north: Number(bounds.north),
        east: Number(bounds.east),
        zoom: Math.round(Number(bounds.zoom)),
      }
      const response = await getRecruitmentNearbyKindergartens(params)
      const normalized = applyNearbySchoolState(response.data)
      nearbySchoolCache.set(signature, normalized)
      activeNearbyViewportSignature.value = signature
      return true
    } catch (error) {
      nearbySchools.value = []
      nearbySchoolsAvailable.value = false
      nearbySchoolsMessage.value = apiError(error, '載入附近幼兒園失敗')
      return false
    } finally {
      loadingNearbySchools.value = false
    }
  }

  const loadAreaTab = async () => {
    const [campusOk, hotspotOk, marketOk] = await Promise.all([
      fetchCampusSetting(),
      fetchAreaHotspots(),
      fetchMarketIntelligence(),
    ])
    return campusOk && hotspotOk && marketOk
  }

  const handleAreaHotspotSync = async (mode = 'incremental') => {
    syncingAreaHotspotsMode.value = mode
    try {
      let lastPayload = normalizeAreaHotspotsSummary(areaHotspotsSummary.value)
      let previousStateKey = ''
      const syncTotals = { attempted: 0, synced: 0, failed: 0, skipped: 0 }

      for (let round = 0; round < maxSyncRounds; round += 1) {
        const response = await syncRecruitmentAddressHotspots({
          ...buildScopeParams(),
          batch_size: syncBatchSize,
          limit: displayLimit,
          sync_mode: mode,
        })
        const payload = normalizeAreaHotspotsSummary(response.data)
        areaHotspotsSummary.value = payload
        lastPayload = payload
        syncTotals.attempted += response.data.attempted ?? 0
        syncTotals.synced += response.data.synced ?? 0
        syncTotals.failed += response.data.failed ?? 0
        syncTotals.skipped += response.data.skipped ?? 0

        const currentStateKey = buildSyncStateKey(payload)
        if (
          !hasRemainingHotspots(mode, payload)
          || (response.data.attempted ?? 0) === 0
          || currentStateKey === previousStateKey
        ) {
          break
        }
        previousStateKey = currentStateKey
      }

      await fetchMarketIntelligence()

      const message = buildSyncMessage(mode, {
        ...lastPayload,
        ...syncTotals,
      })
      if (syncTotals.failed > 0 || hasRemainingHotspots(mode, lastPayload)) {
        if (notifyWarning) notifyWarning(message)
        else if (notifyError) notifyError(message)
      } else if (notifySuccess) {
        notifySuccess(message)
      }
      return true
    } catch (error) {
      reportError(error, mode === 'resync_google' ? 'Google 重同步失敗' : '同步地址座標失敗')
      return false
    } finally {
      syncingAreaHotspotsMode.value = ''
    }
  }

  const handleMarketSync = async () => {
    syncingMarket.value = true
    try {
      const response = await syncRecruitmentMarketIntelligence({ hotspot_limit: displayLimit })
      if (response.data?.snapshot) {
        marketSnapshot.value = {
          ...marketSnapshot.value,
          ...response.data.snapshot,
        }
      }
      await fetchAreaHotspots()
      if (notifySuccess) {
        notifySuccess(response.data?.warning ? `同步完成，部分資料保留快取：${response.data.warning}` : '生活圈情報同步完成')
      }
      return true
    } catch (error) {
      reportError(error, '同步生活圈情報失敗')
      return false
    } finally {
      syncingMarket.value = false
    }
  }

  const openCampusDialog = () => {
    campusForm.value = {
      ...createEmptyCampus(fallbackCampusLat, fallbackCampusLng),
      ...campusSetting.value,
    }
    campusDialogVisible.value = true
  }

  const handleCampusSave = async () => {
    savingCampus.value = true
    try {
      const response = await updateRecruitmentCampusSetting(campusForm.value)
      campusSetting.value = {
        ...createEmptyCampus(fallbackCampusLat, fallbackCampusLng),
        ...response.data,
        campus_lat: response.data?.campus_lat ?? fallbackCampusLat,
        campus_lng: response.data?.campus_lng ?? fallbackCampusLng,
      }
      campusDialogVisible.value = false
      await fetchMarketIntelligence()
      await fetchAreaHotspots()
      if (notifySuccess) notifySuccess('園所中心點已更新')
      return true
    } catch (error) {
      reportError(error, '儲存園所設定失敗')
      return false
    } finally {
      savingCampus.value = false
    }
  }

  return {
    loadingAreaHotspots,
    syncingAreaHotspotsMode,
    loadingMarket,
    syncingMarket,
    savingCampus,
    loadingNearbySchools,
    areaHotspotsSummary,
    campusSetting,
    marketSnapshot,
    nearbySchools,
    nearbySchoolsAvailable,
    nearbySchoolsMessage,
    activeNearbyViewportSignature,
    selectedMarketDistrict,
    campusDialogVisible,
    campusForm,
    fetchAreaHotspots,
    fetchCampusSetting,
    fetchMarketIntelligence,
    fetchNearbySchools,
    loadAreaTab,
    handleAreaHotspotSync,
    handleMarketSync,
    openCampusDialog,
    handleCampusSave,
  }
}
