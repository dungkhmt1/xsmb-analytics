/*
 * GET /api/golden/v3/backtest?limit=50
 *
 * Strict walk-forward:
 * For target day i, only rows [0..i-1] are used.
 * V2.8 current signal is deliberately excluded to avoid leakage.
 */
function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}
  });
}
const N=Array.from({length:100},(_,i)=>String(i).padStart(2,"0"));
function norm(v){const m=String(v??"").match(/\d+/);return m?m[0].padStart(5,"0").slice(-5):null;}
function rowsOf(rs){return (rs||[]).map(r=>{const s=norm(r.special);return s?{date:String(r.draw_date).slice(0,10),special:s,head:s.slice(0,2),tail:s.slice(-2)}:null}).filter(Boolean);}
function post(h,n,a=1,b=9){return (h+a)/(n+a+b);}
function score(rows,key,x){
  const n=rows.length, all=rows.filter(r=>r[key]===x).length;
  const r30=rows.slice(-30).filter(r=>r[key]===x).length;
  const r60=rows.slice(-60).filter(r=>r[key]===x).length;
  const expected=n/100;
  const expected30=Math.min(30,n)/100;
  const expected60=Math.min(60,n)/100;
  const f=50+25*((all-expected)/Math.sqrt(expected+1));
  const q30=50+25*((r30-expected30)/Math.sqrt(expected30+1));
  const q60=50+25*((r60-expected60)/Math.sqrt(expected60+1));
  const last=rows.length?rows[rows.length-1][key]:null;
  let trans=0,total=0;
  if(last){for(const r of rows.slice(0,-1)){}}
  for(let i=0;i<rows.length-1;i++){if(rows[i][key]===last){total++;if(rows[i+1][key]===x)trans++;}}
  const tr=50+(post(trans,total)*100-10)*2.5;
  const lastSeen=rows.map(r=>r[key]).lastIndexOf(x);
  const gap=lastSeen<0?n:n-1-lastSeen;
  const gaps=N.map(y=>{const j=rows.map(r=>r[key]).lastIndexOf(y);return j<0?n:n-1-j}).sort((a,b)=>a-b);
  const med=gaps[Math.floor(gaps.length/2)]||0;
  const cyc=100*Math.exp(-Math.abs(gap-med)/Math.max(2,med+1));
  return .35*Math.max(0,Math.min(100,f))+.25*Math.max(0,Math.min(100,q60))+.15*Math.max(0,Math.min(100,q30))+.15*Math.max(0,Math.min(100,tr))+.10*Math.max(0,Math.min(100,cyc));
}
function pick(rows,key){
  return N.map(x=>({x,s:score(rows,key,x)})).sort((a,b)=>b.s-a.s).slice(0,10);
}
function pairs(h,t){
  const out=[];
  for(const a of h)for(const b of t)out.push({head:a.x,tail:b.x,score:Math.sqrt(a.s*b.s)});
  out.sort((a,b)=>b.score-a.score);
  return out.slice(0,2);
}
export async function onRequestGet(context){
  try{
    const db=context.env.DB;
    const url=new URL(context.request.url);
    const requested=Math.min(200,Math.max(10,Number(url.searchParams.get("limit")||50)));
    const q=await db.prepare(`SELECT draw_date,special FROM results WHERE special IS NOT NULL AND TRIM(special)<>'' ORDER BY draw_date ASC`).all();
    const rows=rowsOf(q.results||[]);
    if(rows.length<30)return json({success:false,message:`Cần ít nhất 30 kỳ; hiện có ${rows.length}.`},422);
    const start=Math.max(30,rows.length-requested);
    let tested=0,pairHit=0,headHit=0,tailHit=0;
    const recent=[];
    for(let i=start;i<rows.length;i++){
      const train=rows.slice(0,i);
      const h=pick(train,"head"),t=pick(train,"tail"),ps=pairs(h,t);
      const actual=rows[i];
      const ph=ps.some(p=>p.head===actual.head&&p.tail===actual.tail);
      const hh=ps.some(p=>p.head===actual.head);
      const th=ps.some(p=>p.tail===actual.tail);
      tested++; if(ph)pairHit++; if(hh)headHit++; if(th)tailHit++;
      recent.push({date:actual.date,actualSpecial:actual.special,actualHead:actual.head,actualTail:actual.tail,pairs:ps.map(p=>({...p,score:Number(p.score.toFixed(2))})),pairHit:ph,headHit:hh,tailHit:th});
    }
    return json({
      success:true,version:"golden-v3.0.0",
      testedDraws:tested,
      pairHits:pairHit,headHits:headHit,tailHits:tailHit,
      pairHitRate:Number((pairHit/tested*100).toFixed(2)),
      headHitRate:Number((headHit/tested*100).toFixed(2)),
      tailHitRate:Number((tailHit/tested*100).toFixed(2)),
      leakage:"none: target day is excluded from training",
      recent:recent.slice(-30)
    });
  }catch(e){return json({success:false,message:e.message},500);}
}
