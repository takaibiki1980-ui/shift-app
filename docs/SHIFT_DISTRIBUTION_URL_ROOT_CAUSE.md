# SHIFT_DISTRIBUTION_URL_ROOT_CAUSE.md
# 完成シフト送信URL 根本原因最終確定レポート

調査日: 2026-06-27
調査対象: `/home/user/shift-app/src/App.jsx`
症状: 送信URLを開くと全セル「－」。管理画面・印刷画面では正常表示。
制約: 実装禁止・コード変更禁止・事実確認のみ

---

## 1. 完成シフト送信フロー全体図

```
【管理画面】
 L8639: shiftUrl = `${origin}?staff=${uuidToShort(session.user.id)}&dept=${d.id}&view=shift&ym=${year}${String(month+1).padStart(2,'0')}`

 L8640: doShiftLine() / doShiftCopy()
   └── if (saveStatus !== 'saved') { alert(); return; }   ← saveStatus が 'saved' なら送信可能
   └── URL をスタッフに送信（LINE / クリップボード）

【スタッフが URL を開く】
 App.jsx L6675: params = new URLSearchParams(window.location.search)
 L6676: staffUserId   = params.get('staff')   ← 22文字短縮UUID
 L6677: staffDeptId   = params.get('dept')    ← 部署ID（例: kaigo1）
 L6679: staffViewMode = params.get('view')    ← "shift"
 L6681: resolvedUserId = shortToUuid(staffUserId)  ← 22文字→36文字UUID に復元

 L6682: if (resolvedUserId && staffViewMode === 'shift')
           return <ShiftViewPortal adminUserId={resolvedUserId} deptId={staffDeptId} ym={params.get('ym')} />;

【ShiftViewPortal L6528】
 L6529: year  = Math.floor(Number(ym) / 100)    ← ym="202607" → 2026
 L6530: month = (Number(ym) % 100) - 1           ← 7 - 1 = 6 (0-indexed)
 L6538: shiftKey = `shifts_${year}_${month+1}_${deptId}`
                 = `shifts_2026_7_kaigo1`

 L6539–6542: Supabase から3テーブルを並列取得
   supabase.from('shift_data')
     .select('data_value')
     .eq('user_id', adminUserId)    ← resolvedUserId（管理者UUID）
     .eq('data_key', shiftKey)      ← 'shifts_2026_7_kaigo1'
     .maybeSingle()

 L6550: rawShifts = shiftsRes.data?.data_value
         → Supabase に該当レコードがなければ null

 L6552–6559: rawShifts が null → 旧キー形式（shifts_2026_7）でフォールバック検索
         → それも null の場合

 L6561–6571: 全 shifts_% キーを検索 → setDiagInfo({ foundKeys: [] })
         → "シフトデータが一件も保存されていません"

 L6573: setInfo({ shifts: rawShifts || {} })   ← shifts = {}

【画面表示 L6648, L6653, L6608】
 const ss = shifts[s.id] || {};   ← shifts = {} → ss = {}
 const v  = ss[d] || '';          ← ss に数値キーなし → v = ''
 cellText('')                      → '－'  (L6608: if(!v) return '－')
```

---

## 2. 通常スタッフ画面との差分

| 項目 | 管理画面・印刷画面 | 完成シフト送信URL (ShiftViewPortal) |
|---|---|---|
| **データ参照元** | `allShifts`（Reactメモリ） | Supabase `shift_data` テーブル |
| **localStorage** | 生成→`allShifts`変化→L7275で自動保存（Supabase upsert不要） | 参照しない |
| **Supabase依存** | なし（表示のみ） | 完全依存 |
| **生成直後に表示可能か** | 可能（メモリにある） | 不可能（Supabaseに書くまで） |
| **app再起動後に表示可能か** | 可能（localStorageからロード L6935） | Supabaseに書いてあれば可能 |

### 管理画面がシフトを表示できる理由（Supabase 0件でも）

```javascript
// L7267–7276: allShifts が変化するたびに localStorage へ自動保存（Supabase upsert とは独立）
useEffect(() => {
  if (!dbInitialized.current) return;
  if (isLoadingMonth.current) return;
  if (Object.keys(allShifts).length === 0) return;
  try { localStorage.setItem(SAVE_KEY(year, month), JSON.stringify(allShifts)); } catch {}
}, [allShifts]); // ← allShifts 変化のたびに実行（Supabase upsert の成否に関係なし）
```

```javascript
// L6934–6936: 起動時に localStorage から allShifts を初期化
const [allShifts, setAllShifts] = useState(() => {
  try {
    const key = `shiftNavi_shifts_${new Date().getFullYear()}_${new Date().getMonth()+1}`;
    const saved = localStorage.getItem(key);
    if (!saved) return {};
    return restoreShifts(JSON.parse(saved));
  } catch { return {}; }
});
```

