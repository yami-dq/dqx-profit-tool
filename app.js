// v7.27 simple access gate.
// This is a lightweight sharing gate, not server-side authentication.
// Change this one value when you want to rotate the Discord passphrase.
const ACCESS_PHRASE="kakera";
const ACCESS_KEY="dqx-profit-access-v1";
function initAccessGate(){
  const gate=document.getElementById("accessGate"),input=document.getElementById("accessPhrase");
  const submit=document.getElementById("accessSubmit"),error=document.getElementById("accessError");
  if(!gate||!input||!submit) return;
  if(localStorage.getItem(ACCESS_KEY)==="ok"){gate.hidden=true;return;}
  gate.hidden=false;
  document.documentElement.classList.add("access-locked");
  const tryOpen=()=>{
    if(input.value===ACCESS_PHRASE){
      localStorage.setItem(ACCESS_KEY,"ok");
      gate.hidden=true;document.documentElement.classList.remove("access-locked");
      input.value="";error.textContent="";
    }else{
      error.textContent="合言葉が違います。";
      input.select();
    }
  };
  submit.addEventListener("click",tryOpen);
  input.addEventListener("keydown",e=>{if(e.key==="Enter")tryOpen();});
  setTimeout(()=>input.focus(),0);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initAccessGate);
else initAccessGate();

const STORAGE_KEY = "dqx-profit-v7.7";
const PREV75_KEY = "dqx-profit-v7.5";
const PREV74_KEY = "dqx-profit-v7.4";
const PREV73_KEY = "dqx-profit-v7.3";
const PREV72_KEY = "dqx-profit-v7.2";
const PREV_KEY = "dqx-profit-v7";
const LEGACY_KEY = "dqx-profit-v5";
const yen = new Intl.NumberFormat("ja-JP");

const state = {
  activeMode: "kisei", activeTab: "counter", soundEnabled: true,
  modes: {
    kisei: { label:"輝晶核", saleMethod:"bazaar", prices:{core:1280000,fragment:15000,cell:103000}, mealRuns:7, targetProfit:500000, drops:[], timing:{mealStart:null,battleStart:null,laps:[],cotton:[],mealEnd:null} },
    senkisei: { label:"閃輝晶核", saleMethod:"bazaar", prices:{core:0,fragment:0,cell:0}, mealRuns:5, targetProfit:500000, drops:[], timing:{mealStart:null,battleStart:null,laps:[],cotton:[],mealEnd:null} }
  }
};

