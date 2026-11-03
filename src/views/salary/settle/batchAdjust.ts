/** 批次調整對話框與覆核頁共用的型別。 */

export type BatchMode = 'set' | 'add' | 'sub'

/** 每個人要送出的「絕對值」（加／減已在對話框依現值換算好）。 */
export interface BatchItem {
    id: number
    version: number | undefined
    value: number
}

/** 上一次套用失敗的人（留在對話框讓使用者確認後再套用）。 */
export interface BatchFailure {
    id: number
    name: string
    reason: string
}
