import { describe, it, expect } from 'vitest'
import {
  priceFromList,
  buildSupplySnapshotMap,
  resolveSupplyPrice,
  sumCourseFees,
  sumSupplyFees,
} from '@/utils/activityPricing'

describe('priceFromList', () => {
  it('依名稱查價，price 字串/數字皆容錯', () => {
    const list = [
      { name: '圍棋', price: 1200 },
      { name: '畫畫', price: '800' }, // 字串容錯
      { name: '免費課', price: 0 },
    ]
    expect(priceFromList('圍棋', list)).toBe(1200)
    expect(priceFromList('畫畫', list)).toBe(800)
    expect(priceFromList('免費課', list)).toBe(0)
  })

  it('查無 / price 缺失 / NaN → 0（不爆、不誤計）', () => {
    expect(priceFromList('不存在', [{ name: '圍棋', price: 1200 }])).toBe(0)
    expect(priceFromList('無價', [{ name: '無價' }])).toBe(0)
    expect(priceFromList('壞價', [{ name: '壞價', price: 'abc' }])).toBe(0)
  })
})

describe('buildSupplySnapshotMap（既有用品 snapshot 價，含字串容錯）', () => {
  it('物件型 {name, price} 進 map；舊資料 string 型跳過', () => {
    const map = buildSupplySnapshotMap([
      { name: '畫具', price: 300 },
      '舊字串用品', // 舊資料容錯：純 string 不含價，不進 map
      { name: '免費贈品', price: 0 },
    ])
    expect(map.get('畫具')).toBe(300)
    expect(map.get('免費贈品')).toBe(0)
    expect(map.has('舊字串用品')).toBe(false)
  })
})

describe('resolveSupplyPrice（snapshot 優先、否則 option 價）', () => {
  const snapshot = buildSupplySnapshotMap([{ name: '畫具', price: 300 }])
  const options = [
    { name: '畫具', price: 500 }, // 後台調漲後的目前價
    { name: '新用品', price: 250 },
  ]

  it('既有品項：用 snapshot 價（300），不被後台調價影響', () => {
    expect(resolveSupplyPrice('畫具', snapshot, options)).toBe(300)
  })

  it('新增品項：snapshot 無 → 用目前 option 價（250）', () => {
    expect(resolveSupplyPrice('新用品', snapshot, options)).toBe(250)
  })

  it('snapshot 為 0（免費贈品）仍優先於 option 價', () => {
    const snap0 = buildSupplySnapshotMap([{ name: '贈品', price: 0 }])
    expect(resolveSupplyPrice('贈品', snap0, [{ name: '贈品', price: 999 }])).toBe(0)
  })
})

describe('sumCourseFees（只算 enrolled，候補/promoted 跳過）', () => {
  it('isEnrolled 回 false 的課不計入', () => {
    const total = sumCourseFees(
      ['圍棋', '畫畫', '足球'],
      {
        isEnrolled: (name) => name !== '畫畫', // 畫畫 候補不計
        resolvePrice: (name) => ({ 圍棋: 1200, 畫畫: 800, 足球: 600 }[name] ?? 0),
      },
    )
    // 1200 + 600（畫畫 800 被跳過）
    expect(total).toBe(1800)
  })

  it('全候補 → 0', () => {
    const total = sumCourseFees(['a', 'b'], {
      isEnrolled: () => false,
      resolvePrice: () => 1000,
    })
    expect(total).toBe(0)
  })
})

describe('sumSupplyFees（全選用品加總）', () => {
  it('用品全計入（無候補概念）', () => {
    const total = sumSupplyFees(['畫具', '新用品'], {
      resolvePrice: (name) => ({ 畫具: 300, 新用品: 250 }[name] ?? 0),
    })
    expect(total).toBe(550)
  })
})

describe('整合：編修模式（既有 snapshot 優先）vs 新報名模式（無 snapshot）', () => {
  it('編修：既有課用 snapshot 價，後台調漲不影響家長保留品項', () => {
    const existingCourses = [{ name: '圍棋', price: 1200, status: 'enrolled' }]
    const courseOptions = [{ name: '圍棋', price: 1500 }] // 後台調漲
    const total = sumCourseFees(['圍棋'], {
      isEnrolled: () => true,
      resolvePrice: (name) => {
        const existing = existingCourses.find((c) => c.name === name)
        return existing
          ? priceFromList(name, existingCourses) // snapshot
          : priceFromList(name, courseOptions)
      },
    })
    expect(total).toBe(1200) // 用 snapshot，非 1500
  })

  it('新報名：無既有品項，一律用目前 option 價', () => {
    const courseOptions = [{ name: '圍棋', price: 1500 }]
    const total = sumCourseFees(['圍棋'], {
      isEnrolled: () => true,
      resolvePrice: (name) => priceFromList(name, courseOptions),
    })
    expect(total).toBe(1500)
  })
})
