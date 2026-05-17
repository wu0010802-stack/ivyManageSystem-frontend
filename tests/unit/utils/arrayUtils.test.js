import { describe, it, expect } from 'vitest'
import { toggleArrayItem } from '@/utils/arrayUtils'

describe('toggleArrayItem()', () => {
  it('不存在則加入到尾端', () => {
    const arr = ['a', 'b']
    toggleArrayItem(arr, 'c')
    expect(arr).toEqual(['a', 'b', 'c'])
  })

  it('已存在則移除', () => {
    const arr = ['a', 'b', 'c']
    toggleArrayItem(arr, 'b')
    expect(arr).toEqual(['a', 'c'])
  })

  it('空陣列加入第一個元素', () => {
    const arr = []
    toggleArrayItem(arr, 'x')
    expect(arr).toEqual(['x'])
  })

  it('直接 mutate 原陣列（無 return）', () => {
    const arr = ['a']
    const result = toggleArrayItem(arr, 'b')
    expect(result).toBeUndefined()
    expect(arr).toEqual(['a', 'b'])
  })

  it('連續呼叫達到「切換」效果', () => {
    const arr = ['x']
    toggleArrayItem(arr, 'y') // ['x','y']
    toggleArrayItem(arr, 'y') // ['x']
    toggleArrayItem(arr, 'y') // ['x','y']
    expect(arr).toEqual(['x', 'y'])
  })

  it('只移除第一個符合的（splice idx, 1）', () => {
    // 注意：indexOf 取第一個匹配
    const arr = ['a', 'b', 'a']
    toggleArrayItem(arr, 'a')
    expect(arr).toEqual(['b', 'a'])
  })

  it('支援數值型 item', () => {
    const arr = [1, 2, 3]
    toggleArrayItem(arr, 2)
    expect(arr).toEqual([1, 3])
    toggleArrayItem(arr, 4)
    expect(arr).toEqual([1, 3, 4])
  })
})
