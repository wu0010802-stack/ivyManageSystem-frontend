/** 全管道彙整：內部訪視（funnel_snapshot）+ 官網報名（ivykids totals）並列 + 合計。 */
export interface ChannelCounts {
  visit: number
  deposit: number
  enrolled: number
}
export interface CombinedChannels {
  internal: ChannelCounts
  ivykids: ChannelCounts
  total: ChannelCounts
}

interface InternalSnapshot {
  visit?: number
  deposit?: number
  enrolled?: number
}
interface IvykidsStats {
  total_visit?: number
  total_deposit?: number
  total_enrolled?: number
}

const n = (x: unknown): number => (typeof x === 'number' ? x : 0)

export function combineChannels(
  internal: InternalSnapshot | undefined,
  ivykids: IvykidsStats | undefined,
): CombinedChannels {
  const i: ChannelCounts = {
    visit: n(internal?.visit),
    deposit: n(internal?.deposit),
    enrolled: n(internal?.enrolled),
  }
  const k: ChannelCounts = {
    visit: n(ivykids?.total_visit),
    deposit: n(ivykids?.total_deposit),
    enrolled: n(ivykids?.total_enrolled),
  }
  return {
    internal: i,
    ivykids: k,
    total: {
      visit: i.visit + k.visit,
      deposit: i.deposit + k.deposit,
      enrolled: i.enrolled + k.enrolled,
    },
  }
}