function currentMode(){ return state.modes[state.activeMode]; }
function feeRate(mode=currentMode()){ return mode.saleMethod === "moomon" ? 1 : .95; }

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(PREV75_KEY) || localStorage.getItem(PREV74_KEY) || localStorage.getItem(PREV73_KEY) || localStorage.getItem(PREV72_KEY)||localStorage.getItem(PREV_KEY) || localStorage.getItem(LEGACY_KEY);
  if(!raw) return;
  try{
    const p=JSON.parse(raw);
    if(p.activeMode) state.activeMode=p.activeMode;
    if(typeof p.soundEnabled === "boolean") state.soundEnabled=p.soundEnabled;
    for(const key of ["kisei","senkisei"]){
      if(!p.modes?.[key]) continue;
      const old=p.modes[key];
      state.modes[key]={...state.modes[key],...old,prices:{...state.modes[key].prices,...(old.prices||{})},drops:Array.isArray(old.drops)?old.drops:[],timing:{...state.modes[key].timing,...(old.timing||{})}};
    }
  }catch(e){}
}
function saveState(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

function counts(drops=currentMode().drops){
  return drops.reduce((a,d)=>{ if(d in a) a[d]++; return a; },{"45":0,"75":0,core:0,wipe:0});
}
function successfulEntries(drops=currentMode().drops){ const c=counts(drops); return c["45"]+c["75"]+c.core; }
function battleRecords(drops=currentMode().drops){
  return drops.map((result,index)=>({number:index+1,result}));
}
function completedBattles(drops=currentMode().drops){ return drops.length; }
function startedBattles(drops=currentMode().drops){ return drops.length; }
function battleProfit(battle,mode=currentMode()){
  const m=expectedModel();
  const result=battle.result;
  const fragments=result==="45"?45:result==="75"?75:0;
  const cores=result==="core"?1:0;
  const sales=(cores+fragments/m.exchangeRate)*mode.prices.core*feeRate(mode);
  const perBattleCellCost=(m.cellsPerMochi/m.resultsPerMochi)*mode.prices.cell;
  return sales-perBattleCellCost;
}
function currentActualProfit(mode=currentMode()){ return battleRecords(mode.drops).reduce((sum,b)=>sum+battleProfit(b,mode),0); }
function expectedModel(){ return { fragmentsPerResult:54, corePerResult:.1, resultsPerMochi:4, cellsPerMochi:30, exchangeRate:99 }; }
function calcExpectedProfit(cellPrice=currentMode().prices.cell, mode=currentMode()){
  const m=expectedModel(), fee=feeRate(mode), results=mode.mealRuns*m.resultsPerMochi;
  const cores=(m.fragmentsPerResult*results/m.exchangeRate)+(m.corePerResult*results);
  return cores*mode.prices.core*fee - mode.mealRuns*m.cellsPerMochi*cellPrice;
}
function cellLimitForProfit(target,mode=currentMode()){
  if(mode.mealRuns<=0) return 0;
  const m=expectedModel(), results=mode.mealRuns*m.resultsPerMochi;
  const cores=(m.fragmentsPerResult*results/m.exchangeRate)+(m.corePerResult*results);
  const sales=cores*mode.prices.core*feeRate(mode);
  return Math.max(0,(sales-target)/(mode.mealRuns*m.cellsPerMochi));
}

function setMode(mode){ state.activeMode=mode; saveState(); render(); }
function setTab(tab){ state.activeTab=tab; render(); }
function setSaleMethod(method){ currentMode().saleMethod=method; saveState(); render(); }
function setSoundEnabled(v){ state.soundEnabled=v; saveState(); }
function changeMealRuns(delta){ currentMode().mealRuns=Math.max(1,Math.min(99,currentMode().mealRuns+delta)); saveState(); render(); }

let audioCtx;
let audioPrimed=false;
function ensureAudioContext(){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass) return null;
  if(!audioCtx || audioCtx.state==="closed") audioCtx=new AudioContextClass({latencyHint:"interactive"});
  return audioCtx;
}
async function unlockAudio(){
  if(!state.soundEnabled) return null;
  try{
    const ctx=ensureAudioContext();
    if(!ctx) return null;
    if(ctx.state==="suspended") await ctx.resume();
    if(!audioPrimed && ctx.state==="running"){
      const o=ctx.createOscillator(),g=ctx.createGain();
      g.gain.setValueAtTime(.00001,ctx.currentTime);
      o.connect(g);g.connect(ctx.destination);
      o.start(ctx.currentTime);o.stop(ctx.currentTime+.012);
      audioPrimed=true;
    }
    return ctx;
  }catch(e){ return null; }
}
async function playConfirmSound(){
  if(!state.soundEnabled) return;
  const ctx=await unlockAudio();
  if(!ctx || ctx.state!=="running") return;
  try{
    const o=ctx.createOscillator(),g=ctx.createGain(),now=ctx.currentTime;
    o.type="sine";o.frequency.setValueAtTime(720,now);
    g.gain.setValueAtTime(.001,now);
    g.gain.exponentialRampToValueAtTime(.06,now+.006);
    g.gain.exponentialRampToValueAtTime(.001,now+.075);
    o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+.08);
  }catch(e){}
}
// iOS/PWA: resume/prime audio directly from each user gesture.
function primeAudioFromGesture(){ unlockAudio(); }
document.addEventListener("pointerdown",primeAudioFromGesture,{passive:true});
document.addEventListener("touchstart",primeAudioFromGesture,{passive:true});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") audioPrimed=false;
});
function fmtDuration(ms){ if(!Number.isFinite(ms)||ms<0) return "-"; const sec=Math.round(ms/1000),m=Math.floor(sec/60),s=sec%60; return `${m}:${String(s).padStart(2,"0")}`; }
function startBattle(){ const m=currentMode(), now=Date.now(); if(m.timing.mealStart && !m.timing.mealEnd){showToast("計測中です");return;} m.timing.mealStart=now;m.timing.mealEnd=null;m.timing.battleStart=null;m.timing.laps=[];m.timing.cotton=[]; saveState(); playConfirmSound(); render(); }
function useCotton(){ const m=currentMode(); if(state.activeMode!=="senkisei") return; if(!m.timing.mealStart || m.timing.mealEnd){showToast("先に計測開始してください");return;} const now=Date.now();m.timing.cotton.push(now-m.timing.mealStart);saveState();playConfirmSound();renderTiming();showToast("わたあめ効果を15:00に更新"); }
function finishMeal(){ const m=currentMode(); if(!m.timing.mealStart || m.timing.mealEnd){showToast("計測が始まっていません");return;} m.timing.mealEnd=Date.now();m.timing.battleStart=null;saveState();playConfirmSound();render(); }
function addDrop(type){
  const m=currentMode(), now=Date.now(); m.drops.push(type);
  m.timing.laps.push(m.timing.mealStart && !m.timing.mealEnd ? now-m.timing.mealStart : null);
  saveState(); playConfirmSound(); flashInput(type); render();
}
function undoLast(){ if(!currentMode().drops.length) return; const m=currentMode();m.drops.pop();m.timing.laps.pop();saveState();render(); }
function resetRun(){ if(!confirm(`${currentMode().label} の今回の周回記録をリセットしますか？\n価格設定は残ります。`)) return; const m=currentMode();m.drops=[];m.timing={mealStart:null,battleStart:null,laps:[],cotton:[],mealEnd:null}; saveState(); render(); }
function resetAll(){ resetRun(); }
function updatePrices(){ const m=currentMode(); m.prices.core=+corePrice.value||0; m.prices.fragment=+fragmentPrice.value||0; m.prices.cell=+cellPrice.value||0; saveState(); renderAnalysis(); }
function updateTarget(){ currentMode().targetProfit=Math.max(0,+targetProfit.value||0); saveState(); renderAnalysis(); }

