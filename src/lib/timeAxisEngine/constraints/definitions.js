/**
 * constraints/definitions.js — 制約定義データ（宣言的ルール）
 *
 * 設計書 v1.3 §3 に準拠。
 * penalty値・制約IDは設計書と完全一致させる（変更禁止）。
 *
 * 【nightSetPattern の enabledWhen について】
 *   設計書は `getShiftDefinition(dept, '夜勤') !== null` を指定しているが、
 *   '夜勤' は DEFAULT_SHIFT_TIMES に定義されているため、この式は
 *   どの部署でも常に true を返し、条件付き無効化が機能しない。
 *   → `(dept.shiftTypes || []).includes('夜勤')` で代替実装。
 *   設計書 §3 の意図（「夜勤がない部署では無効」）はこの実装で正しく満たされる。
 *   設計書の次改訂時に enabledWhen の記述を修正することを推奨。
 */

// ── 制約定義リスト ─────────────────────────────────────────────────────────────
export const constraintDefinitions = [

  // ═══════════════════════════════════════════════════════════════════════════
  // Hard制約（いかなる緩和でも破れない）
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'nightSetPattern',
    hardness: 'hard',
    description: '夜勤→明け→休みパターンの強制',
    // 夜勤シフトが部署に存在する場合のみ有効。
    // 注: 設計書は getShiftDefinition(dept,'夜勤')!==null を指定するが、
    //     DEFAULT_SHIFT_TIMES のフォールバックにより常にtrueになるため
    //     dept.shiftTypes で判定する（設計意図に合致）。
    enabledWhen: dept => (dept.shiftTypes || []).includes('夜勤'),
  },

  {
    id: 'minInterval',
    hardness: 'hard',
    description: '勤務間インターバル下限（dept.intervalThreshold 時間）',
    // 介護の「遅番→早番禁止」もこの制約の一形態。
    // dept.intervalThreshold が null/undefined の場合、rules/ 側で無効化する。
  },

  {
    id: 'roleAllowedShifts',
    hardness: 'hard',
    description: '役職別に許可されたシフト種別のみ配置可（dept.roleShiftTypes）',
    // データ形式は介護エンジンと完全互換:
    //   dept.roleShiftTypes = { "介護補助": ["日勤"], ... }
    //   全チェック = エントリなし = 制限なし
  },

  {
    id: 'requestLock',
    hardness: 'hard',
    description: '希望休・有休・希望勤務のロック',
    // 参照元: kiboByMonth / yukyuByMonth / shiftRequestsByMonth
    // （getLockedRequest / buildRequests 経由でアクセス）
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Soft制約（penalty昇順 = 先に緩和される順）
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'shiftRatio',
    hardness: 'soft',
    penalty: 10,
    description: 'スタッフ別シフト比率の維持',
    // 比率のズレは月内で許容しやすい（最初に緩和）
  },

  {
    id: 'fairness',
    hardness: 'soft',
    penalty: 20,
    fairnessTolerance: 2, // チーム平均を何件超えたら違反（fairness.js が参照する唯一の定義元）
    description: '公平性（シフト種別回数の偏り）',
    // 偏りは翌月で調整できる
  },

  {
    id: 'maxConsecutive',
    hardness: 'soft',
    penalty: 30,
    description: '最大連続勤務日数（dept.maxConsecutive）',
    // 連勤+1日はやむを得ない場合がある
  },

  {
    id: 'maxStaff',
    hardness: 'soft',  // dept.maxStaffRelaxable=false なら hard に昇格（resolveConstraints で処理）
    penalty: 50,
    description: 'シフト種別ごとの上限人数（早番1人など）',
    // データは実DB形式 dept.maxStaff[shiftKey] をそのまま使う（改名・移行なし）
    // dept.maxStaffRelaxable（デフォルト true）:
    //   true  = Soft扱い。充足不能時に最後の手段として超過を許す（栄養科向け）
    //   false = Hard扱い。絶対に超過しない（介護のような厳格運用向け）
  },
];

// ── resolveConstraints ─────────────────────────────────────────────────────────
/**
 * 部署設定を受け取り、有効な制約定義の解決済みリストを返す。
 *
 * 処理内容:
 *   1. enabledWhen が定義されている制約を部署設定でフィルタリング
 *   2. maxStaff を dept.maxStaffRelaxable=false の場合に hard へ昇格
 *
 * @param {object} dept  部署設定オブジェクト
 * @returns {object[]}   有効な制約定義の配列（元の定義を変更しないシャローコピー）
 */
export function resolveConstraints(dept) {
  return constraintDefinitions
    .filter(c => !c.enabledWhen || c.enabledWhen(dept))
    .map(c => {
      if (c.id === 'maxStaff' && dept.maxStaffRelaxable === false) {
        return { ...c, hardness: 'hard' };
      }
      return c;
    });
}

// ── ユーティリティ ─────────────────────────────────────────────────────────────
/**
 * 解決済みリストから Hard制約のみ取得する
 * @param {object[]} resolved  resolveConstraints() の返値
 * @returns {object[]}
 */
export function getHardConstraints(resolved) {
  return resolved.filter(c => c.hardness === 'hard');
}

/**
 * 解決済みリストから Soft制約を penalty 昇順で取得する（緩和順）
 * @param {object[]} resolved  resolveConstraints() の返値
 * @returns {object[]}
 */
export function getSoftConstraintsByPenalty(resolved) {
  return resolved.filter(c => c.hardness === 'soft').sort((a, b) => a.penalty - b.penalty);
}
