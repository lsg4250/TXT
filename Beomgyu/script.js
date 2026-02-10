const app = document.getElementById("app");
const intro = document.getElementById("intro");
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");

const rippleLayer = document.getElementById("rippleLayer");
const centerGlow = document.getElementById("centerGlow");
const whiteout = document.getElementById("whiteout");
const introVideo = document.getElementById("introVideo");

// ✅ 추가: 터치 효과음
const tapSfx = document.getElementById("tapSfx");

// ===== 타임라인(약 3초) =====
const TL = {
  totalMs: 3300,
  drawMs: 2500,     // 1~5 경로 그리는 시간
  whiteMs: 800      // 화이트아웃(800ms)
};

// ===== 리플 =====
const RIPPLE = { count: 4, interval: 120 };

// ===== 캔버스 리사이즈 =====
function resize(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width  = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width  = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resize);
resize();

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;

function smoothstep(t){
  t = clamp(t,0,1);
  return t*t*(3-2*t);
}

// 초반 얇게 → 후반 급격히 두꺼워지는 곡선
function slowThenFast(t){
  t = clamp(t,0,1);
  const pivot = 0.7;
  if(t <= pivot){
    const u = t/pivot;
    return 0.12 * (u*u*u);
  }
  const v = (t-pivot)/(1-pivot);
  return 0.12 + 0.88*(1-Math.pow(1-smoothstep(v),2));
}

// ===== 리플 생성 =====
function createRipple(x,y){
  const r = document.createElement("div");
  r.className = "ripple";
  r.style.left = `${x}px`;
  r.style.top  = `${y}px`;
  rippleLayer.appendChild(r);
  r.addEventListener("animationend",()=>r.remove(),{once:true});
}
function playRipples(x,y){
  for(let i=0;i<RIPPLE.count;i++){
    setTimeout(()=>createRipple(x,y), i*RIPPLE.interval);
  }
}

/* ===== 고정 별 경로 (1→2→3→4→5) ===== */
const STAR_PATH_NORM = [
  { x: 0.64, y: 0.70 },
  { x: 0.18, y: 0.30 },
  { x: 0.72, y: 0.44 },
  { x: 0.16, y: 0.64 },
  { x: 0.82, y: 0.22 },
];

function scalePointsNorm(points, scale=1.25, cx=0.5, cy=0.5){
  return points.map(p => ({
    x: cx + (p.x - cx) * scale,
    y: cy + (p.y - cy) * scale
  }));
}

function pathToPixels(){
  const scaled = scalePointsNorm(STAR_PATH_NORM, 1.5, 0.5, 0.5);
  const clamp01 = (v)=>Math.max(0.04, Math.min(0.96, v));
  const safe = scaled.map(p => ({ x: clamp01(p.x), y: clamp01(p.y) }));
  return safe.map(p => ({ x: p.x * innerWidth, y: p.y * innerHeight }));
}

// polyline 길이 누적
function buildLengths(points){
  const seg = [];
  let total = 0;
  for(let i=0;i<points.length-1;i++){
    const a = points[i], b = points[i+1];
    const d = Math.hypot(b.x-a.x, b.y-a.y);
    seg.push(d);
    total += d;
  }
  return { seg, total };
}

// t(0..1)에서 polyline 상의 위치
function pointOnPolyline(points, t){
  const { seg, total } = buildLengths(points);
  if(total <= 0) return { ...points[0] };

  let dist = total * clamp(t,0,1);
  for(let i=0;i<seg.length;i++){
    const d = seg[i];
    if(dist <= d){
      const a = points[i], b = points[i+1];
      const u = d === 0 ? 0 : dist/d;
      const uu = smoothstep(u);
      return { x: lerp(a.x,b.x,uu), y: lerp(a.y,b.y,uu) };
    }
    dist -= d;
  }
  return { ...points[points.length-1] };
}

// ===== 빛(한 줄) =====
class BeamFixedPath{
  constructor(){
    this.points = pathToPixels();
    const start = this.points[0];
    this.x = start.x;
    this.y = start.y;

    this.tailLen = 52;
    this.history = [];
    for(let i=0;i<this.tailLen;i++){
      this.history.push({x:this.x, y:this.y});
    }

    this.wMin = 30;
    this.wMax = 80;
    this.width = this.wMin;

    this.fadeAlpha = 0.10;
  }

