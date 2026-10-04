'use strict';
/* ═══════════ 언어 ═══════════
   원문은 한국어다. T('한국어 원문', {변수}) 가 지금 언어의 문장을 돌려준다 — 영어 사전에 없으면 원문 그대로.
   HTML 의 고정 문구는 I18N.apply() 가 글자 마디(text node)를 사전으로 바꾼다. 굵게·링크가 섞인 문단은
   data-i18n="열쇠" 로 통째로 바꾼다(EN_HTML). 언어는 설정(자동 · 한국어 · English)을 따르고,
   자동이면 브라우저 언어가 한국어일 때만 한국어다. */
const I18N = (() => {
  const EN = {
    /* ── 타이틀 · 메뉴 ── */
    '잔존': 'Remnant',
    '남겨진 도시': 'Left behind',
    '감염된 도시. 비는 그치지 않는다.': 'An infected city. The rain never stops.',
    '도시는 사람을 두고 떠났다.': 'The city left without you.',
    '이야기': 'Story',
    '대피에서 남겨진 야간 배송 기사 도하, 도쿄의 무선사 하루, 방콕의 간호사 녹, 새벽호의 선장 메이 — 모두 지어낸 인물입니다. 랜드마크는 실제 장소를 본뜬 양식화된 모형입니다.': 'Doha, a night courier left behind by the evacuation; Haru, a radio operator in Tokyo; Nok, a nurse in Bangkok; May, captain of the Dawn — all fictional. Landmarks are stylized models inspired by real places.',
    '손전등이 닿는 곳까지만, 세상은 존재한다.': 'The world ends where your flashlight does.',
    '전역 시작': 'Campaign',
    '챕터 선택': 'Chapters',
    '서바이벌': 'Survival',
    '서바이벌 — 9장 완수 시 개방 ({n}/{t})': 'Survival — unlocks after chapter 9 ({n}/{t})',
    '기록 보관함': 'Records', '기록 보관함 {n}/{t}': 'Records {n}/{t}',
    '조작법': 'Controls',
    '설정': 'Settings',
    '최고 기록 · 서바이벌': 'Best · Survival',
    '정보 · 개인정보': 'About · Privacy',
    '돌아가기': 'Back',
    '{m}분 {s}초': '{m}m {s}s',
    '잠김': 'Locked',
    '클리어': 'Cleared',
    '붉게 빛나는 균열은 밟지 말 것. 대신 저것들을 그 위로 끌어들여라.': 'Don\'t step on the glowing red cracks. Lure them over the cracks instead.',
    '모래 폭풍이 온다 — 불빛이 반밖에 닿지 않는다': 'A sandstorm is coming — your light reaches half as far',
    '눈보라가 온다 — 불빛이 반밖에 닿지 않는다': 'A blizzard is coming — your light reaches half as far',
    '감염체가 떨어뜨린 무기를 주울 것': 'Pick up weapons dropped by the infected',
    '시작 무기: {k}': 'Starting weapons: {k}', '{p}은(는) 감염체가 떨어뜨린다': '{p} drop from the infected',
    '{name}을(를) 떨어뜨렸다': 'It dropped a {name}', '무기': 'Weapon',
    '쓰러뜨린 감염체가 총을 떨어뜨렸다 — 빛나는 총을 밟아 줍자': 'A downed infected dropped a gun — step on the glowing gun to take it',
    '서울': 'Seoul', '도쿄': 'Tokyo', '방콕': 'Bangkok', '싱가포르': 'Singapore', '싱가포르강': 'Singapore River', '대피 기지': 'Evac Base', '한강 하구': 'Han Estuary', '대피 기지 본영': 'Base HQ',
    '대피 검문소': 'Evacuation Checkpoint', '화물 철로': 'Freight Yard', '주유소': 'Gas Station',
    '호커 센터': 'Hawker Centre', '수직 정원': 'Vertical Garden', '항만': 'Container Port',
    '항만 · 수직 정원 · 호커 센터 · 싱가포르강': 'Container Port · Vertical Garden · Hawker Centre · Singapore River',
    '한강': 'Han River', '스미다강': 'Sumida River', '짜오프라야강': 'Chao Phraya',
    '광화문': 'Gwanghwamun', '남산타워': 'Namsan Tower', '시부야 스크램블': 'Shibuya Scramble', '도쿄 타워': 'Tokyo Tower',
    '센소지': 'Senso-ji', '왓 아룬': 'Wat Arun', '민주기념탑': 'Democracy Monument', '야시장': 'Night Market',
    /* ── 2부: 새벽호의 항해 ── */
    '시점': 'View', '가깝게': 'Close', '시점 가깝게': 'View: close', '시점 멀리': 'View: far', '화면 비율': 'Aspect ratio', '꽉 채우기': 'Fill screen',
    '미리 보기': 'Preview', '끄는 대로 화면이 바로 바뀝니다': 'The view changes as you drag',
    '시작': 'Play', '이어하기': 'Continue', '챕터': 'Chapters', '조작': 'Controls', '3D 판': '3D version', '1부(5장)를 마치면 열린다': 'Unlocks after Part 1 (chapter 5)', '2장을 마치면 열린다': 'Unlocks after chapter 2', '서바이벌 최고 기록': 'Best survival time', '기록 {n}/{t} · 도전 과제 ★{a}': 'Records {n}/{t} · Achievements ★{a}', '2D': '2D', '3D': '3D',
    '홈으로': 'Home', '홈으로 나갈까요?': 'Leave to the home screen?', '이번 임무의 진행은 저장되지 않습니다. 앞서 마친 장은 그대로 남습니다.': 'Progress in this mission will not be saved. Chapters you have finished stay unlocked.',
    '이번 판의 기록은 남지 않습니다.': 'This run will not be recorded.', '완료': 'Done', '중간': 'Medium', '아주 가깝게': 'Very close',
    '시점 거리': 'View distance', '미리 보며 조절 →': 'Adjust with preview →', '버튼 배치': 'Button layout', '편집 →': 'Edit →',
    '버튼을 끌어 원하는 자리에 놓으세요': 'Drag the buttons where you want them', '기본 배치': 'Reset',
    '용암 지대를 지나 교회 앞 집결지까지': 'Cross the lava field to the rally point by the church',
    '헬기장으로 이동': 'Reach the helipad', '헬기가 내릴 때까지 헬기장을 지킬 것': 'Hold the helipad until the helicopter lands', '헬기에 탑승': 'Board the helicopter',
    '헬기장': 'Helipad', '헬기가 온다 — {s}초 버텨라': 'The helicopter is coming — hold out {s}s', '헬기 착륙까지 {s}초 — 버텨라': '{s}s until the helicopter lands — hold out',
    '헬기장으로 가라': 'Get to the helipad', '헬기가 내렸다 — 올라타라': 'The helicopter is down — get on', '헬기에 올라타라': 'Board the helicopter',
    '헬기': 'Helicopter', '착륙': 'Landed', '헬기장으로 이동 중': 'Heading to the helipad',
    '서바이벌 — 1부(5장) 완수 시 개방 ({n}/{t})': 'Survival — unlocks after Part 1, chapter 5 ({n}/{t})',
    '레이캬비크. 남쪽으로 가는 쇄빙선이 교회 아래 부두에서 기다린다. 도시는 갈라진 땅 위에 있다 — 붉게 빛나는 금은 밟지 말 것. 저것들은 모른다. 쫓아오는 것들을 그 위로 끌어들이며 건너라.':
      'Reykjavik. A southbound icebreaker waits at the pier below the church. The city sits on split ground — don\'t step on the glowing red cracks. They don\'t know better. Lead whatever follows you over them as you cross.',
    '남극. 감염이 닿지 않은 마지막 곳이라던 연구 기지는 조용했다. 헬기장까지 가서, 헬기가 내릴 때까지 버텨라. 얼음판 위에서는 멈추려 해도 미끄러진다 — 눈보라가 오면 불빛도 삼켜진다. 그리고 얼음 밑에서 무언가 올라온다.':
      'Antarctica. The research station, said to be the last place the infection hadn\'t reached, was silent. Get to the helipad and hold it until the helicopter lands. On the ice you slide even when you try to stop — the blizzard swallows your light. And something is coming up from under the ice.',
    '모래 더미': 'Sand drift', '얼음판': 'Ice sheet', '얕은 물': 'Shallow water', '용암 균열': 'Lava crack', '진흙': 'Mud',
    '발이 빠져 느려진다 — 감염체도 마찬가지': 'Your feet sink and you slow down — so do the infected',
    '멈추려 해도 미끄러진다 — 일찍 방향을 틀어라': 'You keep sliding when you try to stop — turn early',
    '모두가 느려진다 — 물가에서 싸우면 시간을 번다': 'Everyone slows down — fighting at the water\'s edge buys time',
    '밟고 있으면 데인다 — 감염체를 그 위로 끌어들여라': 'Standing on it burns — lure the infected over it',
    '바라나시': 'Varanasi', '카이로': 'Cairo', '베네치아': 'Venice', '레이캬비크': 'Reykjavik', '남극 기지': 'Antarctic Station',
    '갠지스강': 'Ganges', '나일강': 'Nile', '대운하': 'Grand Canal',
    '기자의 피라미드': 'Pyramids of Giza', '사원': 'Mosque', '계단 연못': 'Stepped Pool', '시카라 사원': 'Shikhara Temple',
    '산마르코 광장': 'Piazza San Marco', '계단 교회': 'Stepped Church', '간헐천 들판': 'Geyser Field', '연구 기지': 'Research Station', '쇄빙선': 'Icebreaker',
    '계단 연못 · 시카라 사원 · 갠지스강 — 진흙 · 몬순': 'Stepped Pool · Shikhara Temple · Ganges — mud · monsoon',
    '기자의 피라미드 · 사원 · 나일강 — 모래 · 모래 폭풍': 'Pyramids of Giza · Mosque · Nile — sand · sandstorm',
    '산마르코 광장 · 운하 — 침수 · 안개': 'Piazza San Marco · canals — flooding · fog',
    '계단 교회 · 간헐천 — 용암 균열 · 눈': 'Stepped Church · geyser — lava cracks · snow',
    '연구 기지 · 쇄빙선 — 얼음판 · 눈보라': 'Research Station · icebreaker — ice sheets · blizzard',
    '1부 — 남겨진 도시': 'Part 1 — Left City', '2부 — 새벽호의 항해': 'Part 2 — Voyage of the Dawn',
    '1부 엔딩 보기': 'See the Part 1 ending',
    '새벽호의 항해는 계속된다 — 2부에서 다섯 지역이 기다린다.': 'The Dawn\'s voyage goes on — five more regions wait in Part 2.',
    '강가의 계단': 'Steps by the River', '모래 폭풍': 'Sandstorm', '잠긴 도시': 'The Drowned City', '불의 땅': 'Land of Fire', '마지막 기지': 'The Last Station',
    '약품 상자': 'medicine crate', '약품 상자 4개 확보': 'Secure 4 medicine crates', '강가의 계단 연못으로 이동': 'Reach the stepped pool by the river',
    '100초 생존': 'Survive 100 seconds', '피라미드 아래 집결지로 이동': 'Reach the rally point below the pyramids',
    '가동 후 광장으로 이동': 'Then head to the square',
    '감염체 35기 소탕': 'Clear 35 infected', '교회 앞 집결지로 이동': 'Reach the rally point by the church',
    '120초 생존': 'Survive 120 seconds', '헬기장으로 이동': 'Reach the helipad',
    '새벽호는 서쪽으로 뱃머리를 돌렸다. 녹의 진료소에 약이 떨어졌다. 바라나시의 병원 창고에 항바이러스제가 남아 있다는 교신. 우기의 골목은 진흙탕이다 — 발이 빠지면 느려지고, 저것들도 느려진다.':
      'The Dawn turned her bow west. Nok\'s clinic has run out of medicine, and word on the radio is that a hospital store in Varanasi still has antivirals. In the monsoon the alleys are mud — sink in and you slow down. So do they.',
    '수에즈로 가는 연료를 채우려면 카이로의 저장고 문을 열어야 한다. 원격 개방까지 100초 — 모래 폭풍이 몰려오는 중이다. 폭풍이 지나가는 동안 손전등은 반밖에 닿지 않는다. 모래 더미를 밟으면 발이 묶인다.':
      'To fuel up for Suez, the depot door in Cairo has to open. A hundred seconds until the remote unlock — and a sandstorm is rolling in. While it passes, your flashlight reaches half as far. Sand drifts will drag at your feet.',
    '지중해. 베네치아의 비상 종탑 중계기 셋이 아직 살아 있다면, 북쪽 바다의 생존자들과 이어진다. 조수가 골목까지 들어왔다. 얕은 물은 모두의 발을 늦춘다 — 내 발도, 저것들의 발도.':
      'The Mediterranean. If Venice\'s three bell-tower emergency relays are still alive, we can reach survivors in the northern seas. The tide has come up into the alleys. Shallow water slows everyone — you, and them.',
    '레이캬비크. 남쪽으로 가는 쇄빙선이 연료를 넣는 동안 항구를 비워야 한다. 땅이 갈라져 용암이 비친다 — 붉게 빛나는 금은 밟지 말 것. 저것들은 모른다. 그 위로 몰아넣어라.':
      'Reykjavik. The harbour has to be cleared while a southbound icebreaker refuels. The ground has split and lava shows through — don\'t step on the glowing red cracks. They don\'t know better. Drive them over.',
    '남극. 감염이 닿지 않은 마지막 곳이라던 연구 기지는 조용했다. 헬기는 120초 뒤에 내린다. 얼음판 위에서는 멈추려 해도 미끄러진다 — 눈보라가 오면 불빛도 삼켜진다. 헬기장을 지켜라.':
      'Antarctica. The research station, said to be the last place the infection hadn\'t reached, was silent. The helicopter lands in 120 seconds. On the ice you slide even when you try to stop — and when the blizzard comes, it swallows your light. Hold the helipad.',
    '서바이벌 — 도시 선택': 'Survival — choose a city',
    '광화문 · 남산타워 · 한강': 'Gwanghwamun · Namsan Tower · Han River',
    '시부야 스크램블 · 도쿄 타워 · 센소지 · 스미다강': 'Shibuya Scramble · Tokyo Tower · Senso-ji · Sumida River',
    '왓 아룬 · 민주기념탑 · 야시장 · 짜오프라야강': 'Wat Arun · Democracy Monument · Night Market · Chao Phraya',
    '진입': 'Go in',
    '진입 ': 'Start ', '집결지': 'Rally point',

    /* ── 챕터 ── */
    '첫 번째 밤': 'The First Night',
    '서울. 대피 방송이 끝난 지 아홉 시간. 야간 배송을 마치고 지하에서 올라왔을 때 도시는 이미 떠난 뒤였다. 광화문 안뜰이 마지막 구조 집결지라고 했다. 가진 건 권총 한 자루와 손전등뿐이다.':
      'Seoul. Nine hours since the last evacuation broadcast. When you came up from a late-night delivery underground, the city had already gone. They said the Gwanghwamun courtyard is the last rescue point. All you have is a pistol and a flashlight.',
    '광화문 안뜰까지 이동': 'Reach the Gwanghwamun courtyard',
    '길에 떨어진 무기를 주울 것': 'Pick up weapons along the way',
    '젖은 골목': 'Wet Alleys',
    '광화문은 비어 있었다. 대신 무전기 9번 채널에서 낯선 목소리가 들려온다. 남산 아래로 가는 길에 군 보급 상자가 흩어져 있다 — 지금 챙기지 않으면 다음은 없다.':
      'Gwanghwamun was empty. Instead, a stranger\'s voice comes through on radio channel 9. Army supply crates are scattered on the way down to Namsan — take them now, there won\'t be a next time.',
    '보급 상자 3개 확보': 'Secure 3 supply crates',
    '확보 후 집결지로 이동': 'Then head to the rally point',
    '달리는 것들': 'The Runners',
    '배는 한강 건너 선착장에 있다. 다리 위에는 버려진 차들뿐. 하루가 경고했다 — 느린 것들만 있는 게 아니라고. 어떤 것은 뛰고, 어떤 것은 바닥을 기어 불빛 아래로 들어오기 전까지 보이지 않는다.':
      'The boat is at a pier across the Han. Only abandoned cars on the bridge. Haru warned you — they aren\'t all slow. Some run, and some crawl along the ground, unseen until they slide under your light.',
    '한강을 건너 집결지까지 돌파': 'Cross the Han and break through to the rally point',
    '마지막 수송': 'The Last Transport',
    '김 선장의 어선이 한강 하구의 대피 기지에 닿았다. 바다를 건너기엔 기름이 모자라고, 기지의 연료고는 잠겨 있다. 출입 카드 세 장이 막사와 창고에 흩어져 있다. 대피를 지휘하던 곳이다 — 무엇이 이곳을 끝냈는지는 곧 보게 된다.':
      'Captain Kim\'s boat put in at the evacuation base on the Han estuary. There isn\'t enough fuel to cross the sea, and the base depot is locked. Three key cards are scattered through the barracks and sheds. This is where the evacuation was run from — you\'re about to see what ended it.',
    '출입 카드 3장 확보': 'Find 3 key cards',
    '본영 헬기장으로 이동': 'Head to the helipad at HQ',
    '출입 카드': 'Key card',
    '발전소 구역': 'The Generator',
    '도쿄. 배는 스미다강 하구에 닿았다. 하루의 무선국은 아사쿠사의 셔터 내린 전파상 안에 있다. 발전기 연료가 떨어져 송신이 곧 끊긴다. 연료통 네 개. 발전기 소음은 저들을 부를 것이다.':
      'Tokyo. The boat made the mouth of the Sumida. Haru\'s station is inside a shuttered electronics shop in Asakusa. The generator is out of fuel and the signal is about to die. Four fuel cans. The generator\'s noise will call them in.',
    '연료통 4개 회수': 'Recover 4 fuel cans',
    '차단문으로 이동': 'Head to the gate',
    '버텨라': 'Hold Out',
    '하루가 남쪽 선단의 교신을 잡았다. 마지막 배는 싱가포르에서 떠난다. 그곳으로 가는 화물선의 차단문은 시부야 교차로에서 원격으로만 열린다. 90초. 사방이 트여 있다 — 그만큼 사방에서 온다.':
      'Haru picked up the southern fleet. The last ship leaves from Singapore. The gate to the freighter going there only opens remotely, from the Shibuya crossing. Ninety seconds. It\'s open on every side — so they come from every side.',
    '90초 생존': 'Survive 90 seconds',
    '개방된 차단문으로 이동': 'Go through the open gate',
    '거대한 것': 'The Big One',
    '출항 전에 할 일이 하나 남았다. 하루의 목소리가 남쪽까지 닿으려면 도쿄 타워에 안테나를 걸어야 한다. 공원 관리소 무전의 마지막 단어는 "크다"였다. 탄창 하나로는 멈추지 않는 개체가 이 구역을 돌아다닌다.':
      'One thing left before sailing. For Haru\'s voice to reach the south, an antenna has to go up on Tokyo Tower. The park office\'s last word on the radio was "big". Something one magazine won\'t stop is walking this block.',
    '감염체 30기 소탕': 'Kill 30 infected',
    '집결지로 이동': 'Head to the rally point',
    '정전': 'Blackout',
    '방콕. 하루의 중계가 새 목소리를 이어 주었다 — 강 건너 진료소의 간호사 녹. 진료소에는 배터리가 필요하다. 예비 배터리는 야시장 노점 사이에 흩어져 있다. 불빛이 꺼지면 방향도, 사격선도 사라진다.':
      'Bangkok. Haru\'s relay connected a new voice — Nok, a nurse at the clinic across the river. The clinic needs batteries. Spares are scattered among the night market stalls. When the light dies, so do your bearings and your line of fire.',
    '예비 배터리 5개 회수': 'Recover 5 spare batteries',
    '기다리는 것': 'The One That Waits',
    '짜오프라야강 건너 왓 아룬 쪽에 진료소의 불빛이 보인다. 진짜 사람의 불빛이다. 그런데 다리 앞에 무언가가 서 있다. 저것은 걷지 않는다 — 기다리고 있다.':
      'Across the Chao Phraya, near Wat Arun, the clinic\'s lights are on. Real, human lights. But something is standing in front of the bridge. It isn\'t walking — it\'s waiting.',
    '그것을 쓰러뜨리고 다리를 건너라': 'Bring it down and cross the bridge',
    '남쪽의 신호': 'Signal South',
    '싱가포르. 육로로 사흘. 새벽호는 응답이 없다 — 항구까지 전파가 닿지 않는다. 시내의 비상 중계기 세 대를 다시 켜면 하루의 중계와 이어진다. 중계기는 켜지는 동안 소리를 낸다. 그 곁을 지켜야 한다.':
      'Singapore. Three days overland. The Dawn isn\'t answering — the signal doesn\'t reach the port. Restart three emergency relays in the city and they\'ll link up with Haru\'s. The relays make noise while they power up. Stay by them.',
    '중계기 3대 가동 — 켜질 때까지 곁에 머물 것': 'Power 3 relays — stay close until each one is on',
    '가동 후 집결지로 이동': 'Then head to the rally point',
    '새벽호': 'The Dawn',
    '새벽 네 시. 3번 부두까지는 도시 하나를 가로질러야 한다. 배가 접안하는 동안 부두를 지키고, 현문이 내려오면 그때 오른다. 이 도시의 모든 것이 소리를 듣고 몰려올 것이다.':
      'Four a.m. Pier 3 is a whole city away. Hold the pier while the ship docks, and board when the gangway comes down. Everything in this city will hear it and come.',
    '3번 부두로 이동': 'Reach Pier 3',
    '접안할 때까지 부두를 지킬 것': 'Hold the pier until the ship docks',
    '현문으로 승선': 'Board by the gangway',
    '탈출로는 없다. 얼마나 오래 버티는지만 기록된다.': 'There is no way out. Only how long you last is recorded.',
    '최대한 오래 생존': 'Survive as long as you can',
    '보급 상자': 'Supply crate', '연료통': 'Fuel can', '예비 배터리': 'Spare battery',

    /* ── HUD ── */
    '처치': 'kills', '체력': 'Health', '배터리': 'Battery', '기력': 'Stamina', '수류탄': 'Grenades',
    '무기': 'Arms', '밀치기': 'Shove', '장전': 'Reload', '질주': 'Sprint', '손전등': 'Light', '사격': 'Fire',
    '그것': 'IT', '나': 'You', '조준': 'Aim',
    '탈출로를 찾아라': 'Find a way out',
    '집결지로 이동하라': 'Get to the rally point',
    '{item} {n}/{t} 확보': '{item} {n}/{t}',
    '{s}초 버텨라': 'Hold out {s}s',
    '감염체 {n}/{t} 소탕': 'Infected killed {n}/{t}',
    '그것을 쓰러뜨려라': 'Bring IT down',
    '생존 {s}초 · 점수 {score}': 'Alive {s}s · Score {score}',
    '장전 중': 'Reloading',
    '권총': 'Pistol', '샷건': 'Shotgun', '소총': 'Rifle', 'SMG': 'SMG',

    /* ── 알림 ── */
    '게임패드 연결 — 배치는 일시정지 › 조작법': 'Gamepad connected — layout in Pause › Controls',
    '뒤에서': 'from behind', '옆에서': 'from the side',
    '무리가 온다 — {side}': 'Horde incoming — {side}',
    '담즙을 뒤집어썼다 — 무리가 몰려온다': 'Covered in bile — the horde is coming',
    '경보가 울린다 — 무리가 몰려온다': 'Alarm! The horde is coming',
    '손전등 ON': 'Flashlight ON', '손전등 OFF — 배터리 절약': 'Flashlight OFF — saving battery',
    '그것을 쓰러뜨렸다': 'IT is down',
    '그것이 쓰러졌다 — 다리가 열렸다': 'IT has fallen — the bridge is open',
    '소탕 완료 — 집결지가 표시되었다': 'Area cleared — rally point marked',
    '{item} 확보 — {n}개 남음': '{item} secured — {n} left',
    '전부 확보했다 — 집결지로 이동하라': 'All secured — get to the rally point',
    '무언가 큰 것이 내려왔다': 'Something big has come down',
    '차단문 개방 — 지금이다': 'The gate is open — go now',
    '예비 탄약이 없다': 'No spare ammo',
    '{w} 장착': '{w} ready',
    '배터리 방전 — 시야를 잃었다': 'Battery dead — you\'re blind',
    '우는 것이 깨어났다': 'The Weeper is awake',
    '포효 — 무리가 몰려온다': 'A roar — the horde is coming',
    '문제가 생겨 일시정지했습니다 — 재시작하거나 타이틀로 돌아가세요': 'Something went wrong and the game paused — restart or return to the title',
    'SMG 탄약 +35': 'SMG ammo +35', '산탄 +8': 'Shells +8', '구급킷 +40': 'Medkit +40', '배터리 +55': 'Battery +55',
    '수류탄 +2': 'Grenades +2', 'SMG 획득': 'Got the SMG', '샷건 획득': 'Got the shotgun', '소총탄 +10': 'Rifle rounds +10',
    '소총 획득': 'Got the rifle', '보급 상자 확보': 'Supply crate secured',

    /* ── 무기 고르기 · 지도 ── */
    '없음': 'none',
    '무기를 누르면 바로 이어집니다': 'Tap a weapon to continue',
    '무기 키 또는 클릭 · {k} 로 닫기': 'Weapon key or click · {k} to close',
    '화면을 누르면 닫힙니다': 'Tap to close',
    '{k} 또는 Esc 로 닫기': '{k} or Esc to close',
    'M 으로 닫기': 'M to close',
    '전체 지도': 'Map',

    /* ── 도움말 ── */
    '이동 · 손전등은 가까운 적과 걷는 쪽을 저절로 비춘다': 'Move · your flashlight aims at nearby enemies and where you walk',
    '이동 · 마우스로 손전등을 비춘다': 'Move · aim the flashlight with the mouse',
    '왼쪽 화면': 'Left side',
    '아무 데나 눌러 끌면 걷는다 · 손전등은 가까운 적을 저절로 비춘다 · 오른쪽을 끌면 직접 비춘다': 'Touch and drag anywhere to walk · the flashlight aims at nearby enemies · drag on the right to aim yourself',
    '왼쪽 스틱': 'Left stick',
    '이동 · 오른쪽 스틱을 좌우로 밀어 손전등을 돌린다': 'Move · push the right stick sideways to turn the flashlight',
    '이동 · 오른쪽 화면을 좌우로 끌어 손전등을 돌린다': 'Move · drag the right side sideways to turn the flashlight',
    '이동 · 오른쪽 스틱으로 손전등을 비춘다': 'Move · aim the flashlight with the right stick',
    '자동 사격': 'Auto-fire',
    '불빛에 들어온 적은 저절로 쏜다 — 손전등을 적에게 돌리자': 'Anything in your beam gets shot — point the light at them',
    '클릭': 'Click',
    '불빛 안에 들어온 적은 자동으로 쏜다. 직접 쏠 수도 있다': 'Enemies in the beam are shot automatically. You can also fire yourself',
    '사격 — 손전등이 비추는 쪽으로만 나간다': 'Fire — shots only go where the light points',
    '재장전 — 탄창이 비면 자동으로도 갈아 끼운다': 'Reload — also happens on its own when the magazine runs dry',
    ' · 우클릭': ' · Right-click',
    '붙잡히면 발이 묶인다 — 밀쳐내고 빠져나가라': 'Grabbed? You\'re slowed — shove them off and get out',
    '우는 것': 'The Weeper',
    '울음소리가 들리면 불빛을 돌리고 멀리 돌아가라 — 깨우면 끝까지 쫓아온다': 'If you hear sobbing, turn your light away and go around — wake it and it won\'t stop chasing',
    '부푼 것': 'The Bloater',
    '가까이서 터지면 담즙을 뒤집어쓴다 — 멀리서 쏴라': 'Pop it up close and you\'re covered in bile — shoot it from afar',
    '담즙': 'Bile',
    '냄새를 맡고 무리가 몰려온다 — 등을 벽에 대고 수류탄을 준비하라': 'The horde smells it — put your back to a wall and ready a grenade',
    '무리': 'Horde',
    '붉은 호가 가리키는 쪽에서 몰려온다 — 불빛을 그쪽으로 돌리거나 질주로 거리를 벌려라': 'They come from where the red arc points — turn your light there or sprint for distance',
    '한 번 누르면 계속 달린다 · 발소리가 커서 멀리서도 깨운다': 'Tap once to keep running · loud footsteps wake things far away',
    '질주 — 빠르지만 발소리가 커서 멀리서도 깨운다': 'Sprint — fast, but loud footsteps wake things far away',
    '빛나는 물건은 밟으면 줍는다': 'Step on glowing items to pick them up',
    '손전등을 꺼서 배터리를 아낀다 · 노란 상자로 채운다': 'Turn the light off to save battery · yellow boxes recharge it',
    '무리가 몰렸다 — 수류탄': 'They\'re bunched up — grenade',
    '달리는 것': 'The Runner',
    '약하지만 빠르다. 멀리 있을 때 끊어 쏘자': 'Weak but fast. Tap them while they\'re still far',
    '잘 밀리지 않는다. 수류탄을 아끼지 말 것': 'Hard to push back. Don\'t save your grenades',
    '기어다니는 것': 'The Crawler',
    '웅크렸다 튄다. 일정하게 다가오지 않는다': 'It crouches, then lunges. It never comes at a steady pace',
    '뱉는 것': 'The Spitter',
    '거리를 두고 산을 뱉는다. 초록 웅덩이는 밟지 말 것': 'Spits acid from a distance. Don\'t stand in green pools',
    '붉은 선이 뜨면 옆으로 비켜라. 벽에 박으면 비틀거린다': 'When the red line appears, sidestep. It staggers if it hits a wall',

    /* ── 죽었을 때 ── */
    '초록 고리가 보이면 옆으로 — 산은 서 있던 자리로 떨어진다.': 'See a green ring? Step aside — the acid lands where you stood.',
    '초록 웅덩이는 오래 서 있을수록 아프다. 지나가되 멈추지 말 것.': 'Green pools hurt more the longer you stand in them. Cross, but don\'t stop.',
    '붉은 선이 진해지면 방향이 굳은 것 — 그때 옆으로 비켜라. 벽에 박으면 비틀거린다.': 'When the red line turns solid its aim is locked — sidestep then. It staggers if it hits a wall.',
    '그것에게 붙지 말 것. 거리를 두고 돌진을 벽으로 유도하라.': 'Don\'t get close to IT. Keep your distance and bait the charge into a wall.',
    '덩치는 붙기 전에 — 샷건이나 수류탄으로.': 'Deal with the big ones before they reach you — shotgun or grenade.',
    '달리는 것은 멀리서 끊어 쏴라. 붙으면 밀치기로 떼어 낸다.': 'Shoot runners while they\'re far. If they latch on, shove them off.',
    '기는 것은 웅크렸다 튄다 — 튀는 순간 옆으로.': 'Crawlers crouch, then lunge — step aside as they jump.',
    '부푼 것은 멀리서 쏴라.': 'Shoot Bloaters from a distance.',
    '둘러싸이면 밀치기로 떼어 내고 트인 길로 빠져나가라. 막다른 골목은 피할 것.': 'Surrounded? Shove them off and break out to open road. Avoid dead ends.',

    /* ── 조작법 ── */
    '키 바꾸기': 'Rebind keys',
    '게임패드': 'Gamepad',
    '이동': 'Move', '오른쪽 스틱': 'Right stick', '손전등 · 조준': 'Flashlight · aim', '재장전': 'Reload',
    '다음 무기': 'Next weapon', '무기 고르기': 'Weapon wheel', '일시정지': 'Pause',
    '메뉴에서는 D-pad · 왼쪽 스틱으로 고르고 A 로 누르고 B 로 돌아갑니다.': 'In menus: D-pad or left stick to choose, A to select, B to go back.',
    '이동 (방향키도 됨)': 'Move (arrow keys too)',
    '<kbd>마우스</kbd>': '<kbd>Mouse</kbd>', '<kbd>클릭</kbd>': '<kbd>Click</kbd>', '<kbd>우클릭</kbd>': '<kbd>Right-click</kbd>',
    '손전등 방향 · 조준': 'Flashlight direction · aim',
    '사격 (불빛 안의 적은 자동 사격)': 'Fire (enemies in the beam are shot automatically)',
    '무기 전환 (권총 · SMG · 샷건 · 소총)': 'Switch weapon (pistol · SMG · shotgun · rifle)',
    '무기 고르기 — 고르는 동안 시간이 멈춘다': 'Weapon wheel — time stops while you choose',
    '재장전 (약실이 비면 자동 장전)': 'Reload (automatic when the magazine is empty)',
    '근접 밀치기 — 달라붙은 적을 떼어낸다': 'Shove — knock off anything grabbing you',
    '수류탄 투척': 'Throw grenade',
    '손전등 on / off (배터리 절약)': 'Flashlight on / off (save battery)',
    '전력 질주 (기력 소모 — 바닥나면 숨이 찬다)': 'Sprint (uses stamina — run out and you\'re winded)',
    '전체 지도 — 보는 동안 시간이 멈춘다': 'Map — time stops while you look',

    /* ── 일시정지 · 결과 ── */
    '계속하기': 'Resume', '재시작': 'Restart', '타이틀로': 'Title screen',
    '경과': 'Time', '명중률': 'Accuracy', '받은 피해': 'Damage taken', '체력 · 배터리': 'Health · battery',
    '장비': 'Weapon', '남은 시간': 'Time left', '소탕': 'Killed', '{n}기': '{n}', '{s}초': '{s}s',
    '서바이벌 · {d}': 'Survival · {d}',
    '{n}개 챕터': '{n} chapters', '평가 남긴 챕터': 'Chapters graded', '평균 평가': 'Average grade',
    '최고 평가': 'Best grade', '난이도': 'Difficulty', '마지막 처치': 'Final kills',
    '아직 평가가 남지 않은 챕터가 있다. 챕터 선택에서 다시 들어갈 수 있다.': 'Some chapters have no grade yet. You can replay them from Chapters.',
    '모든 챕터에 기록을 남겼다. 더 높은 난이도가 기다린다.': 'Every chapter has a grade. A harder difficulty awaits.',
    '기록 종료': 'Run over', '생존': 'Survived', '사망': 'Dead',
    '다음 챕터 — {name}': 'Next — {name}', '엔딩 보기': 'See the ending',
    '도시는 여전히 그대로다.': 'The city is just as it was.',
    '다리를 건넜다. 뒤돌아보지 않았다.': 'You crossed the bridge. You didn\'t look back.',
    '숨을 고를 시간은 짧다.': 'There\'s little time to catch your breath.',
    '불빛이 꺼졌다. ': 'The light went out. ',
    '{d} 난이도로 다시': 'Retry on {d}',
    '쉬운 난이도로 다시': 'Retry on an easier difficulty',
    '최고 기록 {v}': 'New best {v}', '평가 {v}': 'Score {v}',
    '생존 시간': 'Time alive', '점수': 'Score', '최고 기록': 'Best', '평가': 'GRADE',
    '계속': 'Continue', '재시도': 'Retry',
    '전역 종료': 'Campaign complete', '다리를 건넜다': 'Across the Bridge',
    '등 뒤에서 도시가 숨을 쉰다. 불빛은 꺼지지 않았고, 그것은 더 이상 기다리지 않는다.': 'Behind you the city breathes. The lights stayed on, and IT no longer waits.',
    '강 건너에는 사람이 있었다. 그것만으로 충분한 밤이었다.': 'There were people across the river. That was enough for one night.',
    '서바이벌로': 'To Survival',

    /* ── 설정 ── */
    '음량': 'Volume', '밝기': 'Brightness',
    '밤의 어둠 농도. 화면이 너무 어둡거나 밝은 곳에서 하면 조절하세요.': 'How dark the night is. Adjust if your screen is too dark or you\'re playing somewhere bright.',
    '터치 조준': 'Touch aim', '자동 조준': 'Auto-aim', '조준 스틱': 'Aim stick', '회전(원작)': 'Turn (original)', '드래그': 'Drag',
    '3D 판 (실험)': '3D version (beta)', '2D 판': '2D version', '카메라 거리': 'Camera', '가까이': 'Close', '멀리': 'Far', '화질': 'Quality', '자동': 'Auto', '선명하게': 'Sharp', '가볍게': 'Light',
    '자동은 프레임이 떨어지면 먼저 바닥 · 벽의 재질 무늬를 끄고, 그래도 버거우면 그리는 해상도를 낮춘다. 선명하게는 무늬를 늘 켜 두고, 가볍게는 늘 끈다. 화면이 큰 기기(레티나 모니터·태블릿)에서 끊기면 가볍게로 두세요.':
      'When frames drop, Auto first turns off the ground and wall textures, then lowers the render resolution if it still struggles. Sharp always keeps textures on; Light always turns them off. If it stutters on a big screen (Retina display, tablet), choose Light.',
    'FPS 표시': 'Show FPS', '손전등 방향': 'Flashlight aim', '마우스': 'Mouse',
    '자동 조준은 손전등이 가까운 적, 없으면 걷는 쪽을 저절로 비춘다 — 키보드만으로도 할 수 있다.': 'Auto-aim points the flashlight at the nearest enemy, or where you walk — playable with just a keyboard.',
    '터치 버튼 크기': 'Touch button size', '작게': 'Small', '보통': 'Normal', '크게': 'Large', '진동': 'Vibration',
    '생존자': 'Survivor', '절멸': 'Extinction',
    '여유 있게 도시를 둘러본다': 'Take your time and look around the city',
    '설계된 그대로의 난이도': 'The difficulty as designed',
    '탄도 배터리도 모자란다': 'Never enough ammo, never enough battery',
    '키 설정': 'Key bindings', '바꾸기 →': 'Change →', '도움말': 'Hints', '처음부터 다시 보기': 'Show them all again',
    '본 도움말 {n}개 — 처음부터 다시 보기': '{n} hints seen — show them all again', '아직 본 도움말이 없다': 'No hints seen yet',
    '음악': 'Music', '화면 흔들림': 'Screen shake', '섬광 효과': 'Flashes',
    '섬광을 끄면 피격 플래시와 번개가 크게 약해진다. 빛에 민감하다면 꺼 두세요.': 'Turning flashes off greatly softens hit flashes and lightning. Turn it off if you\'re sensitive to light.',
    '언어': 'Language',

    /* ── 키 설정 ── */
    '바꿀 행동을 누른 뒤 새 키(또는 마우스 가운데·옆 버튼)를 누르세요. Esc 는 취소.': 'Click an action, then press the new key (or a middle/side mouse button). Esc cancels.',
    '이미 쓰는 키를 주면 두 행동의 키를 맞바꿉니다. 방향키 · 오른쪽 Shift · 우클릭은 늘 함께 동작합니다.': 'Giving a key that\'s already used swaps the two actions. Arrow keys, right Shift and right-click always work too.',
    '기본값으로': 'Reset to defaults',
    '키를 누르세요…': 'Press a key…',
    "'{a}' 에 쓸 키를 누르세요 · Esc 취소": "Press a key for '{a}' · Esc to cancel",
    '{k} 는 쓸 수 없습니다': '{k} can\'t be used',
    '{k} → {a}': '{k} → {a}',
    "{k} → {a} · '{b}' 은(는) {kb} 로 바꿨습니다": "{k} → {a} · '{b}' moved to {kb}",
    '기본 키로 되돌렸습니다': 'Keys reset to defaults',
    '앞으로': 'Forward', '뒤로': 'Back', '왼쪽': 'Left', '오른쪽': 'Right', '손전등 켜고 끄기': 'Flashlight on/off',
    '오른쪽 Shift': 'Right Shift', '오른쪽 Ctrl': 'Right Ctrl', '오른쪽 Alt': 'Right Alt',
    '휠 클릭': 'Middle click', '우클릭': 'Right-click', '마우스 뒤로': 'Mouse back', '마우스 앞으로': 'Mouse forward', '숫자패드 ': 'Numpad ',

    /* ── 정보 ── */
    '정보': 'About', '판': 'Version', '만든 것': 'Made with', '영감': 'Inspired by', '개인정보': 'Privacy',
    '그래픽 · 사운드 · 음악을 모두 코드로 만들었습니다. 외부 이미지 · 음원 · 글꼴을 쓰지 않습니다.': 'All graphics, sound and music are generated in code. No external images, audio or fonts.',
    'AFTERMATH (TwoHeads Games, 2010) · Left 4 Dead (Valve, 2008) 의 연출 설계 · Darkwood 의 어둠': 'AFTERMATH (TwoHeads Games, 2010) · the AI Director of Left 4 Dead (Valve, 2008) · the darkness of Darkwood',
    '개인정보 처리방침': 'Privacy policy', '오류 기록 복사': 'Copy error log', '진행 기록 지우기': 'Clear progress',
    '오류 기록을 복사했습니다 — 제보할 때 붙여 넣어 주세요': 'Error log copied — paste it into your bug report',
    '복사할 수 없는 환경입니다': 'Copying isn\'t available here',
    '챕터 진행 · 평가 · 서바이벌 기록을 지웁니다. 설정과 키 설정은 남습니다. 계속할까요?': 'This clears chapter progress, grades and survival records. Settings and key bindings stay. Continue?',
    '진행 기록을 지웠습니다': 'Progress cleared',
    '{n} fps · {w}×{h}{auto}': '{n} fps · {w}×{h}{auto}', ' 자동': ' auto',

    /* ── 접근성 이름 ── */
    '무기 선택': 'Choose weapon', '구역 지도': 'Area map',
  
    /* ── 이야기 · 기록 · 새 목표 ── */
    '누르면 넘어갑니다': 'Tap to continue', '건너뛰기': 'Skip',
    '길에 떨어진 종이를 밟으면 여기에 남는다. 챕터마다 두 장.': 'Step on papers lying in the street and they are kept here. Two per chapter.',
    '프롤로그 다시 보기': 'Replay the prologue', '아직 찾지 못했다': 'Not found yet',
    '기록': 'Record', '기록 발견': 'Record found', '기록 {n}/{t}': 'Records {n}/{t}', '주운 기록': 'Records picked up', '{n}장': '{n}',
    '에필로그': 'Epilogue',
    '중계기 가동 — 켜질 때까지 곁을 지켜라': 'Relay powering up — stay with it until it\'s on',
    '중계기 {n}/{t} 가동': 'Relays {n}/{t} on', '중계기 가동 중 {p}% — 곁을 지켜라': 'Relay {p}% — stay close',
    '중계망 연결 — 집결지로 이동하라': 'Relay network linked — head to the rally point',
    '중계기': 'Relays', '접안': 'Docking', '현문 개방': 'Gangway down', '부두로 이동 중': 'Heading to the pier',
    '3번 부두로 가라': 'Get to Pier 3', '접안까지 {s}초 — 버텨라': '{s}s to docking — hold on',
    '배가 들어온다 — {s}초 버텨라': 'The ship is coming in — hold for {s}s',
    '무언가 큰 것이 온다': 'Something big is coming',
    '현문이 내려왔다 — 배에 올라라': 'The gangway is down — get aboard',
    '현문으로 승선하라': 'Board by the gangway',
    '{city} 최고': 'Best in {city}',
    '도전 과제': 'Achievements', '기록 · 도전 과제 {n}/{t} · ★{a}': 'Records {n}/{t} · Achievements ★{a}',
    '비명 — 무리가 몰려온다': 'A scream — the horde is coming', '비명 지르는 것': 'Screamer',
    '숨을 들이켜는 소리가 들리면 먼저 쏴라 — 비명을 지르면 무리가 온다': 'When you hear a long inhale, shoot first — if it screams, the horde comes',
    '도전': 'Challenges', '도전 — 2장 완수 시 개방': 'Challenges — unlock after chapter 2', '도전 종료': 'Challenge over',
    '짧은 판에서 점수를 겨룬다. 2.5초 안에 이어서 쓰러뜨리면 배수가 오른다(최대 ×3).': 'Short runs for score. Kill again within 2.5 seconds to raise the multiplier (up to ×3).',
    '사냥 시간': 'Hunting Hour', '2분 동안 최대한 많이. 연달아 쓰러뜨리면 배수가 오른다.': 'As many as you can in two minutes. Chain kills to raise the multiplier.',
    '권총 한 자루': 'Just a Pistol', '권총과 수류탄 셋뿐. 90초.': 'A pistol and three grenades. Ninety seconds.',
    '정전의 밤': 'Blackout Night', '배터리가 네 배로 닳는다. 불빛을 아껴라. 2분.': 'Batteries drain four times as fast. Save your light. Two minutes.',
    '무리': 'Horde', '12초마다 무리가 온다. 150초를 버티며 쓰러뜨려라.': 'A horde every 12 seconds. Hold for 150 seconds and cut them down.',
    '큰 사냥감': 'Big Game', '그것이 처음부터 쫓아온다. 빨리 쓰러뜨릴수록 점수가 크다. 3분.': 'IT hunts you from the start. The faster you bring it down, the bigger the score. Three minutes.',
    '남은 {s}초 · 점수 {score}': '{s}s left · Score {score}', '도전 · {name}': 'Challenge · {name}',
    '그것을 쓰러뜨렸다 — 시간 보너스 {n}': 'IT is down — time bonus {n}',
    '메달 없음': 'No medal', '동메달': 'Bronze', '은메달': 'Silver', '금메달': 'Gold',
    '{medal} — {score}점': '{medal} — {score} pts', '{medal} — {score}점 · {next}까지 {n}점': '{medal} — {score} pts · {n} to {next}',
    '최대 연속': 'Best chain', '{n}연속 · ×{m}': '{n} in a row · ×{m}', '최고 점수': 'Best score', '메달 문턱': 'Medal marks',
    '최고 {s}점': 'Best {s}',
    '체크포인트': 'Checkpoint', '체크포인트부터': 'From checkpoint', '처음부터': 'From the start',
    '체크포인트부터 — {name}': 'From checkpoint — {name}',
    '{item} {n}/{t}': '{item} {n}/{t}', '중계기 {n}/{t}': 'Relays {n}/{t}', '3번 부두': 'Pier 3',
    '길의 절반': 'Halfway', '소탕 {n}/{t}': 'Purge {n}/{t}', '그것의 체력 절반': 'IT at half health',
    '최고 {m}분 {s}초 · {k}기 처치': 'Best {m}m {s}s · {k} kills', '기록 없음': 'No record yet',
};

  // 굵게 · 링크가 섞인 문단은 통째로
  const EN_HTML = {
    howtoNote: 'On touch screens, touch and drag <b>anywhere on the left</b> to walk. The flashlight <b>aims itself</b> at the nearest enemy (or where you walk); drag on the right side to aim yourself, tap it to snap to the nearest enemy. Other schemes are in <b>Settings</b>.<br>' +
      'There is no fire button — <b>anything in your beam is shot automatically</b>, and shots only go where the light points.<br>' +
      'Guns <b>drop from the infected you kill</b> — step on the glowing gun to pick it up.<br>' +
      '<b>Spitters</b> lob acid at where you stood — step out of the green ring.<br>' +
      'Guns work <b>by the magazine</b> — the big number is what\'s loaded, the small one is spare.',
    aimNote: '<b>Auto-aim</b> (default) — the flashlight points at the nearest enemy, or where you walk. Drag on the right to aim directly; tap to snap to the nearest enemy. <b>Aim stick</b> is a classic twin stick. <b>Turn</b> rotates like the original. In every scheme, touching anywhere on the left creates a move stick under your thumb.',
    diffNote: 'Difficulty applies from <b>the next chapter you start</b>.',
    aboutPrivacy: 'Nothing is collected or sent. Settings and records stay in this device\'s browser storage. <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>'
  };

  let lang = 'ko';
  const pick = pref => pref === 'ko' || pref === 'en' ? pref : (/^ko\b/i.test(navigator.language || '') ? 'ko' : 'en');
  const fmt = (s, v) => v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s;

  /** 지금 언어의 문장. vars 는 {이름} 자리를 채운다 */
  function T(ko, vars) {
    if (ko == null) return '';
    const s = lang === 'en' && Object.prototype.hasOwnProperty.call(EN, ko) ? EN[ko] : ko;
    return fmt(s, vars);
  }

  /** 고정 문구 바꾸기 — 원문은 각 마디에 기억해 두어 언어를 바꿔도 되돌릴 수 있다 */
  function apply(root = document.body) {
    document.documentElement.lang = lang;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement && !n.parentElement.closest('script,style,[data-i18n],[data-noi18n]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    let n;
    while ((n = w.nextNode())) {
      if (n.__ko === undefined) { if (!/[가-힣]/.test(n.nodeValue)) continue; n.__ko = n.nodeValue; }
      const ko = n.__ko, key = ko.replace(/\s+/g, ' ').trim();
      const lead = ko.match(/^\s*/)[0], trail = ko.match(/\s*$/)[0];
      n.nodeValue = lang === 'en' && EN[key] !== undefined ? lead + EN[key] + trail : ko;
    }
    for (const el of root.querySelectorAll('[data-i18n]')) {
      if (el.__ko === undefined) el.__ko = el.innerHTML;
      const k = el.dataset.i18n;
      el.innerHTML = lang === 'en' && EN_HTML[k] ? EN_HTML[k] : el.__ko;
    }
    for (const el of root.querySelectorAll('[aria-label]')) {
      if (el.__koAria === undefined) el.__koAria = el.getAttribute('aria-label');
      el.setAttribute('aria-label', T(el.__koAria));
    }
  }

  return {
    T, apply,
    get lang() { return lang; },
    /** 설정값(auto · ko · en)으로 언어를 정한다 */
    set(pref) { lang = pick(pref); return lang; }
  };
})();
const T = I18N.T;
window.I18N = I18N;
