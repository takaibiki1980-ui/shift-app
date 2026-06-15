/**
 * roleShiftTypes 違反ゼロ確認スクリプト
 * 栄養科相当データ（roleShiftTypes制約付き）で autoGenerate を実行し、
 * 違反件数・違反職員一覧を報告する。
 */
const { chromium } = require('playwright');

const MOCK_USER_ID = 'test-user-00000000-0000-0000-0000-000000000001';
const MOCK_TOKEN   = 'mock-access-token';

// テスト用部署: 栄養科 + roleShiftTypes制約
const TEST_DEPTS = [
  {
    id: "eiyo", label: "栄養科", icon: "🍱",
    shiftTypes: ["早番", "日勤"],
    minStaff: { 早番: 1, 日勤: 1 },
    maxStaff: { 早番: 1, 日勤: 99 },
    defaultKyukoDays: 8,
    maxConsecutive: 5,
    roles: ["管理栄養士", "栄養士", "調理師"],
    // 制約: 調理師は早番のみ可
    roleShiftTypes: { "調理師": ["早番"] },
  }
];

// テスト用スタッフ（栄養科 4名: 管理栄養士×2 + 調理師×2）
// 調理師の shiftRequestsByMonth に 日勤 を入れて Fix① を検証
const MK = `2026-6`;
const TEST_STAFF = [
  {
    id: "eiyo_0", dept: "eiyo", name: "清水 優子", role: "管理栄養士",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
  },
  {
    id: "eiyo_1", dept: "eiyo", name: "池田 恵", role: "調理師",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {},
    // Fix①検証: 調理師が日勤を希望 → roleShiftTypes チェックでブロックされるべき
    shiftRequestsByMonth: { [MK]: { "10": "日勤", "15": "日勤", "20": "日勤" } },
    kyukoDaysByMonth: {},
  },
  {
    id: "eiyo_2", dept: "eiyo", name: "田中 美香", role: "栄養士",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
  },
  {
    id: "eiyo_3", dept: "eiyo", name: "鈴木 直樹", role: "調理師",
    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8,
    kiboByMonth: {},
    shiftRequestsByMonth: { [MK]: { "5": "日勤", "25": "日勤" } },
    kyukoDaysByMonth: {},
  },
];

// Supabase 認証モック session
const MOCK_SESSION = {
  access_token: MOCK_TOKEN,
  refresh_token: 'mock-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: MOCK_USER_ID,
    email: 'test@example.com',
    role: 'authenticated',
    aud: 'authenticated',
  },
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  });
  const context = await browser.newContext();

  // ── Supabase API 全モック ──────────────────────────────────────────────────
  await context.route('https://dummy.supabase.co/**', async (route) => {
    const url = route.request().url();
    // auth endpoints → セッション返却
    if (url.includes('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) });
    }
    // REST API endpoints → 空配列（Supabase REST は生配列を返す）
    if (url.includes('/rest/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // channel / realtime
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await context.newPage();
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('roleShift') || text.includes('役職') || text.includes('違反') || text.includes('FINAL') || text.includes('violation')) {
      consoleLogs.push(`[${msg.type()}] ${text}`);
    }
  });

  // 1. ページ初回アクセス（空）
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(500);

  // 2. Supabase auth token を localStorage に注入（v2形式）
  await page.evaluate(({ session, depts, staffList }) => {
    // Supabase v2 の localStorage キー
    localStorage.setItem('sb-dummy-auth-token', JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: session.user,
    }));
    // アプリデータ注入
    localStorage.setItem('shiftNavi_depts', JSON.stringify(depts));
    localStorage.setItem('shiftNavi_staffList', JSON.stringify(staffList));
  }, { session: MOCK_SESSION, depts: TEST_DEPTS, staffList: TEST_STAFF });

  // 3. ページリロードで session + data 適用
  await page.reload();
  await page.waitForTimeout(2000);

  // 4. 栄養科タブに切替（ログイン後に表示されているはず）
  const loginForm = await page.$('input[type="email"], input[type="password"]');
  if (loginForm) {
    console.log('❌ ログインページが表示されています。認証バイパスに失敗。');
  }
  // デバッグ: 現在のページ内容を確認
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('[debug] page body (first 500 chars):', bodyText);
  const allBtns = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(t => t));
  console.log('[debug] buttons on page:', allBtns.slice(0, 20));

  // 5. 栄養科タブをクリック
  const eiyoTab = await page.$('text=栄養科');
  if (eiyoTab) {
    await eiyoTab.click();
    await page.waitForTimeout(500);
    console.log('✅ 栄養科タブに切替完了');
  } else {
    console.log('⚠️  栄養科タブが見つかりません。部署リストを確認してください。');
  }

  // 6. 月を 2026年6月 に設定（現在日付が 2026-06-15 なので既にそのはず）
  const yearMonthText = await page.$('text=2026年6月');
  if (yearMonthText) {
    console.log('✅ 2026年6月 表示確認');
  }

  // 7. 自動生成ボタンをクリック
  const genBtn = await page.$('button:has-text("自動生成")');
  if (!genBtn) {
    console.log('❌ 自動生成ボタンが見つかりません');
    await browser.close();
    return;
  }
  await genBtn.click();
  console.log('✅ 自動生成クリック');

  // 確認ダイアログが出たらOKを押す
  page.on('dialog', async dialog => {
    console.log('[dialog]', dialog.message().slice(0, 80));
    await dialog.accept();
  });

  // 生成完了まで待機（最大15秒）
  await page.waitForTimeout(8000);

  // 8. 違反バナー確認
  const violationBanner = await page.$('text=役職制限:');
  if (violationBanner) {
    const bannerText = await violationBanner.textContent();
    console.log(`\n❌ roleShiftTypes 違反が残存: ${bannerText}`);
  } else {
    console.log('\n✅ roleShiftTypes 違反バナーなし（0件）');
  }

  // 9. コンソールログ出力
  if (consoleLogs.length > 0) {
    console.log('\n── console logs (role/violation 関連) ──');
    consoleLogs.forEach(l => console.log(l));
  }

  // 10. 各調理師スタッフのシフトを DOM から確認
  console.log('\n── 調理師スタッフのシフト確認 ──');
  const staffRows = await page.$$('tr');
  for (const row of staffRows) {
    const nameCell = await row.$('td:first-child, th:first-child');
    if (!nameCell) continue;
    const nameText = await nameCell.textContent();
    if (!nameText.includes('池田') && !nameText.includes('鈴木')) continue;
    const cells = await row.$$('td');
    const shifts = [];
    for (let i = 1; i < Math.min(cells.length, 32); i++) {
      const txt = (await cells[i].textContent()).trim();
      if (txt) shifts.push(`${i}日:${txt}`);
    }
    const violations = shifts.filter(s => s.includes('日勤') || s.includes('遅番') || s.includes('夜勤'));
    if (violations.length > 0) {
      console.log(`  ❌ ${nameText.trim()}: roleShiftTypes違反シフト = ${violations.join(', ')}`);
    } else {
      console.log(`  ✅ ${nameText.trim()}: 違反なし（早番/休み系のみ）`);
    }
  }

  await browser.close();
  console.log('\n── 検証完了 ──');
}

main().catch(e => { console.error('テスト実行エラー:', e); process.exit(1); });