function labelFor(type){ return type==="core"?"核":type==="wipe"?"全滅":`${type}個`; }
function flashInput(type){
  requestAnimationFrame(()=>{
    const el=document.getElementById("lastInput"), btn=document.getElementById(type==="core"?"btnCore":type==="wipe"?"btnWipe":`btn${type}`);
    el?.classList.add("flash"); btn?.classList.add("pressed");
    setTimeout(()=>{el?.classList.remove("flash");btn?.classList.remove("pressed")},260);
  });
}
function showToast(msg){ const t=document.getElementById("toast"); t.textContent=msg;t.classList.remove("hidden");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add("hidden"),1800); }

function render(){
  const m=currentMode(), c=counts();
  modeKisei.classList.toggle("active",state.activeMode==="kisei"); modeSenkisei.classList.toggle("active",state.activeMode==="senkisei");
  for(const tab of ["counter","analysis","settings"]){ document.getElementById(`${tab}View`).classList.toggle("hidden",state.activeTab!==tab); document.getElementById(`tab${tab[0].toUpperCase()+tab.slice(1)}`).classList.toggle("active",state.activeTab===tab); }
  count45.textContent=c["45"];count75.textContent=c["75"];countCore.textContent=c.core;countWipe.textContent=c.wipe;
  const rounds=startedBattles(m.drops), profit=Math.round(currentActualProfit(m));
  roundCount.textContent=rounds;
  currentProfit.textContent=`${profit>=0?"+":"−"}${yen.format(Math.abs(profit))} G`;
  currentProfit.classList.toggle("positive",profit>0);
  currentProfit.classList.toggle("negative",profit<0);
  const last=m.drops.at(-1), lap=m.timing.laps.at(-1); lastInput.textContent=last?`直前：${labelFor(last)} ✓${lap!=null?`　${fmtDuration(lap)}`:""}`:"直前：なし"; renderTiming();
  renderAnalysis(); renderSettings();
}

