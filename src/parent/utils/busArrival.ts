import { formatTaipeiClock, parseTaipeiDate } from '@/utils/taipeiTime'

const MINUTE_MS = 60_000

/** 台北 ETA 轉剩餘分鐘；到期只表示需要更新，不代表已抵達。 */
export function busArrivalEstimate(eta: string | null | undefined, now: number): {
  minutes: number | null
  clock: string | null
} {
  const arrival = parseTaipeiDate(eta)
  const clock = formatTaipeiClock(eta)
  const remaining = arrival ? arrival.getTime() - now : 0
  return { minutes: remaining > 0 ? Math.ceil(remaining / MINUTE_MS) : null, clock }
}
