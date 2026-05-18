/**
 * 勞基法合規相關常數
 * 後端 source of truth：services/salary/minimum_wage.py
 * 變動時需同步前後端常數（這裡僅作為 inline 提示用，後端 validate_minimum_wage 才是強制 gate）
 */

export const MINIMUM_MONTHLY_WAGE = 29500
export const MINIMUM_HOURLY_WAGE = 196
export const PENSION_SELF_RATE_MAX = 0.06  // 勞退條例第 14 條第 3 項
