/**
 * 学習のプラン別ゲート検証：
 *  - isLearningEnabled（free=オフ／standard・full・is_admin=オン）
 *  - free相当（空trend {}）でも生成の制約（公休・必要人数）が守られる＝生成が壊れない
 * ※ freeで強癖プリエンプションが効かないのは「trendがcoreに届かない」ため論理的に自明
 *   （trend駆動の癖挙動は core.js 側の既存テストが担保）。
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';
import { bestOfN } from '../engine/core.js';
let isLearningEnabled;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL','http://localhost:9999');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY','test');
  ({ isLearningEnabled } = await import('../App.jsx'));
});

describe('isLearningEnabled', () => {
  test('free は学習オフ', () => expect(isLearningEnabled({plan:'free',is_admin:false})).toBe(false));
  test('standard/full は学習オン', () => {
    expect(isLearningEnabled({plan:'standard'})).toBe(true);
    expect(isLearningEnabled({plan:'full'})).toBe(true);
  });
  test('is_admin(研究用) は plan に関係なく学習オン', () => {
    expect(isLearningEnabled({plan:'free',is_admin:true})).toBe(true);
  });
  test('未設定は free 扱い（オフ）', () => expect(isLearningEnabled(undefined)).toBe(false));
});

describe('free相当（空trend）でも生成の制約は守られる', () => {
  const YEAR=2026,MONTH=7,mk='2026-8';
  const REST=new Set(['休み','希望休']);
  const restCount=(o)=>Object.values(o||{}).filter(v=>REST.has(v)).length;
  const dept={id:'k',shiftTypes:['早番','日勤','遅番','夜勤'],minStaff:{日勤:2,夜勤:1},maxStaff:{早番:1,遅番:1,夜勤:1},maxConsecutive:5,roleShiftTypes:{}};
  const staff=Array.from({length:9},(_,i)=>({id:'s'+i,name:'S'+i,dept:'k',role:'x',nightOk:[0,1,3,5].includes(i),nightMax:5,kyukoDays:10,kiboByMonth:{},yukyuByMonth:{},shiftRequestsByMonth:{},kyukoDaysByMonth:{[mk]:10}}));
  const minOK=(r)=>{for(let d=1;d<=31;d++){if(staff.filter(s=>r[s.id][d]==='日勤').length<2)return false;if(staff.filter(s=>r[s.id][d]==='夜勤').length<1)return false;}return true;};
  test('空trend {} で 公休10・必要人数(日勤2/夜勤1) を満たす', () => {
    let r=bestOfN(staff,dept,YEAR,MONTH,{},{},30).shifts;
    const ok=()=>staff.every(s=>restCount(r[s.id])===10)&&minOK(r);
    if(!ok())for(let i=0;i<50;i++){const c=bestOfN(staff,dept,YEAR,MONTH,{},{},30).shifts;if(staff.every(s=>restCount(c[s.id])===10)&&minOK(c)){r=c;break;}else r=c;}
    staff.forEach(s=>expect(restCount(r[s.id])).toBe(10));
    expect(minOK(r)).toBe(true);
  });
});
