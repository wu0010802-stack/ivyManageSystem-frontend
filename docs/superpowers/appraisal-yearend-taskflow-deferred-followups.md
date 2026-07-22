# 考核與年終 任務流重構（批次 1+2a+2b-1+2b-2）— 延後項與 prod 前參考

> 2026-07-21 整理。四批 35 task 已升 staging（BE `d6002297` / FE `d2c80240`），待 staging 實機驗證 → 升 prod。
> 下列**延後 Minor 皆經 per-task review + 兩端最終全分支審查（opus 金流 + opus/sonnet FE）判定「可延後、不阻擋合併」**，無一為 Critical/Important。此文件供升 prod 前 triage，可全部留待後續小批次。

---

## A. 升 staging 衝突解析的取捨（**唯一需要你知曉的實質項**）

FE 升 staging 時，`YearEndConfigView.vue` 與 `YearEndGridView.vue` 兩檔的 import 區與 admin 批次的 `f4ebb2dd`（錯誤訊息全站化 `friendlyError`）衝突。因我們的年終重寫改寫了同一批 error 行，解衝突時**取我們的版本** → 這 2 檔**暫時失去 `friendlyError` 錯誤訊息潤飾**（其餘全站 friendlyError 不受影響）。

- **影響**：這 2 頁的 failure toast 用回較舊的 `apiError`（ConfigView）或 inline 訊息（GridView），少了「原因＋下一步」的統一格式。
- **建議**：後續小 follow-up 把 `friendlyError` 重新套回這 2 檔的 error handler（各約 3 處）。非阻擋、不影響功能。

---

## B. 真正延後的 Minor（follow-up 清單，全部可留待後續）

### BE（`feat/yearend-settlement-reject`）

| # | 項目 | 性質 | 判定理由 |
|---|------|------|---------|
| B1 | `tests/test_institution_events_migration.py:60` docstring 歷史軌跡未接 yereject01 一行 | 純文件 | 功能斷言已正確更新，只差敘述性註解 |
| B2 | reject 端點取鎖後未複驗 cycle 狀態（極窄 TOCTOU） | 硬化 | 近零實害：最壞是一筆 DRAFT 落在剛 LOCKED 的 cycle，無金額錯算/無 SoD 繞過；與 sign 端點同類既有 race。若補：取鎖後重讀 cycle 再 `assert_cycle_writable` |
| B3 | 班級批次儲存只 catch `HTTPException`；bad FK 的 `IntegrityError` 會 rollback 整批（500）而非部分成功；`failed[]` 目前恆空 | 硬化 | UI 只送有效 classroom_id，實務不觸發；真部分成功需 per-row `begin_nested()` savepoint |
| B4 | 班級批次與單列端點 4 行 cycle-lookup+guard 重複 | DRY | 可抽 `_get_writable_cycle` helper |
| B5 | 例外/通知 deep_link 路徑前綴 `/appraisal-year-end/year-end/cycles/` 硬編重複 5 處 | DRY | 既有模式；有字串測試釘住，漂移會被抓 |
| B6 | provenance 多 item 同型聚合：itemized(超額/教課)、dividend(紅利) 無專屬雙-item 測試 | 測試覆蓋 | 共用 `_sum_special_bonus` 已由 appraisal/after_class 的多-item 測試雙向覆蓋 |
| B7 | provenance after_class「Σ!=value 補調整列」防禦分支不可觸發、無測試 | 死防禦碼 | amount=item.amount 故 Σ 恆等，該分支打不到 |
| B8 | provenance dividend formula_summary 在 calc_meta 缺 key 的防禦路徑文字（+0.00）與實際 value 不一致 | 純顯示 | 僅防禦路徑；value/Σ 正確 |
| B9 | provenance label 措辭與 plan 字面小差（「才藝班獎金」vs「班級 J×K」等） | 純文字 | 語意等價，測試用 substring |

### FE（`feat/appraisal-yearend-taskflow-uiux`）

