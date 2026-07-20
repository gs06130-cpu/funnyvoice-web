/* FunnyVoice 웹 — 두뇌 (ffmpeg.wasm) */
const $ = (id) => document.getElementById(id);
const SAFETY_LIMITER = 'alimiter=level_in=1:level_out=1:limit=0.95';

// ── 다국어(한국어/영어) ──
const LANG = (window.LANG === 'en') ? 'en' : 'ko';
const T = {
  ko: {
    preview: '미리듣기', stop: '멈춤', convert: '✨ 변환하기', converting: '변환 중…',
    mp3: '⬇️ MP3 저장', mp3ing: 'MP3 만드는 중…',
    notAudio: '오디오 파일이 아니에요.',
    convErr: '변환 중 문제가 생겼어요. 다른 목소리로 시도해 보세요.',
    mp3Err: 'MP3 변환은 이 브라우저에서 지원되지 않아요. WAV로 저장하세요.',
    needConvert: '먼저 변환하세요.', busy: '처리 중이에요. 잠시만요.',
    count: (n) => `(${n}가지)`,
  },
  en: {
    preview: 'Preview', stop: 'Stop', convert: '✨ Convert', converting: 'Converting…',
    mp3: '⬇️ Save MP3', mp3ing: 'Making MP3…',
    notAudio: 'That is not an audio file.',
    convErr: 'Something went wrong. Try a different voice.',
    mp3Err: 'MP3 is not supported in this browser. Please save as WAV.',
    needConvert: 'Convert first.', busy: 'Working… please wait.',
    count: (n) => `(${n} voices)`,
  },
}[LANG];
// 프리셋 영어 이름 (한국어 이름은 presets.js 에 있음)
const PRESET_NAMES_EN = {
  chipmunk: 'Chipmunk', deepbear: 'Deep Bear', robot: 'Robot', alien: 'Alien', cartoon: 'Cartoon',
  squad: 'Chorus', cave: 'Cave Echo', telephone: 'Telephone', underwater: 'Underwater', ghost: 'Ghost',
  drunk: 'Tipsy', radio: 'Old Radio', giant: 'Giant', baby: 'Baby', demon: 'Demon',
  turbo: 'Turbo', warp: 'Warp', helicopter: 'Helicopter', game8bit: '8-Bit Game', shimmer: 'Shimmer',
};
const presetName = (p) => (LANG === 'en' ? (PRESET_NAMES_EN[p.id] || p.name) : p.name);

const state = {
  file: null, fileName: null,
  presets: window.PRESETS || [],
  presetId: null,
  knob: 50, level: 100,
  busy: false, queued: false,
  outWav: null, outKey: null,
  engineReady: false,
};

let ffmpeg = null;
const audio = new Audio();
audio.addEventListener('ended', () => setPlaying(false));
audio.addEventListener('pause', () => setPlaying(false));

