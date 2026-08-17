const $=s=>document.querySelector(s);
const els={
 refreshBtn:$("#refreshBtn"),sourceInfo:$("#sourceInfo"),
 pair1:$("#pair1"),pair2:$("#pair2"),pair1Score:$("#pair1Score"),pair2Score:$("#pair2Score"),
 headTop:$("#headTop"),tailTop:$("#tailTop"),method:$("#method"),
 performance:$("#performance"),backtestBtn:$("#backtestBtn"),backtestResult:$("#backtestResult"),
 lockBtn:$("#lockBtn"),actionMessage:$("#actionMessage"),historyBody:$("#historyBody"),copyBtn:$("#copyBtn")
};
let state=null;
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function dateVN(v){if(!v)return"--/--/----";const [y,m,d]=String(v).slice(0,10).split("-");return`${d}/${m}/${y}`}
async function get(url,opt){const r=await fetch(url,{cache:"no-store",...(opt||{})});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.message||`HTTP ${r.status}`);return d}
function renderRank(el,rows){
 el.innerHTML=(rows||[]).map((x,i)=>`
 <div class="rank-row"><b>#${i+1}</b><strong>${esc(x.number||x.x)}</strong><span>${Number(x.score??x.s).toFixed(1)}</span>
 <small>toàn kỳ ${esc(x.historicalRate??"")} · 30 kỳ ${esc(x.recent30??"")} · 60 kỳ ${esc(x.recent60??"")} · gan ${esc(x.gap??"")}</small></div>`).join("");
}
function render(d){
 state=d;
 els.sourceInfo.textContent=`Dữ liệu ${d.sampleSize} kỳ · đến ${dateVN(d.sourceLatestDate)} · dự đoán ${dateVN(d.predictionDate)} · ĐB gần nhất ${d.latestSpecial}`;
 const p=d.recommendation?.pairs||[];
 const a=p[0],b=p[1];
 els.pair1.textContent=a?`${a.head} — ${a.tail}`:"-- — --";
 els.pair2.textContent=b?`${b.head} — ${b.tail}`:"-- — --";
 els.pair1Score.textContent=a?`Joint score ${a.jointScore}`:"Score --";
 els.pair2Score.textContent=b?`Joint score ${b.jointScore}`:"Score --";
 renderRank(els.headTop,d.topHead);renderRank(els.tailTop,d.topTail);
 els.method.innerHTML=Object.entries(d.method?.weights||{}).map(([k,v])=>`<div><span>${esc(k)}</span><b>${Number(v*100).toFixed(0)}%</b></div>`).join("");
 const p2=d.performance||{};
 els.performance.innerHTML=[
 ["Đã khóa",p2.tracked||0],["Pair HIT",p2.pairHitRate+"%"],["Đầu HIT",p2.headHitRate+"%"],["Cuối HIT",p2.tailHitRate+"%"]
 ].map(x=>`<div class="stat-box"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join("");
}
function renderHistory(d){
 const rows=d.history||[];
 els.historyBody.innerHTML=rows.length?rows.map(r=>{
  const e=r.evaluation;
  const result=!e?"<span class='pending'>Chờ</span>":`
  <span class="${e.pairHits?"hit":"miss"}">${e.pairHits?"✓ Pair HIT":"✕ Pair trượt"}</span>
  <small>Đầu ${e.actualHead} · Cuối ${e.actualTail}</small>`;
  return `<tr><td>${dateVN(r.prediction_date)}</td><td>${(r.pairs||[]).map(p=>`${esc(p.head)}-${esc(p.tail)}`).join(" · ")}</td><td>${result}</td></tr>`;
 }).join(""):`<tr><td colspan="3" class="muted">Chưa có dữ liệu.</td></tr>`;
}
async function refresh(){
 els.refreshBtn.disabled=true;els.actionMessage.textContent="Đang tính...";
 try{
  const [d,h]=await Promise.all([get(`/api/golden/v3/dashboard?t=${Date.now()}`),get(`/api/golden/v3/history?limit=30&t=${Date.now()}`)]);
  render(d);renderHistory(h);els.actionMessage.textContent="";
 }catch(e){els.actionMessage.textContent=`Lỗi: ${e.message}`}finally{els.refreshBtn.disabled=false}
}
els.lockBtn.onclick=async()=>{
 els.lockBtn.disabled=true;els.actionMessage.textContent="Đang khóa...";
 try{const d=await get("/api/golden/v3/predict",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});els.actionMessage.textContent=d.existed?"Prediction hôm nay đã tồn tại.":"Đã khóa Golden V3.";await refresh()}catch(e){els.actionMessage.textContent=`Không khóa được: ${e.message}`}finally{els.lockBtn.disabled=false}
};
els.backtestBtn.onclick=async()=>{
 els.backtestBtn.disabled=true;els.backtestResult.textContent="Đang chạy strict walk-forward...";
 try{const d=await get("/api/golden/v3/backtest?limit=50");els.backtestResult.innerHTML=`${d.testedDraws} kỳ · Pair <b>${d.pairHitRate}%</b> · Đầu <b>${d.headHitRate}%</b> · Cuối <b>${d.tailHitRate}%</b><br><small>Leakage: ${esc(d.leakage)}</small>`}catch(e){els.backtestResult.textContent=`Backtest lỗi: ${e.message}`}finally{els.backtestBtn.disabled=false}
};
els.copyBtn.onclick=async()=>{
 const p=state?.recommendation?.pairs||[];if(!p.length)return;
 await navigator.clipboard.writeText(p.map(x=>`${x.head}-${x.tail}`).join("\n"));
 const old=els.copyBtn.textContent;els.copyBtn.textContent="Đã copy";setTimeout(()=>els.copyBtn.textContent=old,1200)
};
els.refreshBtn.onclick=refresh;refresh();
