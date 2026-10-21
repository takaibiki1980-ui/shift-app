/**
 * 初回ログインでの profiles 行の自動作成 src/lib/ensureProfile.js のテスト（純粋・偽 supabase）。
 * 実名・実 id・実メールは使わず、仮の値で検証する。
 */
import { describe, test, expect, vi } from 'vitest';
import { ensureProfile, ensureProfileSafe, defaultProfile, profileFacilityName } from '../lib/ensureProfile.js';

const USER = { id: 'u-test-1', email: 'user1@example.test', user_metadata: {} };

// 偽 supabase を作る。select は seq の先頭から順に結果を返す。insert は insertResult を返す。
function fakeSupabase({ selectResults = [], insertResult = {}, onInsert } = {}) {
  const calls = { insert: [], selectCount: 0 };
  let i = 0;
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    maybeSingle() { calls.selectCount++; return Promise.resolve(selectResults[i++] ?? { data: null, error: null }); },
    insert(row) { calls.insert.push(row); if (onInsert) onInsert(row); return Promise.resolve(insertResult); },
  };
  return { api, calls };
}

describe('profileFacilityName / defaultProfile', () => {
  test('facility_name は メタデータ → 無ければメール', () => {
    expect(profileFacilityName({ email: 'a@example.test', user_metadata: { facility_name: '施設X' } })).toBe('施設X');
    expect(profileFacilityName({ email: 'a@example.test', user_metadata: {} })).toBe('a@example.test');
    expect(profileFacilityName({ email: 'a@example.test' })).toBe('a@example.test');
  });
  test('既定プロフィールは無料・非運営者・facility_name はメール（従来と同一）', () => {
    expect(defaultProfile(USER)).toEqual({ facility_name: 'user1@example.test', plan: 'free', is_admin: false });
  });
});

describe('ensureProfile（フラグ ON）', () => {
  const enabled = true;

  test('行なし → INSERT が1回・渡す値は id と facility_name だけ（plan/is_admin/trial_ends_at を含まない）', async () => {
    const createdRow = { id: 'u-test-1', facility_name: 'user1@example.test', plan: 'free', is_admin: false, trial_ends_at: '2026-12-20T00:00:00Z' };
    const { api, calls } = fakeSupabase({
      selectResults: [{ data: createdRow, error: null }], // 読み直し（最初の読みは readResult 引数で渡す）
      insertResult: { error: null },
    });
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: null } });
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]).toEqual({ id: 'u-test-1', facility_name: 'user1@example.test' });
    expect(Object.keys(calls.insert[0]).sort()).toEqual(['facility_name', 'id']);
    expect(res.profile).toEqual(createdRow); // 読み直した値（DB が trial_ends_at を固定）
    expect(res.reason).toBe('created');
  });

  test('行あり → INSERT が呼ばれない', async () => {
    const row = { id: 'u-test-1', facility_name: '既存', plan: 'full', is_admin: false, trial_ends_at: null };
    const { api, calls } = fakeSupabase();
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: row, error: null } });
    expect(calls.insert).toHaveLength(0);
    expect(res.profile).toBe(row);
    expect(res.reason).toBe('exists');
  });

  test('読み込みがエラー → INSERT されず、無料の既定で動く', async () => {
    const { api, calls } = fakeSupabase();
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: { message: 'network' } } });
    expect(calls.insert).toHaveLength(0);
    expect(res.profile).toEqual(defaultProfile(USER));
    expect(res.reason).toBe('read-error');
  });

  test('INSERT が 23505（重複）→ 例外にならず、読み直して成功として扱う', async () => {
    const existing = { id: 'u-test-1', facility_name: '別端末作成', plan: 'free', is_admin: false, trial_ends_at: '2026-12-20T00:00:00Z' };
    const { api, calls } = fakeSupabase({
      selectResults: [{ data: existing, error: null }], // 読み直し
      insertResult: { error: { code: '23505', message: 'duplicate key' } },
    });
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: null } });
    expect(calls.insert).toHaveLength(1);
    expect(res.profile).toEqual(existing);
    expect(res.reason).toBe('existed-23505');
  });

  test('INSERT が他のエラー → 例外にならず、ログだけ出て無料の既定で動く（再試行可）', async () => {
    const warn = vi.fn();
    const { api, calls } = fakeSupabase({ insertResult: { error: { code: '42501', message: 'rls' } } });
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: null }, logger: { warn } });
    expect(calls.insert).toHaveLength(1);
    expect(calls.selectCount).toBe(0); // 読み直しはしない
    expect(res.profile).toEqual(defaultProfile(USER));
    expect(res.reason).toBe('insert-error');
    expect(warn).toHaveBeenCalled();
  });

  test('INSERT 成功 → 読み直した値（DB が固定した trial_ends_at を含む）がプロフィールに入る', async () => {
    const createdRow = { id: 'u-test-1', facility_name: 'user1@example.test', plan: 'free', is_admin: false, trial_ends_at: '2026-12-20T00:00:00Z' };
    const { api } = fakeSupabase({
      selectResults: [{ data: createdRow, error: null }],
      insertResult: { error: null },
    });
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: null } });
    expect(res.profile.trial_ends_at).toBe('2026-12-20T00:00:00Z');
    expect(res.created).toBe(true);
  });

  test('facility_name: メタデータがあればそれを INSERT に使う', async () => {
    const user = { id: 'u-test-2', email: 'u2@example.test', user_metadata: { facility_name: '施設メタ' } };
    const { api, calls } = fakeSupabase({
      selectResults: [{ data: { id: 'u-test-2', facility_name: '施設メタ' }, error: null }],
      insertResult: { error: null },
    });
    await ensureProfile({ supabase: api, user, enabled, readResult: { data: null, error: null } });
    expect(calls.insert[0]).toEqual({ id: 'u-test-2', facility_name: '施設メタ' });
  });
});

