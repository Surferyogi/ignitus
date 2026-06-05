const { useState, useMemo, useEffect, useCallback } = React;

let ALL_H = [];
let ALL_T = [];
let SENATE = [];
let FIRST_BUY = {};

const C={
  bg:         "#080B10",  // slightly deeper — less harsh pure black
  surface:    "#0F1520",  // card surface — warmer dark
  card:       "#141B28",  // card background — subtle lift from surface
  border:     "#243550",  // border — more visible for card separation
  accent:     "#00CFFF",  // cyan — unchanged (brand)
  accentDim:  "#008FAF",  // muted cyan
  green:      "#00D98A",  // green — slightly warmer, easier on eyes than pure cyan-green
  red:        "#FF5577",  // red — slightly less harsh
  gold:       "#FFC04A",  // gold — slightly warmer/brighter
  purple:     "#B088FF",  // purple — lighter, better contrast on dark bg
  text:       "#E8EDF8",  // primary text — high contrast but not pure white
  muted:      "#96A3BF",  // muted — bumped up for readability (was #8A97B8)
  mutedLight: "#B2BFDA",  // mutedLight — bumped for readable subtitles
};
const MKT={
  US:{symbol:"$",  code:"USD",r:1.27,  index:"S&P 500",   idxVal:7126.1,  idxYtd:14.8, idxChange:1.24},
  JP:{symbol:"¥",  code:"JPY",r:0.0080,index:"Nikkei 225",idxVal:35808,   idxYtd:-4.2, idxChange:0.78},
  EU:{symbol:"€",  code:"EUR",r:1.49,  index:"CAC 40",    idxVal:7842.3,  idxYtd:4.1,  idxChange:0.62},
  CN:{symbol:"HK$",code:"HKD",r:0.163, index:"HSI",       idxVal:21395,   idxYtd:8.3,  idxChange:0.54},
  GB:{symbol:"£",  code:"GBP",r:1.68,  index:"FTSE 100",  idxVal:8218.3,  idxYtd:5.1,  idxChange:-0.31},
  AU:{symbol:"A$", code:"AUD",r:0.81,  index:"ASX 200",   idxVal:7834.1,  idxYtd:3.7,  idxChange:-0.12},
  SG:{symbol:"S$", code:"SGD",r:1.0,   index:"STI",       idxVal:3892.4,  idxYtd:6.2,  idxChange:0.41},
};
const DIV_TAX={US:0.30, JP:0.20315, EU:0.15, SG:0, CN:0, GB:0};
const getDivTax=(mkt)=>DIV_TAX[mkt]||0;
const fmtTax=(mkt)=>{const t=getDivTax(mkt);return t>0?`${(t*100).toFixed(3).replace(/\.?0+$/,'')}% WHT`:null;};

const fmt=(n,d=2)=>n==null?"--":n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtPct=n=>n==null?"--":(n>=0?"+":"")+fmt(n)+"%";
const toSGD=(v,mkt)=>v*(MKT[mkt]?.r??1.36);
const fmtL=(n,mkt,d=2)=>n==null?"--":(MKT[mkt]?.symbol??"$")+fmt(Math.abs(n),d);
const fmtS=(n,d=2)=>n==null?"--":"S$"+fmt(Math.abs(n),d);
const SECTORS=["Technology","Healthcare","Financials","Consumer Disc.","Industrials","Energy","Utilities","Materials","Real Estate","Comm. Services","Consumer Staples"];
const MS_STYLES=["Large Growth","Large Blend","Large Value","Mid Growth","Mid Blend","Mid Value","Small Growth","Small Blend","Small Value"];
const SCOL=[C.accent,C.green,C.gold,C.purple,"#FF8C42","#FF4D6A","#62D2E8","#C084FC","#FDE68A","#A3E635","#FB923C"];

// Infer correct market code from ticker symbol suffix
// Used to validate and auto-correct wrong mkt assignments
function detectMktFromTicker(ticker){
  if(!ticker) return null;
  const t=ticker.toUpperCase().trim();
  if(t.endsWith('.HK'))  return 'CN';  // HSI — HK stocks
  if(t.endsWith('.SI'))  return 'SG';  // STI — Singapore stocks
  if(t.endsWith('.T'))   return 'JP';  // Nikkei — Japan stocks
  if(t.endsWith('.L'))   return 'GB';  // FTSE — UK stocks
  if(t.endsWith('.AX'))  return 'AU';  // ASX — Australia stocks
  if(t.endsWith('.PA')||t.endsWith('.DE')||t.endsWith('.AS')||
     t.endsWith('.MI')||t.endsWith('.F')||t.endsWith('.BR'))
                         return 'EU';  // European exchanges
  // No suffix — return null so DB mkt value is NOT overridden.
  // e.g. ESLOF is EU (OTC ticker, no dot suffix) — DB is authoritative.
  if(!t.includes('.'))   return null;
  return null; // unknown suffix — don't override
}

// Infer correct currency from market code
function mktToCcy(mkt){
  const MAP={US:'USD',SG:'SGD',CN:'HKD',JP:'JPY',GB:'GBP',EU:'EUR',AU:'AUD'};
  return MAP[mkt]||null;
}

const scoreH=h=>{
  const up=((h.intrinsic-h.price)/h.price)*100;
  const iv=Math.max(0,Math.min(10,Math.round(5+up/10)));
  const mt=h.moat==="Wide"?9:h.moat==="Narrow"?6:3;
  const dv=Math.min(10,Math.round(h.divYield*1.5+2));
  return{iv,mt,dv,all:Math.round(iv*0.4+mt*0.35+dv*0.25)};
};
const getRec=h=>{
  const iv=h.intrinsic||0;
  if(iv<=0) return{lbl:"—",col:C.muted}; // No IV — cannot derive recommendation
  const up=((h.intrinsic-h.price)/h.price)*100;
  if(up>15&&h.moat!=="None")return{lbl:"STRONG BUY",col:C.green};
  if(up>5)return{lbl:"BUY",col:"#72E5A0"};
  if(up>-10)return{lbl:"HOLD",col:C.gold};
  return{lbl:"SELL",col:C.red};
};
const buffettScore=h=>{
  const gainPct=((h.price-h.avgCost)/h.avgCost)*100;
  // Guard: upside is null when IV is not available. Avoids -100% phantom upside.
  const iv=h.intrinsic||0;
  const upside=iv>0?((iv-h.price)/h.price)*100:null;
  const moatPts=h.moat==="Wide"?30:h.moat==="Narrow"?15:0;
  const divPts=Math.min(20,h.divYield*4);
  // valuePts: 0 when IV unknown — honest, no phantom negative points
  const valuePts=upside!==null?(upside>20?25:upside>10?15:upside>0?8:0):0;
  const pe=h.peRatio;
  // FIX: pe=0 means MISSING DATA — require pe>0 to avoid phantom quality points
  const qualPts=(pe>0&&pe<25)?15:(pe>0&&pe<35)?8:0;
  const gainPts=gainPct>50?10:gainPct>20?5:0;
  const total=Math.round((moatPts+divPts+valuePts+qualPts+gainPts)*10)/10;
  let action,reason,col;
  if(upside===null){
    // No IV available — base decision on fundamentals (moat, PE, dividends, gain) only
    if(total>=65){
      action="BUY MORE";col=C.green;
      reason="Strong fundamentals — tap 🤖 on tile for intrinsic value";
    } else if(total>=50){
      action="ADD GRADUALLY";col="#72E5A0";
      reason="Good fundamentals — intrinsic value pending";
    } else if(total>=35){
      action="HOLD";col=C.gold;
      reason="Solid business — tap 🤖 on tile to search intrinsic value";
    } else {
      action="WATCH";col=C.mutedLight;
      reason="Intrinsic value unavailable — limited basis for conviction";
    }
  } else if(total>=65&&upside>10){
    action="BUY MORE";col=C.green;reason="Wide moat + undervalued";
  } else if(total>=50&&upside>0){
    action="ADD GRADUALLY";col="#72E5A0";reason="Good fundamentals, fair value";
  } else if(total>=35&&upside>-10){
    action="HOLD";col=C.gold;reason="Solid business, fairly priced";
  } else if(h.moat==="Wide"&&upside>-50){
    // Buffett principle: never sell a wonderful business just because it's temporarily overvalued.
    // Wide moat stocks get HOLD even when above IV, unless extreme (>50% overvalued).
    action="HOLD";col=C.gold;reason="Quality moat — hold, price above intrinsic value";
  } else if(h.moat==="Narrow"&&upside>-25){
    // Narrow moat + moderate overvaluation: watch, don't add
    action="WATCH";col=C.mutedLight;reason="Overvalued — await better entry point";
  } else if(h.moat==="None"){
    // No moat: much less tolerance for overvaluation
    action=upside<-15?"CONSIDER SELLING":"WATCH";
    col=upside<-15?C.red:C.mutedLight;
    reason=upside<-15?"No economic moat + overvalued":"No durable competitive advantage";
  } else {
    // Wide moat >50% above IV, or Narrow moat >25% above IV
    action="CONSIDER SELLING";col=C.red;
    reason=h.moat==="Wide"?"Extreme overvaluation — >50% above intrinsic value":"Overvalued + narrow moat";
  }
  return{score:total,action,reason,col};
};

function Bdg({label,bg,color}){
  return <span style={{fontSize:13,fontWeight:700,padding:"2px 6px",borderRadius:3,background:bg,color}}>{label}</span>;
}
function Chip({mkt}){
  return <span style={{fontSize:13,fontWeight:700,padding:"1px 5px",borderRadius:3,background:C.accent+"18",color:C.accent}}>{MKT[mkt]?.code||mkt}</span>;
}
function Tag({col,children}){
  return <span style={{display:"inline-block",padding:"2px 6px",borderRadius:3,fontSize:13,fontWeight:700,background:col+"20",color:col}}>{children}</span>;
}
function ScoreBar({score,max=10,color}){
  const pct=(score/max)*100;
  const col=color||(pct>=70?C.green:pct>=40?C.gold:C.red);
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <div style={{flex:1,height:4,borderRadius:2,background:C.border,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:2}}/>
      </div>
      <span style={{fontSize:14,fontWeight:700,color:col,minWidth:14,textAlign:"right"}}>{score}</span>
    </div>
  );
}

function Sparkline({data,color=C.accent,height=44,period="6m"}){
  if(!data||data.length<2)return null;
  const mn=Math.min(...data),mx=Math.max(...data),range=mx-mn||1;
  const W=300,H=height;
  const AXIS=20; // space for x-axis labels
  const TH=H+AXIS; // total svg height
  const pts=data.map((v,i)=>[
    (i/(data.length-1))*W,
    H-((v-mn)/range)*(H-8)-4
  ]);
  const path=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area=path+` L${W},${H} L0,${H} Z`;
  const gid="g"+color.replace(/[^a-zA-Z0-9]/g,"");

  const now=new Date();
  function getMarkers(){
    const n=data.length;
    if(period==="30d"){
      return [0,1,2,3,4].map(w=>({pos:Math.round((w/4)*n),label:w===0?"4w":w===1?"3w":w===2?"2w":w===3?"1w":"",tick:true}));
    } else if(period==="6m"){
      return Array.from({length:7},(_,i)=>({
        pos:Math.round((i/6)*n),
        label:new Date(now.getFullYear(),now.getMonth()-6+i,1).toLocaleString("default",{month:"short"}),
        tick:true
      }));
    } else if(period==="1y"){
      const quarters=Array.from({length:5},(_,i)=>({
        pos:Math.round((i/4)*n),
        label:new Date(now.getFullYear()-1+Math.floor((now.getMonth()+i*3)/12),((now.getMonth()+i*3)%12),1).toLocaleString("default",{month:"short"}),
        tick:true,major:true
      }));
      const monthTicks=Array.from({length:13},(_,i)=>({pos:Math.round((i/12)*n),label:"",tick:true,major:false}));
      return [...monthTicks,...quarters];
    } else {
      const years=period==="5y"?5:10;
      const yearMarks=Array.from({length:years+1},(_,i)=>({
        pos:Math.min(Math.round((i/years)*n),n-1),
        label:String(now.getFullYear()-years+i),
        tick:true,major:true
      }));
      const quarters=years*4;
      const qTicks=Array.from({length:quarters+1},(_,i)=>({
        pos:Math.min(Math.round((i/quarters)*n),n-1),
        label:"",tick:true,major:false
      }));
      return [...qTicks,...yearMarks];
    }
  }
  const allMarkers=getMarkers();
  const markers=allMarkers.filter(m=>m.pos>=0&&m.pos<data.length);

  return(
    <svg width="100%" viewBox={`0 0 ${W} ${TH}`} style={{display:"block",pointerEvents:"none"}}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Chart area */}
      <path d={area} fill={`url(#${gid})`}/>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* X-axis baseline */}
      <line x1="0" y1={H} x2={W} y2={H} stroke={C.border} strokeWidth="0.5"/>
      {/* X-axis markers — minor ticks and labeled major markers */}
      {markers.map((m,idx)=>{
        const x=data.length>1?(m.pos/(data.length-1))*W:0;
        const hasLabel=m.label&&m.label.length>0;
        const labeledMarkers=markers.filter(mk=>mk.label);
        const labelIdx=labeledMarkers.indexOf(m);
        const anchor=labelIdx===0?"start":labelIdx===labeledMarkers.length-1?"end":"middle";
        return(
          <g key={idx}>
            <line x1={x} y1={H} x2={x} y2={m.major===false?H+3:H+5} stroke={C.border} strokeWidth={m.major===false?0.4:0.7}/>
            {hasLabel&&<text x={x} y={H+15} textAnchor={anchor} fontSize="9" fill={C.muted}>{m.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function MiniSparkline({data,color=C.accent}){
  if(!data||data.length<2)return null;
  const mn=Math.min(...data),mx=Math.max(...data),range=mx-mn||1;
  const W=80,H=30;
  const pts=data.map((v,i)=>[(i/(data.length-1))*W,H-((v-mn)/range)*H*0.82-H*0.09]);
  const path=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return(
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function PerfChart({mktFilter,period,holdings,perfChartData,perfChartLoading,fetchPerfChartData}){
  const m=MKT[mktFilter];
  const idxName=mktFilter==="ALL"?"S&P 500":(m?.index||"Index");
  const key=mktFilter+"_"+period;
  const chartData=perfChartData?.[key];
  const isLoading=perfChartLoading?.[key];
  const PLBL={"30d":"30 Days","6m":"6 Months","1y":"1 Year","5y":"5 Years","all":"Max Available"};

  useEffect(()=>{
    if(holdings.length>0&&fetchPerfChartData) fetchPerfChartData(mktFilter,period);
  },[mktFilter,period,holdings.length]);

  if(isLoading) return(
    <div style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
      <div style={{fontSize:14,color:C.gold,animation:"pulse 1s ease-in-out infinite"}}>↻ Loading real market data...</div>
      <div style={{fontSize:13,color:C.muted}}>Fetching from Yahoo Finance</div>
    </div>
  );

  if(!chartData||chartData.portfolio.length<2) return(
    <div style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
      <div style={{fontSize:14,color:C.muted}}>No chart data</div>
      <button onClick={()=>fetchPerfChartData&&fetchPerfChartData(mktFilter,period)} style={{fontSize:14,padding:"4px 12px",borderRadius:5,border:`1px solid ${C.accent}`,background:"transparent",color:C.accent,cursor:"pointer"}}>Load Chart</button>
    </div>
  );

  const {portfolio,index:idxArr,timestamps:tsArr=[]}=chartData;
  const n=Math.min(portfolio.length,idxArr.length);
  const pH=portfolio.slice(0,n);
  const iH=idxArr.slice(0,n);
  // Data is already rebased to 100 at chart start (done in fetchPerfChartData).
  // No renormalisation needed here — use the series directly.
  const pN=pH;
  const iNorm=iH;
  const pL=pN[pN.length-1],iL=iNorm[iNorm.length-1];
  const pR=(pL-100).toFixed(1),iR=(iL-100).toFixed(1);

  const W=300,H=130,AXIS=20;
  const allV=[...pN,...iNorm],mn=Math.min(...allV)-2,mx=Math.max(...allV)+2;
  const toY=v=>H-((v-mn)/(mx-mn||1))*H*0.88-H*0.06;
  const toX=i=>(i/(n-1||1))*W;
  const pp=pN.map((v,i)=>`${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const ip=iNorm.map((v,i)=>`${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  const now=new Date();
  const markers=(()=>{
    if(period==="30d") return [0,1,2,3,4].map(w=>({pos:Math.round((w/4)*(n-1)),label:w===0?"4w":w===1?"3w":w===2?"2w":w===3?"1w":"",major:true}));
    if(period==="6m")  return Array.from({length:7},(_,i)=>({pos:Math.round((i/6)*(n-1)),label:new Date(now.getFullYear(),now.getMonth()-6+i,1).toLocaleString("default",{month:"short"}),major:true}));
    if(period==="1y"){
      const q=Array.from({length:5},(_,i)=>({pos:Math.round((i/4)*(n-1)),label:new Date(now.getFullYear()-1+Math.floor((now.getMonth()+i*3)/12),((now.getMonth()+i*3)%12),1).toLocaleString("default",{month:"short"}),major:true}));
      const mt=Array.from({length:13},(_,i)=>({pos:Math.round((i/12)*(n-1)),label:"",major:false}));
      return [...mt,...q];
    }
    // Derive actual chart start year from stored timestamps (real Yahoo Finance dates).
    // For "all" the index fetches 10 years but trimStart clips to when the portfolio
    // actually began — so we must NOT assume the chart spans a full 10 years.
    // Fall back to period-based estimate only if timestamps are absent.
    const startYear=tsArr.length>0
      ? new Date(tsArr[0]*1000).getFullYear()
      : now.getFullYear()-(period==="5y"?5:10);
    const endYear=tsArr.length>0
      ? new Date(tsArr[tsArr.length-1]*1000).getFullYear()
      : now.getFullYear();
    const spanYrs=Math.max(1,endYear-startYear);
    // Generate one label per year across the actual span
    const ym=Array.from({length:spanYrs+1},(_,i)=>({
      pos:Math.min(Math.round((i/spanYrs)*(n-1)),n-1),
      label:String(startYear+i),
      major:true
    }));
    // Minor ticks: quarterly
    const qt=Array.from({length:spanYrs*4+1},(_,i)=>({
      pos:Math.min(Math.round((i/(spanYrs*4))*(n-1)),n-1),
      label:"",
      major:false
    }));
    return [...qt,...ym];
  })();

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:6,fontSize:14}}>
        <span style={{color:C.accent}}>Portfolio <b style={{color:+pR>=0?C.green:C.red}}>{+pR>=0?"+":""}{pR}%</b></span>
        <span style={{color:C.mutedLight}}>{idxName} <b style={{color:+iR>=0?C.green:C.red}}>{+iR>=0?"+":""}{iR}%</b></span>
        <span style={{
          marginLeft:"auto",fontSize:12,fontWeight:700,color:C.green,
          background:C.green+"18",border:`1px solid ${C.green}40`,
          borderRadius:10,padding:"2px 7px",letterSpacing:"0.05em",flexShrink:0
        }}>● LIVE</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H+AXIS}`} style={{display:"block"}}>
        <defs>
          <linearGradient id="pGrMain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.22"/>
            <stop offset="100%" stopColor={C.accent} stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="iGrMain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.mutedLight} stopOpacity="0.1"/>
            <stop offset="100%" stopColor={C.mutedLight} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[25,50,75].map(pct=>{
          const y=toY(mn+(mx-mn)*(pct/100));
          return <line key={pct} x1={0} y1={y} x2={W} y2={y} stroke={C.border} strokeWidth="0.5" strokeDasharray="4,4"/>;
        })}
        <path d={ip+` L${W},${H} L0,${H} Z`} fill="url(#iGrMain)"/>
        <path d={ip} fill="none" stroke={C.mutedLight} strokeWidth="1" strokeDasharray="5,3" opacity="0.6"/>
        <path d={pp+` L${W},${H} L0,${H} Z`} fill="url(#pGrMain)"/>
        <path d={pp} fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"/>
        <circle cx={toX(n-1)} cy={toY(pL)} r="3.5" fill={C.accent}/>
        <circle cx={toX(n-1)} cy={toY(iL)} r="3" fill={C.mutedLight} opacity="0.7"/>
        <line x1="0" y1={H} x2={W} y2={H} stroke={C.border} strokeWidth="0.5"/>
        {markers.map((mk,i)=>{
          const x=(mk.pos/(n-1||1))*W;
          const labeled=markers.filter(mk2=>mk2.label);
          const li=labeled.indexOf(mk);
          const anchor=li===0?"start":li===labeled.length-1?"end":"middle";
          return(
            <g key={i}>
              <line x1={x} y1={H} x2={x} y2={mk.major?H+5:H+3} stroke={C.border} strokeWidth={mk.major?0.7:0.4}/>
              {mk.label&&<text x={x} y={H+15} textAnchor={anchor} fontSize="9" fill={C.muted}>{mk.label}</text>}
            </g>
          );
        })}
      </svg>
      {mktFilter!=="ALL"&&m&&(
        <div style={{marginTop:6,padding:"4px 8px",background:C.surface,borderRadius:5,fontSize:13,display:"flex",gap:10}}>
          <span style={{color:C.muted}}>Index: <b style={{color:C.text}}>{m.index}</b></span>
          <span style={{color:m.idxChange>=0?C.green:C.red}}>{m.idxChange>=0?"+":""}{m.idxChange}% today</span>
          <span style={{color:m.idxYtd>=0?C.green:C.red}}>YTD {m.idxYtd>=0?"+":""}{m.idxYtd}%</span>
        </div>
      )}
    </div>
  );
}

function DonutChart({data,size=96}){
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  let cum=-90;
  const r=38,cx=50,cy=50,sw=12,circ=2*Math.PI*r;
  return(
    <svg width={size} height={size} viewBox="0 0 100 100">
      {data.map((d,i)=>{
        const pct=d.value/total,dash=pct*circ,gap=circ-dash,rot=cum;
        cum+=pct*360;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw} strokeDasharray={`${dash} ${gap}`} transform={`rotate(${rot} ${cx} ${cy})`} opacity="0.9"/>;
      })}
      <circle cx={cx} cy={cy} r={r-sw/2-2} fill={C.card}/>
    </svg>
  );
}

function MktSelector({mktFilter,setMktFilter,holdings}){
  const mkts=["ALL",...[...new Set(holdings.map(h=>h.mkt))]];
  const IDX={"US":"S&P 500","SG":"STI","CN":"HSI","JP":"Nikkei","EU":"CAC 40","GB":"FTSE","AU":"ASX"};
  return(
    <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4}}>
      {mkts.map(m=>{
        const cnt=m==="ALL"?holdings.filter(h=>Number(h.shares)>0).length:holdings.filter(h=>h.mkt===m&&Number(h.shares)>0).length;
        const active=mktFilter===m;
        return(
          <button key={m} onClick={()=>setMktFilter(m)} style={{flexShrink:0,padding:"9px 13px",borderRadius:12,cursor:"pointer",background:active?C.accent:C.card,color:active?"#000":C.text,border:`1px solid ${active?C.accent:C.border}`,textAlign:"center",minWidth:64}}>
            <div style={{fontSize:15,fontWeight:800}}>{m==="ALL"?"ALL":m==="CN"?"HK":m}</div>
            <div style={{fontSize:13,color:active?"#00000088":C.muted}}>{cnt} stocks</div>
            {m!=="ALL"&&<div style={{fontSize:12,color:active?"#00000066":C.muted+"88"}}>{IDX[m]||""}</div>}
          </button>
        );
      })}
    </div>
  );
}

class ErrBoundary extends React.Component {
  constructor(p){ super(p); this.state = {err: null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err, info){ console.error("ErrBoundary:", err, info); }
  render(){
    if(this.state.err){
      return React.createElement("div", {
        style: {padding:20, margin:20, background:"#2a0a0a", border:"2px solid #ef4444",
                borderRadius:8, color:"#fca5a5", fontFamily:"monospace", fontSize:14}
      },
        React.createElement("div", {style:{color:"#ef4444",fontWeight:700,marginBottom:8}}, "Modal render error:"),
        React.createElement("div", null, String(this.state.err?.message || this.state.err)),
        React.createElement("button", {
          onClick: () => this.setState({err: null}),
          style: {marginTop:10, padding:"5px 12px", background:"#ef4444", color:"white",
                  border:"none", borderRadius:5, cursor:"pointer"}
        }, "Close")
      );
    }
    return this.props.children;
  }
}

// ── Search input with explicit Search button ──────────────────────────────────
// No debounce, no timers, no state updates while typing.
// User types freely, taps Search (or presses Enter) to filter.
// This is the only reliable way to prevent iOS keyboard dismissal.
const PortfolioSearchInput=React.memo(function PortfolioSearchInput({onSearch,onClear}){
  const inputRef=React.useRef(null);
  const clearRef=React.useRef(null);

  const doSearch=()=>{
    const v=(inputRef.current?.value||"").trim();
    if(clearRef.current){
      clearRef.current.style.visibility=v?"visible":"hidden";
      clearRef.current.style.pointerEvents=v?"auto":"none";
    }
    onSearch(v);
  };

  const doClear=()=>{
    if(inputRef.current) inputRef.current.value="";
    if(clearRef.current){
      clearRef.current.style.visibility="hidden";
      clearRef.current.style.pointerEvents="none";
    }
    onSearch("");
    onClear();
    inputRef.current?.focus();
  };

  return(
    <div style={{display:"flex",gap:6,marginBottom:10}}>
      <div style={{position:"relative",flex:1}}>
        <input
          ref={inputRef}
          placeholder="Search by name or ticker…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="search"
          style={{width:"100%",background:"#111827",border:"1px solid #2A3547",borderRadius:8,
            padding:"9px 36px 9px 12px",color:"#E2E8F0",fontSize:16,
            outline:"none",boxSizing:"border-box"}}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();doSearch();}}}
        />
        <button
          ref={clearRef}
          onMouseDown={e=>e.preventDefault()}
          onClick={doClear}
          style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",color:"#6B7A99",fontSize:18,cursor:"pointer",
            lineHeight:1,padding:"0 4px",display:"flex",alignItems:"center",
            visibility:"hidden",pointerEvents:"none"}}>
          ✕
        </button>
      </div>
      <button
        onMouseDown={e=>e.preventDefault()}
        onClick={doSearch}
        style={{flexShrink:0,padding:"9px 16px",borderRadius:8,
          background:"#3B82F6",border:"none",color:"#fff",
          fontSize:15,fontWeight:700,cursor:"pointer"}}>
        Search
      </button>
    </div>
  );
});


function App(){
  const [tab,setTab]=useState("portfolio");
  const [holdings,setHoldings]=useState(ALL_H);
  const [trades,setTrades]=useState(ALL_T);
  const [sel,setSel]=useState(null);
  const [mktFilter,setMktFilter]=useState("ALL");
  const [chartPeriod,setChartPeriod]=useState("6m");
  const [detailPeriod,setDetailPeriod]=useState("6m");
  const [groupBy,setGroupBy]=useState("sector");
  const searchInputRef=React.useRef(null);

  // ── Refs/state lifted from render functions — hooks must be at component level ──
  // renderTradesView refs (were React.useRef inside render fn — invalid)
  const tradeSearchRef=React.useRef(null);
  const tradeClearRef=React.useRef(null);
  // renderScreenView / ReconciliationView state
  const [reconFilter,setReconFilter]=useState("all");
  const [expandedTicker,setExpandedTicker]=useState(null);
  const [fixing,setFixing]=useState({});
  const [fixed,setFixed]=useState({});
  // renderHoldingDetail state (lifted — hooks invalid in render functions)
  const [insiderData,setInsiderData]=useState({});
  const [showAllBuy,setShowAllBuy]=useState(false);
  const [showAllSell,setShowAllSell]=useState(false);
  const [showValue,setShowValue]=useState(true);   // toggle portfolio value visibility
  const [holdingSort,setHoldingSort]=useState("default"); // default|best|worst|value|div
  const [tradeType,setTradeType]=useState("ALL");
  const [tradeSearch,setTradeSearch]=useState(""); // lifted to App so it survives TradesView remounts
  const [tradeDateFrom,setTradeDateFrom]=useState(""); // date range filter level 2
  const [tradeDateTo,setTradeDateTo]=useState("");
  const [insightTab,setInsightTab]=useState("performers");
  const [aiText,setAiText]=useState({});
  const [aiLoad,setAiLoad]=useState({});
  const [showTradeForm,setShowTradeForm]=useState(false);
  const [dupeWarning,setDupeWarning]=useState(null);   // {trade, pending} when duplicate detected
  const [deleteConfirmTrade,setDeleteConfirmTrade]=useState(null); // trade to confirm delete
  const [editConfirmTrade,setEditConfirmTrade]=useState(null);     // trade to confirm edit
  const [showPasteParser,setShowPasteParser]=useState(false); // broker msg parser
  const [pasteText,setPasteText]=useState("");
  const [parsedTrade,setParsedTrade]=useState(null);    // result of parse
  const [parseError,setParseError]=useState("");
  const [tickerSearchResults,setTickerSearchResults]=useState([]); // results from ticker_search action
  const [tickerSearchLoading,setTickerSearchLoading]=useState(false);
  const [editTradeId,setEditTradeId]=useState(null);
  const [tradeForm,setTradeForm]=useState({ticker:"",type:"BUY",date:new Date().toISOString().slice(0,10),price:"",shares:"",mkt:"US",ccy:"USD",divMode:"gross"});
  const [holdingEditId,setHoldingEditId]=useState(null);
  const [holdingForm,setHoldingForm]=useState({});
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const [refreshKey,setRefreshKey]=useState(0);
  const [lastRefresh,setLastRefresh]=useState(null);
  const [refreshAnim,setRefreshAnim]=useState(false);
  const [pendingChanges,setPendingChanges]=useState(0);
  const [senateData,setSenateData]=useState([]);
  const [senatePrices,setSenatePrices]=useState({});    // {TICKER:{price,intrinsic}} live prices
  const [senateHistPrices,setSenateHistPrices]=useState({}); // {TICKER_DATE: price} historical
  const [liveIndices,setLiveIndices]=useState({}); // live index values from Yahoo
  const [indicesSource,setIndicesSource]=useState('fallback'); // 'live'|'cached'|'fallback'
  const [indicesCachedAt,setIndicesCachedAt]=useState(null);  // ISO string of last successful live fetch
  const [valuations,setValuations]=useState({});   // {TICKER: {analystTarget, dcf, graham, peFair, average, recommendation}}
  const [moatUpdatedAt,setMoatUpdatedAt]=useState(null);
  const [moatRefreshing,setMoatRefreshing]=useState(false);
  const [moatAiLoading,setMoatAiLoading]=useState({});
  const [intrinsicRefreshing,setIntrinsicRefreshing]=useState(false);
  const [intrinsicUpdatedAt,setIntrinsicUpdatedAt]=useState(null);
  const [intrinsicAiLoading,setIntrinsicAiLoading]=useState({});
  const [stmtTotal,setStmtTotal]=useState(null); // Option C: DBS statement anchor total (SGD)
  const [showSoldStocks,setShowSoldStocks]=useState(false); // toggle sold stocks section per marketent
  const [valLoading,setValLoading]=useState({});

  const [dbStatus,setDbStatus]=useState('ready'); // 'ready' | 'saving' | 'saved' | 'error'
  const [isLoading,setIsLoading]=useState(true);
  const [priceStatus,setPriceStatus]=useState('idle');
  const [fxRates,setFxRates]=useState({USD:1.27,JPY:0.0080,EUR:1.49,HKD:0.163,GBP:1.68,AUD:0.81,CNY:0.175,TWD:0.039,SGD:1.0});
  const [fxUpdated,setFxUpdated]=useState(null); // 'idle'|'fetching'|'done'|'error'
  const [priceUpdated,setPriceUpdated]=useState(null); // timestamp of last price update

  const [loadMsg,setLoadMsg]=useState('Connecting...');
  useEffect(()=>{
    if(!window.portfolioDB){setLoadMsg('ERROR: portfolioDB not found');setIsLoading(false);return;}
    setLoadMsg('Calling portfolioDB.load()...');
    window.portfolioDB.load().then(data=>{
      setLoadMsg('Got data: '+JSON.stringify({h:(data.holdings||[]).length,t:(data.trades||[]).length}));
      if(data.holdings&&data.holdings.length>0){
        const loadedTrades=data.trades||[];
        // Recalculate profits using running weighted-average-cost (WAVG) simulation
        // Processes trades chronologically per ticker, tracking the live avg cost
        // This gives the CORRECT avg cost at the time of each sell (not simple avg of all buys)
        const profitMap={};  // ticker -> {curShares, curAvg}
        const tradesSorted=[...loadedTrades].sort((a,b)=>a.date.localeCompare(b.date));
        const tradesWithProfit=tradesSorted.map(t=>{
          if(!profitMap[t.ticker]) profitMap[t.ticker]={curShares:0,curAvg:0};
          const pos=profitMap[t.ticker];
          if(t.type==="BUY"){
            // Update running avg cost: weighted blend of existing + new shares
            pos.curAvg=(pos.curShares*pos.curAvg+t.shares*t.price)/(pos.curShares+t.shares);
            pos.curShares+=t.shares;
            return t;
          } else if(t.type==="DIV"){
            // DIV: profit depends on entry mode stored on the trade record.
            // "net" mode:   price IS the net total from statement → profit = price (shares=1)
            // "gross" mode: profit = price × shares × (1 − WHT rate)
            // Re-compute only if profit missing (preserves user-corrected values).
            const needsCalc=(t.profit===0||t.profit==null);
            let profit=t.profit;
            if(needsCalc){
              if(t.divMode==="net"){
                profit=parseFloat(parseFloat(t.price).toFixed(2));
              } else {
                const taxRate=getDivTax(t.mkt||'US');
                profit=parseFloat((t.price*t.shares*(1-taxRate)).toFixed(2));
              }
            }
            // Share count and avg cost are unchanged by a dividend
            return {...t,profit};
          } else {
            // SELL: profit = (sellPrice - avgCostAtTimeOfSell) × shares
            // Only recalculate if profit is 0 or null (preserve user-corrected values)
            const needsCalc=(t.profit===0||t.profit==null);
            const profit=needsCalc&&pos.curAvg>0
              ?parseFloat(((t.price-pos.curAvg)*t.shares).toFixed(2))
              :t.profit;
            pos.curShares=Math.max(0,pos.curShares-t.shares);
            // avg cost unchanged after sell (WAVG method)
            return {...t,profit};
          }
        });
        // Rebuild holdings from trades to ensure net shares + avgCost are accurate
        const rebuiltOnLoad=rebuildHoldingsFromTrades(tradesWithProfit, data.holdings);
        // Auto-correct wrong market assignments based on ticker suffix
        // e.g. 0981.HK stored as mkt='US' → corrected to mkt='CN'
        const mktCorrected=(rebuiltOnLoad.length>0?rebuiltOnLoad:data.holdings).map(h=>{
          const correctMkt=detectMktFromTicker(h.ticker);
          // Option B: DB mkt is authoritative. Only override when detectMkt returns a
          // definitive suffix-based result (non-null) AND it disagrees with DB.
          // When detectMkt returns null (no suffix, e.g. ESLOF), preserve DB value.
          if(!correctMkt||h.mkt===correctMkt) return h;
          const correctCcy=mktToCcy(correctMkt)||h.ccy||'USD';
          console.warn('[mkt-fix] '+h.ticker+': mkt='+h.mkt+'→'+correctMkt+' ccy→'+correctCcy);
          return {...h,mkt:correctMkt};
        });
        const mktFixCount=mktCorrected.filter((h,i)=>h.mkt!==(rebuiltOnLoad.length>0?rebuiltOnLoad:data.holdings)[i]?.mkt).length;
        if(mktFixCount>0&&window.portfolioDB){
          console.log('[mkt-fix] Correcting '+mktFixCount+' holdings with wrong market in DB');
          window.portfolioDB.updateHoldings(mktCorrected).catch(e=>console.warn('[mkt-fix] DB:',e));
        }
        // Also fix trades with wrong mkt
        const tradesMktFixed=tradesWithProfit.map(t=>{
          const correctMkt=detectMktFromTicker(t.ticker);
          if(!correctMkt||t.mkt===correctMkt) return t;
          return {...t,mkt:correctMkt,ccy:mktToCcy(correctMkt)||t.ccy};
        });
        const tradeMktFixCount=tradesMktFixed.filter((t,i)=>t.mkt!==tradesWithProfit[i]?.mkt).length;
        if(tradeMktFixCount>0&&window.portfolioDB){
          console.log('[mkt-fix] Correcting '+tradeMktFixCount+' trades with wrong market');
          window.portfolioDB.updateTrades(tradesMktFixed).catch(e=>console.warn('[mkt-fix] trades DB:',e));
        }
        setHoldings(mktCorrected);
        setTrades(tradeMktFixCount>0?tradesMktFixed:tradesWithProfit);
        const fb={};
        // Real trade dates (excludes Opening Balance synthetic date 2000-01-01)
        (data.trades||[]).filter(t=>t.type==='BUY'&&t.date>'2000-01-01').forEach(t=>{
          if(!fb[t.ticker]||t.date<fb[t.ticker])fb[t.ticker]=t.date;
        });
        // heldSince from holdings overrides trade-derived dates (most authoritative)
        // NOTE: data.holdings is already camelCase-normalised by portfolioDB.load() —
        //       the field is h.heldSince, NOT h.held_since
        (data.holdings||[]).forEach(h=>{
          if(h.heldSince&&(!fb[h.ticker]||h.heldSince<fb[h.ticker]))fb[h.ticker]=h.heldSince;
        });
        FIRST_BUY=fb;
        if(data.senate&&data.senate.length>0){
          SENATE.length=0;
          data.senate.forEach(s=>SENATE.push(s));
        }
        // Persist corrected profits back to Supabase if any were recalculated
        const hadZeroProfits=loadedTrades.some(t=>t.type==="SELL"&&(t.profit===0||t.profit==null));
        if(hadZeroProfits&&window.portfolioDB) {
          window.portfolioDB.updateTrades(tradesWithProfit).catch(e=>console.warn('Profit backfill:',e));
        }
        fetchLivePrices(data.holdings);
        fetchLiveFx();
        fetchLiveIndices();
        fetchSenateTrades();
        updateSenateDataSilent(data.holdings);
        fetchMoatData(data.holdings);
        fetchMissingNames(mktCorrected);
        // Compute intrinsic values on load + check for quarterly AI refresh
        computeAllIntrinsic(data.holdings);
        (async()=>{
          try{
            const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
            const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
            const HDR={'apikey':KEY,'Authorization':'Bearer '+KEY};
            const r=await fetch(`${SB}/rest/v1/meta?key=eq.intrinsic_refresh_at`,{headers:HDR});
            if(r.ok){
              const rows=await r.json();
              if(rows.length>0){
                setIntrinsicUpdatedAt(rows[0].value);
                const ageDays=Math.floor((Date.now()-new Date(rows[0].value).getTime())/86400000);
                if(ageDays>90){
                  console.log(`[intrinsic] Stale ${ageDays}d — auto-triggering AI refresh`);
                  // Small delay so UI is ready before kicking off
                  setTimeout(()=>refreshAllIntrinsicWithAI(),8000);
                }
              }
            }
            // Option C: load statement anchor total from meta
            const rs=await fetch(`${SB}/rest/v1/meta?key=eq.stmt_total_sgd`,{headers:HDR});
            if(rs.ok){
              const rowsS=await rs.json();
              if(rowsS.length>0) setStmtTotal(Number(rowsS[0].value));
            }
          }catch(e){}
        })();

      } else {
        setLoadMsg('WARNING: holdings empty. data='+JSON.stringify(data).slice(0,200));
      }
      setIsLoading(false);
    }).catch(e=>{
      setLoadMsg('ERROR: '+e.message);
      setIsLoading(false);
    });
  },[]);

  async function fetchLivePrices(currentHoldings) {
    if (!currentHoldings || currentHoldings.length === 0) return;
    setPriceStatus('fetching');

    const sorted = [...currentHoldings];
    const tickers = sorted.map(h => h.ticker);
    console.log('Fetching all', tickers.length, 'tickers via Finnhub');
    const EDGE_URL = 'https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';

    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action:'prices', tickers, holdings: sorted.map(h=>({ticker:h.ticker,mkt:h.mkt})) }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('Edge fn error:', res.status, err);
        setPriceStatus('error');
        return;
      }

      const data = await res.json();
      const results = data.prices || {};
      const n = Object.keys(results).length;
      console.log('Edge fn OK:', n, 'prices');

      if (n === 0) { 
        setPriceStatus('error'); 
        setTimeout(()=>setPriceStatus('idle'),10000);
        return; 
      }

      setHoldings(prev => {
        const updated = prev.map(h => {
          const p = results[h.ticker];
          return p && p > 0 ? { ...h, price: p } : h;
        });
        if (window.portfolioDB) {
          window.portfolioDB.updateHoldings(updated).catch(e => console.warn('DB:', e));
        }
        return updated;
      });
      setPriceUpdated(new Date());
      setPriceStatus('done');
      setRefreshKey(k => k + 1);
      fetchDividends(currentHoldings);

    } catch(e) {
      console.error('fetchLivePrices failed:', e.message);
      setPriceStatus('error');
      setTimeout(()=>setPriceStatus('idle'),10000);
    }
  }

  async function fetchDividends(currentHoldings){
    if(!currentHoldings||currentHoldings.length===0) return;
    const EDGE_URL='https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';
    // Read live budget from input ref (avoids needing state sync before scan)
    const liveBudget=budgetInputRef.current?budgetInputRef.current.value:screenBudget;
    if(liveBudget&&liveBudget!==screenBudget) setScreenBudget(liveBudget);
    try{
      const tickers=currentHoldings.map(h=>h.ticker);
      const res=await fetch(EDGE_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'dividends',
          tickers,
          holdings:currentHoldings.map(h=>({ticker:h.ticker,mkt:h.mkt}))
        }),
      });
      if(!res.ok){console.warn('[dividends] fetch failed:',res.status);return;}
      const d=await res.json();
      const divYields       = d.divYields        || {};
      const peRatios        = d.peRatios         || {};
      const intrinsicValues = d.intrinsicValues  || {}; // Graham Number for non-US; live DCF for US
      const revenueGrowths  = d.revenueGrowths   || {}; // revenue/EPS growth % — all markets
      const count=Object.keys(divYields).length;
      const peCount=Object.keys(peRatios).length;
      console.log(`[dividends] Got ${count}/${tickers.length} yields | PE=${peCount} | intrinsic=${Object.keys(intrinsicValues).length} | revGrowth=${Object.keys(revenueGrowths).length}`);
      if(count===0&&peCount===0) return;
      setHoldings(prev=>{
        const updated=prev.map(h=>{
          const dy   = divYields[h.ticker];
          const pe   = peRatios[h.ticker];
          const intr = intrinsicValues[h.ticker];
          const rg   = revenueGrowths[h.ticker];
          const changes={};
          if(dy   !== undefined)          changes.divYield      = dy;   // 0 valid = non-dividend
          if(pe   !== undefined && pe>0)  changes.peRatio       = pe;
          if(intr !== undefined && intr>0)changes.intrinsic     = intr; // Graham Number replaces stale DB value
          if(rg   !== undefined && rg!==0)changes.revenueGrowth = rg;
          return Object.keys(changes).length>0?{...h,...changes}:h;
        });
        if(window.portfolioDB){
          window.portfolioDB.updateHoldings(updated).catch(e=>console.warn('DB div/PE:',e));
        }
        return updated;
      });
      setRefreshKey(k=>k+1);
    }catch(e){console.warn('[dividends] error:',e.message);}
  }

  async function fetchScreen(){
    if(screenLoading) return;
    setScreenLoading(true);
    setScreenAI("");
    const EDGE_URL='https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';
    try{
      const res=await fetch(EDGE_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'screen',
          holdings:activeHoldings.map(h=>({ticker:h.ticker,mkt:h.mkt,name:h.name,price:h.price}))
        }),
      });
      if(!res.ok){console.warn('[screen] fetch failed:',res.status);setScreenLoading(false);return;}
      const d=await res.json();
      const sd=d.screenData||{};
      setScreenData(sd);
      setScreenLastRun(new Date());

      const scored=holdings.map(h=>{
        const s=sd[h.ticker]||{};
        const effIV=valuations[h.ticker]?.valuations?.average||h.intrinsic||0;
        const upside=effIV>0&&h.price>0?((effIV-h.price)/h.price)*100:0;
        const overvalued=effIV>0&&h.price>0?((h.price-effIV)/effIV)*100:0;
        const gainPct=h.avgCost>0?((h.price-h.avgCost)/h.avgCost)*100:0;
        const insiderBuy=alertData.some(a=>a.ticker===h.ticker&&a.type==="INSIDER_BUY");
        const insiderSell=alertData.some(a=>a.ticker===h.ticker&&a.type==="INSIDER_SELL");
        const senateBuy=senateData.some(s2=>s2.ticker===h.ticker&&s2.action==="BUY");
        const rsi=s.rsi||50;
        const revGrowth=s.revenueGrowth||null;
        const de=s.debtToEquity||null;
        const analystBuyPct=s.analystBuyPct||null;

        let buyScore=0; const buySignals=[];
        if(upside>=30){buyScore+=25;buySignals.push({label:`IV +${upside.toFixed(0)}% upside`,pts:25,strength:"strong"});}
        else if(upside>=15){buyScore+=15;buySignals.push({label:`IV +${upside.toFixed(0)}% upside`,pts:15,strength:"medium"});}
        else if(upside>=5){buyScore+=8;buySignals.push({label:`IV +${upside.toFixed(0)}% upside`,pts:8,strength:"weak"});}
        if(h.moat==="Wide"){buyScore+=15;buySignals.push({label:"Wide moat",pts:15,strength:"strong"});}
        else if(h.moat==="Narrow"){buyScore+=8;buySignals.push({label:"Narrow moat",pts:8,strength:"medium"});}
        if(rsi<30){buyScore+=15;buySignals.push({label:`RSI ${rsi} (oversold)`,pts:15,strength:"strong"});}
        else if(rsi<40){buyScore+=10;buySignals.push({label:`RSI ${rsi} (low)`,pts:10,strength:"medium"});}
        else if(rsi<50){buyScore+=4;buySignals.push({label:`RSI ${rsi}`,pts:4,strength:"weak"});}
        if(insiderBuy){buyScore+=15;buySignals.push({label:"Insider buying",pts:15,strength:"strong"});}
        if(senateBuy){buyScore+=10;buySignals.push({label:"Senate buy signal",pts:10,strength:"strong"});}
        if(revGrowth!==null){
          if(revGrowth>=20){buyScore+=10;buySignals.push({label:`Rev growth ${revGrowth.toFixed(0)}%`,pts:10,strength:"strong"});}
          else if(revGrowth>=10){buyScore+=6;buySignals.push({label:`Rev growth ${revGrowth.toFixed(0)}%`,pts:6,strength:"medium"});}
          else if(revGrowth>0){buyScore+=2;buySignals.push({label:`Rev growth ${revGrowth.toFixed(0)}%`,pts:2,strength:"weak"});}
        }
        if(de!==null&&de<0.3){buyScore+=5;buySignals.push({label:`D/E ${de.toFixed(1)}`,pts:5,strength:"strong"});}
        else if(de!==null&&de<0.7){buyScore+=3;buySignals.push({label:`D/E ${de.toFixed(1)}`,pts:3,strength:"medium"});}
        if(analystBuyPct!==null&&analystBuyPct>=70){buyScore+=5;buySignals.push({label:`${analystBuyPct.toFixed(0)}% analyst buy`,pts:5,strength:"strong"});}
        else if(analystBuyPct!==null&&analystBuyPct>=50){buyScore+=3;buySignals.push({label:`${analystBuyPct.toFixed(0)}% analyst buy`,pts:3,strength:"medium"});}

        let sellScore=0; const sellSignals=[];
        if(overvalued>=50){sellScore+=25;sellSignals.push({label:`${overvalued.toFixed(0)}% above IV`,pts:25,strength:"strong"});}
        else if(overvalued>=30){sellScore+=18;sellSignals.push({label:`${overvalued.toFixed(0)}% above IV`,pts:18,strength:"strong"});}
        else if(overvalued>=15){sellScore+=10;sellSignals.push({label:`${overvalued.toFixed(0)}% above IV`,pts:10,strength:"medium"});}
        if(rsi>80){sellScore+=20;sellSignals.push({label:`RSI ${rsi} (very overbought)`,pts:20,strength:"strong"});}
        else if(rsi>70){sellScore+=14;sellSignals.push({label:`RSI ${rsi} (overbought)`,pts:14,strength:"strong"});}
        else if(rsi>65){sellScore+=7;sellSignals.push({label:`RSI ${rsi} (elevated)`,pts:7,strength:"medium"});}
        if(gainPct>150){sellScore+=15;sellSignals.push({label:`+${gainPct.toFixed(0)}% unrealized gain`,pts:15,strength:"strong"});}
        else if(gainPct>100){sellScore+=10;sellSignals.push({label:`+${gainPct.toFixed(0)}% unrealized gain`,pts:10,strength:"medium"});}
        else if(gainPct>75){sellScore+=5;sellSignals.push({label:`+${gainPct.toFixed(0)}% unrealized gain`,pts:5,strength:"weak"});}
        if(revGrowth!==null&&revGrowth<-10){sellScore+=15;sellSignals.push({label:`Rev declining ${revGrowth.toFixed(0)}%`,pts:15,strength:"strong"});}
        else if(revGrowth!==null&&revGrowth<0){sellScore+=8;sellSignals.push({label:`Rev declining ${revGrowth.toFixed(0)}%`,pts:8,strength:"medium"});}
        if(insiderSell){sellScore+=10;sellSignals.push({label:"Insider selling",pts:10,strength:"strong"});}
        if(de!==null&&de>3){sellScore+=10;sellSignals.push({label:`D/E ${de.toFixed(1)} (high debt)`,pts:10,strength:"strong"});}
        else if(de!==null&&de>2){sellScore+=6;sellSignals.push({label:`D/E ${de.toFixed(1)} (elevated debt)`,pts:6,strength:"medium"});}
        if(h.moat==="None"||!h.moat){sellScore+=5;sellSignals.push({label:"No moat",pts:5,strength:"weak"});}

        return{h,buyScore,buySignals,sellScore,sellSignals,
          rsi,upside,overvalued,gainPct,revGrowth,de,analystBuyPct,
          effIV,insiderBuy,senateBuy,mom1m:s.mom1m,mom3m:s.mom3m,
          pctFromHi:s.pctFromHi,pctFromLo:s.pctFromLo};
      });

      scored.sort((a,b)=>screenMode==="BUY"?b.buyScore-a.buyScore:b.sellScore-a.sellScore);
      setScreenResults(scored);

      const budget=parseFloat(budgetInputRef.current?.value||screenBudget)||0;
      if(budget>0){
        setScreenAILoad(true);
        const top=scored.slice(0,8);
        const buyLines=top.map(function(r,i){
          return (i+1)+'. '+r.h.ticker+' ('+r.h.name+') -- Buy Score: '+r.buyScore+'/100\n'+
            '   Signals: '+(r.buySignals.map(function(s){return s.label;}).join(', ')||'None')+'\n'+
            '   Price: S$'+r.h.price+' | IV: '+(r.effIV>0?'S$'+r.effIV.toFixed(2):'N/A')+' | Upside: '+r.upside.toFixed(0)+'%\n'+
            '   RSI: '+r.rsi+' | Rev Growth: '+(r.revGrowth!==null?r.revGrowth.toFixed(0)+'%':'N/A')+' | D/E: '+(r.de!==null?r.de.toFixed(1):'N/A');
        }).join('\n\n');
        const sellLines=top.map(function(r,i){
          return (i+1)+'. '+r.h.ticker+' ('+r.h.name+') -- Sell Score: '+r.sellScore+'/100\n'+
            '   Signals: '+(r.sellSignals.map(function(s){return s.label;}).join(', ')||'None')+'\n'+
            '   Gain: +'+r.gainPct.toFixed(0)+'% | RSI: '+r.rsi+' | Overvalued: '+r.overvalued.toFixed(0)+'%\n'+
            '   Position value: S$'+toSGDlive(r.h.price*r.h.shares,r.h.mkt).toFixed(0);
        }).join('\n\n');
        const prompt=screenMode==="BUY"
          ?'I am a Singapore investor with S$'+budget.toLocaleString()+' to deploy. Recommend the best allocation based on this analysis:\n\n'+buyLines+'\n\nGive a concise allocation: how much per pick, why, any concentration warnings. Max 200 words.'
          :'I am a Singapore investor targeting S$'+budget.toLocaleString()+' cash-out. Recommend what to sell:\n\n'+sellLines+'\n\nRecommend which to sell, how much, and sequencing. Max 200 words.';

        try{
          const aiRes=await fetch('https://api.anthropic.com/v1/messages',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              model:'claude-sonnet-4-20250514',
              max_tokens:1000,
              messages:[{role:'user',content:prompt}],
            }),
          });
          if(aiRes.ok){
            const aiD=await aiRes.json();
            const text=(aiD.content||[]).map((c)=>c.type==="text"?c.text:"").join("");
            setScreenAI(text);
          }
        }catch(e){console.warn('[screen AI]',e.message);}
        setScreenAILoad(false);
      }
    }catch(e){console.warn('[screen] error:',e.message);}
    setScreenLoading(false);
  }

  async function fetchAlerts(){
    if(alertLoading) return;
    setAlertLoading(true);
    const EDGE_URL='https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';
    try{
      const res=await fetch(EDGE_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'alerts',
          holdings:activeHoldings.map(h=>({
            ticker:h.ticker,mkt:h.mkt,name:h.name,price:h.price
          }))
        }),
      });
      if(!res.ok){console.warn('[alerts] fetch failed:',res.status);setAlertLoading(false);return;}
      const d=await res.json();
      setAlertData(d.alerts||[]);
      setAlertLastRun(new Date());
      console.log(`[alerts] ${(d.alerts||[]).length} alerts generated`);
    }catch(e){console.warn('[alerts] error:',e.message);}
    setAlertLoading(false);
  }

  async function fetchLiveFx(){
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const SBH={'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY};
    const FX_CACHE_KEY='fx_lkg'; // FIX 4: LKG cache key in Supabase meta

    try{
      const res=await fetch(SB+"/functions/v1/smart-api",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"fx_rates"}),
      });
      if(!res.ok) throw new Error("HTTP "+res.status);
      const d=await res.json();
      if(d.rates&&Object.keys(d.rates).length>0){
        setFxRates(d.rates);
        setFxUpdated(new Date());
        setRefreshKey(k=>k+1);
        console.log("FX rates live updated:",Object.entries(d.rates).map(([k,v])=>k+"="+v).join(", "));
        fetch(SB+'/rest/v1/meta?on_conflict=key',{
          method:'POST',
          headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
          body:JSON.stringify({key:FX_CACHE_KEY,value:JSON.stringify({rates:d.rates,updatedAt:new Date().toISOString()})}),
        }).catch(()=>{});
        return; // success
      }
    }catch(e){
      console.warn("FX live fetch failed:",e.message);
    }
    try{
      const cacheRes=await fetch(SB+`/rest/v1/meta?key=eq.${FX_CACHE_KEY}`,{
        headers:{'apikey':KEY,'Authorization':'Bearer '+KEY}
      });
      if(cacheRes.ok){
        const rows=await cacheRes.json();
        if(rows.length&&rows[0].value){
          const cached=JSON.parse(rows[0].value);
          if(cached.rates&&Object.keys(cached.rates).length>0){
            setFxRates(cached.rates);
            setFxUpdated(new Date(cached.updatedAt||0));
            setRefreshKey(k=>k+1);
            const ageH=Math.round((Date.now()-new Date(cached.updatedAt||0).getTime())/3600000);
            console.warn(`FX: using cached rates (${ageH}h old) — live fetch failed`);
            return;
          }
        }
      }
    }catch(e2){console.warn("FX cache fetch failed:",e2.message);}
    console.warn("FX: all sources failed — using hardcoded fallback rates");
  }

  async function fetchLiveIndices(){
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const SBH={'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY};
    const CACHE_KEY='indices_lkg';

    try{
      const res=await fetch(SB+'/functions/v1/smart-api',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'live_indices'}),
      });
      if(res.ok){
        const d=await res.json();
        if(d.indices&&Object.keys(d.indices).length>0){
          setLiveIndices(d.indices);
          setIndicesSource('live');
          setIndicesCachedAt(null);
          console.log('Live indices fetched:',Object.keys(d.indices).length);
          fetch(SB+'/rest/v1/meta?on_conflict=key',{
            method:'POST',
            headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
            body:JSON.stringify({key:CACHE_KEY,value:JSON.stringify({indices:d.indices,updatedAt:new Date().toISOString()})}),
          }).catch(()=>{});
          return;
        }
      }
    }catch(e){console.warn('fetchLiveIndices live failed:',e.message);}

    try{
      const res=await fetch(SB+'/rest/v1/meta?key=eq.'+CACHE_KEY,{headers:SBH});
      if(res.ok){
        const rows=await res.json();
        if(rows.length>0){
          const cached=JSON.parse(rows[0].value||'{}');
          if(cached.indices&&cached.updatedAt){
            setLiveIndices(cached.indices);
            setIndicesSource('cached');
            setIndicesCachedAt(cached.updatedAt);
            console.log('Live indices from LKG cache:',cached.updatedAt);
            return;
          }
        }
      }
    }catch(e){console.warn('fetchLiveIndices cache failed:',e.message);}

    setIndicesSource('fallback');
    console.warn('Live indices: using hardcoded MKT fallback');
  }

  async function fetchValuation(ticker){
    if(!ticker) return;
    if(valuations[ticker]||valLoading[ticker]) return;
    setValLoading(p=>({...p,[ticker]:true}));
    try{
      const res=await fetch('https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'valuation',ticker,mkt:holdings.find(h=>h.ticker===ticker)?.mkt||'US'}),
      });
      if(!res.ok){setValLoading(p=>({...p,[ticker]:false}));return;}
      const d=await res.json();
      if(d&&!d.error){
        setValuations(p=>({...p,[ticker]:d}));
        // Fix 6: persist live-computed intrinsic + PE to holdings and DB so values survive restart
        // Best available: Finnhub DCF avg → Finnhub analyst target → Yahoo analyst target
        const liveIntrinsic = d.valuations?.average || d.valuations?.analystTarget
                            || d.valuations?.yahooTarget || 0;
        const livePE        = d.inputs?.pe          || 0;
        if(liveIntrinsic > 0){
          setHoldings(prev=>{
            const upd=prev.map(h=>{
              if(h.ticker!==ticker) return h;
              const ch={intrinsic:liveIntrinsic};
              if(livePE>0) ch.peRatio=livePE;
              return {...h,...ch};
            });
            if(window.portfolioDB) window.portfolioDB.updateHoldings(upd).catch(e=>console.warn('[valuation-persist]',e));
            return upd;
          });
        }
        console.log('Valuation',ticker+':',d.valuations);
      }
    }catch(e){console.warn('fetchValuation:',e.message);}
    setValLoading(p=>({...p,[ticker]:false}));
  }

  async function fetchMoatData(currentHoldings) {
    const SB  = 'https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY = 'sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const HDR = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
    try {
      const res = await fetch(`${SB}/rest/v1/meta?key=eq.moat_map`, { headers: HDR });
      if (!res.ok) { console.warn('[moat] meta fetch failed:', res.status); return; }
      const rows = await res.json();
      if (!rows.length) { console.warn('[moat] moat_map not found in meta'); return; }

      let parsed;
      try { parsed = JSON.parse(rows[0].value); } catch(e) { console.warn('[moat] JSON parse failed'); return; }
      const moat_map = parsed.moat_map;
      if (!moat_map) return;
      if(parsed.updatedAt) setMoatUpdatedAt(parsed.updatedAt);
      else setMoatUpdatedAt('March 2026'); // fallback if no timestamp

      const toUpdate = [];
      setHoldings(prev => prev.map(h => {
        const m = moat_map[h.ticker];
        if (!m) return h;
        const moatOk   = h.moat    === m.moat;
        const sectorOk = h.sector  === m.sector;
        const styleOk  = (h.msStyle || h.ms_style) === m.msStyle;
        if (moatOk && sectorOk && styleOk) return h;
        toUpdate.push({ id: h.id, moat: m.moat, sector: m.sector, ms_style: m.msStyle });
        return { ...h, moat: m.moat, sector: m.sector, msStyle: m.msStyle };
      }));

      if (toUpdate.length > 0) {
        console.log(`[moat] patching ${toUpdate.length} changed holdings in DB`);
        await Promise.all(toUpdate.map(u =>
          fetch(`${SB}/rest/v1/holdings?id=eq.${u.id}`, {
            method: 'PATCH',
            headers: { ...HDR, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ moat: u.moat, sector: u.sector, ms_style: u.ms_style }),
          }).catch(e => console.warn('[moat] patch failed for id', u.id, ':', e.message))
        ));
        console.log('[moat] done');
      } else {
        console.log('[moat] all moat ratings already current — no DB update needed');
      }
    } catch(e) {
      console.warn('[moat] fetchMoatData silent error:', e.message); // non-critical
    }
  }


  // ── Resolve proper company names for holdings stored as ticker symbol ────────
  // Fires on startup whenever name === ticker (unnamed holding)
  // ── Option A: Refresh all moats from Supabase meta table ──────────────────
  async function refreshMoatFromDB(){
    setMoatRefreshing(true);
    try{
      await fetchMoatData(holdings);
      setMoatUpdatedAt(new Date().toLocaleDateString('en-SG',{day:'2-digit',month:'short',year:'numeric'})+' (refreshed)');
    }catch(e){ console.warn('[moat-refresh]',e); }
    setMoatRefreshing(false);
  }

  // ── Option C: AI-powered moat assessment for a single stock ───────────────
  // Uses Claude API to evaluate Wide/Narrow/None moat with reasoning.
  // Stores result back to holdings state + Supabase.
  async function assessMoatWithAI(h){
    if(moatAiLoading[h.ticker]) return;
    setMoatAiLoading(prev=>({...prev,[h.ticker]:true}));
    try{
      const prompt = "You are a Buffett-style equity analyst. Assess the economic moat of this company:\n\n"
        +"Company: "+h.name+" ("+h.ticker+")\n"
        +"Sector: "+h.sector+"\n"
        +"Market: "+h.mkt+"\n"
        +"P/E Ratio: "+(h.peRatio||'N/A')+"\n"
        +"Dividend Yield: "+(h.divYield||0)+"% \n"
        +"Revenue Growth: "+(h.revenueGrowth||'N/A')+"%\n"
        +"Morningstar Style: "+(h.msStyle||'N/A')+"\n\n"
        +"Rate the economic moat as exactly one of: Wide, Narrow, or None.\n"
        +"Respond ONLY in this JSON format (no markdown, no extra text):\n"
        +"{\"moat\":\"Wide|Narrow|None\",\"reason\":\"2-3 sentence explanation focusing on competitive advantages, pricing power, switching costs, or network effects.\"}";

      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:300,
          messages:[{role:"user",content:prompt}]
        })
      });
      const d = await res.json();
      const raw = d.content?.[0]?.text||"{}";
      let parsed;
      try{ parsed = JSON.parse(raw); }catch(e){ parsed={}; }
      const newMoat = ['Wide','Narrow','None'].includes(parsed.moat)?parsed.moat:h.moat;
      const newReason = parsed.reason||"";
      const now = new Date().toLocaleDateString('en-SG',{day:'2-digit',month:'short',year:'numeric'});

      // Update holdings state
      const updated = holdings.map(x=>x.ticker===h.ticker
        ?{...x,moat:newMoat,moatReason:newReason,moatUpdatedAt:now}:x);
      setHoldings(updated);

      // Persist to Supabase holdings table
      if(window.portfolioDB) window.portfolioDB.updateHoldings(updated).catch(e=>console.warn('[moat-ai] DB:',e));

      // Also update the moat_map in meta table
      const SB  = 'https://ckyshjxznltdkxfvhfdy.supabase.co';
      const KEY = 'sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
      const HDR = {'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
      const metaRes = await fetch(`${SB}/rest/v1/meta?key=eq.moat_map`,{headers:HDR});
      if(metaRes.ok){
        const rows = await metaRes.json();
        let moat_map = {};
        if(rows.length){
          try{ const p=JSON.parse(rows[0].value); moat_map=p.moat_map||{}; }catch(e){}
        }
        moat_map[h.ticker]={moat:newMoat,sector:h.sector,msStyle:h.msStyle||''};
        const payload = JSON.stringify({moat_map, updatedAt:now});
        if(rows.length){
          await fetch(`${SB}/rest/v1/meta?key=eq.moat_map`,{method:'PATCH',headers:{...HDR,'Prefer':'return=minimal'},body:JSON.stringify({value:payload})});
        } else {
          await fetch(`${SB}/rest/v1/meta`,{method:'POST',headers:{...HDR,'Prefer':'return=minimal'},body:JSON.stringify({key:'moat_map',value:payload})});
        }
      }
      console.log(`[moat-ai] ${h.ticker}: ${newMoat} — ${newReason}`);
    }catch(e){ console.error('[moat-ai]',e); }
    setMoatAiLoading(prev=>({...prev,[h.ticker]:false}));
  }

  // Fix 4: Bulk AI refresh — processes all active holdings in batches of 5
  // Each batch is one Claude call returning JSON for all 5 stocks at once
  async function refreshAllMoatsWithAI(){
    if(moatRefreshing) return;
    setMoatRefreshing(true);
    const stocks=activeHoldings;
    const BATCH=5;
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const HDR={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
    const allUpdates={};

    for(let i=0;i<stocks.length;i+=BATCH){
      const batch=stocks.slice(i,i+BATCH);
      setMoatUpdatedAt(`Refreshing ${Math.min(i+BATCH,stocks.length)}/${stocks.length}…`);
      const prompt="You are a financial analyst. For each company below, rate its economic moat.\n"
        +"Consider: brand strength, switching costs, network effects, cost advantages, regulatory barriers.\n"
        +"Companies:\n"
        +batch.map(h=>`${h.ticker}: ${h.name} (${h.sector}, ${h.mkt})`).join("\n")
        +"\n\nRespond ONLY as a JSON array — no markdown, no preamble:\n"
        +"[{\"ticker\":\"...\",\"moat\":\"Wide|Narrow|None\"},...]";
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,
            messages:[{role:"user",content:prompt}]})
        });
        const d=await res.json();
        const raw=d.content?.[0]?.text||"[]";
        let ratings=[];
        try{ ratings=JSON.parse(raw); }catch(e){
          const m=raw.match(/\[[\s\S]*\]/);
          if(m) try{ ratings=JSON.parse(m[0]); }catch(e2){}
        }
        if(Array.isArray(ratings)){
          ratings.forEach(r=>{
            if(r.ticker&&['Wide','Narrow','None'].includes(r.moat)){
              allUpdates[r.ticker]=r.moat;
            }
          });
        }
      }catch(e){ console.warn('[bulk-moat] batch error:',e); }
      if(i+BATCH<stocks.length) await new Promise(r=>setTimeout(r,1500));
    }

    // Apply all updates in a single state + DB write
    const now=new Date().toISOString();
    const moat_map_patch={};
    let changedCount=0;
    setHoldings(prev=>{
      const upd=prev.map(h=>{
        const newMoat=allUpdates[h.ticker];
        if(!newMoat||newMoat===h.moat) return h;
        moat_map_patch[h.ticker]={moat:newMoat,sector:h.sector,msStyle:h.msStyle||''};
        changedCount++;
        return {...h,moat:newMoat};
      });
      if(window.portfolioDB) window.portfolioDB.updateHoldings(upd).catch(e=>console.warn('[bulk-moat] DB:',e));
      return upd;
    });

    // Merge changes into existing moat_map in meta table
    try{
      const metaRes=await fetch(`${SB}/rest/v1/meta?key=eq.moat_map`,{headers:HDR});
      if(metaRes.ok){
        const rows=await metaRes.json();
        let existing={};
        if(rows.length) try{ existing=JSON.parse(rows[0].value)?.moat_map||{}; }catch(e){}
        const merged=JSON.stringify({moat_map:{...existing,...moat_map_patch},updatedAt:now});
        if(rows.length){
          await fetch(`${SB}/rest/v1/meta?key=eq.moat_map`,{method:'PATCH',
            headers:{...HDR,'Prefer':'return=minimal'},body:JSON.stringify({value:merged})});
        } else {
          await fetch(`${SB}/rest/v1/meta?on_conflict=key`,{method:'POST',
            headers:{...HDR,'Prefer':'resolution=merge-duplicates,return=minimal'},
            body:JSON.stringify({key:'moat_map',value:merged})});
        }
      }
    }catch(e){ console.warn('[bulk-moat] meta update:',e); }

    console.log(`[bulk-moat] Done — ${Object.keys(allUpdates).length} rated, ${changedCount} changed`);
    setMoatUpdatedAt(now);
    setMoatRefreshing(false);
  }

  // ── Intrinsic Value: formula-based refresh (edge function) ────────────────
  // Fetches analyst targets from Yahoo v10/quoteSummary + REIT yield model.
  // Also stores last-run timestamp in meta for quarterly staleness tracking.
  async function computeAllIntrinsic(currentHoldings){
    const src=currentHoldings||holdings;
    if(!src.length) return;
    const EDGE_URL='https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const SBH={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
    try{
      const res=await fetch(EDGE_URL,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'compute_intrinsic',
          holdings:src.map(h=>({ticker:h.ticker,mkt:h.mkt,sector:h.sector||'',
            divYield:h.divYield||0,price:h.price||0,name:h.name||'',isEtf:h.isEtf||false}))
        })
      });
      if(!res.ok) return;
      const d=await res.json();
      const analystTargets = d.analystTargets || {}; // Option A
      const reitValues     = d.reitValues     || {}; // REIT yield model
      const grahamValues   = d.grahamValues   || {}; // Option C — Graham Number
      const dcfValues      = d.dcfValues      || {}; // Option C — DCF (EPS)
      const total = Object.keys(analystTargets).length + Object.keys(reitValues).length
                  + Object.keys(grahamValues).length   + Object.keys(dcfValues).length;
      console.log(`[compute_intrinsic] analyst=${Object.keys(analystTargets).length} reit=${Object.keys(reitValues).length} graham=${Object.keys(grahamValues).length} dcf=${Object.keys(dcfValues).length}`);
      if(total===0) return;
      const now=new Date().toISOString();
      setHoldings(prev=>{
        const upd=prev.map(h=>{
          if(h.isEtf) return{...h,intrinsic:0,intrinsicMethod:'etf',intrinsicUpdatedAt:now};
          const reit    = reitValues[h.ticker];
          const analyst = analystTargets[h.ticker];
          const graham  = grahamValues[h.ticker];
          const dcf     = dcfValues[h.ticker];
          // Priority: REIT yield > analyst consensus > Graham Number > DCF (EPS)
          if(reit    > 0) return{...h,intrinsic:reit,           intrinsicMethod:'reit_yield', intrinsicUpdatedAt:now};
          if(analyst?.target > 0) return{...h,intrinsic:analyst.target,intrinsicMethod:'analyst',    intrinsicUpdatedAt:now};
          if(graham  > 0) return{...h,intrinsic:graham,         intrinsicMethod:'graham',     intrinsicUpdatedAt:now};
          if(dcf     > 0) return{...h,intrinsic:dcf,            intrinsicMethod:'dcf_eps',    intrinsicUpdatedAt:now};
          return h; // no data from this pass — keep existing value
        });
        if(window.portfolioDB) window.portfolioDB.updateHoldings(upd).catch(e=>console.warn('[intrinsic] DB:',e));
        return upd;
      });
      // Persist refresh timestamp to meta
      setIntrinsicUpdatedAt(now);
      fetch(`${SB}/rest/v1/meta?on_conflict=key`,{
        method:'POST',headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({key:'intrinsic_refresh_at',value:now})
      }).catch(()=>{});
    }catch(e){console.warn('[compute_intrinsic]',e.message);}
  }

  // ── Intrinsic Value: AI web search refresh ────────────────────────────────
  // Uses Claude with web_search to find analyst consensus targets for all stocks.
  // Slower (1–2 min for full portfolio) but finds data for any global stock.
  // Run quarterly or when formula-based refresh finds no analyst coverage.
  async function refreshAllIntrinsicWithAI(){
    if(intrinsicRefreshing) return;
    setIntrinsicRefreshing(true);
    const stocks=activeHoldings.filter(h=>!h.isEtf);
    const BATCH=3; // 3 stocks per Claude call to keep responses focused
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const SBH={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
    const allResults={};

    for(let i=0;i<stocks.length;i+=BATCH){
      const batch=stocks.slice(i,i+BATCH);
      setIntrinsicUpdatedAt(`AI searching ${Math.min(i+BATCH,stocks.length)}/${stocks.length}…`);
      const prompt=
        "Search for the current analyst consensus price target for each stock below. "
        +"Use web search to find recent data from Bloomberg, Reuters, Refinitiv, or broker research. "
        +"For REITs, find NAV (net asset value) per unit instead if available.\n\n"
        +batch.map(h=>`${h.ticker} – ${h.name} (${h.mkt}, current price ${h.price})`).join("\n")
        +"\n\nReturn ONLY a JSON array (no markdown, no preamble):\n"
        +'[{"ticker":"...","intrinsic":123.45,"n_analysts":5,"source":"brief note"},...]';
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            model:"claude-sonnet-4-20250514",max_tokens:600,
            tools:[{"type":"web_search_20250305","name":"web_search"}],
            messages:[{role:"user",content:prompt}]
          })
        });
        const d=await res.json();
        // Extract final text block (after any tool use blocks)
        const textBlocks=(d.content||[]).filter(c=>c.type==="text");
        const raw=textBlocks[textBlocks.length-1]?.text||"[]";
        let results=[];
        try{results=JSON.parse(raw);}catch(e){
          const m=raw.match(/\[[\s\S]*?\]/);
          if(m) try{results=JSON.parse(m[0]);}catch(e2){}
        }
        if(Array.isArray(results)){
          results.forEach(r=>{
            if(r.ticker&&r.intrinsic>0) allResults[r.ticker]={intrinsic:r.intrinsic,source:r.source||""};
          });
        }
      }catch(e){console.warn('[intrinsic-ai] batch error:',e);}
      if(i+BATCH<stocks.length) await new Promise(r=>setTimeout(r,1500));
    }

    // Apply all results at once
    const now=new Date().toISOString();
    setHoldings(prev=>{
      const upd=prev.map(h=>{
        if(h.isEtf) return h;
        const u=allResults[h.ticker];
        if(!u||u.intrinsic<=0) return h;
        return{...h,intrinsic:u.intrinsic,intrinsicMethod:'ai_search'};
      });
      if(window.portfolioDB) window.portfolioDB.updateHoldings(upd).catch(e=>console.warn('[intrinsic-ai] DB:',e));
      return upd;
    });
    // Persist refresh timestamp
    fetch(`${SB}/rest/v1/meta?on_conflict=key`,{
      method:'POST',headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({key:'intrinsic_refresh_at',value:now})
    }).catch(()=>{});
    console.log(`[intrinsic-ai] Done — ${Object.keys(allResults).length}/${stocks.length} updated`);
    setIntrinsicUpdatedAt(now);
    setIntrinsicRefreshing(false);
  }

  // ── Intrinsic Value: single-stock AI web search ───────────────────────────
  // Per-stock 🤖 button on each holdings tile. Searches analyst targets for
  // one stock only — faster than the bulk refresh (seconds, not minutes).
  async function refreshSingleIntrinsicWithAI(h){
    if(intrinsicAiLoading[h.ticker]) return;
    setIntrinsicAiLoading(prev=>({...prev,[h.ticker]:true}));
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const SBH={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
    try{
      const prompt=
        "Search for the current analyst consensus price target for this stock. "
        +"Use web search to find recent data from Bloomberg, Reuters, Refinitiv, or broker research. "
        +"For REITs, find NAV (net asset value) per unit instead if available.\n\n"
        +`${h.ticker} – ${h.name||h.ticker} (${h.mkt}, current price ${h.price})\n\n`
        +"Return ONLY a JSON object (no markdown, no preamble, no code fences):\n"
        +'{"ticker":"...","intrinsic":123.45,"n_analysts":5,"source":"brief note"}';
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:300,
          tools:[{"type":"web_search_20250305","name":"web_search"}],
          messages:[{role:"user",content:prompt}]
        })
      });
      const d=await res.json();
      const textBlocks=(d.content||[]).filter(c=>c.type==="text");
      const raw=textBlocks[textBlocks.length-1]?.text||"{}";
      let result={};
      try{result=JSON.parse(raw);}catch(e){
        const m=raw.match(/\{[\s\S]*?\}/);
        if(m) try{result=JSON.parse(m[0]);}catch(e2){}
      }
      if(result.intrinsic>0){
        const now=new Date().toISOString();
        setHoldings(prev=>{
          const upd=prev.map(holding=>
            holding.ticker===h.ticker
              ?{...holding,intrinsic:result.intrinsic,intrinsicMethod:'ai_search',intrinsicUpdatedAt:now}
              :holding
          );
          if(window.portfolioDB) window.portfolioDB.updateHoldings(upd).catch(e=>console.warn('[intrinsic-single] DB:',e));
          return upd;
        });
        // Update sel only if the user is STILL viewing this stock's detail panel
        // (functional update: if sel has changed to another ticker or null, leave it alone)
        setSel(prev=>prev?.ticker===h.ticker
          ?{...prev,intrinsic:result.intrinsic,intrinsicMethod:'ai_search',intrinsicUpdatedAt:now}
          :prev
        );
        // Persist directly to Supabase via REST
        fetch(`${SB}/rest/v1/holdings?ticker=eq.${encodeURIComponent(h.ticker)}`,{
          method:'PATCH',
          headers:{...SBH,'Prefer':'return=minimal'},
          body:JSON.stringify({
            intrinsic:result.intrinsic,
            intrinsic_method:'ai_search',
            intrinsic_updated_at:now
          })
        }).catch(()=>{});
        console.log(`[intrinsic-single] ${h.ticker}: ${result.intrinsic} from ${result.source||'AI'}`);
      } else {
        console.warn(`[intrinsic-single] ${h.ticker}: AI returned no value — raw: ${raw.slice(0,120)}`);
      }
    }catch(e){console.warn('[intrinsic-single] error:',e.message);}
    setIntrinsicAiLoading(prev=>({...prev,[h.ticker]:false}));
  }

  async function fetchMissingNames(currentHoldings){
    const EDGE_URL='https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';
    const unnamed=(currentHoldings||holdings).filter(h=>
      !h.name||h.name===h.ticker||h.name===''
    );
    if(unnamed.length===0){console.log('[names] All holdings have proper names ✅');return;}
    console.log('[names] Resolving names for',unnamed.length,'unnamed holdings:',unnamed.map(h=>h.ticker).join(', '));

    for(const h of unnamed){
      try{
        const res=await fetch(EDGE_URL,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'ticker_search',query:h.ticker,mkt:h.mkt}),
        });
        if(!res.ok) continue;
        const d=await res.json();
        const results=d.results||[];
        // Find best match: exact ticker match first
        const exact=results.find(r=>r.ticker===h.ticker||r.ticker===h.ticker.replace('.SI','').replace('.HK','').replace('.T',''));
        const best=exact||results[0];
        if(best&&best.name&&best.name!==h.ticker){
          console.log('[names]',h.ticker,'→',best.name);
          setHoldings(prev=>{
            const updated=prev.map(x=>x.ticker===h.ticker?{...x,name:best.name}:x);
            if(window.portfolioDB){
              window.portfolioDB.updateHoldings(updated).catch(e=>console.warn('[names] DB:',e));
            }
            return updated;
          });
        }
      }catch(e){console.warn('[names] failed for',h.ticker,e.message);}
    }
    console.log('[names] Name resolution complete');
  }

  async function fetchSenateTrades(){
    await new Promise(r=>setTimeout(r,300));
    if(SENATE.length>0){
      setSenateData([...SENATE]);
    }
  }

  async function fetchSenatePrices(trades){
    const portSet=new Set(holdings.map(h=>h.ticker));
    const missing=[...new Set((trades||[]).map(t=>t.ticker))].filter(tk=>tk&&tk.length<=6&&!portSet.has(tk));
    if(missing.length===0)return;
    try{
      const res=await fetch('https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'senate_prices',tickers:missing}),
      });
      if(!res.ok){console.warn('senate_prices HTTP',res.status);return;}
      const d=await res.json();
      const map={};
      (d.prices||[]).forEach(p=>{
        if(p.ticker&&p.price>0) map[p.ticker]={price:p.price,intrinsic:p.intrinsic||0,pe:p.pe||0,div:p.div||0};
      });
      if(Object.keys(map).length>0){
        setSenatePrices(prev=>({...prev,...map}));
        console.log('Senate prices (Yahoo):',Object.keys(map).join(', '));
      }
    }catch(e){console.warn('fetchSenatePrices:',e.message);}
  }

  async function fetchSenateHistPrice(ticker, date){
    const key=ticker+'_'+date;
    if(senateHistPrices[key]!==undefined) return; // already fetched
    try{
      const res=await fetch('https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'senate_history',ticker,date}),
      });
      if(res.ok){
        const d=await res.json();
        setSenateHistPrices(prev=>({...prev,[key]:d.price||0}));
      }
    }catch(e){setSenateHistPrices(prev=>({...prev,[key]:0}));}
  }

  async function updateSenateData(){
    try{
      await updateSenateDataSilent(holdings);
      alert('OK: Senate data refreshed from Quiver API');
    }catch(e){
      alert('ERROR: '+e.message);
    }
  } // {period: {portfolio:[],index:[]}}

  async function updateSenateDataSilent(passedHoldings){
    const SB='https://ckyshjxznltdkxfvhfdy.supabase.co';
    const KEY='sb_publishable_y-wyxLIPM0eiQOezFH6UYQ_WEJzxLGz';
    const SBH={'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY};
    try{
      let trades=[];
      const res=await fetch(SB+'/functions/v1/smart-api',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'senate_trades'}),
      });
      if(res.ok){const d=await res.json();if(d.trades?.length>0)trades=d.trades;}
      if(trades.length===0){console.log('Senate auto: Quiver returned no data, keeping existing Supabase data');return;}

      await fetch(SB+"/rest/v1/senate?ticker=neq.__NEVER__",{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});
      for(const t of trades){
        await fetch(SB+'/rest/v1/senate',{method:'POST',headers:{...SBH,'Prefer':'return=minimal'},
          body:JSON.stringify({name:t.name,party:t.party,ticker:t.ticker,action:t.action,
            amount:t.amount,date:t.date,sector:t.sector,est_price:t.est_price||0,
            price_now:t.price_now||0,source:t.source})});
      }

      setSenateData(trades);
      console.log('Senate auto-updated:',trades.length,'trades');

      const portSet=new Set((passedHoldings||[]).map(h=>h.ticker));
      const missing=[...new Set(trades.map(t=>t.ticker))].filter(tk=>tk&&tk.length<=6&&!portSet.has(tk));
      if(missing.length>0){
        const pr=await fetch(SB+'/functions/v1/smart-api',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'senate_prices',tickers:missing}),
        });
        if(pr.ok){
          const pd=await pr.json();
          const map={};
          (pd.prices||[]).forEach(p=>{
            if(p.ticker&&p.price>0) map[p.ticker]={price:p.price,intrinsic:p.intrinsic||0};
          });
          if(Object.keys(map).length>0){
            setSenatePrices(p=>({...p,...map}));
            console.log('Senate prices (Yahoo):',Object.keys(map).length,'tickers');
          }
        }
      }
    }catch(e){console.warn('Senate auto-update failed:',e.message);}
  }

  const [alertData,setAlertData]=useState([]);

  const [screenData,setScreenData]=useState({});     // {TICKER: {rsi, mom1m, revenueGrowth, ...}}
  const [screenLoading,setScreenLoading]=useState(false);
  const [screenLastRun,setScreenLastRun]=useState(null);
  const [screenMode,setScreenMode]=useState("BUY");  // "BUY" or "SELL"
  const [screenBudget,setScreenBudget]=useState(""); // target funds SGD
  const budgetInputRef=React.useRef(null); // read budget without state update
  // Trade form refs — uncontrolled inputs prevent focus loss on re-render
  const tradeRefs={
    ticker:   React.useRef(null),
    date:     React.useRef(null),
    price:    React.useRef(null),
    shares:   React.useRef(null),
  };
  // Holding form refs
  const holdingRefs={
    ticker:    React.useRef(null),
    name:      React.useRef(null),
    shares:    React.useRef(null),
    avgCost:   React.useRef(null),
    price:     React.useRef(null),
    intrinsic: React.useRef(null),
    peRatio:   React.useRef(null),
    divYield:  React.useRef(null),
  };
  const pasteRef=React.useRef(null); // broker paste textarea
  const [screenResults,setScreenResults]=useState([]);
  const [screenAI,setScreenAI]=useState("");         // Claude AI narrative
  const [screenAILoad,setScreenAILoad]=useState(false);      // array of alert objects
  const [alertLoading,setAlertLoading]=useState(false);
  const [alertLastRun,setAlertLastRun]=useState(null); // Date of last scan

  const [perfChartData,setPerfChartData]=useState({});
  const [perfChartLoading,setPerfChartLoading]=useState({});

  const INDEX_ETFS={
    ALL:"SPY", US:"SPY", SG:"ES3.SI", CN:"2800.HK", JP:"^N225", EU:"CSPX.L"
  };

  async function fetchPerfChartData(mktFilter, period){
    const key=mktFilter+"_"+period;
    if(perfChartData[key]) return;
    if(perfChartLoading[key]) return;
    setPerfChartLoading(prev=>({...prev,[key]:true}));

    // Active holdings in this market filter
    const subset=(mktFilter==="ALL"?holdings:holdings.filter(h=>h.mkt===mktFilter))
                  .filter(h=>Number(h.shares)>0);
    if(subset.length===0){setPerfChartLoading(prev=>({...prev,[key]:false}));return;}

    const INDEX_ETFS={ALL:"SPY",US:"SPY",SG:"ES3.SI",CN:"2800.HK",JP:"^N225",EU:"CSPX.L"};
    const idxTicker=INDEX_ETFS[mktFilter]||"SPY";

    // ── Step 1: identify ALL relevant tickers (active + closed positions) ─────────
    // Closed positions are critical for an accurate historical portfolio value.
    // Excluding them understates early value and inflates the TWR numerator.
    const activeTickers=new Set(subset.map(h=>h.ticker));

    // Build a ticker → mkt map from active holdings first, then fill in from trades
    // (needed for FX conversion of closed positions)
    const tickerMktMap={};
    subset.forEach(h=>{tickerMktMap[h.ticker]=h.mkt;});
    trades.forEach(t=>{if(!tickerMktMap[t.ticker]&&t.mkt) tickerMktMap[t.ticker]=t.mkt;});

    // Closed = tickers with trades but not currently active, matching the market filter
    const closedTickers=new Set(
      trades
        .filter(t=>t.date>'2000-01-01' && !activeTickers.has(t.ticker))
        .filter(t=>mktFilter==="ALL" || (tickerMktMap[t.ticker]||'US')===mktFilter)
        .map(t=>t.ticker)
    );

    const allRelevantTickers=[...activeTickers,...closedTickers];

    // ── Step 2: build share-count + cash-flow event timelines ─────────────────────
    // Each event: { dateMs, delta (share change), cf (SGD cash flow for TWR) }
    //   BUY:   delta = +qty,  cf = +(price × qty)        ← money enters portfolio
    //   SELL:  delta = -qty,  cf = -(price × qty)        ← money leaves portfolio
    //   DIV:   delta = 0,     cf = -(t.profit)           ← net dividend out to investor
    //          (cf is negative = money leaving portfolio; Modified Dietz strips this
    //           from the return so dividend income doesn't deflate TWR)
    //   TRANSFER_IN: delta = +qty, cf = +(price × qty)   ← treated like BUY for TWR
    //   SCRIP:       delta = +qty, cf = 0                 ← stock dividend, no cash
    // IMPORTANT: TRANSFER_IN must register its cost as a cash inflow (cf > 0).
    // If cf=0 for TI, the Modified Dietz denominator does not include the capital
    // injected, so the TWR interprets the portfolio value jump as pure price gain —
    // massively inflating returns (e.g. +350% fabricated return in the TI period).
    const shareTimelines={};
    allRelevantTickers.forEach(ticker=>{
      shareTimelines[ticker]=trades
        .filter(t=>t.ticker===ticker && t.date>'2000-01-01')
        .map(t=>({
          dateMs:  new Date(t.date).getTime(),
          delta:   t.type==='BUY'  ?  Number(t.shares)
                 : t.type==='SELL' ? -Number(t.shares)
                 : t.type==='DIV'  ?  0            // cash dividend; no share change
                 :                    Number(t.shares), // SCRIP/TRANSFER_IN: shares added
          cf:      t.type==='BUY'||t.type==='TRANSFER_IN'
                                  ?  Number(t.price)*Number(t.shares)  // capital invested
                 : t.type==='SELL' ? -Number(t.price)*Number(t.shares) // proceeds received
                 : t.type==='DIV'  ? -(Number(t.profit)||0) // net div paid out (negative = outflow)
                 :                   0, // SCRIP: free shares, no cash
        }))
        .sort((a,b)=>a.dateMs-b.dateMs);
    });

    // ── Step 2b: retroactive stock-split adjustment ───────────────────────────────────
    // Yahoo Finance returns SPLIT-ADJUSTED historical prices. For stock splits
    // (SCRIP events at price=0 where scrip_qty ≥ 50% of pre-split holdings),
    // the pre-split share counts must be retroactively multiplied by the split ratio.
    //
    // Without this: before the split, sharesAtDate() returns 300 shares ×
    // adjusted_price(1560 JPY) = 3,744 SGD (5× understatement of actual 18,720).
    // At the split date: 1200 shares added, V leaps 5× with CF=0 → +413% fake TWR spike.
    //
    // Fix: multiply all pre-split deltas by the ratio, remove the SCRIP event itself
    // (now implicit). CF stays unchanged — you paid what you actually paid.
    // Scrip dividends (typically <10% of holding, often with price>0) are left alone.
    allRelevantTickers.forEach(ticker=>{
      const evts=shareTimelines[ticker];
      if(!evts||!evts.length) return;
      // Pass 1: detect splits by running the cumulative qty
      let runQty=0;
      const splits=[];
      for(const e of evts){
        if(e.cf>0){                          runQty+=e.delta; }  // BUY / TI
        else if(e.delta<0){                  runQty=Math.max(0,runQty+e.delta); }  // SELL
        else if(e.cf===0&&e.delta>0&&runQty>0){ // SCRIP candidate
          const ratio=(runQty+e.delta)/runQty;
          if(ratio>=1.5){  // ≥50% addition → treat as stock split
            splits.push({dateMs:e.dateMs,ratio});
          }
          runQty+=e.delta;
        }
      }
      if(!splits.length) return;
      // Pass 2: apply retroactive multiplier to all events BEFORE each split
      splits.forEach(split=>{
        evts.forEach(e=>{
          if(e.dateMs<split.dateMs){
            // Adjust share delta to match post-split equivalent count
            // CF stays the same (actual cash paid in local currency doesn't change)
            e.delta=Math.round(e.delta*split.ratio);
          }
        });
        // Remove the SCRIP event (now implicit in the retroactive count)
        const idx=evts.findIndex(e=>e.dateMs===split.dateMs&&e.cf===0&&e.delta>0);
        if(idx>=0) evts.splice(idx,1);
      });
      shareTimelines[ticker]=evts;
    });
    // Used as a constant price fallback (conservative: no appreciation shown).
    // Better than 0 for the TWR denominator — at least the scale is right.
    const avgCostProxy={};
    allRelevantTickers.forEach(ticker=>{
      let totalCost=0, totalQty=0;
      shareTimelines[ticker].forEach(e=>{
        if(e.cf>0){ totalCost+=e.cf; totalQty+=e.delta; } // BUY + TRANSFER_IN events
      });
      avgCostProxy[ticker]=totalQty>0 ? totalCost/totalQty : 0;
    });

    // ── Step 4: select tickers to request price history for ───────────────────────
    // Active: top 20 by current SGD value (covers ~95%+ of active portfolio).
    // Closed: top 10 by last-sell proceeds (recently significant positions).
    const topActive=[...subset]
      .sort((a,b)=>toSGDlive(b.price*b.shares,b.mkt)-toSGDlive(a.price*a.shares,a.mkt))
      .slice(0,20);
    const topActiveTickers=new Set(topActive.map(h=>h.ticker));

    const topClosed=[...closedTickers]
      .map(ticker=>{
        const lastSell=shareTimelines[ticker].filter(e=>e.cf<0).slice(-1)[0];
        return {ticker, val: lastSell ? Math.abs(lastSell.cf) : 0};
      })
      .sort((a,b)=>b.val-a.val)
      .slice(0,10)
      .map(x=>x.ticker)
      .filter(t=>!topActiveTickers.has(t));

    const holdingTickers=[...topActiveTickers,...topClosed];

    try{
      // ── Step 5: fetch index + price histories from edge function ──────────────────
      const res=await fetch("https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"portfolio_chart",indexTicker:idxTicker,holdingTickers,period}),
      });
      if(!res.ok) throw new Error("HTTP "+res.status);
      const d=await res.json();

      const indexCloses    =d.indexCloses    ||[];
      const indexTimestamps=d.indexTimestamps||[];
      const holdingHistories=d.holdingHistories||{};
      if(indexCloses.length<2) throw new Error("No index data");

      const n=indexCloses.length;
      const periodMs={'30d':30,'6m':180,'1y':365,'5y':1825,'all':3650}[period]||3650;
      const nowMs=Date.now();
      const chartStartMs=nowMs-periodMs*86400000;

      // Pre-compute pointMs array once (Unix ms per chart point)
      const pointMsArr=Array.from({length:n},(_,i)=>
        indexTimestamps[i]
          ? indexTimestamps[i]*1000
          : chartStartMs+(i/(n-1||1))*(nowMs-chartStartMs)
      );

      // ── Step 6: helpers ────────────────────────────────────────────────────────────

      // Cumulative shares held at a given moment (O(events) per call)
      // IMPORTANT: clamp to 0 at EACH STEP, not just at the end.
      // Pre-log SELL events (positions from the old account, before tracking started)
      // create a negative running qty that makes subsequent BUYs invisible in V:
      //   e.g. SELL 500 (pre-log) → qty=-500. Then BUY +100 → qty=-400 → sharesAtDate=0
      //   but CF for that BUY IS registered → TWR shows -18% fake loss (money out, no value in).
      // Per-step clamping resets to 0 at the pre-log SELL, so new BUYs build correctly from 0.
      function sharesAtDate(ticker, ptMs){
        const evts=shareTimelines[ticker];
        if(!evts||!evts.length) return 0;
        let qty=0;
        for(const e of evts){
          if(e.dateMs>ptMs) break;
          qty=Math.max(0,qty+e.delta);  // clamp per-step — pre-log SELLs don't poison future BUYs
        }
        return qty;
      }

      // Historical price at chart point i for a ticker.
      // Priority: real Yahoo history → live price (active) → avg-cost (closed)
      function priceAtPoint(ticker, i){
        const hc=holdingHistories[ticker];
        if(hc&&hc.length>=2){
          const idx=Math.min(Math.round((i/(n-1||1))*(hc.length-1)),hc.length-1);
          const p=hc[idx]; if(p>0) return p;
        }
        const h=holdings.find(hld=>hld.ticker===ticker);
        if(h&&Number(h.shares)>0&&Number(h.price)>0) return Number(h.price);
        return avgCostProxy[ticker]||0;
      }

      // ── Step 7: raw portfolio value V[i] at each chart point ──────────────────────
      // V[i] = Σ over ALL relevant tickers of (sharesAtDate(t,i) × priceAtPoint(t,i))
      // This is the true portfolio market value at each point in time.
      const V=Array.from({length:n},(_,i)=>{
        const ptMs=pointMsArr[i];
        return allRelevantTickers.reduce((s,ticker)=>{
          const qty=sharesAtDate(ticker,ptMs);
          if(qty<=0) return s;
          const price=priceAtPoint(ticker,i);
          if(price<=0) return s;
          return s+toSGDlive(price*qty,tickerMktMap[ticker]||'US');
        },0);
      });

      // ── Step 8: net cash flow CF[i] per chart interval ────────────────────────────
      // Each trade is assigned to the chart point it falls on or after.
      // CF > 0 = money entering portfolio (BUY cost)
      // CF < 0 = money leaving portfolio (SELL proceeds)
      // SCRIP events have cf=0 and are correctly ignored here.
      const CF=new Array(n).fill(0);
      allRelevantTickers.forEach(ticker=>{
        const mkt=tickerMktMap[ticker]||'US';
        shareTimelines[ticker].forEach(evt=>{
          if(evt.cf===0) return;
          // Find first chart point at or after the trade date
          let pi=pointMsArr.findIndex(pts=>pts>=evt.dateMs);
          if(pi<0) pi=n-1;
          CF[pi]+=toSGDlive(evt.cf,mkt);
        });
      });

      // ── Step 9: Modified Dietz TWR chaining ───────────────────────────────────────
      //
      // For each chart interval [i-1 → i]:
      //
      //   R_i = (V_end - V_start - CF_i) / (V_start + CF_i × 0.5)
      //
      //   · CF_i is stripped from the numerator → capital injections/withdrawals
      //     do NOT contribute to the return
      //   · Weight 0.5 assumes cash flows arrive at the midpoint of the interval
      //     (standard Modified Dietz assumption)
      //   · Chaining: TWR[i] = TWR[i-1] × (1 + R_i)
      //
      // This is the industry-standard TWR method (CFA Institute, GIPS compliant).
      // Result: the chart shows pure price appreciation independent of when or
      // how much money was added or withdrawn.

      const firstNonZero=V.findIndex(v=>v>0);
      if(firstNonZero<0) throw new Error("Portfolio has no value in this period");

      const twrSeries=new Array(n).fill(null);
      twrSeries[firstNonZero]=100;

      for(let i=firstNonZero+1;i<n;i++){
        // NaN guard: ?? does not catch NaN (only null/undefined).
        // If a Yahoo Finance gap or Infinity produces NaN in V, it would propagate
        // through every subsequent twrSeries value — silently corrupting the chart.
        const prevRaw=twrSeries[i-1];
        const prev=(prevRaw!=null&&isFinite(prevRaw))?prevRaw:100;
        const vStart=isFinite(V[i-1])?V[i-1]:0;
        const vEnd=isFinite(V[i])?V[i]:0;
        if(vStart<=0){ twrSeries[i]=prev; continue; }
        const cf=CF[i];
        const denom=vStart+cf*0.5;
        // Guard: denom should always be positive (it's starting value + half of
        // net flow). Clamp sub-period return to ±99% as a numerical safety net.
        const r=denom>0 ? Math.max(-0.99,Math.min((vEnd-vStart-cf)/denom,9.99)) : 0;
        twrSeries[i]=prev*(1+r);
      }

      // ── Step 10: trim, align, store ───────────────────────────────────────────────
      // TWR series already starts at 100 at firstNonZero — no rebasing needed.
      // Index is rebased to 100 at the same cut point for a fair comparison.
      const rawPortfolio=twrSeries.slice(firstNonZero);
      const rawIndex    =indexCloses.slice(firstNonZero);
      const rawTimestamps=indexTimestamps.slice(firstNonZero);

      const i0=rawIndex[0]||1;
      const indexRebased=rawIndex.map(v=>v/i0*100);

      setPerfChartData(prev=>({...prev,[key]:{
        portfolio:rawPortfolio,
        index:indexRebased,
        timestamps:rawTimestamps,
      }}));

      const twrFinal=((rawPortfolio[rawPortfolio.length-1]??100)-100).toFixed(1);
      const idxFinal=((indexRebased[indexRebased.length-1]??100)-100).toFixed(1);
      console.log(
        '[TWR]',mktFilter,period,
        '| pts:',rawPortfolio.length,
        '| tickers:',allRelevantTickers.length,'(active:',activeTickers.size,'closed:',closedTickers.size,')',
        '| prices fetched:',holdingTickers.length,
        '| portfolio TWR:',twrFinal+'%',
        '| index:',idxFinal+'%'
      );
    }catch(e){
      console.warn('[TWR] failed:',mktFilter,period,e.message);
    }
    setPerfChartLoading(prev=>({...prev,[key]:false}));
  } // TWR: time-weighted return chart
  const [realHist,setRealHist]=useState({});
  const [histLoading,setHistLoading]=useState({});

  async function fetchRealHistory(ticker, mkt, period){
    const cacheKey=ticker+'_'+period;
    if(realHist[ticker]?.[period]) return;
    if(histLoading[cacheKey]) return;
    setHistLoading(prev=>({...prev,[cacheKey]:true}));
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch('https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'history',ticker,mkt,period}),
        signal:controller.signal,
      });
      clearTimeout(timer);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const d=await res.json();
      if(d.closes&&d.closes.length>1){
        setRealHist(prev=>({...prev,[ticker]:{...(prev[ticker]||{}),[period]:d.closes}}));
        console.log('History loaded:',ticker,period,d.closes.length,'pts');
      } else {
        console.warn('No closes for',ticker,period,'response:',JSON.stringify(d).slice(0,100));
      }
    }catch(e){
      clearTimeout(timer);
      console.warn('History failed:',ticker,period,e.message);
    } finally {
      setHistLoading(prev=>({...prev,[cacheKey]:false}));
    }
  }

  useEffect(()=>{
    if(!window.portfolioDB)return;
    setDbStatus('saving');
    const timer=setTimeout(async()=>{
      try{
        await window.portfolioDB.updateHoldings(holdings);
        setDbStatus('saved');
        setTimeout(()=>setDbStatus('ready'),2000);
      }catch(e){
        console.error('DB save holdings failed:',e);
        setDbStatus('error');
      }
    },600);
    return()=>clearTimeout(timer);
  },[holdings]);

  useEffect(()=>{
    if(!window.portfolioDB)return;
    // Save trades to DB whenever they change (debounced 600ms)
    const timer=setTimeout(async()=>{
      try{
        await window.portfolioDB.updateTrades(trades);
        console.log('[DB] trades saved:',trades.length);
      }catch(e){
        console.error('DB save trades failed:',e);
      }
    },600);
    return()=>clearTimeout(timer);
  },[trades]);

  // Trigger holding-detail fetches when selected stock or period changes
  // (replaces the useEffect that was inside renderHoldingDetail — invalid there)
  useEffect(()=>{
    if(!sel)return;
    setShowAllBuy(false);
    setShowAllSell(false);
    fetchRealHistory(sel.ticker,sel.mkt,detailPeriod);
    if(sel.mkt==="US") fetchValuation(sel.ticker);
  },[sel?.ticker,detailPeriod]);

  const markDirty=()=>setPendingChanges(n=>n+1);

  function doRefresh(){
    setRefreshAnim(true);
    setRefreshKey(k=>k+1);
    setLastRefresh(new Date());
    setPendingChanges(0);
    fetchMoatData(holdings);
    setTimeout(()=>setRefreshAnim(false),800);
  }

  const searchRef=React.useRef("");  // search value stored in ref — never causes App re-render
  const [searchVersion,setSearchVersion]=useState(0); // tick-counter: increments only after debounce fires
  // handleSearch: debounce is now inside PortfolioSearchInput (400ms), so this fires once after pause
  const handleSearch=useCallback(v=>{searchRef.current=v;setSearchVersion(n=>n+1);},[]);
  const handleClear=useCallback(()=>{searchRef.current="";setSearchVersion(n=>n+1);},[]);

  const CCY=useMemo(()=>({
    USD:{symbol:"$",  r:fxRates.USD||1.27},
    SGD:{symbol:"S$", r:1.0},
    HKD:{symbol:"HK$",r:fxRates.HKD||0.163},
    JPY:{symbol:"¥",  r:fxRates.JPY||0.0080},
    EUR:{symbol:"€",  r:fxRates.EUR||1.49},
    GBP:{symbol:"£",  r:fxRates.GBP||1.68},
    AUD:{symbol:"A$", r:fxRates.AUD||0.81},
    CNY:{symbol:"¥",  r:fxRates.CNY||0.175},
    TWD:{symbol:"NT$",r:fxRates.TWD||0.039},
  }),[fxRates]);
  const ccySymbol=ccy=>(CCY[ccy]?.symbol||"$");
  const ccyToSGD=(v,ccy)=>v*(CCY[ccy]?.r??1.36);

  const liveMKT=useMemo(()=>({
    ...MKT,
    US:{...MKT.US, r:fxRates.USD||1.27},
    JP:{...MKT.JP, r:fxRates.JPY||0.0080},
    EU:{...MKT.EU, r:fxRates.EUR||1.49},
    CN:{...MKT.CN, r:fxRates.HKD||0.163},
    GB:{...MKT.GB, r:fxRates.GBP||1.68},
    AU:{...MKT.AU, r:fxRates.AUD||0.81},
    SG:{...MKT.SG, r:1.0},
  }),[fxRates]);

  const toSGDlive=(v,mkt)=>v*(liveMKT[mkt]?.r??fxRates.USD??1.36);

  const tickerNames=useMemo(()=>{
    const map={};
    holdings.forEach(h=>{map[h.ticker]=h.name;});
    return map;
  },[holdings]);

  // Per-ticker realized P&L: capital gains from SELL + net dividends from DIV
  const realizedPerTicker=useMemo(()=>{
    const map={};
    trades.filter(t=>t.type==="SELL"||t.type==="DIV").forEach(t=>{
      map[t.ticker]=(map[t.ticker]||0)+ccyToSGD(t.profit||0,t.ccy||t.mkt);
    });
    return map;
  },[trades,fxRates]);

  // "What if held?" — for each closed position, compute:
  // totalBuyShares: sum of all BUY shares for this ticker
  // avgBuyCost:     weighted avg cost of all BUY trades (native currency)
  // mkt:            market for FX conversion
  const holdDataPerTicker=useMemo(()=>{
    const map={};
    trades.filter(t=>t.type==="BUY").forEach(t=>{
      if(!map[t.ticker]) map[t.ticker]={totalShares:0,totalCost:0,mkt:t.mkt,ccy:t.ccy};
      map[t.ticker].totalShares+=t.shares;
      map[t.ticker].totalCost+=t.shares*t.price;
    });
    // Compute weighted avg buy cost per ticker
    Object.values(map).forEach(d=>{
      d.avgBuyCost=d.totalShares>0?d.totalCost/d.totalShares:0;
    });
    return map;
  },[trades]);

  const [tickerCheck,setTickerCheck]=useState({status:"idle",message:"",suggestions:[]});
  const [tickerSearchTerm,setTickerSearchTerm]=useState("");

  // Option C: portfolio total = DBS statement anchor (Apr 30 SGD 2,614,339.77)
  //            + Σ (live_price - stmt_price) × shares × fxRate  per holding
  // GUARD: only activates when h.stmtPrice is populated on holdings.
  // Without the guard, stmtPrice==null for every holding causes the null branch to add
  // the full live value as delta, double-counting stmtTotal into the portfolio total.
  // Falls back to simple live sum (= banner hdrValSGD) until stmtPrice is implemented.
  const totalValSGD=useMemo(()=>{
    const liveSum=holdings.filter(h=>!h.fullySold).reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
    if(!stmtTotal) return liveSum;
    const hasStmtPrices=holdings.some(h=>h.stmtPrice!=null);
    if(!hasStmtPrices) return liveSum;
    const delta=holdings.filter(h=>!h.fullySold).reduce((s,h)=>{
      const sp=h.stmtPrice!=null?Number(h.stmtPrice):null;
      // New position added after statement date — count full current value as delta
      if(sp==null) return s+toSGDlive(h.price*h.shares,h.mkt);
      return s+toSGDlive((h.price-sp)*h.shares,h.mkt);
    },0);
    return stmtTotal+delta;
  },[holdings,stmtTotal,refreshKey]);
  const totalCostSGD=useMemo(()=>holdings.reduce((s,h)=>s+toSGDlive(h.avgCost*h.shares,h.mkt),0),[holdings,refreshKey]);
  const unrealSGD=totalValSGD-totalCostSGD;
  const unrealPct=totalCostSGD?(unrealSGD/totalCostSGD)*100:0;
  const totalDivSGD=useMemo(()=>holdings.reduce((s,h)=>s+toSGDlive((h.divYield/100)*h.price*h.shares,h.mkt),0),[holdings,refreshKey]);
  const totalShares=useMemo(()=>holdings.reduce((s,h)=>s+h.shares,0),[holdings,refreshKey]);
  const avgCostSGD=totalShares?totalCostSGD/totalShares:0;
  // Realized P&L = capital gains (SELL) + net dividends received (DIV)
  const realizedSGD=useMemo(()=>trades.filter(t=>t.type==="SELL"||t.type==="DIV").reduce((s,t)=>s+ccyToSGD(t.profit||0,t.ccy||t.mkt),0),[trades,fxRates,refreshKey]);
  const hdrHoldings=useMemo(()=>{
    const active=holdings.filter(h=>!h.fullySold);
    return mktFilter==="ALL"?active:active.filter(h=>h.mkt===mktFilter);
  },
  [holdings,mktFilter,refreshKey]);
  const hdrValSGD=useMemo(()=>
    hdrHoldings.reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0),
  [hdrHoldings,refreshKey]);
  const hdrCostSGD=useMemo(()=>
    hdrHoldings.reduce((s,h)=>s+toSGDlive(h.avgCost*h.shares,h.mkt),0),
  [hdrHoldings,refreshKey]);
  const hdrUnrealSGD=hdrValSGD-hdrCostSGD;
  const hdrUnrealPct=hdrCostSGD?(hdrUnrealSGD/hdrCostSGD)*100:0;
  const hdrRealSGD=useMemo(()=>{
    const mktTrades=mktFilter==="ALL"?trades:trades.filter(t=>{
      const h=holdings.find(hh=>hh.ticker===t.ticker);
      return h?h.mkt===mktFilter:t.mkt===mktFilter;
    });
    return mktTrades.filter(t=>t.type==="SELL"||t.type==="DIV").reduce((s,t)=>s+ccyToSGD(t.profit||0,t.ccy||t.mkt),0);
  },[trades,holdings,mktFilter,refreshKey]);
  const hdrDivSGD=useMemo(()=>
    hdrHoldings.reduce((s,h)=>s+toSGDlive((h.divYield/100)*h.price*h.shares,h.mkt),0),
  [hdrHoldings,refreshKey]);
  const hdrNetDivSGD=useMemo(()=>
    hdrHoldings.reduce((s,h)=>s+toSGDlive((h.divYield/100)*h.price*h.shares*(1-getDivTax(h.mkt)),h.mkt),0),
  [hdrHoldings,refreshKey]);

  const wt=h=>filteredTotalSGD?(toSGDlive(h.price*h.shares,h.mkt)/filteredTotalSGD)*100:0;
  const wtTotal=h=>totalValSGD?(toSGDlive(h.price*h.shares,h.mkt)/totalValSGD)*100:0;

  const sectorData=useMemo(()=>{
    const subset=mktFilter==="ALL"?holdings:holdings.filter(h=>h.mkt===mktFilter);
    return SECTORS.map((sec,i)=>({label:sec,color:SCOL[i],value:subset.filter(h=>h.sector===sec).reduce((t,h)=>t+toSGDlive(h.price*h.shares,h.mkt),0)})).filter(d=>d.value>0);
  },[mktFilter,holdings,refreshKey]);
  const countryData=useMemo(()=>{
    const subset=mktFilter==="ALL"?holdings:holdings.filter(h=>h.mkt===mktFilter);
    return [...new Set(subset.map(h=>h.mkt))].map((m,i)=>({label:m,color:[C.accent,C.green,C.gold,C.purple,C.red,"#FF8C42","#62D2E8"][i%7],value:subset.filter(h=>h.mkt===m).reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0)}));
  },[mktFilter,holdings,refreshKey]);
  const filteredTotalSGD=useMemo(()=>{
    const subset=mktFilter==="ALL"?holdings:holdings.filter(h=>h.mkt===mktFilter);
    return subset.reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
  },[mktFilter,holdings,refreshKey]);

  const filtered=useMemo(()=>{
    // Active holdings only — exclude fully sold (shares=0) from ALL analysis/insights
    let h=(mktFilter==="ALL"?holdings:holdings.filter(x=>x.mkt===mktFilter))
      .filter(x=>!x.fullySold&&x.shares>0);
    if(searchRef.current){
      const q=searchRef.current.trim().toUpperCase();
      h=h.filter(x=>x.ticker.toUpperCase().includes(q)||x.name.toUpperCase().includes(q));
      // Sort by relevance: exact ticker > ticker starts-with > ticker contains > name starts-with > name contains
      h=h.sort((a,b)=>{
        const score=x=>{
          const t=x.ticker.toUpperCase(), n=x.name.toUpperCase();
          if(t===q)              return 0; // exact ticker match
          if(t.startsWith(q))    return 1; // ticker starts with query
          if(t.includes(q))      return 2; // ticker contains query
          if(n.startsWith(q))    return 3; // name starts with query
          return 4;                         // name contains query
        };
        return score(a)-score(b);
      });
    }
    return h;
  },[mktFilter,searchVersion,holdings,refreshKey]);

  // Active holdings for insights/analysis (no market filter, no search — full universe)
  const activeHoldings=useMemo(()=>
    holdings.filter(h=>!h.fullySold&&h.shares>0)
  ,[holdings,refreshKey]);

  const byGain=useMemo(()=>[...activeHoldings]
    .filter(h=>h.avgCost>0) // exclude stocks with no cost basis from gain ranking
    .sort((a,b)=>((b.price-b.avgCost)/b.avgCost)-((a.price-a.avgCost)/a.avgCost))
  ,[activeHoldings,refreshKey]);
  const top10=byGain.slice(0,10);
  const worst10=[...byGain].reverse().slice(0,10);
  const buffettList=useMemo(()=>[...activeHoldings]
    .filter(h=>!h.isEtf) // ETFs have no intrinsic value — exclude from Buffett scoring
    .map(h=>{
      const compIV=valuations[h.ticker]?.valuations?.average||0;
      const effIV=compIV>0?compIV:(h.intrinsic||0);
      const hScored={...h,intrinsic:effIV};
      return {...hScored,...buffettScore(hScored)};
    }).sort((a,b)=>b.score-a.score),[activeHoldings,valuations,refreshKey]);

  async function analyse(h){
    if(aiText[h.ticker])return;
    setAiLoad(p=>({...p,[h.ticker]:true}));
    const sc=scoreH(h),m=MKT[h.mkt]||MKT.US,bs=buffettScore(h);
    const up=((h.intrinsic||0)>0)?((h.intrinsic-h.price)/h.price*100).toFixed(1):null;
    const prompt=[
      "Buffett-style analysis for Singapore investor. 3-4 paragraphs.",
      "Stock: "+h.name+" ("+h.ticker+") Market: "+h.mkt+" "+m.code,
      "Price: "+m.symbol+h.price+" approx S$"+fmt(toSGDlive(h.price,h.mkt))+" Avg Cost: "+m.symbol+h.avgCost,
      up!==null?"Intrinsic: "+m.symbol+h.intrinsic+" Upside: "+up+"%":"Intrinsic: N/A — not yet loaded; omit valuation comparison from analysis",
      "Moat: "+h.moat+" PE: "+(h.peRatio>0?h.peRatio:"N/A (pre-profit or data pending)")+" Div: "+h.divYield+"%",
      "Buffett Score: "+bs.score+"/100 Action: "+bs.action,
      "Benchmark: "+m.index+" YTD "+m.idxYtd+"%",
      "1-Business quality and moat 2-Valuation (skip if IV N/A, note it is unavailable) 3-Risks 4-Buffett-style recommendation"
    ].join("\n");
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:900,messages:[{role:"user",content:prompt}]})});
      const d=await res.json();
      setAiText(p=>({...p,[h.ticker]:d.content?.map(c=>c.text||"").join("")||"Unavailable."}));
    }catch(e){setAiText(p=>({...p,[h.ticker]:"AI analysis temporarily unavailable."}));}
    setAiLoad(p=>({...p,[h.ticker]:false}));
  }

  function rebuildHoldingsFromTrades(tradeList, currentHoldings){
    const curH=currentHoldings||holdings;
    // Build metadata from current holdings (source of truth for non-trade fields)
    const meta={};
    curH.forEach(h=>{meta[h.ticker]={...h};});

    const buyMap={};
    tradeList.filter(t=>t.type==="BUY").forEach(t=>{
      if(!buyMap[t.ticker])buyMap[t.ticker]=[];
      buyMap[t.ticker].push(t);
    });
    const sellMap={};
    tradeList.filter(t=>t.type==="SELL").forEach(t=>{
      if(!sellMap[t.ticker])sellMap[t.ticker]=[];
      sellMap[t.ticker].push(t);
    });
    // SCRIP: stock splits / stock dividends that ADD shares with no cash cost.
    // shares = positive new count; profit = negative cost-basis adjustment.
    // e.g. BKNG 25:1 split (2026-04-06) +72sh, BXSL stock div +17sh, D05.SI bonus +170sh
    const scripMap={};
    tradeList.filter(t=>t.type==="SCRIP"&&Number(t.shares)>0).forEach(t=>{
      if(!scripMap[t.ticker])scripMap[t.ticker]=0;
      scripMap[t.ticker]+=Number(t.shares);
    });

    // Include ALL tickers: those with trades AND those with no trades (manually entered)
    const allTickers=new Set([
      ...Object.keys(buyMap),
      ...Object.keys(sellMap),
      ...Object.keys(scripMap),      // SCRIP tickers (stock splits / bonus shares)
      ...curH.map(h=>h.ticker),      // preserve holdings with no trades
    ]);

    const rebuilt=[];
    allTickers.forEach(ticker=>{
      const buys=buyMap[ticker]||[];
      const sells=sellMap[ticker]||[];
      const scripShares=scripMap[ticker]||0;
      const baseH=meta[ticker];

      // No trades at all: keep holding as-is (manually entered position)
      if(buys.length===0&&sells.length===0&&scripShares===0){
        if(baseH) rebuilt.push({...baseH});
        return;
      }

      let totalBuyShares=0,totalBuyCost=0;
      buys.forEach(b=>{totalBuyShares+=b.shares;totalBuyCost+=b.shares*b.price;});
      const totalSellShares=sells.reduce((s,t)=>s+t.shares,0);
      // scripShares adds to net position (zero additional cost — DBS avgCost already reflects)
      const tradesNetShares=totalBuyShares+scripShares-totalSellShares;

      // Shares: trust DB-sourced value as authoritative (same principle as avgCost below).
      // Trades table has incomplete pre-2020 history and may have seeding artifacts.
      // Exception: new ticker with no DB record → compute from trades as best estimate.
      const netShares=baseH!=null ? Number(baseH.shares) : Math.max(0,tradesNetShares);

      // Avg cost: preserve stored DBS-sourced value as authoritative source.
      // Trades DB is supplementary — it does NOT hold complete buy history for all stocks.
      // Stored avgCost was set from DBS bank statements and must not be overridden by trades.
      // Exception: fully sold (set to 0) or brand-new stock with no stored avg (use trades).
      const computedAvgCost=totalBuyShares>0?totalBuyCost/totalBuyShares:0;
      const isFullySold=netShares<=0;
      const avgCostFinal=isFullySold?0
        :(baseH?.avgCost>0?baseH.avgCost  // ← DBS authoritative: preserve stored value
          :parseFloat(computedAvgCost.toFixed(4))); // ← new stock only: derive from trades

      if(baseH){
        rebuilt.push({
          ...baseH,
          shares:isFullySold?0:netShares,
          avgCost:avgCostFinal,
          fullySold:isFullySold, // flag for UI
        });
      } else {
        // New ticker from trades not yet in holdings — use trades-computed avg as the starting point
        rebuilt.push({
          id:Date.now()+Math.random(),ticker,name:ticker,mkt:detectMktFromTicker(ticker)||buys[0]?.mkt||"US",
          sector:"Technology",msStyle:"Large Blend",
          shares:isFullySold?0:netShares,
          avgCost:avgCostFinal,
          price:computedAvgCost,intrinsic:computedAvgCost*1.1,
          moat:"Narrow",divYield:0,senateBuys:0,senateSells:0,peRatio:20,revenueGrowth:0,
          fullySold:isFullySold,
        });
      }
    });
    return rebuilt;
  }
  function submitTrade(forceSubmit=false){
    const {ticker,type,date,price,shares,mkt,ccy}=tradeForm;
    if(!ticker||!price||!shares||!date)return;
    const p=parseFloat(price),s=parseInt(shares),tU=ticker.toUpperCase().trim();
    if(isNaN(p)||isNaN(s)||s<=0||p<=0)return;

    // ── Duplicate check (skip for edits) ─────────────────────────────────────
    if(editTradeId==null&&!forceSubmit){
      const dupe=trades.find(t=>
        t.ticker===tU &&
        t.type===type &&
        t.date===date &&
        Math.abs(t.price-p)<0.001 &&
        t.shares===s
      );
      if(dupe){
        setDupeWarning({trade:dupe,pending:{ticker:tU,type,date,price:p,shares:s,mkt,ccy}});
        return; // stop here — wait for user decision
      }
    }

    // ── Compute profit per trade type ─────────────────────────────────────────
    // DIV: net dividend = price(per share) × shares × (1 − withholding tax rate)
    //      No effect on share count or avg cost.
    // SELL: capital gain = (sellPrice − avgCost) × shares
    // BUY/SCRIP: no profit field
    function calcDivProfit(divPerShare, qty, mktCode, divMode){
      // divMode "gross": profit = divPerShare × qty × (1 − WHT)  [default]
      // divMode "net":   divPerShare IS the net total from the statement;
      //                  qty and WHT are ignored — profit = divPerShare directly
      if(divMode==="net"){
        return parseFloat(parseFloat(divPerShare).toFixed(2));
      }
      const taxRate=getDivTax(mktCode||'US');
      return parseFloat((divPerShare*qty*(1-taxRate)).toFixed(2));
    }

    let newTrades;
    if(editTradeId!=null){
      let editProfit=undefined;
      if(type==="DIV"){
        editProfit=calcDivProfit(p,s,mkt,tradeForm.divMode);
      } else if(type==="SELL"){
        const buysBefore=trades.filter(t=>t.ticker===tU&&t.type==="BUY"&&t.id!==editTradeId);
        const totalBuyShares=buysBefore.reduce((s,t)=>s+t.shares,0);
        const totalBuyCost=buysBefore.reduce((s,t)=>s+t.shares*t.price,0);
        const existH2=holdings.find(h=>h.ticker===tU);
        const avgCostEdit=totalBuyShares>0?totalBuyCost/totalBuyShares:(existH2?.avgCost||p);
        editProfit=parseFloat(((p-avgCostEdit)*s).toFixed(2));
      }
      const hasProfitField=(type==="SELL"||type==="DIV");
      newTrades=trades.map(t=>t.id===editTradeId
        ?{...t,ticker:tU,type,date,price:p,shares:s,mkt,ccy,
          profit:hasProfitField?editProfit:undefined,
          divMode:type==="DIV"?tradeForm.divMode:undefined}
        :t);
      setEditTradeId(null);
    } else {
      const existH=holdings.find(h=>h.ticker===tU);
      let profit=undefined;
      if(type==="DIV"){
        profit=calcDivProfit(p,s,mkt,tradeForm.divMode);
      } else if(type==="SELL"){
        // Use the holding's current avgCost (already reflects all prior buys/sells via WAVG)
        const avgCostNow=existH?.avgCost||0;
        if(avgCostNow>0){
          profit=parseFloat(((p-avgCostNow)*s).toFixed(2));
        } else {
          const allBuysSorted=trades.filter(t=>t.ticker===tU&&t.type==="BUY").sort((a,b)=>a.date.localeCompare(b.date));
          const allSellsSorted=trades.filter(t=>t.ticker===tU&&t.type==="SELL").sort((a,b)=>a.date.localeCompare(b.date));
          let runShares=0,runAvg=0;
          const allSorted=[...allBuysSorted,...allSellsSorted].sort((a,b)=>a.date.localeCompare(b.date));
          allSorted.forEach(t=>{
            if(t.type==="BUY"){runAvg=(runShares*runAvg+t.shares*t.price)/(runShares+t.shares);runShares+=t.shares;}
            else{runShares=Math.max(0,runShares-t.shares);}
          });
          profit=runAvg>0?parseFloat(((p-runAvg)*s).toFixed(2)):0;
        }
      }
      const hasProfitField=(type==="SELL"||type==="DIV");
      const newTrade={id:Date.now(),ticker:tU,type,date,price:p,shares:s,mkt,ccy,
        profit:hasProfitField?profit:undefined,
        divMode:type==="DIV"?tradeForm.divMode:undefined};
      newTrades=[newTrade,...trades];
    }

    setTrades(newTrades);
    // DIV trades do NOT affect share count or avg cost — skip holdings rebuild.
    // BUY: blend new shares incrementally with stored DBS avgCost.
    // SELL: rebuildHoldingsFromTrades handles net share reduction.
    if(type==="DIV"){
      // Only persist the trades; holdings are unchanged
      if(window.portfolioDB){window.portfolioDB.updateTrades([newTrades[0]]).catch(e=>console.error('DB DIV save:',e));}
      setShowTradeForm(false);
      setDupeWarning(null);
      setTradeForm({ticker:"",type:"BUY",date:new Date().toISOString().slice(0,10),price:"",shares:"",mkt:"US",ccy:"USD",divMode:"gross"});
      markDirty();
      return;
    }
    let holdingsForRebuild=holdings;
    if(type==="BUY"&&editTradeId==null){
      const buyH=holdings.find(h=>h.ticker===tU);
      if(buyH&&buyH.shares>0&&buyH.avgCost>0){
        const blendedAvg=parseFloat(((buyH.shares*buyH.avgCost+s*p)/(buyH.shares+s)).toFixed(4));
        holdingsForRebuild=holdings.map(h=>h.ticker===tU?{...h,avgCost:blendedAvg}:h);
      }
    }
    const rebuiltH=rebuildHoldingsFromTrades(newTrades, holdingsForRebuild);
    // Apply share delta for the submitted trade (shares are DB-authoritative in rebuild)
    // New trade: +s for BUY/SCRIP, -s for SELL
    // Edit trade: reverse old delta, apply new delta
    const oldTrade=editTradeId!=null?trades.find(t=>t.id===editTradeId):null;
    const hi=rebuiltH.findIndex(h=>h.ticker===tU);
    if(hi>=0){
      const newDelta=(type==='BUY'||type==='SCRIP')?s:-s;
      const oldDelta=oldTrade?((oldTrade.type==='BUY'||oldTrade.type==='SCRIP')?-Number(oldTrade.shares):Number(oldTrade.shares)):0;
      const finalShares=Math.max(0,Number(rebuiltH[hi].shares)+newDelta+oldDelta);
      rebuiltH[hi]={...rebuiltH[hi],shares:finalShares,fullySold:finalShares<=0};
    }
    setHoldings(rebuiltH);
    if(window.portfolioDB){window.portfolioDB.updateHoldings(rebuiltH).catch(e=>console.error('DB:',e));}
    setShowTradeForm(false);
    setDupeWarning(null);
    setTradeForm({ticker:"",type:"BUY",date:new Date().toISOString().slice(0,10),price:"",shares:"",mkt:"US",ccy:"USD"});
    markDirty();
  }

  // ── Broker message parser ────────────────────────────────────────────────────
  function parseBrokerMsg(text){
    const t=text.trim();
    const result={};
    const buyM=t.match(/\bYour\s+(?:[\w/]+\s+)?(Buy|Sell)\b/i);
    if(buyM) result.type=buyM[1].toUpperCase();
    const nameM=t.match(/(?:Ord Sh|Ord|ETF|Fund|Bond|Stock|Unit),\s+(.+?)\s+\((\w{2,3})\)/i);
    if(nameM){result.companyName=nameM[1].trim();result.mktCode=nameM[2].toUpperCase();}
    const dateM=t.match(/(\d{1,2}\s+\w{3}\s+\d{4})/);
    if(dateM){try{const d=new Date(dateM[1]);result.date=d.toISOString().slice(0,10);}catch(e){}}
    const priceM=t.match(/Filled price:\s*([A-Z]{2,3})\s+([\d,]+\.?\d*)/i);
    if(priceM){result.ccy=priceM[1].toUpperCase();result.price=parseFloat(priceM[2].replace(/,/g,''));}
    const qtyM=t.match(/Filled Qty:\s*([\d,]+)/i);
    if(qtyM) result.shares=parseInt(qtyM[1].replace(/,/g,''),10);
    // Map to Ignitus market codes
    const mktMap={SG:'SG',US:'US',HK:'CN',JP:'JP',AU:'AU',GB:'EU',FR:'EU',DE:'EU',NY:'US'};
    const ccyMap={SGD:'SG',USD:'US',HKD:'CN',JPY:'JP',EUR:'EU',GBP:'EU',AUD:'AU'};
    if(result.mktCode) result.mkt=mktMap[result.mktCode]||result.mktCode;
    else if(result.ccy) result.mkt=ccyMap[result.ccy]||'US';
    // Try to match company name to existing holding ticker
    if(result.companyName){
      const lower=result.companyName.toLowerCase();
      const match=holdings.find(h=>
        h.name&&h.name.toLowerCase().includes(lower.slice(0,10))||
        lower.includes((h.name||'').toLowerCase().slice(0,10))
      );
      if(match){result.ticker=match.ticker;result.matchedName=match.name;}
    }
    return result;
  }

  // ── 3-layer ticker search for broker parse ───────────────────────────────────
  // Layer 1: Supabase holdings DB (instant, no API)
  // Layer 2: Yahoo Finance autocomplete via Edge Function (all markets)
  // Layer 3: User selects from results
  async function searchTickerForParsed(companyName, mkt){
    if(!companyName) return;
    setTickerSearchLoading(true);
    setTickerSearchResults([]);

    // Layer 1: Search own holdings by name (fuzzy)
    const lower = companyName.toLowerCase();
    const ownMatches = holdings
      .filter(h => {
        const hn = (h.name||'').toLowerCase();
        return hn.includes(lower.slice(0,8)) || lower.includes(hn.slice(0,8));
      })
      .map(h => ({ticker:h.ticker, name:h.name, mkt:h.mkt, source:'portfolio', score:20}));

    // Layer 2: Yahoo Finance autocomplete via Edge Function
    const EDGE_URL = 'https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api';
    let yahooResults = [];
    try {
      const res = await fetch(EDGE_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'ticker_search', query:companyName, mkt}),
      });
      if(res.ok){
        const d = await res.json();
        yahooResults = d.results || [];
      }
    } catch(e){ console.warn('[ticker_search]', e.message); }

    // Merge: own holdings first (they're confirmed in portfolio), then Yahoo
    const seen = new Set();
    const merged = [...ownMatches, ...yahooResults].filter(r => {
      if(seen.has(r.ticker)) return false;
      seen.add(r.ticker);
      return true;
    }).slice(0, 6);

    // Layer 3: Claude AI fallback — only if Layer 1+2 found nothing
    if(merged.length === 0){
      console.log('[ticker_search] Layer 1+2 empty — trying Claude AI fallback');
      try{
        const prompt =
          'You are a financial ticker lookup. Given a company name and market, return ONLY valid JSON, no markdown.\n'+
          'Company: '+companyName+'\n'+
          'Market: '+mkt+'\n'+
          'Return: {"found":true/false,"ticker":"TICKER.SUFFIX","name":"Full Name","exchange":"e.g. Tokyo","suggestions":[{"ticker":"T1","name":"N1"}]}\n'+
          'Rules: JP stocks end in .T (e.g. 4704.T), SG stocks end in .SI (e.g. D05.SI), HK stocks end in .HK, US stocks have no suffix.\n'+
          'Always populate suggestions with 1-3 options even if unsure.';

        const aiRes = await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            model:'claude-sonnet-4-20250514',
            max_tokens:300,
            messages:[{role:'user',content:prompt}]
          }),
        });
        if(aiRes.ok){
          const aiD = await aiRes.json();
          const text = (aiD.content||[]).map(c=>c.text||'').join('').trim();
          const clean = text.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim();
          const parsed = JSON.parse(clean);
          // Add main result
          if(parsed.found && parsed.ticker){
            merged.push({
              ticker: parsed.ticker,
              name: parsed.name || companyName,
              mkt: mkt||'US',
              exchange: parsed.exchange||'',
              source: 'ai',
              score: 10,
            });
          }
          // Add suggestions
          (parsed.suggestions||[]).forEach(s=>{
            if(s.ticker && !merged.find(r=>r.ticker===s.ticker)){
              merged.push({
                ticker: s.ticker,
                name: s.name||'',
                mkt: mkt||'US',
                source: 'ai',
                score: 5,
              });
            }
          });
          console.log('[ticker_search] Claude AI found:', merged.map(r=>r.ticker));
        }
      }catch(e){ console.warn('[ticker_search] Claude AI error:', e.message); }
    }

    setTickerSearchResults(merged);
    setTickerSearchLoading(false);

    // Auto-select if exactly 1 result found
    if(merged.length === 1){
      setParsedTrade(p => ({...p, ticker:merged[0].ticker, matchedName:merged[0].name}));
    }
  }

  function applyParsedTrade(){
    if(!parsedTrade) return;
    const p=parsedTrade;
    setTradeForm({
      ticker:p.ticker||'',
      type:p.type||'BUY',
      date:p.date||new Date().toISOString().slice(0,10),
      price:p.price?String(p.price):'',
      shares:p.shares?String(p.shares):'',
      mkt:p.mkt||'SG',
      ccy:p.ccy||'SGD',
    });
    if(p.ticker){setTickerSearchTerm(p.ticker);if(searchInputRef.current)searchInputRef.current.value=p.ticker;}
    setShowPasteParser(false);
    setShowTradeForm(true);
    setEditTradeId(null);
    setPasteText('');
    setParsedTrade(null);
  }

  function deleteTrade(id){
    const del=trades.find(t=>t.id===id);
    const newTrades=trades.filter(t=>t.id!==id);
    setTrades(newTrades);
    const rebuiltH2=rebuildHoldingsFromTrades(newTrades, holdings);
    // Reverse the deleted trade's share effect
    if(del&&del.type!=='DIV'){
      const hi=rebuiltH2.findIndex(h=>h.ticker===del.ticker);
      if(hi>=0){
        const reverseDelta=(del.type==='BUY'||del.type==='SCRIP')?-Number(del.shares):Number(del.shares);
        const finalShares=Math.max(0,Number(rebuiltH2[hi].shares)+reverseDelta);
        rebuiltH2[hi]={...rebuiltH2[hi],shares:finalShares,fullySold:finalShares<=0};
      }
    }
    setHoldings(rebuiltH2);
    if(window.portfolioDB){window.portfolioDB.deleteTrade(id).catch(e=>console.error('DB:',e));window.portfolioDB.updateHoldings(rebuiltH2).catch(e=>console.error('DB:',e));}
    markDirty();
  }

  function startEditTrade(t){
    setTradeForm({ticker:t.ticker,type:t.type,date:t.date,price:String(t.price),shares:String(t.shares),mkt:t.mkt||"US",ccy:t.ccy||"USD"});
    setEditTradeId(t.id);
    setShowTradeForm(true);
    setTickerCheck({status:"idle",message:"",suggestions:[]});
  }

  async function lookupTicker(query){
    if(!query||query.trim().length<2)return;
    setTickerCheck({status:"loading",message:"Searching...",suggestions:[]});
    const term=query.trim();
    const inPort=holdings.find(h=>h.ticker===term.toUpperCase());
    if(inPort){
      setTickerCheck({status:"found",message:inPort.name,suggestions:[],confirmed:inPort.ticker});
      setTradeForm(f=>({...f,ticker:inPort.ticker}));
      return;
    }
    const prompt="You are a financial ticker symbol lookup. Given a company name or ticker, return ONLY a JSON object with no markdown, no explanation.\nQuery: "+term+"\nReturn: {\"found\":true/false,\"ticker\":\"TICKER\",\"name\":\"Full Company Name\",\"exchange\":\"US/SG/CN/JP/EU/HK\",\"suggestions\":[{\"ticker\":\"T1\",\"name\":\"Name1\"},{\"ticker\":\"T2\",\"name\":\"Name2\"}]}\nIf the query looks like a ticker symbol, validate it and return its full name. If it looks like a company name, suggest up to 3 matching tickers. Always populate suggestions array with 1-3 options.";
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,messages:[{role:"user",content:prompt}]})
      });
      const d=await res.json();
      const text=d.content?.map(c=>c.text||"").join("").trim();
      const clean=text.replace(/^```json\s*/,"").replace(/```\s*$/,"").trim();
      const parsed=JSON.parse(clean);
      if(parsed.found){
        setTickerCheck({status:"found",message:parsed.name,suggestions:parsed.suggestions||[],confirmed:parsed.ticker});
        if(parsed.ticker){
          const autoMkt=detectMktFromTicker(parsed.ticker);
          const autoCcy=autoMkt?mktToCcy(autoMkt):null;
          setTradeForm(f=>({...f,
            ticker:parsed.ticker,
            ...(autoMkt&&f.mkt==='US'?{mkt:autoMkt}:{}),
            ...(autoCcy&&f.ccy==='USD'?{ccy:autoCcy}:{}),
          }));
        }
      } else {
        setTickerCheck({status:"suggestions",message:"Not found. Did you mean:",suggestions:parsed.suggestions||[]});
      }
    }catch(e){
      setTickerCheck({status:"error",message:"Lookup failed. Enter ticker manually.",suggestions:[]});
    }
  }

  function openEditHolding(h){
    setHoldingForm({
      ticker:h.ticker,name:h.name||"",mkt:h.mkt,sector:h.sector||"Technology",
      shares:String(h.shares),avgCost:String(h.avgCost),price:String(h.price),
      intrinsic:String(h.intrinsic||""),divYield:String(h.divYield||0),
      peRatio:String(h.peRatio||0),moat:h.moat||"Narrow",msStyle:h.msStyle||"Large Blend",
      heldSince:h.heldSince||""
    });
    setHoldingEditId(h.id);
    setSel(null);
  }

  function saveHolding(){
    const f=holdingForm;
    const s=parseInt(f.shares),ac=parseFloat(f.avgCost),pr=parseFloat(f.price);
    if(!f.ticker||isNaN(s)||isNaN(ac)||isNaN(pr)||s<=0)return;
    setHoldings(prev=>prev.map(h=>
      h.id===holdingEditId
        ?{...h,ticker:f.ticker.trim().toUpperCase(),name:f.name||f.ticker,mkt:f.mkt,sector:f.sector,
           shares:s,avgCost:ac,price:pr,intrinsic:parseFloat(f.intrinsic)||pr*1.1,
           divYield:parseFloat(f.divYield)||0,peRatio:parseFloat(f.peRatio)||0,
           moat:f.moat,msStyle:f.msStyle,
           heldSince:f.heldSince||null}
        :h
    ));
    setHoldingEditId(null);
    setHoldingForm({});
    if(window.portfolioDB){window.portfolioDB.updateHoldings(holdings).catch(e=>console.error('DB:',e));}
    setTimeout(()=>fetchMoatData(holdings), 500);
    markDirty();
  }

  function confirmDeleteHolding(id){setDeleteConfirm(id);}
  function doDeleteHolding(){
    const ticker=holdings.find(h=>h.id===deleteConfirm)?.ticker;
    setHoldings(prev=>prev.filter(h=>h.id!==deleteConfirm));
    if(window.portfolioDB&&ticker){window.portfolioDB.deleteHolding(ticker).catch(e=>console.error('DB:',e));}
    setDeleteConfirm(null);
    setSel(null);
    markDirty();
  }

  const card={background:C.card,borderRadius:12,padding:16,marginBottom:10,border:`1px solid ${C.border}`};
  const cardT={fontSize:14,fontWeight:700,color:C.mutedLight,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:14};
  const row={display:"flex",justifyContent:"space-between",alignItems:"center"};
  const pill=a=>({padding:"6px 13px",borderRadius:20,fontSize:14,fontWeight:a?700:500,background:a?C.accent:"transparent",color:a?C.bg:C.muted,border:`1px solid ${a?C.accent:C.border}`,cursor:"pointer"});
  const smPill=a=>({padding:"5px 11px",borderRadius:14,fontSize:14,fontWeight:a?700:500,background:a?C.surface:C.bg,color:a?C.accent:C.muted,border:`1px solid ${a?C.accent:C.border}`,cursor:"pointer"});
  const inp={width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"};
  const modal={position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"flex-end",zIndex:9999};
  const mCard={background:C.card,borderRadius:"20px 20px 0 0",padding:"16px 20px 60px",width:"100%",maxWidth:430,margin:"0 auto",flex:1,minHeight:0,overflowY:"scroll",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",boxSizing:"border-box"};
  const sbox=col=>({background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${col?col+"35":C.border}`});
  const PERIODS=["30d","6m","1y","5y","all"];
  const PLBL={"30d":"30D","6m":"6M","1y":"1Y","5y":"5Y","all":"All"};

  // Render function (not a component) — avoids React treating it as a new component type on each App render,
  // which would unmount+remount the subtree and destroy any focused input inside.
  function renderPortfolioView(){
    const activeM=MKT[mktFilter];
    return(
      <>
        <div style={{marginBottom:12}}>
          <div style={cardT}>Select Market</div>
          <MktSelector mktFilter={mktFilter} setMktFilter={setMktFilter} holdings={holdings}/>
        </div>
        <div style={card}>
          <div style={{...row,marginBottom:10}}>
            <div style={cardT}>{mktFilter==="ALL"?"All vs S&P 500":`${mktFilter} vs ${activeM?.index}`}</div>
            <div style={{display:"flex",gap:3}}>
              {PERIODS.map(p=><button key={p} style={smPill(chartPeriod===p)} onClick={()=>setChartPeriod(p)}>{PLBL[p]}</button>)}
            </div>
          </div>
          <PerfChart mktFilter={mktFilter} period={chartPeriod} holdings={holdings} perfChartData={perfChartData} perfChartLoading={perfChartLoading} fetchPerfChartData={fetchPerfChartData}/>

        </div>
        <div style={card}>
          <div style={cardT}>Allocation (SGD)</div>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <DonutChart data={groupBy==="sector"?sectorData:countryData}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:5,marginBottom:8}}>
                <button style={pill(groupBy==="sector")} onClick={()=>setGroupBy("sector")}>Sector</button>
                <button style={pill(groupBy==="country")} onClick={()=>setGroupBy("country")}>Country</button>
              </div>
              {(groupBy==="sector"?sectorData:countryData).slice(0,8).map(d=>(
                <div key={d.label} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:3,background:d.color}}/><span style={{fontSize:13,color:C.mutedLight}}>{d.label}</span></div>
                  <span style={{fontSize:13,fontWeight:700}}>{filteredTotalSGD>0?((d.value/filteredTotalSGD)*100).toFixed(1):0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Search input — memoized with stable callbacks so re-renders never cause focus loss */}
        <PortfolioSearchInput
          onSearch={handleSearch}
          onClear={handleClear}
        />
        {/* Sort controls */}
        <div style={{display:"flex",gap:5,marginBottom:8,overflowX:"auto",paddingBottom:2}}>
          {[
            {key:"default", label:"📋 A→Z",    tip:"Alphabetical by ticker"},
            {key:"best",    label:"📈 Best",   tip:"Highest % gain first"},
            {key:"worst",   label:"📉 Worst",  tip:"Biggest % loss first"},
            {key:"value",   label:"💰 Value",  tip:"Largest SGD value first"},
            {key:"div",     label:"💵 Div",    tip:"Highest dividend yield (hides non-payers)"},
          ].map(s=>(
            <button key={s.key} onClick={()=>setHoldingSort(s.key)} title={s.tip} style={{
              flexShrink:0,padding:"7px 13px",borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",
              background:holdingSort===s.key?C.accent:C.surface,
              color:holdingSort===s.key?"#000":C.muted,
              border:`1px solid ${holdingSort===s.key?C.accent:C.border}`,
            }}>{s.label}</button>
          ))}
        </div>
        {/* Dividend analysis summary when dividend sort is active */}
        {holdingSort==="div"&&(()=>{
          const divH=(mktFilter==="ALL"?holdings:holdings.filter(h=>h.mkt===mktFilter))
            .filter(h=>h.divYield>0)
            .sort((a,b)=>(b.divYield||0)-(a.divYield||0));
          const totalDivSGDLocal=divH.reduce((s,h)=>s+toSGDlive((h.divYield/100)*h.price*h.shares,h.mkt),0);
          const totalNetDivSGDLocal=divH.reduce((s,h)=>s+toSGDlive((h.divYield/100)*h.price*h.shares*(1-getDivTax(h.mkt)),h.mkt),0);
          const totalValSGDLocal=divH.reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
          const blendedYield=totalValSGDLocal>0?totalDivSGDLocal/totalValSGDLocal*100:0;
          return divH.length>0?(
            <div style={{...card,background:C.gold+"0A",border:`1px solid ${C.gold}30`,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:14,color:C.gold,fontWeight:700,letterSpacing:"0.08em",marginBottom:2}}>💵 DIVIDEND ANALYSIS</div>
                  <div style={{fontSize:13,color:C.muted}}>{divH.length} dividend-paying stocks · sorted highest yield first</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:17,fontWeight:800,color:C.gold}}>{fmtS(totalDivSGDLocal)}/yr gross</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.green}}>{fmtS(totalNetDivSGDLocal)}/yr net after WHT</div>
                  <div style={{fontSize:13,color:C.muted}}>Blended yield: <b style={{color:C.gold}}>{fmt(blendedYield,2)}%</b></div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                {divH.slice(0,6).map(h=>{
                  const annDiv=toSGDlive((h.divYield/100)*h.price*h.shares,h.mkt);
                  const taxRate=getDivTax(h.mkt);
                  const netDiv=annDiv*(1-taxRate);
                  return(
                    <div key={h.ticker} style={{background:C.surface,borderRadius:6,padding:"5px 7px",textAlign:"left"}}>
                      <div style={{fontSize:14,fontWeight:700}}>{h.ticker}</div>
                      <div style={{fontSize:14,fontWeight:800,color:C.gold}}>{fmt(h.divYield,2)}%</div>
                      <div style={{fontSize:12,color:C.muted}}>{fmtS(annDiv)}/yr gross</div>
                      {taxRate>0&&<div style={{fontSize:12,color:C.green}}>{fmtS(netDiv)}/yr net</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ):null;
        })()}
        <div style={{fontSize:14,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>{filtered.length} Holdings{mktFilter!=="ALL"?` · ${mktFilter!=="CN"?mktFilter:"HK"}`:""}</div>
        {(()=>{
          let src2=holdingSort==="div"
            ?filtered.filter(h=>(h.divYield||0)>0)  // hide zero-dividend stocks
            :filtered.filter(h=>!h.fullySold&&h.shares>0); // exclude sold from all sorts
          // When searching, filtered is already relevance-sorted — don't override with holdingSort
          if(!searchRef.current){
            if(holdingSort==="default") src2.sort((a,b)=>a.ticker.localeCompare(b.ticker)); // A→Z
            else if(holdingSort==="best") src2.sort((a,b)=>((b.price-b.avgCost)/b.avgCost)-((a.price-a.avgCost)/a.avgCost));
            else if(holdingSort==="worst") src2.sort((a,b)=>((a.price-a.avgCost)/a.avgCost)-((b.price-b.avgCost)/b.avgCost));
            else if(holdingSort==="value") src2.sort((a,b)=>toSGDlive(b.price*b.shares,b.mkt)-toSGDlive(a.price*a.shares,a.mkt));
            else if(holdingSort==="div") src2.sort((a,b)=>(b.divYield||0)-(a.divYield||0));
          }
          return src2;
        })().map(h=>{
          const localVal=h.price*h.shares,localCost=h.avgCost*h.shares,localGain=localVal-localCost;
          const gainPct=h.avgCost>0?((h.price-h.avgCost)/h.avgCost)*100:0;
          const isSold=h.fullySold||h.shares===0;
          const tickerRealized=realizedPerTicker[h.ticker]||0;
          const compIV=valuations[h.ticker]?.valuations?.average||0;
          const effIV=compIV>0?compIV:h.intrinsic;
          const upside=effIV>0&&h.price>0?((effIV-h.price)/h.price)*100:0;
          const sgdVal=toSGDlive(localVal,h.mkt),sgdGain=toSGDlive(localGain,h.mkt);
          const hScored={...h,intrinsic:effIV};
          const w=wt(h),pos=gainPct>=0,sc=scoreH(hScored),r=getRec(hScored);
          const sCol=SCOL[SECTORS.indexOf(h.sector)%SCOL.length];
          return(
            <div key={h.id} style={{...card,cursor:"pointer",
              opacity:isSold?0.65:1,
              borderLeft:isSold?`3px solid ${C.muted}`:undefined,
            }} onClick={()=>{setSel(h);setDetailPeriod("6m");}}>
              {/* Sold banner */}
              {isSold&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  background:C.muted+"18",borderRadius:6,padding:"4px 10px",marginBottom:8,
                  border:`1px solid ${C.muted}30`}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:"0.06em"}}>✓ FULLY SOLD</span>
                  <span style={{fontSize:12,color:C.muted}}>Holdings: 0</span>
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,fontSize:17}}>{h.ticker}</span>
                    <Chip mkt={h.mkt}/>
                    <Tag col={sCol}>{h.sector}</Tag>
                  </div>
                  <div style={{fontSize:14,color:C.muted,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:200}}>{h.name}</div>
                  <div style={{fontSize:14,color:C.mutedLight,marginTop:3}}>
                    Avg Cost: {isSold
                      ?<b style={{color:C.muted}}>N/A (fully sold)</b>
                      :<><b style={{color:C.text}}>{fmtL(h.avgCost,h.mkt)}</b><span style={{color:C.muted,fontWeight:400}}> ({fmtS(toSGDlive(h.avgCost,h.mkt))})</span></>}
                  </div>
                  {!isSold&&<div style={{fontSize:14,color:C.mutedLight,marginTop:1}}>
                    Intrinsic: {effIV>0
                      ?<><b style={{color:upside>=0?C.green:C.red}}>{fmtL(effIV,h.mkt)}</b>{compIV>0&&<span style={{color:C.purple,fontSize:12,fontWeight:700,marginLeft:3}}>●</span>}<span style={{color:C.muted,fontWeight:400}}> {upside>=0?"+":""}{fmt(upside,1)}% upside</span></>
                      :<>{!h.isEtf&&<span style={{fontSize:12,fontWeight:700,color:C.red,background:C.red+"18",border:`1px solid ${C.red}40`,borderRadius:3,padding:"1px 5px",marginRight:4}}>⚠ IV missing</span>}<span style={{color:C.muted}}>—</span></>}
                  </div>}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,marginLeft:8}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:17,fontWeight:800}}>{fmtL(h.price,h.mkt)}</div>
                    <div style={{fontSize:13,color:C.muted}}>{fmtS(toSGDlive(h.price,h.mkt))}</div>
                    {isSold
                      ?<div style={{fontSize:13,fontWeight:700,color:C.muted}}>0 sh</div>
                      :<><div style={{fontSize:14,color:pos?C.green:C.red,fontWeight:700}}>{fmtPct(gainPct)}</div>
                        <div style={{fontSize:13,color:C.muted}}>{h.shares.toLocaleString()} sh</div></>}
                  </div>
                  <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>openEditHolding(h)} style={{fontSize:14,padding:"3px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:"transparent",color:C.accent,cursor:"pointer",fontWeight:600}}>Edit</button>
                    <button onClick={()=>confirmDeleteHolding(h.id)} style={{fontSize:14,padding:"3px 8px",borderRadius:5,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontWeight:600}}>Del</button>
                  </div>
                </div>
              </div>
              {isSold?(()=>{
                // ── Sale Quality Analysis ────────────────────────────────────────
                // Find the last SELL trade for this ticker to anchor the analysis.
                // Compare sell price vs current live price → did the stock keep rising?
                const sellTrades=trades.filter(t=>t.ticker===h.ticker&&t.type==="SELL")
                  .sort((a,b)=>b.date.localeCompare(a.date));
                const lastSell=sellTrades[0]||null;
                const firstBuy=trades.filter(t=>t.ticker===h.ticker&&t.type==="BUY")
                  .sort((a,b)=>a.date.localeCompare(b.date))[0]||null;

                // Current live price of the stock (still fetched even for sold positions)
                const livePrice=h.price||0;
                const sellPrice=lastSell?Number(lastSell.price):0;

                // % change from sell price to today's price
                // Positive = stock rose after sale (sold too early)
                // Negative = stock fell after sale (good sale)
                const priceDelta=sellPrice>0&&livePrice>0
                  ?((livePrice-sellPrice)/sellPrice)*100
                  :null;

                // Total shares sold across all SELL trades
                const totalSharesSold=sellTrades.reduce((s,t)=>s+Number(t.shares),0);

                // Opportunity cost (or saving): what would the position be worth today
                // vs what it was sold for (using total shares × prices)
                const totalSellProceeds=sellTrades.reduce((s,t)=>s+Number(t.price)*Number(t.shares),0);
                const todayValue=totalSharesSold*livePrice;
                const opportunitySGD=livePrice>0&&totalSharesSold>0
                  ?toSGDlive(todayValue-totalSellProceeds,h.mkt)
                  :null;

                // Verdict thresholds:
                // Stock >10% higher  → Sold Too Early (red flag)
                // Stock  5-10% higher → Possibly Early (amber)
                // Stock  0- 5% higher → Roughly Right  (green)
                // Stock lower         → Good Sale       (green)
                const verdict=priceDelta===null?null
                  :priceDelta>10  ?{lbl:"⚠ Sold Too Early",  col:C.red,    bg:C.red+"18"}
                  :priceDelta>5   ?{lbl:"↗ Possibly Early",   col:C.gold,   bg:C.gold+"18"}
                  :priceDelta>=0  ?{lbl:"✓ Roughly Right",    col:C.green,  bg:C.green+"18"}
                  :               {lbl:"✓ Good Sale",          col:C.green,  bg:C.green+"18"};

                return(
                  <div style={{background:C.surface,borderRadius:8,padding:"8px 12px",marginBottom:7}}>
                    {/* Row 1: Realized P&L */}
                    {tickerRealized!==0&&(
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        marginBottom:lastSell?6:0}}>
                        <div style={{fontSize:13,color:C.muted}}>Realized P&amp;L</div>
                        <div style={{fontSize:15,fontWeight:800,color:tickerRealized>=0?C.green:C.red}}>
                          {tickerRealized>=0?"+":"-"}{fmtS(Math.abs(tickerRealized))}
                        </div>
                      </div>
                    )}

                    {/* Row 2: Sale quality analysis */}
                    {lastSell&&livePrice>0&&(
                      <div style={{borderTop:tickerRealized!==0?`1px solid ${C.border}`:"none",
                        paddingTop:tickerRealized!==0?6:0}}>

                        {/* Verdict badge */}
                        {verdict&&(
                          <div style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",marginBottom:5}}>
                            <span style={{fontSize:12,fontWeight:700,
                              color:verdict.col,background:verdict.bg,
                              borderRadius:4,padding:"2px 7px",
                              border:`1px solid ${verdict.col}40`}}>
                              {verdict.lbl}
                            </span>
                            {priceDelta!==null&&(
                              <span style={{fontSize:12,color:priceDelta>0?C.red:C.green,fontWeight:700}}>
                                {priceDelta>0?"+":""}{priceDelta.toFixed(1)}% since sale
                              </span>
                            )}
                          </div>
                        )}

                        {/* Price comparison grid */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                          gap:4,fontSize:12}}>
                          <div>
                            <div style={{color:C.muted,marginBottom:1}}>Sold</div>
                            <div style={{fontWeight:700}}>{fmtL(sellPrice,h.mkt)}</div>
                            <div style={{color:C.muted,fontSize:11}}>{lastSell.date}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{color:C.muted,marginBottom:1}}>Now</div>
                            <div style={{fontWeight:700,
                              color:livePrice>sellPrice?C.red:C.green}}>
                              {fmtL(livePrice,h.mkt)}
                            </div>
                            <div style={{color:C.muted,fontSize:11}}>live</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{color:C.muted,marginBottom:1}}>
                              {opportunitySGD!==null
                                ?(opportunitySGD>=0?"Missed":"Saved")
                                :"—"}
                            </div>
                            {opportunitySGD!==null&&(
                              <>
                                <div style={{fontWeight:700,
                                  color:opportunitySGD>0?C.red:C.green}}>
                                  {opportunitySGD>0?"+":"-"}{fmtS(Math.abs(opportunitySGD))}
                                </div>
                                <div style={{color:C.muted,fontSize:11}}>
                                  {opportunitySGD>0?"if still held":"by selling"}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Holding period */}
                        {firstBuy&&(()=>{
                          const ms=new Date(lastSell.date)-new Date(firstBuy.date);
                          const days=Math.round(ms/86400000);
                          const yrs=(days/365).toFixed(1);
                          return(
                            <div style={{fontSize:11,color:C.muted,marginTop:5,
                              textAlign:"center",borderTop:`1px solid ${C.border}`,paddingTop:4}}>
                              Held {days>365?`${yrs} yrs`:`${days} days`}
                              {` · from ${firstBuy.date} to ${lastSell.date}`}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {!lastSell&&tickerRealized===0&&(
                      <div style={{textAlign:"center",fontSize:13,color:C.muted}}>
                        Position closed · Tap to view trade history
                      </div>
                    )}
                  </div>
                );
              })():(
                <div style={{background:C.accent+"0D",border:`1px solid ${C.accentDim}20`,borderRadius:8,padding:"7px 10px",marginBottom:7}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginBottom:4}}>
                    <div><div style={{fontSize:13,color:C.muted}}>Value</div><div style={{fontSize:14,fontWeight:800}}>{fmtL(localVal,h.mkt,0)}</div><div style={{fontSize:13,color:C.muted}}>{fmtS(sgdVal)}</div></div>
                    <div style={{textAlign:"center"}}><div style={{fontSize:13,color:C.muted}}>Weight{mktFilter!=="ALL"?` (${mktFilter})`:""}</div><div style={{fontSize:17,fontWeight:800,color:C.accent}}>{w.toFixed(1)}%</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:13,color:C.muted}}>Unr. P&amp;L</div><div style={{fontSize:14,fontWeight:800,color:pos?C.green:C.red}}>{pos?"+":"-"}{fmtL(Math.abs(localGain),h.mkt,0)}</div><div style={{fontSize:13,color:C.muted}}>{pos?"+":"-"}{fmtS(Math.abs(sgdGain))}</div></div>
                  </div>
                  {tickerRealized!==0&&(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:5,marginTop:3,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:12,color:C.muted}}>Realized P&amp;L</div>
                      <div style={{fontSize:13,fontWeight:700,color:tickerRealized>=0?C.green:C.red}}>
                        {tickerRealized>=0?"+":"-"}{fmtS(Math.abs(tickerRealized))}
                      </div>
                    </div>
                  )}
                  <div style={{height:3,borderRadius:2,background:C.border,marginTop:4}}><div style={{width:`${Math.min(w*2.5,100)}%`,height:"100%",borderRadius:2,background:C.accent,opacity:0.7}}/></div>
                </div>
              )}
              {!isSold&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{flex:1,marginRight:10}}><ScoreBar score={sc.all} max={10}/></div>
                <div style={{display:"flex",gap:4}}>
                  <Bdg label={h.moat+" Moat"} bg={h.moat==="Wide"?"#1A2E1A":"#2A2A1A"} color={h.moat==="Wide"?C.green:C.gold} title={moatUpdatedAt?"Moat: "+h.moat+" (Morningstar, updated "+moatUpdatedAt+")":undefined}/>
                  <Bdg label={r.lbl} bg={r.col+"22"} color={r.col}/>
                  {holdingSort==="div"&&h.divYield>0&&<Bdg label={fmt(h.divYield,2)+"% div"} bg={C.gold+"22"} color={C.gold}/>}
                </div>
              </div>}
            </div>
          );
        })}

        {/* ── Closed Positions Toggle ───────────────────────────────── */}
        {(()=>{
          const soldInMarket=holdings.filter(h=>(h.fullySold||h.shares===0)&&
            (mktFilter==="ALL"||h.mkt===mktFilter));
          if(soldInMarket.length===0) return null;
          return(
            <>
              <button onClick={()=>setShowSoldStocks(s=>!s)} style={{
                width:"100%",marginTop:10,marginBottom:showSoldStocks?10:0,
                padding:"10px 14px",borderRadius:10,
                border:`1px solid ${C.muted}44`,
                background:showSoldStocks?C.surface:"transparent",
                color:C.muted,cursor:"pointer",
                display:"flex",justifyContent:"space-between",alignItems:"center",
                fontSize:14,fontWeight:600}}>
                <span>✓ Closed Positions ({soldInMarket.length})</span>
                <span style={{fontSize:12}}>{showSoldStocks?"▲ Hide":"▼ Show"}</span>
              </button>
              {showSoldStocks&&soldInMarket.map(h=>{
                const tickerRealized=realizedPerTicker[h.ticker]||0;
                const hd=holdDataPerTicker[h.ticker];
                // "If held today" calculation:
                // hypothetical value = current live price × original total BUY shares
                // hypothetical P&L   = (current price − avg buy cost) × total shares
                const origShares = hd?.totalShares||0;
                const avgBuy     = hd?.avgBuyCost||0;
                const ifHeldPL   = origShares>0&&avgBuy>0&&h.price>0
                  ? toSGDlive((h.price-avgBuy)*origShares, hd.mkt||h.mkt)
                  : null;
                const ifHeldPct  = avgBuy>0&&h.price>0
                  ? ((h.price-avgBuy)/avgBuy)*100
                  : null;
                return(
                  <div key={h.id} style={{...card,opacity:0.75,
                    borderLeft:`3px solid ${C.muted}`,cursor:"pointer"}}
                    onClick={()=>{setSel(h);setDetailPeriod("6m");}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      background:C.muted+"15",borderRadius:6,padding:"4px 10px",marginBottom:8,
                      border:`1px solid ${C.muted}22`}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:"0.06em"}}>✓ FULLY SOLD</span>
                      <span style={{fontSize:12,color:C.muted}}>{origShares>0?`${origShares} sh originally`:"Holdings: 0"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                          <span style={{fontWeight:800,fontSize:17}}>{h.ticker}</span>
                          <Chip mkt={h.mkt}/>
                        </div>
                        <div style={{fontSize:14,color:C.muted,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220}}>{h.name}</div>
                        <div style={{fontSize:13,color:C.muted,marginTop:2}}>
                          Avg Cost: <b style={{color:avgBuy>0?C.text:C.muted}}>
                            {avgBuy>0?fmtL(avgBuy,hd?.mkt||h.mkt):"N/A"}
                          </b>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                        <div style={{fontSize:16,fontWeight:800}}>{fmtL(h.price,h.mkt)}</div>
                        <div style={{fontSize:12,color:C.muted}}>today's price</div>
                      </div>
                    </div>

                    {/* Realized P&L row */}
                    {tickerRealized!==0&&(
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        marginTop:8,padding:"6px 10px",borderRadius:7,
                        background:tickerRealized>=0?C.green+"12":C.red+"12",
                        border:`1px solid ${tickerRealized>=0?C.green:C.red}30`}}>
                        <span style={{fontSize:13,color:C.muted}}>Realized P&amp;L</span>
                        <span style={{fontSize:14,fontWeight:800,color:tickerRealized>=0?C.green:C.red}}>
                          {tickerRealized>=0?"+":"-"}{fmtS(Math.abs(tickerRealized))}
                        </span>
                      </div>
                    )}

                    {/* ── Sale Quality Analysis ─────────────────────────────── */}
                    {(()=>{
                      const sellTrades=trades.filter(t=>t.ticker===h.ticker&&t.type==="SELL")
                        .sort((a,b)=>b.date.localeCompare(a.date));
                      const firstBuy=trades.filter(t=>t.ticker===h.ticker&&t.type==="BUY")
                        .sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
                      const lastSell=sellTrades[0]||null;
                      const livePrice=h.price||0;
                      const sellPrice=lastSell?Number(lastSell.price):0;

                      // % change: sell price → today's live price
                      // Positive = stock rose after sale (sold too early)
                      // Negative = stock fell after sale (good sale)
                      const priceDelta=sellPrice>0&&livePrice>0
                        ?((livePrice-sellPrice)/sellPrice)*100
                        :null;

                      // Opportunity cost/saving across ALL sell trades
                      const totalSharesSold=sellTrades.reduce((s,t)=>s+Number(t.shares),0);
                      const totalSellProceeds=sellTrades.reduce((s,t)=>s+Number(t.price)*Number(t.shares),0);
                      const opportunitySGD=livePrice>0&&totalSharesSold>0
                        ?toSGDlive(totalSharesSold*livePrice-totalSellProceeds,h.mkt)
                        :null;

                      // Verdict
                      const verdict=priceDelta===null?null
                        :priceDelta>10  ?{lbl:"⚠ Sold Too Early",  col:C.red,  bg:C.red+"18"}
                        :priceDelta>5   ?{lbl:"↗ Possibly Early",  col:C.gold, bg:C.gold+"18"}
                        :priceDelta>=0  ?{lbl:"✓ Roughly Right",   col:C.green,bg:C.green+"18"}
                        :                {lbl:"✓ Good Sale",         col:C.green,bg:C.green+"18"};

                      if(!lastSell||!livePrice) return null;
                      return(
                        <div style={{marginTop:6,padding:"8px 10px",borderRadius:7,
                          background:C.surface,border:`1px solid ${C.border}`}}>

                          {/* Verdict + % since sale */}
                          {verdict&&(
                            <div style={{display:"flex",justifyContent:"space-between",
                              alignItems:"center",marginBottom:6}}>
                              <span style={{fontSize:12,fontWeight:700,color:verdict.col,
                                background:verdict.bg,borderRadius:4,padding:"2px 7px",
                                border:`1px solid ${verdict.col}40`}}>
                                {verdict.lbl}
                              </span>
                              {priceDelta!==null&&(
                                <span style={{fontSize:12,fontWeight:700,
                                  color:priceDelta>0?C.red:C.green}}>
                                  {priceDelta>0?"+":""}{priceDelta.toFixed(1)}% since sale
                                </span>
                              )}
                            </div>
                          )}

                          {/* Sold / Now / Missed or Saved grid */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,fontSize:12}}>
                            <div>
                              <div style={{color:C.muted,marginBottom:1}}>Sold</div>
                              <div style={{fontWeight:700}}>{fmtL(sellPrice,h.mkt)}</div>
                              <div style={{color:C.muted,fontSize:11}}>{lastSell.date}</div>
                            </div>
                            <div style={{textAlign:"center"}}>
                              <div style={{color:C.muted,marginBottom:1}}>Now</div>
                              <div style={{fontWeight:700,
                                color:livePrice>sellPrice?C.red:C.green}}>
                                {fmtL(livePrice,h.mkt)}
                              </div>
                              <div style={{color:C.muted,fontSize:11}}>live</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{color:C.muted,marginBottom:1}}>
                                {opportunitySGD===null?"—"
                                  :opportunitySGD>=0?"Missed":"Saved"}
                              </div>
                              {opportunitySGD!==null&&(
                                <>
                                  <div style={{fontWeight:700,
                                    color:opportunitySGD>0?C.red:C.green}}>
                                    {opportunitySGD>0?"+":"-"}{fmtS(Math.abs(opportunitySGD))}
                                  </div>
                                  <div style={{color:C.muted,fontSize:11}}>
                                    {opportunitySGD>0?"if still held":"by selling"}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Holding period */}
                          {firstBuy&&(
                            <div style={{fontSize:11,color:C.muted,marginTop:5,
                              textAlign:"center",borderTop:`1px solid ${C.border}`,paddingTop:4}}>
                              {(()=>{
                                const days=Math.round((new Date(lastSell.date)-new Date(firstBuy.date))/86400000);
                                const yrs=(days/365).toFixed(1);
                                return `Held ${days>365?yrs+" yrs":days+" days"} · ${firstBuy.date} → ${lastSell.date}`;
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </>
          );
        })()}
      </>
    );
  }

  function renderInsightsView(){
    return(
      <>
        <div style={{display:"flex",gap:5,marginBottom:14,overflowX:"auto"}}>
          {[["performers","Performers"],["buffett","Buffett"],["screen","🎯 Screen"]].map(([id,lbl])=>(
            <button key={id} style={{...pill(insightTab===id),whiteSpace:"nowrap",flexShrink:0}} onClick={()=>setInsightTab(id)}>{lbl}</button>
          ))}
        </div>

        {insightTab==="performers"&&(
          <>
            <div style={card}>
              <div style={cardT}>Top 10 Performers (% gain from avg cost)</div>
              {top10.map((h,i)=>{
                const g=((h.price-h.avgCost)/h.avgCost)*100;
                const lg=(h.price-h.avgCost)*h.shares;
                const eIV=(valuations[h.ticker]?.valuations?.average)||h.intrinsic||0;
                const up=eIV>0?((eIV-h.price)/h.price)*100:0;
                return(
                  <div key={h.ticker} style={{marginBottom:10,paddingBottom:10,borderBottom:i<9?`1px solid ${C.border}`:"none",cursor:"pointer"}} onClick={()=>{setSel(h);setDetailPeriod("6m");}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontSize:18,fontWeight:800,color:C.green,width:26,textAlign:"center",flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontWeight:700,fontSize:16}}>{h.ticker}</span><Chip mkt={h.mkt}/></div>
                        <div style={{fontSize:14,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.name}</div>
                      </div>

                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:17,fontWeight:800,color:C.green}}>{fmtPct(g)}</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.green}}>+{fmtL(lg,h.mkt,0)}</div>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginTop:6,background:C.surface,borderRadius:6,padding:"5px 8px"}}>
                      <div><div style={{fontSize:12,color:C.muted}}>Price</div><div style={{fontSize:14,fontWeight:700}}>{fmtL(h.price,h.mkt)}</div></div>
                      <div><div style={{fontSize:12,color:C.muted}}>Avg Cost</div><div style={{fontSize:14,fontWeight:700,color:C.mutedLight}}>{fmtL(h.avgCost,h.mkt)}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:12,color:C.muted}}>Intrinsic{valuations[h.ticker]?.valuations?.average>0&&<span style={{color:C.purple,fontSize:8,marginLeft:2}}>●</span>}</div><div style={{fontSize:14,fontWeight:700,color:up>=0?C.green:C.red}}>{eIV>0?fmtL(eIV,h.mkt):"—"}</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={card}>
              <div style={cardT}>Top 10 Worst Performers</div>
              {worst10.map((h,i)=>{
                const g=((h.price-h.avgCost)/h.avgCost)*100;
                const lg=(h.price-h.avgCost)*h.shares;
                const pos=lg>=0;
                const eIV2=(valuations[h.ticker]?.valuations?.average)||h.intrinsic||0;
                const up=eIV2>0?((eIV2-h.price)/h.price)*100:0;
                return(
                  <div key={h.ticker} style={{marginBottom:10,paddingBottom:10,borderBottom:i<9?`1px solid ${C.border}`:"none",cursor:"pointer"}} onClick={()=>{setSel(h);setDetailPeriod("6m");}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{fontSize:18,fontWeight:800,color:C.red,width:26,textAlign:"center",flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontWeight:700,fontSize:16}}>{h.ticker}</span><Chip mkt={h.mkt}/></div>
                        <div style={{fontSize:14,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.name}</div>
                      </div>

                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:17,fontWeight:800,color:C.red}}>{fmtPct(g)}</div>
                        <div style={{fontSize:14,fontWeight:700,color:pos?C.green:C.red}}>{pos?"+":"-"}{fmtL(Math.abs(lg),h.mkt,0)}</div>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginTop:6,background:C.surface,borderRadius:6,padding:"5px 8px"}}>
                      <div><div style={{fontSize:12,color:C.muted}}>Price</div><div style={{fontSize:14,fontWeight:700}}>{fmtL(h.price,h.mkt)}</div></div>
                      <div><div style={{fontSize:12,color:C.muted}}>Avg Cost</div><div style={{fontSize:14,fontWeight:700,color:C.mutedLight}}>{fmtL(h.avgCost,h.mkt)}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:12,color:C.muted}}>Intrinsic{valuations[h.ticker]?.valuations?.average>0&&<span style={{color:C.purple,fontSize:8,marginLeft:2}}>●</span>}</div><div style={{fontSize:14,fontWeight:700,color:up>=0?C.green:C.red}}>{eIV2>0?fmtL(eIV2,h.mkt):"—"}</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        
        {insightTab==="buffett"&&(
          <>
            {/* Moat data freshness + Refresh buttons */}
            {(()=>{
              // Compute days since last moat update
              const moatAgeDays=(()=>{
                if(!moatUpdatedAt||moatUpdatedAt.startsWith('Refresh')) return null;
                const d=new Date(moatUpdatedAt.replace(' (refreshed)',''));
                if(isNaN(d.getTime())) return null;
                return Math.floor((Date.now()-d.getTime())/86400000);
              })();
              const stale=moatAgeDays!==null&&moatAgeDays>90;
              const ageLabel=moatAgeDays===null?null:moatAgeDays===0?'today':moatAgeDays===1?'yesterday':`${moatAgeDays}d ago`;
              return(
                <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",marginBottom:10,border:`1px solid ${stale?C.red+'60':C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div>
                      <span style={{fontWeight:700,color:C.gold,fontSize:14}}>🏰 Economic Moat Ratings</span>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,flexWrap:"wrap"}}>
                        {ageLabel&&(
                          <span style={{fontSize:12,padding:"1px 6px",borderRadius:4,
                            background:stale?C.red+"22":C.green+"18",
                            color:stale?C.red:C.green,fontWeight:700}}>
                            {stale?'⚠ ':''}{ageLabel}
                          </span>
                        )}
                        {moatUpdatedAt&&!moatUpdatedAt.startsWith('Refresh')&&(
                          <span style={{fontSize:12,color:C.muted}}>
                            {new Date(moatUpdatedAt.replace(' (refreshed)','')).toLocaleDateString('en-SG',{day:'2-digit',month:'short',year:'numeric'})}
                          </span>
                        )}
                        {moatUpdatedAt?.startsWith('Refresh')&&(
                          <span style={{fontSize:12,color:C.accent}}>{moatUpdatedAt}</span>
                        )}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>refreshMoatFromDB()} disabled={moatRefreshing}
                        style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                          background:moatRefreshing?C.surface:C.border+"40",color:moatRefreshing?C.muted:C.mutedLight,
                          fontSize:12,fontWeight:700,cursor:moatRefreshing?"not-allowed":"pointer"}}>
                        🔄 DB
                      </button>
                      <button onClick={()=>refreshAllMoatsWithAI()} disabled={moatRefreshing}
                        style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.gold}`,
                          background:moatRefreshing?C.surface:C.gold+"18",color:moatRefreshing?C.muted:C.gold,
                          fontSize:12,fontWeight:700,cursor:moatRefreshing?"not-allowed":"pointer"}}>
                        {moatRefreshing?"⏳ Working…":"🤖 AI Refresh All"}
                      </button>
                    </div>
                  </div>
                  <div style={{fontSize:12,color:stale?C.red:C.muted}}>
                    {stale
                      ?`Ratings are ${moatAgeDays} days old — click 🤖 AI Refresh All to update all ${activeHoldings.length} stocks`
                      :"Morningstar source · 🔄 DB syncs stored ratings · 🤖 AI Refresh All re-rates every stock with Claude"
                    }
                  </div>
                </div>
              );
            })()}
            <div style={{...card,background:"#1A1200",border:`1px solid ${C.gold}30`}}>
              <div style={{fontSize:14,color:C.gold,lineHeight:1.6}}>
                <b>"Price is what you pay. Value is what you get."</b><br/>
                Score: Moat 30pts + Dividend 20pts + Upside 25pts + Fair PE 15pts + Gain track 10pts
              </div>
            </div>
            {/* Intrinsic Value refresh block */}
            {(()=>{
              const intrinsicAgeDays=(()=>{
                if(!intrinsicUpdatedAt||intrinsicUpdatedAt.includes('search')) return null;
                const d=new Date(intrinsicUpdatedAt);
                return isNaN(d.getTime())?null:Math.floor((Date.now()-d.getTime())/86400000);
              })();
              const intrinsicStale=intrinsicAgeDays!==null&&intrinsicAgeDays>90;
              const ageLabel=intrinsicAgeDays===null?null:intrinsicAgeDays===0?'today':intrinsicAgeDays===1?'yesterday':`${intrinsicAgeDays}d ago`;
              const etfCount    = activeHoldings.filter(h=>h.isEtf).length;
              const reitCount   = activeHoldings.filter(h=>!h.isEtf&&h.intrinsicMethod==='reit_yield').length;
              const analystCount= activeHoldings.filter(h=>h.intrinsicMethod==='analyst').length;
              const grahamCount = activeHoldings.filter(h=>h.intrinsicMethod==='graham').length;
              const dcfCount    = activeHoldings.filter(h=>h.intrinsicMethod==='dcf_eps').length;
              const aiCount     = activeHoldings.filter(h=>h.intrinsicMethod==='ai_search').length;
              const noMethod    = activeHoldings.filter(h=>!h.isEtf&&!h.intrinsicMethod).length;
              return(
                <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",marginBottom:10,border:`1px solid ${intrinsicStale?C.red+'60':C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div>
                      <span style={{fontWeight:700,color:C.purple,fontSize:14}}>💎 Intrinsic Value Sources</span>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,flexWrap:"wrap"}}>
                        {ageLabel&&(
                          <span style={{fontSize:12,padding:"1px 6px",borderRadius:4,
                            background:intrinsicStale?C.red+"22":C.green+"18",
                            color:intrinsicStale?C.red:C.green,fontWeight:700}}>
                            {intrinsicStale?'⚠ ':''}{ageLabel}
                          </span>
                        )}
                        {intrinsicUpdatedAt?.includes('search')&&(
                          <span style={{fontSize:12,color:C.accent}}>{intrinsicUpdatedAt}</span>
                        )}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>computeAllIntrinsic()} disabled={intrinsicRefreshing}
                        style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.border}`,
                          background:intrinsicRefreshing?C.surface:C.border+"40",color:intrinsicRefreshing?C.muted:C.mutedLight,
                          fontSize:12,fontWeight:700,cursor:intrinsicRefreshing?"not-allowed":"pointer"}}>
                        🔄 Formula
                      </button>
                      <button onClick={()=>refreshAllIntrinsicWithAI()} disabled={intrinsicRefreshing}
                        style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.purple}`,
                          background:intrinsicRefreshing?C.surface:C.purple+"18",color:intrinsicRefreshing?C.muted:C.purple,
                          fontSize:12,fontWeight:700,cursor:intrinsicRefreshing?"not-allowed":"pointer"}}>
                        {intrinsicRefreshing?"⏳ Searching…":"🤖 AI Web Refresh"}
                      </button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,fontSize:11,flexWrap:"wrap",marginBottom:4}}>
                    <span style={{color:C.muted}}>🚫 ETF: <b style={{color:C.text}}>{etfCount}</b></span>
                    {analystCount>0&&<span style={{color:C.green}}>📊 Analyst: <b>{analystCount}</b></span>}
                    {reitCount>0  &&<span style={{color:C.gold}}>🏢 REIT yield: <b>{reitCount}</b></span>}
                    {grahamCount>0&&<span style={{color:C.accent}}>📐 Graham: <b>{grahamCount}</b></span>}
                    {dcfCount>0   &&<span style={{color:C.accentDim}}>📈 DCF·EPS: <b>{dcfCount}</b></span>}
                    {aiCount>0    &&<span style={{color:C.purple}}>🤖 AI Web: <b>{aiCount}</b></span>}
                    {noMethod>0   &&<span style={{color:C.red}}>⚠ None: <b>{noMethod}</b></span>}
                  </div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
                    <b>🔄 Formula</b>: REIT yield model + Yahoo analyst targets (Option A) + Graham/DCF fallback (Option C) ·
                    <b> 🤖 AI Web Refresh</b>: Claude web-searches analyst targets for every stock · Auto-runs if &gt;90 days stale
                  </div>
                </div>
              );
            })()}
            {[
              {filter:(h)=>h.action==="BUY MORE"||h.action==="ADD GRADUALLY",title:"Buy More (Score 65+)",emptyMsg:"No strong buys at current prices"},
              {filter:(h)=>h.action==="HOLD",title:"Hold (Score 35-64)",emptyMsg:"No holds identified"},
              {filter:(h)=>h.action==="CONSIDER SELLING"||h.action==="WATCH",title:"Consider Selling / Watch",emptyMsg:"No sells identified"},
            ].map(({filter:fn,title,emptyMsg})=>{
              const list=buffettList.filter(fn).slice(0,8);
              return(
                <div key={title} style={card}>
                  <div style={cardT}>{title}</div>
                  {list.length===0&&<div style={{fontSize:15,color:C.muted,padding:"8px 0"}}>{emptyMsg}</div>}
                  {list.map((h,i)=>{
                    const g=((h.price-h.avgCost)/h.avgCost)*100;
                    const bIV=(valuations[h.ticker]?.valuations?.average)||h.intrinsic||0;
                    const up=bIV>0?((bIV-h.price)/h.price)*100:0;
                    return(
                      <div key={h.ticker} style={{marginBottom:11,paddingBottom:11,borderBottom:i<list.length-1?`1px solid ${C.border}`:"none",cursor:"pointer"}} onClick={()=>{setSel(h);setDetailPeriod("6m");}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:36,height:36,borderRadius:8,background:h.col+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{fontSize:15,fontWeight:800,color:h.col}}>{fmt(h.score,1)}</span>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <span style={{fontWeight:700}}>{h.ticker}</span>
                              <Chip mkt={h.mkt}/>
                              <Bdg label={h.action} bg={h.col+"22"} color={h.col}/>
                            </div>
                            <div style={{fontSize:14,color:C.muted,marginTop:1}}>{h.reason}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontSize:15,fontWeight:700,color:g>=0?C.green:C.red}}>{fmtPct(g)}</div>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,marginTop:6,background:C.surface,borderRadius:6,padding:"5px 8px"}}>
                          <div><div style={{fontSize:12,color:C.muted}}>Price</div><div style={{fontSize:14,fontWeight:700}}>{fmtL(h.price,h.mkt)}</div></div>
                          <div><div style={{fontSize:12,color:C.muted}}>Avg Cost</div><div style={{fontSize:14,fontWeight:700,color:C.mutedLight}}>{fmtL(h.avgCost,h.mkt)}</div></div>
                          <div style={{textAlign:"right"}}><div style={{fontSize:12,color:C.muted}}>Intrinsic{valuations[h.ticker]?.valuations?.average>0&&<span style={{color:C.purple,fontSize:8,marginLeft:2}}>●</span>}</div><div style={{fontSize:14,fontWeight:700,color:up>=0?C.green:C.red}}>{bIV>0?fmtL(bIV,h.mkt):"—"}</div></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
        {insightTab==="screen"&&renderScreenView()}
      </>
    );
  }

  function renderIndexView(){
    const mktsInPort=[...new Set(holdings.map(h=>h.mkt))];
    const IDX_KEY={US:"US_SP500",SG:"SG_STI",JP:"JP_NIKKEI",CN:"CN_HSI",EU:"EU_CAC",GB:"GB_FTSE",AU:"AU_ASX"};
    const liveFor=(mkt)=>liveIndices[IDX_KEY[mkt]]||null;
    const srcAge=indicesCachedAt?(()=>{
      const diffMs=Date.now()-new Date(indicesCachedAt).getTime();
      const h=Math.floor(diffMs/3600000);
      const mn=Math.floor((diffMs%3600000)/60000);
      return h>0?h+'h ago':mn+'m ago';
    })():null;
    const srcBadge=indicesSource==='live'
      ?{label:'● LIVE',color:C.green}
      :indicesSource==='cached'
      ?{label:'⧗ cached '+(srcAge||''),color:C.gold}
      :{label:'⚠ fallback',color:C.red};
    return(
      <>
        <div style={{...cardT,paddingLeft:0}}>Your Markets vs Benchmarks</div>
        {mktsInPort.map(mkt=>{
          const m=MKT[mkt]||MKT.US;
          const cnt=holdings.filter(h=>h.mkt===mkt&&Number(h.shares)>0).length;
          const portCost=holdings.filter(h=>h.mkt===mkt&&Number(h.shares)>0).reduce((s,h)=>s+toSGDlive(h.avgCost*h.shares,h.mkt),0);
          const portVal=holdings.filter(h=>h.mkt===mkt&&Number(h.shares)>0).reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
          const portPct=portCost?(portVal-portCost)/portCost*100:0;
          const lvIdx=liveFor(mkt);

          // Multi-period index returns (from upgraded live_indices)
          const idxYtd   = lvIdx?.ytd      ?? m.idxYtd;
          const idx1y    = lvIdx?.return1y  ?? null;
          const idx3y    = lvIdx?.return3y  ?? null;
          const idx5y    = lvIdx?.return5y  ?? null;
          // Primary comparison: 1Y index return is the standard benchmark period
          const primaryIdx = idx1y ?? idxYtd;
          const beat = portPct > primaryIdx;

          return(
            <div key={mkt} style={{...card,borderLeft:`3px solid ${beat?C.green:C.mutedLight}`}}>
              <div style={{...row,marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17,display:"flex",alignItems:"center",gap:6,marginBottom:4}}>{m.index}<Chip mkt={mkt}/></div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <Tag col={idxYtd>=0?C.green:C.red}>YTD {idxYtd>=0?"+":""}{fmt(idxYtd,1)}%</Tag>
                    {idx1y!==null&&<Tag col={idx1y>=0?C.green:C.red}>1Y {idx1y>=0?"+":""}{fmt(idx1y,1)}%</Tag>}
                    <Tag col={beat?C.green:C.red}>{beat?"↑ Beating 1Y":"↓ Below 1Y"}</Tag>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  {(()=>{
                    const lv=liveFor(mkt);
                    const val=lv?.price||m.idxVal;
                    const chg=lv?.change??m.idxChange;
                    return(
                      <>
                        <div style={{fontSize:18,fontWeight:800}}>
                          {m.symbol}{fmt(val,1)}
                          <span style={{fontSize:12,color:srcBadge.color,fontWeight:700,marginLeft:4}}>{srcBadge.label}</span>
                        </div>
                        <div style={{fontSize:14,color:chg>=0?C.green:C.red,fontWeight:600}}>{chg>=0?"+":""}{fmt(chg,2)}% today</div>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:8,padding:"10px 12px"}}>

                {/* Portfolio return — since actual purchase (cost basis) */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
                  <div>
                    <div style={{fontSize:13,color:C.muted,fontWeight:600}}>Your portfolio</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:1}}>since purchase · cost basis</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:20,fontWeight:800,color:portPct>=0?C.green:C.red}}>{portPct>=0?"+":""}{fmt(portPct,1)}%</div>
                    <div style={{fontSize:12,color:C.muted}}>{fmtS(portVal)}</div>
                  </div>
                </div>

                {/* Index returns — multiple periods for honest reference */}
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:12,color:C.muted,fontWeight:700,marginBottom:6,letterSpacing:"0.04em",textTransform:"uppercase"}}>{m.index} Reference Returns</div>
                  {[
                    ["YTD (Jan 1)",  idxYtd,  true],
                    ["1 Year",       idx1y,   idx1y!==null],
                    ["3 Year",       idx3y,   idx3y!==null],
                    ["5 Year",       idx5y,   idx5y!==null],
                  ].filter(([,,show])=>show).map(([lbl,val])=>(
                    <div key={lbl} style={{display:"flex",gap:4,alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:13,color:C.muted,width:72,flexShrink:0}}>{lbl}</span>
                      <div style={{flex:1,height:4,borderRadius:2,background:C.border,overflow:"hidden"}}>
                        <div style={{width:`${Math.min(Math.abs(val)/50*100,100)}%`,height:"100%",background:val>=0?C.accent:C.red,opacity:0.6,borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:13,fontWeight:700,color:val>=0?C.accent:C.red,width:46,textAlign:"right"}}>{val>=0?"+":""}{fmt(val,1)}%</span>
                    </div>
                  ))}
                </div>

                {/* Note */}
                <div style={{fontSize:11,color:C.muted,fontStyle:"italic",marginTop:6,lineHeight:1.4}}>
                  ℹ Portfolio % = total return from avg cost (actual purchase). Index figures shown for multi-period reference. For time-aligned comparison, use the PerfChart above.
                </div>

                {/* Dividend yield row — gross and net (after withholding tax) */}
                {(()=>{
                  const mktH=holdings.filter(h=>h.mkt===mkt&&Number(h.shares)>0);
                  const mktVal=mktH.reduce((s,h)=>s+h.price*h.shares,0);
                  const mktDiv=mktH.reduce((s,h)=>s+(h.divYield||0)/100*h.price*h.shares,0);
                  const mktDivYield=mktVal>0?mktDiv/mktVal*100:0;
                  const divStocksCount=mktH.filter(h=>h.divYield>0).length;
                  if(mktDivYield<=0)return null;
                  const taxRate=getDivTax(mkt);
                  const mktDivNet=mktDiv*(1-taxRate);
                  const mktDivYieldNet=mktVal>0?mktDivNet/mktVal*100:0;
                  const taxLabel=fmtTax(mkt);
                  const sgdGross=toSGDlive(mktDiv,mkt);
                  const sgdNet=toSGDlive(mktDivNet,mkt);
                  return(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:taxLabel?5:0}}>
                        <div>
                          <div style={{fontSize:13,color:C.muted,marginBottom:1}}>Annual Dividend</div>
                          <div style={{fontSize:12,color:C.muted}}>{divStocksCount} paying stocks</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          {/* Gross row */}
                          <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end",marginBottom:3}}>
                            <span style={{fontSize:12,color:C.muted}}>Gross</span>
                            <span style={{fontWeight:700,color:C.gold,fontSize:15}}>{fmt(mktDivYield,2)}%</span>
                            <span style={{color:C.muted,fontSize:13}}>{fmtS(sgdGross)}/yr</span>
                          </div>
                          {/* Net row — only shown when there's a WHT */}
                          {taxLabel&&(
                            <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
                              <span style={{fontSize:12,color:C.muted}}>Net ({taxLabel})</span>
                              <span style={{fontWeight:700,color:C.green,fontSize:15}}>{fmt(mktDivYieldNet,2)}%</span>
                              <span style={{color:C.muted,fontSize:13}}>{fmtS(sgdNet)}/yr</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{...row,fontSize:14,marginTop:8}}><span style={{color:C.muted}}>{cnt} stocks</span><span style={{fontWeight:700}}>{fmtS(portVal)}</span></div>
              </div>
            </div>
          );
        })}
        <div style={card}>
          <div style={cardT}>Sector Breakdown by Market (Charles Schwab Classification)</div>
          {[...new Set(holdings.map(h=>h.mkt))].map(mkt=>{
            const m=MKT[mkt]||MKT.US;
            const mktHoldings=holdings.filter(h=>h.mkt===mkt&&Number(h.shares)>0);
            const mktTotal=mktHoldings.reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
            if(mktTotal===0)return null;
            const sectorsInMkt=SECTORS.map((sec,i)=>{
              const secHoldings=mktHoldings.filter(h=>h.sector===sec);
              const val=secHoldings.reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
              return{sec,val,col:SCOL[i],cnt:secHoldings.length};
            }).filter(d=>d.val>0).sort((a,b)=>b.val-a.val);
            return(
              <div key={mkt} style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <Chip mkt={mkt}/>
                  <span style={{fontWeight:700,fontSize:16}}>{m.index}</span>
                  <span style={{fontSize:14,color:C.muted}}>{mktHoldings.length} stocks</span>
                </div>
                {sectorsInMkt.map(({sec,val,col,cnt})=>(
                  <div key={sec} style={{marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:3}}>
                      <span style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:6,height:6,borderRadius:3,background:col}}/>
                        <span style={{color:C.text}}>{sec}</span>
                        <span style={{fontSize:13,color:C.muted}}>{cnt} stock{cnt>1?"s":""}</span>
                      </span>
                      <span style={{fontWeight:700,color:col}}>{mktTotal>0?((val/mktTotal)*100).toFixed(1):0}%</span>
                    </div>
                    <div style={{height:4,borderRadius:2,background:C.border}}>
                      <div style={{width:`${mktTotal>0?(val/mktTotal)*100:0}%`,height:"100%",borderRadius:2,background:col}}/>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderTradesView(){
    // tradeSearchRef, tradeClearRef lifted to App level (hooks invalid in render functions)
    const showTradeClear=(show)=>{
      if(!tradeClearRef.current) return;
      tradeClearRef.current.style.visibility=show?'visible':'hidden';
      tradeClearRef.current.style.pointerEvents=show?'auto':'none';
    };

    // Plain computation — useMemo invalid in render functions (not a React component)
    // Level 1 filter: trade type (ALL / BUY / SELL / DIV)
    let shown=(tradeType==="ALL"?[...trades]:[...trades].filter(t=>t.type===tradeType));
    // Level 2 filter: date range
    if(tradeDateFrom) shown=shown.filter(t=>(t.date||"")>=tradeDateFrom);
    if(tradeDateTo)   shown=shown.filter(t=>(t.date||"")<=tradeDateTo);
    shown.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    // Level 3 filter: text search
    if(tradeSearch.trim()){
      const q=tradeSearch.trim().toUpperCase();
      shown=shown.filter(t=>
        t.ticker?.toUpperCase().includes(q)||
        (tickerNames[t.ticker]||"").toUpperCase().includes(q)
      );
    }
    const dateFilterActive=tradeDateFrom||tradeDateTo;
    const totalReal=trades.filter(t=>t.type==="SELL"||t.type==="DIV").reduce((s,t)=>s+ccyToSGD(t.profit||0,t.ccy||t.mkt),0);
    const shownBuys=shown.filter(t=>t.type==="BUY");
    const shownSells=shown.filter(t=>t.type==="SELL");
    const shownReal=shownSells.reduce((s,t)=>s+ccyToSGD(t.profit||0,t.ccy||t.mkt),0);
    const mkts=Object.keys(MKT);
    const ccyList=Object.keys(CCY);
    const iField={width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",color:C.text,fontSize:15,outline:"none",boxSizing:"border-box"};
    const lbl={fontSize:14,color:C.muted,marginBottom:3};
    const tradePriceSym=ccySymbol(tradeForm.ccy);
    const tradePriceTotal=parseFloat(tradeForm.price||0)*parseInt(tradeForm.shares||0);
    return(
      <>
        <div style={{...card,background:C.accent+"08",border:`1px solid ${C.accentDim}25`,marginBottom:12}}>
          {(()=>{
            // When date filter is active, stats reflect the filtered range only
            // When no date filter, stats always show all-time totals regardless of type pill
            const statBase=dateFilterActive?shown:trades;
            const divTrades=statBase.filter(t=>t.type==="DIV");
            const totalDivReceived=divTrades.reduce((s,t)=>s+ccyToSGD(t.profit||0,t.ccy||t.mkt),0);
            const capitalGains=statBase.filter(t=>t.type==="SELL").reduce((s,t)=>s+ccyToSGD(t.profit||0,t.ccy||t.mkt),0);
            const statTotal=dateFilterActive?shown.length:trades.length;
            const statBuys=(dateFilterActive?shown:trades).filter(t=>t.type==="BUY").length;
            const statSells=(dateFilterActive?shown:trades).filter(t=>t.type==="SELL").length;
            const statDivs=divTrades.length;
            const statRealized=capitalGains+totalDivReceived;
            return(<>
              {dateFilterActive&&(
                <div style={{fontSize:11,color:C.accent,fontWeight:700,marginBottom:6,textAlign:"center",
                  background:C.accent+"12",borderRadius:5,padding:"3px 0"}}>
                  📅 {tradeDateFrom||"…"} → {tradeDateTo||"…"}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,textAlign:"center",marginBottom:tradeSearch?8:0}}>
                <div><div style={{fontSize:12,color:C.muted}}>{dateFilterActive?"Range":"Total"}</div><div style={{fontSize:20,fontWeight:800}}>{statTotal}</div></div>
                <div><div style={{fontSize:12,color:C.muted}}>Buys</div><div style={{fontSize:20,fontWeight:800,color:C.green}}>{statBuys}</div></div>
                <div><div style={{fontSize:12,color:C.muted}}>Sells</div><div style={{fontSize:20,fontWeight:800,color:C.red}}>{statSells}</div></div>
                <div><div style={{fontSize:12,color:C.muted}}>Divs</div><div style={{fontSize:20,fontWeight:800,color:C.gold}}>{statDivs}</div></div>
              </div>
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginTop:4,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,textAlign:"center"}}>
                <div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:2}}>Capital Gains (Sells)</div>
                  <div style={{fontSize:16,fontWeight:800,color:capitalGains>=0?C.green:C.red}}>
                    {capitalGains>=0?"+":"-"}{fmtS(Math.abs(capitalGains))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:2}}>Dividends Received</div>
                  <div style={{fontSize:16,fontWeight:800,color:C.gold}}>
                    {totalDivReceived>0?"+":""}{fmtS(totalDivReceived)}
                  </div>
                </div>
              </div>
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:6,textAlign:"center"}}>
                <div style={{fontSize:12,color:C.muted,marginBottom:2}}>
                  {dateFilterActive?"Period":"Total"} Realized P&amp;L (Capital + Dividends)
                </div>
                <div style={{fontSize:20,fontWeight:800,color:statRealized>=0?C.green:C.red}}>
                  {statRealized>=0?"+":"-"}{fmtS(Math.abs(statRealized))}
                </div>
              </div>
            </>);
          })()}
          {tradeSearch&&shown.length<trades.length&&(
            <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,textAlign:"center"}}>
              <div><div style={{fontSize:11,color:C.accent}}>Filtered</div><div style={{fontSize:16,fontWeight:800,color:C.accent}}>{shown.length}</div></div>
              <div><div style={{fontSize:11,color:C.green}}>Buys</div><div style={{fontSize:16,fontWeight:800,color:C.green}}>{shownBuys.length}</div></div>
              <div><div style={{fontSize:11,color:C.gold}}>Sells</div><div style={{fontSize:16,fontWeight:800,color:C.gold}}>{shownSells.length}</div></div>
            </div>
          )}
        </div>

        {/* Add / Edit Trade Button + Paste Parser Button */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={()=>{if(showTradeForm&&editTradeId==null){setShowTradeForm(false);}else{setShowTradeForm(v=>!v);setEditTradeId(null);setTradeForm({ticker:"",type:"BUY",date:new Date().toISOString().slice(0,10),price:"",shares:"",mkt:"US",ccy:"USD"});setTickerCheck({status:"idle",message:"",suggestions:[]});setTickerSearchTerm("");setShowPasteParser(false);}}} style={{flex:1,padding:"11px",borderRadius:10,border:`1px dashed ${showTradeForm?C.accent:C.border}`,background:showTradeForm&&editTradeId==null?C.accent+"12":"transparent",color:showTradeForm&&editTradeId==null?C.accent:C.muted,fontSize:15,fontWeight:700,cursor:"pointer"}}>
            {showTradeForm&&editTradeId==null?"✕ Cancel":"+ Add New Trade"}
          </button>
          <button onClick={()=>{setShowPasteParser(v=>!v);setShowTradeForm(false);setParsedTrade(null);setPasteText('');setParseError('');}} title="Paste broker confirmation to auto-fill trade" style={{padding:"11px 14px",borderRadius:10,border:`1px dashed ${showPasteParser?C.gold:C.border}`,background:showPasteParser?C.gold+"15":"transparent",color:showPasteParser?C.gold:C.muted,fontSize:15,fontWeight:700,cursor:"pointer",flexShrink:0}}>
            📋
          </button>
        </div>

        {/* Broker Message Paste Parser */}
        {showPasteParser&&(
          <div style={{...card,border:`1px solid ${C.gold}40`,background:C.surface,marginBottom:14}}>
            <div style={{fontSize:15,fontWeight:700,color:C.gold,marginBottom:4}}>📋 Paste Broker Confirmation</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Paste your broker SMS / email confirmation. Supports DBS and similar formats.</div>
            <textarea
              ref={pasteRef}
              rows={4}
              placeholder={"e.g. Fr DBS: Your Sell for Ord Sh, Hotung Investment Holdings Ltd (SG) has been filled on 07 May 2026 09:03:28. Filled price: SGD 1.64. Filled Qty: 3800. Qty left: 0."}
              defaultValue={pasteText}
              onBlur={e=>setPasteText(e.target.value)}
              style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"10px",fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace",lineHeight:1.5}}
            />
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button onClick={()=>{
                setParseError('');
                const liveText=pasteRef.current?pasteRef.current.value:pasteText;
                if(liveText!==pasteText) setPasteText(liveText);
                const r=parseBrokerMsg(liveText);
                if(!r.type||!r.price||!r.shares){
                  setParseError("Could not parse — check format. Needs: Buy/Sell, Filled price, Filled Qty.");
                  setParsedTrade(null);
                  setTickerSearchResults([]);
                } else {
                  setParsedTrade(r);
                  setTickerSearchResults([]);
                  // Auto-search for ticker if not matched in portfolio
                  if(!r.ticker && r.companyName){
                    searchTickerForParsed(r.companyName, r.mkt);
                  }
                }
              }} style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.gold}`,background:C.gold+"18",color:C.gold,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🔍 Parse
              </button>
              {parsedTrade&&(
                <button onClick={applyParsedTrade} style={{flex:1,padding:"10px",borderRadius:8,border:`1px solid ${C.green}`,background:C.green+"18",color:C.green,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  ✅ Apply to Trade Form
                </button>
              )}
            </div>
            {parseError&&<div style={{fontSize:12,color:C.red,marginTop:8}}>{parseError}</div>}
            {parsedTrade&&(
              <div style={{marginTop:12,background:C.bg,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.green}30`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.green,marginBottom:8}}>✅ Parsed successfully</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 12px",fontSize:12}}>
                  {[
                    ["Action",parsedTrade.type],
                    ["Date",parsedTrade.date||"—"],
                    ["Price",parsedTrade.price?parsedTrade.ccy+" "+parsedTrade.price:"—"],
                    ["Qty",parsedTrade.shares?.toLocaleString()||"—"],
                    ["Market",parsedTrade.mkt||"—"],
                    ["Company",parsedTrade.companyName||"—"],
                  ].map(([label,val])=>(
                    <div key={label}>
                      <div style={{fontSize:10,color:C.muted}}>{label}</div>
                      <div style={{fontWeight:700,color:label==="Action"?(parsedTrade.type==="BUY"?C.green:C.red):C.text}}>{val}</div>
                    </div>
                  ))}
                </div>
                {parsedTrade.ticker?(
                  <div style={{marginTop:8,fontSize:12,color:C.green,fontWeight:700}}>
                    ✅ Matched: <b>{parsedTrade.ticker}</b> — {parsedTrade.matchedName}
                  </div>
                ):(
                  <div style={{marginTop:8}}>
                    {tickerSearchLoading?(
                      <div style={{fontSize:12,color:C.gold}}>🔍 Searching ticker symbol...</div>
                    ):tickerSearchResults.length>0?(
                      <div>
                        <div style={{fontSize:12,color:C.gold,fontWeight:700,marginBottom:6}}>
                          Select ticker for <b>{parsedTrade.companyName}</b>:
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:5}}>
                          {tickerSearchResults.map((r,i)=>(
                            <button key={i} onClick={()=>{
                              setParsedTrade(p=>({...p,ticker:r.ticker,matchedName:r.name,mkt:r.mkt||p.mkt}));
                              setTickerSearchResults([]);
                            }} style={{
                              display:"flex",justifyContent:"space-between",alignItems:"center",
                              padding:"8px 10px",borderRadius:7,cursor:"pointer",textAlign:"left",
                              border:`1px solid ${r.source==="portfolio"?C.green:C.accent}44`,
                              background:r.source==="portfolio"?C.green+"0A":C.accent+"0A",
                            }}>
                              <div>
                                <span style={{fontWeight:800,fontSize:13,color:r.source==="portfolio"?C.green:r.source==="ai"?C.purple:C.accent}}>{r.ticker}</span>
                                <span style={{fontSize:11,color:C.muted,marginLeft:6}}>{r.exchange||r.mkt}</span>
                                {r.source==="portfolio"&&<span style={{fontSize:10,color:C.green,marginLeft:5,fontWeight:700}}>● IN PORTFOLIO</span>}
                                {r.source==="ai"&&<span style={{fontSize:10,color:C.purple,marginLeft:5,fontWeight:700}}>🤖 AI</span>}
                              </div>
                              <div style={{fontSize:11,color:C.muted,maxWidth:"55%",textAlign:"right"}}>{r.name}</div>
                            </button>
                          ))}
                        </div>
                        <button onClick={()=>searchTickerForParsed(parsedTrade.companyName,parsedTrade.mkt)}
                          style={{marginTop:6,fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>
                          Search again
                        </button>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontSize:12,color:C.gold}}>⚠ No ticker matched — </div>
                        <button onClick={()=>searchTickerForParsed(parsedTrade.companyName,parsedTrade.mkt)}
                          style={{fontSize:12,color:C.accent,background:"none",border:`1px solid ${C.accent}`,borderRadius:5,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>
                          🔍 Search
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Trade Entry / Edit Form */}
        {showTradeForm&&(
          <div key={editTradeId??'new-trade'} style={{...card,border:`1px solid ${editTradeId!=null?C.gold:C.accent}40`,background:C.surface,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:700,color:editTradeId!=null?C.gold:C.accent}}>
                {editTradeId!=null?"EDIT TRADE":"NEW TRADE ENTRY"}
              </div>
              {editTradeId!=null&&<button onClick={()=>{setShowTradeForm(false);setEditTradeId(null);}} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer"}}>✕</button>}
            </div>

            {/* Row 1: Ticker search + Type */}
            <div style={{marginBottom:8}}>
              <div style={lbl}>Stock Search — Name or Ticker Symbol</div>
              <div style={{display:"flex",gap:6}}>
                <input ref={searchInputRef} style={{...iField,flex:1}} placeholder="e.g. NVIDIA or NVDA or D05.SI" defaultValue={tickerSearchTerm} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();lookupTicker(searchInputRef.current?.value||"");}}} onBlur={e=>{setTickerSearchTerm(e.target.value);}}/>
                <button onClick={()=>lookupTicker(searchInputRef.current?.value||tickerSearchTerm)} style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${C.accent}`,background:C.accent+"18",color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
                  {tickerCheck.status==="loading"?"...":"Search"}
                </button>
              </div>
              {/* Validation feedback */}
              {tickerCheck.status==="found"&&(
                <div style={{marginTop:6,padding:"6px 10px",background:C.green+"15",border:`1px solid ${C.green}44`,borderRadius:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:14,color:C.green,fontWeight:700}}>Confirmed: {tickerCheck.confirmed}</div>
                      <div style={{fontSize:14,color:C.text}}>{tickerCheck.message}</div>
                    </div>
                    <div style={{fontSize:14,fontWeight:700,padding:"2px 8px",borderRadius:5,background:C.green,color:"#000",cursor:"pointer"}} onClick={()=>{setTickerCheck({status:"idle",message:"",suggestions:[]});setTickerSearchTerm("");if(searchInputRef.current)searchInputRef.current.value="";}}>OK ✕</div>
                  </div>
                  {tickerCheck.suggestions&&tickerCheck.suggestions.length>0&&(
                    <div style={{marginTop:6,fontSize:14,color:C.muted}}>
                      Also matches: {tickerCheck.suggestions.map((s,i)=>(
                        <button key={i} onClick={()=>{setTradeForm(f=>({...f,ticker:s.ticker}));setTickerCheck(prev=>({...prev,status:"found",message:s.name,confirmed:s.ticker,suggestions:[]}));setTickerSearchTerm(s.ticker);if(searchInputRef.current)searchInputRef.current.value=s.ticker;}} style={{marginLeft:4,padding:"1px 6px",borderRadius:4,border:`1px solid ${C.accent}`,background:"transparent",color:C.accent,fontSize:14,cursor:"pointer"}}>
                          {s.ticker}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {tickerCheck.status==="suggestions"&&(
                <div style={{marginTop:6,padding:"6px 10px",background:C.gold+"12",border:`1px solid ${C.gold}44`,borderRadius:6}}>
                  <div style={{fontSize:14,color:C.gold,fontWeight:700,marginBottom:5}}>{tickerCheck.message}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {tickerCheck.suggestions.map((s,i)=>(
                      <button key={i} onClick={()=>{setTradeForm(f=>({...f,ticker:s.ticker}));setTickerCheck({status:"found",message:s.name,confirmed:s.ticker,suggestions:[]});setTickerSearchTerm(s.ticker);if(searchInputRef.current)searchInputRef.current.value=s.ticker;}} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${C.gold}66`,background:C.gold+"12",color:C.text,fontSize:14,cursor:"pointer",textAlign:"left"}}>
                        <div style={{fontWeight:700,fontSize:14}}>{s.ticker}</div>
                        <div style={{fontSize:13,color:C.muted}}>{s.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tickerCheck.status==="error"&&(
                <div style={{marginTop:5,fontSize:14,color:C.red}}>{tickerCheck.message}</div>
              )}
            </div>

            {/* Confirmed ticker + trade type row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={lbl}>Ticker Symbol {tickerCheck.status==="found"?"(confirmed)":"(manual entry)"}</div>
                <input ref={tradeRefs.ticker} style={{...iField,borderColor:tickerCheck.status==="found"?C.green:tickerCheck.status==="suggestions"?C.gold:C.border}} placeholder="TICKER" defaultValue={tradeForm.ticker} onBlur={e=>{
                const t=e.target.value.toUpperCase().trim();
                const autoMkt=detectMktFromTicker(t);
                // Fall back to existing holding mkt when autoMkt is null (no suffix).
                // Ensures ESLOF keeps EU, not US, when entered as a trade.
                const existingHolding=holdings.find(h=>h.ticker===t);
                const resolvedMkt=autoMkt||(existingHolding?.mkt)||null;
                const autoCcy=resolvedMkt?mktToCcy(resolvedMkt):null;
                setTradeForm(f=>({...f,
                  ticker:t,
                  ...(resolvedMkt?{mkt:resolvedMkt}:{}),
                  ...(autoCcy?{ccy:autoCcy}:{}),
                }));
              }}/>
              </div>
              <div>
                <div style={lbl}>Trade Type</div>
                <div style={{display:"flex",gap:4}}>
                  {[["BUY",C.green],["SELL",C.red],["DIV",C.gold]].map(([t,col])=>(
                    <button key={t} onClick={()=>setTradeForm(f=>({...f,type:t}))} style={{flex:1,padding:"7px",borderRadius:7,border:`1px solid ${tradeForm.type===t?col:C.border}`,background:tradeForm.type===t?col+"22":"transparent",color:tradeForm.type===t?col:C.muted,fontSize:14,fontWeight:700,cursor:"pointer"}}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Date */}
            <div style={{marginBottom:8}}>
              <div style={lbl}>Trade Date</div>
              <input ref={tradeRefs.date} type="date" style={iField} defaultValue={tradeForm.date} onBlur={e=>setTradeForm(f=>({...f,date:e.target.value}))}/>
            </div>

            {/* Row 3: Exchange/Country separate from Currency */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={lbl}>Exchange / Country</div>
                <select style={iField} value={tradeForm.mkt} onChange={e=>setTradeForm(f=>({...f,mkt:e.target.value}))}>
                  {mkts.map(mk=><option key={mk} value={mk}>{mk} — {MKT[mk].index}</option>)}
                </select>
                <div style={{fontSize:13,color:C.muted,marginTop:3}}>Where the stock is listed</div>
              </div>
              <div>
                <div style={lbl}>Currency of Trade</div>
                <select style={iField} value={tradeForm.ccy} onChange={e=>setTradeForm(f=>({...f,ccy:e.target.value}))}>
                  {ccyList.map(c=><option key={c} value={c}>{c} ({CCY[c].symbol})</option>)}
                </select>
                <div style={{fontSize:13,color:C.muted,marginTop:3}}>Price currency (e.g. SG stock in USD)</div>
              </div>
            </div>

            {/* Row 4: DIV mode toggle (only visible for DIV type) */}
            {tradeForm.type==="DIV"&&(
              <div style={{marginBottom:8}}>
                <div style={lbl}>Entry Mode</div>
                <div style={{display:"flex",gap:4}}>
                  {[
                    ["gross","Gross per Share","Enter declared div/sh, app deducts WHT"],
                    ["net",  "Net Total ★","Paste net amount direct from DBS statement"],
                  ].map(([mode,label,hint])=>(
                    <button key={mode} onClick={()=>setTradeForm(f=>({...f,divMode:mode}))}
                      style={{flex:1,padding:"7px 6px",borderRadius:7,
                        border:`1px solid ${tradeForm.divMode===mode?C.gold:C.border}`,
                        background:tradeForm.divMode===mode?C.gold+"22":"transparent",
                        color:tradeForm.divMode===mode?C.gold:C.muted,
                        fontSize:12,fontWeight:700,cursor:"pointer",lineHeight:1.3,textAlign:"center"}}>
                      {label}
                      <div style={{fontSize:10,fontWeight:400,marginTop:2,color:tradeForm.divMode===mode?C.gold:C.muted,opacity:0.8}}>{hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Row 5: Amount fields — layout depends on DIV mode */}
            {tradeForm.type==="DIV"&&tradeForm.divMode==="net"?(
              // NET MODE: single field — total net received from statement
              <div style={{marginBottom:8}}>
                <div style={lbl}>Net Amount Received ({tradeForm.ccy} {tradePriceSym})</div>
                <input ref={tradeRefs.price} type="number" style={{...iField,borderColor:C.gold}}
                  placeholder="e.g. 543.24"
                  defaultValue={tradeForm.price}
                  onBlur={e=>setTradeForm(f=>({...f,price:e.target.value,shares:"1"}))}/>
                <div style={{fontSize:12,color:C.gold,marginTop:3,fontWeight:600}}>
                  Exact net amount from DBS statement — stored as-is, no WHT calculation applied
                </div>
                {/* Hidden shares ref — set to 1 so submitTrade math works: profit = price × 1 × (1−0) */}
                <input ref={tradeRefs.shares} type="hidden" value="1"/>
              </div>
            ):(
              // GROSS MODE: original two-field layout
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                <div>
                  <div style={lbl}>{tradeForm.type==="DIV"?"Dividend per Share":"Price"} ({tradeForm.ccy} {tradePriceSym})</div>
                  <input ref={tradeRefs.price} type="number" style={iField} placeholder="0.00" defaultValue={tradeForm.price} onBlur={e=>setTradeForm(f=>({...f,price:e.target.value}))}/>
                  {tradeForm.type==="DIV"&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>Gross dividend per share (before WHT)</div>}
                </div>
                <div>
                  <div style={lbl}>{tradeForm.type==="DIV"?"Shares Held at Ex-Div":"Units / Shares"}</div>
                  <input ref={tradeRefs.shares} type="number" style={iField} placeholder="0" defaultValue={tradeForm.shares} onBlur={e=>setTradeForm(f=>({...f,shares:e.target.value}))}/>
                  {tradeForm.type==="DIV"&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>Your holding on the ex-dividend date</div>}
                </div>
              </div>
            )}

            {/* Preview — DIV: net dividend breakdown; BUY/SELL: existing preview */}
            {tradeForm.type==="DIV"&&tradeForm.price&&tradePriceTotal>0&&(()=>{
              const isNetMode=tradeForm.divMode==="net";
              const sym2=tradePriceSym;
              const taxRate=getDivTax(tradeForm.mkt||'US');
              const taxLabel=fmtTax(tradeForm.mkt||'US');

              if(isNetMode){
                // Net mode: amount entered IS the net total — show it directly
                const netTotal=parseFloat(tradeRefs.price?.current?.value||tradeForm.price||0);
                if(netTotal<=0) return null;
                return(
                  <div style={{background:C.card,borderRadius:7,padding:"8px 10px",marginBottom:8,
                    fontSize:14,border:`1px solid ${C.gold}44`}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:6}}>💵 DIVIDEND PREVIEW — Net Mode</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      <div>
                        <div style={{fontSize:11,color:C.muted}}>From statement</div>
                        <div style={{fontWeight:800,color:C.gold,fontSize:16}}>{sym2}{fmt(netTotal,2)}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:11,color:C.muted}}>SGD equivalent</div>
                        <div style={{fontWeight:700}}>{fmtS(ccyToSGD(netTotal,tradeForm.ccy))}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:C.muted,marginTop:5,borderTop:`1px solid ${C.border}`,paddingTop:4}}>
                      Stored exactly as entered · WHT already deducted by DBS
                    </div>
                  </div>
                );
              } else {
                // Gross mode: calculate gross → WHT → net
                const divPerShare=parseFloat(tradeRefs.price?.current?.value||tradeForm.price||0);
                const qty=parseInt(tradeRefs.shares?.current?.value||tradeForm.shares||0);
                const grossDiv=divPerShare*qty;
                const taxAmt=grossDiv*taxRate;
                const netDiv=grossDiv-taxAmt;
                if(grossDiv<=0) return null;
                return(
                  <div style={{background:C.card,borderRadius:7,padding:"8px 10px",marginBottom:8,
                    fontSize:14,border:`1px solid ${C.gold}30`}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.gold,marginBottom:6}}>💵 DIVIDEND PREVIEW — Gross Mode</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      <div>
                        <div style={{fontSize:11,color:C.muted}}>Gross</div>
                        <div style={{fontWeight:700}}>{sym2}{fmt(grossDiv,2)}</div>
                        <div style={{fontSize:12,color:C.muted}}>{fmtS(ccyToSGD(grossDiv,tradeForm.ccy))}</div>
                      </div>
                      <div>
                        <div style={{fontSize:11,color:C.red}}>WHT {taxLabel||"(none)"}</div>
                        <div style={{fontWeight:700,color:taxAmt>0?C.red:C.muted}}>
                          {taxAmt>0?"-"+sym2+fmt(taxAmt,2):"—"}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:11,color:C.green}}>Net Received</div>
                        <div style={{fontWeight:800,color:C.green}}>{sym2}{fmt(netDiv,2)}</div>
                        <div style={{fontSize:12,color:C.muted}}>{fmtS(ccyToSGD(netDiv,tradeForm.ccy))}</div>
                      </div>
                    </div>
                  </div>
                );
              }
            })()}
            {tradeForm.type!=="DIV"&&tradeForm.price&&tradeForm.shares&&tradePriceTotal>0&&(()=>{
              const tU2=(tradeRefs.ticker?.current?.value||tradeForm.ticker||"").toUpperCase().trim();
              const p2=parseFloat(tradeRefs.price?.current?.value||tradeForm.price||0);
              const s2=parseInt(tradeRefs.shares?.current?.value||tradeForm.shares||0);
              const existH2=holdings.find(h=>h.ticker===tU2);
              const buysBefore2=trades.filter(t=>t.ticker===tU2&&t.type==="BUY"&&(editTradeId==null||t.id!==editTradeId));
              const totBuyShares2=buysBefore2.reduce((s,t)=>s+t.shares,0);
              const totBuyCost2=buysBefore2.reduce((s,t)=>s+t.shares*t.price,0);
              const curAvg=totBuyShares2>0?totBuyCost2/totBuyShares2:(existH2?.avgCost||0);
              const curShares=existH2?.shares||0;
              // BUY: new weighted avg cost
              const newAvgBuy=tradeForm.type==="BUY"&&(curShares+s2)>0
                ?(curShares*curAvg+s2*p2)/(curShares+s2):0;
              // SELL: profit and remaining avg (doesn't change on sell)
              const sellProfit=tradeForm.type==="SELL"&&curAvg>0?(p2-curAvg)*s2:null;
              const sym2=tradePriceSym;
              return(
                <div style={{background:C.card,borderRadius:7,padding:"8px 10px",marginBottom:8,fontSize:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:curAvg>0?6:0}}>
                    <span style={{color:C.muted}}>Total:</span>
                    <span style={{fontWeight:700}}>
                      {sym2}{fmt(tradePriceTotal,0)} {tradeForm.ccy}
                      <span style={{color:C.muted,fontWeight:400}}> ≈ {fmtS(ccyToSGD(tradePriceTotal,tradeForm.ccy))}</span>
                    </span>
                  </div>
                  {curAvg>0&&tradeForm.type==="BUY"&&newAvgBuy>0&&(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:12,color:C.muted}}>Current avg cost</div>
                        <div style={{fontWeight:700,color:C.mutedLight}}>{sym2}{fmt(curAvg,3)} × {curShares.toLocaleString()} sh</div>
                      </div>
                      <div style={{fontSize:18,color:C.muted}}>→</div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:12,color:C.accent}}>New avg cost</div>
                        <div style={{fontWeight:800,color:newAvgBuy<curAvg?C.green:C.gold}}>
                          {sym2}{fmt(newAvgBuy,3)}
                          <span style={{fontSize:11,color:newAvgBuy<curAvg?C.green:C.gold,marginLeft:4}}>
                            {newAvgBuy<curAvg?"▼ lower":"▲ higher"}
                          </span>
                        </div>
                        <div style={{fontSize:12,color:C.muted}}>× {(curShares+s2).toLocaleString()} sh total</div>
                      </div>
                    </div>
                  )}
                  {curAvg>0&&tradeForm.type==="SELL"&&sellProfit!==null&&(
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div>
                          <div style={{fontSize:12,color:C.muted}}>Avg cost basis</div>
                          <div style={{fontWeight:700,color:C.mutedLight}}>{sym2}{fmt(curAvg,3)} / sh</div>
                        </div>
                        <div style={{fontSize:18,color:C.muted}}>−</div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:12,color:C.muted}}>Sell price</div>
                          <div style={{fontWeight:700,color:C.text}}>{sym2}{fmt(p2,3)} / sh</div>
                        </div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        background:sellProfit>=0?C.green+"12":C.red+"12",
                        border:`1px solid ${sellProfit>=0?C.green:C.red}30`,
                        borderRadius:6,padding:"5px 10px"}}>
                        <span style={{fontSize:13,color:C.muted,fontWeight:600}}>
                          {tradeForm.type} {s2.toLocaleString()} sh → P&amp;L:
                        </span>
                        <span style={{fontWeight:800,fontSize:16,color:sellProfit>=0?C.green:C.red}}>
                          {sellProfit>=0?"+":"-"}{sym2}{fmt(Math.abs(sellProfit),2)}
                          <span style={{fontSize:12,color:C.muted,fontWeight:400,marginLeft:4}}>
                            ≈ {sellProfit>=0?"+":"-"}{fmtS(Math.abs(ccyToSGD(sellProfit,tradeForm.ccy)))}
                          </span>
                        </span>
                      </div>
                      <div style={{fontSize:12,color:C.muted,marginTop:4,textAlign:"right"}}>
                        Avg cost unchanged at {sym2}{fmt(curAvg,3)} for remaining {Math.max(0,curShares-s2).toLocaleString()} sh
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <button onClick={()=>submitTrade()} style={{width:"100%",padding:"11px",borderRadius:8,border:"none",background:tradeForm.type==="BUY"?C.green:tradeForm.type==="DIV"?C.gold:C.red,color:"#000",fontSize:16,fontWeight:700,cursor:"pointer"}}>
              {editTradeId!=null?"Save Changes":"Record"} {tradeForm.type}{tradeForm.type==="DIV"?" — "+tradeForm.ticker||"":" — "+(tradeForm.ticker||"ticker")}
            </button>
          </div>
        )}

        {/* Filter 1: trade type */}
        <div style={{marginBottom:8}}>
          <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:5,
            display:"flex",alignItems:"center",gap:6}}>
            <span style={{background:C.accent+"22",color:C.accent,borderRadius:4,
              padding:"1px 6px",fontSize:11,fontWeight:700}}>1</span>
            Trade type
          </div>
          <div style={{display:"flex",gap:6}}>
            {["ALL","BUY","SELL","DIV"].map(t=><button key={t} style={pill(tradeType===t)} onClick={()=>setTradeType(t)}>{t}</button>)}
          </div>
        </div>

        {/* Filter 2: date range */}
        {(()=>{
          const inputStyle={
            flex:1,background:C.card,border:`1px solid ${C.border}`,
            borderRadius:7,padding:"6px 8px",color:C.text,
            fontSize:13,outline:"none",colorScheme:"dark",
            minWidth:0,
          };
          const hasFilter=tradeDateFrom||tradeDateTo;
          return(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:5,
                display:"flex",alignItems:"center",gap:6}}>
                <span style={{background:C.accent+"22",color:C.accent,borderRadius:4,
                  padding:"1px 6px",fontSize:11,fontWeight:700}}>2</span>
                Date range
              </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.muted,flexShrink:0}}>📅</span>
              <input
                type="date"
                value={tradeDateFrom}
                onChange={e=>setTradeDateFrom(e.target.value)}
                style={{...inputStyle,borderColor:tradeDateFrom?C.accent:C.border}}
                placeholder="From"
              />
              <span style={{fontSize:12,color:C.muted,flexShrink:0}}>→</span>
              <input
                type="date"
                value={tradeDateTo}
                onChange={e=>setTradeDateTo(e.target.value)}
                style={{...inputStyle,borderColor:tradeDateTo?C.accent:C.border}}
                placeholder="To"
              />
              {hasFilter&&(
                <button
                  onClick={()=>{setTradeDateFrom("");setTradeDateTo("");}}
                  title="Clear date filter"
                  style={{flexShrink:0,background:"none",border:`1px solid ${C.border}`,
                    borderRadius:7,padding:"6px 8px",color:C.muted,fontSize:13,
                    cursor:"pointer",lineHeight:1}}>
                  ✕
                </button>
              )}
            </div>
            </div>
          );
        })()}

        {/* Filter 3: search by ticker or company name */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:5,
            display:"flex",alignItems:"center",gap:6}}>
            <span style={{background:C.accent+"22",color:C.accent,borderRadius:4,
              padding:"1px 6px",fontSize:11,fontWeight:700}}>3</span>
            Search by ticker or company name
          </div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",
              fontSize:15,color:C.muted,pointerEvents:"none",lineHeight:1}}>🔍</span>
            <input
              ref={tradeSearchRef}
              placeholder={`e.g. NVDA, Apple, D05.SI… (${shown.length} trade${shown.length!==1?"s":""})`}
              defaultValue={tradeSearch}
              onInput={e=>{
                setTradeSearch(e.target.value);
                showTradeClear(e.target.value.length>0);
              }}
              style={{...inp,paddingLeft:32,paddingRight:32,
                borderColor:tradeSearch?C.accent:C.border}}
            />
            <button
              ref={tradeClearRef}
              onMouseDown={e=>e.preventDefault()}
              onClick={()=>{setTradeSearch("");if(tradeSearchRef.current){tradeSearchRef.current.value="";tradeSearchRef.current.focus();}showTradeClear(false);}}
              style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",
                lineHeight:1,display:"flex",alignItems:"center",
                visibility:"hidden",pointerEvents:"none"}}>
              ✕
            </button>
          </div>
          {tradeSearch&&shown.length===0&&(
            <div style={{fontSize:13,color:C.muted,marginTop:5,textAlign:"center"}}>
              No trades match "{tradeSearch}"
            </div>
          )}
        </div>

        {/* Trade list — all trades, latest first, no cap */}
        {(()=>{
          const limit=200;
          const display=shown.slice(0,tradeSearch?shown.length:limit);
          return(<>
            {display.map((t,i)=>{
          const sym=ccySymbol(t.ccy||t.mkt);
          const localTotal=t.shares*t.price;
          const sgdTotal=ccyToSGD(localTotal,t.ccy||t.mkt);
          const isEditing=editTradeId===t.id;
          const stockName=tickerNames[t.ticker]||"";
          const linkedHolding=holdings.find(h=>h.ticker===t.ticker);
          const typeCol=t.type==="BUY"?C.green:t.type==="DIV"?C.gold:C.red;
          const isDIV=t.type==="DIV";
          const taxRate=isDIV?getDivTax(t.mkt||'US'):0;
          const grossDiv=isDIV?localTotal:0;
          const netDiv=isDIV?(t.profit||grossDiv*(1-taxRate)):0;
          return(
            <div key={t.id||i}
              onClick={()=>{if(linkedHolding){setSel(linkedHolding);setDetailPeriod("6m");}}}
              style={{...card,borderLeft:`3px solid ${typeCol}`,
                cursor:linkedHolding?"pointer":"default",
                background:isEditing?C.gold+"08":isDIV?C.gold+"05":C.card,}}>
              <div style={row}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2}}>
                    <span style={{fontWeight:800,fontSize:17}}>{t.ticker}</span>
                    <Tag col={typeCol}>{t.type}</Tag>
                    <Chip mkt={t.mkt}/>
                    {t.ccy&&t.ccy!==(MKT[t.mkt]?.code)&&(
                      <span style={{fontSize:13,fontWeight:700,padding:"1px 5px",borderRadius:3,background:C.gold+"22",color:C.gold}}>{t.ccy}</span>
                    )}
                  </div>
                  {stockName&&<div style={{fontSize:14,color:C.mutedLight,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:200}}>{stockName}{linkedHolding&&<span style={{fontSize:10,color:C.accent,marginLeft:5,opacity:0.6}}>→</span>}</div>}
                  {isDIV
                    // Net mode: price IS the total received — show date + "Net from statement"
                    // Gross mode: show date + shares @ price/sh (declared dividend rate)
                    ? t.divMode==="net"
                      ?<div style={{fontSize:14,color:C.muted}}>{t.date} · Net received from statement</div>
                      :<div style={{fontSize:14,color:C.muted}}>{t.date} · {t.shares?.toLocaleString()} sh @ {sym}{fmt(t.price,4)}/sh (gross)</div>
                    :<div style={{fontSize:14,color:C.muted}}>{t.date} · {t.shares?.toLocaleString()} @ {sym}{fmt(t.price)}</div>
                  }
                  {t.type==="SELL"&&t.profit!=null&&t.profit!==0&&<div style={{fontSize:14,fontWeight:700,color:t.profit>=0?C.green:C.red,marginTop:2}}>P&amp;L: {t.profit>=0?"+":"-"}{sym}{fmt(Math.abs(t.profit),0)} <span style={{color:C.muted,fontWeight:400}}>({t.profit>=0?"+":"-"}{fmtS(Math.abs(ccyToSGD(t.profit,t.ccy||t.mkt)))})</span></div>}
                  {t.type==="SELL"&&(()=>{
                    // ── Sell quality check ──────────────────────────────────────────
                    // PRIMARY: always compare sell price vs current live price
                    //          (answers: "was the timing right vs today?")
                    // SECONDARY: show cost basis context below
                    //          (answers: "was it profitable vs what was paid?")
                    // Live price is fetched for ALL holdings including closed ones,
                    // so this works for both partial and fully-closed positions.

                    const sellPrice=Number(t.price)||0;
                    if(sellPrice<=0) return null;

                    // Live price: prefer linkedHolding.price (all holdings get live prices);
                    // falls back gracefully if not available
                    const livePrice=linkedHolding?.price||0;
                    if(livePrice<=0) return null;

                    // Primary: sell price vs today's live price
                    const pctVsNow=((livePrice-sellPrice)/sellPrice)*100;
                    const missedSGD=toSGDlive((livePrice-sellPrice)*Number(t.shares),t.mkt);

                    let verdict,vColor,vIcon;
                    if(pctVsNow>20)      { verdict="Sold Too Early";   vColor=C.red;   vIcon="🔴"; }
                    else if(pctVsNow>10) { verdict="Possibly Early";   vColor=C.gold;  vIcon="🟡"; }
                    else if(pctVsNow>5)  { verdict="Slightly Early";   vColor=C.gold;  vIcon="🟡"; }
                    else if(pctVsNow>=-5){ verdict="Good Timing";      vColor=C.green; vIcon="✅"; }
                    else                 { verdict="Great Sell";       vColor=C.green; vIcon="✅"; }

                    // Secondary: cost basis context (back-calculated from stored profit)
                    const profit=Number(t.profit)||0;
                    const shares=Number(t.shares)||0;
                    const avgCostAtSale=shares>0 ? sellPrice-(profit/shares) : 0;
                    const pctVsCost=avgCostAtSale>0
                      ?((sellPrice-avgCostAtSale)/avgCostAtSale)*100
                      :null;

                    const isStillHeld=linkedHolding&&Number(linkedHolding.shares)>0;

                    return(
                      <div style={{marginTop:4,padding:"5px 8px",borderRadius:6,
                        background:vColor+"12",border:`1px solid ${vColor}30`}}>
                        {/* Row 1: verdict + % vs today */}
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",flexWrap:"wrap",gap:4}}>
                          <span style={{fontSize:12,fontWeight:700,color:vColor}}>
                            {vIcon} {verdict}
                          </span>
                          <span style={{fontSize:12,fontWeight:700,
                            color:pctVsNow>0?C.red:C.green}}>
                            {pctVsNow>=0?"+":""}{pctVsNow.toFixed(1)}% since sale
                          </span>
                        </div>
                        {/* Row 2: price grid — sold / now / gap */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                          gap:4,fontSize:12,marginTop:5}}>
                          <div>
                            <div style={{color:C.muted,marginBottom:1}}>Sold</div>
                            <div style={{fontWeight:700}}>{sym}{fmt(sellPrice,2)}</div>
                            <div style={{color:C.muted,fontSize:11}}>{t.date}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{color:C.muted,marginBottom:1}}>Now</div>
                            <div style={{fontWeight:700,
                              color:livePrice>sellPrice?C.red:C.green}}>
                              {sym}{fmt(livePrice,2)}
                            </div>
                            <div style={{color:C.muted,fontSize:11}}>live</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{color:C.muted,marginBottom:1}}>
                              {missedSGD>0?"Missed":"Saved"}
                            </div>
                            <div style={{fontWeight:700,
                              color:missedSGD>0?C.red:C.green}}>
                              {missedSGD>=0?"+":"-"}{fmtS(Math.abs(missedSGD))}
                            </div>
                            <div style={{color:C.muted,fontSize:11}}>
                              {isStillHeld?"still holding":"if held today"}
                            </div>
                          </div>
                        </div>
                        {/* Row 3: cost basis context */}
                        {pctVsCost!==null&&(
                          <div style={{fontSize:11,color:C.muted,marginTop:4,
                            borderTop:`1px solid ${C.border}`,paddingTop:3,
                            display:"flex",justifyContent:"space-between"}}>
                            <span>
                              Cost {sym}{fmt(avgCostAtSale,2)} → Sold {sym}{fmt(sellPrice,2)}
                              <span style={{
                                color:pctVsCost>=0?C.green:C.red,
                                fontWeight:700,marginLeft:4}}>
                                {pctVsCost>=0?"+":""}{pctVsCost.toFixed(1)}% on cost
                              </span>
                            </span>
                            {!isStillHeld&&<span style={{color:C.muted}}>Position closed</span>}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {t.type==="BUY"&&(()=>{
                    // ── Buy quality check ───────────────────────────────────────────
                    // PRIMARY: compare buy price vs current live price
                    //          (answers: "has this purchase been profitable since entry?")
                    // SECONDARY: compare buy price vs current avg cost of the position
                    //          (answers: "did this buy improve or worsen the blended cost?")
                    // Works for both active and fully-closed positions (live prices fetched
                    // for all holdings).

                    const buyPrice=Number(t.price)||0;
                    if(buyPrice<=0) return null;
                    const livePrice=linkedHolding?.price||0;
                    if(livePrice<=0) return null;

                    // Primary: buy price vs today's live price
                    const pctVsNow=((livePrice-buyPrice)/buyPrice)*100;
                    const gainSGD=toSGDlive((livePrice-buyPrice)*Number(t.shares),t.mkt);

                    // Verdict: was this a good entry point?
                    let verdict,vColor,vIcon;
                    if(pctVsNow>30)       { verdict="Great Entry";      vColor=C.green; vIcon="✅"; }
                    else if(pctVsNow>10)  { verdict="Good Entry";       vColor=C.green; vIcon="✅"; }
                    else if(pctVsNow>0)   { verdict="Slight Gain";      vColor=C.gold;  vIcon="🟡"; }
                    else if(pctVsNow>-10) { verdict="Bought High";      vColor=C.gold;  vIcon="🟡"; }
                    else                  { verdict="Too Early / High";  vColor=C.red;   vIcon="🔴"; }

                    // Secondary: compare this buy price vs current blended avg cost
                    const avgCost=linkedHolding?.avgCost||0;
                    const pctVsAvg=avgCost>0
                      ?((buyPrice-avgCost)/avgCost)*100
                      :null;

                    const isStillHeld=linkedHolding&&Number(linkedHolding.shares)>0;

                    return(
                      <div style={{marginTop:4,padding:"5px 8px",borderRadius:6,
                        background:vColor+"12",border:`1px solid ${vColor}30`}}>
                        {/* Row 1: verdict + % since buy */}
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",flexWrap:"wrap",gap:4}}>
                          <span style={{fontSize:12,fontWeight:700,color:vColor}}>
                            {vIcon} {verdict}
                          </span>
                          <span style={{fontSize:12,fontWeight:700,
                            color:pctVsNow>=0?C.green:C.red}}>
                            {pctVsNow>=0?"+":""}{pctVsNow.toFixed(1)}% since buy
                          </span>
                        </div>
                        {/* Row 2: price grid — bought / now / gain or loss */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                          gap:4,fontSize:12,marginTop:5}}>
                          <div>
                            <div style={{color:C.muted,marginBottom:1}}>Bought</div>
                            <div style={{fontWeight:700}}>{sym}{fmt(buyPrice,2)}</div>
                            <div style={{color:C.muted,fontSize:11}}>{t.date}</div>
                          </div>
                          <div style={{textAlign:"center"}}>
                            <div style={{color:C.muted,marginBottom:1}}>Now</div>
                            <div style={{fontWeight:700,
                              color:livePrice>=buyPrice?C.green:C.red}}>
                              {sym}{fmt(livePrice,2)}
                            </div>
                            <div style={{color:C.muted,fontSize:11}}>live</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{color:C.muted,marginBottom:1}}>
                              {gainSGD>=0?"Gain":"Loss"}
                            </div>
                            <div style={{fontWeight:700,
                              color:gainSGD>=0?C.green:C.red}}>
                              {gainSGD>=0?"+":"-"}{fmtS(Math.abs(gainSGD))}
                            </div>
                            <div style={{color:C.muted,fontSize:11}}>
                              {isStillHeld?"on this lot":"position closed"}
                            </div>
                          </div>
                        </div>
                        {/* Row 3: avg cost context */}
                        {pctVsAvg!==null&&isStillHeld&&(
                          <div style={{fontSize:11,color:C.muted,marginTop:4,
                            borderTop:`1px solid ${C.border}`,paddingTop:3,
                            display:"flex",justifyContent:"space-between"}}>
                            <span>
                              This buy {sym}{fmt(buyPrice,2)} vs avg cost {sym}{fmt(avgCost,2)}
                              <span style={{
                                color:pctVsAvg<=0?C.green:C.red,
                                fontWeight:700,marginLeft:4}}>
                                {pctVsAvg<=0?"▼ lowered avg":"▲ raised avg"}
                              </span>
                            </span>
                            <span style={{color:pctVsAvg<=0?C.green:C.red,fontWeight:700}}>
                              {pctVsAvg>=0?"+":""}{pctVsAvg.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {isDIV&&netDiv>0&&(()=>{
                    // Yield on cost = net received ÷ (shares × avgCost) × 100
                    // DBS-sourced DIV records are stored as: shares=1, price=total_amount.
                    // Using t.shares=1 as denominator gives absurd yield (e.g. 4957%).
                    // Fix: when t.shares<=1, use the holding's actual share count.
                    // When t.shares>1 the trade was entered in per-share format — use it.
                    const h2=linkedHolding;
                    const avgCostH=h2?.avgCost||0;
                    const sharesForYield=Number(t.shares)>1
                      ? Number(t.shares)          // per-share format: use trade shares
                      : (h2?.shares||0);           // total-amount format (DBS): use holding shares
                    const yieldOnCost=(avgCostH>0&&sharesForYield>0)
                      ? (netDiv/(sharesForYield*avgCostH))*100
                      : null;
                    // Yield on market = net received ÷ (shares × current price) × 100
                    const priceH=h2?.price||0;
                    const yieldOnMkt=(priceH>0&&sharesForYield>0)
                      ? (netDiv/(sharesForYield*priceH))*100
                      : null;
                    return(
                      <div style={{marginTop:2}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.gold}}>
                          Net: +{sym}{fmt(netDiv,2)}
                          {taxRate>0&&<span style={{color:C.muted,fontWeight:400,fontSize:13}}> (after {(taxRate*100).toFixed(3).replace(/\.?0+$/,"")}% WHT)</span>}
                          <span style={{color:C.muted,fontWeight:400}}> {fmtS(ccyToSGD(netDiv,t.ccy||t.mkt))}</span>
                        </div>
                        {(yieldOnCost!==null||yieldOnMkt!==null)&&(
                          <div style={{fontSize:12,color:C.muted,marginTop:2,display:"flex",gap:10}}>
                            {yieldOnCost!==null&&(
                              <span>
                                Yield on cost:
                                <span style={{color:C.gold,fontWeight:700,marginLeft:3}}>
                                  {yieldOnCost.toFixed(2)}%
                                </span>
                              </span>
                            )}
                            {yieldOnMkt!==null&&(
                              <span>
                                On mkt:
                                <span style={{color:C.accent,fontWeight:700,marginLeft:3}}>
                                  {yieldOnMkt.toFixed(2)}%
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,marginLeft:8}}>
                  <div style={{textAlign:"right"}}>
                    {isDIV?(
                      <>
                        <div style={{fontSize:16,fontWeight:800,color:C.gold}}>+{sym}{fmt(netDiv,0)}</div>
                        <div style={{fontSize:13,color:C.muted}}>{fmtS(ccyToSGD(netDiv,t.ccy||t.mkt))}</div>
                        {taxRate>0&&<div style={{fontSize:12,color:C.muted}}>gross {sym}{fmt(grossDiv,0)}</div>}
                      </>
                    ):(
                      <>
                        <div style={{fontSize:16,fontWeight:800,color:t.type==="BUY"?C.red:C.green}}>{t.type==="BUY"?"-":"+"}{sym}{fmt(localTotal,0)}</div>
                        <div style={{fontSize:13,color:C.muted}}>{t.type==="BUY"?"-":"+"}{fmtS(sgdTotal)}</div>
                      </>
                    )}
                  </div>
                  <div style={{display:"flex",gap:5}} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setEditConfirmTrade(t)} style={{fontSize:14,padding:"3px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:"transparent",color:C.accent,cursor:"pointer",fontWeight:600}}>Edit</button>
                    <button onClick={()=>setDeleteConfirmTrade(t)} style={{fontSize:14,padding:"3px 8px",borderRadius:5,border:`1px solid ${C.red}44`,background:"transparent",color:C.red,cursor:"pointer",fontWeight:600}}>Del</button>
                  </div>
                </div>
              </div>
            </div>
            );
        })}
            {shown.length>limit&&!tradeSearch&&<div style={{textAlign:"center",color:C.muted,fontSize:14,padding:"12px 0",borderTop:`1px solid ${C.border}`,marginTop:4}}>
              Showing {limit} of {shown.length} trades · Use search above to find any trade instantly
            </div>}
          </>);
        })()}
      </>
    );
  }

  const [exporting,setExporting]=useState(false);

  async function exportToExcel(){
    setExporting(true);
    try{
      if(!window.XLSX){
        await new Promise((resolve,reject)=>{
          const s=document.createElement('script');
          s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload=resolve; s.onerror=reject;
          document.head.appendChild(s);
        });
      }
      const XL=window.XLSX;

      const FX={
        US:{ccy:'USD',rate:fxRates.USD||1.27,pair:'USD/SGD'},
        SG:{ccy:'SGD',rate:1.0,pair:'SGD/SGD'},
        CN:{ccy:'HKD',rate:fxRates.HKD||0.163,pair:'HKD/SGD'},
        JP:{ccy:'JPY',rate:fxRates.JPY||0.0080,pair:'JPY/SGD'},
        EU:{ccy:'EUR',rate:fxRates.EUR||1.49,pair:'EUR/SGD'},
        GB:{ccy:'GBP',rate:fxRates.GBP||1.68,pair:'GBP/SGD'},
        AU:{ccy:'AUD',rate:fxRates.AUD||0.81,pair:'AUD/SGD'},
      };
      const MKT_NAMES={US:'United States',SG:'Singapore',CN:'China/HK',JP:'Japan',EU:'Europe',GB:'United Kingdom',AU:'Australia'};
      const MKT_ORDER=['US','SG','CN','JP','EU','GB','AU'];

      const byMkt={};
      holdings.forEach(h=>{
        if(!byMkt[h.mkt])byMkt[h.mkt]=[];
        byMkt[h.mkt].push(h);
      });
      Object.keys(byMkt).forEach(m=>{
        byMkt[m].sort((a,b)=>toSGDlive(b.price*b.shares,m)-toSGDlive(a.price*a.shares,m));
      });

      const wb=XL.utils.book_new();
      const today=new Date().toLocaleDateString('en-SG',{day:'2-digit',month:'short',year:'numeric'});

      const sumRows=[];
      sumRows.push(['IGNITUS PORTFOLIO — Holdings Export','','','','','','','','']);
      sumRows.push([`As of: ${today}   |   Base Currency: SGD`,'','','','','','','','']);
      sumRows.push(['','','','','','','','','']);
      sumRows.push(['FX RATES APPLIED (to SGD) — Source: Yahoo Finance','','','','','','','','']);
      sumRows.push(['Pair','Rate (×SGD)','','Pair','Rate (×SGD)','','Pair','Rate (×SGD)','']);
      const fxItems=Object.values(FX);
      for(let i=0;i<Math.ceil(fxItems.length/3);i++){
        const row=[];
        for(let j=0;j<3;j++){
          const fx=fxItems[i*3+j];
          if(fx){row.push(fx.pair,fx.rate,'');}else{row.push('','','');}
        }
        sumRows.push(row);
      }
      sumRows.push(['','','','','','','','','']);
      sumRows.push(['Market','Currency','Holdings','Value (Local Ccy)','Value (SGD)','Ann. Div (Local)','Ann. Div (SGD)','Div Yield %','Weight %']);

      let grandSGD=0,grandDivSGD=0;
      const mktTotals={};
      MKT_ORDER.forEach(mkt=>{
        if(!byMkt[mkt])return;
        const fx=FX[mkt]||{rate:1.27,ccy:'USD'};
        const localVal=byMkt[mkt].reduce((s,h)=>s+h.price*h.shares,0);
        const sgdVal=localVal*fx.rate;
        const localDiv=byMkt[mkt].reduce((s,h)=>s+(h.divYield||0)/100*h.price*h.shares,0);
        const sgdDiv=localDiv*fx.rate;
        const divYield=localVal>0?localDiv/localVal*100:0;
        mktTotals[mkt]={localVal,sgdVal,localDiv,sgdDiv,divYield,ccy:fx.ccy};
        grandSGD+=sgdVal; grandDivSGD+=sgdDiv;
      });

      MKT_ORDER.forEach(mkt=>{
        if(!mktTotals[mkt])return;
        const t=mktTotals[mkt];
        const pct=grandSGD>0?t.sgdVal/grandSGD*100:0;
        sumRows.push([
          MKT_NAMES[mkt]||mkt, t.ccy, byMkt[mkt]?.length||0,
          +t.localVal.toFixed(2), +t.sgdVal.toFixed(2),
          +t.localDiv.toFixed(2), +t.sgdDiv.toFixed(2),
          +(t.divYield/100).toFixed(4), +(pct/100).toFixed(4)
        ]);
      });
      sumRows.push([
        'GRAND TOTAL','SGD',holdings.length,'—',
        +grandSGD.toFixed(2),'—',+grandDivSGD.toFixed(2),
        +(grandDivSGD/grandSGD).toFixed(4),1
      ]);

      const wsSummary=XL.utils.aoa_to_sheet(sumRows);
      wsSummary['!cols']=[{wch:22},{wch:10},{wch:10},{wch:18},{wch:18},{wch:18},{wch:18},{wch:12},{wch:10}];
      XL.utils.book_append_sheet(wb,wsSummary,'Portfolio Summary');

      MKT_ORDER.forEach(mkt=>{
        if(!byMkt[mkt])return;
        const fx=FX[mkt]||{rate:1.27,ccy:'USD',pair:'USD/SGD'};
        const hlist=byMkt[mkt];

        const rows=[];
        rows.push([`${MKT_NAMES[mkt]||mkt} Holdings — ${fx.ccy} → SGD @ ${fx.rate} (${fx.pair})`]);
        rows.push([`FX Rate: 1 ${fx.ccy} = ${fx.rate} SGD | Source: Yahoo Finance, ${today}`]);
        rows.push(['#','Ticker','Name','Sector','Qty','Price','Intrinsic Value',
          `Value (${fx.ccy})`,'Value (SGD)',`Ann.Div (${fx.ccy})`,'Ann.Div (SGD)','Div Yield %','Upside %','P/E Ratio']);

        let locTot=0,sgdTot=0,divLocTot=0,divSgdTot=0;
        hlist.forEach((h,i)=>{
          const localVal=h.price*h.shares;
          const sgdVal=localVal*fx.rate;
          const divLoc=(h.divYield||0)/100*localVal;
          const divSgd=divLoc*fx.rate;
          const upside=h.price>0?((h.intrinsic||h.price)-h.price)/h.price*100:0;
          locTot+=localVal; sgdTot+=sgdVal; divLocTot+=divLoc; divSgdTot+=divSgd;
          rows.push([
            i+1, h.ticker, h.name||h.ticker, h.sector||'',
            h.shares,
            +h.price.toFixed(4),
            +(h.intrinsic||0).toFixed(4),
            +localVal.toFixed(2),
            +sgdVal.toFixed(2),
            +divLoc.toFixed(2),
            +divSgd.toFixed(2),
            +((h.divYield||0)/100).toFixed(4),
            +(upside/100).toFixed(4),
            +(h.peRatio||0).toFixed(1)
          ]);
        });

        const divYieldTot=locTot>0?divLocTot/locTot:0;
        rows.push([
          `TOTAL — ${mkt} (${fx.ccy})`, '', '', '', hlist.length, '', '',
          +locTot.toFixed(2), +sgdTot.toFixed(2),
          +divLocTot.toFixed(2), +divSgdTot.toFixed(2),
          +divYieldTot.toFixed(4), '', ''
        ]);

        const ws=XL.utils.aoa_to_sheet(rows);
        ws['!cols']=[{wch:5},{wch:12},{wch:28},{wch:16},{wch:8},{wch:12},{wch:14},
                     {wch:16},{wch:16},{wch:16},{wch:16},{wch:11},{wch:10},{wch:8}];
        ws['!freeze']={xSplit:0,ySplit:3};
        XL.utils.book_append_sheet(wb,ws,`${mkt} — ${fx.ccy}`);
      });

      const date=new Date().toISOString().slice(0,10);
      XL.writeFile(wb,`Ignitus_Holdings_${date}.xlsx`);
    }catch(e){
      console.error('Export failed:',e);
      alert('Export failed: '+e.message);
    }
    setExporting(false);
  }

  function renderScreenView(){
    const budget=parseFloat(screenBudget)||0;
    const modeColor=screenMode==="BUY"?C.green:C.red;
    const topResults=screenResults.slice(0,10);
    const strengthCol=s=>s==="strong"?C.green:s==="medium"?C.gold:C.muted;
    const mBox={background:C.surface,borderRadius:6,padding:"5px 7px",textAlign:"center"};
    const sigChip=(sig,si)=>(<div key={si} style={{fontSize:12,padding:"2px 7px",borderRadius:5,background:strengthCol(sig.strength)+"18",color:strengthCol(sig.strength),fontWeight:600,border:`1px solid ${strengthCol(sig.strength)}30`}}>{sig.label} <span style={{opacity:0.7}}>+{sig.pts}</span></div>);

    return(
      <>
        
        <div style={{...card,background:"#0A0F1A",border:`1px solid ${modeColor}30`,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:modeColor,letterSpacing:"0.06em",marginBottom:2}}>
                🎯 GOD MODE SCREENER
              </div>
              <div style={{fontSize:12,color:C.muted}}>
                7-factor scoring · RSI · Fundamentals · Intrinsic value · Insider · Senate
              </div>
              {screenLastRun&&(
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  Last scan: {screenLastRun.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"})}
                  {" · "}{screenResults.length} stocks scored
                </div>
              )}
            </div>
            <button onClick={fetchScreen} disabled={screenLoading} style={{
              padding:"9px 15px",borderRadius:9,border:`1px solid ${modeColor}66`,
              background:screenLoading?C.surface:modeColor+"18",
              color:screenLoading?C.muted:modeColor,
              fontSize:12,fontWeight:700,cursor:screenLoading?"not-allowed":"pointer",flexShrink:0,
            }}>{screenLoading?"↻ Scanning...":"🔍 Run Screen"}</button>
          </div>

          
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {["BUY","SELL"].map(m=>(
              <button key={m} onClick={()=>{setScreenMode(m);if(screenResults.length>0){
                const s=[...screenResults];
                s.sort((a,b)=>m==="BUY"?b.buyScore-a.buyScore:b.sellScore-a.sellScore);
                setScreenResults(s);setScreenAI("");
              }}} style={{
                flex:1,padding:"9px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",
                background:screenMode===m?(m==="BUY"?C.green:C.red)+"22":C.surface,
                color:screenMode===m?(m==="BUY"?C.green:C.red):C.muted,
                border:`1px solid ${screenMode===m?(m==="BUY"?C.green:C.red):C.border}`,
              }}>{m==="BUY"?"📈 BUY Candidates":"📉 SELL Candidates"}</button>
            ))}
          </div>

          
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:12,color:C.muted,flexShrink:0}}>
              {screenMode==="BUY"?"💰 Deploy":"💵 Cash out"} S$
            </div>
            <input
              ref={budgetInputRef}
              type="number"
              placeholder={screenMode==="BUY"?"e.g. 50000":"e.g. 30000"}
              defaultValue={screenBudget}
              onBlur={e=>setScreenBudget(e.target.value)}
              key={screenMode}
              style={{
                flex:1,background:C.surface,border:`1px solid ${C.border}`,
                color:C.text,borderRadius:8,padding:"8px 12px",fontSize:13,
                outline:"none",WebkitAppearance:"none",MozAppearance:"textfield",
              }}
            />
            <div style={{fontSize:11,color:C.muted,flexShrink:0}}>SGD</div>
          </div>
          {budget>0&&<div style={{fontSize:11,color:modeColor,marginTop:5}}>
            {screenMode==="BUY"?`Allocating S$${budget.toLocaleString()} across top picks`:`Targeting S$${budget.toLocaleString()} cash-out`}
          </div>}
        </div>

        
        
        {!screenLastRun&&!screenLoading&&(
          <div style={{...card,textAlign:"center",padding:"36px 16px"}}>
            <div style={{fontSize:36,marginBottom:10}}>🎯</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Ready to screen</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:8}}>
              Choose BUY or SELL mode, set your target amount, then tap Run Screen.
            </div>
            <div style={{fontSize:12,color:C.muted}}>
              ⏱ Scans all {holdings.length} holdings — ~45–90s for full analysis
            </div>
          </div>
        )}

        
        {screenLoading&&(
          <div style={{...card,padding:"28px 16px"}}>
            <div style={{fontSize:13,color:modeColor,fontWeight:700,marginBottom:6}}>↻ Scanning {holdings.length} stocks — RSI · Fundamentals · Analyst · Insider · Senate...</div>
          </div>
        )}

        
        {(screenAI||screenAILoad)&&(
          <div style={{...card,background:"#080D18",border:`1px solid ${C.accent}30`,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:8}}>
              🤖 AI ALLOCATION RECOMMENDATION
            </div>
            {screenAILoad?(
              <div style={{fontSize:13,color:C.muted}}>↻ Generating allocation strategy...</div>
            ):(
              <div style={{fontSize:13,color:C.text,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{screenAI}</div>
            )}
          </div>
        )}

        
        {topResults.length>0&&!screenLoading&&(
          <>
            <div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
              Top {topResults.length} {screenMode==="BUY"?"Buy":"Sell"} Candidates · All {screenResults.length} holdings scored
            </div>
            {topResults.map((r,rank)=>{
              const score=screenMode==="BUY"?r.buyScore:r.sellScore;
              const signals=screenMode==="BUY"?r.buySignals:r.sellSignals;
              const scoreColor=score>=60?modeColor:score>=35?C.gold:C.muted;
              const scoreBar=Math.min(score,100);
              const sgdVal=toSGDlive(r.h.price*r.h.shares,r.h.mkt);
              const gainPct=r.gainPct;

              return(
                <div key={r.h.ticker}
                  onClick={()=>{setSel(r.h);setDetailPeriod("6m");}}
                  style={{...card,cursor:"pointer",marginBottom:10,
                    borderLeft:`4px solid ${scoreColor}`,
                    background:rank===0?scoreColor+"08":C.card,
                  }}>
                  
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.muted,width:18,textAlign:"center"}}>#{rank+1}</span>
                        <span style={{fontWeight:800,fontSize:17}}>{r.h.ticker}</span>
                        <Chip mkt={r.h.mkt}/>
                        {r.h.moat&&r.h.moat!=="None"&&<Bdg label={r.h.moat+" Moat"} bg={r.h.moat==="Wide"?"#1A2E1A":"#2A2A1A"} color={r.h.moat==="Wide"?C.green:C.gold}/>}
                        {r.insiderBuy&&<Bdg label="Insider Buy" bg={C.green+"18"} color={C.green}/>}
                        {r.senateBuy&&<Bdg label="Senate Buy" bg={C.accent+"18"} color={C.accent}/>}
                      </div>
                      <div style={{fontSize:12,color:C.muted,paddingLeft:24}}>{r.h.name?.slice(0,30)}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:22,fontWeight:900,color:scoreColor}}>{score}</div>
                      <div style={{fontSize:10,color:C.muted}}>/100 pts</div>
                    </div>
                  </div>

                  
                  <div style={{height:4,borderRadius:2,background:C.border,marginBottom:10,overflow:"hidden"}}>
                    <div style={{width:`${scoreBar}%`,height:"100%",background:scoreColor,borderRadius:2,transition:"width 0.5s"}}/>
                  </div>

                  
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"5px 8px",marginBottom:8}}>
                    <div style={mBox}>
                      <div style={{fontSize:10,color:C.muted}}>RSI-14</div>
                      <div style={{fontSize:13,fontWeight:700,
                        color:r.rsi<40?C.green:r.rsi>70?C.red:C.text
                      }}>{r.rsi}</div>
                    </div>
                    <div style={mBox}>
                      <div style={{fontSize:10,color:C.muted}}>{screenMode==="BUY"?"IV Upside":"Overvalued"}</div>
                      <div style={{fontSize:13,fontWeight:700,
                        color:screenMode==="BUY"?(r.upside>20?C.green:r.upside>0?C.gold:C.red):(r.overvalued>30?C.red:r.overvalued>0?C.gold:C.green)
                      }}>{screenMode==="BUY"?(r.upside>0?"+":"")+r.upside.toFixed(0):r.overvalued.toFixed(0)}%</div>
                    </div>
                    <div style={mBox}>
                      <div style={{fontSize:10,color:C.muted}}>Rev Growth</div>
                      <div style={{fontSize:13,fontWeight:700,
                        color:r.revGrowth===null?C.border:r.revGrowth>10?C.green:r.revGrowth>0?C.gold:C.red
                      }}>{r.revGrowth!==null?r.revGrowth.toFixed(0)+"%":"—"}</div>
                    </div>
                    <div style={mBox}>
                      <div style={{fontSize:10,color:C.muted}}>My Gain</div>
                      <div style={{fontSize:13,fontWeight:700,
                        color:gainPct>=0?C.green:C.red
                      }}>{gainPct>=0?"+":""}{gainPct.toFixed(0)}%</div>
                    </div>
                  </div>

                  
                  {signals.length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
                      {signals.map((sig,si)=>(
                        <div key={si} style={{
                          fontSize:10,padding:"2px 7px",borderRadius:5,
                          background:strengthCol(sig.strength)+"18",
                          color:strengthCol(sig.strength),fontWeight:600,
                          border:`1px solid ${strengthCol(sig.strength)}30`,
                        }}>{sig.label} <span style={{opacity:0.7}}>+{sig.pts}</span></div>
                      ))}
                    </div>
                  )}
                  {signals.length===0&&(
                    <div style={{fontSize:12,color:C.muted}}>No strong {screenMode.toLowerCase()} signals detected</div>
                  )}

                  
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:2}}>
                    <span>Position: {fmtS(sgdVal)}</span>
                    <span>{fmtL(r.h.price,r.h.mkt)} · avg cost {fmtL(r.h.avgCost,r.h.mkt)}</span>
                    <span style={{color:C.muted,fontSize:10}}>Tap to open →</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </>
    );
  }

  function AlertsView(){
    const SEV_META={
      high:  {col:C.red,   bg:C.red+"14",   icon:"🔴",label:"HIGH"},
      medium:{col:C.gold,  bg:C.gold+"14",  icon:"🟡",label:"MEDIUM"},
      low:   {col:C.accent,bg:C.accent+"14",icon:"🔵",label:"LOW"},
    };
    const TYPE_META={
      INSIDER_BUY:  {icon:"🏦",label:"Insider Buying",   col:C.green},
      SHORT_SQUEEZE:{icon:"🌀",label:"Short Squeeze Risk",col:C.gold},
      VOLUME_SPIKE: {icon:"📈",label:"Volume Spike",      col:C.accent},
    };
    const highCount=alertData.filter(a=>a.severity==="high").length;
    const hasSenate=senateData.length>0;

    const parseAmt=s=>{
      const m=(s.amount||"").match(/\$([\d,]+)\s*$/);
      return m?parseInt(m[1].replace(/,/g,""),10):0;
    };
    const senateBuys=senateData
      .filter((s,i,arr)=>arr.findIndex(x=>x.ticker===s.ticker&&x.name===s.name&&x.action===s.action&&x.date===s.date)===i)
      .sort((a,b)=>parseAmt(b)-parseAmt(a))  // largest purchase first
      .slice(0,10);

    return(
      <>
        {/* Header card */}
        <div style={{...card,background:"#0D1A0D",border:`1px solid ${C.green}30`,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:C.green,letterSpacing:"0.08em",marginBottom:3}}>
                🔔 MARKET INTELLIGENCE
              </div>
              <div style={{fontSize:14,color:C.muted,lineHeight:1.5}}>
                Insider buys · Short squeeze risk · Volume anomalies · Senate signals
              </div>
              {alertLastRun&&(
                <div style={{fontSize:13,color:C.muted,marginTop:4}}>
                  Last scanned: {alertLastRun.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"})}
                  {" · "}{alertData.length} alert{alertData.length!==1?"s":""} found
                </div>
              )}
            </div>
            <button
              onClick={fetchAlerts}
              disabled={alertLoading}
              style={{
                padding:"8px 14px",borderRadius:9,border:`1px solid ${C.green}66`,
                background:alertLoading?C.surface:C.green+"18",
                color:alertLoading?C.muted:C.green,
                fontSize:14,fontWeight:700,cursor:alertLoading?"not-allowed":"pointer",
                flexShrink:0,whiteSpace:"nowrap",
              }}
            >
              {alertLoading?"↻ Scanning...":"🔍 Scan Now"}
            </button>
          </div>
          {highCount>0&&(
            <div style={{marginTop:10,padding:"6px 10px",background:C.red+"18",border:`1px solid ${C.red}44`,borderRadius:7,fontSize:14,color:C.red,fontWeight:700}}>
              ⚠ {highCount} HIGH severity alert{highCount>1?"s":""} require your attention
            </div>
          )}
        </div>

        {/* Not yet scanned state */}
        {!alertLastRun&&!alertLoading&&(
          <div style={{...card,textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:34,marginBottom:8}}>🔍</div>
            <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>No scan run yet</div>
            <div style={{fontSize:14,color:C.muted,marginBottom:16}}>
              Tap "Scan Now" to check your {holdings.length} holdings for insider activity,
              short squeeze risk, and unusual volume across all markets.
            </div>
            <div style={{fontSize:13,color:C.muted}}>
              ⏱ Scan takes ~30-60s for {holdings.length} stocks
            </div>
          </div>
        )}

        {/* Loading state */}
        {alertLoading&&(
          <div style={{...card,textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:14,color:C.gold,animation:"pulse 1s ease-in-out infinite",marginBottom:8}}>
              ↻ Scanning {holdings.filter(h=>h.mkt==="US").length} US stocks via Finnhub...
            </div>
            <div style={{fontSize:13,color:C.muted,marginBottom:4}}>
              Checking insider filings · short interest · volume anomalies
            </div>
            <div style={{fontSize:13,color:C.muted}}>
              Also checking {holdings.filter(h=>h.mkt!=="US").length} non-US stocks via Yahoo Finance
            </div>
          </div>
        )}

        {/* Clean scan result */}
        {alertLastRun&&!alertLoading&&alertData.length===0&&(
          <div style={{...card,textAlign:"center",padding:"28px 16px",background:"#0D1A0D",border:`1px solid ${C.green}30`}}>
            <div style={{fontSize:30,marginBottom:6}}>✅</div>
            <div style={{fontSize:16,fontWeight:700,color:C.green,marginBottom:4}}>All Clear</div>
            <div style={{fontSize:14,color:C.muted}}>
              No unusual insider activity, short squeeze risk, or volume spikes detected
              in your portfolio at this time.
            </div>
          </div>
        )}

        {/* Alert cards */}
        {alertData.length>0&&(
          <>
            <div style={{fontSize:14,fontWeight:700,color:C.muted,letterSpacing:"0.08em",marginBottom:8,textTransform:"uppercase"}}>
              {alertData.length} Alert{alertData.length!==1?"s":" "} Detected
            </div>
            {alertData.map((a,i)=>{
              const sev=SEV_META[a.severity]||SEV_META.low;
              const typ=TYPE_META[a.type]||{icon:"⚡",label:a.type,col:C.accent};
              const h=holdings.find(hh=>hh.ticker===a.ticker);
              const gainPct=h?((h.price-h.avgCost)/h.avgCost)*100:null;
              return(
                <div key={i} onClick={()=>{if(h){setSel(h);setDetailPeriod("6m");}}}
                  style={{
                    ...card,
                    borderLeft:`4px solid ${sev.col}`,
                    background:sev.bg,
                    cursor:h?"pointer":"default",
                    marginBottom:10,
                  }}>
                  {/* Alert header row */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:18}}>{typ.icon}</span>
                      <div>
                        <div style={{fontSize:15,fontWeight:800,color:sev.col}}>{a.title}</div>
                        <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                          <span style={{fontSize:13,fontWeight:700,padding:"1px 6px",borderRadius:3,
                            background:sev.col+"25",color:sev.col}}>{sev.icon} {sev.label}</span>
                          <span style={{fontSize:13,color:C.muted,fontWeight:700}}>{typ.label}</span>
                          {h&&<Chip mkt={h.mkt}/>}
                        </div>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      {h&&(
                        <>
                          <div style={{fontSize:14,fontWeight:700}}>{fmtL(h.price,h.mkt)}</div>
                          <div style={{fontSize:13,fontWeight:700,color:gainPct>=0?C.green:C.red}}>
                            {gainPct>=0?"+":""}{fmt(gainPct,1)}% gain
                          </div>
                        </>
                      )}
                      <div style={{fontSize:13,color:C.muted,marginTop:2}}>{a.date}</div>
                    </div>
                  </div>

                  {/* Detail text */}
                  <div style={{fontSize:14,color:C.text,marginBottom:6,lineHeight:1.5}}>{a.detail}</div>

                  {/* Type-specific extras */}
                  {a.type==="INSIDER_BUY"&&a.who&&(
                    <div style={{fontSize:14,color:C.muted,background:C.surface,borderRadius:5,padding:"4px 8px"}}>
                      👤 {a.who}
                      {a.value>0&&<span style={{marginLeft:8,color:C.gold,fontWeight:700}}>~${fmt(a.value,0)} total</span>}
                    </div>
                  )}
                  {a.type==="SHORT_SQUEEZE"&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:4}}>
                      <div style={{background:C.surface,borderRadius:5,padding:"4px 8px",textAlign:"center"}}>
                        <div style={{fontSize:12,color:C.muted}}>Short Float</div>
                        <div style={{fontSize:15,fontWeight:800,color:C.red}}>{fmt(a.shortPct,1)}%</div>
                      </div>
                      <div style={{background:C.surface,borderRadius:5,padding:"4px 8px",textAlign:"center"}}>
                        <div style={{fontSize:12,color:C.muted}}>Days to Cover</div>
                        <div style={{fontSize:15,fontWeight:800,color:C.gold}}>{fmt(a.shortRatio,1)}</div>
                      </div>
                      <div style={{background:C.surface,borderRadius:5,padding:"4px 8px",textAlign:"center"}}>
                        <div style={{fontSize:12,color:C.muted}}>Off 52w Low</div>
                        <div style={{fontSize:15,fontWeight:800,color:C.green}}>+{fmt(a.pctFrom52wLow,0)}%</div>
                      </div>
                    </div>
                  )}
                  {a.type==="VOLUME_SPIKE"&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:4}}>
                      <div style={{background:C.surface,borderRadius:5,padding:"4px 8px",textAlign:"center"}}>
                        <div style={{fontSize:12,color:C.muted}}>Volume Multiple</div>
                        <div style={{fontSize:15,fontWeight:800,color:C.accent}}>{fmt(a.volMultiple,1)}×</div>
                      </div>
                      <div style={{background:C.surface,borderRadius:5,padding:"4px 8px",textAlign:"center"}}>
                        <div style={{fontSize:12,color:C.muted}}>Price Move</div>
                        <div style={{fontSize:15,fontWeight:800,color:a.chg1d>=0?C.green:C.red}}>
                          {a.chg1d>=0?"+":""}{fmt(a.chg1d,1)}%
                        </div>
                      </div>
                    </div>
                  )}
                  {h&&<div style={{fontSize:12,color:C.muted,marginTop:6,textAlign:"right"}}>Tap to open {a.ticker} →</div>}
                </div>
              );
            })}
          </>
        )}

        {/* Senate Signal section — always shown if data exists */}
        {hasSenate&&(
          <div style={card}>
            <div style={{...cardT,display:"flex",alignItems:"center",gap:6}}>
              <span>🏛</span> Senate Trades (Top 10 by Size)
            </div>
            <div style={{fontSize:13,color:C.muted,marginBottom:10,lineHeight:1.5}}>
              Top 10 largest Congress trades by purchase size. Congress must disclose within 30-45 days per STOCK Act. Stocks in your portfolio highlighted.
            </div>
            {senateBuys.length===0&&(
              <div style={{fontSize:14,color:C.muted,textAlign:"center",padding:"12px 0"}}>
                No recent senate buys overlap with your holdings
              </div>
            )}
            {senateBuys.map((s,i)=>{
              const inPort=holdings.find(h=>h.ticker===s.ticker);
              const extPrice=senatePrices[s.ticker];
              const livePrice=inPort?inPort.price:(extPrice?.price||s.priceNow||0);
              const compIV=valuations[s.ticker]?.valuations?.average||0;
              const intrinsic=compIV>0?compIV:(inPort?inPort.intrinsic:(extPrice?.intrinsic||0));
              const avgCost=inPort?inPort.avgCost:0;
              const mkt=inPort?inPort.mkt:"US";
              const histKey=s.ticker+"_"+s.date;
              const histPrice=senateHistPrices[histKey];
              if(histPrice===undefined) fetchSenateHistPrice(s.ticker,s.date);
              const pricePaid=histPrice||0;
              const vsNow=pricePaid>0&&livePrice>0?((livePrice-pricePaid)/pricePaid*100):null;
              const gainPct=avgCost>0?((livePrice-avgCost)/avgCost*100):null;
              const upside=intrinsic>0&&livePrice>0?((intrinsic-livePrice)/livePrice*100):null;
              return(
                <div key={i} style={{marginBottom:14,paddingBottom:14,borderBottom:i<senateBuys.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{...row,marginBottom:6}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <span style={{fontWeight:700,fontSize:16}}>{s.name}</span>
                        <Bdg label={s.party} bg={s.party==="D"?"#1e3a5f":"#3d1515"} color={s.party==="D"?"#60a5fa":"#f87171"}/>
                        {inPort&&<span style={{fontSize:12,color:C.accent,fontWeight:700,padding:"1px 5px",borderRadius:3,background:C.accent+"18"}}>IN PORTFOLIO</span>}
                      </div>
                      <div style={{fontSize:14,color:C.muted}}>{s.date} · {s.sector}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end",marginBottom:2}}>
                        <span style={{fontWeight:800,fontSize:17}}>{s.ticker}</span>
                        <Bdg label={s.action} bg={s.action==="BUY"?C.green+"22":C.red+"22"} color={s.action==="BUY"?C.green:C.red}/>
                      </div>
                      <div style={{fontSize:14,color:C.gold,fontWeight:600}}>{s.amount}</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:4,background:inPort?C.accent+"0D":C.surface,borderRadius:7,padding:"7px 10px",border:inPort?`1px solid ${C.accent}22`:"none"}}>
                    <div>
                      <div style={{fontSize:12,color:C.gold,fontWeight:700}}>Sen. Paid</div>
                      <div style={{fontSize:14,fontWeight:700,color:pricePaid>0?C.gold:C.border}}>{pricePaid>0?("$"+fmt(pricePaid)):"…"}</div>
                      <div style={{fontSize:12,color:C.muted}}>on {s.date?.slice(5)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:12,color:C.muted}}>Live Price</div>
                      <div style={{fontSize:14,fontWeight:700}}>{livePrice>0?fmtL(livePrice,mkt):"—"}</div>
                      {vsNow!=null&&<div style={{fontSize:12,fontWeight:700,color:vsNow>=0?C.green:C.red}}>{vsNow>=0?"+":""}{fmt(vsNow,1)}% since</div>}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:12,color:C.muted}}>Avg Cost</div>
                      <div style={{fontSize:14,fontWeight:700,color:avgCost>0?C.mutedLight:C.border}}>{avgCost>0?fmtL(avgCost,mkt):"—"}</div>
                      {gainPct!=null&&<div style={{fontSize:12,fontWeight:700,color:gainPct>=0?C.green:C.red}}>{gainPct>=0?"+":""}{fmt(gainPct,1)}%</div>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:12,color:C.muted}}>{inPort?"Intrinsic":"Graham №"}</div>
                      <div style={{fontSize:14,fontWeight:700,color:upside!=null?(upside>=0?C.green:C.red):C.border}}>{intrinsic>0?fmtL(intrinsic,mkt):"—"}</div>
                      {upside!=null&&<div style={{fontSize:12,fontWeight:700,color:upside>=0?C.green:C.red}}>{upside>=0?"+":""}{fmt(upside,1)}% up</div>}
                    </div>
                  </div>
                  {inPort&&<div style={{fontSize:12,color:C.muted,marginTop:4,textAlign:"right",cursor:"pointer"}} onClick={()=>{setSel(inPort);setDetailPeriod("6m");}}>Tap to open {s.ticker} →</div>}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ── RECONCILIATION VIEW ──────────────────────────────────────────────────────
  function ReconciliationView(){
    // reconFilter, expandedTicker, fixing, fixed lifted to App level

    // ── Simulate WAVG per ticker from trades ─────────────────────────────────
    // Plain computation — useMemo invalid in render functions
    const reconData=(()=>{
      // Build per-ticker trade history.
      // DETERMINISTIC ORDER: date ASC, then acquisitions (BUY/SCRIP) before
      // disposals (SELL) on the same day, then id. Without an explicit tie-break
      // the result depended on DB row order and flickered between sessions
      // (e.g. AMAT/TMUS/O39.SI/3033.HK flipped mismatch<->OK). Buys must settle
      // before same-day sells can draw them down — basic accounting order.
      const _typeRank=t=>(t.type==="BUY"||t.type==="SCRIP"||t.type==="TRANSFER_IN")?0:(t.type==="SELL"?1:2);
      const byTicker={};
      [...trades].sort((a,b)=>{
        const d=(a.date||"").localeCompare(b.date||"");
        if(d!==0) return d;
        const r=_typeRank(a)-_typeRank(b);
        if(r!==0) return r;
        return (a.id||0)-(b.id||0);
      }).forEach(t=>{
        if(!byTicker[t.ticker]) byTicker[t.ticker]=[];
        byTicker[t.ticker].push(t);
      });

      return holdings.map(h=>{
        const tradeList=byTicker[h.ticker]||[];
        const hasTrades=tradeList.length>0;

        // Run WAVG simulation
        // BUY and TRANSFER_IN add to position at cost; SCRIP adds shares at zero cost
        // (dilutes avg); SELL subtracts. DIV and ROC are income events (shares=1
        // convention) and must NOT change share count.
        let runShares=0, runAvg=0;
        let clampHit=false; // a SELL exceeded shares-on-hand => position predates trade log
        const annotated=tradeList.map(t=>{
          if(t.type==="BUY"||t.type==="TRANSFER_IN"){
            // Both are real acquisitions at cost — same WAVG treatment.
            runAvg=(runShares*runAvg+t.shares*t.price)/(runShares+t.shares);
            runShares+=t.shares;
          } else if(t.type==="SCRIP"){
            // Stock dividend / split: adds shares at zero cost, so the weighted
            // average cost is DILUTED across the larger base (total cost unchanged).
            // (Previously avg was left untouched, leaving it overstated — e.g. BKNG
            //  showed calc avg 2034.10 vs correct 81.36 after a 3->75 share scrip.)
            if(runShares+t.shares>0) runAvg=(runShares*runAvg)/(runShares+t.shares);
            runShares+=t.shares;
          } else if(t.type==="SELL"){
            if(t.shares>runShares+0.001) clampHit=true; // selling more than recorded
            runShares=Math.max(0,runShares-t.shares);
            // avg cost unchanged after sell (WAVG method)
          }
          // DIV and ROC: income only — share balance unchanged
          return{...t,_runShares:runShares,_runAvg:parseFloat(runAvg.toFixed(4))};
        });

        const calcShares=runShares;
        const calcAvg=parseFloat(runAvg.toFixed(4));

        const sharesMismatch=hasTrades&&Math.abs(h.shares-calcShares)>0.001;
        // Relative tolerance (~0.5%, floor 0.01) so rounding + embedded brokerage
        // commission on high-priced names (e.g. AZO ~$3,700) don't false-flag.
        const avgTol=Math.max(0.01,(h.avgCost||0)*0.005);
        const avgMismatch=hasTrades&&h.avgCost>0&&calcAvg>0&&Math.abs(h.avgCost-calcAvg)>avgTol;
        // A clamp means a SELL exceeded shares-on-hand: the opening lot predates the
        // recorded trade history, so calc CANNOT reconcile and is NOT authoritative.
        // Flag it honestly and do NOT offer to overwrite the stored (DBS) value.
        const missingOpeningLot=sharesMismatch&&clampHit;
        // Genuine, fixable share-count error: mismatch with a complete trade history.
        const sharesFixable=sharesMismatch&&!missingOpeningLot;
        const hasMismatch=sharesMismatch;
        const avgOnlyDiscrepancy=!sharesMismatch&&avgMismatch;

        return{
          h,
          tradeList:annotated,
          hasTrades,
          calcShares,
          calcAvg,
          sharesMismatch,
          avgMismatch,
          hasMismatch,
          avgOnlyDiscrepancy,
          missingOpeningLot,
          sharesFixable,
        };
      }).sort((a,b)=>{
        // Share mismatches first, then avg discrepancies, then no-trades, then OK
        if(a.hasMismatch&&!b.hasMismatch) return -1;
        if(!a.hasMismatch&&b.hasMismatch) return 1;
        if(a.avgOnlyDiscrepancy&&!b.avgOnlyDiscrepancy) return -1;
        if(!a.avgOnlyDiscrepancy&&b.avgOnlyDiscrepancy) return 1;
        if(!a.hasTrades&&b.hasTrades) return -1;
        if(a.hasTrades&&!b.hasTrades) return 1;
        return a.h.ticker.localeCompare(b.h.ticker);
      });
    })();

    const mismatchCount=reconData.filter(r=>r.hasMismatch).length;
    const avgDiffCount=reconData.filter(r=>r.avgOnlyDiscrepancy).length;
    const noTradeCount=reconData.filter(r=>!r.hasTrades).length;
    const okCount=reconData.filter(r=>r.hasTrades&&!r.hasMismatch&&!r.avgOnlyDiscrepancy).length;

    const displayed=reconData.filter(r=>{
      if(reconFilter==="mismatch") return r.hasMismatch;
      if(reconFilter==="avgdiff") return r.avgOnlyDiscrepancy;
      if(reconFilter==="notrade") return !r.hasTrades;
      if(reconFilter==="ok") return r.hasTrades&&!r.hasMismatch&&!r.avgOnlyDiscrepancy;
      return true;
    });

    async function applyFix(r){
      setFixing(p=>({...p,[r.h.ticker]:true}));
      const updated=holdings.map(h=>
        h.ticker===r.h.ticker
          ?{...h,shares:r.calcShares,avgCost:r.calcAvg,
            fullySold:r.calcShares<=0,
            ...(r.calcShares<=0?{avgCost:0}:{})}
          :h
      );
      setHoldings(updated);
      if(window.portfolioDB){
        try{ await window.portfolioDB.updateHoldings(updated); }
        catch(e){ console.error('[recon] DB fix failed:',e); }
      }
      setFixed(p=>({...p,[r.h.ticker]:true}));
      setFixing(p=>({...p,[r.h.ticker]:false}));
    }

    const PILL_ACTIVE={padding:"6px 12px",borderRadius:16,fontSize:13,fontWeight:700,
      background:C.accent,color:"#000",border:`1px solid ${C.accent}`,cursor:"pointer"};
    const PILL_IDLE={padding:"6px 12px",borderRadius:16,fontSize:13,fontWeight:500,
      background:"transparent",color:C.muted,border:`1px solid ${C.border}`,cursor:"pointer"};

    return(
      <>
        {/* Header */}
        <div style={{...card,background:"#0A1020",border:`1px solid ${C.accent}30`,marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:C.accent,marginBottom:6}}>🔍 PORTFOLIO AUDIT</div>
          <div style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:10}}>
            Compares stored holdings against trade records. Runs a full WAVG simulation per ticker.
            Tap any row to inspect all trades. Approve fixes one by one.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,textAlign:"center"}}>
            <div style={{background:C.red+"18",borderRadius:8,padding:"8px 4px"}}>
              <div style={{fontSize:22,fontWeight:800,color:C.red}}>{mismatchCount}</div>
              <div style={{fontSize:12,color:C.muted}}>Share Mismatches</div>
            </div>
            <div style={{background:C.accent+"18",borderRadius:8,padding:"8px 4px"}}>
              <div style={{fontSize:22,fontWeight:800,color:C.accent}}>{avgDiffCount}</div>
              <div style={{fontSize:12,color:C.muted}}>Avg Discrepancies</div>
            </div>
            <div style={{background:C.gold+"18",borderRadius:8,padding:"8px 4px"}}>
              <div style={{fontSize:22,fontWeight:800,color:C.gold}}>{noTradeCount}</div>
              <div style={{fontSize:12,color:C.muted}}>No Trades</div>
            </div>
            <div style={{background:C.green+"18",borderRadius:8,padding:"8px 4px"}}>
              <div style={{fontSize:22,fontWeight:800,color:C.green}}>{okCount}</div>
              <div style={{fontSize:12,color:C.muted}}>OK</div>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto"}}>
          {[["all","All",""],["mismatch","❌ Shares",C.red],["avgdiff","ℹ Avg Diff",C.accent],["notrade","⚠ No Trades",C.gold],["ok","✅ OK",C.green]].map(([key,label,col])=>(
            <button key={key} onClick={()=>setReconFilter(key)}
              style={reconFilter===key
                ?{...PILL_ACTIVE,...(col?{background:col+"22",color:col,borderColor:col}:{})}
                :PILL_IDLE}>
              {label}
            </button>
          ))}
        </div>

        {/* Per-ticker rows */}
        {displayed.map(r=>{
          const isExpanded=expandedTicker===r.h.ticker;
          const isFixed=fixed[r.h.ticker];
          const isFix=fixing[r.h.ticker];
          const status=isFixed?"fixed":r.missingOpeningLot?"openlot":r.sharesMismatch?"mismatch":r.avgOnlyDiscrepancy?"avgdiff":!r.hasTrades?"notrade":"ok";
          const borderCol=status==="mismatch"?C.red:status==="openlot"?C.gold:status==="avgdiff"?C.accent:status==="notrade"?C.gold:status==="fixed"?C.green:C.border;

          return(
            <div key={r.h.ticker} style={{...card,borderLeft:`4px solid ${borderCol}`,marginBottom:8}}>
              {/* Header row — tap to expand */}
              <div style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}
                onClick={()=>setExpandedTicker(isExpanded?null:r.h.ticker)}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                    <span style={{fontWeight:800,fontSize:16}}>{r.h.ticker}</span>
                    <Chip mkt={r.h.mkt}/>
                    {status==="mismatch"&&<span style={{fontSize:12,color:C.red,fontWeight:700,background:C.red+"15",padding:"1px 6px",borderRadius:4}}>❌ MISMATCH</span>}
                    {status==="openlot"&&<span style={{fontSize:12,color:C.gold,fontWeight:700,background:C.gold+"15",padding:"1px 6px",borderRadius:4}}>⚠ PRE-LOG LOT</span>}
                    {status==="avgdiff"&&<span style={{fontSize:12,color:C.accent,fontWeight:700,background:C.accent+"15",padding:"1px 6px",borderRadius:4}}>ℹ AVG DIFF</span>}
                    {status==="notrade"&&<span style={{fontSize:12,color:C.gold,fontWeight:700,background:C.gold+"15",padding:"1px 6px",borderRadius:4}}>⚠ NO TRADES</span>}
                    {status==="ok"&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>✅</span>}
                    {status==="fixed"&&<span style={{fontSize:12,color:C.green,fontWeight:700,background:C.green+"15",padding:"1px 6px",borderRadius:4}}>✅ FIXED</span>}
                  </div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:220}}>{r.h.name}</div>
                  {/* Side-by-side comparison */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 10px",fontSize:12}}>
                    <div>
                      <div style={{color:C.muted,marginBottom:1}}>Stored shares</div>
                      <div style={{fontWeight:700,color:r.sharesMismatch?C.red:C.text}}>{r.h.shares.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{color:C.muted,marginBottom:1}}>Calc. shares</div>
                      <div style={{fontWeight:700,color:r.sharesMismatch?C.green:C.text}}>
                        {r.hasTrades?r.calcShares.toLocaleString():"—"}
                      </div>
                    </div>
                    <div>
                      <div style={{color:C.muted,marginBottom:1}}>Stored avg cost</div>
                      <div style={{fontWeight:700,color:r.sharesMismatch&&r.avgMismatch?C.red:C.text}}>{fmtL(r.h.avgCost,r.h.mkt)}</div>
                    </div>
                    <div>
                      <div style={{color:C.muted,marginBottom:1}}>Calc. avg cost</div>
                      <div style={{fontWeight:700,color:r.sharesMismatch&&r.avgMismatch?C.green:C.muted}}>
                        {r.hasTrades?fmtL(r.calcAvg,r.h.mkt):"—"}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0,marginLeft:10}}>
                  <span style={{fontSize:18,color:C.muted}}>{isExpanded?"▲":"▼"}</span>
                  <div style={{fontSize:12,color:C.muted}}>{r.tradeList.length} trade{r.tradeList.length!==1?"s":""}</div>
                </div>
              </div>

              {/* Fix button — only for genuine, COMPLETE-history share mismatches.
                  Suppressed for missingOpeningLot: calc under-counts because the
                  opening purchase predates the trade log, so the stored value is
                  the authoritative one and must NOT be overwritten. */}
              {r.sharesFixable&&!isFixed&&(
                <div style={{marginTop:10}} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>applyFix(r)} disabled={isFix} style={{
                    width:"100%",padding:"10px",borderRadius:8,border:`1px solid ${C.green}`,
                    background:isFix?C.surface:C.green+"18",
                    color:isFix?C.muted:C.green,fontSize:13,fontWeight:700,
                    cursor:isFix?"not-allowed":"pointer",
                  }}>
                    {isFix?"Applying fix...":"✅ Apply Fix — set shares="+r.calcShares+" avg="+fmtL(r.calcAvg,r.h.mkt)}
                  </button>
                </div>
              )}
              {/* Note for pre-log opening lots — stored DBS value is authoritative */}
              {r.missingOpeningLot&&!isFixed&&(
                <div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:C.gold+"10",border:`1px solid ${C.gold}30`}}>
                  <div style={{fontSize:12,color:C.gold,fontWeight:700,marginBottom:2}}>⚠ Opening lot predates trade log</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>
                    A recorded sell exceeds the shares the trade history can account for, so the opening purchase happened before the log begins. The calculated figure under-counts and is NOT authoritative — the stored DBS value is. No auto-fix offered; reconcile against the bank statement to backfill the opening lot.
                  </div>
                </div>
              )}
              {/* Info note for avg-only discrepancies — stored DBS value is authoritative */}
              {r.avgOnlyDiscrepancy&&!isFixed&&(
                <div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:C.accent+"10",border:`1px solid ${C.accent}30`}}>
                  <div style={{fontSize:12,color:C.accent,fontWeight:700,marginBottom:2}}>ℹ Avg cost note</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>
                    Stored value ({fmtL(r.h.avgCost,r.h.mkt)}) is the authoritative DBS cost basis. Trade history is supplementary and may not reflect all historical purchases. No fix needed.
                  </div>
                </div>
              )}

              {/* Expanded trade list */}
              {isExpanded&&(
                <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                  {r.tradeList.length===0?(
                    <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"8px 0"}}>
                      No trade records found for this stock. Holdings were entered manually.
                    </div>
                  ):(()=>{
                    // DIV and ROC are income-only events stored with shares=1 by convention.
                    // They do NOT affect share count (excluded from WAVG simulation) and
                    // are noise in the mismatch trade list. Only show BUY/SELL/SCRIP here.
                    const displayTrades=r.tradeList.filter(t=>t.type!=="DIV"&&t.type!=="ROC");
                    const hiddenIncomeCount=r.tradeList.length-displayTrades.length;
                    return(
                    <>
                      {/* Column headers */}
                      <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr 50px 40px 50px",gap:"2px 6px",fontSize:11,
                        color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",
                        marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>
                        <div>Date</div>
                        <div>Price</div>
                        <div>Qty</div>
                        <div>Ccy</div>
                        <div>Mkt</div>
                        <div style={{textAlign:"right"}}>Bal.</div>
                      </div>
                      {displayTrades.map((t,i)=>(
                        <div key={t.id||i} style={{
                          display:"grid",gridTemplateColumns:"80px 1fr 1fr 50px 40px 50px",
                          gap:"2px 6px",fontSize:13,
                          padding:"5px 0",
                          borderBottom:i<displayTrades.length-1?`1px solid ${C.border}22`:"none",
                          background:t.type==="BUY"?C.green+"05":t.type==="SCRIP"?C.accent+"05":C.red+"05",
                        }}>
                          <div style={{color:C.muted,fontSize:12}}>{t.date}</div>
                          <div style={{fontWeight:700,color:t.type==="BUY"?C.green:t.type==="SCRIP"?C.accent:C.red}}>
                            {t.type==="BUY"?"+":t.type==="SCRIP"?"↑":"-"}{fmtL(t.price,t.mkt)}
                          </div>
                          <div style={{fontWeight:600}}>{t.shares.toLocaleString()}</div>
                          <div style={{fontSize:12,color:C.muted}}>{t.ccy||"—"}</div>
                          <div style={{fontSize:12,color:C.muted}}>{t.mkt||"—"}</div>
                          <div style={{textAlign:"right",fontSize:12,color:C.mutedLight,fontWeight:600}}>
                            {t._runShares.toLocaleString()}
                          </div>
                        </div>
                      ))}
                      {hiddenIncomeCount>0&&(
                        <div style={{fontSize:11,color:C.muted,fontStyle:"italic",marginTop:4,paddingTop:4,borderTop:`1px dashed ${C.border}44`}}>
                          💵 {hiddenIncomeCount} income event{hiddenIncomeCount>1?"s":""} (DIV/ROC) hidden — not relevant to share count
                        </div>
                      )}
                      {/* Running balance footer */}
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,
                        padding:"6px 8px",background:C.surface,borderRadius:6,fontSize:12}}>
                        <span style={{color:C.muted}}>Final balance from trades:</span>
                        <span style={{fontWeight:700,color:r.calcShares>0?C.text:C.muted}}>
                          {r.calcShares.toLocaleString()} sh @ {fmtL(r.calcAvg,r.h.mkt)} avg
                        </span>
                      </div>
                    </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {displayed.length===0&&(
          <div style={{...card,textAlign:"center",padding:"32px 16px"}}>
            <div style={{fontSize:28,marginBottom:8}}>✅</div>
            <div style={{fontSize:15,fontWeight:700}}>All holdings match trade records</div>
          </div>
        )}
      </>
    );
  }

  function SummaryView(){
    return(
      <>
        {/* Export button */}
        <button onClick={exportToExcel} disabled={exporting} style={{
          width:'100%',padding:'12px',borderRadius:10,border:'none',
          background:exporting?C.border:`linear-gradient(135deg,#1A7A4A,#00D4FF22)`,
          borderColor:C.green,borderWidth:1,borderStyle:'solid',
          color:exporting?C.muted:C.green,fontSize:16,fontWeight:700,
          cursor:exporting?'not-allowed':'pointer',marginBottom:12,
          display:'flex',alignItems:'center',justifyContent:'center',gap:8,
        }}>
          {exporting
            ? <><span style={{animation:'spin 1s linear infinite',display:'inline-block'}}>↻</span> Generating Excel...</>
            : <>📊 Export Holdings to Excel</>
          }
        </button>
        <div style={card}>
          <div style={cardT}>Portfolio Overview (SGD)</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div style={sbox(C.accent)}><div style={{fontSize:13,color:C.muted}}>Total Value</div><div style={{fontSize:20,fontWeight:800}}>{fmtS(totalValSGD)}</div><div style={{fontSize:13,color:C.muted}}>{holdings.filter(h=>Number(h.shares)>0).length} stocks</div></div>
            <div style={sbox()}><div style={{fontSize:13,color:C.muted}}>Total Cost</div><div style={{fontSize:20,fontWeight:800}}>{fmtS(totalCostSGD)}</div></div>
            <div style={sbox(unrealSGD>=0?C.green:C.red)}><div style={{fontSize:13,color:C.muted}}>Unrealized P&amp;L</div><div style={{fontSize:18,fontWeight:800,color:unrealSGD>=0?C.green:C.red}}>{unrealSGD>=0?"+":"-"}{fmtS(Math.abs(unrealSGD))}</div><div style={{fontSize:14,fontWeight:700,color:unrealSGD>=0?C.green:C.red}}>{fmtPct(unrealPct)}</div></div>
            <div style={sbox(realizedSGD>=0?C.gold:C.red)}><div style={{fontSize:13,color:C.muted}}>Realized P&amp;L</div><div style={{fontSize:18,fontWeight:800,color:realizedSGD>=0?C.gold:C.red}}>{realizedSGD>=0?"+":"-"}{fmtS(Math.abs(realizedSGD))}</div><div style={{fontSize:13,color:C.muted}}>Closed trades</div></div>
            <div style={{...sbox(C.purple),textAlign:"center"}}><div style={{fontSize:13,color:C.muted}}>Stocks</div><div style={{fontSize:24,fontWeight:800,color:C.purple}}>{holdings.filter(h=>Number(h.shares)>0).length}</div></div>
            <div style={{...sbox(C.gold),textAlign:"center"}}><div style={{fontSize:13,color:C.muted}}>Annual Div</div><div style={{fontSize:17,fontWeight:800,color:C.gold}}>{fmtS(totalDivSGD)}</div><div style={{fontSize:13,color:C.muted}}>{fmt(totalValSGD?totalDivSGD/totalValSGD*100:0)}% yield</div></div>
          </div>
        </div>
        <div style={card}>
          <div style={cardT}>Market Exposure — All Countries</div>
          {[...new Set(holdings.map(h=>h.mkt))].map((mktKey,i)=>{
            const m=MKT[mktKey]||MKT.US;
            const col=[C.accent,C.green,C.gold,C.purple,C.red,"#FF8C42","#62D2E8"][i%7];
            const mktHoldings=holdings.filter(h=>h.mkt===mktKey&&Number(h.shares)>0);
            const localVal=mktHoldings.reduce((s,h)=>s+h.price*h.shares,0);
            const sgdVal=mktHoldings.reduce((s,h)=>s+toSGDlive(h.price*h.shares,h.mkt),0);
            const sgdCost=mktHoldings.reduce((s,h)=>s+toSGDlive(h.avgCost*h.shares,h.mkt),0);
            const pnl=sgdVal-sgdCost;
            const pnlPct=sgdCost?(pnl/sgdCost)*100:0;
            const pct=totalValSGD?(sgdVal/totalValSGD)*100:0;
            return(
              <div key={mktKey} style={{marginBottom:12,paddingBottom:12,borderBottom:i<[...new Set(holdings.map(h=>h.mkt))].length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:10,height:10,borderRadius:5,background:col,flexShrink:0}}/>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontWeight:700,fontSize:16}}>{mktKey==="CN"?"HK":mktKey}</span>
                        <Chip mkt={mktKey}/>
                        <span style={{fontSize:14,color:C.muted}}>{m.index}</span>
                      </div>
                      <div style={{fontSize:14,color:C.muted}}>{mktHoldings.length} stocks · {m.symbol}{fmt(localVal,0)} {m.code}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:700,fontSize:16}}>{fmtS(sgdVal)}</div>
                    <div style={{fontSize:14,fontWeight:700,color:pnl>=0?C.green:C.red}}>{pnl>=0?"+":"-"}{fmtS(Math.abs(pnl))} ({pnl>=0?"+":""}{fmt(pnlPct,1)}%)</div>
                    <div style={{fontSize:13,color:C.muted}}>{pct.toFixed(1)}% of portfolio</div>
                  </div>
                </div>
                <div style={{height:5,borderRadius:3,background:C.border}}>
                  <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:col}}/>
                </div>
                {(()=>{
                  const mktDiv=mktHoldings.reduce((s,h)=>s+(h.divYield||0)/100*h.price*h.shares,0);
                  const mktDivYield=localVal>0?mktDiv/localVal*100:0;
                  const sgdDiv=toSGDlive(mktDiv,mktKey);
                  const divCount=mktHoldings.filter(h=>h.divYield>0).length;
                  if(mktDivYield<=0)return null;
                  return(
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginTop:5,color:C.muted}}>
                      <span>💰 Dividend: <b style={{color:C.gold}}>{fmt(mktDivYield,2)}%</b> yield · {divCount} paying stocks</span>
                      <span style={{color:C.gold,fontWeight:700}}>{fmtS(sgdDiv)}/yr</span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderHoldingDetail(){
    const h=sel;if(!h)return null;
    const m=MKT[h.mkt]||MKT.US;
    const valData=valuations[h.ticker];
    const computedIV=valData?.valuations?.average||0;
    const finnhubAnalystIV=valData?.valuations?.analystTarget||0;
    // effectiveIV priority: Finnhub avg > Finnhub analyst target > stored Option A/B/C
    const effectiveIV=computedIV>0?computedIV:finnhubAnalystIV>0?finnhubAnalystIV:(h.intrinsic||0);
    const hScored={...h,intrinsic:effectiveIV};
    const sc=scoreH(hScored),r=getRec(hScored),bs=buffettScore(hScored);
    const gainPct=h.avgCost>0?((h.price-h.avgCost)/h.avgCost)*100:0;
    const upside=effectiveIV>0&&h.price>0?((effectiveIV-h.price)/h.price)*100:0;
    const showGainPct=h.shares>0&&h.avgCost>0; // hide % when fully sold or no cost basis
    const localVal=h.price*h.shares,localCost=h.avgCost*h.shares,localGain=localVal-localCost,localDiv=(h.divYield/100)*localVal;
    const sgdVal=toSGDlive(localVal,h.mkt),sgdCost=toSGDlive(localCost,h.mkt),sgdGain=toSGDlive(localGain,h.mkt),sgdDiv=toSGDlive(localDiv,h.mkt);
    const w=wtTotal(h),pos=gainPct>=0;
    const tickerRealizedH=realizedPerTicker[h.ticker]||0; // total realized P&L for this stock
    const analysis=aiText[h.ticker],loading=aiLoad[h.ticker];

    // ── Insider data is LOCAL state — does NOT cause App re-render ──────────
    // insiderData state lifted to App level — useState invalid in render functions

    async function fetchInsiderTrades(ticker){
      if(!ticker) return;
      if(insiderData[ticker]&&!insiderData[ticker].error) return;
      setInsiderData(prev=>({...prev,[ticker]:{loading:true,trades:[],netBuys:0,netSells:0,sentiment:"neutral"}}));
      try{
        const res=await fetch("https://ckyshjxznltdkxfvhfdy.supabase.co/functions/v1/smart-api",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"insider_trading",ticker}),
        });
        const d=await res.json();
        setInsiderData(prev=>({...prev,[ticker]:{
          loading:false,
          trades:d.trades||[],
          netBuys:d.netBuys||0,
          netSells:d.netSells||0,
          sentiment:d.sentiment||"neutral",
          error:d.error||null,
        }}));
      }catch(e){
        setInsiderData(prev=>({...prev,[ticker]:{loading:false,trades:[],error:e.message}}));
      }
    }

    // useEffect invalid in render functions — call fetchInsiderTrades directly.
    // Guard: only fetch if not already loading/loaded for this ticker.
    if(h?.ticker && !insiderData[h.ticker]) fetchInsiderTrades(h.ticker);
    const buyHist=trades.filter(t=>t.ticker===h.ticker&&t.type==="BUY").sort((a,b)=>b.date.localeCompare(a.date)); // newest first
    const sellHist=trades.filter(t=>t.ticker===h.ticker&&t.type==="SELL").sort((a,b)=>b.date.localeCompare(a.date));
    return(
      <div style={{minHeight:"100%"}}>
        {/* Back button — sticky at top */}
        <div style={{display:"flex",alignItems:"center",marginBottom:12,position:"sticky",top:0,background:C.bg,zIndex:10,paddingTop:12,paddingBottom:10,marginLeft:0,marginRight:0,paddingLeft:18,paddingRight:18}}>
          <button onClick={()=>setSel(null)} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:20,cursor:"pointer",padding:"10px 16px",lineHeight:1,borderRadius:12,fontWeight:700,marginRight:12}}>←</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:18,display:"flex",alignItems:"center",gap:7}}>{h.ticker}<Chip mkt={h.mkt}/></div>
            <div style={{fontSize:13,color:C.muted}}>{h.name}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>openEditHolding(h)} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.accent,fontSize:13,padding:"6px 12px",borderRadius:8,cursor:"pointer",fontWeight:600}}>✏️ Edit</button>
            <button onClick={()=>confirmDeleteHolding(h.id)} style={{background:"transparent",border:`1px solid ${C.red}44`,color:C.red,fontSize:13,padding:"6px 12px",borderRadius:8,cursor:"pointer",fontWeight:600}}>🗑 Delete</button>
          </div>
        </div>
        <div style={{padding:"0 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            <div style={{background:C.surface,borderRadius:9,padding:"10px 10px"}}>
              <div style={{fontSize:13,color:C.muted,marginBottom:2}}>Avg Cost</div>
              <div style={{fontSize:18,fontWeight:800}}>{fmtL(h.avgCost,h.mkt)}</div>
              <div style={{fontSize:13,color:C.muted}}>{fmtS(toSGDlive(h.avgCost,h.mkt))}</div>
            </div>
            <div style={{background:C.surface,borderRadius:9,padding:"10px 10px"}}>
              <div style={{fontSize:13,color:C.muted,marginBottom:2}}>Price ({m.code})</div>
              <div style={{fontSize:18,fontWeight:800}}>{fmtL(h.price,h.mkt)}</div>
              {showGainPct&&<div style={{fontSize:13,color:pos?C.green:C.red,fontWeight:700}}>{fmtPct(gainPct)}</div>}
            </div>
            <div style={{background:C.surface,borderRadius:9,padding:"10px 10px"}}>
              {h.isEtf?(
                <>
                  <div style={{fontSize:13,color:C.muted,marginBottom:2}}>Intrinsic</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.muted}}>N/A</div>
                  <div style={{fontSize:12,color:C.muted}}>ETF / Fund</div>
                </>
              ):(
                (()=>{
                  const ivMissing = !h.isEtf && effectiveIV<=0;
                  const isAiLoading = !!intrinsicAiLoading[h.ticker];
                  return(<>
                    <div style={{fontSize:13,color:C.muted,marginBottom:2}}>
                      Intrinsic {(()=>{
                        if(computedIV>0) return <span style={{color:C.purple,fontSize:11,fontWeight:700}}>●calc</span>;
                        const m=h.intrinsicMethod;
                        if(m==='analyst')    return <span style={{color:C.green,  fontSize:10,fontWeight:700,background:C.green+'15',padding:"1px 4px",borderRadius:3}}>analyst</span>;
                        if(m==='reit_yield') return <span style={{color:C.gold,   fontSize:10,fontWeight:700,background:C.gold+'15', padding:"1px 4px",borderRadius:3}}>yield</span>;
                        if(m==='graham')     return <span style={{color:C.accent, fontSize:10,fontWeight:700,background:C.accent+'15',padding:"1px 4px",borderRadius:3}}>Graham</span>;
                        if(m==='dcf_eps')    return <span style={{color:C.accentDim,fontSize:10,fontWeight:700,background:C.accentDim+'20',padding:"1px 4px",borderRadius:3}}>DCF</span>;
                        if(m==='ai_search')  return <span style={{color:C.purple, fontSize:10,fontWeight:700,background:C.purple+'15',padding:"1px 4px",borderRadius:3}}>🤖AI</span>;
                        return null;
                      })()}
                    </div>
                    {ivMissing?(
                      <>
                        <div style={{fontSize:17,fontWeight:700,color:C.muted,letterSpacing:"0.04em"}}>NA</div>
                        {!h.isEtf&&(
                          <button
                            onClick={e=>{e.stopPropagation();refreshSingleIntrinsicWithAI(h);}}
                            disabled={isAiLoading}
                            style={{marginTop:4,padding:"3px 8px",borderRadius:6,
                              border:`1px solid ${C.purple}`,
                              background:isAiLoading?C.surface:C.purple+"18",
                              color:isAiLoading?C.muted:C.purple,
                              fontSize:11,fontWeight:700,
                              cursor:isAiLoading?"not-allowed":"pointer",
                              display:"block",width:"100%"}}>
                            {isAiLoading?"⏳ Searching…":"🤖 Search"}
                          </button>
                        )}
                      </>
                    ):(
                      <>
                        <div style={{fontSize:18,fontWeight:800}}>{fmtL(effectiveIV,h.mkt)}</div>
                        <div style={{fontSize:13,color:upside>=0?C.green:C.red,fontWeight:700}}>
                          {(upside>=0?"+":"")+fmt(upside,1)+"%"}
                        </div>
                        {!h.isEtf&&(
                          <button
                            onClick={e=>{e.stopPropagation();refreshSingleIntrinsicWithAI(h);}}
                            disabled={isAiLoading}
                            style={{marginTop:4,padding:"2px 6px",borderRadius:5,
                              border:`1px solid ${C.purple}50`,
                              background:"transparent",
                              color:isAiLoading?C.muted:C.purple,
                              fontSize:10,fontWeight:700,
                              cursor:isAiLoading?"not-allowed":"pointer",
                              display:"block",width:"100%"}}>
                            {isAiLoading?"⏳":"🤖"}
                          </button>
                        )}
                      </>
                    )}
                  </>);
                })()
              )}
            </div>
          </div>

          {/* Multi-period chart */}
          <div style={{...card,padding:12,marginBottom:10}}>
            <div style={{...row,marginBottom:8,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:14,color:C.muted,fontWeight:700}}>History ({m.code})</div>
                <span style={{
                  fontSize:8,fontWeight:800,color:C.green,letterSpacing:"0.08em",
                  background:C.green+"18",border:`1px solid ${C.green}35`,
                  borderRadius:8,padding:"1px 5px",lineHeight:"14px"
                }}>● LIVE</span>
              </div>
              <div style={{display:"flex",gap:3}}>
                {PERIODS.map(p=><button key={p} style={smPill(detailPeriod===p)} onClick={()=>setDetailPeriod(p)}>{PLBL[p]}</button>)}
              </div>
            </div>
            {(()=>{
              const hData=realHist[h.ticker]?.[detailPeriod];
              const isLoading=histLoading[h.ticker+'_'+detailPeriod];
              if(isLoading) return(
                <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",background:C.surface,borderRadius:8}}>
                  <div style={{fontSize:14,color:C.gold,animation:"pulse 1s ease-in-out infinite"}}>↻ Loading chart data...</div>
                </div>
              );
              if(!hData||hData.length<2) return(
                <div style={{height:80,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:C.surface,borderRadius:8,gap:6}}>
                  <div style={{fontSize:14,color:C.muted}}>No chart data</div>
                  <button onClick={()=>fetchRealHistory(h.ticker,h.mkt,detailPeriod)} style={{fontSize:14,padding:"3px 10px",borderRadius:5,border:`1px solid ${C.accent}`,background:"transparent",color:C.accent,cursor:"pointer"}}>Load Chart</button>
                </div>
              );
              return(
                <Sparkline data={hData} color={pos?C.green:C.red} height={60} period={detailPeriod}/>
              );
            })()}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.muted,marginTop:3}}>
              <span>{detailPeriod==="all"&&FIRST_BUY[h.ticker]?("First buy: "+FIRST_BUY[h.ticker]):{"30d":"30 days ago","6m":"6 months ago","1y":"1 year ago","5y":"5 years ago","all":"Max available"}[detailPeriod]}</span>
              <span>{fmtL(h.price,h.mkt)}</span>
            </div>
          </div>

          {/* Position */}
          <div style={{background:C.accent+"0D",border:`1px solid ${C.accentDim}30`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:13,color:C.accent,fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>POSITION</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 14px",marginBottom:8}}>
              {[["Shares",h.shares.toLocaleString(),null],["Avg Cost",fmtL(h.avgCost,h.mkt),fmtS(toSGDlive(h.avgCost,h.mkt))],["Market Value",fmtL(localVal,h.mkt,0),fmtS(sgdVal)],["Cost Basis",fmtL(localCost,h.mkt,0),fmtS(sgdCost)],["Unrealized P&L",`${pos?"+":"-"}${fmtL(Math.abs(localGain),h.mkt,0)}`,`${pos?"+":"-"}${fmtS(Math.abs(sgdGain))}`],].map(([l,v,sub])=>(
                <div key={l}><div style={{fontSize:13,color:C.muted}}>{l}</div><div style={{fontSize:16,fontWeight:700,color:l==="Unrealized P&L"?(pos?C.green:C.red):C.text}}>{v}</div>{sub&&<div style={{fontSize:13,color:C.muted}}>{sub}</div>}</div>
              ))}
              {/* Annual Div — custom render to show yield % inline */}
              {(()=>{
                if(localDiv<=0) return(
                  <div><div style={{fontSize:13,color:C.muted}}>Annual Div</div><div style={{fontSize:16,fontWeight:700,color:C.muted}}>—</div></div>
                );
                const yieldPct=h.price>0?(h.divYield||0):0;
                return(
                  <div>
                    <div style={{fontSize:13,color:C.muted}}>Annual Div (gross)</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:5}}>
                      <div style={{fontSize:16,fontWeight:700,color:C.gold}}>{fmtL(localDiv,h.mkt,0)}</div>
                      {yieldPct>0&&<div style={{fontSize:14,fontWeight:700,color:C.gold,background:C.gold+"18",padding:"1px 5px",borderRadius:4}}>{fmt(yieldPct,2)}%</div>}
                    </div>
                    <div style={{fontSize:13,color:C.muted}}>{fmtS(sgdDiv)}</div>
                  </div>
                );
              })()}
            </div>
            {/* Dividend tax row — only shown for markets with withholding tax */}
            {(()=>{
              const taxRate=getDivTax(h.mkt);
              if(localDiv<=0||taxRate===0) return null;
              const netDiv=localDiv*(1-taxRate);
              const netDivSGD=toSGDlive(netDiv,h.mkt);
              const taxLabel=fmtTax(h.mkt);
              return(
                <div style={{background:C.surface,borderRadius:7,padding:"7px 10px",marginBottom:8,borderLeft:`3px solid ${C.gold}`}}>
                  <div style={{fontSize:13,color:C.gold,fontWeight:700,marginBottom:4}}>DIVIDEND WITHHOLDING TAX ({taxLabel})</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,fontSize:14}}>
                    <div><div style={{fontSize:12,color:C.muted}}>Gross/yr</div><div style={{fontWeight:700}}>{fmtL(localDiv,h.mkt,0)}</div><div style={{fontSize:12,color:C.muted}}>{fmtS(sgdDiv)}</div></div>
                    <div><div style={{fontSize:12,color:C.red}}>Tax ({(taxRate*100).toFixed(3).replace(/\.?0+$/,"")}%)</div><div style={{fontWeight:700,color:C.red}}>-{fmtL(localDiv*taxRate,h.mkt,0)}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:12,color:C.green}}>Net/yr</div><div style={{fontWeight:700,color:C.green}}>{fmtL(netDiv,h.mkt,0)}</div><div style={{fontSize:12,color:C.muted}}>{fmtS(netDivSGD)}</div></div>
                  </div>
                </div>
              );
            })()}
            <div style={{...row,marginBottom:3}}><span style={{fontSize:13,color:C.muted}}>Portfolio Weight</span><span style={{fontSize:15,fontWeight:800,color:C.accent}}>{w.toFixed(2)}%</span></div>
            {tickerRealizedH!==0&&(
              <div style={{...row,marginTop:6,marginBottom:3}}>
                <span style={{fontSize:13,color:C.muted}}>Realized P&amp;L</span>
                <span style={{fontSize:15,fontWeight:800,color:tickerRealizedH>=0?C.green:C.red}}>
                  {tickerRealizedH>=0?"+":"-"}{fmtS(Math.abs(tickerRealizedH))}
                </span>
              </div>
            )}
            <div style={{height:4,borderRadius:2,background:C.border}}><div style={{width:`${Math.min(w*3,100)}%`,height:"100%",borderRadius:2,background:C.accent}}/></div>
          </div>

          {/* Buffett score */}
          <div style={{background:"#1A1200",border:`1px solid ${C.gold}30`,borderRadius:10,padding:"10px 14px",marginBottom:10}}>
            <div style={{...row}}>
              <div><div style={{fontSize:13,color:C.gold,fontWeight:700,marginBottom:3}}>BUFFETT SCORE</div><div style={{fontSize:15,color:C.mutedLight}}>{bs.reason}</div></div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:26,fontWeight:800,color:bs.score>=65?C.green:bs.score>=35?C.gold:C.red}}>{fmt(bs.score,1)}<span style={{fontSize:15,color:C.muted}}>/100</span></div>
                <Bdg label={bs.action} bg={bs.col+"22"} color={bs.col}/>
              </div>
            </div>
          </div>

          {/* Multi-Source Valuation Panel — US stocks only (wrapped in try/catch) */}
          {h.mkt==="US"&&(()=>{
            try{
            const v=valuations[h.ticker];
            const loading=valLoading[h.ticker];
            if(loading&&!v) return(
              <div style={{...card,background:C.purple+"0A",border:`1px solid ${C.purple}30`}}>
                <div style={{fontSize:14,color:C.purple,textAlign:"center",padding:"12px 0"}}>↻ Fetching valuations from Wall Street analysts...</div>
              </div>
            );
            if(!v) return null;
            const vals=v.valuations||{};
            const rec=v.recommendation||{};
            const inp=v.inputs||{};
            const avail=v.dataAvailability||{};
            const priceLive=v.currentPrice||h.price;
            const growthUsed=inp.growthUsed||5;
            const growthSrc=inp.growthSource||'default 5%';

            // Finnhub-based quantitative model rows
            const finnhubSources=[
              {label:"DCF (EPS-based)", val:vals.dcfEPS,    ok:!!(avail.dcfEPSAvailable&&vals.dcfEPS>0),
               note:"EPS × "+growthUsed+"% growth · "+(inp.discountRate||10)+"% disc.",
               na:"📂 No EPS data from Finnhub"},
              {label:"Peter Lynch",     val:vals.peterLynch,ok:!!(avail.peterLynchAvailable&&vals.peterLynch>0),
               note:"EPS × "+growthUsed+"% growth = PEG 1.0",
               na:"📂 No EPS or growth data"},
            ];
            const finnhubAvailCount=finnhubSources.filter(s=>s.ok).length;
            const computedAvg=vals.average||0; // Finnhub DCF+Lynch average

            // Analyst consensus rows (shown separately — real price targets from professionals)
            const finnhubAnalystTgt=vals.analystTarget||0;
            const yahooTgt=vals.yahooTarget||0;
            // Show Yahoo target only if meaningfully different from Finnhub (>5% gap)
            const showYahooTgt=yahooTgt>0&&(finnhubAnalystTgt===0||Math.abs(yahooTgt-finnhubAnalystTgt)/finnhubAnalystTgt>0.05);

            // PRIMARY ESTIMATE HIERARCHY (most reliable → least reliable):
            // 1. Analyst consensus (Finnhub or Yahoo)  — real professionals' targets
            // 2. DCF+Lynch formula average              — backward-looking, use as reference only
            // Stored estimate is REMOVED from display — it may be stale or method-unknown
            const hasAnalystData=finnhubAnalystTgt>0||showYahooTgt;
            const analystTarget=finnhubAnalystTgt>0?finnhubAnalystTgt:yahooTgt;
            const analystCount=vals.numAnalysts||rec.totalAnalysts||0;
            const analystSource=finnhubAnalystTgt>0?`Finnhub · ${analystCount} analysts`:'Yahoo quoteSummary';

            const primaryEst=hasAnalystData?analystTarget:(computedAvg>0?computedAvg:0);
            const primaryUpside=priceLive>0&&primaryEst>0?((primaryEst-priceLive)/priceLive*100):0;

            const recText=rec.score>=0.7?"Strong Buy":rec.score>=0.3?"Buy":rec.score>=-0.3?"Hold":rec.score>=-0.7?"Sell":"Strong Sell";
            const recCol=rec.score>=0.3?C.green:rec.score>=-0.3?C.gold:C.red;
            return(
              <div style={{...card,background:C.purple+"0A",border:`1px solid ${C.purple}40`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,color:C.purple,fontWeight:700,letterSpacing:"0.08em"}}>MULTI-SOURCE VALUATION</div>
                  {rec.totalAnalysts>0&&<span style={{fontSize:13,fontWeight:700,padding:"2px 8px",borderRadius:4,background:recCol+"22",color:recCol}}>{recText} ({rec.totalAnalysts} analysts)</span>}
                </div>
                <div style={{fontSize:14,color:C.mutedLight,marginBottom:6}}>
                  Current: <b style={{color:C.text}}>${fmt(priceLive)}</b> · EPS ${fmt(inp.eps)} · Growth <b style={{color:C.gold}}>{growthUsed}%</b> <span style={{color:C.muted}}>({growthSrc})</span>
                </div>

                {/* Single column header */}
                <div style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr 0.8fr 1.2fr",gap:6,fontSize:12,marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${C.border}`,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>
                  <div>Model</div>
                  <div style={{textAlign:"right"}}>Fair Value</div>
                  <div style={{textAlign:"right"}}>vs Market</div>
                  <div style={{textAlign:"right"}}>Method</div>
                </div>

                {/* ── ANALYST CONSENSUS — primary source ─────────────────────── */}
                {finnhubAnalystTgt>0&&(()=>{
                  const upside=priceLive>0?((finnhubAnalystTgt-priceLive)/priceLive*100):0;
                  const col=upside>=15?C.green:upside>=0?C.gold:C.red;
                  return(
                    <div style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr 0.8fr 1.2fr",gap:6,fontSize:14,marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${C.green}40`,background:C.green+"08",borderRadius:6,padding:"8px 6px"}}>
                      <div style={{fontWeight:800,color:C.green}}>Analyst Consensus</div>
                      <div style={{fontWeight:800,textAlign:"right"}}>${fmt(finnhubAnalystTgt)}</div>
                      <div style={{fontWeight:800,textAlign:"right",color:col}}>{upside>=0?"+":""}{fmt(upside,1)}%</div>
                      <div style={{fontSize:12,color:C.muted,textAlign:"right"}}>Finnhub · {analystCount} analysts</div>
                    </div>
                  );
                })()}
                {showYahooTgt&&(()=>{
                  const upside=priceLive>0?((yahooTgt-priceLive)/priceLive*100):0;
                  const col=upside>=15?C.green:upside>=0?C.gold:C.red;
                  return(
                    <div style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr 0.8fr 1.2fr",gap:6,fontSize:14,marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${C.green}40`,background:C.green+"08",borderRadius:6,padding:"8px 6px"}}>
                      <div style={{fontWeight:800,color:C.green}}>Analyst Consensus</div>
                      <div style={{fontWeight:800,textAlign:"right"}}>${fmt(yahooTgt)}</div>
                      <div style={{fontWeight:800,textAlign:"right",color:col}}>{upside>=0?"+":""}{fmt(upside,1)}%</div>
                      <div style={{fontSize:12,color:C.muted,textAlign:"right"}}>Yahoo · consensus</div>
                    </div>
                  );
                })()}

                {/* Warning banner when no analyst data is loaded */}
                {!hasAnalystData&&(
                  <div style={{background:C.gold+"14",border:`1px solid ${C.gold}44`,borderRadius:7,padding:"8px 10px",marginBottom:8}}>
                    <div style={{fontSize:13,color:C.gold,fontWeight:700,marginBottom:3}}>⚠ No analyst target loaded</div>
                    <div style={{fontSize:12,color:C.mutedLight,lineHeight:1.5}}>
                      Tap <b>🔄 Formula</b> or <b>🤖 AI Web Refresh</b> in the Buffett tab to fetch real analyst consensus targets. Until then, only formula models are shown below.
                    </div>
                  </div>
                )}

                {/* ── QUANTITATIVE MODELS — reference only ───────────────────── */}
                <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:5,marginTop:4}}>
                  Formula Models — Reference Only
                </div>
                {finnhubSources.map((s,i)=>{
                  if(s.ok){
                    const upside=priceLive>0?((s.val-priceLive)/priceLive*100):0;
                    const col=upside>=15?C.green:upside>=0?C.gold:C.red;
                    return(
                      <div key={s.label} style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr 0.8fr 1.2fr",gap:6,fontSize:14,marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${C.border}`,opacity:0.85}}>
                        <div style={{fontWeight:700,color:C.mutedLight}}>{s.label}</div>
                        <div style={{fontWeight:700,textAlign:"right"}}>${fmt(s.val)}</div>
                        <div style={{fontWeight:700,textAlign:"right",color:col}}>{upside>=0?"+":""}{fmt(upside,1)}%</div>
                        <div style={{fontSize:13,color:C.muted,textAlign:"right"}}>{s.note}</div>
                      </div>
                    );
                  } else {
                    return(
                      <div key={s.label} style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr 0.8fr 1.2fr",gap:6,fontSize:14,marginBottom:6,paddingBottom:6,borderBottom:`1px dashed ${C.border}44`,opacity:0.4}}>
                        <div style={{fontWeight:600,color:C.mutedLight,textDecoration:"line-through"}}>{s.label}</div>
                        <div style={{textAlign:"right",color:C.muted,fontSize:16,letterSpacing:2}}>· · ·</div>
                        <div style={{textAlign:"right",color:C.muted,fontSize:16,letterSpacing:2}}>· · ·</div>
                        <div style={{fontSize:13,color:C.gold,textAlign:"right",fontStyle:"italic"}}>{s.na}</div>
                      </div>
                    );
                  }
                })}

                {/* ── PRIMARY ESTIMATE ROW ─────────────────────────────────────── */}
                {primaryEst>0?(
                  <div style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr 0.8fr 1.2fr",gap:6,fontSize:15,marginTop:8,paddingTop:8,borderTop:`2px solid ${hasAnalystData?C.green+"60":C.gold+"60"}`}}>
                    <div style={{fontWeight:800,color:hasAnalystData?C.green:C.gold}}>
                      {hasAnalystData?"ANALYST TARGET":"FORMULA REF"}
                    </div>
                    <div style={{fontWeight:800,textAlign:"right",color:hasAnalystData?C.green:C.gold}}>${fmt(primaryEst)}</div>
                    <div style={{fontWeight:800,textAlign:"right",color:primaryUpside>=0?C.green:C.red}}>{primaryUpside>=0?"+":""}{fmt(primaryUpside,1)}%</div>
                    <div style={{fontSize:12,color:C.muted,textAlign:"right"}}>
                      {hasAnalystData?analystSource:finnhubAvailCount>1?"avg DCF+Lynch":"formula only"}
                    </div>
                  </div>
                ):(
                  <div style={{textAlign:"center",fontSize:14,color:C.muted,marginTop:10,padding:"8px",background:C.surface,borderRadius:6}}>
                    ⚠ No data available — run 🔄 Formula or 🤖 AI Web Refresh in Buffett tab
                  </div>
                )}

                {/* Disclaimer */}
                <div style={{fontSize:12,color:C.mutedLight,marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`,lineHeight:1.5}}>
                  <b style={{color:C.gold}}>Hierarchy:</b> <b style={{color:C.green}}>Analyst Consensus</b> = real price targets from professional analysts (most reliable). <b>DCF (EPS) / Peter Lynch</b> = formula models using backward-looking EPS — they contradict each other by design, treat as rough reference only. <b>Formula Ref</b> = their average, shown only when no analyst data is available.
                </div>
              </div>
            );
            }catch(err){
              console.error("Valuation panel error:",err);
              return(
                <div style={{padding:10,margin:"5px 0",background:"#2a0a0a",border:"1px solid #ef4444",borderRadius:8,fontSize:14,color:"#fca5a5"}}>
                  <b>Valuation panel error:</b> {err.message}
                </div>
              );
            }
          })()}

          {buyHist.length>0&&(
            <div style={card}>
              <div style={{...row,marginBottom:6}}>
                <div style={cardT}>Buy History ({buyHist.length} lots)</div>
                {buyHist.length>8&&(
                  <button onClick={()=>setShowAllBuy(v=>!v)} style={{fontSize:13,fontWeight:700,color:C.accent,background:"none",border:"none",cursor:"pointer",padding:"0 2px"}}>
                    {showAllBuy?"▲ Show less":"▼ Show all "+buyHist.length}
                  </button>
                )}
              </div>
              {(showAllBuy?buyHist:buyHist.slice(0,8)).map((bt,i)=>{
                const displayBuy=showAllBuy?buyHist:buyHist.slice(0,8);
                const total=bt.price*bt.shares;
                return(
                  <div key={i} style={{marginBottom:5,paddingBottom:5,borderBottom:i<displayBuy.length-1?`1px solid ${C.border}`:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",fontSize:15}}>
                      <span style={{color:C.muted,fontSize:14}}>{bt.date}</span>
                      <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                        <span style={{color:C.mutedLight,fontSize:14}}>{bt.shares.toLocaleString()} sh @ {fmtL(bt.price,h.mkt)}</span>
                        <span style={{fontWeight:700,color:C.green,fontSize:15}}>= {fmtL(total,h.mkt,0)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {sellHist.length>0&&(
            <div style={card}>
              <div style={{...row,marginBottom:6}}>
                <div style={cardT}>Sell History ({sellHist.length} trades)</div>
                {sellHist.length>5&&(
                  <button onClick={()=>setShowAllSell(v=>!v)} style={{fontSize:13,fontWeight:700,color:C.accent,background:"none",border:"none",cursor:"pointer",padding:"0 2px"}}>
                    {showAllSell?"▲ Show less":"▼ Show all "+sellHist.length}
                  </button>
                )}
              </div>
              {(showAllSell?sellHist:sellHist.slice(0,5)).map((st,i)=>{
                const displaySell=showAllSell?sellHist:sellHist.slice(0,5);
                const received=st.price*st.shares;
                return(
                  <div key={i} style={{marginBottom:5,paddingBottom:5,borderBottom:i<displaySell.length-1?`1px solid ${C.border}`:"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",fontSize:15}}>
                      <span style={{color:C.muted,fontSize:14}}>{st.date}</span>
                      <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                        <span style={{color:C.mutedLight,fontSize:14}}>{st.shares.toLocaleString()} sh @ {fmtL(st.price,h.mkt)}</span>
                        <span style={{fontWeight:700,color:C.red,fontSize:15}}>= {fmtL(received,h.mkt,0)}</span>
                      </div>
                    </div>
                    {st.profit!=null&&(
                      <div style={{textAlign:"right",fontSize:14,fontWeight:700,color:st.profit>=0?C.green:C.red,marginTop:2}}>
                        P&L {st.profit>=0?"+":"-"}{fmtL(Math.abs(st.profit),h.mkt,0)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={card}>
            <div style={cardT}>Analysis Scores</div>
            {[["Intrinsic Value",sc.iv],["Economic Moat",sc.mt],["Dividend Yield",sc.dv],["Overall",sc.all]].map(([l,v])=>(
              <div key={l} style={{marginBottom:8}}>
                <div style={{fontSize:15,color:l==="Overall"?C.text:C.muted,marginBottom:3,fontWeight:l==="Overall"?700:400}}>{l}</div>
                <ScoreBar score={v} max={10} color={l==="Overall"?C.accent:undefined}/>
              </div>
            ))}
          </div>

          {/* ── ECONOMIC MOAT CARD with AI Assess button ─────────────────── */}
          {(()=>{
            const aiLoading=moatAiLoading[h.ticker];
            const moatCol=h.moat==="Wide"?C.green:h.moat==="Narrow"?C.gold:C.muted;
            const moatBg=h.moat==="Wide"?"#1A2E1A":h.moat==="Narrow"?"#2A2A1A":C.surface;
            return(
              <div style={{...card,borderLeft:`3px solid ${moatCol}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:16}}>🏰</span>
                    <div style={cardT}>Economic Moat</div>
                  </div>
                  <button onClick={()=>assessMoatWithAI(h)} disabled={!!aiLoading}
                    style={{padding:"5px 10px",borderRadius:8,
                      border:`1px solid ${aiLoading?C.border:C.accent}`,
                      background:aiLoading?C.surface:C.accent+"18",
                      color:aiLoading?C.muted:C.accent,
                      fontSize:12,fontWeight:700,cursor:aiLoading?"not-allowed":"pointer",
                      display:"flex",alignItems:"center",gap:4}}>
                    {aiLoading?"⏳ Assessing…":"🤖 AI Assess"}
                  </button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:h.moatReason?8:0}}>
                  <span style={{fontSize:22,fontWeight:800,padding:"4px 14px",borderRadius:8,
                    background:moatBg,color:moatCol,border:`1px solid ${moatCol}44`}}>
                    {h.moat||"Narrow"}
                  </span>
                  <div>
                    <div style={{fontSize:13,color:C.muted}}>Moat Score</div>
                    <div style={{fontSize:16,fontWeight:700,color:moatCol}}>{sc.mt}/10</div>
                  </div>
                </div>
                {h.moatReason&&(
                  <div style={{fontSize:13,color:C.mutedLight,lineHeight:1.6,
                    background:C.surface,borderRadius:6,padding:"8px 10px",
                    borderLeft:`2px solid ${moatCol}`}}>
                    {h.moatReason}
                  </div>
                )}
                {h.moatUpdatedAt&&(
                  <div style={{fontSize:11,color:C.muted,marginTop:6,textAlign:"right"}}>
                    AI assessed: {h.moatUpdatedAt}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={card}><div style={cardT}>Key Stats</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>{[["P/E",fmt(h.peRatio)],["Div Yield",fmt(h.divYield)+"%"],["Sector",h.sector],["MS Style",h.msStyle],["Market",`${h.mkt} (${m.code})`],["Benchmark",m.index]].map(([l,v])=>(<div key={l}><div style={{fontSize:13,color:C.muted}}>{l}</div><div style={{fontSize:15,fontWeight:600}}>{v}</div></div>))}</div></div>

          {/* ── INSIDER TRADING PANEL ─────────────────────────────────── */}
          {(()=>{
            const ins=insiderData[h.ticker];
            if(!ins&&!insiderData[h.ticker]) return null;
            const insLoading=ins?.loading;
            const insTrades=ins?.trades||[];
            const sentimentCol=ins?.sentiment==="bullish"?C.green:ins?.sentiment==="bearish"?C.red:C.gold;
            const sentimentIcon=ins?.sentiment==="bullish"?"📈":ins?.sentiment==="bearish"?"📉":"➡️";
            return(
              <div style={{...card,borderLeft:`3px solid ${sentimentCol}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:16}}>🏢</span>
                    <div style={cardT}>Insider Transactions</div>
                  </div>
                  {ins&&!insLoading&&(
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {ins.netBuys>0&&<span style={{fontSize:12,fontWeight:700,color:C.green,background:C.green+"18",padding:"2px 8px",borderRadius:10}}>{ins.netBuys} BUY</span>}
                      {ins.netSells>0&&<span style={{fontSize:12,fontWeight:700,color:C.red,background:C.red+"18",padding:"2px 8px",borderRadius:10}}>{ins.netSells} SELL</span>}
                      <span style={{fontSize:12,color:sentimentCol,fontWeight:700}}>{sentimentIcon}</span>
                    </div>
                  )}
                </div>
                {insLoading?(
                  <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"12px 0"}}>
                    Loading insider data…
                  </div>
                ):ins?.error?(
                  <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"8px 0"}}>
                    Insider data not available for {h.ticker}
                  </div>
                ):insTrades.length===0?(
                  <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"8px 0"}}>
                    No recent insider transactions found
                  </div>
                ):(
                  <>
                    {/* Column headers */}
                    <div style={{display:"grid",gridTemplateColumns:"80px 1fr 60px 70px",gap:"2px 8px",
                      fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",
                      letterSpacing:"0.05em",paddingBottom:6,borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                      <div>Date</div>
                      <div>Insider</div>
                      <div>Action</div>
                      <div style={{textAlign:"right"}}>Value</div>
                    </div>
                    {insTrades.map((t,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"80px 1fr 60px 70px",
                        gap:"2px 8px",padding:"5px 0",fontSize:13,
                        borderBottom:i<insTrades.length-1?`1px solid ${C.border}22`:"none"}}>
                        <div style={{fontSize:11,color:C.muted,alignSelf:"center"}}>{t.date}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</div>
                          {t.role&&<div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.role}</div>}
                        </div>
                        <div style={{alignSelf:"center"}}>
                          <span style={{fontSize:12,fontWeight:700,
                            color:t.action==="BUY"?C.green:C.red,
                            background:t.action==="BUY"?C.green+"18":C.red+"18",
                            padding:"2px 6px",borderRadius:6}}>
                            {t.action}
                          </span>
                        </div>
                        <div style={{textAlign:"right",fontSize:12,fontWeight:700,alignSelf:"center",
                          color:t.action==="BUY"?C.green:C.red}}>
                          {t.value||"—"}
                          {t.shares>0&&<div style={{fontSize:10,color:C.muted,fontWeight:400}}>
                            {t.shares.toLocaleString()} sh
                          </div>}
                        </div>
                      </div>
                    ))}
                    <div style={{fontSize:11,color:C.muted,marginTop:8,textAlign:"right"}}>
                      Source: Quiver Quant · SEC Form 4 filings
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          <div style={{...card,background:C.accent+"08",border:`1px solid ${C.accentDim}30`}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}><span style={{fontSize:18}}>🤖</span><div style={cardT}>Buffett-Style Analysis</div></div>
            {(()=>{
              const bs=buffettScore(h);
              const gainPctAI=((h.price-h.avgCost)/h.avgCost)*100;
              const hasIV=(h.intrinsic||0)>0;
              const upsideAI=hasIV?((h.intrinsic-h.price)/h.price)*100:null;
              const divOk=h.divYield>0;
              const moatStr=h.moat==="Wide"?"a wide economic moat — strong competitive advantages":h.moat==="Narrow"?"a narrow moat — some competitive advantages":"no significant moat";
              // Only describe valuation when real IV data is available
              const valuationStr=!hasIV
                ?"Intrinsic value has not yet been loaded — tap 🤖 on the Intrinsic tile to search for analyst targets."
                :upsideAI>15?"The stock is trading below intrinsic value — a margin of safety exists, with an estimate of "+fmtL(h.intrinsic,h.mkt)+" vs current price of "+fmtL(h.price,h.mkt)+" ("+(upsideAI>=0?"+":"")+fmt(upsideAI,1)+"% upside)."
                :upsideAI>0?"The stock is near fair value with limited margin of safety — intrinsic estimate "+fmtL(h.intrinsic,h.mkt)+" vs "+fmtL(h.price,h.mkt)+" ("+(upsideAI>=0?"+":"")+fmt(upsideAI,1)+"% upside)."
                :"The stock is trading above intrinsic value at "+fmtL(h.price,h.mkt)+" vs estimate of "+fmtL(h.intrinsic,h.mkt)+" ("+(upsideAI>=0?"+":"")+fmt(upsideAI,1)+"% upside) — caution warranted.";
              // rec derives from action (not raw score) to stay consistent with the moat/reason text above
              const rec=bs.action==="BUY MORE"?"a strong buy"
                :bs.action==="ADD GRADUALLY"?"a gradual accumulation candidate"
                :bs.action==="HOLD"?"worth holding at current levels"
                :bs.action==="WATCH"?"worth monitoring — await a better entry"
                :"under scrutiny — reassess position sizing";
              const divText=divOk?`pays a ${h.divYield.toFixed(1)}% dividend yield, providing income while you wait`:"pays no dividend, so returns depend entirely on price appreciation";
              const perfText=gainPctAI>=0?`currently up ${fmt(gainPctAI,1)}% from your average cost of ${fmtL(h.avgCost,h.mkt)}`:`currently down ${fmt(Math.abs(gainPctAI),1)}% from your average cost of ${fmtL(h.avgCost,h.mkt)}`;
              const peText=h.peRatio>0
                ?`At a P/E of ${fmt(h.peRatio,1)}x, it is ${h.peRatio<20?"reasonably valued relative to earnings":h.peRatio<35?"moderately priced relative to earnings":"expensively priced relative to current earnings"}.`
                :"P/E data unavailable — the company may not yet be profitable, or data is pending refresh.";
              return(
                <div style={{fontSize:15,color:C.mutedLight,lineHeight:1.8}}>
                  <p style={{marginBottom:8}}><b style={{color:C.text}}>{h.name}</b> has {moatStr}. {valuationStr}</p>
                  <p style={{marginBottom:8}}>Your position is {perfText}. The stock {divText}. {peText}</p>
                  <p><b style={{color:bs.score>=65?C.green:bs.score>=35?C.gold:C.red}}>Buffett verdict ({fmt(bs.score,1)}/100):</b> {h.name} is {rec}. {bs.reason}.</p>
                </div>
              );
            })()}
          </div>
          <div style={{height:40}}/>
        </div>
      </div>
    );
  }

  function renderEditHoldingModal(){
    if(holdingEditId==null)return null;
    const f=holdingForm,setF=setHoldingForm;
    const h=holdings.find(x=>x.id===holdingEditId);
    if(!h)return null;
    const iF={width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.text,fontSize:16,outline:"none",boxSizing:"border-box"};
    const lbl={fontSize:14,color:C.muted,marginBottom:4};
    const mkts=Object.keys(MKT);
    const moatOpts=["Wide","Narrow","None"];
    const sectorOpts=["Technology","Healthcare","Financials","Consumer Disc.","Industrials","Energy","Utilities","Materials","Real Estate","Comm. Services","Consumer Staples"];
    const ready=f.ticker&&parseFloat(f.price)>0&&parseInt(f.shares)>0&&parseFloat(f.avgCost)>0;
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:60}} onClick={e=>{if(e.target===e.currentTarget){setHoldingEditId(null);setHoldingForm({});}}}>
        <div style={{background:C.card,borderRadius:"20px 20px 0 0",padding:20,width:"100%",maxWidth:430,margin:"0 auto",maxHeight:"92vh",overflowY:"auto"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:C.accent}}>Edit Holding</div>
              <div style={{fontSize:14,color:C.muted}}>{h.ticker} — {h.name}</div>
            </div>
            <button onClick={()=>{setHoldingEditId(null);setHoldingForm({});}} style={{background:"none",border:"none",color:C.muted,fontSize:24,cursor:"pointer",lineHeight:1}}>x</button>
          </div>

          {/* Section: Identity */}
          <div style={{fontSize:14,color:C.accent,fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>IDENTITY</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={lbl}>Ticker Symbol</div>
              <input ref={holdingRefs.ticker} style={iF} defaultValue={f.ticker||""} onBlur={e=>setF(p=>({...p,ticker:e.target.value.toUpperCase()}))}/>
            </div>
            <div>
              <div style={lbl}>Market / Exchange</div>
              <select style={iF} value={f.mkt||"US"} onChange={e=>setF(p=>({...p,mkt:e.target.value}))}>
                {mkts.map(mk=><option key={mk} value={mk}>{mk} — {MKT[mk].index}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"1 / -1"}}>
              <div style={lbl}>Company Name</div>
              <input ref={holdingRefs.name} style={iF} defaultValue={f.name||""} onBlur={e=>setF(p=>({...p,name:e.target.value}))} placeholder="Full company name"/>
            </div>
            <div>
              <div style={lbl}>Sector</div>
              <select style={iF} value={f.sector||"Technology"} onChange={e=>setF(p=>({...p,sector:e.target.value}))}>
                {sectorOpts.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Economic Moat</div>
              <select style={iF} value={f.moat||"Narrow"} onChange={e=>setF(p=>({...p,moat:e.target.value}))}>
                {moatOpts.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Section: Position */}
          <div style={{fontSize:14,color:C.accent,fontWeight:700,letterSpacing:"0.08em",marginBottom:8,marginTop:4}}>POSITION</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={lbl}>Shares / Units</div>
              <input ref={holdingRefs.shares} type="number" style={iF} defaultValue={f.shares||""} onBlur={e=>setF(p=>({...p,shares:e.target.value}))}/>
            </div>
            <div>
              <div style={lbl}>Avg Cost ({MKT[f.mkt||"US"]?.symbol})</div>
              <input ref={holdingRefs.avgCost} type="number" style={iF} defaultValue={f.avgCost||""} onBlur={e=>setF(p=>({...p,avgCost:e.target.value}))}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <div style={lbl}>Held Since <span style={{color:C.muted,fontWeight:400}}>(actual purchase date — used in performance chart)</span></div>
              <input type="date" style={{...iF,colorScheme:"dark"}} defaultValue={f.heldSince||""}
                onChange={e=>setF(p=>({...p,heldSince:e.target.value}))}
                onBlur={e=>setF(p=>({...p,heldSince:e.target.value}))}
                max={new Date().toISOString().split('T')[0]}/>
              {f.heldSince&&<div style={{fontSize:12,color:C.green,marginTop:3}}>✓ Performance chart will show this stock from {f.heldSince}</div>}
              {!f.heldSince&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>Optional — leave blank if unknown (chart uses full available history)</div>}
            </div>
          </div>

          {/* Section: Valuation */}
          <div style={{fontSize:14,color:C.accent,fontWeight:700,letterSpacing:"0.08em",marginBottom:8,marginTop:4}}>VALUATION</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={lbl}>Current Price ({MKT[f.mkt||"US"]?.symbol})</div>
              <input ref={holdingRefs.price} type="number" style={iF} defaultValue={f.price||""} onBlur={e=>setF(p=>({...p,price:e.target.value}))}/>
            </div>
            <div>
              <div style={lbl}>Intrinsic Value ({MKT[f.mkt||"US"]?.symbol})</div>
              <input ref={holdingRefs.intrinsic} type="number" style={iF} defaultValue={f.intrinsic||""} onBlur={e=>setF(p=>({...p,intrinsic:e.target.value}))} placeholder="Leave blank to auto-calc"/>
            </div>
            <div>
              <div style={lbl}>P/E Ratio</div>
              <input ref={holdingRefs.peRatio} type="number" style={iF} defaultValue={f.peRatio||""} onBlur={e=>setF(p=>({...p,peRatio:e.target.value}))}/>
            </div>
            <div>
              <div style={lbl}>Dividend Yield (%)</div>
              <input ref={holdingRefs.divYield} type="number" style={iF} defaultValue={f.divYield||""} onBlur={e=>setF(p=>({...p,divYield:e.target.value}))}/>
            </div>
          </div>

          {/* Live preview */}
          {ready&&(()=>{
            const p=parseFloat(f.price),ac=parseFloat(f.avgCost),s=parseInt(f.shares);
            const gain=((p-ac)/ac)*100;
            const localVal=p*s,sgdVal=toSGDlive(localVal,f.mkt||"US");
            return(
              <div style={{background:C.accent+"0D",border:`1px solid ${C.accentDim}30`,borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                <div style={{fontSize:13,color:C.accent,fontWeight:700,marginBottom:6}}>PREVIEW</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:14}}>
                  <div><div style={{fontSize:12,color:C.muted}}>Market Value</div><div style={{fontWeight:700}}>{fmtL(localVal,f.mkt||"US",0)}</div><div style={{fontSize:13,color:C.muted}}>{fmtS(sgdVal)}</div></div>
                  <div style={{textAlign:"center"}}><div style={{fontSize:12,color:C.muted}}>Gain vs Cost</div><div style={{fontWeight:700,color:gain>=0?C.green:C.red}}>{gain>=0?"+":""}{fmt(gain,1)}%</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:12,color:C.muted}}>P&amp;L</div><div style={{fontWeight:700,color:gain>=0?C.green:C.red}}>{gain>=0?"+":"-"}{fmtL(Math.abs((p-ac)*s),f.mkt||"US",0)}</div></div>
                </div>
              </div>
            );
          })()}

          <button onClick={saveHolding} disabled={!ready} style={{width:"100%",padding:"12px",borderRadius:9,border:"none",background:ready?C.accent:C.border,color:ready?"#000":C.muted,fontSize:17,fontWeight:700,cursor:ready?"pointer":"not-allowed",marginBottom:8}}>
            Save Changes to {f.ticker||"Holding"}
          </button>
          <button onClick={()=>{setHoldingEditId(null);setHoldingForm({});}} style={{width:"100%",padding:"10px",borderRadius:9,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:16,cursor:"pointer"}}>
            Cancel
          </button>
          <div style={{height:16}}/>
        </div>
      </div>
    );
  }

  function DeleteConfirmModal(){
    if(deleteConfirm==null)return null;
    const h=holdings.find(x=>x.id===deleteConfirm);
    if(!h)return null;
    const localVal=h.price*h.shares;
    const sgdVal=toSGDlive(localVal,h.mkt);
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:70,padding:"0 20px"}}>
        <div style={{background:C.card,borderRadius:16,padding:24,width:"100%",maxWidth:360,border:`1px solid ${C.red}44`}}>
          <div style={{fontSize:24,textAlign:"center",marginBottom:8}}>Delete Holding?</div>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:20}}>{h.ticker}</div>
            <div style={{fontSize:15,color:C.muted}}>{h.name}</div>
            <div style={{fontSize:16,marginTop:8}}>
              <span style={{color:C.muted}}>Value: </span>
              <span style={{fontWeight:700}}>{fmtL(localVal,h.mkt,0)}</span>
              <span style={{color:C.muted}}> ≈ {fmtS(sgdVal)}</span>
            </div>
            <div style={{fontSize:16}}><span style={{color:C.muted}}>{h.shares.toLocaleString()} shares</span></div>
          </div>
          <div style={{background:C.red+"10",border:`1px solid ${C.red}33`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:14,color:C.red,textAlign:"center"}}>
            This will permanently remove this holding from your portfolio. This cannot be undone.
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,padding:"11px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.text,fontSize:16,fontWeight:600,cursor:"pointer"}}>
              Cancel
            </button>
            <button onClick={doDeleteHolding} style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:C.red,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer"}}>
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  const TABS=[
    {id:"portfolio",icon:"📊",label:"Portfolio"},
    {id:"insights", icon:"💡",label:"Insights"},
    {id:"indices",  icon:"🌍",label:"Markets"},
    {id:"trades",   icon:"💱",label:"Trades"},
    {id:"alerts",   icon:"🔔",label:"Alerts"},
    {id:"summary",  icon:"📋",label:"Summary"},
    {id:"recon",    icon:"🔍",label:"Audit"},
  ];
  const refreshTs=lastRefresh?lastRefresh.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):null;
  return(
  <>
    <div style={{fontFamily:"'DM Sans',system-ui,sans-serif",background:C.bg,
      height:"100%",minHeight:"-webkit-fill-available",
      color:C.text,maxWidth:430,margin:"0 auto",position:"relative",
      display:"flex",flexDirection:"column",
      /* overflow:hidden removed — causes iOS keyboard to dismiss inputs */
    }}>
      {isLoading&&(
        <div style={{position:"fixed",inset:0,background:"#0A0D14",zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:20}}>
          <div style={{fontSize:30,fontWeight:800,color:"#00D4FF",letterSpacing:"-1px"}}>IGNITUS</div>
          <div style={{fontSize:15,color:"#6B7A99",textAlign:"center",maxWidth:320,wordBreak:"break-all"}}>{loadMsg}</div>
          <div style={{width:120,height:2,background:"#1E2A3E",borderRadius:1,overflow:"hidden"}}>
            <div style={{width:"55%",height:"100%",background:"#00D4FF",borderRadius:1,animation:"pulse 1s ease-in-out infinite"}}/>
          </div>
        </div>
      )}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}::-webkit-scrollbar{display:none;}@keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeDown{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(8px)}}`}</style>
      <div style={{padding:"48px 18px 14px",background:`linear-gradient(180deg,${C.surface} 0%,${C.bg} 100%)`,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <div style={{fontSize:14,color:C.muted,fontWeight:700,letterSpacing:"0.1em"}}>IGNITUS PORTFOLIO{mktFilter!=="ALL"&&<span style={{color:C.accent,fontWeight:700,background:C.accent+"18",padding:"2px 6px",borderRadius:4,marginLeft:4}}>{mktFilter==="CN"?"HK":mktFilter}</span>} <span style={{color:C.green,fontWeight:900,background:C.green+"22",padding:"2px 6px",borderRadius:4,marginLeft:4}}>v2026:06:06-12:00</span></div>
              <div title={dbStatus==="error"?"DB save failed":dbStatus==="saving"?"Saving...":dbStatus==="saved"?"Saved to DB":"DB ready"} style={{width:6,height:6,borderRadius:3,background:dbStatus==="error"?C.red:dbStatus==="saving"?C.gold:dbStatus==="saved"?C.green:C.border,transition:"background 0.4s"}}/>
              <button onClick={()=>setShowValue(v=>!v)} title={showValue?"Hide portfolio values":"Show portfolio values"} style={{
  background:showValue?"none":C.accent+"20",
  border:`1px solid ${showValue?C.border:C.accent}`,
  cursor:"pointer",padding:"4px 10px",borderRadius:6,
  fontSize:14,color:showValue?C.mutedLight:C.accent,
  lineHeight:1,letterSpacing:3,fontWeight:700,
  transition:"all 0.2s"
}}>···</button>
            </div>
            <div style={{fontSize:33,fontWeight:800,letterSpacing:"-1.5px",lineHeight:1}}>{showValue?fmtS(hdrValSGD):"S$ ••••••"}</div>
            <div style={{fontSize:14,color:C.muted,marginTop:3}}>{hdrHoldings.length} stocks{mktFilter!=="ALL"?<span style={{color:C.accent,fontSize:13,marginLeft:4}}>· {mktFilter==="CN"?"HK":mktFilter}</span>:""}{priceUpdated&&<span style={{color:C.green}}> · prices {priceUpdated.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"})}</span>}{fxUpdated&&<span style={{color:C.gold}}> · FX {fxUpdated.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"})}</span>}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,fontSize:16,fontWeight:700,background:hdrUnrealSGD>=0?C.green+"18":C.red+"18",color:hdrUnrealSGD>=0?C.green:C.red}}>{hdrUnrealSGD>=0?"UP":"DN"} {showValue?fmtPct(hdrUnrealPct):"• •%"}</div>
            <div style={{fontSize:14,color:hdrUnrealSGD>=0?C.green:C.red,fontWeight:600,marginTop:5}}>Unr. {showValue?(hdrUnrealSGD>=0?"+":"-")+fmtS(Math.abs(hdrUnrealSGD)):"••••••"}</div>
            <div style={{fontSize:14,color:hdrRealSGD>=0?C.gold:C.red,fontWeight:600,marginTop:3}}>Rlz. {showValue?(hdrRealSGD>=0?"+":"-")+fmtS(Math.abs(hdrRealSGD)):"••••••"}</div>
            <div style={{fontSize:14,color:C.gold,marginTop:3}}>Div {showValue?fmtS(hdrDivSGD)+"/yr gross · "+fmtS(hdrNetDivSGD)+"/yr net":"••••••"}</div>
          </div>
        </div>
      </div>

      {/* Tab bar + refresh button */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.surface,position:"sticky",top:0,zIndex:10,overflowX:"auto",alignItems:"stretch"}}>
        {TABS.map(t=>(
          <button key={t.id} style={{flex:"0 0 auto",padding:"11px 12px",fontSize:14,fontWeight:tab===t.id?700:500,color:tab===t.id?C.accent:C.muted,borderBottom:`2px solid ${tab===t.id?C.accent:"transparent"}`,cursor:"pointer",background:"none",border:"none",textAlign:"center",whiteSpace:"nowrap"}} onClick={()=>setTab(t.id)}>
            <div style={{fontSize:19,marginBottom:2}}>{t.icon}</div>{t.label}
          </button>
        ))}
        {/* Refresh button — right-anchored */}
        <div style={{marginLeft:"auto",padding:"0 10px",display:"flex",alignItems:"center",flexShrink:0}}>
          {/* Price update status */}
          {priceStatus==='fetching'&&(
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",fontSize:13,color:C.gold,fontWeight:700}}>
              <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span> Prices...
            </div>
          )}
          {priceStatus==='done'&&priceUpdated&&(
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",fontSize:13,color:C.green,fontWeight:700,whiteSpace:"nowrap"}}>
              ✓ {priceUpdated.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"})}
            </div>
          )}
          {priceStatus==='error'&&(
            <div style={{fontSize:13,color:C.red,padding:"4px 8px",fontWeight:700}}>Price err</div>
          )}
          <button onClick={()=>{fetchLivePrices(holdings);fetchLiveFx();fetchDividends(holdings);}} title="Update live prices and FX rates" style={{
            padding:"6px 8px",borderRadius:8,cursor:"pointer",flexShrink:0,
            border:`1px solid ${C.gold}44`,background:C.gold+"12",color:C.gold,
            fontSize:14,fontWeight:700,whiteSpace:"nowrap"
          }}>
            $ Live
          </button>
          <button onClick={doRefresh} title="Refresh all tabs" style={{
            position:"relative",display:"flex",alignItems:"center",gap:5,
            padding:"6px 10px",borderRadius:8,cursor:"pointer",
            border:`1px solid ${pendingChanges>0?C.accent:C.border}`,
            background:pendingChanges>0?C.accent+"15":"transparent",
            color:pendingChanges>0?C.accent:C.muted,
            transition:"all 0.2s"
          }}>
            <span style={{fontSize:17,display:"inline-block",animation:refreshAnim?"spin 0.6s linear":"none"}}>↻</span>
            <span style={{fontSize:14,fontWeight:700,whiteSpace:"nowrap"}}>
              {pendingChanges>0?`${pendingChanges} pending`:"Refresh"}
            </span>
            {pendingChanges>0&&(
              <span style={{position:"absolute",top:-4,right:-4,width:8,height:8,borderRadius:4,background:C.accent,animation:"pulse 1.5s ease-in-out infinite"}}/>
            )}
          </button>
        </div>
      </div>

      <div style={{overflowY:"auto",flex:1,minHeight:0,padding:sel?"0 0 80px":"16px 18px 80px",WebkitOverflowScrolling:"touch"}}>
        {/* Last refresh timestamp */}
        {refreshTs&&(
          <div style={{fontSize:13,color:C.muted,textAlign:"right",marginBottom:8,opacity:0.7}}>
            Last refreshed: {refreshTs}
          </div>
        )}
        {/* When a stock is selected, show detail view IN the scroll container — not as a modal */}
        {/* This reuses the already-working iOS scroll context instead of fighting fixed overlays */}
        {sel&&<ErrBoundary>{renderHoldingDetail()}</ErrBoundary>}
        {!sel&&tab==="portfolio"&&renderPortfolioView()}
        {!sel&&tab==="insights" &&renderInsightsView()}
        {!sel&&tab==="indices"  &&renderIndexView()}
        {!sel&&tab==="trades"   &&renderTradesView()}
        {!sel&&tab==="alerts"   &&<AlertsView/>}
        {!sel&&tab==="summary"  &&<SummaryView/>}
        {!sel&&tab==="recon"    &&<ReconciliationView/>}
      </div>

      {/* Floating refresh button — visible when there are pending changes */}
      {pendingChanges>0&&(
        <div style={{position:"fixed",bottom:20,right:20,zIndex:40,animation:"fadeUp 0.3s ease"}}>
          <button onClick={doRefresh} style={{
            display:"flex",alignItems:"center",gap:8,
            padding:"10px 16px",borderRadius:24,
            border:"none",cursor:"pointer",
            background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,
            color:"#000",fontWeight:700,fontSize:16,
            boxShadow:`0 4px 20px ${C.accent}55`
          }}>
            <span style={{fontSize:18,display:"inline-block",animation:refreshAnim?"spin 0.6s linear":"none"}}>↻</span>
            Refresh All Tabs
            <span style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"1px 7px",fontSize:14}}>{pendingChanges}</span>
          </button>
        </div>
      )}

      {/* Refresh toast */}
      {refreshAnim&&(
        <div style={{position:"fixed",bottom:70,left:"50%",transform:"translateX(-50%)",zIndex:80,pointerEvents:"none",animation:"fadeUp 0.3s ease"}}>
          <div style={{background:C.green,color:"#000",padding:"8px 18px",borderRadius:20,fontSize:15,fontWeight:700,whiteSpace:"nowrap",boxShadow:`0 4px 16px ${C.green}44`}}>
            All tabs refreshed
          </div>
        </div>
      )}


      {/* ── Delete Trade Confirmation Modal ──────────────────────────── */}
      {deleteConfirmTrade&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:16,padding:24,maxWidth:360,width:"100%",border:`1px solid ${C.red}60`}}>
            <div style={{fontSize:18,fontWeight:800,color:C.red,marginBottom:6}}>🗑 Confirm Delete</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:14}}>This will permanently remove the trade and recalculate your portfolio.</div>
            <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.border}`}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 6px",fontSize:13}}>
                {[
                  ["Ticker",deleteConfirmTrade.ticker],
                  ["Type",deleteConfirmTrade.type],
                  ["Date",deleteConfirmTrade.date],
                  ["Price",deleteConfirmTrade.price],
                  ["Qty",(deleteConfirmTrade.shares||0).toLocaleString()],
                  ["Market",deleteConfirmTrade.mkt||"—"],
                ].map(([l,v])=>(
                  <div key={l}>
                    <div style={{fontSize:10,color:C.muted}}>{l}</div>
                    <div style={{fontWeight:700,color:deleteConfirmTrade.type==="BUY"?C.green:C.red}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteConfirmTrade(null)} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer"}}>✕ Cancel</button>
              <button onClick={()=>{deleteTrade(deleteConfirmTrade.id);setDeleteConfirmTrade(null);}} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${C.red}`,background:C.red+"18",color:C.red,fontSize:14,fontWeight:700,cursor:"pointer"}}>🗑 Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Trade Confirmation Modal ──────────────────────────────── */}
      {editConfirmTrade&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:16,padding:24,maxWidth:360,width:"100%",border:`1px solid ${C.accent}60`}}>
            <div style={{fontSize:18,fontWeight:800,color:C.accent,marginBottom:6}}>✏ Edit Trade</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:14}}>You are about to edit this trade. Continue?</div>
            <div style={{background:C.surface,borderRadius:10,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.border}`}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px 6px",fontSize:13}}>
                {[
                  ["Ticker",editConfirmTrade.ticker],
                  ["Type",editConfirmTrade.type],
                  ["Date",editConfirmTrade.date],
                  ["Price",editConfirmTrade.price],
                  ["Qty",(editConfirmTrade.shares||0).toLocaleString()],
                  ["Market",editConfirmTrade.mkt||"—"],
                ].map(([l,v])=>(
                  <div key={l}>
                    <div style={{fontSize:10,color:C.muted}}>{l}</div>
                    <div style={{fontWeight:700,color:editConfirmTrade.type==="BUY"?C.green:C.red}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setEditConfirmTrade(null)} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer"}}>✕ Cancel</button>
              <button onClick={()=>{startEditTrade(editConfirmTrade);setEditConfirmTrade(null);}} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${C.accent}`,background:C.accent+"18",color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer"}}>✏ Edit</button>
            </div>
          </div>
        </div>
      )}
      {dupeWarning&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.card,borderRadius:16,padding:24,maxWidth:380,width:"100%",border:`1px solid ${C.red}60`}}>
            <div style={{fontSize:18,fontWeight:800,color:C.red,marginBottom:6}}>⚠ Duplicate Trade Detected</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:14,lineHeight:1.6}}>An identical trade already exists. This could be a partial fill or a second lot.</div>
            {[["Existing",dupeWarning.trade,C.border],["New (duplicate)",dupeWarning.pending,C.red+"40"]].map(([label,t,borderCol])=>(
              <div key={label} style={{background:C.surface,borderRadius:10,padding:"10px 14px",marginBottom:10,border:`1px solid ${borderCol}`}}>
                <div style={{fontSize:11,color:label.includes("dup")?C.red:C.muted,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"5px 8px",fontSize:13}}>
                  {[["Ticker",t.ticker],["Type",t.type],["Date",t.date],["Price",t.price],["Qty",(t.shares||0).toLocaleString()],["Market",t.mkt]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10,color:C.muted}}>{l}</div><div style={{fontWeight:700,color:t.type==="BUY"?C.green:C.red}}>{v}</div></div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <button onClick={()=>setDupeWarning(null)} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${C.border}`,background:C.surface,color:C.text,fontSize:14,fontWeight:700,cursor:"pointer"}}>✕ Cancel</button>
              <button onClick={()=>submitTrade(true)} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${C.red}`,background:C.red+"18",color:C.red,fontSize:14,fontWeight:700,cursor:"pointer"}}>Add Anyway</button>
            </div>
          </div>
        </div>
      )}
      {holdingEditId!=null&&renderEditHoldingModal()}
      {deleteConfirm!=null&&<DeleteConfirmModal/>}
    </div>
  </>
  );
}

(function mountApp() {
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  const RD = window.ReactDOM;
  if (RD && document.getElementById('root')) {
    try {
      const root = RD.createRoot(document.getElementById('root'));
      root.render(React.createElement(App));
    } catch(mountErr) {
      document.getElementById('root').innerHTML =
        '<div style="background:#0A0D14;color:#FF5577;padding:20px;font-family:monospace;font-size:12px;position:fixed;inset:0;overflow:auto">' +
        '<div style="font-size:18px;margin-bottom:12px">🔴 Ignitus Crash Report</div>' +
        '<b>Error:</b> ' + mountErr.message + '<br><br>' +
        '<b>Stack:</b><pre style="white-space:pre-wrap;font-size:10px;color:#FF8899">' + (mountErr.stack||'') + '</pre>' +
        '<br><div style="color:#8899AA;font-size:10px">Screenshot this and send to developer</div></div>';
    }
  }
})();
