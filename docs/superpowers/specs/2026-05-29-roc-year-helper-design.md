# 民國年換算收編進 academic.ts

**日期**：2026-05-29
**範圍**：純前端
**對應 audit finding**：P2「民國年計算分散 15+ 處，無 helper、無邊界守衛」

## 校正：audit 前提已過時

`src/utils/academic.ts` **已存在**（`getCurrentAcademicTerm` / `normalizeSchoolYear` /
`buildSchoolYearOptions`），但缺 `- 1911` / `+ 1911` 的具名原語，導致 magic number
仍散落 10 個 call site。本次只補原語 + 收編，非「建 helper」。

## 解法

`academic.ts` 新增 4 個具名原語（取代散落的 `1911`）：
- `ROC_OFFSET = 1911`
- `toRocYear(adYear)` = adYear - 1911
- `toAdYear(rocYear)` = rocYear + 1911
- `currentRocYear()` = toRocYear(當前西元年)
- `coerceRocYear(value)` = `value > 1911 ? toRocYear(value) : value`（容錯：來源可能 AD 或 ROC）

並把 `getCurrentAcademicTerm` 內部改用 `toRocYear`（behavior-preserving，既有 15 測試不變）。

10 個 call site 改用對應 helper（皆 behavior-preserving 機械替換）：
- AD→ROC：FeeGenerateModal / FeeTemplateTab / FunnelBoard（`currentRocYear()`）、
  LeavesView / RecruitmentRecordDialog ×2（`toRocYear`）
- 容錯：EnrollmentRosterTable / StudentEnrollmentView ×2（`coerceRocYear`）
- ROC→AD：RecruitmentView ×2 / CurrentSemesterOverview / YearlyEnrollmentTargetSection（`toAdYear`）

## 測試 / 驗證

- `academic.test.js` 新增 6 案（toRocYear / toAdYear / 互逆 / currentRocYear / coerceRocYear ×2），
  既有 15 案不變 → 21 passed。
- typecheck 0（`noUnusedLocals:true` 證每個新 import 都被使用）。
- grep `1911` 殘留僅 `academic.ts`（ROC_OFFSET + docstring）。
- 5 個有測試的受影響元件 36 passed，零回歸。

## 不做

- i18n / 中文大寫；後端 `utils/roc_year.py` 對稱 helper + CI contract test（audit 另提）為 follow-up。
