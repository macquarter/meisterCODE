/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 캠페인 데이터
   11개 스토리 챕터 + 무한 서바이벌 (이야기 글 · 무전은 story.js)
   서울(1‒3) → 대피 기지(4) → 도쿄(5‒7) → 방콕(8‒9) → 싱가포르(10‒11). 같은 시드 = 같은 도시.
   군용차 · 컨테이너 · 철망 같은 군 시설은 4장(대피 기지)에만 둔다 — 나머지는 도시답게
   지도는 가장자리 너머로 이어 붙으므로(원환) 가장 먼 곳이 반 지도 거리다 — 그만큼 도시를 크게 잡는다
   ═══════════════════════════════════════════ */
const LEVELS = [
  {
    name: '첫 번째 밤',
    brief: '서울. 대피 방송이 끝난 지 아홉 시간. 야간 배송을 마치고 지하에서 올라왔을 때 도시는 이미 떠난 뒤였다. ' +
           '광화문 안뜰이 마지막 구조 집결지라고 했다. 가진 건 권총 한 자루와 손전등뿐이다.',
    goals: ['광화문 안뜰까지 이동', '감염체가 떨어뜨린 무기를 주울 것'],
    seed: 1042, blocks: 9, city: 'seoul', landmarks: ['gwanghwamun'], goal: 'gwanghwamun',
    objective: { type: 'escape' },
    spawn: { initial: 6, rate: 0.22, max: 14 },
    mix: { walker: 1, runner: 0, brute: 0 },
    own: ['pistol'], drops: ['smg'],
    startAmmo: { smg: 40, shell: 0 }, startNades: 2,
    supplies: { ammo: 3, shells: 0, medkit: 2, battery: 2, nade: 1 }
  },
  {
    name: '젖은 골목',
    brief: '광화문은 비어 있었다. 대신 무전기 9번 채널에서 낯선 목소리가 들려온다. ' +
           '남산 아래로 가는 길에 군 보급 상자가 흩어져 있다 — 지금 챙기지 않으면 다음은 없다.',
    goals: ['보급 상자 3개 확보', '확보 후 집결지로 이동'],
    seed: 2207, blocks: 8, city: 'seoul', landmarks: ['namsan', 'gasstation'],
    objective: { type: 'collect', count: 3, item: '보급 상자' },
    spawn: { initial: 8, rate: 0.3, max: 18 },
    mix: { walker: 0.85, runner: 0.15, brute: 0 },
    own: ['pistol'], drops: ['smg', 'shotgun'],
    startAmmo: { smg: 80, shell: 0 }, startNades: 2,
    supplies: { ammo: 3, shells: 2, medkit: 2, battery: 2, nade: 2 }
  },
  {
    name: '달리는 것들',
    brief: '배는 한강 건너 선착장에 있다. 다리 위에는 버려진 차들뿐. 하루가 경고했다 — 느린 것들만 있는 게 아니라고. ' +
           '어떤 것은 뛰고, 어떤 것은 바닥을 기어 불빛 아래로 들어오기 전까지 보이지 않는다.',
    goals: ['한강을 건너 집결지까지 돌파'],
    seed: 3319, weepers: 1, blocks: 10, city: 'seoul', river: true, landmarks: ['namsan', 'gwanghwamun'],
    objective: { type: 'escape' },
    spawn: { initial: 10, rate: 0.4, max: 22 },
    mix: { walker: 0.55, runner: 0.3, brute: 0, crawler: 0.15, bloater: 0.06 },
    own: ['pistol', 'smg'], drops: ['shotgun'],
    startAmmo: { smg: 100, shell: 4 }, startNades: 3,
    supplies: { ammo: 4, shells: 2, medkit: 2, battery: 3, nade: 2 }
  },
  {
    name: '마지막 수송',
    brief: '김 선장의 어선이 한강 하구의 대피 기지에 닿았다. 바다를 건너기엔 기름이 모자라고, 기지의 연료고는 잠겨 있다. ' +
           '출입 카드 세 장이 막사와 창고에 흩어져 있다. 대피를 지휘하던 곳이다 — 무엇이 이곳을 끝냈는지는 곧 보게 된다.',
    goals: ['출입 카드 3장 확보', '본영 헬기장으로 이동'],
    seed: 3907, weepers: 1, blocks: 9, city: 'base', river: true, landmarks: ['evacbase', 'checkpoint', 'railyard'], goal: 'evacbase',
    objective: { type: 'collect', count: 3, item: '출입 카드' },
    spawn: { initial: 14, rate: 0.52, max: 26 },
    mix: { walker: 0.48, runner: 0.32, brute: 0.07, crawler: 0.16, bloater: 0.07 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle'],
    startAmmo: { smg: 100, shell: 8, rifle: 0 }, startNades: 3,
    supplies: { ammo: 4, shells: 3, rounds: 1, medkit: 2, battery: 3, nade: 3 }
  },
  {
    name: '발전소 구역',
    brief: '도쿄. 배는 스미다강 하구에 닿았다. 하루의 무선국은 아사쿠사의 셔터 내린 전파상 안에 있다. ' +
           '발전기 연료가 떨어져 송신이 곧 끊긴다. 연료통 네 개. 발전기 소음은 저들을 부를 것이다.',
    goals: ['연료통 4개 회수', '차단문으로 이동'],
    seed: 4523, weepers: 1, blocks: 9, city: 'tokyo', river: true, landmarks: ['sensoji', 'tokyotower', 'railyard'],
    objective: { type: 'collect', count: 4, item: '연료통' },
    spawn: { initial: 12, rate: 0.5, max: 26 },
    mix: { walker: 0.45, runner: 0.33, brute: 0.05, crawler: 0.17, bloater: 0.07, screamer: 0.04 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle'],
    startAmmo: { smg: 110, shell: 10, rifle: 6 }, startNades: 3,
    supplies: { ammo: 4, shells: 3, rounds: 1, medkit: 2, battery: 3, nade: 2 }
  },
  {
    name: '버텨라',
    brief: '하루가 남쪽 선단의 교신을 잡았다. 마지막 배는 싱가포르에서 떠난다. 그곳으로 가는 화물선의 차단문은 ' +
           '시부야 교차로에서 원격으로만 열린다. 90초. 사방이 트여 있다 — 그만큼 사방에서 온다.',
    goals: ['90초 생존', '개방된 차단문으로 이동'],
    seed: 5631, weepers: 1, blocks: 8, city: 'tokyo', landmarks: ['scramble', 'gasstation'], goal: 'scramble',
    objective: { type: 'survive', time: 90 },
    spawn: { initial: 9, rate: 0.55, max: 24 },
    mix: { walker: 0.4, runner: 0.33, brute: 0.05, crawler: 0.14, spitter: 0.08, bloater: 0.08, screamer: 0.03 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle'],
    startAmmo: { smg: 130, shell: 14, rifle: 10 }, startNades: 3,
    supplies: { ammo: 8, shells: 4, rounds: 2, medkit: 3, battery: 3, nade: 3 }
  },
  {
    name: '거대한 것',
    brief: '출항 전에 할 일이 하나 남았다. 하루의 목소리가 남쪽까지 닿으려면 도쿄 타워에 안테나를 걸어야 한다. ' +
           '공원 관리소 무전의 마지막 단어는 "크다"였다. 탄창 하나로는 멈추지 않는 개체가 이 구역을 돌아다닌다.',
    goals: ['감염체 30기 소탕', '집결지로 이동'],
    seed: 6742, weepers: 1, blocks: 9, city: 'tokyo', landmarks: ['tokyotower', 'scramble'],
    objective: { type: 'purge', count: 30 },
    spawn: { initial: 13, rate: 0.52, max: 22 },
    mix: { walker: 0.35, runner: 0.3, brute: 0.13, crawler: 0.12, spitter: 0.1, bloater: 0.08, screamer: 0.05 },
    own: ['pistol', 'rifle'], drops: ['smg', 'shotgun'],
    startAmmo: { smg: 140, shell: 16, rifle: 15 }, startNades: 4,
    supplies: { ammo: 8, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '정전',
    brief: '방콕. 하루의 중계가 새 목소리를 이어 주었다 — 강 건너 진료소의 간호사 녹. 진료소에는 배터리가 필요하다. ' +
           '예비 배터리는 야시장 노점 사이에 흩어져 있다. 불빛이 꺼지면 방향도, 사격선도 사라진다.',
    goals: ['예비 배터리 5개 회수', '집결지로 이동'],
    seed: 7854, weepers: 2, blocks: 9, city: 'bangkok', landmarks: ['nightmarket', 'democracy', 'gasstation'],
    objective: { type: 'collect', count: 5, item: '예비 배터리' },
    spawn: { initial: 12, rate: 0.6, max: 28 },
    mix: { walker: 0.3, runner: 0.33, brute: 0.13, crawler: 0.12, spitter: 0.12, bloater: 0.1, screamer: 0.06 },
    own: ['pistol', 'smg'], drops: ['shotgun'],
    startAmmo: { smg: 120, shell: 12, rifle: 10 }, startNades: 4,
    supplies: { ammo: 6, shells: 3, rounds: 2, medkit: 3, battery: 2, nade: 3 },
    batteryDrain: 1.9
  },
  {
    name: '기다리는 것',
    brief: '짜오프라야강 건너 왓 아룬 쪽에 진료소의 불빛이 보인다. 진짜 사람의 불빛이다. ' +
           '그런데 다리 앞에 무언가가 서 있다. 저것은 걷지 않는다 — 기다리고 있다.',
    goals: ['그것을 쓰러뜨리고 다리를 건너라'],
    seed: 8967, weepers: 1, blocks: 10, city: 'bangkok', river: true, landmarks: ['watarun', 'democracy'],
    approach: 52,                 // 다리 앞 — 넓어진 지도에서 출구 끝까지 걷게 하지 않는다 (98칸 → 약 52칸)
    objective: { type: 'boss' },
    spawn: { initial: 12, rate: 0.62, max: 26 },
    mix: { walker: 0.26, runner: 0.32, brute: 0.18, crawler: 0.1, spitter: 0.14, bloater: 0.08, screamer: 0.05 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle'],
    startAmmo: { smg: 150, shell: 18, rifle: 20 }, startNades: 5,
    supplies: { ammo: 9, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 }
  },
  {
    name: '남쪽의 신호',
    brief: '싱가포르. 육로로 사흘. 새벽호는 응답이 없다 — 항구까지 전파가 닿지 않는다. 시내의 비상 중계기 세 대를 ' +
           '다시 켜면 하루의 중계와 이어진다. 중계기는 켜지는 동안 소리를 낸다. 그 곁을 지켜야 한다.',
    goals: ['중계기 3대 가동 — 켜질 때까지 곁에 머물 것', '가동 후 집결지로 이동'],
    seed: 9173, weepers: 1, blocks: 8, city: 'singapore', river: true, landmarks: ['supertree', 'hawker', 'railyard'],
    objective: { type: 'signal', count: 3, hold: 6 },
    spawn: { initial: 11, rate: 0.55, max: 24 },
    mix: { walker: 0.3, runner: 0.32, brute: 0.13, crawler: 0.11, spitter: 0.12, bloater: 0.1, screamer: 0.07 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle'],
    startAmmo: { smg: 130, shell: 14, rifle: 14 }, startNades: 4,
    supplies: { ammo: 9, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '새벽호',
    brief: '새벽 네 시. 3번 부두까지는 도시 하나를 가로질러야 한다. 배가 접안하는 동안 부두를 지키고, ' +
           '현문이 내려오면 그때 오른다. 이 도시의 모든 것이 소리를 듣고 몰려올 것이다.',
    goals: ['3번 부두로 이동', '접안할 때까지 부두를 지킬 것', '현문으로 승선'],
    seed: 10289, weepers: 1, blocks: 9, city: 'singapore', landmarks: ['port', 'hawker', 'supertree'], goal: 'port',
    approach: 60,
    objective: { type: 'finale', time: 60, bossAt: 35 },
    spawn: { initial: 12, rate: 0.62, max: 26 },
    mix: { walker: 0.28, runner: 0.32, brute: 0.16, crawler: 0.1, spitter: 0.14, bloater: 0.08, screamer: 0.06 },
    own: ['pistol', 'smg', 'shotgun'], drops: ['rifle'],
    startAmmo: { smg: 150, shell: 18, rifle: 20 }, startNades: 5,
    supplies: { ammo: 9, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 }
  },
  /* ── 2부: 새벽호의 항해 — 지역마다 땅과 날씨가 다르다 ── */
  {
    name: '강가의 계단',
    part: 2,
    brief: '새벽호는 서쪽으로 뱃머리를 돌렸다. 녹의 진료소에 약이 떨어졌다. 바라나시의 병원 창고에 항바이러스제가 남아 있다는 교신. ' +
           '우기의 골목은 진흙탕이다 — 발이 빠지면 느려지고, 저것들도 느려진다.',
    goals: ['약품 상자 4개 확보', '강가의 계단 연못으로 이동'],
    seed: 11471, weepers: 1, blocks: 9, city: 'varanasi', river: true, landmarks: ['kund', 'mandir', 'gasstation'], goal: 'kund',
    objective: { type: 'collect', count: 4, item: '약품 상자' },
    spawn: { initial: 12, rate: 0.58, max: 26 },
    mix: { walker: 0.36, runner: 0.3, brute: 0.1, crawler: 0.12, spitter: 0.1, bloater: 0.08, screamer: 0.05 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle'],
    startAmmo: { smg: 130, shell: 10, rifle: 10 }, startNades: 4,
    supplies: { ammo: 8, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '모래 폭풍',
    part: 2,
    brief: '수에즈로 가는 연료를 채우려면 카이로의 저장고 문을 열어야 한다. 원격 개방까지 100초 — 모래 폭풍이 몰려오는 중이다. ' +
           '폭풍이 지나가는 동안 손전등은 반밖에 닿지 않는다. 모래 더미를 밟으면 발이 묶인다.',
    goals: ['100초 생존', '피라미드 아래 집결지로 이동'],
    seed: 12589, weepers: 1, blocks: 9, city: 'cairo', river: true, landmarks: ['pyramids', 'mosque'], goal: 'pyramids',
    objective: { type: 'survive', time: 100 },
    spawn: { initial: 9, rate: 0.52, max: 23 },
    mix: { walker: 0.36, runner: 0.32, brute: 0.1, crawler: 0.12, spitter: 0.1, bloater: 0.08, screamer: 0.05 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle'],
    startAmmo: { smg: 140, shell: 18, rifle: 12 }, startNades: 4,
    supplies: { ammo: 9, shells: 5, rounds: 2, medkit: 4, battery: 4, nade: 3 }
  },
  {
    name: '잠긴 도시',
    part: 2,
    brief: '지중해. 베네치아의 비상 종탑 중계기 셋이 아직 살아 있다면, 북쪽 바다의 생존자들과 이어진다. ' +
           '조수가 골목까지 들어왔다. 얕은 물은 모두의 발을 늦춘다 — 내 발도, 저것들의 발도.',
    goals: ['중계기 3대 가동 — 켜질 때까지 곁에 머물 것', '가동 후 광장으로 이동'],
    seed: 13697, weepers: 1, blocks: 8, city: 'venice', river: true, landmarks: ['piazza', 'hawker'], goal: 'piazza',
    objective: { type: 'signal', count: 3, hold: 6 },
    spawn: { initial: 12, rate: 0.6, max: 26 },
    mix: { walker: 0.34, runner: 0.3, brute: 0.12, crawler: 0.1, spitter: 0.12, bloater: 0.08, screamer: 0.06 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle'],
    startAmmo: { smg: 150, shell: 12, rifle: 12 }, startNades: 4,
    supplies: { ammo: 9, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '불의 땅',
    part: 2,
    brief: '레이캬비크. 남쪽으로 가는 쇄빙선이 연료를 넣는 동안 항구를 비워야 한다. 땅이 갈라져 용암이 비친다 — ' +
           '붉게 빛나는 금은 밟지 말 것. 저것들은 모른다. 그 위로 몰아넣어라.',
    goals: ['감염체 35기 소탕', '교회 앞 집결지로 이동'],
    seed: 14713, weepers: 1, blocks: 9, city: 'reykjavik', landmarks: ['hallgrim', 'geyser', 'gasstation'],
    objective: { type: 'purge', count: 35 },
    spawn: { initial: 12, rate: 0.57, max: 25 },
    mix: { walker: 0.32, runner: 0.3, brute: 0.14, crawler: 0.1, spitter: 0.12, bloater: 0.08, screamer: 0.06 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle'],
    startAmmo: { smg: 150, shell: 20, rifle: 16 }, startNades: 5,
    supplies: { ammo: 9, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 }
  },
  {
    name: '마지막 기지',
    part: 2,
    brief: '남극. 감염이 닿지 않은 마지막 곳이라던 연구 기지는 조용했다. 헬기는 120초 뒤에 내린다. ' +
           '얼음판 위에서는 멈추려 해도 미끄러진다 — 눈보라가 오면 불빛도 삼켜진다. 헬기장을 지켜라.',
    goals: ['120초 생존', '헬기장으로 이동'],
    seed: 15821, weepers: 1, blocks: 9, city: 'antarctic', landmarks: ['station', 'icebreaker'], goal: 'station',
    objective: { type: 'survive', time: 120 },
    spawn: { initial: 12, rate: 0.64, max: 28 },
    mix: { walker: 0.3, runner: 0.32, brute: 0.14, crawler: 0.1, spitter: 0.12, bloater: 0.08, screamer: 0.06 },
    own: ['pistol', 'smg', 'shotgun'], drops: ['rifle'],
    startAmmo: { smg: 170, shell: 20, rifle: 20 }, startNades: 5,
    supplies: { ammo: 10, shells: 5, rounds: 3, medkit: 5, battery: 5, nade: 4 }
  }
];
/** 1부(서울 → 싱가포르)의 마지막 장 — 여기를 마치면 1부 엔딩, 다음 장부터 2부 */
const PART1_END = 10;

/* 서바이벌: 웨이브가 끝없이 상승한다 */
const SURVIVAL = {
  name: '서바이벌',
  brief: '탈출로는 없다. 얼마나 오래 버티는지만 기록된다.',
  goals: ['최대한 오래 생존'],
  seed: 0, blocks: 9, city: 'seoul', river: true, landmarks: [],   // 도시는 시작할 때 고른다
  objective: { type: 'endless' },
  spawn: { initial: 8, rate: 0.4, max: 46 },
  mix: { walker: 0.6, runner: 0.25, brute: 0, crawler: 0.15 },
  own: ['pistol', 'smg'], drops: ['shotgun', 'rifle', 'smg'],
  startAmmo: { smg: 120, shell: 6, rifle: 0 }, startNades: 3,
  supplies: { ammo: 6, shells: 4, rounds: 2, medkit: 3, battery: 4, nade: 3 }
};

/** 난이도에 따른 시작 무기 — 장마다 정한 기본 장비(own)에서
    생존자(쉬움)는 그 장에서 떨어지는 총 하나를 더 들고, 절멸(어려움)은 가장 센 총 하나를 내려놓는다(권총은 늘 남는다).
    나머지 총은 쓰러뜨린 감염체가 떨어뜨린다(drops) */
function startKit(L, diff) {
  const own = (L.own || ['pistol']).slice();
  if (!own.includes('pistol')) own.unshift('pistol');
  if (L.fixedKit) return own;                       // 도전 — 규칙이 정한 그대로
  if (diff === 'easy') { const extra = (L.drops || []).find(k => !own.includes(k)); if (extra) own.push(extra); }
  else if (diff === 'hard' && own.length > 1) {
    const order = ['rifle', 'shotgun', 'smg'];
    const k = order.find(x => own.includes(x)); own.splice(own.indexOf(k), 1);
  }
  return own;
}

/** 서바이벌에서 고를 수 있는 도시와 그 랜드마크 */
const SURVIVAL_CITIES = {
  seoul:   { river: true,  landmarks: ['gwanghwamun', 'namsan'] },
  tokyo:   { river: true,  landmarks: ['scramble', 'tokyotower', 'sensoji', 'railyard'] },
  bangkok: { river: true,  landmarks: ['watarun', 'democracy', 'nightmarket', 'gasstation'] },
  singapore: { river: true, landmarks: ['port', 'supertree', 'hawker', 'railyard'] },
  varanasi:  { river: true,  landmarks: ['kund', 'mandir', 'gasstation'] },
  cairo:     { river: true,  landmarks: ['pyramids', 'mosque', 'gasstation'] },
  venice:    { river: true,  landmarks: ['piazza', 'hawker'] },
  reykjavik: { river: false, landmarks: ['hallgrim', 'geyser'] },
  antarctic: { river: false, landmarks: ['station', 'icebreaker'] }
};

/* 도전 — 원작의 '점수 도전 레벨'. 짧고 규칙이 하나씩 붙은 판에서 점수를 겨룬다.
   연달아(2.5초 안에) 쓰러뜨리면 배수가 0.25씩 오른다(최대 ×3). 메달 문턱은 봇으로 잰 점수에 맞췄다 */
const ALL_GUNS = ['pistol', 'smg', 'shotgun', 'rifle'];
const CHALLENGES = [
  { id: 'hunt', name: '사냥 시간', note: '2분 동안 최대한 많이. 연달아 쓰러뜨리면 배수가 오른다.',
    city: 'seoul', seed: 31117, blocks: 8, river: true, landmarks: ['gwanghwamun', 'namsan'], time: 120, rules: { hordeEvery: 25 },
    own: ['pistol', 'smg', 'shotgun'], startAmmo: { smg: 200, shell: 24, rifle: 0 }, startNades: 3,
    supplies: { ammo: 8, shells: 4, rounds: 0, medkit: 3, battery: 4, nade: 3 },
    spawn: { initial: 20, rate: 1.6, max: 44 }, mix: { walker: 0.55, runner: 0.3, crawler: 0.15 },
    medals: [1000, 1800, 2600] },
  { id: 'pistol', name: '권총 한 자루', note: '권총과 수류탄 셋뿐. 90초.',
    city: 'tokyo', seed: 32233, blocks: 8, river: false, landmarks: ['scramble'], time: 90, rules: { pistolOnly: true },
    own: ['pistol'], startAmmo: { smg: 0, shell: 0, rifle: 0 }, startNades: 3,
    supplies: { ammo: 0, shells: 0, rounds: 0, medkit: 3, battery: 3, nade: 2 },
    spawn: { initial: 10, rate: 0.8, max: 26 }, mix: { walker: 0.5, runner: 0.35, crawler: 0.15 },
    medals: [350, 600, 900] },
  { id: 'dark', name: '정전의 밤', note: '배터리가 네 배로 닳는다. 불빛을 아껴라. 2분.',
    city: 'bangkok', seed: 33349, blocks: 8, river: true, landmarks: ['nightmarket'], time: 120, batteryDrain: 4.5,
    own: ['pistol', 'smg', 'shotgun'], startAmmo: { smg: 160, shell: 16, rifle: 0 }, startNades: 3,
    supplies: { ammo: 6, shells: 3, rounds: 0, medkit: 3, battery: 5, nade: 2 },
    spawn: { initial: 12, rate: 0.8, max: 30 }, mix: { walker: 0.45, runner: 0.3, crawler: 0.15, screamer: 0.05, bloater: 0.05 },
    medals: [500, 1100, 1600] },
  { id: 'horde', name: '무리', note: '12초마다 무리가 온다. 150초를 버티며 쓰러뜨려라.',
    city: 'singapore', seed: 34457, blocks: 8, river: true, landmarks: ['hawker'], time: 150, rules: { hordeEvery: 12 },
    own: ALL_GUNS, startAmmo: { smg: 220, shell: 30, rifle: 20 }, startNades: 5,
    supplies: { ammo: 10, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 },
    spawn: { initial: 8, rate: 0.5, max: 40 }, mix: { walker: 0.5, runner: 0.3, brute: 0.08, crawler: 0.12 },
    medals: [1500, 2800, 4200] },
  { id: 'bigone', name: '큰 사냥감', note: '그것이 처음부터 쫓아온다. 빨리 쓰러뜨릴수록 점수가 크다. 3분.',
    city: 'tokyo', seed: 35563, blocks: 8, river: false, landmarks: ['tokyotower'], time: 180, rules: { boss: true },
    own: ALL_GUNS, startAmmo: { smg: 200, shell: 30, rifle: 30 }, startNades: 6,
    supplies: { ammo: 8, shells: 5, rounds: 4, medkit: 4, battery: 4, nade: 4 },
    spawn: { initial: 6, rate: 0.35, max: 16 }, mix: { walker: 0.6, runner: 0.25, crawler: 0.15 },
    medals: [1200, 2600, 3600] }
];