describe('ensureProfileSafe（例外安全＝ログインを止めない）', () => {
  // insert / maybeSingle が reject（throw）する偽 supabase。
  function throwingSupabase({ insertThrows = false, rereadThrows = false } = {}) {
    const api = {
      from() { return api; },
      select() { return api; },
      eq() { return api; },
      maybeSingle() { if (rereadThrows) return Promise.reject(new Error('reread network down')); return Promise.resolve({ data: null, error: null }); },
      insert() { if (insertThrows) return Promise.reject(new Error('insert network down')); return Promise.resolve({ error: null }); },
    };
    return api;
  }

  test('INSERT が reject（throw）→ 例外を外に出さず無料の既定を返す', async () => {
    const warn = vi.fn();
    const res = await ensureProfileSafe({
      supabase: throwingSupabase({ insertThrows: true }), user: USER, enabled: true,
      readResult: { data: null, error: null }, logger: { warn },
    });
    expect(res.profile).toEqual(defaultProfile(USER));
    expect(res.reason).toBe('exception');
    expect(warn).toHaveBeenCalled();
  });

  test('読み直し（reread）が reject（throw）→ 例外を外に出さず無料の既定を返す', async () => {
    const res = await ensureProfileSafe({
      supabase: throwingSupabase({ rereadThrows: true }), user: USER, enabled: true,
      readResult: { data: null, error: null }, logger: { warn: vi.fn() },
    });
    expect(res.profile).toEqual(defaultProfile(USER));
    expect(res.reason).toBe('exception');
  });

  test('正常系では ensureProfile と同じ結果（例外が無ければ素通し）', async () => {
    const row = { id: 'u-test-1', facility_name: '既存', plan: 'free', is_admin: false };
    const api = { from() { return api; }, select() { return api; }, eq() { return api; }, maybeSingle() { return Promise.resolve({ data: row }); }, insert() { return Promise.resolve({ error: null }); } };
    const res = await ensureProfileSafe({ supabase: api, user: USER, enabled: true, readResult: { data: row, error: null } });
    expect(res.profile).toBe(row);
    expect(res.reason).toBe('exists');
  });

  test('フラグ OFF では supabase に触れず既定（例外も起きない）', async () => {
    const api = { from() { throw new Error('should not be called'); } };
    const res = await ensureProfileSafe({ supabase: api, user: USER, enabled: false, readResult: { data: null, error: null } });
    expect(res.profile).toEqual(defaultProfile(USER));
    expect(res.reason).toBe('disabled');
  });
});

describe('ensureProfile（フラグ OFF＝従来どおり）', () => {
  const enabled = false;

  test('行なしでも INSERT しない・既定で動く', async () => {
    const { api, calls } = fakeSupabase();
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: null } });
    expect(calls.insert).toHaveLength(0);
    expect(res.profile).toEqual(defaultProfile(USER));
    expect(res.reason).toBe('disabled');
  });

  test('行ありならその行・INSERT しない', async () => {
    const row = { id: 'u-test-1', facility_name: '既存', plan: 'free', is_admin: false };
    const { api, calls } = fakeSupabase();
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: row, error: null } });
    expect(calls.insert).toHaveLength(0);
    expect(res.profile).toBe(row);
  });

  test('読み込みエラーでも INSERT しない（従来どおり既定）', async () => {
    const { api, calls } = fakeSupabase();
    const res = await ensureProfile({ supabase: api, user: USER, enabled, readResult: { data: null, error: { message: 'x' } } });
    expect(calls.insert).toHaveLength(0);
    expect(res.profile).toEqual(defaultProfile(USER));
  });
});
