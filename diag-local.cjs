const { chromium } = require('playwright');

const SESSION = {
  access_token: 'mock-tok', refresh_token: 'mock-r',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'test-uid-001', email: 't@e.com', role: 'authenticated', aud: 'authenticated' },
};

const DEPTS = [{
  id: "eiyo", label: "栄養科", icon: "🍱", generationMode: "time",
  shiftTypes: ["早番", "日勤"],
  minStaff: { 早番: 1, 日勤: 1 }, maxStaff: { 早番: 1, 日勤: 99 },
  defaultKyukoDays: 8, maxConsecutive: 5,
  roles: ["管理栄養士", "栄養士", "調理師"],
  roleShiftTypes: { "調理師": ["早番"] },
  coverageRules: [
    { start: "07:00", end: "16:00", min: 1, label: "早番帯" },
    { start: "09:00", end: "18:00", min: 1, label: "日勤帯" },
  ],
  shiftTimes: { 早番: { start: "07:00", end: "16:00" }, 日勤: { start: "09:00", end: "18:00" } },
  intervalThreshold: 11,
}];

const STAFF = [
  { id: "eiyo_0", dept: "eiyo", name: "清水 優子", role: "管理栄養士", nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_1", dept: "eiyo", name: "池田 恵",   role: "調理師",    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_2", dept: "eiyo", name: "田中 美香", role: "栄養士",    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
  { id: "eiyo_3", dept: "eiyo", name: "鈴木 直樹", role: "調理師",    nightOk: false, nightMax: 0, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} },
];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  });
  const ctx = await browser.newContext();
  await ctx.route('https://dummy.supabase.co/**', route => {
    const url = route.request().url();
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  const logs = [];
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[TIME-FINAL]') || t.includes('[TIME-ENGINE]')) logs.push(t);
  });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(500);
  await page.evaluate(({ s, depts, staffList }) => {
    localStorage.setItem('sb-dummy-auth-token', JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, user: s.user }));
    localStorage.setItem('shiftNavi_depts', JSON.stringify(depts));
    localStorage.setItem('shiftNavi_staffList', JSON.stringify(staffList));
  }, { s: SESSION, depts: DEPTS, staffList: STAFF });

  await page.reload();
  await page.waitForTimeout(2000);
  const tab = await page.$('text=栄養科');
  if (tab) { await tab.click(); await page.waitForTimeout(300); }
  const btn = await page.$('button:has-text("自動生成")');
  if (!btn) { console.log('❌ 自動生成ボタンなし'); await browser.close(); return; }
  await btn.click();
  await page.waitForTimeout(9000);
  await browser.close();

  console.log('\n=== 最終休み分布（Phase2修正後） ===');
  logs.forEach(l => console.log(l));
}

main().catch(e => { console.error(e.message); process.exit(1); });
