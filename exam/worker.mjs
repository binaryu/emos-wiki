import page from './index.html';
import {questions,grade,rewardFor} from './questions.mjs';

const API = 'https://emos.best';
const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json = (data,status=200) => Response.json(data,{status,headers});
const cookie = (name,value,age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const cookies = req => Object.fromEntries((req.headers.get('Cookie') || '').split(';').map(p=>p.trim().split('=')));

async function emos(path,token) {
  const response = await fetch(API+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`EMOS 接口返回 ${response.status}`);
  return response.json();
}

async function session(req,env) {
  return env.DB.prepare('SELECT user_id,username FROM sessions WHERE id=? AND expires_at>?').bind(cookies(req).exam_session || '',Date.now()).first();
}

async function handle(req,env) {
  const url = new URL(req.url);
  if(req.method==='GET' && url.pathname==='/') return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  if(req.method==='GET' && url.pathname==='/login') {
    const state = crypto.randomUUID();
    const link = new URL('/link',API);
    link.searchParams.set('uuid',state);
    link.searchParams.set('name','emos Wiki 新人入门考核');
    link.searchParams.set('url',url.origin+'/callback/'+state);
    return new Response(null,{status:302,headers:{...headers,Location:link.href,'Set-Cookie':cookie('exam_login',state,600)}});
  }
  if(req.method==='GET' && url.pathname.startsWith('/callback/')) {
    const state = url.pathname.slice('/callback/'.length);
    if(!state || cookies(req).exam_login!==state) return json({error:'登录验证已失效，请重新登录。'},400);
    const token = url.searchParams.get('token');
    if(!token || token.length>2000) return json({error:'授权回调缺少有效凭证。'},400);
    const user = await emos('/api/user/base',token);
    if(typeof user.user_id!=='string' || typeof user.username!=='string') return json({error:'EMOS 用户信息格式不正确。'},502);
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),
      env.DB.prepare('INSERT INTO sessions(id,user_id,username,expires_at) VALUES(?,?,?,?)').bind(id,user.user_id,user.username,Date.now()+86400000),
    ]);
    const h = new Headers({...headers,Location:'/'});
    h.append('Set-Cookie',cookie('exam_session',id,86400));
    h.append('Set-Cookie',cookie('exam_login','',0));
    return new Response(null,{status:302,headers:h});
  }
  if(req.method==='GET' && url.pathname==='/api/questions') return json(questions.map(({answer,aliases,...q})=>q));
  if(req.method==='GET' && url.pathname==='/api/me') {
    const user = await session(req,env);
    if(!user) return json({user:null});
    const record = await env.DB.prepare('SELECT highest_score,reward_paid,payout_state FROM progress WHERE user_id=?').bind(user.user_id).first();
    return json({user,...(record || {highest_score:0,reward_paid:0,payout_state:'idle'})});
  }
  if(req.method==='POST' && url.pathname==='/api/submit') {
    if(req.headers.get('Origin')!==url.origin) return json({error:'请求来源无效。'},403);
    const user = await session(req,env);
    if(!user) return json({error:'请先登录。'},401);
    if(!req.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'请提交 JSON 格式答案。'},415);
    const raw = await req.text();
    if(raw.length>10000) return json({error:'答案过长。'},413);
    let answers;
    try { answers=JSON.parse(raw).answers; } catch { return json({error:'答案格式不正确。'},400); }
    if(!answers || typeof answers!=='object' || Array.isArray(answers) || Object.keys(answers).length!==20 || questions.some(q=>typeof answers[q.id]!=='string' || !answers[q.id].trim() || answers[q.id].length>100 || (q.options && !q.options.includes(answers[q.id])))) return json({error:'请完整填写全部20题。'},400);
    const result = grade(answers);
    await env.DB.prepare('INSERT INTO progress(user_id,highest_score,updated_at) VALUES(?,0,?) ON CONFLICT(user_id) DO NOTHING').bind(user.user_id,Date.now()).run();
    const locked = await env.DB.prepare("UPDATE progress SET highest_score=MAX(highest_score,?),last_score=?,payout_state='processing',updated_at=? WHERE user_id=? AND payout_state='idle' RETURNING highest_score,reward_paid").bind(result.score,result.score,Date.now(),user.user_id).first();
    if(!locked) return json({error:'此账号有一笔奖励正在处理或待核实，暂不能再次交卷。请稍后查询或联系管理员。'},409);
    const target = rewardFor(locked.highest_score);
    const amount = target-locked.reward_paid;
    if(amount===0) {
      await env.DB.prepare("UPDATE progress SET payout_state='idle' WHERE user_id=?").bind(user.user_id).run();
      return json({...result,highest_score:locked.highest_score,reward_paid:locked.reward_paid,awarded:0,payout_state:'idle'});
    }
    // 在调用转账前持久化状态。接口没有幂等键，超时后不能自动重发。
    await env.DB.prepare("UPDATE progress SET payout_state='checking',payout_target=? WHERE user_id=?").bind(target,user.user_id).run();
    let merchant;
    try { merchant=await emos('/api/pay/base',env.EMOS_MERCHANT_TOKEN); }
    catch {
      await env.DB.prepare("UPDATE progress SET payout_state='idle',payout_target=NULL WHERE user_id=?").bind(user.user_id).run();
      return json({...result,highest_score:locked.highest_score,reward_paid:locked.reward_paid,awarded:0,payout_state:'failed',error:'服务商校验失败，奖励尚未发放，可再次交卷补领。'});
    }
    if(merchant.name!=='lsp娱乐' || merchant.status!=='pass') {
      await env.DB.prepare("UPDATE progress SET payout_state='idle',payout_target=NULL WHERE user_id=?").bind(user.user_id).run();
      return json({...result,highest_score:locked.highest_score,reward_paid:locked.reward_paid,awarded:0,payout_state:'failed',error:'发奖服务商配置不正确，奖励尚未发放。'});
    }
    await env.DB.prepare("UPDATE progress SET payout_state='sending' WHERE user_id=?").bind(user.user_id).run();
    let transfer;
    try {
      transfer=await fetch(API+'/api/pay/transfer',{method:'POST',headers:{Authorization:`Bearer ${env.EMOS_MERCHANT_TOKEN}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({user_id:user.user_id,carrot:amount}),signal:AbortSignal.timeout(20000)});
      const body=await transfer.json();
      if(!transfer.ok || !Number.isFinite(body.deduct) || !Number.isFinite(body.carrot)) throw new Error('无法确认转账结果');
      await env.DB.prepare("UPDATE progress SET reward_paid=?,payout_state='idle',payout_target=NULL WHERE user_id=?").bind(target,user.user_id).run();
      return json({...result,highest_score:locked.highest_score,reward_paid:target,awarded:amount,payout_state:'idle'});
    } catch {
      await env.DB.prepare("UPDATE progress SET payout_state='unknown' WHERE user_id=?").bind(user.user_id).run();
      return json({...result,highest_score:locked.highest_score,reward_paid:locked.reward_paid,awarded:0,payout_state:'unknown',error:'转账结果待核实。已保留成绩，请联系管理员核对到账；系统不会自动重复扣款。'});
    }
  }
  return json({error:'页面不存在。'},404);
}

export default {
  async fetch(req,env) {
    try { return await handle(req,env); }
    catch { return json({error:'请求处理失败，请稍后重试。'},502); }
  },
};
