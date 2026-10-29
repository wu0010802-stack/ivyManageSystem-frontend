import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import RulesSettingsLayout from '../RulesSettingsLayout.vue'

const hasPermissionMock = vi.hoisted(() => vi.fn((_: string) => true))
vi.mock('@/utils/auth', () => ({ hasPermission: (p: string) => hasPermissionMock(p) }))

// Task B5：layout onMounted 會呼叫 refresh()（打 listAppraisalCycles），
// 需 mock 掉避免既有測試打到真實 axios（happy-dom 下無後端會 reject）。
// 預設回傳空陣列＝無 OPEN 週期，維持既有 5 個測試（未斷言 banner）行為不變。
const listAppraisalCyclesMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/appraisal', () => ({ listAppraisalCycles: (...a: unknown[]) => listAppraisalCyclesMock(...a) }))

const ScoringStub = { template: '<div class="stub-scoring" />' }
const BonusStub = { template: '<div class="stub-bonus" />' }
const CatalogStub = { template: '<div class="stub-catalog" />' }
const EnrollmentStub = { template: '<div class="stub-enrollment" />' }
const YearEndRulesStub = { template: '<div class="stub-year-end-rules" />' }

const stubs = {
  ElTabs: {
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue', 'tab-change'],
    template: '<div class="stub-tabs"><slot /></div>',
  },
  // Task B7：需渲染具名 #label slot（tab 標題旁的 ReadonlyBadge 掛在此 slot），
  // 原本只渲染 default slot 的 stub 會讓徽章從未進入斷言範圍。
  ElTabPane: {
    name: 'ElTabPane',
    props: ['label', 'name'],
    template: '<div><slot name="label" /><slot /></div>',
  },
  // Task B5：比照既有慣例（ManualEventEntrySection.spec.js 等）顯式 stub el-alert，
  // 保留具名 title slot 讓 banner 內文（含 router-link）可被斷言。
  'el-alert': {
    name: 'ElAlert',
    template: '<div class="el-alert" data-test="open-cycle-alert"><slot name="title" /></div>',
  },
  // 考核／年終 切換（S1）：只關心 options 與 change 事件
  'el-segmented': {
    name: 'ElSegmented',
    props: ['modelValue', 'options'],
    emits: ['change'],
    template: '<div class="stub-segmented" data-test="rules-side-switch" :data-value="modelValue" />',
  },
}

// 同 AppraisalManagementView.spec.ts 的既知現象：RulesSettingsLayout 自身即為路由 component，
// 內含 <router-view />；直接 mount 會讓內部 <router-view> 因缺 depth context 重複渲染自己。
// 改用只含 <router-view /> 的 RootWrapper 掛載取得正確 depth。
const RootWrapper = { template: '<router-view />' }

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/appraisal-year-end/rules',
      component: RulesSettingsLayout,
      children: [
        { path: 'scoring', component: ScoringStub },
        { path: 'bonus-rates', component: BonusStub },
        { path: 'catalog', component: CatalogStub },
        { path: 'enrollment-targets', component: EnrollmentStub },
        { path: 'festival-headcount', component: { template: '<div class="stub-festival-headcount" />' } },
        { path: 'year-end-rules', component: YearEndRulesStub },
      ],
    }],
  })
}

async function mountAt(path: string) {
  const router = buildRouter()
  await router.push(path)
  await router.isReady()
  const w = mount(RootWrapper, { global: { plugins: [router], stubs } })
  await flushPromises()
  return { w, router }
}