function renderTiming(){
  const m=currentMode(),t=m.timing,now=Date.now();
  battleTimer.textContent=t.mealStart&&!t.mealEnd?fmtDuration(now-t.mealStart):t.mealEnd?`終了 ${fmtDuration(t.mealEnd-t.mealStart)}`:"待機中";
  const end=t.mealEnd||now, mealMs=t.mealStart?end-t.mealStart:null;
  mealTime.textContent=mealMs!=null?fmtDuration(mealMs):"-";
  const battles=m.drops.length; avgBattleTime.textContent=(battles>0 && mealMs!=null)?fmtDuration(mealMs/battles):"-";
  const cottonVisible=state.activeMode==="senkisei";
  cottonBtn?.classList.toggle("hidden",!cottonVisible); cottonTimer?.classList.toggle("hidden",!cottonVisible); timerTools?.classList.toggle("no-cotton",!cottonVisible);
  if(cottonVisible){
    const lastCotton=t.cotton.length?t.cotton[t.cotton.length-1]:null;
    if(lastCotton==null){ cottonTimer.textContent=t.mealStart&&!t.mealEnd?"未使用":"-"; cottonTimer.className="cotton-timer"; }
    else {
      const elapsedFromStart=(t.mealEnd||now)-t.mealStart, since=Math.max(0,elapsedFromStart-lastCotton), remain=Math.max(0,15*60*1000-since);
      cottonTimer.textContent=remain>0?`残り ${fmtDuration(remain)}`:"効果切れ";
      cottonTimer.className=`cotton-timer ${remain<=0?"cotton-expired":remain<=3*60*1000?"cotton-warning":"cotton-active"}`;
    }
  }
  const profit=currentActualProfit(m); hourlyProfit.textContent=(mealMs&&mealMs>0)?`${profit>=0?"+":"−"}${yen.format(Math.abs(Math.round(profit*3600000/mealMs)))} G/h`:"-";
}
function renderSettings(){ const m=currentMode();corePrice.value=m.prices.core;fragmentPrice.value=m.prices.fragment;cellPrice.value=m.prices.cell;soundEnabled.checked=state.soundEnabled;saleBazaar.classList.toggle("active",m.saleMethod==="bazaar");saleMoomon.classList.toggle("active",m.saleMethod==="moomon"); }
function renderAnalysis(){
  const m=currentMode(), c=counts(), battles=battleRecords(m.drops), battleCount=battles.length;
  const fragments=c["45"]*45+c["75"]*75;
  mealRuns.textContent=`${m.mealRuns}餅`; targetProfit.value=m.targetProfit;
  const ep=calcExpectedProfit();
  document.getElementById("expectedProfit").textContent=`${ep>=0?"+":"−"}${yen.format(Math.abs(Math.round(ep)))} G`;
  breakEvenCell.textContent=`${yen.format(Math.floor(cellLimitForProfit(0)))} G`;
  targetCellLabel.textContent=`${yen.format(m.targetProfit)}G確保の細胞上限`;
  targetCellPrice.textContent=`${yen.format(Math.floor(cellLimitForProfit(m.targetProfit)))} G`;
  sampleCount.textContent=`${battleCount}戦`; actualBattleCount.textContent=`${battleCount}戦`;
  actualFragmentTotal.textContent=`${yen.format(fragments)}個`;
  actualFragments.textContent=battleCount?`${(fragments/battleCount).toFixed(1)}個/戦`:"-";
  actualCoreDrops.textContent=`${c.core}個`;
  const exchange=Math.floor(fragments/99), remainder=fragments%99;
  actualExchangeCores.textContent=`${exchange}個`;
  actualRemainder.textContent=`${remainder}個`;
  actualTotalCores.textContent=`${exchange+c.core}個`;
  chartCurrentCell.textContent=`${yen.format(m.prices.cell)} G`;
  chartTargetCell.textContent=`${yen.format(Math.floor(cellLimitForProfit(m.targetProfit)))} Gまで`;
  chartBreakEvenCell.textContent=`${yen.format(Math.floor(cellLimitForProfit(0)))} Gまで`;
  renderBattleLog();
  renderDropPieChart();
  if(state.activeTab==="analysis") drawPriceProfitChart();
  if(state.activeTab==="counter") drawRunProfitChart();
}
function renderBattleLog(){
  const mode=currentMode(), battles=battleRecords(mode.drops);
  logCount.textContent=`${battles.length}戦`;
  if(!battles.length){ battleLog.innerHTML='<div class="empty-log">まだ記録がありません</div>'; return; }
  let total=0;
  const rows=battles.map(b=>{ total+=battleProfit(b,mode); return {...b,total}; }).reverse();
  battleLog.innerHTML=rows.map(b=>{
    const cls=b.result==="core"?"result-core":b.result==="wipe"?"result-wipe":"";
    const result=labelFor(b.result); const lap=mode.timing.laps[b.number-1];
    const sign=b.total>=0?"+":"−";
    return `<div class="battle-log-row"><span>${b.number}</span><span class="${cls}">${result}</span><span>${sign}${yen.format(Math.abs(Math.round(b.total)))} G${lap!=null?` / ${fmtDuration(lap)}`:""}</span></div>`;
  }).join("");
}

