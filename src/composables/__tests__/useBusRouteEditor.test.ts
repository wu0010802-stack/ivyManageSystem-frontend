/**
 * 管理端娃娃車路線編輯 composable 的守衛測試。
 *
 * 這一頁的風險集中在「一次操作毀掉整份名冊」：後端是整方向 replace-all，
 * 而路線本身**沒有刪除／停用端點**。因此重點守衛是
 * ①不自動建路線 ②未儲存的編輯不得靜默丟棄 ③清空要確認 ④儲存失敗不得吃掉編輯，
 * 加上「候選名單不得含後端一定會拒絕的學生」與「學生清單不得靜默截斷」。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/api/bus', () => ({
  listBusRoutes: vi.fn(),
  createBusRoute: vi.fn(),
  replaceBusRouteStops: vi.fn(),
  geocodeBusStudent: vi.fn(),
  updateBusRoute: vi.fn(),
}))
vi.mock('@/api/students', () => ({ getStudents: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listBusRoutes, createBusRoute, replaceBusRouteStops, geocodeBusStudent, updateBusRoute,
} from '@/api/bus'
import { getStudents } from '@/api/students'
import { useBusRouteEditor, MAX_STOPS_PER_DIRECTION } from '@/composables/useBusRouteEditor'

function routesPayload(routes: unknown[]) {
  return { data: { routes } }
}

function routeA(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    name: 'A 線',
    is_active: true,
    stops: {
      morning: [
        { student_id: 101, student_name: '小明', seq: 1, lat: 22.61, lng: 120.31 },
        { student_id: 102, student_name: '小華', seq: 2, lat: null, lng: null },
      ],
      afternoon: [],
    },
    ...overrides,
  }
}

function studentsPayload(items: Array<{ id: number; name: string }>, total?: number) {
  return {
    data: {
      // 端點實際還會回家長姓名／電話／住址；刻意保留，用來咬住「只留 id/name」
      items: items.map((s) => ({
        ...s,
        parent_name: '家長',
        parent_phone: '0912345678',
        address: '高雄市三民區某路 1 號',
      })),
      total: total ?? items.length,
      skip: 0,
      limit: 500,
    },
  }
}

const DEFAULT_STUDENTS = [
  { id: 101, name: '小明' },
  { id: 102, name: '小華' },
  { id: 103, name: '小美' },
  { id: 104, name: '小強' },
]

async function boot(routes: unknown[] = [routeA()]) {
  vi.mocked(listBusRoutes).mockResolvedValue(routesPayload(routes) as never)
  const editor = useBusRouteEditor()
  await editor.init()
  return editor
}

beforeEach(() => {
  vi.mocked(getStudents).mockResolvedValue(studentsPayload(DEFAULT_STUDENTS) as never)
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('載入', () => {
  it('沒有任何路線時**不得**自動建立（後端沒有刪除／停用端點，誤建的刪不掉）', async () => {
    const editor = await boot([])
    expect(createBusRoute).not.toHaveBeenCalled()
    expect(editor.routes.value).toEqual([])
    expect(editor.activeRouteId.value).toBeNull()
    expect(editor.stops.value).toEqual([])
  })

  it('路線載入失敗要亮 loadFailed（空的 routes **不是**「園裡沒有路線」）', async () => {
    vi.mocked(listBusRoutes).mockRejectedValue(
      Object.assign(new Error('403'), { response: { status: 403, data: { detail: '權限不足' } } }),
    )
    const editor = useBusRouteEditor()
    await editor.init()
    expect(editor.loadFailed.value).toBe(true)
    expect(editor.routes.value).toEqual([])
    expect(editor.loading.value).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('權限不足')
  })

  it('路線載入失敗不影響學生清單的判定（反之亦然），訊息各自指向正確對象', async () => {
    vi.mocked(getStudents).mockRejectedValue(new Error('boom'))
    const editor = await boot()
    expect(editor.loadFailed.value).toBe(false)
    expect(editor.studentsFailed.value).toBe(true)
    expect(editor.routes.value).toHaveLength(1)
    expect(ElMessage.error).toHaveBeenCalledWith('載入學生名單失敗，暫時無法加入新站點')
  })

  it('重新 init 會清掉上一輪的失敗旗標', async () => {
    vi.mocked(listBusRoutes).mockRejectedValueOnce(new Error('boom'))
    const editor = useBusRouteEditor()
    await editor.init()
    expect(editor.loadFailed.value).toBe(true)
    vi.mocked(listBusRoutes).mockResolvedValue(routesPayload([routeA()]) as never)
    await editor.init()
    expect(editor.loadFailed.value).toBe(false)
  })

  it('載入既有路線並把當前方向的名冊複製進編輯緩衝', async () => {
    const editor = await boot()
    expect(editor.activeRouteId.value).toBe(3)
    expect(editor.stops.value.map((s) => s.student_name)).toEqual(['小明', '小華'])
    expect(editor.dirty.value).toBe(false)
  })

  it('編輯緩衝與伺服器名冊是兩份資料（改緩衝不會動到 routes）', async () => {
    const editor = await boot()
    editor.removeStop(0)
    expect(editor.stops.value).toHaveLength(1)
    expect(editor.savedStops.value).toHaveLength(2)
  })

  it('學生清單只留 id/name（家長姓名／電話／住址不進狀態）', async () => {
    const editor = await boot()
    expect(editor.students.value).toEqual(DEFAULT_STUDENTS)
    expect(JSON.stringify(editor.students.value)).not.toContain('0912345678')
  })

  it('學生超過單頁上限時要翻頁到底，不得靜默截斷', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `學生${i + 1}` }))
    const page2 = [{ id: 501, name: '最後一個' }]
    vi.mocked(getStudents)
      .mockResolvedValueOnce(studentsPayload(page1, 501) as never)
      .mockResolvedValueOnce(studentsPayload(page2, 501) as never)
    const editor = await boot([])
    expect(getStudents).toHaveBeenCalledTimes(2)
    expect(vi.mocked(getStudents).mock.calls[1][0]).toMatchObject({ skip: 500 })
    expect(editor.students.value).toHaveLength(501)
    expect(editor.students.value.at(-1)?.name).toBe('最後一個')
  })

  it('只查在讀學生（is_active=true）', async () => {
    await boot()
    expect(vi.mocked(getStudents).mock.calls[0][0]).toMatchObject({ is_active: true, limit: 500 })
  })
})

describe('地址過期偵測（address_stale）', () => {
  it('後端回 address_stale:true 時站點要帶進編輯緩衝（學生搬家後座標可能過期）', async () => {
    const editor = await boot([routeA({
      stops: {
        morning: [
          { student_id: 101, student_name: '小明', seq: 1, lat: 22.61, lng: 120.31, address_stale: true },
          { student_id: 102, student_name: '小華', seq: 2, lat: null, lng: null, address_stale: false },
        ],
        afternoon: [],
      },
    })])
    expect(editor.stops.value.find((s) => s.student_id === 101)?.address_stale).toBe(true)
    expect(editor.stops.value.find((s) => s.student_id === 102)?.address_stale).toBe(false)
  })

  it('舊回應沒有 address_stale 欄位時預設 false（不可誤報成已過期）', async () => {
    const editor = await boot([routeA({
      stops: {
        morning: [{ student_id: 101, student_name: '小明', seq: 1, lat: 22.61, lng: 120.31 }],
        afternoon: [],
      },
    })])
    expect(editor.stops.value[0].address_stale).toBe(false)
  })

  it('staleAddressCount 統計目前方向編輯緩衝中 address_stale 的站數', async () => {
    const editor = await boot([routeA({
      stops: {
        morning: [
          { student_id: 101, student_name: '小明', seq: 1, lat: 22.61, lng: 120.31, address_stale: true },
          { student_id: 102, student_name: '小華', seq: 2, lat: null, lng: null, address_stale: true },
          { student_id: 103, student_name: '小美', seq: 3, lat: 22.6, lng: 120.3, address_stale: false },
        ],
        afternoon: [],
      },
    })])
    expect(editor.staleAddressCount.value).toBe(2)
  })

  it('沒有任何過期站時 staleAddressCount 為 0', async () => {
    const editor = await boot()
    expect(editor.staleAddressCount.value).toBe(0)
  })
})

describe('候選名單', () => {
  it('排除已在本方向清單中的學生', async () => {
    const editor = await boot()
    expect(editor.candidates.value.map((s) => s.id)).toEqual([103, 104])
  })

  it('排除同方向已排在別條路線的學生（後端擋跨路線重複指派，送出去是整批 422）', async () => {
    const editor = await boot([
      routeA({ stops: { morning: [], afternoon: [] } }),
      {
        id: 4,
        name: 'B 線',
        is_active: true,
        stops: {
          morning: [{ student_id: 103, student_name: '小美', seq: 1, lat: null, lng: null }],
          afternoon: [],
        },
      },
    ])
    expect(editor.candidates.value.map((s) => s.id)).toEqual([101, 102, 104])
  })

  it('別條路線的「另一個方向」不影響本方向的候選', async () => {
    const editor = await boot([
      routeA({ stops: { morning: [], afternoon: [] } }),
      {
        id: 4,
        name: 'B 線',
        is_active: true,
        stops: {
          morning: [],
          afternoon: [{ student_id: 103, student_name: '小美', seq: 1, lat: null, lng: null }],
        },
      },
    ])
    expect(editor.candidates.value.map((s) => s.id)).toContain(103)
  })
})

describe('編輯', () => {
  it('加入站點會排到最後並重新編號', async () => {
    const editor = await boot()
    editor.addStop(103)
    expect(editor.stops.value.map((s) => [s.student_id, s.seq])).toEqual([
      [101, 1], [102, 2], [103, 3],
    ])
    expect(editor.dirty.value).toBe(true)
  })

  it('不得重複加入同一位學生（同路線同方向撞唯一鍵）', async () => {
    const editor = await boot()
    editor.addStop(101)
    expect(editor.stops.value).toHaveLength(2)
  })

  it('達到後端站數上限就擋下並提示（否則整批 422，第 61 個學生加完才知道）', async () => {
    const many = Array.from({ length: MAX_STOPS_PER_DIRECTION }, (_, i) => ({
      student_id: 1000 + i, student_name: `學生${i}`, seq: i + 1, lat: null, lng: null,
    }))
    const editor = await boot([routeA({ stops: { morning: many, afternoon: [] } })])
    expect(editor.stops.value).toHaveLength(MAX_STOPS_PER_DIRECTION)
    editor.addStop(103)
    expect(editor.stops.value).toHaveLength(MAX_STOPS_PER_DIRECTION)
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('上移／下移會交換並重新編號', async () => {
    const editor = await boot()
    editor.move(1, -1)
    expect(editor.stops.value.map((s) => [s.student_id, s.seq])).toEqual([[102, 1], [101, 2]])
  })

  it('移出邊界不做任何事', async () => {
    const editor = await boot()
    editor.move(0, -1)
    editor.move(1, 1)
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([101, 102])
    expect(editor.dirty.value).toBe(false)
  })

  it('移除站點後重新編號', async () => {
    const editor = await boot()
    editor.removeStop(0)
    expect(editor.stops.value.map((s) => [s.student_id, s.seq])).toEqual([[102, 1]])
  })
})

describe('定位', () => {
  it('成功時把座標寫回該站', async () => {
    vi.mocked(geocodeBusStudent).mockResolvedValue(
      { data: { lat: 22.65, lng: 120.35, address: '高雄市…' } } as never,
    )
    const editor = await boot()
    await editor.geocodeStop(102)
    const stop = editor.stops.value.find((s) => s.student_id === 102)
    expect(stop?.lat).toBe(22.65)
    expect(stop?.lng).toBe(120.35)
    expect(editor.dirty.value).toBe(true)
  })

  it('失敗時不得改動既有座標', async () => {
    vi.mocked(geocodeBusStudent).mockRejectedValue(
      Object.assign(new Error('502'), { response: { status: 502, data: { detail: 'Geocoding 服務不可用或查無結果' } } }),
    )
    const editor = await boot()
    await editor.geocodeStop(101)
    expect(editor.stops.value.find((s) => s.student_id === 101)?.lat).toBe(22.61)
    expect(ElMessage.error).toHaveBeenCalledWith('Geocoding 服務不可用或查無結果')
    expect(editor.dirty.value).toBe(false)
  })
})

describe('切換路線／方向（未儲存的編輯）', () => {
  it('沒有變更時直接切換，不打擾使用者', async () => {
    const editor = await boot()
    await editor.setDirection('afternoon')
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(editor.direction.value).toBe('afternoon')
    expect(editor.stops.value).toEqual([])
  })

  it('有未儲存變更時要先確認；取消則留在原方向且保留編輯', async () => {
    const editor = await boot()
    editor.move(1, -1)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const switched = await editor.setDirection('afternoon')
    expect(switched).toBe(false)
    expect(editor.direction.value).toBe('morning')
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([102, 101])
  })

  it('確認捨棄後才切換並重讀該方向名冊', async () => {
    const editor = await boot()
    editor.move(1, -1)
    const switched = await editor.setDirection('afternoon')
    expect(switched).toBe(true)
    expect(editor.direction.value).toBe('afternoon')
    expect(editor.dirty.value).toBe(false)
  })

  it('換路線同樣受未儲存變更保護', async () => {
    const editor = await boot([routeA(), { id: 4, name: 'B 線', is_active: true, stops: { morning: [], afternoon: [] } }])
    editor.addStop(103)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const switched = await editor.selectRoute(4)
    expect(switched).toBe(false)
    expect(editor.activeRouteId.value).toBe(3)
    expect(editor.stops.value).toHaveLength(3)
  })
})

describe('帶入早接反序', () => {
  it('反序並重新編號，座標一併沿用', async () => {
    const editor = await boot()
    await editor.setDirection('afternoon')
    await editor.mirrorFromMorning()
    expect(editor.stops.value.map((s) => [s.student_id, s.seq])).toEqual([[102, 1], [101, 2]])
    expect(editor.stops.value[1].lat).toBe(22.61)
    expect(editor.dirty.value).toBe(true)
  })

  it('已有下午名冊時要先確認；取消不動', async () => {
    const editor = await boot([routeA({
      stops: {
        morning: [{ student_id: 101, student_name: '小明', seq: 1, lat: null, lng: null }],
        afternoon: [{ student_id: 104, student_name: '小強', seq: 1, lat: null, lng: null }],
      },
    })])
    await editor.setDirection('afternoon')
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    await editor.mirrorFromMorning()
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([104])
  })

  it('早上名冊是空的就不做事（避免把下午名冊清成空的）', async () => {
    const editor = await boot([routeA({
      stops: {
        morning: [],
        afternoon: [{ student_id: 104, student_name: '小強', seq: 1, lat: null, lng: null }],
      },
    })])
    await editor.setDirection('afternoon')
    await editor.mirrorFromMorning()
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([104])
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})

describe('儲存（整方向 replace-all）', () => {
  it('送出重新編號後的完整清單並重讀', async () => {
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: {} } } as never)
    const editor = await boot()
    editor.move(1, -1)
    await editor.save()
    expect(replaceBusRouteStops).toHaveBeenCalledWith(3, 'morning', [
      { student_id: 102, seq: 1, lat: null, lng: null },
      { student_id: 101, seq: 2, lat: 22.61, lng: 120.31 },
    ])
    expect(listBusRoutes).toHaveBeenCalledTimes(2)
    expect(editor.dirty.value).toBe(false)
  })

  it('一律送出 1..n 的連續 seq：伺服器名冊 seq 不連續時也要正規化', async () => {
    // 畫面上的順序欄顯示的是列序（1、2、3…）。若原封不動把伺服器的 2/5/7 送回去，
    // 顯示的順序與實際存下的 seq 就對不起來，事後任何以 seq 為準的比對都會誤判。
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: {} } } as never)
    const editor = await boot([routeA({
      stops: {
        morning: [
          { student_id: 101, student_name: '小明', seq: 2, lat: null, lng: null },
          { student_id: 102, student_name: '小華', seq: 5, lat: null, lng: null },
          { student_id: 103, student_name: '小美', seq: 7, lat: null, lng: null },
        ],
        afternoon: [],
      },
    })])
    await editor.save()
    expect(vi.mocked(replaceBusRouteStops).mock.calls[0][2].map((s) => s.seq)).toEqual([1, 2, 3])
  })

  it('清空整個方向要先確認；取消則不送出', async () => {
    const editor = await boot()
    editor.removeStop(0)
    editor.removeStop(0)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    await editor.save()
    expect(replaceBusRouteStops).not.toHaveBeenCalled()
    expect(editor.stops.value).toEqual([])
  })

  it('儲存失敗時**保留**編輯緩衝（重讀會把剛排好的順序整個丟掉）', async () => {
    vi.mocked(replaceBusRouteStops).mockRejectedValue(
      Object.assign(new Error('422'), {
        response: { status: 422, data: { detail: '下列學生已排入其他路線的同方向名冊：學生 103（B 線）' } },
      }),
    )
    const editor = await boot()
    editor.move(1, -1)
    await editor.save()
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([102, 101])
    expect(editor.dirty.value).toBe(true)
    expect(listBusRoutes).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledWith(
      '下列學生已排入其他路線的同方向名冊：學生 103（B 線）',
    )
  })

  it('PUT 成功但重讀失敗時**不得**謊報「儲存失敗」（使用者會重送＝再跑一次 replace-all）', async () => {
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: {} } } as never)
    const editor = await boot()
    vi.mocked(listBusRoutes).mockRejectedValue(new Error('boom'))
    await editor.save()
    expect(ElMessage.success).toHaveBeenCalledWith('已儲存')
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith(
      '已儲存，但重新載入名冊失敗，畫面可能不是最新狀態',
    )
    expect(editor.saving.value).toBe(false)
  })

  it('存檔後仍有站點缺座標時要提示（家長端看不到該站位置）', async () => {
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: {} } } as never)
    const editor = await boot()
    await editor.save()
    expect(ElMessage.warning).toHaveBeenCalledWith(
      expect.stringContaining('仍有 1 站沒有座標'),
    )
  })
})

describe('建立路線', () => {
  it('建立後重讀並切到新路線', async () => {
    vi.mocked(createBusRoute).mockResolvedValue({ data: { id: 9, name: 'C 線', is_active: true } } as never)
    const editor = await boot([])
    vi.mocked(listBusRoutes).mockResolvedValue(
      routesPayload([{ id: 9, name: 'C 線', is_active: true, stops: { morning: [], afternoon: [] } }]) as never,
    )
    await editor.createRoute('  C 線  ')
    expect(createBusRoute).toHaveBeenCalledWith('C 線')
    expect(editor.activeRouteId.value).toBe(9)
  })

  it('空白名稱不送出', async () => {
    const editor = await boot([])
    await editor.createRoute('   ')
    expect(createBusRoute).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
  })
})

describe('改名／啟用停用（PATCH /bus/routes/{id}）', () => {
  it('改名成功後重讀路線清單並回 true', async () => {
    vi.mocked(updateBusRoute).mockResolvedValue({ data: { id: 3, name: 'A 線改名', is_active: true } } as never)
    const editor = await boot()
    vi.mocked(listBusRoutes).mockResolvedValue(
      routesPayload([routeA({ name: 'A 線改名' })]) as never,
    )
    const ok = await editor.updateRoute(3, { name: 'A 線改名' })
    expect(ok).toBe(true)
    expect(updateBusRoute).toHaveBeenCalledWith(3, { name: 'A 線改名' })
    expect(editor.routes.value[0].name).toBe('A 線改名')
    expect(editor.updatingRoute.value).toBe(false)
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('停用成功後路線清單反映 is_active=false', async () => {
    vi.mocked(updateBusRoute).mockResolvedValue({ data: { id: 3, name: 'A 線', is_active: false } } as never)
    const editor = await boot()
    vi.mocked(listBusRoutes).mockResolvedValue(
      routesPayload([routeA({ is_active: false })]) as never,
    )
    const ok = await editor.updateRoute(3, { is_active: false })
    expect(ok).toBe(true)
    expect(editor.routes.value[0].is_active).toBe(false)
  })

  it('有未儲存的站點編輯時要先確認才能改名／停用（reload 會靜默丟棄編輯緩衝）', async () => {
    const editor = await boot()
    editor.move(1, -1) // 製造 dirty
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))
    const ok = await editor.updateRoute(3, { name: '改壞了' })
    expect(ok).toBe(false)
    expect(updateBusRoute).not.toHaveBeenCalled()
    expect(editor.stops.value.map((s) => s.student_id)).toEqual([102, 101]) // 編輯緩衝保留
  })

  it('確認捨棄未儲存編輯後可繼續改名／停用', async () => {
    vi.mocked(updateBusRoute).mockResolvedValue({ data: { id: 3, name: 'A 線', is_active: true } } as never)
    const editor = await boot()
    editor.move(1, -1)
    const ok = await editor.updateRoute(3, { name: 'A 線' })
    expect(ok).toBe(true)
    expect(updateBusRoute).toHaveBeenCalled()
  })

  it('409（有進行中班次）要給明確可理解的訊息，不可只丟通用連線錯誤', async () => {
    vi.mocked(updateBusRoute).mockRejectedValue(
      Object.assign(new Error('409'), { response: { status: 409, data: {} } }),
    )
    const editor = await boot()
    const ok = await editor.updateRoute(3, { is_active: false })
    expect(ok).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('進行中'),
    )
    expect(ElMessage.error).not.toHaveBeenCalledWith(
      expect.stringContaining('連線'),
    )
    expect(editor.updatingRoute.value).toBe(false)
  })

  it('409 但後端有帶明確 detail 訊息時，優先顯示後端訊息', async () => {
    vi.mocked(updateBusRoute).mockRejectedValue(
      Object.assign(new Error('409'), {
        response: { status: 409, data: { detail: '此路線目前有進行中班次，無法停用' } },
      }),
    )
    const editor = await boot()
    const ok = await editor.updateRoute(3, { is_active: false })
    expect(ok).toBe(false)
    expect(ElMessage.error).toHaveBeenCalledWith('此路線目前有進行中班次，無法停用')
  })

  it('其他失敗（非 409）也回 false 並提示，不動編輯緩衝', async () => {
    vi.mocked(updateBusRoute).mockRejectedValue(new Error('boom'))
    const editor = await boot()
    const ok = await editor.updateRoute(3, { name: 'x' })
    expect(ok).toBe(false)
    expect(ElMessage.error).toHaveBeenCalled()
    expect(editor.updatingRoute.value).toBe(false)
  })
})

describe('隱私', () => {
  it('全流程不得把座標或名冊寫進 console 或任何 storage', async () => {
    vi.mocked(replaceBusRouteStops).mockResolvedValue({ data: { stops: {} } } as never)
    vi.mocked(geocodeBusStudent).mockResolvedValue({ data: { lat: 22.65, lng: 120.35, address: 'x' } } as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // ⚠ 兩個恆綠陷阱：tests/setup.js 的 localStorage 是純物件 mock（Storage.prototype
    // 的 spy 抓不到），happy-dom 的 sessionStorage 是 Proxy（instance spy 的賦值被吞）。
    // 故 localStorage 對實際物件下 spy、sessionStorage 整個換掉；自檢見本 describe 末。
    const storageSpy = vi.spyOn(localStorage, 'setItem')
    const sessionSpy = vi.fn()
    const originalSession = globalThis.sessionStorage
    vi.stubGlobal('sessionStorage', { setItem: sessionSpy, getItem: () => null, removeItem: vi.fn(), clear: vi.fn() })
    const editor = await boot()
    editor.addStop(103)
    await editor.geocodeStop(103)
    await editor.save()
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
    expect(sessionSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    storageSpy.mockRestore()
    vi.stubGlobal('sessionStorage', originalSession)
  })

  it('守衛自檢：storage spy 真的抓得到寫入', () => {
    const storageSpy = vi.spyOn(localStorage, 'setItem')
    const sessionSpy = vi.fn()
    const originalSession = globalThis.sessionStorage
    vi.stubGlobal('sessionStorage', { setItem: sessionSpy, getItem: () => null, removeItem: vi.fn(), clear: vi.fn() })
    localStorage.setItem('probe', '1')
    sessionStorage.setItem('probe', '1')
    expect(storageSpy).toHaveBeenCalled()
    expect(sessionSpy).toHaveBeenCalled()
    storageSpy.mockRestore()
    vi.stubGlobal('sessionStorage', originalSession)
  })
})

// ── 測試輔助函式自檢 ──
describe('測試輔助函式自檢', () => {
  it('studentsPayload 真的帶著家長 PII（否則「只留 id/name」的斷言形同虛設）', () => {
    const payload = studentsPayload([{ id: 1, name: 'x' }])
    expect(payload.data.items[0]).toMatchObject({ parent_phone: '0912345678' })
  })

  it('routeA 的早接名冊第一站真的帶座標、第二站真的沒有', () => {
    const r = routeA()
    expect(r.stops.morning[0]).toMatchObject({ lat: 22.61, lng: 120.31 })
    expect(r.stops.morning[1]).toMatchObject({ lat: null, lng: null })
  })
})
