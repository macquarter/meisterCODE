/* MAISON MEISTER — 하이 주얼리 5점 (프라이빗 살롱 전용) */
var MEISTER_PRODUCTS = [
  {
    id: "aurora-riviere",
    cat: "NECKLACE",
    name: "아우로라 리비에르 네크리스",
    tagline: "총 42.8캐럿, 87개의 D컬러 다이아몬드가 이루는 빛의 강",
    price: 185000000,
    rating: 4.97,
    reviewsCount: 31,
    desc: "남아프리카 컬리넌 광산에서 온 원석을 3년에 걸쳐 커팅했습니다. 87개의 그라데이션 다이아몬드가 목선을 따라 흐르며, 각 스톤은 GIA 감정서가 함께 제공됩니다. 클래스프에는 착용자의 이니셜을 인그레이빙해 드립니다.",
    specs: [
      ["중심석", "5.2ct 오벌 브릴리언트, D / FL"],
      ["소재", "플래티넘 PT950"],
      ["총 캐럿", "42.8ct (87 스톤)"],
      ["감정", "GIA · 전 스톤 개별 감정서"]
    ],
    images: [
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1400&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=900&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=900&q=80&auto=format&fit=crop"
    ],
    reviews: [
      { name: "김O연", date: "2026년 5월", stars: 5, text: "자택 뷰잉으로 진행했는데 세공사님이 직접 오셔서 스톤 하나하나 설명해 주셨어요. 평생 잊지 못할 경험이었습니다." },
      { name: "박O진", date: "2026년 3월", stars: 5, text: "어머니 칠순 선물로 구매했습니다. 컨시어지가 인그레이빙까지 세심하게 챙겨주셨어요." }
    ]
  },
  {
    id: "imperial-emerald",
    cat: "RING",
    name: "임페리얼 에메랄드 링",
    tagline: "콜롬비아 무소산 8.1캐럿 에메랄드, 노오일 등급",
    price: 98000000,
    rating: 4.92,
    reviewsCount: 24,
    desc: "콜롬비아 무소 광산의 노오일(No-Oil) 에메랄드는 전 세계 에메랄드의 0.1%에 불과합니다. 깊은 초록의 중심석을 트라페조이드 다이아몬드 두 점이 감싸는 클래식 스리스톤 세팅입니다.",
    specs: [
      ["중심석", "8.1ct 에메랄드컷, 무소산 노오일"],
      ["사이드", "트라페조이드 다이아몬드 2P (1.4ct)"],
      ["소재", "플래티넘 PT950"],
      ["감정", "Gübelin · SSEF 동시 감정"]
    ],
    images: [
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=1400&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?w=900&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=900&q=80&auto=format&fit=crop"
    ],
    reviews: [
      { name: "이O호", date: "2026년 6월", stars: 5, text: "프로포즈용으로 맞춤 상담을 받았습니다. 링 사이즈 조정과 세팅 변경까지 완벽했어요." },
      { name: "정O아", date: "2026년 1월", stars: 4.5, text: "에메랄드 컬러가 사진보다 실물이 훨씬 깊어요. 뷰잉 룸의 조명 아래에서 보면 압도적입니다." }
    ]
  },
  {
    id: "celeste-sapphire",
    cat: "EARRINGS",
    name: "셀레스트 사파이어 이어링",
    tagline: "카슈미르 사파이어 한 쌍, 콘플라워 블루의 기적",
    price: 72000000,
    rating: 4.95,
    reviewsCount: 19,
    desc: "카슈미르 사파이어는 광산이 닫힌 지 100년이 넘어 경매에서만 거래되는 보석입니다. 완벽하게 매칭된 3.2캐럿 한 쌍이 다이아몬드 헤일로 안에서 밤하늘처럼 빛납니다.",
    specs: [
      ["중심석", "3.2ct × 2 쿠션컷, 카슈미르"],
      ["헤일로", "라운드 브릴리언트 44P (2.1ct)"],
      ["소재", "18K 화이트골드"],
      ["감정", "SSEF · 산지 감정서 포함"]
    ],
    images: [
      "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1400&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=900&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=900&q=80&auto=format&fit=crop"
    ],
    reviews: [
      { name: "최O민", date: "2026년 4월", stars: 5, text: "결혼 10주년 선물로 예약했습니다. 샴페인 페어링과 함께한 프라이빗 뷰잉, 호텔 스위트 같은 경험이었어요." },
      { name: "한O주", date: "2026년 2월", stars: 5, text: "카슈미르 산지 감정서까지 꼼꼼히 보여주셔서 신뢰가 갔습니다." }
    ]
  },
  {
    id: "scarlet-ruby",
    cat: "BRACELET",
    name: "스칼렛 루비 브레이슬릿",
    tagline: "미얀마 모곡산 피죤블러드 루비 12석의 행렬",
    price: 64000000,
    rating: 4.9,
    reviewsCount: 15,
    desc: "가장 귀한 붉은색, 피죤블러드. 미얀마 모곡 계곡의 무가열 루비 12석이 다이아몬드 링크 사이로 이어집니다. 손목 위에서 움직일 때마다 붉은 불꽃이 흐르는 듯한 아티큘레이션 세팅입니다.",
    specs: [
      ["루비", "12P 무가열, 총 14.6ct"],
      ["다이아몬드", "마퀴즈컷 링크 (3.8ct)"],
      ["소재", "18K 옐로우골드"],
      ["감정", "GRS 피죤블러드 등급"]
    ],
    images: [
      "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1400&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=900&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1610694955371-d4a3e0ce4b52?w=900&q=80&auto=format&fit=crop"
    ],
    reviews: [
      { name: "윤O서", date: "2026년 5월", stars: 5, text: "맞춤 제작 상담으로 길이를 조정했는데, 세공 기간 내내 사진으로 진행 과정을 공유해 주셨어요." },
      { name: "강O태", date: "2025년 12월", stars: 4.5, text: "루비 컬러가 정말 진합니다. 컨시어지 응대가 호텔급이에요." }
    ]
  },
  {
    id: "grand-maison-watch",
    cat: "TIMEPIECE",
    name: "그랑 메종 다이아몬드 워치",
    tagline: "베젤과 브레이슬릿 전체에 파베 세팅된 638개의 다이아몬드",
    price: 230000000,
    rating: 5.0,
    reviewsCount: 9,
    desc: "메종의 시계 아틀리에가 4년 만에 선보이는 하이 주얼리 워치. 638개의 다이아몬드가 스노우 파베 기법으로 세팅되어 다이얼 전체가 하나의 빙하처럼 빛납니다. 무브먼트는 스위스 수제 투르비용입니다.",
    specs: [
      ["다이아몬드", "638P 스노우 파베 (21.4ct)"],
      ["무브먼트", "수제 투르비용, 72시간 파워리저브"],
      ["케이스", "플래티넘 36mm"],
      ["한정", "월드 리미티드 3피스"]
    ],
    images: [
      "https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=1400&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=900&q=80&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?w=900&q=80&auto=format&fit=crop"
    ],
    reviews: [
      { name: "서O훈", date: "2026년 6월", stars: 5, text: "월드 리미티드 3피스 중 하나를 서울에서 볼 수 있다는 것 자체가 특권이었습니다." }
    ]
  }
];

function meisterWon(n) {
  return "₩" + n.toLocaleString("ko-KR");
}