function renderDropPieChart(){
  const canvas=document.getElementById("dropPieChart"), legend=document.getElementById("dropPieLegend"), badge=document.getElementById("dropChartCount");
  if(!canvas || !legend || !badge) return;
  const c=counts(), total=currentMode().drops.length;
  badge.textContent=`${total}戦`;
  const items=[
    {key:"45",label:"45個",value:c["45"],color:"#58a6ff"},
    {key:"75",label:"75個",value:c["75"],color:"#a371f7"},
    {key:"core",label:"核",value:c.core,color:"#f2cc60"},
    {key:"wipe",label:"全滅",value:c.wipe,color:"#ff7b72"}
  ];
  legend.innerHTML=items.map(x=>{
    const pct=total?x.value/total*100:0;
    return `<div class="drop-legend-row"><span class="drop-legend-dot" style="background:${x.color}"></span><span class="drop-legend-name">${x.label}</span><strong>${x.value}回</strong><span>${pct.toFixed(1)}%</span></div>`;
  }).join("");

  const cssSize=Math.min(300,Math.max(220,canvas.parentElement?.clientWidth||260));
  const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
  canvas.style.width=`${cssSize}px`; canvas.style.height=`${cssSize}px`;
  canvas.width=Math.round(cssSize*dpr); canvas.height=Math.round(cssSize*dpr);
  const ctx=canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cssSize,cssSize);
  const cx=cssSize/2,cy=cssSize/2,r=cssSize*.39,inner=r*.57;
  if(!total){
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.arc(cx,cy,inner,0,Math.PI*2,true);
    ctx.fillStyle="#21262d";ctx.fill("evenodd");
  }else{
    let start=-Math.PI/2;
    items.forEach(x=>{
      if(!x.value) return;
      const end=start+Math.PI*2*x.value/total;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,end);ctx.closePath();ctx.fillStyle=x.color;ctx.fill();
      start=end;
    });
    ctx.beginPath();ctx.arc(cx,cy,inner,0,Math.PI*2);ctx.fillStyle="#161b22";ctx.fill();
  }
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.fillStyle="#f0f6fc";ctx.font="800 28px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";
  ctx.fillText(`${total}`,cx,cy-7);
  ctx.fillStyle="#8b949e";ctx.font="600 12px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";
  ctx.fillText("戦闘",cx,cy+18);
}