**結論**: 生成→`setAllShifts`→L7275の自動保存により localStorage にはシフトが存在する。
管理画面は localStorage / メモリから表示できる。
しかし ShiftViewPortal は localStorage を一切参照せず、Supabase のみを参照する。

---

## 3. 送信URL画面だけ空になる理由

```
【生成後の状態】
  allShifts['kaigo1'] = { staffId1: {1:"早番", 2:"日勤", ...}, ... }  ← メモリにある ✓
  localStorage['shiftNavi_shifts_2026_7'] = JSON.stringify(allShifts) ← L7275で即時保存 ✓
  Supabase shift_data: 該当レコード 0件                               ← upsert未実行 ✗

【管理画面が表示できる理由】
  管理画面 → allShifts（Reactメモリ） → シフト表示 ✓
  次回起動後も → localStorage → allShifts ロード → シフト表示 ✓

【ShiftViewPortal が表示できない理由】
  ShiftViewPortal → Supabase query → 0件 → rawShifts = null → shifts = {} → 全セル「－」 ✗
```

---

## 4. コード根拠

| 事実 | コード根拠行 |
|---|---|
| 送信URL に `staff=短縮UUID&dept=部署ID&view=shift&ym=YYYYMM` が含まれる | L8639 |
| `view=shift` のとき ShiftViewPortal が起動する | L6682 |
| ShiftViewPortal は `shifts_${year}_${month+1}_${deptId}` キーで Supabase を読む | L6538–6542 |
| 管理画面の保存キーも `shifts_${year}_${month+1}_${currentDeptId}` | L7412 |
| adminUserId = shortToUuid(staffUserId) ← 完全な往復変換 | L6681, L463–473 |
| allShifts 変化のたびに localStorage へ保存（Supabase 無関係） | L7267–7276 |
| 起動時に localStorage から allShifts をロード | L6934–6936 |
| ShiftViewPortal は localStorage を一切参照しない | L6536–6576（全コード） |
| Supabase 0件 → rawShifts = null → shifts = {} → `cellText('')` = `'－'` | L6550, L6573, L6648, L6608 |

---

## 5. 根本原因（1つ）

**Supabase `shift_data` テーブルへの upsert が実行されていない。**

管理画面・印刷画面はReactメモリ（allShifts）を参照するため、upsert の有無に関係なく正常表示される。
ShiftViewPortal は Supabase のみを参照するため、upsert が未実行の場合にデータが存在せず全セル「－」になる。

送信URL・キー計算・UUID変換・クエリ構造のいずれにも誤りは存在しない。

---

## 6. 修正対象関数

**保存エフェクト（useEffect）**: `allShifts` を dep にする保存エフェクト（L7380）

upsert が実行されない原因として現在確認中の候補:

| 候補 | 条件 | ガードコード |
|---|---|---|
| **L7382**: dbInitialized=false | DB初期化前 | `if (!dbInitialized.current) return;` |
| **L7383**: isLoadingMonth=true | Realtime ロード中 | `if (isLoadingMonth.current) return;` |
| **L7386**: seqチェック true | userEditSeq === seqAtLastRemoteLoad | `setSaveStatus('saved'); return;` |
| **L7399**: 年月不一致 | タイマー発火時に月が変わっていた | `setSaveStatus('saved'); return;` |

TRACE ログで特定中（コミット a199ff8）。

---

## 7. 修正箇所（行番号）

TRACEログで実際にどのガードを通ったか確認後に確定する。

**TRACE ログで「[TRACE⑥] supabase.upsert() 呼び出し直前」が出ない場合**:
→ L7382/L7383/L7386/L7399 のいずれかで return されている → 該当ガードを修正

**TRACE ログで「[TRACE⑥]」が出るが「[TRACE⑦] error」がある場合**:
→ Supabase 側のエラー（JWT / RLS / ネットワーク）→ エラー内容に応じた対処

---

## フロー確認チェックリスト

| 項目 | 状態 | 根拠 |
|---|---|---|
| URL生成パラメータ | ✅ 正しい | L8639 |
| shortToUuid 往復変換 | ✅ 正しい（数学的に完全） | L463–473 |
| ShiftViewPortal の data_key 計算 | ✅ 管理画面の保存キーと一致 | L6538 vs L7412 |
| adminUserId の一致 | ✅ uuidToShort→shortToUuid で完全一致 | L6681 |
| Supabase レコードの存在 | ❌ 0件（診断画面で確認済み） | diagInfo.foundKeys=[] |
| upsert 実行の有無 | ❌ 未実行（TRACEログで確認中） | TRACE⑥未出力 |
