'use strict';
/* ═══════════════════════════════════════════
   LEFT CITY — 남겨진 도시 : 이야기
   대피는 아홉 시간 만에 끝났고, 도시는 사람을 두고 떠났다. 야간 배송 기사 도하는
   그 '남겨진 도시'들을 가로질러 남쪽의 마지막 배까지 간다. 길은 무전으로 이어진다 —
   도쿄의 무선사 하루, 방콕의 간호사 녹, 새벽호의 선장 메이.

   글은 [한국어, 영어] 쌍으로 둔다. 짧은 UI 문구는 i18n.js 의 사전이 맡고,
   긴 이야기 글은 여기서 언어를 고른다 — 사전 열쇠로 쓰기엔 길고 자주 고쳐 쓰이기 때문.
   ═══════════════════════════════════════════ */
const LT = pair => (pair ? (typeof I18N !== 'undefined' && I18N.lang === 'en' ? pair[1] : pair[0]) : '');

const STORY = {
  /** 무전에 나오는 사람들 — 이름과 자막 색 */
  speakers: {
    pa:   { name: ['자동 방송', 'Broadcast'], col: '#b9bcc0' },
    doha: { name: ['도하', 'Doha'], col: '#efe6d4' },
    haru: { name: ['하루', 'Haru'], col: '#7fd1ff' },
    nok:  { name: ['녹', 'Nok'], col: '#ffb86b' },
    may:  { name: ['메이', 'May'], col: '#9be7a0' },
    yuna: { name: ['유나 · 음성 메시지', 'Yuna · voicemail'], col: '#f4a6c8' }
  },

  /** 체험판의 끝(rc.43) — 3장 뒤, 정식판 안내 화면의 매달린 이야기 */
  paywall: {
    tease: ['방콕, 짜오프라야강. 다리 건너 진료소의 불빛 아래에 유나가 있을지도 모른다. 그런데 다리 앞에 무언가가 서 있다 — 며칠째, 사람 소리를 기다리며.',
            'Bangkok, on the Chao Phraya. Yuna may be under the clinic lights across the bridge. But something stands at the foot of it — has stood there for days, waiting for a human sound.']
  },

  /** 첫 전역 시작 때 한 번 — 카드 넉 장 */
  prologue: [
    ['대피는 아홉 시간 만에 끝났다.', 'The evacuation took nine hours.'],
    ['버스와 배와 비행기가 도시를 떠났다.\n남은 사람을 세는 사람은 없었다.', 'Buses, boats and planes left the city.\nNo one stayed behind to count who was left.'],
    ['그날 밤 도하는 지하 서버실에 마지막 택배를 내려놓고\n계단을 올라왔다.', 'That night Doha dropped the last parcel in a basement server room\nand climbed the stairs.'],
    ['휴대폰에는 동생 유나의 부재중 전화가\n열한 통 와 있었다.', 'His phone showed eleven missed calls\nfrom his sister, Yuna.'],
    ['도시는 이미 떠난 뒤였다.', 'The city had already gone.']
  ],

  /** 도시가 바뀌는 장 앞의 여정 지도 — 어느 장 앞에서, 어디서 어디로, 어떻게 */
  journey: {
    2: { from: 'seoul', to: 'tokyo', how: ['김 선장의 어선 · 바다 위의 이틀', 'Captain Kim\'s fishing boat · two days at sea'] },
    3: { from: 'tokyo', to: 'bangkok', how: ['남쪽으로 가는 화물선 · 엿새', 'A freighter heading south · six days'] },
    4: { from: 'bangkok', to: 'singapore', how: ['진료소 트럭으로 반도를 따라 · 사흘', 'The clinic\'s truck down the peninsula · three days'] },
    // 2부 — 새벽호의 항해
    5: { from: 'singapore', to: 'varanasi', how: ['새벽호로 벵골만을 건너, 강배로 갠지스를 거슬러 · 아흐레', 'The Dawn across the Bay of Bengal, then a riverboat up the Ganges · nine days'] },
    6: { from: 'varanasi', to: 'cairo', how: ['아라비아해 · 홍해 · 수에즈 · 열이틀', 'Arabian Sea · Red Sea · Suez · twelve days'] },
    7: { from: 'cairo', to: 'istanbul', how: ['지중해 동쪽 · 다르다넬스 · 나흘', 'The eastern Mediterranean · the Dardanelles · four days'] },
    8: { from: 'istanbul', to: 'venice', how: ['에게해를 돌아 아드리아해로 · 엿새', 'Around the Aegean into the Adriatic · six days'] },
    9: { from: 'venice', to: 'reykjavik', how: ['지브롤터를 지나 북대서양 · 열하루', 'Past Gibraltar into the North Atlantic · eleven days'] },
    10: { from: 'reykjavik', to: 'rio', how: ['붉은 쇄빙선으로 대서양을 남하 · 열나흘', 'South down the Atlantic on a red icebreaker · fourteen days'] },
    11: { from: 'rio', to: 'antarctic', how: ['남대서양 끝까지, 얼음 바다로 · 여드레', 'To the end of the South Atlantic, into the ice · eight days'] }
  },

  /** 지도 위 도시 (경도, 위도) */
  cities: { seoul: [127.0, 37.55], tokyo: [139.7, 35.68], bangkok: [100.5, 13.75], singapore: [103.82, 1.35],
    varanasi: [83.0, 25.32], cairo: [31.24, 30.04], venice: [12.34, 45.44], reykjavik: [-21.9, 64.15], antarctic: [-64.05, -64.77],
    istanbul: [28.98, 41.01], rio: [-43.2, -22.9] },

  /** 챕터별 무전과 마무리 한 줄. 무전 열쇠: start · mid · mid2 · done · hold · boss */
  chapters: [
    { // 1 첫 번째 밤 — 서울
      radio: {
        start: [['pa', '…시민 여러분은 광화문 집결지로 이동하십시오. 반복합니다. 시민 여러분은…', '…all citizens proceed to the Gwanghwamun rally point. Repeat. All citizens…']],
        mid: [['doha', '누구 없어요? …이거 녹음이잖아.', 'Anyone there? …It\'s a recording.'],
              ['doha', '9번 채널. …유나야, 듣고 있으면 아무 말이라도 해.', 'Channel 9. …Yuna, if you can hear this, say something.']],
        t45: [['doha', '버스가 남쪽 항구로 갔다고 했지. 남쪽… 얼마나 남쪽인데.', 'She said the bus went to a port down south. South… how far south.']],
        done: [['pa', '…마지막 수송은 스물두 시에 출발합니다…', '…the final transport departs at twenty-two hundred…'],
               ['doha', '지금이 몇 신데.', 'And what time is it now.'],
               ['haru', '…여기는 하루. 이 주파수 듣는 사람 있으면, 아무 말이라도 해.', '…This is Haru. If anyone\'s on this frequency, say something. Anything.']]
      },
      outro: ['안뜰은 비어 있었다. 그때 무전기 9번 채널 — 유나가 말한 그 채널이 지직거렸다. 도쿄의 하루라고 했다. 한강 하구 대피 기지에 김 선장의 배가 한 척 남았다고.', 'The courtyard was empty. Then channel 9 — the channel Yuna had named — crackled. A voice called Haru, in Tokyo. One boat was left, Captain Kim\'s, at the evac base on the Han estuary.'],
      // A(진입) 미션의 무전 · 마무리 — 첫 1분 안에 '왜 가는가'를 준다
      radioA: {
        start: [['yuna', '오빠, 왜 전화 안 받아. 학교에서 버스 태워 준대, 남쪽 항구로. 오빠도 꼭 와. 무전기 9번 채널, 알지? 꼭—', 'Why aren\'t you picking up? School\'s putting us on a bus. To a port down south. You have to come too. Radio channel 9, remember? Promise—'],
                ['doha', '…유나야.', '…Yuna.']],
        mid: [['doha', '구급 가방 하나. 하나만 더. 그리고 9번 채널.', 'One med bag. One more. Then channel 9.']],
        t45: [['pa', '…지하 상가에 계신 시민께서는 즉시 지상으로 이동하십시오…', '…citizens in the underground arcade, proceed to street level immediately…']],
        done: [['doha', '올라가자. 집결지는 광화문이랬지.', 'Up we go. The rally point was Gwanghwamun.']]
      },
      outroA: ['계단 끝에서 빗소리가 들렸다. 도하는 무전기를 9번 채널에 맞췄다. 잡음뿐이었다. 아직은.', 'Rain at the top of the stairs. Doha tuned the radio to channel 9. Only static. For now.']
    },
    { // 4 마지막 수송 — 한강 하구의 대피 기지
      radio: {
        start: [['haru', '김 선장이 기지 부두에 배를 댔대. 기름을 넣으려면 연료고를 열어야 해. 출입 카드가 막사 어딘가에 있을 거야.', 'Captain Kim tied up at the base pier. To refuel you need the depot open. The key cards should be somewhere in the barracks.']],
        mid: [['doha', '여기 군인들… 다 저것들이에요. 철모를 쓴 채로.', 'The soldiers here… they\'re all like that. Still wearing their helmets.'],
              ['haru', '대피를 끝까지 돌리던 사람들이야. …눈 마주치지 마. 그냥 지나가.', 'They kept the evacuation running to the end. …Don\'t look at their faces. Just keep moving.']],
        t45: [['haru', '명단 찾았어. 한유나 — 남부 항만에서 화물선에 탔대. 동남아를 돌아 싱가포르까지 가는 배야.', 'Found the roster. Han Yuna — boarded a freighter at the southern port. It runs through Southeast Asia, all the way to Singapore.'],
              ['doha', '싱가포르. …기다려.', 'Singapore. …Wait for me.']],
        done: [['haru', '카드 다 모았으면 본영 헬기장으로. 거기서 연료고가 열려. 김 선장이 시동 걸고 있어.', 'If you have all the cards, go to the helipad at headquarters. The depot opens from there. Kim\'s starting the engine.']]
      },
      radioA: {
        start: [['pa', '검문소 7 기록. 21시 12분 — 학생 수송 버스 세 대 통과. 행선지 남부 항만.', 'Checkpoint 7 log. 21:12 — three student transport buses passed. Destination: southern port.'],
                ['doha', '학생 버스… 유나네 학교다.', 'Student buses… that\'s Yuna\'s school.'],
                ['haru', '차단기 제어가 아직 살아 있어. 올라갈 때까지만 버텨.', 'The barrier control still works. Just hold until it lifts.']],
        mid: [['haru', '절반 왔어. 도하, 그 유나라는 애… 남쪽으로 간 배 명단을 뒤져 볼게.', 'Halfway. Doha, this Yuna… I\'ll dig through the lists of ships that went south.']],
        done: [['doha', '열린다. 간다.', 'It\'s lifting. Moving.']]
      },
      outroA: ['차단기 아래로 바퀴 자국 세 줄이 남쪽으로 이어져 있었다.', 'Under the barrier, three sets of tire tracks ran south.'],
      outro: ['연료고 문이 열렸다. 기지 게시판의 마지막 공지는 손글씨였다 — "22시 수송 취소. 남은 인원은 각자 남쪽으로."', 'The depot door opened. The last notice on the base board was handwritten: "22:00 transport cancelled. Everyone left, head south on your own."']
    },
    { // 7 거대한 것
      radio: {
        start: [['haru', '도착했구나. 진짜로 왔어. …미안, 반가워서. 타워 주변만 비워 줘. 내가 안테나를 걸면 내 목소리가 남쪽 끝까지 닿아.', 'You made it. You actually came. …Sorry, I\'m just glad. Clear the area around the tower. If I can hang the antenna up top, my voice reaches all the way south.']],
        mid: [['haru', '큰 거 조심해! 붙지 말고, 돌면서 쏴.', 'Watch the big one! Don\'t let it close in. Circle and shoot.']],
        done: [['haru', '안테나 걸었어. …도하, 나는 여기 남을게. 누군가는 계속 말해야 하잖아.', 'Antenna\'s up. …Doha, I\'m staying. Someone has to keep talking.'],
               ['haru', '…잠깐. 방콕에서 누가 9번 채널로 부르고 있어. 진료소래. 그 뒤에서 — 여자애가 네 이름을 불러.', '…Wait. Someone in Bangkok is calling on channel 9. A clinic. And behind them — a girl is calling your name.']]
      },
      outro: ['화물선이 부두를 떠났다. 무전기 속 하루의 목소리가 작아지다가, 다시 또렷해졌다. "방콕이야, 도하. 강 건너 진료소. 그런데… 다리 앞에 뭔가 서 있대."', 'The freighter left the dock. Haru\'s voice faded on the radio, then came back clear. "It\'s Bangkok, Doha. A clinic across the river. But… they say something is standing at the bridge."'],
      radioA: {
        start: [['haru', '여기는 하루. …진짜 목소리로 듣는 건 처음이네. 골목 중계기 둘만 살려 줘. 그러면 남쪽 배들한테 직접 물어볼 수 있어.', 'This is Haru. …First time hearing you for real. Just bring the two alley relays back. Then I can ask the southern ships myself.']],
        mid: [['haru', '하나 살았어! …남쪽 화물선 하나가 응답해. 학생들을 태웠대.', 'One\'s up! …A freighter down south is answering. Says it took on students.']],
        done: [['haru', '둘 다 살았어. 그 배, 방콕에 들렀다가 싱가포르로 간대. …도하, 이제 타워야.', 'Both live. That ship called at Bangkok, then on to Singapore. …Doha, now the tower.']]
      },
      outroA: ['전광판 하나가 다시 켜졌다. 아무도 보지 않는 광고가 빗속에서 돌아갔다.', 'One billboard flickered back on. An ad no one would watch played on in the rain.']
    },
    { // 9 기다리는 것
      radio: {
        start: [['nok', '하루가 말한 서울 사람? 저는 녹, 강 건너 진료소 간호사예요. 그게 다리를 막고 있어요. 며칠째 움직이질 않아요 — 소리를 기다리는 것 같아요.', 'The one from Seoul Haru told me about? I\'m Nok, a nurse at the clinic across the river. That thing is blocking the bridge. It hasn\'t moved in days — like it\'s waiting for a sound.']],
        mid: [['nok', '흔들려요! 조금만 더!', 'It\'s staggering! A little more!']],
        done: [['nok', '건너와요! 빨리!', 'Come across! Hurry!'],
               ['nok', '유나요? 열흘 전에 여기 있었어요. 열이 내리자마자 싱가포르 가는 배에 태웠어요. 내내 오빠 얘기만 했어요.', 'Yuna? She was here ten days ago. The moment her fever broke we put her on a boat to Singapore. She talked about her brother the whole time.']]
      },
      outro: ['진료소에는 열두 명이 있었다. 침대 머리맡 벽에 연필 글씨가 남아 있었다 — "오빠, 새벽호에서 기다릴게." 녹이 지도를 펼쳤다. 남쪽 끝 싱가포르, 새벽호. 사흘 뒤 마지막으로 떠난다.', 'Twelve people were at the clinic. Above one bed, pencil on the wall: "I\'ll wait for you on the Dawn." Nok spread out a map. The far south: Singapore, the ship Dawn. It leaves for the last time in three days.']
    },
    { // 11 새벽호
      radio: {
        start: [['may', '여기는 새벽호. 하루라는 사람이 며칠째 당신 이야기만 하더군요. 3번 부두로 와요 — 접안 준비 중입니다.', 'This is the Dawn. Someone named Haru has talked about nothing but you for days. Come to Pier 3 — we\'re preparing to dock.']],
        hold: [['may', '보입니다. 접안까지 60초. 갑판에서 보급품을 던질게요. 그 자리를 지켜요.', 'I see you. Sixty seconds to dock. We\'re throwing supplies down from the deck. Hold that position.'],
               ['haru', '도하, 거의 다 왔어. 끝까지 말할게.', 'Doha, you\'re almost there. I\'ll talk you all the way in.']],
        boss: [['nok', '뭔가 큰 게 와요—!', 'Something big is coming—!']],
        done: [['may', '현문 내렸습니다! 올라와요!', 'Gangway\'s down! Get aboard!'],
               ['may', '…갑판에 아까부터 아이 하나가 서 있어요. 당신 이름을 불러요.', '…There\'s a girl who\'s been standing on deck all this time. She\'s calling your name.']]
      },
      outro: ['현문 끝에서 유나가 뛰어왔다. 현문이 올라가고, 새벽호는 해가 뜨기 전에 항구를 떠났다.', 'Yuna came running down the gangway. Then the gangway rose, and the Dawn left port before sunrise.']
    },
    /* ── 2부: 새벽호의 항해 ── */
    { // 12 강가의 계단 — 바라나시
      radio: {
        start: [['nok', '항바이러스제는 파란 뚜껑 상자예요. 네 상자면 배 전체가 한 달은 버텨요.', 'The antivirals are in the blue-lidded crates. Four of them keeps the whole ship going for a month.']],
        mid: [['may', '강물이 불고 있어요. 진흙이 깊어지기 전에 서둘러요.', 'The river\'s rising. Hurry, before the mud gets any deeper.']],
        done: [['nok', '다 챙겼어요? 계단 연못에서 보트가 기다려요.', 'Got them all? The boat\'s waiting at the stepped pool.']]
      },
      outro: ['강 위로 꽃불 몇 개가 아직 떠내려가고 있었다. 누가 띄웠는지는 알 수 없었다.', 'A few flower-lamps were still drifting down the river. No one could say who had set them afloat.']
    },
    { // 13 모래 폭풍 — 카이로
      radio: {
        start: [['may', '저장고 문 원격 개방 시작. 100초. 버텨요.', 'Remote unlock on the depot door has started. A hundred seconds. Hold on.']],
        mid: [['haru', '…도하? 모래 때문에 잡음이 심해. 반만 더!', '…Doha? The sand is chewing up the signal. Halfway there!']],
        done: [['may', '문 열렸어요. 연료 확보. 피라미드 쪽으로 와요.', 'Door\'s open. Fuel secured. Head for the pyramids.']]
      },
      outro: ['피라미드는 사천오백 년을 버텼다. 하룻밤쯤은 아무것도 아니라는 듯이.', 'The pyramids had stood for four and a half thousand years. One more night was nothing to them.']
    },
    { // 13+ 두 대륙 사이 — 이스탄불
      radio: {
        start: [['may', '기관이 숨을 몰아쉬어요. 갈라타 정비창에 부품이 있대요 — 세 개면 돼요.', 'The engine is wheezing. There are parts at the Galata yard — three will do.']],
        mid: [['nok', '하나 남았어요! 돌길이 미끄러워요, 진흙 쪽은 피해요.', 'One left! The cobbles are slick — keep off the mud.']],
        done: [['may', '사이렌이에요 — 해협 경보가 저것들을 깨워요. 앞마당으로 뛰어요!', 'That\'s the strait siren — it\'s waking them. Run for the courtyard!']]
      },
      outro: ['기관이 다시 숨을 쉬었다. 돔 너머로 해협의 등대가 한 번 깜빡였다 — 두 대륙이 한꺼번에 어두워졌다.', 'The engine breathed again. Past the domes the strait lighthouse blinked once — and two continents went dark together.']
    },
    { // 14 잠긴 도시 — 베네치아
      radio: {
        start: [['haru', '종탑 중계기 셋이 살아 있으면 북대서양까지 닿아. 켜질 때까지 곁에 있어.', 'If those three bell-tower relays still work, we reach the North Atlantic. Stay with each one until it\'s up.']],
        mid: [['haru', '하나! …누가 응답해. 아이슬란드 억양이야.', 'One! …Someone\'s answering. Icelandic accent.']],
        mid2: [['haru', '둘! 하나만 더.', 'Two! One more.']],
        done: [['haru', '연결됐어. 레이캬비크에 쇄빙선이 있대. 남쪽으로 간대 — 남극까지.', 'We\'re through. There\'s an icebreaker in Reykjavik. It\'s heading south — all the way to Antarctica.']]
      },
      outro: ['광장의 물은 무릎까지 차 있었다. 종탑의 종이 바람에 한 번 울렸다.', 'The water in the square was knee-deep. The bell in the tower rang once in the wind.']
    },
    { // 15 불의 땅 — 레이캬비크
      radio: {
        start: [['may', '쇄빙선이 교회 아래 부두에서 기다려요. 용암 지대를 지나와요. 붉은 금은 밟지 말고.', 'The icebreaker is waiting at the pier below the church. Come through the lava field. Don\'t step on the red cracks.']],
        mid: [['nok', '절반 왔어요! 저것들은 열을 몰라요. 금 쪽으로 끌어들이면서 와요.', 'Halfway! They don\'t feel the heat. Lead them over the cracks as you come.']],
        done: [['may', '보여요! 교회 앞으로!', 'I see you! To the church!']]
      },
      outro: ['간헐천이 다시 솟았다. 김이 걷히자 쇄빙선의 붉은 뱃머리가 보였다.', 'The geyser went up again. As the steam cleared, the icebreaker\'s red bow came into view.']
    },
    { // 15+ 열대의 폭우 — 리우데자네이루
      radio: {
        start: [['may', '급유선이 오는 중이에요. 90초. 케이블카로 언덕에 올라가서 구세주상 아래에서 버텨요.', 'The tanker is on its way. Ninety seconds. Take the cable car up and hold under the statue.']],
        mid: [['haru', '도하, 들려? 비 소리 때문에 네 목소리가 반밖에 안 들려. 그래도 말할게.', 'Doha, hear me? The rain eats half your voice. I\'ll keep talking anyway.']],
        done: [['nok', '급유 끝! 언덕을 내려와요 — 남쪽으로 가요!', 'Fueled! Come down the hill — we\'re heading south!']]
      },
      outro: ['비가 그치자 해변의 파도 무늬가 다시 보였다. 두 팔을 벌린 조각 아래로, 쇄빙선이 마지막 바다로 뱃머리를 돌렸다.', 'When the rain stopped, the wave pattern on the promenade showed again. Under the open arms of the statue, the icebreaker turned toward the last sea.']
    },
    { // 16 마지막 기지 — 남극
      radio: {
        start: [['pa', '…본 기지는 격리 중입니다. 외부인은 헬기장에서 대기하십시오…', '…This station is under quarantine. Visitors wait at the helipad…'],
                ['doha', '여기까지 따라왔구나.', 'You followed us all the way here.']],
        hold: [['haru', '헬기 이륙 확인! 70초. 도하, 끝까지 말할게 — 이번에도.', 'Helicopter\'s up! Seventy seconds. Doha, I\'ll talk you all the way in — like last time.']],
        boss: [['nok', '얼음 밑에서 뭔가 올라와요—!', 'Something\'s coming up from under the ice—!']],
        done: [['may', '헬기 착륙! 올라타요!', 'Helicopter\'s down! Get on!']]
      },
      outro: ['헬기가 떠오르자 기지의 불빛이 하나씩 작아졌다. 아래로는 끝없는 얼음뿐이었다.', 'As the helicopter rose, the station lights shrank one by one. Below there was nothing but ice.']
    }
  ],

  epilogue: {
    kicker: ['에필로그', 'Epilogue'],
    title: ['남겨진 도시', 'Left City'],
    text: [
      ['갑판에서 돌아보니 도시는 여전히 불이 꺼진 채였다. 서울도, 도쿄도, 방콕도 — 모두 그렇게 남겨졌다.', 'From the deck, the city was still dark. Seoul, Tokyo, Bangkok — all of them left behind like that.'],
      ['유나는 도하의 소매를 붙든 채 잠들어 있었다.', 'Yuna had fallen asleep holding on to Doha\'s sleeve.'],
      ['무전기에서 익숙한 잡음이 났다. "…여기는 하루. 들리면, 아무 말이라도 해."', 'The radio crackled, familiar. "…This is Haru. If you can hear me, say something."'],
      ['도하는 송신 버튼을 눌렀다. "들려. 아직 여기 있어."', 'Doha pressed the button. "I hear you. I\'m still here."']
    ]
  },

  /** 2부 끝 */
  epilogue2: {
    kicker: ['2부 에필로그', 'Part 2 Epilogue'],
    title: ['새벽', 'Dawn'],
    text: [
      ['쇄빙선 갑판 위로 해가 떴다. 이 계절의 남극에는 밤이 오지 않는다고 했다.', 'The sun came up over the icebreaker\'s deck. Down here, they said, this season had no night.'],
      ['기지의 연구원들은 녹의 상자를 열어 보고 한참 말이 없었다. 그리고 실험실의 불을 켰다.', 'The station\'s researchers opened Nok\'s crates and said nothing for a long time. Then they switched on the lab lights.'],
      ['무전기가 울렸다. "…여기는 하루. 들리면, 아무 말이라도 해."', 'The radio crackled. "…This is Haru. If you can hear me, say something."'],
      ['도하는 송신 버튼을 눌렀다. "들려. 밤이 끝났어."', 'Doha pressed the button. "I hear you. The night is over."']
    ]
  },

  /** 도전 과제 — [제목, 설명] 한·영 */
  /* 좀비 도감 — 『좀비 서바이벌 가이드』 같은 현장 기록 문체. 마주치면(불빛에 비추거나 쓰러뜨리면) 열린다.
     cls 분류 · threat 위험도(1‒5) · obs 관찰 기록 · weak 약점 · tip 대처법 */
  codex: [
    { id: 'walker', n: ['걷는 것', 'Walker'], cls: ['일반 감염체', 'Common infected'], threat: 1,
      obs: ['가장 흔한 개체. 대피 방송이 끝난 뒤 거리에 남은 사람 대부분이 이렇게 됐다. 소리와 불빛 쪽으로 천천히 몸을 돌리고, 한 번 쫓기 시작하면 걸음이 세 배 가까이 빨라진다.', 'The most common kind — most people left in the streets after the evacuation ended up like this. Turns slowly toward sound and light; once it starts chasing, its pace nearly triples.'],
      weak: ['머리. 혼자일 때는 권총 두세 발이면 된다.', 'The head. Alone, two or three pistol rounds will do.'],
      tip: ['하나는 위협이 아니다. 문제는 셋, 다섯, 스물이다. 둘러싸이기 전에 트인 길로 빠질 것.', 'One is no threat. Three, five, twenty are. Get to open ground before they close the circle.'] },
    { id: 'runner', n: ['달리는 것', 'Runner'], cls: ['일반 감염체 · 변이', 'Common infected · variant'], threat: 2,
      obs: ['감염 초기에 쓰러진 젊은 개체로 보인다. 몸이 가볍고 숨을 고르지 않는다. 멀리서 들은 발소리에도 반응해 곧장 달려든다.', 'Seem to be young people who turned early. Light, and they never stop for breath. They charge straight in at footsteps heard from far away.'],
      weak: ['체력이 약하다. 달려오는 길목에 탄을 깔아 두면 쓰러진다.', 'Low stamina and health — put rounds down the lane they run in.'],
      tip: ['멀리서 끊어 쏴라. 붙으면 밀치기로 떼어 내고 한 걸음 물러선다.', 'Shoot them at range. If one reaches you, shove it off and step back.'] },
    { id: 'crawler', n: ['기는 것', 'Crawler'], cls: ['일반 감염체 · 손상', 'Common infected · damaged'], threat: 2,
      obs: ['다리를 잃었거나 척추가 꺾인 채 감염된 개체. 바닥에 납작 엎드려 있다가 웅크렸다 튀어나온다. 불빛 아래에서도 놓치기 쉽다.', 'Lost its legs or turned with a broken spine. Lies flat, coils, then springs. Easy to miss even under the light.'],
      weak: ['작고 약하다. 튀어오르는 순간 몸이 드러난다.', 'Small and weak. It exposes itself the moment it springs.'],
      tip: ['발밑을 비춰라. 튀는 순간 옆으로 비키면 헛손질한다.', 'Light the ground at your feet. Sidestep the leap and it grabs air.'] },
    { id: 'brute', n: ['덩치', 'Brute'], cls: ['특수 감염체', 'Special infected'], threat: 3,
      obs: ['감염 뒤에도 근육이 계속 부풀어 오른 개체. 탄창 하나로는 멈추지 않는다. 밀쳐도 거의 밀리지 않는다.', 'Muscle kept swelling after infection. A single magazine won\'t stop it, and a shove barely moves it.'],
      weak: ['느리다. 샷건 · 수류탄 · 소총처럼 한 번에 큰 피해를 주는 것.', 'Slow. Shotguns, grenades and rifles — big damage in one hit.'],
      tip: ['붙기 전에 쓰러뜨려라. 붙었다면 밀치지 말고 거리를 벌려라.', 'Drop it before it reaches you. If it does, don\'t shove — make distance.'] },
    { id: 'spitter', n: ['뱉는 것', 'Spitter'], cls: ['특수 감염체 · 원거리', 'Special infected · ranged'], threat: 3,
      obs: ['목이 부어오른 개체. 거리를 두고 서서 위산 덩어리를 뱉는다. 떨어진 자리에는 초록 웅덩이가 한동안 남는다. 모스크바에서 특히 많이 보고됐다 — 생존자들은 "보드카에 절었던 목"이라고 부른다.', 'A swollen-throated kind that keeps its distance and spits acid. The landing spot stays a green pool for a while. Reported most in Moscow — survivors call it "the vodka throat".'],
      weak: ['뱉는 동안 멈춰 선다. 그 틈에 쏴라.', 'It stands still while spitting. Shoot it then.'],
      tip: ['초록 고리가 보이면 옆으로 — 산은 서 있던 자리로 떨어진다. 웅덩이 위에서 싸우지 말 것.', 'See a green ring? Step aside — the acid lands where you stood. Never fight inside a pool.'] },
    { id: 'bloater', n: ['부푼 것', 'Bloater'], cls: ['특수 감염체 · 자폭', 'Special infected · bursting'], threat: 3,
      obs: ['배가 가스와 담즙으로 터질 듯 부푼 개체. 느리게 다가와 붙으면 터진다. 담즙을 뒤집어쓰면 앞이 흐려지고 무리가 그 냄새를 따라온다.', 'Belly bloated with gas and bile. It shuffles close and bursts. Bile blurs your sight, and the horde follows the smell.'],
      weak: ['한두 발이면 터진다 — 멀리서라면.', 'One or two rounds pop it — from a distance.'],
      tip: ['가까이서 쏘지 말 것. 무리 한가운데서 터뜨리면 오히려 무기가 된다.', 'Never pop it up close. Burst it in the middle of a horde and it becomes your weapon.'] },
    { id: 'screamer', n: ['비명 지르는 것', 'Screamer'], cls: ['특수 감염체 · 호출', 'Special infected · caller'], threat: 3,
      obs: ['사람을 보면 멈춰 서서 숨을 크게 들이켠다. 그 비명은 구역 전체의 무리를 부른다. 한 개체가 한 번만 지른다.', 'On seeing a person it stops and draws a deep breath. Its scream calls every horde in the district. Each screams only once.'],
      weak: ['숨을 들이켜는 1.6초. 맞을 때마다 조금씩 늦어진다.', 'The 1.6-second inhale — every hit delays it a little.'],
      tip: ['들이켜는 소리가 들리면 다른 것은 다 두고 그것부터.', 'Hear the inhale? Ignore everything else and shoot it first.'] },
    { id: 'weeper', n: ['우는 것', 'Weeper'], cls: ['특수 감염체 · 잠복', 'Special infected · dormant'], threat: 4,
      obs: ['길가에 웅크려 흐느낀다. 불빛을 오래 받거나, 가까이 다가오거나, 곁에서 뛰거나 쏘면 깨어나 끝까지 쫓아온다. 깨어난 뒤에는 그 무엇보다 빠르다.', 'Crouches by the road, sobbing. Light it too long, come close, run or shoot nearby and it wakes and hunts you to the end — faster than anything once awake.'],
      weak: ['잠들어 있는 동안에는 움직이지 않는다.', 'It doesn\'t move while asleep.'],
      tip: ['불을 끄고 돌아가라. 싸워야 한다면 깨우기 전에 가장 센 총으로 한 번에.', 'Turn off the light and go around. If you must fight, hit it with your strongest gun before it wakes.'] },
    { id: 'leaper', n: ['덮치는 것', 'Leaper'], cls: ['특수 감염체 · 도약', 'Special infected · leaper'], threat: 4,
      obs: ['웅크려 숨을 고르고 몸을 날린다. 날아드는 길에 붉은 띠가 깔린다. 나이로비 개체는 유난히 멀리, 자주 뛴다 — 생전에 달리기를 하던 사람들이라는 말이 돈다.', 'Coils, catches its breath, then launches — a red band marks its path. Nairobi\'s leap farther and more often; people say they were runners in life.'],
      weak: ['날아오는 도중. 그때 맞히면 떨어져 뒹군다.', 'Mid-air. Hit it then and it tumbles.'],
      tip: ['붉은 띠가 짙어지면 방향이 굳은 것 — 옆으로 한 걸음.', 'When the band darkens its aim is locked — one step aside.'] },
    { id: 'charger', n: ['들이받는 것', 'Charger'], cls: ['특수 감염체 · 돌진', 'Special infected · charger'], threat: 4,
      obs: ['한쪽 팔이 비대하게 자란 개체. 땅을 긁다가 직선으로 돌진한다. 벽에 박으면 한참 비틀거린다. 나이로비에서 무리 지어 다니는 것이 목격됐다.', 'One arm grew monstrous. It scrapes the ground, then charges in a straight line; hitting a wall leaves it reeling. Seen running in packs in Nairobi.'],
      weak: ['돌진 뒤의 휘청임 · 벽에 박힌 뒤.', 'The stagger after a charge, or after it hits a wall.'],
      tip: ['벽을 등지고 기다렸다가 마지막 순간 옆으로. 박힌 틈에 쏟아부어라.', 'Wait with a wall behind you, step aside at the last moment, then unload while it\'s stuck.'] },
    { id: 'puller', n: ['휘감는 것', 'Puller'], cls: ['특수 감염체 · 견인', 'Special infected · puller'], threat: 3,
      obs: ['멀리서 가래 끓는 기침을 하다 긴 혀를 쏜다. 감기면 끌려가고 한동안 발이 무겁다. 쓰러지면 매캐한 연기를 남긴다.', 'Coughs wetly from afar, then fires a long tongue. Caught, you\'re dragged and your legs go heavy. Leaves choking smoke when it dies.'],
      weak: ['혀는 곧게 날아간다. 그것을 맞히면 혀가 끊긴다.', 'The tongue flies straight. Shoot it and the tongue snaps.'],
      tip: ['기침 소리가 들리면 옆으로. 감겼다면 당황하지 말고 그것을 쏴라.', 'Hear the cough, step aside. If caught, don\'t panic — shoot it.'] },
    { id: 'riot', n: ['진압 경찰', 'Riot'], cls: ['언커먼 감염체 · 방호', 'Uncommon infected · armored'], threat: 3,
      obs: ['대피를 통제하던 진압 경찰. 방패와 방탄복을 그대로 둘렀다. 앞에서 오는 총알은 거의 다 막는다.', 'Riot police who were managing the evacuation, still in shield and body armor. Stops almost every round from the front.'],
      weak: ['석궁 · 매그넘 · 경기관총은 방패째 꿰뚫는다. 등과 옆구리, 그리고 폭발.', 'Crossbow, magnum and LMG punch right through the shield. Also its back, flanks — and explosions.'],
      tip: ['관통 무기가 없다면 밀쳐서 돌려세우고 등을 쏴라.', 'No piercing gun? Shove it around and shoot its back.'] },
    { id: 'behemoth', n: ['그것', 'The Behemoth'], cls: ['거대 개체 · 단독', 'Giant · solitary'], threat: 5,
      obs: ['마지막 다리를 막아선 개체. 공원 관리소 무전의 마지막 단어는 "크다"였다. 포효하면 기는 것들이 따라 나오고, 직선으로 돌진한다.', 'The thing guarding the last bridge. The park office radio\'s last word was "big". Its roar brings crawlers, and it charges in straight lines.'],
      weak: ['돌진이 벽에 막혔을 때. 그 외에는 없다 — 많이, 오래 쏴라.', 'When its charge slams into a wall. Otherwise nothing — shoot a lot, for a long time.'],
      tip: ['붙지 말 것. 거리를 두고 돌진을 벽으로 유도하라.', 'Never close in. Keep distance and lure its charges into walls.'] },
    { id: 'maw', n: ['구덩이 입', 'Pit Maw'], cls: ['화성 토착 · 매복', 'Martian · ambusher'], threat: 4,
      obs: ['테라포밍된 화성의 개미지옥 바닥에 산다. 감염체가 아니다 — 깔때기 안에 든 것이라면 사람이든 감염체든 가리지 않고 촉수로 후려쳐 입으로 끌어내린다.', 'Lives at the bottom of the antlion pits on terraformed Mars. Not infected at all — it lashes anything inside the funnel, human or infected, and drags it down.'],
      weak: ['입과 치켜든 촉수. 충분히 맞히면 12초 동안 움츠러든다.', 'The mouth and raised tentacles. Hurt it enough and it recoils for 12 seconds.'],
      tip: ['비탈을 내려가지 말고 둘레를 돌아라. 무리를 그 안으로 끌어들이면 입이 대신 싸운다.', 'Don\'t go down the slope — circle the rim. Lead a horde in and the maw fights for you.'] }
  ],
  achievements: [
    { id: 'night1',   t: ['첫 밤을 넘기다', 'Through the First Night'], d: ['1장을 마친다', 'Finish chapter 1'] },
    { id: 'seoul',    t: ['서울을 떠나다', 'Leaving Seoul'], d: ['2장(대피 기지)을 마친다', 'Finish chapter 2 (the evac base)'] },
    { id: 'tokyo',    t: ['계속 말할게', 'I\'ll Keep Talking'], d: ['3장을 마친다', 'Finish chapter 3'] },
    { id: 'bangkok',  t: ['세 번 깜빡임', 'Three Blinks'], d: ['4장을 마친다', 'Finish chapter 4'] },
    { id: 'dawn',     t: ['새벽호', 'The Dawn'], d: ['5장을 마치고 배에 오른다', 'Finish chapter 5 and board the ship'] },
    { id: 'harddawn', t: ['절멸의 밤', 'Night of Extinction'], d: ['절멸 난이도로 5장을 마친다', 'Finish chapter 5 on the hardest difficulty'] },
    { id: 'gradeS',   t: ['흠잡을 데 없이', 'Flawless'], d: ['어느 챕터에서든 S 평가', 'Earn an S grade in any chapter'] },
    { id: 'untouched',t: ['털끝 하나', 'Not a Scratch'], d: ['피해를 받지 않고 챕터를 마친다', 'Finish a chapter without taking damage'] },
    { id: 'pistol',   t: ['권총 한 자루', 'Just a Pistol'], d: ['1장을 권총만 쏘며 마친다', 'Finish chapter 1 firing only the pistol'] },
    { id: 'hush',     t: ['쉿', 'Hush'], d: ['우는 것을 한 번도 깨우지 않고 4장을 마친다', 'Finish chapter 4 without waking a Weeper'] },
    { id: 'part2',    t: ['밤이 오지 않는 곳', 'Where Night Doesn\'t Come'], d: ['10장을 마치고 남극을 떠난다', 'Finish chapter 10 and leave Antarctica'] },
    { id: 'clean',    t: ['한 번에', 'In One Go'], d: ['5장이나 10장을 체크포인트 없이 마친다', 'Finish chapter 5 or 10 without using a checkpoint'] },
    { id: 'rec10',    t: ['주워 읽는 사람', 'Reader'], d: ['기록 10장을 찾는다', 'Find 10 records'] },
    { id: 'rec20',    t: ['남겨진 기록', 'Everything Left Behind'], d: ['기록 32장을 모두 찾는다', 'Find all 32 records'] },
    { id: 'surv10',   t: ['도시의 주인', 'Owner of the City'], d: ['서바이벌에서 10분을 버틴다', 'Last 10 minutes in Survival'] },
    { id: 'cities',   t: ['네 도시의 밤', 'Four Cities, Four Nights'], d: ['네 도시 모두 서바이벌에서 3분을 버틴다', 'Last 3 minutes in Survival in all four cities'] },
    { id: 'world',    t: ['아홉 도시의 밤', 'Nine Cities, Nine Nights'], d: ['아홉 도시 모두 서바이벌에서 3분을 버틴다', 'Last 3 minutes in Survival in all nine cities'] },
    { id: 'lava',     t: ['불의 심판', 'Trial by Fire'], d: ['한 판에서 감염체 10기를 용암 균열 위로 끌어들여 쓰러뜨린다', 'Lure 10 infected to their end on lava cracks in one run'] },
    { id: 'antlion',  t: ['개미지옥', 'Antlion'], d: ['한 판에서 감염체 15기를 화성의 구덩이 입에 먹인다', 'Feed 15 infected to the Mars pit maws in one run'] },
    { id: 'codex',    t: ['좀비 백서', 'The Field Guide'], d: ['도감의 모든 개체를 마주친다', 'Encounter every entry in the field guide'] },
    { id: 'gold1',    t: ['첫 금메달', 'First Gold'], d: ['도전에서 금메달을 딴다', 'Earn a gold medal in a challenge'] },
    { id: 'goldAll',  t: ['다섯 개의 금', 'Five Golds'], d: ['도전 다섯 개 모두 금메달', 'Earn gold in all five challenges'] },
    { id: 'k1000',    t: ['천 번의 밤', 'A Thousand Nights'], d: ['감염체를 모두 합쳐 1,000기 처치한다', 'Kill 1,000 infected in total'] }
  ],

  /** 기록 — 챕터마다 둘. 길에 떨어진 종이를 밟아 줍는다. id 는 저장 열쇠라 챕터가 끼어들어도 바꾸지 않는다 */
  records: [
    { id: 'c1a', ch: 0, title: ['대피 안내문', 'Evacuation notice'],
      text: ['[긴급] 종로구 주민은 광화문 집결지로. 1인 가방 1개. 반려동물 동반 불가. 22시 이후 추가 수송 없음.', '[URGENT] Jongno residents to the Gwanghwamun rally point. One bag per person. No pets. No further transport after 22:00.'] },
    { id: 'c1b', ch: 0, title: ['배송 전표', 'Delivery slip'],
      text: ['수령인: 지하 2층 서버실. 비고: 부재 시 문 앞. 서명란에 누군가 적어 두었다 — "마지막까지 고마워요."', 'Recipient: B2 server room. Note: leave at door if absent. In the signature box someone wrote: "Thanks for coming, to the very end."'] },
    { id: 'c2a', ch: 0, title: ['영수증 뒷면', 'Back of a receipt'],
      text: ['엄마 나 남산 쪽으로 가. 버스 놓쳤어. 무전 9번 채널 들어. — 지민', 'Mom, I\'m heading toward Namsan. Missed the bus. Listen on radio channel 9. — Jimin'] },
    { id: 'c2b', ch: 0, title: ['보급 상자 표찰', 'Crate tag'],
      text: ['제7보급대. 수량 확인 필요 없음. 그냥 가져가십시오.', '7th Supply Unit. No need to sign for it. Just take it.'] },
    { id: 'c3a', ch: 0, title: ['차 안의 쪽지', 'Note in a car'],
      text: ['기름 떨어짐. 걸어서 건넙니다. 이 차 쓰실 분, 열쇠는 햇빛 가리개 뒤.', 'Out of gas. Crossing on foot. If you need this car, the key is behind the sun visor.'] },
    { id: 'c3b', ch: 0, title: ['선착장 화이트보드', 'Pier whiteboard'],
      text: ['김 선장 — 23시, 03시 운항. 자리 없으면 지붕에라도. 이름 적고 갈 것. (아래로 이름이 마흔 줄 넘게 이어진다)', 'Capt. Kim — runs at 23:00 and 03:00. No seats? Ride on the roof. Write your name before you go. (Over forty names follow.)'] },
    { id: 'cba', ch: 1, title: ['작전 일지', 'Operations log'],
      text: ['D+0 21:40. 수송 차량 일곱 대 중 두 대 귀환. 집결지 인원 통제 불가. 정문 폐쇄 명령 — 거부함.', 'D+0 21:40. Two of seven transports returned. Rally point beyond control. Ordered to close the gate. Refused.'] },
    { id: 'cbb', ch: 1, title: ['철망의 인식표', 'Tags on the fence'],
      text: ['이름이 새겨진 인식표 열한 개가 철망에 묶여 있다. 그 아래 분필 글씨 — "먼저 간다. 미안하다."', 'Eleven name tags tied to the fence. Below them, in chalk: "Going ahead. Sorry."'] },
    { id: 'cbc', ch: 1, title: ['수송 명단', 'Transport roster'],
      text: ['학생 수송 3호차 → 남부 항만. 38명. 스물두 번째 줄 — 한유나(2학년 3반). 비고: 화물선 연계, 남쪽 경유 싱가포르.', 'Student transport no. 3 → southern port. 38 aboard. Line twenty-two — Han Yuna (Year 2, Class 3). Note: freighter connection, via the south to Singapore.'] },
    { id: 'c4a', ch: 2, title: ['하루의 교신 일지', 'Haru\'s radio log'],
      text: ['D+11. 오늘 교신 4명. 오사카 1, 나고야 2, 요코하마 1. 서울은 아직 0.', 'D+11. Four contacts today. Osaka 1, Nagoya 2, Yokohama 1. Seoul still 0.'] },
    { id: 'c4b', ch: 2, title: ['셔터의 낙서', 'Graffiti on a shutter'],
      text: ['안에 사람 있음. 문 두드리지 말고 무전 9번으로.', 'Someone inside. Don\'t knock. Use radio channel 9.'] },
    { id: 'c5a', ch: 2, title: ['전광판 기록', 'Billboard log'],
      text: ['SYSTEM: 공공 안내 송출 실패 3,214회. 재시도 대기 중.', 'SYSTEM: Public notice broadcast failed 3,214 times. Waiting to retry.'] },
    { id: 'c5b', ch: 2, title: ['찢어진 전단', 'Torn flyer'],
      text: ['남쪽으로 가는 배가 있다. 싱가포르, 3번 부두. 믿을지는 당신 몫.', 'There is a ship going south. Singapore, Pier 3. Believe it or don\'t.'] },
    { id: 'c6a', ch: 2, title: ['공원 관리소 기록', 'Park office report'],
      text: ['큰 개체 목격. 키 3미터 이상. 총소리를 향해 움직임. 소리가 클수록 빨라짐.', 'Large one sighted. Over three meters tall. Moves toward gunfire. The louder, the faster.'] },
    { id: 'c6b', ch: 2, title: ['하루의 메모', 'Haru\'s note'],
      text: ['도하에게. 안테나 고정 볼트는 오른쪽 주머니에. 내가 못 내려오면 그냥 가.', 'To Doha. The antenna bolts are in the right pocket. If I don\'t come down, just go.'] },
    { id: 'c7a', ch: 3, title: ['노점 장부', 'Stall ledger'],
      text: ['망고 찹쌀밥 12. 외상 3. 다들 돌아오면 받기로.', 'Mango sticky rice: 12. On credit: 3. Collect when everyone gets back.'] },
    { id: 'c7b', ch: 3, title: ['진료소 공지', 'Clinic notice'],
      text: ['발열 환자는 북쪽 구역. 물린 자국이 있으면 솔직하게 말할 것. 우리는 내쫓지 않음.', 'Fever patients to the north wing. If you\'ve been bitten, tell us honestly. We won\'t turn you away.'] },
    { id: 'c8a', ch: 3, title: ['녹의 근무표', 'Nok\'s rota'],
      text: ['녹: 야간 / 녹: 야간 / 녹: 야간. 다른 칸의 이름은 모두 지워져 있다.', 'Nok: night / Nok: night / Nok: night. Every other name has been erased.'] },
    { id: 'c8b', ch: 3, title: ['초소 무전 기록', 'Checkpoint radio log'],
      text: ['…그건 다리 앞에서 멈췄다. 사람 소리를 기다리는 것 같다. 교대 인원 없음. 반복, 교대 인원 없음…', '…it stopped at the foot of the bridge. Seems to be waiting for human sounds. No relief. Repeat, no relief…'] },
    { id: 'c9a', ch: 4, title: ['중계기 점검표', 'Relay checklist'],
      text: ['비상 중계망 3/3 정상. 점검자 서명 없음. 날짜는 대피 전날.', 'Emergency relay network 3/3 nominal. No inspector signature. Dated the day before the evacuation.'] },
    { id: 'c9b', ch: 4, title: ['쟁반 밑 편지', 'Letter under a tray'],
      text: ['아빠, 새벽호 타. 우리 먼저 가 있을게. 리본 단 가방 찾아.', 'Dad, get on the Dawn. We went ahead. Look for the bag with the ribbon.'] },
    { id: 'c10a', ch: 4, title: ['새벽호 승선 명단', 'Dawn passenger list'],
      text: ['총 311명. 마지막 줄은 비어 있다. 누군가 연필로 적어 두었다 — "한 명 더."', '311 in total. The last line is blank. Someone wrote in pencil: "One more."'] },
    { id: 'c10b', ch: 4, title: ['메이의 항해 일지', 'May\'s logbook'],
      text: ['출항 예정 05:00. 하루라는 무선사가 계속 기다려 달라고 한다. 5분만 더 기다리기로 한다.', 'Departure 05:00. A radio operator called Haru keeps asking us to wait. Decided to wait five more minutes.'] },
    /* 2부 */
    { id: 'c12a', ch: 5, title: ['보트 대여 장부', 'Boat rental ledger'],
      text: ['보트 14척 중 13척 대여 중. 반납 기한 칸에는 모두 같은 말 — "돌아오면".', 'Thirteen of fourteen boats out. Every due-back box says the same thing: "When we return."'] },
    { id: 'c12b', ch: 5, title: ['약품 창고 메모', 'Pharmacy store note'],
      text: ['항바이러스제 — 효과 미확인. 그래도 남겨 둔다. 누군가는 확인하겠지.', 'Antivirals — effect unconfirmed. Leaving them anyway. Someone will find out.'] },
    { id: 'c13a', ch: 6, title: ['안내판의 낙서', 'Graffiti on a sign'],
      text: ['"입장 마감 17:00" 위에 누가 고쳐 적었다 — "영업 끝."', 'Over "Last entry 17:00" someone has written: "Closed for good."'] },
    { id: 'c13b', ch: 6, title: ['연료 저장고 일지', 'Fuel depot log'],
      text: ['마지막 출고: 남쪽으로 가는 배 여섯 척. 모두 같은 말을 했다 — 남극에는 아직 없다고.', 'Last fuel out: six ships heading south. They all said the same thing — it hasn\'t reached Antarctica yet.'] },
    { id: 'c17a', ch: 7, title: ['정비창 작업표', 'Shipyard work order'],
      text: ['선박: 미상. 부품: 연료 분사기 3. 비고 — 다 고치면 문 잠그지 말 것. 누가 또 올지 모르니까.', 'Vessel: unknown. Parts: 3 fuel injectors. Note — when you\'re done, don\'t lock the door. Someone else might come.'] },
    { id: 'c17b', ch: 7, title: ['찻집 칠판', 'Teahouse chalkboard'],
      text: ['차 공짜. 설탕은 없음. 해협 건너편 가족에게 — 우리는 위스퀴다르로 감. 거기서 만나.', 'Tea is free. No sugar. To family across the strait — we went to Üsküdar. Meet us there.'] },
    { id: 'c14a', ch: 8, title: ['곤돌라 사공의 쪽지', 'Gondolier\'s note'],
      text: ['손님 없음. 물만 오름. 노는 문 옆에 두고 간다.', 'No passengers. Only the water rising. Left the oar by the door.'] },
    { id: 'c14b', ch: 8, title: ['종탑 관리 기록', 'Bell tower log'],
      text: ['중계기 점검 완료. 배터리 72시간. 그 뒤로는 종을 칠 것.', 'Relay checked. Battery: 72 hours. After that, ring the bell.'] },
    { id: 'c15a', ch: 9, title: ['온천 수영장 명부', 'Hot-pool sign-in sheet'],
      text: ['오늘 입장 0명. 물은 여전히 따뜻함.', 'Visitors today: 0. The water is still warm.'] },
    { id: 'c15b', ch: 9, title: ['쇄빙선 화물 목록', 'Icebreaker manifest'],
      text: ['연료 · 식량 · 연구 장비 · 승객 40명. 행선지: 남극 반도 연구 기지.', 'Fuel · food · research gear · 40 passengers. Destination: Antarctic Peninsula research station.'] },
    { id: 'c18a', ch: 10, title: ['해변 구조대 일지', 'Lifeguard log'],
      text: ['04:10 파도 높음. 04:30 사람들이 언덕으로 감. 05:00 나도 감. 구조대 깃발은 내리지 않았다.', '04:10 high surf. 04:30 people heading up the hill. 05:00 me too. Left the lifeguard flag up.'] },
    { id: 'c18b', ch: 10, title: ['케이블카 표', 'Cable car ticket'],
      text: ['편도. 날짜가 지워졌다. 뒷면에 아이 글씨 — "위에서는 다 보여."', 'One way. The date is smudged. On the back, in a child\'s hand — "You can see everything from up there."'] },
    { id: 'c16a', ch: 11, title: ['기지 격리 수칙', 'Station quarantine rules'],
      text: ['외부인은 헬기장에서 48시간 대기. 증상이 없으면 입실. 예외 없음.', 'Visitors wait 48 hours at the helipad. No symptoms, then you may enter. No exceptions.'] },
    { id: 'c16b', ch: 11, title: ['연구원의 메모', 'Researcher\'s note'],
      text: ['샘플 17번 반응 있음. 더 필요하다. 누가 와 줄까.', 'Sample 17 is responding. We need more. Will anyone come?'] }
  ]
};