function drawPriceProfitChart(){
  const canvas=priceProfitChart, mode=currentMode();
  const W=720,H=460,L=78,R=28,T=34,B=82,ctx=prepareCanvas(canvas,W,H);
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#0d1117";ctx.fillRect(0,0,W,H);
  const breakEven=cellLimitForProfit(0), current=mode.prices.cell, targetCell=cellLimitForProfit(mode.targetProfit);
  // 輝晶核（ドグ）は重要な3価格が近接しやすいため、その範囲を自動ズームする。
  let xMin=0, xMax;
  if(state.activeMode==="kisei"){
    const keyPrices=[current,targetCell,breakEven].filter(Number.isFinite);
    const lo=Math.min(...keyPrices), hi=Math.max(...keyPrices);
    const span=Math.max(hi-lo,10000);
    const margin=Math.max(10000,span*.55);
    xMin=Math.max(0,Math.floor((lo-margin)/10000)*10000);
    xMax=Math.ceil((hi+margin)/10000)*10000;
    if(xMax-xMin<40000){
      const mid=(lo+hi)/2; xMin=Math.max(0,Math.floor((mid-20000)/10000)*10000); xMax=xMin+40000;
    }
  }else{
    xMax=Math.max(10000,Math.ceil(Math.max(current*1.35,breakEven*1.2)/10000)*10000);
  }
  const pts=[];for(let i=0;i<=80;i++){const x=xMin+(xMax-xMin)*i/80;pts.push([x,calcExpectedProfit(x)]);}
  const ys=pts.map(p=>p[1]).concat([0,mode.targetProfit]);let yMin=Math.min(...ys),yMax=Math.max(...ys);const pad=Math.max((yMax-yMin)*.12,100000);yMin-=pad;yMax+=pad;
  const sx=x=>L+(x-xMin)/(xMax-xMin)*(W-L-R), sy=y=>T+(yMax-y)/(yMax-yMin)*(H-T-B);
  ctx.font="400 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.lineWidth=1;ctx.strokeStyle="#30363d";ctx.fillStyle="#8b949e";
  for(let i=0;i<=4;i++){const y=yMin+(yMax-yMin)*i/4,py=sy(y);ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(W-R,py);ctx.stroke();ctx.textAlign="right";ctx.fillText(`${Math.round(y/10000)}`,L-10,py+7);}
  // 細胞価格は1万G刻みの補助グリッドで位置を読めるようにする。通常の数値ラベルは表示しない。
  ctx.save();ctx.strokeStyle="#484f58";ctx.lineWidth=1.35;
  const xSpan=xMax-xMin, xGridStep=xSpan<=60000?10000:xSpan<=120000?20000:40000;
  for(let x=Math.ceil(xMin/xGridStep)*xGridStep;x<=xMax;x+=xGridStep){const px=sx(x);ctx.beginPath();ctx.moveTo(px,T);ctx.lineTo(px,H-B);ctx.stroke();}
  ctx.restore();
  // 横軸の端点だけ通常目盛りとして表示する（単位は軸ラベル側）。
  ctx.fillStyle="#8b949e";ctx.font="400 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";
  ctx.textAlign="center";ctx.fillText(Number((xMin/10000).toFixed(0)).toString(),sx(xMin),H-B+28);ctx.fillText(Number((xMax/10000).toFixed(0)).toString(),sx(xMax),H-B+28);
  const drawHLine=(value,color,dash=[],xEnd=W-R)=>{if(value<yMin||value>yMax)return;ctx.save();ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(L,sy(value));ctx.lineTo(xEnd,sy(value));ctx.stroke();ctx.restore();};
  // Horizontal threshold guides stop at their own price intersections.
  if(Number.isFinite(breakEven)&&breakEven>=xMin&&breakEven<=xMax) drawHLine(0,"#f85149",[8,6],sx(breakEven));
  if(Number.isFinite(targetCell)&&targetCell>=xMin&&targetCell<=xMax) drawHLine(mode.targetProfit,"#d29922",[8,6],sx(targetCell));
  // 利益軸の補助値。軸目盛りと重ならないようプロット領域の内側に置く。
  if(yMin<=0&&yMax>=0){
    ctx.fillStyle="#f85149";ctx.font="600 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="left";
    ctx.fillText("0",L+8,sy(0)+20);
  }
  if(mode.targetProfit>=yMin&&mode.targetProfit<=yMax){
    const targetLabel=Number((mode.targetProfit/10000).toFixed(2)).toString();
    ctx.fillStyle="#d29922";ctx.font="600 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="left";
    ctx.fillText(targetLabel,L+8,sy(mode.targetProfit)-10);
  }
  // 重要価格ラベルは原則同じ高さ。実際の文字幅が衝突する場合だけ段違いにする。
  const importantPrices=[current,targetCell,breakEven].filter(v=>Number.isFinite(v)&&v>=xMin&&v<=xMax).sort((a,b)=>a-b);
  const labelText=v=>Number((v/10000).toFixed(2)).toString();
  const labelRow=new Map();
  ctx.save();
  ctx.font='600 16px system-ui,-apple-system,BlinkMacSystemFont,"Yu Gothic",sans-serif';
  let placed=[];
  importantPrices.forEach(v=>{
    const x=sx(v), half=ctx.measureText(labelText(v)).width/2;
    let row=0;
    while(placed.some(p=>p.row===row && Math.abs(x-p.x)<half+p.half+10)) row++;
    labelRow.set(v,row);
    placed.push({x,half,row});
  });
  ctx.restore();
  const priceLabelY=v=>H-B+28+(labelRow.get(v)||0)*22;
  if(Number.isFinite(targetCell)&&targetCell>=xMin&&targetCell<=xMax&&mode.targetProfit>=yMin&&mode.targetProfit<=yMax){
    const tx=sx(targetCell), ty=sy(mode.targetProfit);
    ctx.save();ctx.strokeStyle="#d29922";ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx,H-B);ctx.stroke();ctx.restore();
    ctx.fillStyle="#d29922";ctx.font="600 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="center";
    ctx.fillText(Number((targetCell/10000).toFixed(2)).toString(),tx,priceLabelY(targetCell));
  }
  // 黒字限界（利益0）から価格軸へ赤い縦破線と価格ラベル。
  if(Number.isFinite(breakEven)&&breakEven>=xMin&&breakEven<=xMax&&yMin<=0&&yMax>=0){
    const bx=sx(breakEven), by=sy(0);
    ctx.save();ctx.strokeStyle="#f85149";ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx,H-B);ctx.stroke();ctx.restore();
    ctx.fillStyle="#f85149";ctx.font="600 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="center";
    ctx.fillText(Number((breakEven/10000).toFixed(2)).toString(),bx,priceLabelY(breakEven));
  }
  ctx.strokeStyle="#58a6ff";ctx.lineWidth=5;ctx.lineJoin="round";ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(sx(x),sy(y)):ctx.moveTo(sx(x),sy(y)));ctx.stroke();
  if(current>=xMin&&current<=xMax){
    const cx=sx(current), currentExpected=calcExpectedProfit(current), cy=sy(currentExpected);
    // Current price: vertical guide plus horizontal guide from the y-axis to the blue point.
    ctx.save();
    // Keep the green guide strictly inside the graph plotting rectangle.
    ctx.beginPath();ctx.rect(L,T,W-L-R,H-T-B);ctx.clip();
    ctx.strokeStyle="#3fb950";ctx.lineWidth=2;ctx.setLineDash([5,5]);
    ctx.beginPath();ctx.moveTo(cx,T);ctx.lineTo(cx,H-B);ctx.stroke();
    if(currentExpected>=yMin&&currentExpected<=yMax){ctx.beginPath();ctx.moveTo(L,cy);ctx.lineTo(cx,cy);ctx.stroke();}
    ctx.restore();
    ctx.fillStyle="#3fb950";ctx.font="600 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="center";
    ctx.fillText(Number((current/10000).toFixed(2)).toString(),cx,priceLabelY(current));
  }
  ctx.fillStyle="#e6edf3";ctx.font="600 22px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="left";ctx.fillText(`${mode.label} / ${mode.mealRuns}餅`,L,T-8);
  ctx.fillStyle="#8b949e";ctx.font="400 18px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="center";ctx.fillText("細胞価格（万G）",(L+W-R)/2,H-8);ctx.save();ctx.translate(20,(T+H-B)/2);ctx.rotate(-Math.PI/2);ctx.fillText("期待利益（万G）",0,0);ctx.restore();
  // 破線の意味と価格は上部カードで示す。グラフ内は現在価格での期待利益だけを強調する。
  if(current>=xMin&&current<=xMax){
    const currentExpected=calcExpectedProfit(current);
    const px=sx(current), py=sy(currentExpected);
    ctx.fillStyle="#58a6ff";ctx.beginPath();ctx.arc(px,py,7,0,Math.PI*2);ctx.fill();
    ctx.font="600 16px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign=px>W*0.62?"right":"left";ctx.fillStyle="#e6edf3";
    const tx=px>W*0.62?px-12:px+12;
    const ty=Math.max(T+22,Math.min(H-B-12,py-12));
    ctx.fillText(`期待利益 ${currentExpected>=0?"+":"−"}${yen.format(Math.abs(Math.round(currentExpected)))}G`,tx,ty);
  }
  ctx.fillStyle="#58a6ff";ctx.font="400 15px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="right";ctx.fillText(`核 ${yen.format(mode.prices.core)}G`,W-R,T+18);
}
function expectedProfitPerBattle(mode=currentMode()){
  const m=expectedModel();
  const cores=(m.fragmentsPerResult/m.exchangeRate)+m.corePerResult;
  return cores*mode.prices.core*feeRate(mode)-(m.cellsPerMochi/m.resultsPerMochi)*mode.prices.cell;
}
function prepareCanvas(canvas,logicalW,logicalH){
  const dpr=Math.max(1,window.devicePixelRatio||1);
  const pw=Math.round(logicalW*dpr), ph=Math.round(logicalH*dpr);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  const ctx=canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}
