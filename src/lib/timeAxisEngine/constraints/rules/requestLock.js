/**
 * requestLock.js — 希望休・有休・希望勤務のロック（Hard制約）
 *
 * validateShift.js から移植。挙動変更なし。
 * ロックなし日は即座に ok を返す。
 */

import { getLockedRequest } from '../../../shiftAccessors.js';

const RULE = 'requestLock';

/**
 * 指定スタッフ・指定日のシフトが希望ロックと一致するか検証する。
 *
 * context:
 *   requests  buildRequests() の返値
 *             { [staffId]: { [day: number]: { type, shiftKey } } }
 *
 * @returns {Array<{ ok: boolean, rule: string, detail?: string, expected?: string[], actual?: string }>}
 */
export function check(staffId, date, shiftKey, context) {
  const { requests } = context;

  const lock = getLockedRequest(staffId, date, requests);
  if (!lock) return [];

  if (shiftKey === lock.shiftKey) return [];

  const detail = lock.type === 'kiboRest' ? '希望休が上書きされています'
               : lock.type === 'yukyu'    ? '有休が上書きされています'
               : `希望勤務(${lock.shiftKey})が反映されていません`;

  return [{
    ok:       false,
    rule:     RULE,
    detail,
    expected: [lock.shiftKey],
    actual:   shiftKey ?? '(空欄)',
  }];
}
