/* ═══════════════════════════════════════════
   AFTERMATH — 잔존 : 캠페인 데이터
   8개 스토리 챕터 + 무한 서바이벌
   ═══════════════════════════════════════════ */
const LEVELS = [
  {
    name: '첫 번째 밤',
    brief: '통신이 끊긴 지 아홉 시간. 가로등은 전부 죽었고 비만 내린다. ' +
           '북쪽 고가도로 아래에 구조대 집결지가 있다고 했다. 가진 건 권총 한 자루와 손전등뿐이다.',
    goals: ['집결지까지 이동', '길에 떨어진 무기를 주울 것'],
    seed: 1041, blocks: 4,
    objective: { type: 'escape' },
    spawn: { initial: 6, rate: 0.22, max: 14 },
    mix: { walker: 1, runner: 0, brute: 0 },
    own: ['pistol'], drops: ['smg'],
    startAmmo: { smg: 40, shell: 0 }, startNades: 2,
    supplies: { ammo: 3, shells: 0, medkit: 2, battery: 2, nade: 1 }
  },
  {
    name: '젖은 골목',
    brief: '집결지는 비어 있었다. 무전기에서 좌표 하나가 반복된다. ' +
           '가는 길에 보급 상자가 흩어져 있다 — 지금 챙기지 않으면 다음은 없다.',
    goals: ['보급 상자 3개 확보', '확보 후 집결지로 이동'],
    seed: 2207, blocks: 4,
    objective: { type: 'collect', count: 3 },
    spawn: { initial: 8, rate: 0.3, max: 18 },
    mix: { walker: 0.85, runner: 0.15, brute: 0 },
    own: ['pistol', 'smg'], drops: ['shotgun'],
    startAmmo: { smg: 80, shell: 0 }, startNades: 2,
    supplies: { ammo: 3, shells: 2, medkit: 2, battery: 2, nade: 2 }
  },
  {
    name: '달리는 것들',
    brief: '느린 것들만 있는 게 아니었다. 어떤 개체는 뛴다. ' +
           '불빛 밖에서 들리는 발소리가 빨라지면, 이미 늦은 것이다.',
    goals: ['집결지까지 돌파'],
    seed: 3319, blocks: 5,
    objective: { type: 'escape' },
    spawn: { initial: 10, rate: 0.4, max: 22 },
    mix: { walker: 0.6, runner: 0.4, brute: 0 },
    own: ['pistol', 'smg'], drops: ['shotgun'],
    startAmmo: { smg: 100, shell: 4 }, startNades: 3,
    supplies: { ammo: 4, shells: 2, medkit: 2, battery: 3, nade: 2 }
  },
  {
    name: '발전소 구역',
    brief: '이 구역의 비상 발전기를 돌리면 도시 동쪽 차단문이 열린다. ' +
           '연료통 네 개. 그동안 발전기 소음은 저들을 부른다.',
    goals: ['연료통 4개 회수', '차단문으로 이동'],
    seed: 4523, blocks: 5,
    objective: { type: 'collect', count: 4 },
    spawn: { initial: 12, rate: 0.5, max: 26 },
    mix: { walker: 0.55, runner: 0.4, brute: 0.05 },
    own: ['pistol', 'smg', 'shotgun'], drops: [],
    startAmmo: { smg: 110, shell: 10 }, startNades: 3,
    supplies: { ammo: 4, shells: 3, medkit: 2, battery: 3, nade: 2 }
  },
  {
    name: '버텨라',
    brief: '차단문은 90초 뒤에 열린다. 그때까지는 이 구역에서 살아 있어야 한다. ' +
           '도망칠 곳은 없다. 다만 오래 버티는 것뿐이다.',
    goals: ['90초 생존', '개방된 차단문으로 이동'],
    seed: 5631, blocks: 4,
    objective: { type: 'survive', time: 90 },
    spawn: { initial: 10, rate: 0.75, max: 30 },
    mix: { walker: 0.5, runner: 0.45, brute: 0.05 },
    own: ['pistol', 'smg', 'shotgun'], drops: [],
    startAmmo: { smg: 130, shell: 14 }, startNades: 3,
    supplies: { ammo: 5, shells: 4, medkit: 3, battery: 3, nade: 3 }
  },
  {
    name: '거대한 것',
    brief: '무전에서 마지막으로 들린 단어는 "크다"였다. ' +
           '탄창 하나로는 멈추지 않는 개체가 이 구역을 돌아다닌다.',
    goals: ['감염체 40기 소탕', '집결지로 이동'],
    seed: 6742, blocks: 5,
    objective: { type: 'purge', count: 40 },
    spawn: { initial: 14, rate: 0.62, max: 28 },
    mix: { walker: 0.45, runner: 0.4, brute: 0.15 },
    own: ['pistol', 'smg', 'shotgun'], drops: [],
    startAmmo: { smg: 140, shell: 16 }, startNades: 4,
    supplies: { ammo: 5, shells: 4, medkit: 3, battery: 3, nade: 3 }
  },
  {
    name: '정전',
    brief: '배터리가 얼마 남지 않았다. 예비 배터리는 도시 곳곳에 흩어져 있다. ' +
           '불빛이 꺼지면 방향도, 사격선도 사라진다.',
    goals: ['예비 배터리 5개 회수', '집결지로 이동'],
    seed: 7854, blocks: 6,
    objective: { type: 'collect', count: 5 },
    spawn: { initial: 14, rate: 0.7, max: 32 },
    mix: { walker: 0.4, runner: 0.45, brute: 0.15 },
    own: ['pistol', 'smg', 'shotgun'], drops: [],
    startAmmo: { smg: 120, shell: 12 }, startNades: 4,
    supplies: { ammo: 5, shells: 3, medkit: 3, battery: 2, nade: 3 },
    batteryDrain: 1.9
  },
  {
    name: '마지막 다리',
    brief: '강 건너에 불빛이 보인다. 진짜 사람의 불빛이다. ' +
           '도시 전체가 그 사실을 아는 것처럼 움직이고 있다. 마지막 구간이다.',
    goals: ['도시를 가로질러 다리에 도달'],
    seed: 8967, blocks: 6,
    objective: { type: 'escape' },
    spawn: { initial: 18, rate: 0.95, max: 40 },
    mix: { walker: 0.35, runner: 0.45, brute: 0.2 },
    own: ['pistol', 'smg', 'shotgun'], drops: [],
    startAmmo: { smg: 150, shell: 18 }, startNades: 5,
    supplies: { ammo: 6, shells: 5, medkit: 3, battery: 4, nade: 4 }
  }
];

/* 서바이벌: 웨이브가 끝없이 상승한다 */
const SURVIVAL = {
  name: '서바이벌',
  brief: '탈출로는 없다. 얼마나 오래 버티는지만 기록된다.',
  goals: ['최대한 오래 생존'],
  seed: 0, blocks: 5,
  objective: { type: 'endless' },
  spawn: { initial: 8, rate: 0.4, max: 46 },
  mix: { walker: 0.7, runner: 0.3, brute: 0 },
  own: ['pistol', 'smg'], drops: ['shotgun'],
  startAmmo: { smg: 120, shell: 6 }, startNades: 3,
  supplies: { ammo: 6, shells: 4, medkit: 3, battery: 4, nade: 3 }
};