describe('RulesSettingsLayout', () => {
  beforeEach(() => {
    hasPermissionMock.mockReset()
    hasPermissionMock.mockReturnValue(true)
    listAppraisalCyclesMock.mockReset()
    // 預設無 OPEN 週期，維持既有測試（未斷言 banner）行為不變。
    listAppraisalCyclesMock.mockResolvedValue({ data: [] })
  })

  // 2026-10-29 後台 IA 重整 S1：頁籤依所在邊（權限碼歸屬）分列，合計仍是原本 6 個。
  it('全權限、停在考核側頁籤 → 列考核側 4 個分頁（APPRAISAL_* 域，維持原順序）', async () => {
    const { w } = await mountAt('/appraisal-year-end/rules/scoring')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).toEqual(['scoring', 'bonus-rates', 'catalog', 'enrollment-targets'])
  })

  it('全權限、停在年終側頁籤 → 列年終側 2 個分頁（節慶人數 SALARY_READ、年終規則 SETTINGS_READ）', async () => {
    const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).toEqual(['festival-headcount', 'year-end-rules'])
  })

  it('節慶人數分頁需 SALARY_READ（業主裁定 D4：沿用薪資權限）', async () => {
    hasPermissionMock.mockImplementation((code: string) => code !== 'SALARY_READ')
    const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).not.toContain('festival-headcount')
    expect(panes.map((p) => p.props('name'))).toEqual(['year-end-rules'])
  })

  it('停在 bare /rules（尚未 redirect）→ 取使用者第一個可見頁籤所在的邊', async () => {
    const { w } = await mountAt('/appraisal-year-end/rules')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).toEqual(['scoring', 'bonus-rates', 'catalog', 'enrollment-targets'])
  })

  describe('考核／年終 切換（兩邊都有可見頁籤才出現，避免頁籤因側欄沒有對應入口而進不去）', () => {
    it('兩邊都有可見頁籤 → 顯示切換，options 為考核、年終，value 是所在邊', async () => {
      const { w } = await mountAt('/appraisal-year-end/rules/scoring')
      const seg = w.findComponent({ name: 'ElSegmented' })
      expect(seg.exists()).toBe(true)
      expect((seg.props('options') as Array<{ value: string }>).map((o) => o.value)).toEqual(['appraisal', 'year-end'])
      expect(seg.props('modelValue')).toBe('appraisal')
    })

    it('切到年終 → 導到年終側第一個可見頁籤；已在該邊不重覆 push', async () => {
      const { w, router } = await mountAt('/appraisal-year-end/rules/scoring')
      const pushSpy = vi.spyOn(router, 'push')
      w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'year-end')
      await flushPromises()
      expect(pushSpy).toHaveBeenCalledWith('/appraisal-year-end/rules/festival-headcount')

      pushSpy.mockClear()
      w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'appraisal')
      await flushPromises()
      expect(pushSpy).toHaveBeenCalledWith('/appraisal-year-end/rules/scoring')
    })

    it('只持 APPRAISAL_READ → 只有考核側有頁籤，不顯示切換', async () => {
      hasPermissionMock.mockImplementation((p: string) => p === 'APPRAISAL_READ')
      const { w } = await mountAt('/appraisal-year-end/rules/scoring')
      expect(w.findComponent({ name: 'ElSegmented' }).exists()).toBe(false)
    })

    it('只持 SETTINGS_READ → 只有年終側有頁籤，不顯示切換', async () => {
      hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')
      const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
      expect(w.findComponent({ name: 'ElSegmented' }).exists()).toBe(false)
    })

    it('持 APPRAISAL_READ＋SETTINGS_READ（沒有 YEAR_END_READ，側欄只有「考核」入口）→ 仍能用切換到年終規則', async () => {
      hasPermissionMock.mockImplementation((p: string) => p === 'APPRAISAL_READ' || p === 'SETTINGS_READ')
      const { w, router } = await mountAt('/appraisal-year-end/rules/scoring')
      const pushSpy = vi.spyOn(router, 'push')
      expect(w.findComponent({ name: 'ElSegmented' }).exists()).toBe(true)
      w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'year-end')
      await flushPromises()
      expect(pushSpy).toHaveBeenCalledWith('/appraisal-year-end/rules/year-end-rules')
    })
  })

  it('path=.../year-end-rules 渲染年終規則子頁且 tabs active=year-end-rules', async () => {
    const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
    expect(w.find('.stub-year-end-rules').exists()).toBe(true)
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('year-end-rules')
  })

  it('tab-change 觸發 router.push 到對應子路由', async () => {
    const { w, router } = await mountAt('/appraisal-year-end/rules/scoring')
    const pushSpy = vi.spyOn(router, 'push')
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'catalog')
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledWith('/appraisal-year-end/rules/catalog')
  })

  it('tab-change 傳入目前 tab 名稱時不重覆 push', async () => {
    const { w, router } = await mountAt('/appraisal-year-end/rules/scoring')
    const pushSpy = vi.spyOn(router, 'push')
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'scoring')
    await flushPromises()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('只有 SETTINGS_READ（無 APPRAISAL_READ）→ 只顯示年終規則分頁', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')
    const { w } = await mountAt('/appraisal-year-end/rules/year-end-rules')
    const panes = w.findAllComponents({ name: 'ElTabPane' })
    expect(panes.map((p) => p.props('name'))).toEqual(['year-end-rules'])
  })

  // Task 4 審查裁決 #2：activeTab fallback 不可寫死 'scoring'（該頁需 APPRAISAL_READ），
  // 只持 SETTINGS_READ 時若因故落在此 fallback 分支，須落在使用者實際看得到的第一個分頁。
  it('只有 SETTINGS_READ 時 activeTab fallback 落在 year-end-rules（非寫死 scoring）', async () => {
    hasPermissionMock.mockImplementation((p: string) => p === 'SETTINGS_READ')
    // 掛在無 leaf segment 的 bare 'rules' 路徑，模擬 route.path.split('/')[3] 為 undefined 的情境
    const { w } = await mountAt('/appraisal-year-end/rules')
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('year-end-rules')
  })

  // Task B5：規則變更影響提示——頂部常駐 OPEN 週期 banner。
  describe('OPEN 週期 banner', () => {
    it('無 OPEN 週期時不顯示 banner', async () => {
      listAppraisalCyclesMock.mockResolvedValue({ data: [{ id: 2, status: 'CLOSED' }] })
      const { w } = await mountAt('/appraisal-year-end/rules/scoring')
      expect(w.find('[data-test="open-cycle-alert"]').exists()).toBe(false)
    })

    it('有 OPEN 週期時顯示 banner 且含週期 ID 與「前往重算」連結', async () => {
      listAppraisalCyclesMock.mockResolvedValue({
        data: [{ id: 9, status: 'OPEN' }, { id: 8, status: 'CLOSED' }],
      })
      const { w } = await mountAt('/appraisal-year-end/rules/scoring')
      const alert = w.find('[data-test="open-cycle-alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain('9')
      expect(alert.text()).toContain('重算')
      const link = w.find('.rules-open-cycle-alert__link')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('/appraisal-year-end/appraisal')
    })

    it('listAppraisalCycles 失敗時不顯示 banner（靜默回退，不干擾主流程）', async () => {
      listAppraisalCyclesMock.mockRejectedValue(new Error('network error'))
      const { w } = await mountAt('/appraisal-year-end/rules/scoring')
      expect(w.find('[data-test="open-cycle-alert"]').exists()).toBe(false)
    })
  })

  // Task B7：不可寫 tab 顯示「唯讀（需 XX 權限）」徽章。權限矩陣測試鐵律——
  // 5 個分頁各自對齊「真實」寫入權限字串（B4 已向後端核實，非猜測）：
  //   scoring/catalog → APPRAISAL_RULE_WRITE；bonus-rates/enrollment-targets → APPRAISAL_FINALIZE；
  //   year-end-rules → SETTINGS_WRITE 且 ACTIVITY_PAYMENT_APPROVE（雙權限）。
  // 用可調 permState 逐一切換各權限組合，禁止只用單一 hasPermission:()=>true 帶過
  // （否則把 bonus-rates 誤標成 APPRAISAL_RULE_WRITE 這種權限分歧 bug 測不出來）。
  describe('唯讀徽章（tab 標題旁，Task B7）', () => {
    type PermKey =
      | 'APPRAISAL_RULE_WRITE'
      | 'APPRAISAL_FINALIZE'
      | 'SETTINGS_WRITE'
      | 'ACTIVITY_PAYMENT_APPROVE'

    // 讀權限固定給滿（APPRAISAL_READ/SETTINGS_READ）讓 5 個分頁全部可見，
    // 只變動「寫」權限組合，聚焦徽章顯隱邏輯本身。
    function setWritePerms(perms: Partial<Record<PermKey, boolean>>) {
      const writeState: Record<PermKey, boolean> = {
        APPRAISAL_RULE_WRITE: false,
        APPRAISAL_FINALIZE: false,
        SETTINGS_WRITE: false,
        ACTIVITY_PAYMENT_APPROVE: false,
        ...perms,
      }
      hasPermissionMock.mockImplementation((p: string) => {
        if (p === 'APPRAISAL_READ' || p === 'SETTINGS_READ') return true
        return writeState[p as PermKey] ?? false
      })
    }

    // 頁籤分列兩邊後，同一個 wrapper 看不到全部 6 個頁籤；矩陣測試同時掛考核側與年終側，
    // 依頁籤所屬邊取對應 wrapper，維持「逐一頁籤驗證徽章」的鐵律。
    const APPRAISAL_SIDE = ['scoring', 'bonus-rates', 'catalog', 'enrollment-targets']
    async function mountSides() {
      const appraisal = await mountAt('/appraisal-year-end/rules/scoring')
      const yearEnd = await mountAt('/appraisal-year-end/rules/year-end-rules')
      const pick = (tabName: string) => (APPRAISAL_SIDE.includes(tabName) ? appraisal.w : yearEnd.w)
      return {
        label: (tabName: string) => pick(tabName).find(`[data-test="tab-label-${tabName}"]`),
        badgeIn: (tabName: string) =>
          pick(tabName).find(`[data-test="tab-label-${tabName}"] [data-test="readonly-badge"]`),
      }
    }

    it('全持 4 個寫入權限 → 5 個分頁皆無徽章', async () => {
      setWritePerms({
        APPRAISAL_RULE_WRITE: true,
        APPRAISAL_FINALIZE: true,
        SETTINGS_WRITE: true,
        ACTIVITY_PAYMENT_APPROVE: true,
      })
      const { badgeIn } = await mountSides()
      for (const name of ['scoring', 'bonus-rates', 'catalog', 'enrollment-targets', 'year-end-rules']) {
        expect(badgeIn(name).exists()).toBe(false)
      }
    })

    it('全無寫入權限 → 5 個分頁皆顯示徽章，文案含各自對應的權限白話名', async () => {
      setWritePerms({})
      const { label } = await mountSides()
      expect(label('scoring').text()).toContain('唯讀（需考核規則設定權限）')
      expect(label('bonus-rates').text()).toContain('唯讀（需考核核定權限）')
      expect(label('catalog').text()).toContain('唯讀（需考核規則設定權限）')
      expect(label('enrollment-targets').text()).toContain('唯讀（需考核核定權限）')
      expect(label('year-end-rules').text()).toContain('唯讀（需年終規則設定權限）')
    })

    it('只有 APPRAISAL_RULE_WRITE → scoring/catalog 無徽章，其餘 3 頁仍唯讀（防止與 APPRAISAL_FINALIZE 混用）', async () => {
      setWritePerms({ APPRAISAL_RULE_WRITE: true })
      const { badgeIn } = await mountSides()
      expect(badgeIn('scoring').exists()).toBe(false)
      expect(badgeIn('catalog').exists()).toBe(false)
      expect(badgeIn('bonus-rates').exists()).toBe(true)
      expect(badgeIn('enrollment-targets').exists()).toBe(true)
      expect(badgeIn('year-end-rules').exists()).toBe(true)
    })

    it('只有 APPRAISAL_FINALIZE → bonus-rates/enrollment-targets 無徽章，scoring/catalog/year-end-rules 仍唯讀', async () => {
      setWritePerms({ APPRAISAL_FINALIZE: true })
      const { badgeIn } = await mountSides()
      expect(badgeIn('bonus-rates').exists()).toBe(false)
      expect(badgeIn('enrollment-targets').exists()).toBe(false)
      expect(badgeIn('scoring').exists()).toBe(true)
      expect(badgeIn('catalog').exists()).toBe(true)
      expect(badgeIn('year-end-rules').exists()).toBe(true)
    })

    it('year-end-rules 雙權限只滿足 SETTINGS_WRITE（缺 ACTIVITY_PAYMENT_APPROVE）→ 仍顯示唯讀徽章', async () => {
      setWritePerms({ SETTINGS_WRITE: true })
      const { badgeIn } = await mountSides()
      expect(badgeIn('year-end-rules').exists()).toBe(true)
    })

    it('year-end-rules 雙權限只滿足 ACTIVITY_PAYMENT_APPROVE（缺 SETTINGS_WRITE）→ 仍顯示唯讀徽章', async () => {
      setWritePerms({ ACTIVITY_PAYMENT_APPROVE: true })
      const { badgeIn } = await mountSides()
      expect(badgeIn('year-end-rules').exists()).toBe(true)
    })

    it('year-end-rules 雙權限皆滿足 → 無徽章', async () => {
      setWritePerms({ SETTINGS_WRITE: true, ACTIVITY_PAYMENT_APPROVE: true })
      const { badgeIn } = await mountSides()
      expect(badgeIn('year-end-rules').exists()).toBe(false)
    })
  })
})
