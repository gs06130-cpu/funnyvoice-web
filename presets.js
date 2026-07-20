/* FunnyVoice 웹 — 20가지 목소리 프리셋 (브라우저용)
 * 데스크톱 앱과 동일한 FFmpeg 필터 공식.
 * window.PRESETS 로 노출됩니다.
 */
(function () {
  function atempoChain(t) {
    const parts = [];
    let remaining = t;
    while (remaining < 0.5) { parts.push('atempo=0.5'); remaining /= 0.5; }
    while (remaining > 2.0) { parts.push('atempo=2.0'); remaining /= 2.0; }
    parts.push('atempo=' + remaining.toFixed(5));
    return parts.join(',');
  }
  function pitch(st) {
    const f = Math.pow(2, st / 12);
    return `aresample=44100,asetrate=${Math.round(44100 * f)},aresample=44100,${atempoChain(1 / f)}`;
  }
  function pitchAndSpeed(st) {
    const f = Math.pow(2, st / 12);
    return `aresample=44100,asetrate=${Math.round(44100 * f)},aresample=44100`;
  }
  // 로봇: afftfilt 가 wasm 코어에 없을 수 있어, 링모드 없이도 되는 방식으로 구성
  // (낮은 피치 + 강한 트레몰로 + 페이저 = 기계적인 느낌)
  const robot = (n) =>
    `${pitch(-(1 + n * 3))},tremolo=f=${(45 + n * 25).toFixed(1)}:d=0.9,aphaser=in_gain=0.6:out_gain=0.8:delay=3:decay=0.5:speed=2`;

  const PRESETS = [
    { id: 'chipmunk', emoji: '🐿️', name: '다람쥐', desc: '아주 높고 귀여운 목소리',
      build: (n) => pitch(5 + n * 10) },
    { id: 'deepbear', emoji: '🐻', name: '저음 곰', desc: '묵직하고 낮은 목소리',
      build: (n) => pitch(-(4 + n * 11)) },
    { id: 'robot', emoji: '🤖', name: '로봇', desc: '기계 같은 목소리',
      build: robot },
    { id: 'alien', emoji: '👽', name: '외계인', desc: '흔들리는 우주 생명체',
      build: (n) => `${pitch(3 + n * 5)},flanger=delay=10:depth=5:speed=2,vibrato=f=${(4 + n * 8).toFixed(2)}:d=0.7` },
    { id: 'cartoon', emoji: '🐰', name: '만화 캐릭터', desc: '통통 튀는 만화 목소리',
      build: (n) => `${pitch(4 + n * 6)},tremolo=f=8:d=0.2` },
    { id: 'squad', emoji: '👥', name: '합창단', desc: '여러 명이 같이 말하는 느낌',
      build: (n) => `chorus=0.7:0.9:${(40 + n * 40).toFixed(0)}|${(50 + n * 40).toFixed(0)}|${(60 + n * 40).toFixed(0)}:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3` },
    { id: 'cave', emoji: '🕳️', name: '동굴 에코', desc: '깊은 동굴 속 겹겹이 울리는 소리',
      build: (n) => {
        const size = 0.6 + n * 1.1;
        const d1 = Math.round(90 * size), d2 = Math.round(180 * size),
              d3 = Math.round(300 * size), d4 = Math.round(450 * size);
        const tail = Math.round(d4 * 1.7);
        const dark = Math.round(7500 - n * 3500);
        return `aecho=0.8:0.9:${d1}|${d2}|${d3}|${d4}:0.5|0.4|0.3|0.22,` +
               `aecho=0.9:0.85:${tail}|${Math.round(tail * 1.5)}:0.35|0.2,lowpass=f=${dark}`;
      } },
    { id: 'telephone', emoji: '☎️', name: '전화기', desc: '옛날 전화 통화 음질',
      build: (n) => `highpass=f=${(300 + n * 200).toFixed(0)},lowpass=f=${(3400 - n * 1200).toFixed(0)}` },
    { id: 'underwater', emoji: '🌊', name: '물속', desc: '물에 잠긴 답답한 소리',
      build: (n) => `lowpass=f=${(1200 - n * 700).toFixed(0)},vibrato=f=${(3 + n * 4).toFixed(2)}:d=0.5` },
    { id: 'ghost', emoji: '👻', name: '유령', desc: '으스스하게 떨리는 목소리',
      build: (n) => `${pitch(-(1 + n * 2))},vibrato=f=${(4 + n * 3).toFixed(2)}:d=0.8,aecho=0.8:0.9:${(200 + n * 300).toFixed(0)}:0.5` },
    { id: 'drunk', emoji: '🍺', name: '술 취한', desc: '느릿느릿 흔들리는 목소리',
      build: (n) => `vibrato=f=${(1.5 + n * 2).toFixed(2)}:d=0.9,tremolo=f=${(1 + n).toFixed(2)}:d=0.4` },
    { id: 'radio', emoji: '📻', name: '옛날 라디오', desc: '지직거리는 낡은 라디오',
      build: (n) => `highpass=f=400,lowpass=f=3000,acrusher=bits=${(8 - n * 4).toFixed(2)}:mode=log:mix=${(0.3 + n * 0.4).toFixed(2)}` },
    { id: 'giant', emoji: '🗿', name: '거인', desc: '거대하고 울리는 목소리',
      build: (n) => `${pitch(-(6 + n * 6))},aecho=0.8:0.9:${(100 + n * 200).toFixed(0)}:0.4` },
    { id: 'baby', emoji: '👶', name: '아기', desc: '아주 작고 앙증맞은 목소리',
      build: (n) => `${pitch(8 + n * 7)},lowpass=f=6000` },
    { id: 'demon', emoji: '😈', name: '악마', desc: '무섭게 낮고 울리는 목소리',
      build: (n) => `${pitch(-(8 + n * 7))},aecho=0.8:0.9:${(80 + n * 120).toFixed(0)}:0.6,vibrato=f=2:d=0.3` },
    { id: 'turbo', emoji: '💨', name: '초고속 다람쥐', desc: '더 빠르고 더 높게',
      build: (n) => pitchAndSpeed(6 + n * 8) },
    { id: 'warp', emoji: '🌀', name: '우주 왜곡', desc: '빙글빙글 휘도는 소리',
      build: (n) => `vibrato=f=${(5 + n * 10).toFixed(2)}:d=1,flanger=delay=20:depth=8:speed=${(1 + n * 4).toFixed(2)}` },
    { id: 'helicopter', emoji: '🚁', name: '헬리콥터', desc: '두두두 끊기는 소리',
      build: (n) => `tremolo=f=${(8 + n * 20).toFixed(2)}:d=${(0.5 + n * 0.4).toFixed(2)}` },
    { id: 'game8bit', emoji: '🎮', name: '8비트 게임', desc: '옛날 게임기 사운드',
      build: (n) => `acrusher=bits=${(6 - n * 4).toFixed(2)}:samples=${1 + Math.round(n * 8)}:mode=log:mix=1` },
    { id: 'shimmer', emoji: '🎤', name: '반짝 보컬', desc: '반짝이는 오토튠풍 목소리',
      build: (n) => `${pitch(1 + n * 2)},chorus=0.6:0.9:55:0.4:0.25:2,flanger=delay=5:depth=3:speed=3` },
  ];

  window.PRESETS = PRESETS;
})();
