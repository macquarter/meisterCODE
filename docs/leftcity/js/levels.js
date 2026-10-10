/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 캠페인 데이터
   12개 스토리 챕터 + 무한 서바이벌 (이야기 글 · 무전은 story.js)
   서울(1‒3) → 대피 기지(4) → 도쿄(5‒7) → 방콕(8‒9) → 싱가포르(10‒11). 같은 시드 = 같은 도시.
   군용차 · 컨테이너 · 철망 같은 군 시설은 4장(대피 기지)에만 둔다 — 나머지는 도시답게
   지도는 가장자리 너머로 이어 붙으므로(원환) 가장 먼 곳이 반 지도 거리다 — 그만큼 도시를 크게 잡는다
   ═══════════════════════════════════════════ */
const LEVELS = [
  {
    name: '첫 번째 밤',
    part: 1,
    brief: '서울. 대피 방송이 끝난 지 아홉 시간. 야간 배송을 마치고 지하에서 올라왔을 때 도시는 이미 떠난 뒤였다. ' +
           '광화문 안뜰이 마지막 구조 집결지라고 했다. 가진 건 권총 한 자루와 손전등뿐이다.',
    goals: ['광화문 안뜰까지 이동', '감염체가 떨어뜨린 무기를 주울 것'],
    seed: 1042, blocks: 12, city: 'seoul', landmarks: ['gwanghwamun'], goal: 'gwanghwamun',
    objective: { type: 'escape' },
    twist: { type: 'crescendo', name: '지하철 셔터', at: 0.32, time: 25, every: 7, blocked: '지하철 셔터가 내려와 길이 막혔다 — 제어반을 가동하라', start: '셔터가 올라간다 — 경보에 무리가 몰려온다. 버텨라', brief: '변수: 길을 막은 지하철 셔터 — 제어반을 켜면 경보가 울린다. 셔터가 다 올라갈 때까지 버틸 것' },
    spawn: { initial: 6, rate: 0.22, max: 14 },
    mix: { walker: 1, runner: 0, brute: 0 },          // 진압 경찰은 2장부터 — 권총 하나뿐인 첫 판에 정면 사격이 막히는 적은 가혹했다(봇 두 판 다 여기서 죽었다)
    own: ['pistol'], drops: ['smg'],
    startAmmo: { smg: 40, shell: 0 }, startNades: 2,
    supplies: { ammo: 3, shells: 0, medkit: 2, battery: 2, nade: 1 }
  },
  {
    name: '마지막 수송',
    part: 1,
    brief: '김 선장의 어선이 한강 하구의 대피 기지에 닿았다. 바다를 건너기엔 기름이 모자라고, 기지의 연료고는 잠겨 있다. ' +
           '출입 카드 세 장이 막사와 창고에 흩어져 있다. 대피를 지휘하던 곳이다 — 무엇이 이곳을 끝냈는지는 곧 보게 된다.',
    goals: ['출입 카드 3장 확보', '본영 헬기장으로 이동'],
    seed: 3907, weepers: 1, blocks: 9, city: 'base', river: true, landmarks: ['evacbase', 'checkpoint', 'railyard'], goal: 'evacbase',
    objective: { type: 'collect', count: 3, item: '출입 카드' },
    twist: { type: 'gauntlet', when: 'exit', msg: '기지 경보 — 헬기장까지 뛰어라', brief: '변수: 마지막 카드를 꽂는 순간 기지 경보가 울린다. 헬기장까지 쉬지 말고 뛸 것' },
    spawn: { initial: 14, rate: 0.52, max: 26 },
    mix: { walker: 0.48, runner: 0.32, brute: 0.07, crawler: 0.16, bloater: 0.07, riot: 0.08, leaper: 0.04 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle', 'magnum'],
    startAmmo: { smg: 100, shell: 8, rifle: 0 }, startNades: 3,
    supplies: { ammo: 4, shells: 3, rounds: 1, medkit: 2, battery: 3, nade: 3 }
  },
  {
    name: '거대한 것',
    part: 1,
    brief: '출항 전에 할 일이 하나 남았다. 하루의 목소리가 남쪽까지 닿으려면 도쿄 타워에 안테나를 걸어야 한다. ' +
           '공원 관리소 무전의 마지막 단어는 "크다"였다. 탄창 하나로는 멈추지 않는 개체가 이 구역을 돌아다닌다.',
    goals: ['감염체 40기 소탕', '집결지로 이동'],
    seed: 6742, weepers: 1, blocks: 9, city: 'tokyo', landmarks: ['tokyotower', 'scramble'],
    objective: { type: 'purge', count: 40 },
    twist: { type: 'airdrop', at: 40, brief: '변수: 보급 투하 — 붉은 섬광이 떨어진 곳을 60초 안에 열면 장비를 얻는다(선택)' },
    spawn: { initial: 13, rate: 0.52, max: 22 },
    mix: { walker: 0.35, runner: 0.3, brute: 0.13, crawler: 0.12, spitter: 0.1, bloater: 0.08, screamer: 0.05, leaper: 0.05, riot: 0.04 },
    own: ['pistol', 'rifle'], drops: ['smg', 'shotgun', 'crossbow'],
    startAmmo: { smg: 140, shell: 16, rifle: 15 }, startNades: 4,
    supplies: { ammo: 8, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '기다리는 것',
    part: 2,
    brief: '짜오프라야강 건너 왓 아룬 쪽에 진료소의 불빛이 보인다. 진짜 사람의 불빛이다. ' +
           '그런데 다리 앞에 무언가가 서 있다. 저것은 걷지 않는다 — 기다리고 있다.',
    goals: ['그것을 쓰러뜨리고 다리를 건너라'],
    seed: 8967, weepers: 1, blocks: 10, city: 'bangkok', river: true, landmarks: ['watarun', 'democracy'],
    approach: 80,                 // rc.53 — 2분 넘게(예전 52칸은 1분 만에 끝났다). 다리 앞 — 넓어진 지도에서 출구 끝까지 걷게 하지 않는다 (98칸 → 약 52칸)
    objective: { type: 'boss' },
    twist: { type: 'crescendo', name: '수문 제어반', at: 0.22, time: 22, every: 7, blocked: '다리가 들려 있다 — 수문 제어반을 가동하라', brief: '변수: 다리를 내리려면 수문 제어반을 가동해 경보를 버텨야 한다' },
    spawn: { initial: 12, rate: 0.62, max: 26 },
    mix: { walker: 0.26, runner: 0.32, brute: 0.18, crawler: 0.1, spitter: 0.14, bloater: 0.08, screamer: 0.05, leaper: 0.05, charger: 0.03 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle', 'magnum', 'auto'],
    startAmmo: { smg: 150, shell: 18, rifle: 20 }, startNades: 5,
    supplies: { ammo: 9, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 }
  },
  {
    name: '새벽호',
    part: 2,
    brief: '새벽 네 시. 3번 부두까지는 도시 하나를 가로질러야 한다. 배가 접안하는 동안 부두를 지키고, ' +
           '현문이 내려오면 그때 오른다. 이 도시의 모든 것이 소리를 듣고 몰려올 것이다.',
    goals: ['3번 부두로 이동', '접안할 때까지 부두를 지킬 것', '현문으로 승선'],
    seed: 10289, weepers: 1, blocks: 9, city: 'singapore', landmarks: ['port', 'hawker', 'supertree'], goal: 'port',
    approach: 60,
    objective: { type: 'finale', time: 60, bossAt: 35 },
    twist: { type: 'scavenge', count: 3, tank: '배', brief: '변수: 배에 연료가 없다 — 연료통 3개를 하나씩 날라 와야 접안이 시작된다' },
    spawn: { initial: 12, rate: 0.62, max: 26 },
    mix: { walker: 0.28, runner: 0.32, brute: 0.16, crawler: 0.1, spitter: 0.14, bloater: 0.08, screamer: 0.06, leaper: 0.05, puller: 0.04, charger: 0.03 },
    own: ['pistol', 'smg', 'shotgun'], drops: ['rifle', 'lmg', 'auto'],
    startAmmo: { smg: 150, shell: 18, rifle: 20 }, startNades: 5,
    supplies: { ammo: 9, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 }
  },
  /* ── 2부: 새벽호의 항해 — 지역마다 땅과 날씨가 다르다 ── */
  {
    name: '강가의 계단',
    part: 3,
    brief: '새벽호는 서쪽으로 뱃머리를 돌렸다. 녹의 진료소에 약이 떨어졌다. 바라나시의 병원 창고에 항바이러스제가 남아 있다는 교신. ' +
           '우기의 골목은 진흙탕이다 — 발이 빠지면 느려지고, 저것들도 느려진다.',
    goals: ['약품 상자 4개 확보', '강가의 계단 연못으로 이동'],
    seed: 11471, weepers: 1, blocks: 9, city: 'varanasi', river: true, landmarks: ['kund', 'mandir', 'gasstation'], goal: 'kund',
    objective: { type: 'collect', count: 4, item: '약품 상자' },
    twist: { type: 'airdrop', at: 50, brief: '변수: 보급 투하 — 붉은 섬광이 떨어진 곳을 60초 안에 열면 장비를 얻는다(선택)' },
    spawn: { initial: 12, rate: 0.58, max: 26 },
    mix: { walker: 0.36, runner: 0.3, brute: 0.1, crawler: 0.12, spitter: 0.1, bloater: 0.08, screamer: 0.05, leaper: 0.05, puller: 0.04, charger: 0.03, riot: 0.04 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle', 'magnum', 'crossbow'],
    startAmmo: { smg: 130, shell: 10, rifle: 10 }, startNades: 4,
    supplies: { ammo: 8, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '모래 폭풍',
    part: 3,
    brief: '수에즈로 가는 연료를 채우려면 카이로의 저장고 문을 열어야 한다. 원격 개방까지 100초 — 모래 폭풍이 몰려오는 중이다. ' +
           '폭풍이 지나가는 동안 손전등은 반밖에 닿지 않는다. 모래 더미를 밟으면 발이 묶인다.',
    goals: ['100초 생존', '피라미드 아래 집결지로 이동'],
    seed: 12589, weepers: 1, blocks: 9, city: 'cairo', river: true, landmarks: ['pyramids', 'mosque'], goal: 'pyramids',
    objective: { type: 'survive', time: 100 },
    twist: { type: 'airdrop', at: 35, brief: '변수: 모래 폭풍 속 보급 투하 — 60초 안에 열면 장비를 얻는다(선택)' },
    spawn: { initial: 9, rate: 0.52, max: 23 },
    mix: { walker: 0.36, runner: 0.32, brute: 0.1, crawler: 0.12, spitter: 0.1, bloater: 0.08, screamer: 0.05, leaper: 0.05, puller: 0.04, charger: 0.03, riot: 0.04 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle', 'auto', 'lmg'],
    startAmmo: { smg: 140, shell: 18, rifle: 12 }, startNades: 4,
    supplies: { ammo: 9, shells: 5, rounds: 2, medkit: 4, battery: 4, nade: 3 }
  },
  {
    name: '두 대륙 사이',
    part: 3,
    brief: '이스탄불. 새벽호의 기관이 수에즈를 지나며 망가졌다. 갈라타 부두 정비창에 부품이 남아 있다는 교신 — 보스포루스를 건너기 전에 챙겨야 한다. ' +
           '비 온 뒤 언덕의 돌길에는 진흙이 고였다. 발이 빠지면 느려지고, 저것들도 느려진다.',
    goals: ['기관 부품 3개 확보', '아야 소피아 앞마당으로 이동'],
    seed: 16903, weepers: 1, blocks: 9, city: 'istanbul', river: true, landmarks: ['hagia', 'galata', 'gasstation'], goal: 'hagia',
    objective: { type: 'collect', count: 3, item: '기관 부품' },
    twist: { type: 'gauntlet', when: 'exit', msg: '사이렌 — 앞마당까지 뛰어라', brief: '변수: 마지막 부품을 드는 순간 해협의 사이렌이 울린다. 앞마당까지 쉬지 말고 뛸 것' },
    spawn: { initial: 12, rate: 0.58, max: 26 },
    mix: { walker: 0.34, runner: 0.32, brute: 0.12, crawler: 0.1, spitter: 0.1, bloater: 0.08, screamer: 0.05, leaper: 0.05, puller: 0.04, charger: 0.03, riot: 0.05 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle', 'magnum', 'crossbow', 'auto'],
    startAmmo: { smg: 150, shell: 12, rifle: 12 }, startNades: 4,
    supplies: { ammo: 9, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '잠긴 도시',
    part: 3,
    brief: '지중해. 베네치아의 비상 종탑 중계기 셋이 아직 살아 있다면, 북쪽 바다의 생존자들과 이어진다. ' +
           '조수가 골목까지 들어왔다. 얕은 물은 모두의 발을 늦춘다 — 내 발도, 저것들의 발도.',
    goals: ['중계기 3대 가동 — 켜질 때까지 곁에 머물 것', '가동 후 광장으로 이동'],
    seed: 13697, weepers: 1, blocks: 8, city: 'venice', river: true, landmarks: ['piazza', 'hawker'], goal: 'piazza',
    objective: { type: 'signal', count: 3, hold: 6 },
    twist: { type: 'crescendo', name: '홍수 방벽', at: 0.2, time: 24, every: 7, blocked: '물이 차오른다 — 홍수 방벽을 올려야 광장으로 갈 수 있다', brief: '변수: 광장 앞 홍수 방벽 — 올라갈 때까지 경보 속에서 버틸 것' },
    spawn: { initial: 12, rate: 0.6, max: 26 },
    mix: { walker: 0.34, runner: 0.3, brute: 0.12, crawler: 0.1, spitter: 0.12, bloater: 0.08, screamer: 0.06, leaper: 0.05, puller: 0.04, charger: 0.03, riot: 0.04 },
    own: ['pistol', 'smg'], drops: ['shotgun', 'rifle', 'lmg', 'crossbow'],
    startAmmo: { smg: 150, shell: 12, rifle: 12 }, startNades: 4,
    supplies: { ammo: 9, shells: 4, rounds: 2, medkit: 4, battery: 3, nade: 3 }
  },
  {
    name: '선별',
    part: 4,
    brief: '레이캬비크. 남극으로 가는 쇄빙선은 떠나기 전 부두에서 "선별"을 한다. 손목에 번호를 쓴 사람들이 줄을 섰다. ' +
           '유나의 열은 내리지 않았다. 교회 앞까지 — 붉게 빛나는 금은 밟지 말고, 쫓아오는 것들을 그 위로 끌어들이며 건너라. ' +
           '용암이 길을 끊은 곳은 지열 펌프장 건물 안으로 돌아가야 한다.',
    goals: ['용암 지대를 지나 펌프장 입구까지', '펌프장 안을 지나 교회 쪽 출구로'],
    inside: { map: 'interior', variant: 'plant', blocks: 8, goals: ['펌프장 안을 지나 교회 쪽 출구로'], enter: '지열 펌프장 안 — 기계 사이에 서 있는 것들이다. 교회 쪽 출구를 찾아라' },
    seed: 14713, weepers: 1, blocks: 12, city: 'reykjavik', landmarks: ['hallgrim', 'geyser', 'gasstation'], goal: 'hallgrim',
    objective: { type: 'escape' },
    twist: { type: 'gauntlet', when: 'half', at: 0.5, msg: '분화 — 교회까지 뛰어라', brief: '변수: 길의 절반에서 화산이 터진다. 그때부터 교회까지 쉼 없이 몰려온다' },
    spawn: { initial: 16, rate: 0.68, max: 28 },
    mix: { walker: 0.32, runner: 0.3, brute: 0.14, crawler: 0.1, spitter: 0.12, bloater: 0.08, screamer: 0.06, leaper: 0.05, puller: 0.04, charger: 0.03, riot: 0.04 },
    own: ['pistol', 'shotgun'], drops: ['smg', 'rifle', 'magnum', 'auto', 'lmg'],
    startAmmo: { smg: 150, shell: 20, rifle: 16 }, startNades: 5,
    supplies: { ammo: 9, shells: 5, rounds: 3, medkit: 4, battery: 4, nade: 4 }
  },
  {
    name: '빈 목소리',
    part: 4,
    brief: '리우데자네이루. 마지막 급유 — 언덕 위 구세주상 아래에서 90초를 버티면 된다. ' +
           '그런데 오늘 아침부터 하루의 방송이 이상하다. 같은 말을, 같은 자리에서 끊으며 되풀이한다.',
    goals: ['90초 생존', '구세주상 아래 집결지로 이동'],
    seed: 17929, weepers: 1, blocks: 9, city: 'rio', landmarks: ['redeemer', 'copacabana', 'gasstation'], goal: 'redeemer',
    objective: { type: 'survive', time: 90 },
    twist: { type: 'crescendo', name: '케이블카 제어반', at: 0.28, time: 24, every: 7, blocked: '케이블카가 멈춰 있다 — 제어반을 가동해야 언덕에 오른다', brief: '변수: 언덕으로 가는 케이블카 — 제어반을 켜면 경보가 울린다. 다 올라올 때까지 버틸 것' },
    spawn: { initial: 12, rate: 0.62, max: 27 },
    mix: { walker: 0.3, runner: 0.34, brute: 0.12, crawler: 0.12, spitter: 0.12, bloater: 0.08, screamer: 0.06, leaper: 0.06, puller: 0.04, charger: 0.04, riot: 0.03 },
    own: ['pistol', 'smg', 'shotgun'], drops: ['rifle', 'crossbow', 'lmg', 'auto'],
    startAmmo: { smg: 170, shell: 22, rifle: 16 }, startNades: 5,
    supplies: { ammo: 10, shells: 5, rounds: 3, medkit: 5, battery: 4, nade: 4 }
  },
  {
    name: '정화 구역',
    part: 4,
    brief: '남극. 약속된 마지막 피난처의 문은 열려 있지 않았다 — 철망과 감시탑, 그리고 "회수 대상" 명단. 맨 위에 유나의 이름이 있다. ' +
           '헬기장까지 가서 헬기를 띄워라. 얼음판은 미끄럽고, 눈보라는 불빛을 삼키고, 얼음 밑에서 무언가 올라온다.',
    goals: ['헬기장으로 이동', '헬기가 내릴 때까지 헬기장을 지킬 것', '헬기에 탑승'],
    seed: 15821, weepers: 1, blocks: 9, city: 'antarctic', landmarks: ['station', 'icebreaker'], goal: 'station',
    approach: 60,
    objective: { type: 'finale', time: 70, bossAt: 38, place: '헬기장', holdMsg: '헬기가 온다 — {s}초 버텨라', hud: '헬기 착륙까지 {s}초 — 버텨라', go: '헬기장으로 가라', open: '헬기가 내렸다 — 올라타라', board: '헬기에 올라타라', row: '헬기', rowOpen: '착륙', rowGo: '헬기장으로 이동 중' },
    twist: { type: 'scavenge', count: 3, tank: '구조 헬기', brief: '변수: 헬기에 연료가 없다 — 연료통 3개를 날라 와야 착륙이 시작된다' },
    spawn: { initial: 12, rate: 0.64, max: 28 },
    mix: { walker: 0.3, runner: 0.32, brute: 0.14, crawler: 0.1, spitter: 0.12, bloater: 0.08, screamer: 0.06, leaper: 0.06, puller: 0.04, charger: 0.04, riot: 0.04 },
    own: ['pistol', 'smg', 'shotgun'], drops: ['rifle', 'magnum', 'lmg', 'auto', 'crossbow'],
    startAmmo: { smg: 230, shell: 28, rifle: 20 }, startNades: 6,
    supplies: { ammo: 12, shells: 6, rounds: 3, medkit: 6, battery: 5, nade: 5 }
  }
];
/* 장마다 두 미션 — A(진입): 같은 도시의 다른 구역에서 목표가 다른 짧은 판, B(본편): 위의 이야기 미션.
   A 를 마쳐야 B 가 열리고, B 를 마치면 다음 장으로. A 의 지도 · 목표 · 변수는 본편과 겹치지 않게 골랐다 */
const STAGE_A = [
  { name: '지하 상가', map: 'subway', brief: '지하에서 올라오기 전에 챙길 것이 있다. 무너진 상가 어딘가에 구급 가방 세 개가 남아 있을 것이다. 휴대폰에는 동생 유나의 음성 메시지가 하나 — 아직 듣지 못했다.',
    goals: ['구급 가방 3개 확보', '지상 출구로 이동'], objective: { type: 'collect', count: 3, item: '구급 가방' }, blocks: 8, spawnK: 0.7 },
  { name: '검문소의 밤', brief: '기지로 가는 길목의 검문소. 유나의 학교 버스도 이 길을 지났을까. 차단기가 올라갈 때까지 초소를 지켜야 한다.',
    goals: ['100초 버티기', '열린 차단문으로 이동'], objective: { type: 'survive', time: 100 }, blocks: 8 },
  { name: '시부야 방송국', map: 'interior', variant: 'office', brief: '하루의 방송을 남쪽으로 이으려면 방송국 건물 안 비상 중계기 세 대부터 살려야 한다. 복도마다 잠든 것들 — 감시등에 걸리면 경보가 울린다.',
    goals: ['중계기 3대 가동', '집결지로 이동'], objective: { type: 'signal', count: 3, hold: 6 }, blocks: 8 },
  { name: '수상 시장', brief: '배를 띄울 연료가 없다. 물 위 시장의 창고들에 연료통이 흩어져 있다.',
    goals: ['연료통 4개 확보', '선착장으로 이동'], objective: { type: 'collect', count: 4, item: '연료통' }, blocks: 8,
    twist: { type: 'airdrop', at: 35, brief: '변수: 보급 투하 — 붉은 섬광이 떨어진 곳을 60초 안에 열면 장비를 얻는다(선택)' } },
  { name: 'MRT 터널', map: 'subway', brief: '부두로 가는 지상길은 무리로 막혔다. 환승역의 출구 셔터는 전원이 끊겨 내려와 있다. 역 곳곳에 흩어진 퓨즈를 모아 배전반을 살려라 — 발전기는 시끄럽다.',
    goals: ['퓨즈 3개 찾기', '배전반 전원 올리기 — 발전기가 도는 동안 버티기', '열린 셔터로 이동'], objective: { type: 'power', count: 3, item: '퓨즈', hold: 3, time: 40 }, blocks: 8 },
  { name: '가트의 계단', brief: '강가의 계단을 따라 약품 창고까지 내려가야 한다. 연기 너머 창고 입구를 찾고, 서 있는 것들로 가득한 창고 안을 지나 반대편으로 빠져나갈 것.',
    goals: ['약품 창고 입구까지 이동', '창고 안을 지나 출구로'], objective: { type: 'escape' }, blocks: 9,
    inside: { map: 'interior', variant: 'market', blocks: 8, goals: ['창고 안을 지나 출구로'], enter: '약품 창고 안 — 서 있는 것들 사이로 조용히 반대편 출구를 찾아라' } },
  { name: '칸 엘 칼릴리', brief: '모래 폭풍 전에 물을 챙겨야 한다. 시장 골목에 물통 네 개가 흩어져 있다.',
    goals: ['물통 4개 확보', '집결지로 이동'], objective: { type: 'collect', count: 4, item: '물통' }, blocks: 8 },
  { name: '그랜드 바자르', map: 'interior', variant: 'market', brief: '지붕 덮인 시장을 누군가 감시등으로 지키고 있다. 무리의 둥지 한가운데를 지나가야 한다 — 감시등마다 붙은 배전함을 조용히 내려 어둠을 만들어라.',
    goals: ['배전함 3개 내리기 — 감시등에 걸리지 말 것', '어둠을 따라 출구로'], objective: { type: 'blackout', count: 3, hold: 2.5 }, blocks: 8,
    twist: { type: 'airdrop', at: 30, brief: '변수: 보급 투하 — 붉은 섬광이 떨어진 곳을 60초 안에 열면 장비를 얻는다(선택)' } },
  { name: '리알토 다리', brief: '물이 차오르기 전에 다리를 건너 광장 쪽 건물로 들어가야 한다. 건물 안을 지나면 물에 잠기지 않은 뒷길이다.',
    goals: ['다리 건너 건물 입구까지', '건물 안을 지나 뒷길로'], objective: { type: 'escape' }, blocks: 9,
    inside: { map: 'interior', variant: 'office', blocks: 8, goals: ['건물 안을 지나 뒷길로'], enter: '건물 안 — 복도마다 서 있는 것들이다. 조용히 뒷길 출구를 찾아라' } },
  { name: '지열 발전소', map: 'interior', variant: 'plant', brief: '발전소 안의 중계기 세 대를 살리면 정화 구역의 주파수를 엿들을 수 있다. 통제실 감시등은 아직 돌고 있다.',
    goals: ['중계기 3대 가동', '집결지로 이동'], objective: { type: 'signal', count: 3, hold: 7 }, blocks: 8 },
  { name: '언덕의 계단', brief: '언덕 마을의 진료소 네 곳에 구급 가방이 남아 있다. 폭우가 오기 전에.',
    goals: ['구급 가방 4개 확보', '집결지로 이동'], objective: { type: 'collect', count: 4, item: '구급 가방' }, blocks: 8 },
  { name: '빙붕 활주로', brief: '기지로 가는 마지막 관문. 활주로 등이 다시 켜질 때까지 눈보라 속에서 버텨라.',
    goals: ['100초 버티기', '열린 길로 이동'], objective: { type: 'survive', time: 100 }, blocks: 8 }
];
/** i 장의 A 미션 — 본편에서 도시 · 무기 · 감염체 구성은 물려받고 지도 · 목표 · 변수는 새로 */
function stageLevel(i) {
  const L = LEVELS[i], A = STAGE_A[i], k = A.spawnK || 0.85;
  return Object.assign({}, L, {
    name: A.name, brief: A.brief, goals: A.goals, objective: A.objective, twist: A.twist || null,
    seed: (L.seed * 7 + 101) % 99991, blocks: A.blocks || L.blocks, landmarks: [], goal: undefined, stage: 0, map: A.map || undefined, variant: A.variant || undefined, inside: A.inside || null,
    spawn: { initial: Math.round(L.spawn.initial * k), rate: L.spawn.rate * k, max: Math.round(L.spawn.max * k) }
  });
}

/** 1부(서울 → 싱가포르)의 마지막 장 — 여기를 마치면 1부 엔딩, 다음 장부터 2부 */
const PART1_END = 4;

/* 서바이벌: 웨이브가 끝없이 상승한다 */
const SURVIVAL = {
  name: '서바이벌',
  brief: '탈출로는 없다. 얼마나 오래 버티는지만 기록된다.',
  goals: ['최대한 오래 생존'],
  seed: 0, blocks: 9, city: 'seoul', river: true, landmarks: [],   // 도시는 시작할 때 고른다
  objective: { type: 'endless' },
  spawn: { initial: 8, rate: 0.4, max: 46 },
  mix: { walker: 0.6, runner: 0.25, brute: 0, crawler: 0.15 },
  own: ['pistol', 'smg'], drops: ['shotgun', 'rifle', 'smg', 'magnum', 'auto', 'lmg', 'crossbow'],
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
  else if (diff === 'rush') { for (const k of ['smg', 'shotgun', ...(L.drops || []).slice(0, 1)]) if (!own.includes(k)) own.push(k); }   // 돌파 — 처음부터 무장
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
  istanbul:  { river: true,  landmarks: ['hagia', 'galata', 'gasstation'] },
  rio:       { river: false, landmarks: ['redeemer', 'copacabana', 'gasstation'] },
  moscow:    { river: true,  landmarks: ['basil', 'railyard', 'gasstation'], mixK: { spitter: 3.2, bloater: 1.4 },
               mix: { walker: 0.6, runner: 0.18, crawler: 0.1, spitter: 0.16, bloater: 0.04 } },        // 뱉는 것이 세 배
  nairobi:   { river: false, landmarks: ['kicc', 'gasstation'], mixK: { leaper: 3.4, charger: 2.6, runner: 1.6 },
               mix: { walker: 0.42, runner: 0.36, crawler: 0.08, leaper: 0.12, charger: 0.04 } },        // 덮치는 것 · 들이받는 것
  mars:      { river: false, landmarks: ['biodome', 'rocket'], bonus: true },
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