function drawRunProfitChart(){
  const canvas=runProfitChart,mode=currentMode();
  const W=720,H=400,L=78,R=28,T=34,B=58,ctx=prepareCanvas(canvas,W,H);
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#0d1117";ctx.fillRect(0,0,W,H);
  const battles=battleRecords(mode.drops); let total=0;
  const actual=[[0,0]]; battles.forEach((b,i)=>{total+=battleProfit(b,mode);actual.push([i+1,total]);});
  const n=Math.max(1,battles.length), epb=expectedProfitPerBattle(mode);
  const expected=Array.from({length:n+1},(_,i)=>[i,epb*i]);
  const vals=actual.concat(expected).map(p=>p[1]).concat([0]); let yMin=Math.min(...vals),yMax=Math.max(...vals);
  const pad=Math.max((yMax-yMin)*.15,100000);yMin-=pad;yMax+=pad;
  const sy=y=>T+(yMax-y)/(yMax-yMin)*(H-T-B);
  ctx.font="400 18px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.strokeStyle="#30363d";ctx.fillStyle="#8b949e";ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=yMin+(yMax-yMin)*i/4,py=sy(y);ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(W-R,py);ctx.stroke();ctx.textAlign="right";ctx.fillText(`${Math.round(y/10000)}万`,L-9,py+6);}
  // 戦闘数は意味のある4戦刻みで固定（0,4,8,12...）。末尾が4の倍数でなくても軸範囲は次の4戦まで確保する。
  const xAxisMax=Math.max(4,Math.ceil(n/4)*4);
  const sx=x=>L+x/xAxisMax*(W-L-R);
  for(let x=0;x<=xAxisMax;x+=4){const px=sx(x);ctx.beginPath();ctx.moveTo(px,T);ctx.lineTo(px,H-B);ctx.stroke();ctx.textAlign="center";ctx.fillText(x,px,H-B+27);}
  if(yMin<=0&&yMax>=0){ctx.strokeStyle="#6e7681";ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(L,sy(0));ctx.lineTo(W-R,sy(0));ctx.stroke();ctx.setLineDash([]);}
  ctx.strokeStyle="#8b949e";ctx.lineWidth=3;ctx.setLineDash([9,7]);ctx.beginPath();expected.forEach(([x,y],i)=>i?ctx.lineTo(sx(x),sy(y)):ctx.moveTo(sx(x),sy(y)));ctx.stroke();ctx.setLineDash([]);
  if(battles.length){ctx.strokeStyle="#58a6ff";ctx.lineWidth=5;ctx.lineJoin="round";ctx.beginPath();actual.forEach(([x,y],i)=>i?ctx.lineTo(sx(x),sy(y)):ctx.moveTo(sx(x),sy(y)));ctx.stroke();}
  // 最新実利益から利益軸へ青い水平破線。交点には万円単位の数字だけを表示。
  if(battles.length){
    const [lastX,lastY]=actual[actual.length-1],px=sx(lastX),py=sy(lastY);
    ctx.save();ctx.strokeStyle="#58a6ff";ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(px,py);ctx.stroke();ctx.restore();
    ctx.fillStyle="#58a6ff";ctx.font="600 15px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="left";
    ctx.fillText(Number((lastY/10000).toFixed(2)).toString(),L+7,Math.max(T+16,Math.min(H-B-8,py-8)));
  }
  ctx.font="400 15px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="right";ctx.fillStyle="#58a6ff";ctx.fillText("実利益",W-R,T+16);ctx.fillStyle="#8b949e";ctx.fillText("期待値（破線）",W-R,T+36);
  ctx.fillStyle="#8b949e";ctx.font="400 17px system-ui,-apple-system,BlinkMacSystemFont,\"Yu Gothic\",sans-serif";ctx.textAlign="center";ctx.fillText("戦闘数",(L+W-R)/2,H-9);
}


