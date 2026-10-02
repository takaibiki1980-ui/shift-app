/**
 * 生成後「ペア交換」（同じ日の早番の人と遅番の人を、学習傾向に合わせて交換）の純粋ロジック。
 *
 * 生成・core.js 本体の配置ロジックには非関与。PR-1 はこの純粋関数とテストのみ（配線は PR-3）。
 *
 * 設計: engine 依存の判定（遷移禁止/強制の再チェック・個別ロック・スロット数）は呼び出し側(PR-3)で
 *   行い、その結果を真偽値で受け取る。本モジュールは「学習ゲイン計算」「公平性ガード」「最終合成」
 *   のみを担い、単体テスト可能にする（遷移強制 transitionForces.js と同じ思想）。
 *
 * 前提となる安全性（PR-3 で担保）:
 *   - 同じ日の「早番1・遅番1」を入れ替えるだけ → その日のスロット構成・早番/遅番の総数は不変
 *     ＝ minStaff/maxStaff・カバレッジは構造上不変。勤務↔勤務のため連勤・公休も不変。
 *   - 変わるのは「誰がどちらの種別か」＝個人×曜日の割当（学習に寄せる）と、個人別の早番総数（公平性）。
 */

export const DEFAULT_FAIRNESS_TOL = 3; // 公平性許容幅（早番総数の 最大-最小 の上限）

/**
 * 交換による学習一致(soft)の増分。>0 なら交換で学習が向上する。
 * @param {number} rEarlyStaff_early 現在の「早番担当」の その曜日の早番率
 * @param {number} rLateStaff_late   現在の「遅番担当」の その曜日の遅番率
 * @param {number} rEarlyStaff_late  早番担当の 遅番率（交換後に担当する種別）
 * @param {number} rLateStaff_early  遅番担当の 早番率（交換後に担当する種別）
 * @returns {number} (交換後の合計) - (交換前の合計)
 */
export function swapLearningGain(rEarlyStaff_early, rLateStaff_late, rEarlyStaff_late, rLateStaff_early) {
  const before = (rEarlyStaff_early || 0) + (rLateStaff_late || 0);
  const after = (rLateStaff_early || 0) + (rEarlyStaff_late || 0);
  return after - before;
}

/**
 * 交換後の公平性が許容幅内か。交換で「早番担当は早番-1」「遅番担当は早番+1」になるため、
 * 更新後の早番回数配列の (最大-最小) が tol 以下なら OK。
 * @param {number[]} earlyCounts 各スタッフの現在の早番回数
 * @param {number} earlyIdx 現在の早番担当の index（早番 -1 になる）
 * @param {number} lateIdx  現在の遅番担当の index（早番 +1 になる）
 * @param {number} tol 許容幅（既定 DEFAULT_FAIRNESS_TOL）
 * @returns {boolean} 非破壊
 */
export function fairnessOkAfterSwap(earlyCounts, earlyIdx, lateIdx, tol = DEFAULT_FAIRNESS_TOL) {
  if (!Array.isArray(earlyCounts) || earlyCounts.length === 0) return true;
  if (earlyIdx == null || lateIdx == null || earlyIdx === lateIdx) return false;
  const next = earlyCounts.slice();
  next[earlyIdx] = (next[earlyIdx] || 0) - 1;
  next[lateIdx] = (next[lateIdx] || 0) + 1;
  const spread = Math.max(...next) - Math.min(...next);
  return spread <= tol;
}

/**
 * ペア交換の最終判定。engine 側で確認した各ガードの真偽を合成し、1つでも NG なら交換しない。
 * @param {Object} a
 * @param {number}  a.gain        swapLearningGain の結果
 * @param {boolean} a.locked      いずれかのセルが個別希望でロックされている（true→交換不可）
 * @param {boolean} a.coverageOk  minStaff/maxStaff を満たす（同スロット交換なら true）
 * @param {boolean} a.transitionOk 交換後の両セルで 遷移禁止/強制 に触れない
 * @param {boolean} a.fairnessOk  公平性が許容幅内
 * @param {number}  [a.eps]       学習ゲインの下限（既定 1e-9）
 * @returns {boolean} 交換してよいなら true
 */
export function shouldSwapPair({ gain, locked, coverageOk, transitionOk, fairnessOk, eps = 1e-9 }) {
  if (locked) return false;
  if (!coverageOk) return false;
  if (!transitionOk) return false;
  if (!fairnessOk) return false;
  return (gain || 0) > eps;
}
