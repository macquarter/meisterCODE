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
    '감염된 도시. 비는 그치지 않는다.': 'An infected city. The rain never stops.',
    '손전등이 닿는 곳까지만, 세상은 존재한다.': 'The world ends where your flashlight does.',
    '전역 시작': 'Campaign',
    '챕터 선택': 'Chapters',
    '서바이벌': 'Survival',
    '서바이벌 — 전역 완수 시 개방 ({n}/{t})': 'Survival — unlocks after the campaign ({n}/{t})',
    '조작법': 'Controls',
    '설정': 'Settings',
    '최고 기록 · 서바이벌': 'Best · Survival',
    '정보 · 개인정보': 'About · Privacy',
    '돌아가기': 'Back',
    '{m}분 {s}초': '{m}m {s}s',
    '잠김': 'Locked',
    '클리어': 'Cleared',
    '서울': 'Seoul', '도쿄': 'Tokyo', '방콕': 'Bangkok',
    '한강': 'Han River', '스미다강': 'Sumida River', '짜오프라야강': 'Chao Phraya',
    '광화문': 'Gwanghwamun', '남산타워': 'Namsan Tower', '시부야 스크램블': 'Shibuya Scramble', '도쿄 타워': 'Tokyo Tower',
    '센소지': 'Senso-ji', '왓 아룬': 'Wat Arun', '민주기념탑': 'Democracy Monument', '야시장': 'Night Market',
    '서바이벌 — 도시 선택': 'Survival — choose a city',
    '광화문 · 남산타워 · 한강': 'Gwanghwamun · Namsan Tower · Han River',
    '시부야 스크램블 · 도쿄 타워 · 센소지 · 스미다강': 'Shibuya Scramble · Tokyo Tower · Senso-ji · Sumida River',
    '왓 아룬 · 민주기념탑 · 야시장 · 짜오프라야강': 'Wat Arun · Democracy Monument · Night Market · Chao Phraya',
    '진입': 'Go in',
    '진입 ': 'Start ', '집결지': 'Rally point',

    /* ── 챕터 ── */
    '첫 번째 밤': 'The First Night',
    '서울. 통신이 끊긴 지 아홉 시간. 가로등은 전부 죽었고 비만 내린다. 광화문 안뜰에 구조대 집결지가 있다고 했다. 가진 건 권총 한 자루와 손전등뿐이다.':
      'Seoul. Nine hours since the lines went dead. Every streetlight is out and only the rain is falling. They said the rescue rally point is in the Gwanghwamun courtyard. All you have is a pistol and a flashlight.',
    '광화문 안뜰까지 이동': 'Reach the Gwanghwamun courtyard',
    '길에 떨어진 무기를 주울 것': 'Pick up weapons along the way',
    '젖은 골목': 'Wet Alleys',
    '광화문은 비어 있었다. 무전기에서 남산 아래 좌표 하나가 반복된다. 가는 길에 보급 상자가 흩어져 있다 — 지금 챙기지 않으면 다음은 없다.':
      'Gwanghwamun was empty. The radio keeps repeating a coordinate below Namsan. Supply crates are scattered along the way — take them now, there won\'t be a next time.',
    '보급 상자 3개 확보': 'Secure 3 supply crates',
    '확보 후 집결지로 이동': 'Then head to the rally point',
    '달리는 것들': 'The Runners',
    '한강을 건너야 한다. 다리 위에는 버려진 차들뿐. 느린 것들만 있는 게 아니었다 — 어떤 개체는 뛰고, 어떤 것은 바닥을 기어 불빛 아래로 들어오기 전까지 보이지 않는다.':
      'You have to cross the Han. Only abandoned cars on the bridge. They aren\'t all slow — some run, and some crawl along the ground, unseen until they slide under your light.',
    '한강을 건너 집결지까지 돌파': 'Cross the Han and break through to the rally point',
    '발전소 구역': 'The Generator',
    '도쿄. 배는 스미다강 하구에 닿았다. 아사쿠사의 비상 발전기를 돌리면 동쪽 차단문이 열린다. 연료통 네 개. 그동안 발전기 소음은 저들을 부른다.':
      'Tokyo. The boat made the mouth of the Sumida. Start the emergency generator in Asakusa and the east gate opens. Four fuel cans. Meanwhile the noise will call them in.',
    '연료통 4개 회수': 'Recover 4 fuel cans',
    '차단문으로 이동': 'Head to the gate',
    '버텨라': 'Hold Out',
    '시부야 교차로. 차단문은 90초 뒤에 열린다. 그때까지는 이 교차로에서 살아 있어야 한다. 사방이 트여 있다 — 그만큼 사방에서 온다.':
      'Shibuya crossing. The gate opens in 90 seconds. Until then you stay alive on this crossing. It\'s open on every side — so they come from every side.',
    '90초 생존': 'Survive 90 seconds',
    '개방된 차단문으로 이동': 'Go through the open gate',
    '거대한 것': 'The Big One',
    '도쿄 타워 공원. 무전에서 마지막으로 들린 단어는 "크다"였다. 탄창 하나로는 멈추지 않는 개체가 이 구역을 돌아다닌다.':
      'Tokyo Tower park. The last word on the radio was "big". Something one magazine won\'t stop is walking this block.',
    '감염체 30기 소탕': 'Kill 30 infected',
    '집결지로 이동': 'Head to the rally point',
    '정전': 'Blackout',
    '방콕. 배터리가 얼마 남지 않았다. 예비 배터리는 야시장 노점 사이에 흩어져 있다. 불빛이 꺼지면 방향도, 사격선도 사라진다.':
      'Bangkok. The battery is nearly gone. Spares are scattered among the night market stalls. When the light dies, so do your bearings and your line of fire.',
    '예비 배터리 5개 회수': 'Recover 5 spare batteries',
    '마지막 다리': 'The Last Bridge',
    '짜오프라야강 건너 왓 아룬 쪽에 불빛이 보인다. 진짜 사람의 불빛이다. 그런데 다리 앞에 무언가가 서 있다. 저것은 걷지 않는다 — 기다리고 있다.':
      'Across the Chao Phraya, near Wat Arun, there are lights. Real, human lights. But something is standing in front of the bridge. It isn\'t walking — it\'s waiting.',
    '그것을 쓰러뜨리고 다리를 건너라': 'Bring it down and cross the bridge',
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
    '화질': 'Quality', '자동': 'Auto', '선명하게': 'Sharp', '가볍게': 'Light',
    '자동은 프레임이 떨어지면 그리는 해상도를 스스로 낮추고, 여유가 생기면 다시 올린다. 화면이 큰 기기(레티나 모니터·태블릿)에서 끊기면 가볍게로 두세요.':
      'Auto lowers the render resolution when frames drop and raises it again when there\'s room. If it stutters on a big screen (Retina display, tablet), choose Light.',
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
    '무기 선택': 'Choose weapon', '구역 지도': 'Area map'
  };

  // 굵게 · 링크가 섞인 문단은 통째로
  const EN_HTML = {
    howtoNote: 'On touch screens, touch and drag <b>anywhere on the left</b> to walk. The flashlight <b>aims itself</b> at the nearest enemy (or where you walk); drag on the right side to aim yourself, tap it to snap to the nearest enemy. Other schemes are in <b>Settings</b>.<br>' +
      'There is no fire button — <b>anything in your beam is shot automatically</b>, and shots only go where the light points.<br>' +
      'Pick up weapons by stepping on the <b>glowing icons</b> on the ground.<br>' +
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