| # | 項目 | 性質 | 判定理由 |
|---|------|------|---------|
| F1 | `YearEndDetailView.reject.spec.ts` 未使用 import `vi`/`beforeEach` | 清潔 | eslint 未啟 no-unused-vars，不阻擋 |
| F2 | `RuleEditorDialog` 兩套 hint token vocab（`--text-sm` vs `--el-text-color-secondary`） | 視覺 token | 兩者皆解析正常 |
| F3 | `YearEndListView` 匯入 dialog 預設在 setup 期算（非 openImport lazy）；`canImport` 雙重 v-if | 一致性 | staleness 風險極低；雙 v-if 冗餘無害 |
| F4 | 兩處 LOCKED banner 樣式 inline style vs class 不一致 | 視覺 | cosmetic |
| F5 | `WorkbenchAppraisalCard` 空狀態「前往建立」連結無測試斷言 | 測試覆蓋 | 靜態 router-link，deriveNextStep 已測等價語意 |
| F6 | `loadHandles` 不論權限打兩把手 API → 缺 `APPRAISAL_READ` 者主卡跳「部分載入失敗」 | UX 殘留 | 純顯示；權限不足者本就看不到該卡。若補：把手 fetch 依權限 gate |
| F7 | shell 手寫 `interface CycleProgress`/`YearEndCycle` + `as` 斷言（vs generated schema）；`cycleId` setup-once（workspace→workspace 只變 param latent，現無此入口不觸發） | 型別/latent | BE 加欄時 shell 那份會靜默過時；對齊成本低 |
| F8 | `YearEndGridView.spec` 死 `useRoute` mock（三 view 改 prop 後） | 清潔 | 死碼、不影響 |
| F9 | `loadProgress` 無 request-sequence guard（清單快速重整）；`activeKey startsWith('.../payout')` 未來 `payout-history` 誤判（現無此路由）；進度欄 el-progress percentage 未斷言 | 韌性/測試 | 冪等低風險 |
| F10 | Detail 自身 `cycle` 副本在 shell 狀態轉換後不自動刷新 → `canReject` OPEN gate 用 stale status | UI 殘留 | BE `assert_cycle_writable` 已擋真實退回；若補：shell 對 sub-view 掛 `:key="cycle?.status"` |
| F11 | grid「特別獎金合計」欄勾 chip 後排在動態獎金欄之後（非緊接主結算）；chips 斷言用欄數計數非 label | 版面/測試 | 不影響零橫捲或正確性 |
| F12 | grid「開始試算」CTA 在 LOCKED/CLOSED 隱藏缺負向測試 | 測試覆蓋 | 行為正確、缺鎖住的測試 |
| F13 | `PROVENANCE_BONUS_KEYS` raw hex 樣式（`#f5f5f5` 等） | 視覺 token | 既有模式 |

---

## C. 過程中審查抓出並已修的 Important（僅供記錄，非行動項）

- **BE reject 併發 identity-map bug**：`session.get()` 後 `with_for_update()` 未刷新 → 取鎖後重驗失效（財務快取該失效沒失效/SoD 窄視窗繞過）。修：`.populate_existing()` + 併發回歸測試。
- **FE 工作台部分權限主卡永久 skeleton**：缺 `APPRAISAL_FINALIZE` 者 payout 卡不 render→never emit→`deriveNextStep` 回 null→skeleton。修：權限隱藏卡 seed 0 + 建立引導吃權限。
- **FE 封存前置檢核 fail-open**：重構把原子載入拆開後 progress 未載入時 `?? 0` 靜默放行封存。修：`progress==null` fail-closed。
- **FE 批次簽核只顯計數**：修為逐筆姓名+原因。
- **FE grid 抽屜 finite 守衛**：BE 缺欄時 NaR 架空 no-op 守衛。修：`Number.isFinite` fallback 0。
- **FE 誤導測試**：provenance 7-key gate 測試標題與行為相反。修：補函式層 guard + 測試改真呼叫（RED→GREEN 驗證）。

---

## D. Pre-existing 紅（**非本次引入，勿誤判**）