/* ── 유틸 ── */
function fmtDur(s){ if(!s||!isFinite(s)) return ''; const m=Math.floor(s/60), x=Math.round(s%60).toString().padStart(2,'0'); return `${m}:${x}`; }
function settingsKey(){ return `${state.presetId}|${state.knob}|${state.level}|${state.fileName}`; }
function extOf(name){ const m=/\.([a-z0-9]+)$/i.exec(name||''); return m?m[1].toLowerCase():'mp3'; }
let toastTimer=null;
function toast(msg, kind=''){ const t=$('toast'); t.textContent=msg; t.className='toast '+kind; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'),3000); }
function setPlaying(on){ const b=$('playBtn'); if(!b) return; b.querySelector('.play-icon').textContent=on?'⏸':'▶'; b.querySelector('.play-text').textContent=on?T.stop:T.preview; }
function setProgress(p){ $('progressBar').style.width=Math.round(p*100)+'%'; }

/* ── 엔진 로딩 ── */
const WASM_SIZE = 32129114; // 엔진 파일 원본 크기(진행률 계산용)

// 엔진(wasm)을 진행률을 보여주며 내려받습니다 → 멈춘 것처럼 느껴지지 않게.
async function downloadWasmWithProgress(url){
  const pctEl = $('enginePct');
  try{
    const res = await fetch(url);
    if(!res.ok || !res.body) throw new Error('no-stream');
    const reader = res.body.getReader();
    const chunks = []; let received = 0;
    for(;;){
      const { done, value } = await reader.read();
      if(done) break;
      chunks.push(value); received += value.length;
      const pct = Math.min(99, Math.round(received / WASM_SIZE * 100));
      if(pctEl) pctEl.textContent = pct + '%';
    }
    if(pctEl) pctEl.textContent = '100%';
    return URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
  }catch(_){
    if(pctEl) pctEl.textContent = '';
    return url; // 진행률 표시 실패 시 그냥 직접 주소로
  }
}

async function loadEngine(){
  const { FFmpeg } = FFmpegWASM;
  ffmpeg = new FFmpeg();
  ffmpeg.on('progress', ({ progress }) => {
    if (state.busy && progress >= 0 && progress <= 1) setProgress(progress);
  });
  // classWorkerURL 은 넘기지 않습니다 — 넘기면 '모듈 워커'가 되어 importScripts가 막힘.
  const abs = (p) => new URL(p, location.href).href;
  // 엔진 파일을 진행률 보여주며 미리 받기
  const wasmURL = await downloadWasmWithProgress(abs('vendor/ffmpeg/ffmpeg-core.wasm'));
  await ffmpeg.load({
    coreURL: abs('vendor/ffmpeg/ffmpeg-core.js'),
    wasmURL,
  });
  // 로딩이 끝나면 임시로 들고 있던 엔진 사본(약 32MB)을 즉시 비웁니다(메모리 절약).
  if (wasmURL.startsWith('blob:')) { try { URL.revokeObjectURL(wasmURL); } catch(_){} }
  state.engineReady = true;
  $('engineLoading').classList.add('hidden');
  updateConvertEnabled();
}

/* ── 프리셋 ── */
function renderPresets(){
  const grid=$('presetGrid'); grid.innerHTML='';
  state.presets.forEach((p)=>{
    const el=document.createElement('div'); el.className='preset'; el.dataset.id=p.id;
    el.innerHTML=`<div class="p-emoji">${p.emoji}</div><div class="p-name">${presetName(p)}</div>`;
    el.onclick=()=>selectPreset(p.id, true);
    grid.appendChild(el);
  });
  $('presetCount').textContent=T.count(state.presets.length);
  selectPreset(state.presets[0].id, false);
}
function selectPreset(id, auto){
  state.presetId=id;
  document.querySelectorAll('.preset').forEach(el=>el.classList.toggle('active', el.dataset.id===id));
  if(auto && state.file) convert();
}

/* ── 노브 ── */
function renderKnob(){
  const v=state.knob, deg=-135+(v/100)*270;
  $('knobPointer').style.transform=`rotate(${deg}deg)`;
  $('knobValue').textContent=Math.round(v);
  $('knob').setAttribute('aria-valuenow', Math.round(v));
  const filled=(v/100)*270;
  $('knob').style.background=`conic-gradient(from 225deg, var(--accent3) 0deg, var(--accent) ${filled*0.5}deg, var(--accent2) ${filled}deg, rgba(255,255,255,0.08) ${filled}deg 360deg)`;
}
function setupKnob(){
  const knob=$('knob'); let dragging=false, startY=0, startVal=50;
  knob.addEventListener('pointerdown',(e)=>{ dragging=true; startY=e.clientY; startVal=state.knob; knob.setPointerCapture(e.pointerId); });
  knob.addEventListener('pointermove',(e)=>{ if(!dragging) return; let v=startVal+(startY-e.clientY)*0.6; state.knob=Math.max(0,Math.min(100,v)); renderKnob(); });
  const end=()=>{ if(!dragging) return; dragging=false; if(state.file) convert(); };
  knob.addEventListener('pointerup',end); knob.addEventListener('pointercancel',end);
  knob.addEventListener('keydown',(e)=>{ let c=true;
    if(e.key==='ArrowUp'||e.key==='ArrowRight') state.knob=Math.min(100,state.knob+2);
    else if(e.key==='ArrowDown'||e.key==='ArrowLeft') state.knob=Math.max(0,state.knob-2);
    else c=false;
    if(c){ e.preventDefault(); renderKnob(); clearTimeout(knob._t); knob._t=setTimeout(()=>{ if(state.file) convert(); },400); } });
}
function setupLevel(){
  const s=$('levelSlider');
  s.addEventListener('input',()=>{ state.level=Number(s.value); $('levelValue').textContent=state.level+'%'; });
  s.addEventListener('change',()=>{ if(state.file) convert(); });
}

/* ── 파일 ── */
function setupDropzone(){
  const dz=$('dropzone');
  ['dragenter','dragover'].forEach(ev=>window.addEventListener(ev,(e)=>{ e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev=>window.addEventListener(ev,(e)=>{ e.preventDefault(); if(ev==='dragleave'&&e.relatedTarget) return; dz.classList.remove('drag'); }));
  window.addEventListener('drop',(e)=>{ e.preventDefault(); dz.classList.remove('drag');
    const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) loadFile(f); });
  dz.onclick=()=>pickFile();
  $('pickBtn').onclick=(e)=>{ e.stopPropagation(); pickFile(); };
  $('changeFileBtn').onclick=()=>pickFile();
}
function pickFile(){
  const inp=document.createElement('input'); inp.type='file';
  inp.accept='audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac';
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(f) loadFile(f); };
  inp.click();
}
function loadFile(file){
  if(!file.type.startsWith('audio')&&!/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)){
    toast(T.notAudio, 'bad'); return;
  }
  state.file=file; state.fileName=file.name; state.outWav=null; state.outKey=null;
  $('fileName').textContent=file.name;
  $('dropzone').classList.add('hidden'); $('fileBar').classList.remove('hidden');
  // 길이 표시
  const url=URL.createObjectURL(file); const a=new Audio();
  a.addEventListener('loadedmetadata',()=>{ $('fileDur').textContent=fmtDur(a.duration); URL.revokeObjectURL(url); });
  a.src=url;
  updateConvertEnabled();
  convert();
}
function updateConvertEnabled(){
  const ok=!!state.file && state.engineReady;
  $('convertBtn').disabled=!ok;
}

