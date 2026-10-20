/**
 * 初回ログインで、自分の profiles の行が無ければ作る純粋ロジック（副作用は渡された supabase だけ）。
 * 画面（App.jsx）から Supabase クライアントを引数で受け取り、テストでは偽物を渡せる。
 *
 * ★フラグ OFF のときは「今までと完全に同じ」= INSERT しない・error は無視して既定（無料）で動く。
 * ★試用の終わり trial_ends_at は入れない。DB の protect トリガーが「今＋2か月」に固定する（PR-2）。
 *   plan・is_admin も入れない（protect が free / false に固定）。INSERT で渡すのは id と facility_name だけ。
 * core.js・生成・planV2.js には一切関係しない。
 */

// 画面表示用の既定プロフィール（行が無い/読めないとき）。従来の App.jsx の既定と同一。
export function defaultProfile(user) {
  return { facility_name: user?.email, plan: 'free', is_admin: false };
}

// INSERT 時の facility_name の決め方（repo 001 の handle_new_user と同じ: メタデータ→無ければメール）。
export function profileFacilityName(user) {
  return user?.user_metadata?.facility_name || user?.email || '';
}

/**
 * @param {object}   args
 * @param {object}   args.supabase  Supabase クライアント（from(..).select().eq().maybeSingle() / insert() を使う）
 * @param {object}   args.user      ログイン中ユーザー（id, email, user_metadata）
 * @param {boolean}  args.enabled   フラグ（OFF なら従来どおり INSERT しない）
 * @param {object}   args.readResult 最初の select('*') の結果 { data, error }
 * @param {object}   [args.logger]  ログ出力先（既定 console）
 * @returns {Promise<{profile:object, created:boolean, reason:string}>}
 */
export async function ensureProfile({ supabase, user, enabled, readResult, logger = console }) {
  const { data = null, error = null } = readResult || {};

  // フラグ OFF: 従来と完全に同じ（INSERT しない・error は無視して既定）。
  if (!enabled) {
    return { profile: data || defaultProfile(user), created: false, reason: 'disabled' };
  }

  // (a) 読み込みがエラー: 通信失敗を「行なし」と取り違えない。INSERT せず既定で動く（次回再試行）。
  if (error) {
    return { profile: data || defaultProfile(user), created: false, reason: 'read-error' };
  }

  // 行あり: そのまま使う。
  if (data) {
    return { profile: data, created: false, reason: 'exists' };
  }

  // (b) 行なし（エラーなし）: id と facility_name だけで INSERT（plan/is_admin/trial_ends_at は DB が固定）。
  const insertRes = await supabase.from('profiles').insert({
    id: user.id,
    facility_name: profileFacilityName(user),
  });
  const insErr = insertRes?.error || null;

  // (d) 重複以外のエラー: 例外を投げず、ログだけ出して既定（無料）で動く。ログインは止めない。
  if (insErr && insErr.code !== '23505') {
    (logger?.warn || logger?.log || (() => {})).call(
      logger, '[ensureProfile] profiles INSERT 失敗。無料の既定で続行（次回再試行）:', insErr.message || insErr,
    );
    return { profile: defaultProfile(user), created: false, reason: 'insert-error' };
  }

  // (c) 23505（別端末が先に作成）／(e) 成功: どちらも読み直して DB が固定した値を使う。
  const reread = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (reread?.error || !reread?.data) {
    // 読み直しに失敗: 既定で動く（次回再試行）。
    return {
      profile: reread?.data || defaultProfile(user),
      created: false,
      reason: reread?.error ? 'reread-error' : 'reread-empty',
    };
  }
  return { profile: reread.data, created: !insErr, reason: insErr ? 'existed-23505' : 'created' };
}
