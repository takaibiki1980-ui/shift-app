# REQUEST_OFF_COPY_FLOW.md
# 希望休送信機能 不具合調査レポート

調査日: 2026-06-27  
調査対象: `/home/user/shift-app/src/App.jsx`  
制約: 実装禁止・コード変更禁止・推測禁止・ログ追加禁止

---

## 1. 希望休送信ボタンから保存までの処理フロー

### 管理者側（送信ボタン定義）

**L8558**（希望休入力URL生成）:
```javascript
const urlShort = `${window.location.origin}?staff=${uuidToShort(session.user.id)}&dept=${d.id}`;
```

**L8560**（doLine — LINEで送る）:
```javascript
const doLine = () => {
  const l = `https://line.me/R/msg/text/?${encodeURIComponent(`...リンク...\n${urlShort}`)}`;
  window.open(l, '_blank');
};
```

**L8561**（doCopy — URLコピー）:
```javascript
const doCopy = () => {
  navigator.clipboard?.writeText(urlShort)...
};
```

**URLパラメータ構造**（L8558）:
| パラメータ | 値 | 内容 |
|---|---|---|
| `staff` | `uuidToShort(session.user.id)` | 管理者UUID（短縮形式） |
| `dept` | `d.id` | 部署ID |
| `cfg` | cfgB64（urlFull のみ） | 施設・部署・スタッフ情報のBase64（LINE/コピーには含まれない） |

→ **シフトデータは URLに含まれない**

---

### スタッフ側（StaffPortal）

**L5783** — StaffPortal 定義:
```javascript
function StaffPortal({ adminUserId, fixedDeptId, cfgPreload }) {
```

**L5800–5840** — loadConfig():
1. `cfgPreload` (URLの cfg パラメータ) があればデコード（L5802–5814）
2. なければ Supabase から `facilityConfig` を取得（L5819–5840、最大4回リトライ）

**L5809** — スタッフリスト展開:
```javascript
staffList: (c.sl || []).map(s => ({
  id: s.i ? shortToUuid(s.i) : s.id,
  name: s.n || s.name,
  dept: c.d.id
}))
```

**L5870–5889** — スタッフ選択時に既存希望休を読み込み:
```javascript
// L5874–5875
const { data } = await supabase.from('staff_kibo').select('*')
  .eq('admin_user_id', adminUserId).eq('dept_id', deptId).eq('staff_id', selectedStaff.id).eq('month_key', mk).maybeSingle();
// L5880
setMyDays(mine?.days || []);
```

**L5891–5919** — handleSubmit():
```javascript
// L5907–5910
await supabase.from('staff_kibo').upsert({
  admin_user_id: adminUserId, dept_id: deptId, staff_id: selectedStaff.id,
  month_key: mk,
  days: myDays,          // ← コピー元
  yukyu_days: myYukyuDays,
  updated_at: new Date().toISOString()
}, { onConflict: 'admin_user_id,dept_id,staff_id,month_key' });
```

---

## 2. コピー元データ

**myDays** が希望休の実体。

**初期化（L5858）**:
```javascript
const [myDays, setMyDays] = useState([]);
```

**更新箇所**:
- L5880: `setMyDays(mine?.days || [])` — Supabase から読み込んだ既存データで初期化
- L6025: `<StaffKiboCalendar onChange={setMyDays} .../>` — スタッフがカレンダーをタップするたびに更新

**myDays の型**: 日番号の配列（例: `[3, 7, 14]`）

---

## 3. コピー先データ

**Supabase `staff_kibo` テーブル**（L5907–5910）:
```
admin_user_id  : adminUserId（管理者UUID）
dept_id        : deptId
staff_id       : selectedStaff.id
month_key      : mk（"2026-07" 形式）
days           : myDays（希望休の日番号配列）
yukyu_days     : myYukyuDays（有休日番号配列）
```

ローカルstateへの保存はなし。`staff_kibo` テーブルへの直接 upsert のみ。

---

## 4. 「完成済みシフトを希望休として送る」機能の有無

**この機能は実装されていない。**

コード上の根拠:
- 送信URL（L8558）には `staff` と `dept` のみ。シフトデータ（allShifts）を含まない
- cfgObj（L8556）の構造: `{ fn, d, sl }` — スタッフリストのみ、シフトは含まない
  ```javascript
  const cfgObj = {
    fn: profile?.facility_name || '',
    d: { id, label, icon, kb, dl, ty, tm },
    sl: deptSl  // → [{ i: uuidToShort(s.id), n: s.name }]
  };
  ```
- StaffPortal は `staff_kibo` テーブルからのみデータ読み込み（L5874）。`shift_data` テーブルは参照しない

---

## 5. 希望休データが空白になる原因の特定

「完成済みシフトを希望休として送った後、希望休データが空になる」という状況は、以下のいずれかが原因:

### 原因A: コピー元（myDays）が空のまま送信される

**再現条件**: スタッフがカレンダーで何も選択せずに「送信する」ボタンを押した場合

**コード根拠**:
- L5858: `useState([])` で初期化
- L5909: `days: myDays` — 選択がなければ `[]` がそのまま保存される
- バリデーション処理なし（L5891–5919 に空チェックが存在しない）

### 原因B: 既存の希望休データがスタッフ再選択で初期化される

**再現条件**: スタッフAの希望休入力後、スタッフBを選択してから再度スタッフAに戻った場合

**コード根拠**:
- L5880: `setMyDays(mine?.days || [])` — スタッフ切替のたびに Supabase から再取得
- ただし送信前に他スタッフを選ぶと、送信時には他スタッフの myDays が送られる

### 原因C: cfgPreload のスタッフリストが空

**再現条件**: URLに `cfg` パラメータが含まれ、かつ `c.sl` が空の場合

**コード根拠（L8556）**:
```javascript
const deptSl = staffList.filter(s => s.dept === d.id).map(s => ({...}));
```
→ 部署にスタッフが1人もいない場合、`deptSl = []`

**コード根拠（L5809）**:
```javascript
staffList: (c.sl || []).map(...)
```
→ `c.sl = []` であれば staffList = []。スタッフ選択画面に誰も表示されない

---

## 6. 送信時点での空データ確認

| 確認項目 | 状況 | 根拠行 |
|---|---|---|
| myDays の初期値 | `[]`（空配列） | L5858 |
| myDays の更新タイミング | カレンダータップ時のみ | L6025 |
| 送信前の空チェック | **なし** | L5891–5919 |
| 空のまま保存した場合 | `days: []` が保存される | L5909 |
| Supabase保存 | `staff_kibo` テーブルに upsert | L5907 |

---

## 7. allShifts（完成シフト）との関係

**別オブジェクト**。希望休データ（myDays / staff_kiboテーブル）と完成シフト（allShifts / shift_dataテーブル）は完全に独立している。

| | 希望休 | 完成シフト |
|---|---|---|
| state | myDays（number[]） | allShifts（{}） |
| テーブル | staff_kibo | shift_data |
| data_key | — | `shifts_YYYY_M_deptId` |
| 参照関係 | なし | なし |

---

## まとめ

### 原因候補

1. **【最有力】コピー元（myDays）が空のまま送信** — 空配列のバリデーションなし（L5891–5919）
2. **スタッフ選択操作ミス** — 他スタッフ選択後に送信（myDays が別スタッフ分で上書き）
3. **cfgPreload のスタッフリストが空** — 部署へのスタッフ未登録

### 再現条件

- カレンダーで何も選択せず「✅ 送信する」を押す（L6044–6046）
- 空チェックがないため `days: []` が保存される（L5909）

### 修正箇所

- **L5891–5919**（handleSubmit）: `myDays.length === 0` の場合に送信をブロックするバリデーション追加
- または **L5909**: 空送信時に確認アラートを表示

### 影響範囲

- `staff_kibo` テーブルへの空データ保存
- 管理者が希望休を参照した際、そのスタッフの希望が0件として扱われる
- 他スタッフ・他部署・完成シフトには影響なし