async function shareProfitChart(){
  drawPriceProfitChart();
  const canvas=priceProfitChart, mode=currentMode();
  const blob=await new Promise(r=>canvas.toBlob(r,"image/png")); if(!blob) return;
  const short=state.activeMode==="senkisei"?"閃核":"輝核", coreMan=Number((mode.prices.core/10000).toFixed(2)), cellMan=Number((mode.prices.cell/10000).toFixed(2));
  const file=new File([blob],`${short}_${coreMan}万_細胞${cellMan}万.png`,{type:"image/png"});
  const text=`${mode.label} ${mode.mealRuns}餅 / 核 ${yen.format(mode.prices.core)}G / ${yen.format(mode.targetProfit)}G確保の細胞上限 ${yen.format(Math.floor(cellLimitForProfit(mode.targetProfit)))}G`;
  try{ if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){await navigator.share({title:"培養利益計算",text,files:[file]});return;} }catch(e){if(e.name==="AbortError")return;}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast("グラフ画像を保存しました");
}
function openTerms(){termsModal.classList.remove("hidden")}function closeTerms(){termsModal.classList.add("hidden")}

corePrice.addEventListener("input",updatePrices);fragmentPrice.addEventListener("input",updatePrices);cellPrice.addEventListener("input",updatePrices);targetProfit.addEventListener("input",updateTarget);
window.addEventListener("click",e=>{if(e.target===termsModal)closeTerms()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeTerms()});
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
loadState();saveState();render();
// Keep the whole-session stopwatch visible while measurement is running.
setInterval(()=>{ if(state.activeTab==="counter" && currentMode().timing.mealStart && !currentMode().timing.mealEnd) renderTiming(); },250);