- `tests/test_year_end_settlement_builder.py::test_guo_partial_year_deductions_and_special` — main/staging 亦紅，已多次確認。
- `tests/test_activity_query_token_v3_2026_07_14.py` 2 支 — 直接載入特定 migration 檔跑 fresh SQLite，與本批次/yereject01 無關。
- FE typecheck 11 紅全在 `IntegrationsHealthCard.vue`（supabase 欄位移除未同步，屬 `fix/integrations-health-storage-field` 平行分支）。

---

## 升 prod 前提醒

1. **staging 實機驗證**整條年終動線（工作區導軌/grid 摘要+chips+抽屜就地編輯/獎金「怎麼算的」下鑽/退回死路/封存前置檢核/清單進度欄/payout 入口）。
2. **升 prod（staging→main）前逐筆核對 `main..staging`** 只含已驗證工作（staging 是共用分支、含多平行 session commit）。
3. prod cold-start 跑 alembic migration——本批次 migration 僅 `yereject01`（已在 staging DB），單一 head。
4. 升 prod 後移除 feature worktree `feat-yereject`/`feat-ayx-taskflow`。

---

## 批次 3（考核流程 + 規則設定，2026-07-22 完成）延後 follow-up

全部非阻擋，最終全分支審查判為 follow-up。

### 需另開任務 / 待業主口徑
- **A3 authz（建議另開獨立任務）**：為 `CurrentSemesterOverview.vue` 全部寫入型動作補元件層 `hasPermission` 守衛——涵蓋引導條 `recompute`（reloadAll→POST refresh）、既有「重新整理」按鈕、以及進頁 `watch(termStore,{immediate})` 的 auto-refresh。目前只讀使用者觸發後端會 403、前端顯 stale banner 降級（不崩不洩漏），無新攻擊面；piecemeal 只補引導條反而不一致，故整體處理。
- **PenaltyCatalog 目錄停用「確認 + 原因」**：spec §5.2 將「目錄停用」列入統一「確認+原因」組，但後端 catalog PATCH 無 reason/audit 欄位（填了不存＝theater），B4 刻意只用 `ElMessageBox.confirm`。待業主決定是否為一致性加前端原因（會被丟棄）。

### 純整潔 / UI 一致性（低優先）
- A1：`deriveAppraisalStepStatuses` 與 `deriveCurrentAppraisalStep` done/todo 判斷雙軌，可收斂單一狀態機；`AppraisalStepInput.cycleStatus` 死欄位可移除。
- A6：`assertGroupsCoverAllCodes` 可加 `import.meta.env.DEV` runtime 防呆；`colIndexOf` 可改一次性 `Map`。
- B2：`RuleHistoryDrawer.spec.js` 補元件層斷言（`data-test="rule-summary-lines"` / `el-collapse` 折疊）。
- B3：`RuleEditorDialog` tier min（rate 型）補 `:min/:max/%` unit hint（correctness 已對）。
- B4：`YearlyEnrollmentTargetSection.spec.js` 轉 `.ts`。
- B5：OPEN 週期 banner 顯學年/學期（非只 cycle id）；「前往重算」改具名路由。
- B6：TargetCrossRef「來源」以可點連結取代 tooltip 文字；appraisal 側 org-target 亦橋接（目前恆 null）。
- B7：ReadonlyBadge doc typo「statelesss」；`permLabel` 中文字串在 TABS 與各面板去重為共用常數。
- B8：TIER 範例「留校率過低是否倒扣」極性待業主口徑。

### ⚠ plan/brief 已知錯誤（code 已正確，防未來照 brief 字面重做）
- 批次 3 plan `docs/superpowers/plans/2026-07-21-appraisal-yearend-batch3-process-rules.md` 的 **Task B3** 誤要求 RuleEditorDialog tier min 做 0-100↔0-1 換算（後端本就 0-100，換算會塌 TIER 到最低階）；**Task B4** 誤標 BonusRatesPanel 權限為 `APPRAISAL_RULE_WRITE`（實為 `APPRAISAL_FINALIZE`）。實作已修正並加 code 註解。