  step(drawNorm){
    const p = pointOnPolyline(this.points, drawNorm);
    this.x = p.x;
    this.y = p.y;

    const k = slowThenFast(drawNorm);
    this.width = lerp(this.wMin, this.wMax, k);

    this.history.unshift({x:this.x,y:this.y});
    this.history.pop();
  }

  render(){
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
    ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation="screen";
    ctx.lineCap="round";
    ctx.lineJoin="round";

    for(let i=0;i<this.history.length-1;i++){
      const a=this.history[i];
      const b=this.history[i+1];
      const t=i/(this.history.length-1);

      const alpha = lerp(0.98, 0, t);
      const w = lerp(this.width, 2.2, t);

      const g=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
      g.addColorStop(0,`rgba(255,255,255,${alpha})`);
      g.addColorStop(1,`rgba(180,240,255,${alpha*0.25})`);

      ctx.strokeStyle=g;
      ctx.lineWidth=w;
      ctx.shadowColor="rgba(180,240,255,0.70)";
      ctx.shadowBlur=18 + this.width*0.10;

      ctx.beginPath();
      ctx.moveTo(a.x,a.y);
      ctx.lineTo(b.x,b.y);
      ctx.stroke();
    }

    const h=this.history[0];
    const r=70 + this.width*0.55;
    const glow=ctx.createRadialGradient(h.x,h.y,0,h.x,h.y,r);
    glow.addColorStop(0,"rgba(255,255,255,0.95)");
    glow.addColorStop(0.25,"rgba(180,240,255,0.28)");
    glow.addColorStop(1,"rgba(180,240,255,0)");
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.arc(h.x,h.y,r,0,Math.PI*2);
    ctx.fill();

    ctx.restore();
  }
}

// ===== 루프 =====
let beam=null, raf=0, startMs=0, done=false;

function loop(now){
  if(done) return;

  const elapsed = now - startMs;
  const drawNorm = clamp(elapsed / TL.drawMs, 0, 1);

  beam.step(drawNorm);
  beam.render();

  if(elapsed >= TL.drawMs){
    done = true;

    centerGlow.classList.add("is-on");
    whiteout.classList.add("is-on");

    const switchAt = Math.floor(TL.whiteMs * 0.70);

    setTimeout(()=>{
      app.classList.remove("is-intro");
      app.classList.add("is-video");

      if(introVideo){
        try{
          const p = introVideo.play();
          if(p && typeof p.catch === "function") p.catch(()=>{});
        }catch(e){}
      }
    }, switchAt);

    setTimeout(()=>{
      cancelAnimationFrame(raf);
      centerGlow.classList.remove("is-on");
      whiteout.classList.remove("is-on");
    }, TL.whiteMs);

    return;
  }

  raf = requestAnimationFrame(loop);
}

// ✅ 효과음 재생 함수(연타/겹침 방지)
function playTapSfx(){
  if(!tapSfx) return;
  try{
    tapSfx.pause();
    tapSfx.currentTime = 0;
    const p = tapSfx.play();
    if(p && typeof p.catch === "function") p.catch(()=>{});
  }catch(e){}
}

// ===== 시작 =====
let locked=false;
function startSequence(evt){
  if(locked) return;
  locked=true;

  // ✅ 터치 순간 물방울 소리
  playTapSfx();

  // 클릭 위치 리플
  const rect=intro.getBoundingClientRect();
  let x=rect.left+rect.width/2;
  let y=rect.top+rect.height/2;
  if(evt){
    if(evt.touches&&evt.touches[0]){x=evt.touches[0].clientX;y=evt.touches[0].clientY;}
    else if(typeof evt.clientX==="number"){x=evt.clientX;y=evt.clientY;}
  }
  playRipples(x,y);

  done=false;
  cancelAnimationFrame(raf);
  ctx.clearRect(0,0,innerWidth,innerHeight);

  beam = new BeamFixedPath();
  startMs = performance.now();
  raf = requestAnimationFrame(loop);

  setTimeout(()=>locked=false,250);
}

intro.addEventListener("click", startSequence, {passive:true});
intro.addEventListener("touchstart", startSequence, {passive:true});
intro.addEventListener("keydown", e=>{
  if(e.key==="Enter"||e.key===" "){
    e.preventDefault();
    startSequence(null);
  }
});

// iOS 더블탭 방지
let lastTouch=0;
intro.addEventListener("touchend",e=>{
  const now=Date.now();
  if(now-lastTouch<=300) e.preventDefault();
  lastTouch=now;
},{passive:false});