/* ── 변환 (핵심) ── */
async function convert(){
  if(!state.file || !state.engineReady) return;
  if(state.busy){ state.queued=true; return; }
  const key=settingsKey();
  if(key===state.outKey && state.outWav){ playResult(); return; } // 같은 설정이면 재사용

  state.busy=true; state.queued=false;
  $('convertBtn').disabled=true; $('convertText').textContent=T.converting;
  $('progressWrap').classList.remove('hidden'); setProgress(0);

  const preset=state.presets.find(p=>p.id===state.presetId);
  const n=Math.max(0,Math.min(1,state.knob/100));
  const gain=(Math.max(0,Math.min(200,state.level))/100).toFixed(3);
  const filter=`${preset.build(n)},volume=${gain},${SAFETY_LIMITER}`;
  const inName='input.'+extOf(state.fileName);

  try{
    const { fetchFile } = FFmpegUtil;
    await ffmpeg.writeFile(inName, await fetchFile(state.file));
    await ffmpeg.exec(['-i', inName, '-af', filter, '-ar','44100', '-c:a','pcm_s16le', 'out.wav']);
    const data=await ffmpeg.readFile('out.wav');
    state.outWav=data; state.outKey=key;
    setProgress(1);
    $('result').classList.remove('hidden');
    playResult();
    try{ await ffmpeg.deleteFile(inName); await ffmpeg.deleteFile('out.wav'); }catch(_){}
  }catch(err){
    console.error(err);
    toast(T.convErr, 'bad');
  }finally{
    state.busy=false;
    $('convertBtn').disabled=false; $('convertText').textContent=T.convert;
    setTimeout(()=>$('progressWrap').classList.add('hidden'), 500);
    if(state.queued){ state.queued=false; convert(); }
  }
}

function currentWavBlob(){
  return new Blob([state.outWav.buffer ? state.outWav : new Uint8Array(state.outWav)], {type:'audio/wav'});
}
function playResult(){
  if(!state.outWav) return;
  if(audio.src) URL.revokeObjectURL(audio.src);
  audio.src=URL.createObjectURL(currentWavBlob());
  audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
}
function togglePlay(){
  if(!state.outWav){ if(state.file) convert(); return; }
  if(!audio.paused){ audio.pause(); return; }
  audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));
}

/* ── 다운로드 ── */
function triggerDownload(blob, filename){
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
function baseName(){ const p=state.presets.find(x=>x.id===state.presetId); return (state.fileName||'audio').replace(/\.[^.]+$/,'')+'_'+(p?p.id:'funny'); }
async function downloadWav(){
  if(!state.outWav){ toast(T.needConvert); return; }
  triggerDownload(currentWavBlob(), baseName()+'.wav');
}
async function downloadMp3(){
  if(!state.outWav){ toast(T.needConvert); return; }
  if(state.busy){ toast(T.busy); return; }
  state.busy=true; $('mp3Btn').disabled=true; $('mp3Btn').textContent=T.mp3ing;
  try{
    // 복사본(slice)을 넘깁니다 — writeFile 이 원본 버퍼를 가져가(detach) 버리는 것을 방지
    await ffmpeg.writeFile('m.wav', state.outWav.slice());
    await ffmpeg.exec(['-i','m.wav','-c:a','libmp3lame','-b:a','192k','m.mp3']);
    const data=await ffmpeg.readFile('m.mp3');
    triggerDownload(new Blob([data.buffer||data],{type:'audio/mpeg'}), baseName()+'.mp3');
    try{ await ffmpeg.deleteFile('m.wav'); await ffmpeg.deleteFile('m.mp3'); }catch(_){}
  }catch(err){
    console.error(err);
    toast(T.mp3Err, 'bad');
  }finally{
    state.busy=false; $('mp3Btn').disabled=false; $('mp3Btn').textContent=T.mp3;
  }
}

/* ── 시작 ── */
async function init(){
  setupDropzone(); setupKnob(); setupLevel(); renderKnob(); renderPresets();
  $('convertBtn').onclick=convert;
  $('playBtn').onclick=togglePlay;
  $('wavBtn').onclick=downloadWav;
  $('mp3Btn').onclick=downloadMp3;
  try{
    await loadEngine();
  }catch(err){
    console.error(err);
    $('engineLoading').innerHTML='<div class="engine-text">엔진을 불러오지 못했어요 😢</div><div class="engine-sub">페이지를 새로고침 해보세요.</div>';
  }
}
window.addEventListener('DOMContentLoaded', init);
