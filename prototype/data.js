/*
 * 공고 19건 = 실제 공고 12건(교내 r01~r05, 교외 e01~e07) + 예시(가상) 공고 7건(s01~s07).
 * 실제 공고는 사용자가 제공한 공고 정리표를 바탕으로 했다. 연도는 2026년(일부 일정은 2027년)으로 표에 맞춰
 * 입력했고, 표에 연도가 없는 항목은 2026년으로 가정했다.
 * 예시 공고(isSample: true)는 학년·재학 상태·대상 학과 필터를 확인하려고 만든 가상 데이터이며 화면에 "예시"
 * 배지가 표시된다. 기획서의 "고정 공고 12건"으로 되돌리려면 s01~s07을 지운다.
 *
 * 필드: id, title, scope(campus|external), interests[], isSample,
 *   eligibility{text, grades[], status{}, departments[]}  지원 자격
 *       text: 표시용 문구
 *       grades: [1,2,3,4] = 학년 제한 없음, null = 확인 필요
 *       status: 재학 상태별 지원 가능 여부 {enrolled, leave, grad, general}
 *               true = 가능(원문에 명시), false = 제외(원문에 명시 또는 모집 대상이 재학생·대학생으로 한정), null = 확인 필요
 *       departments: null = 전 학과·학과 무관(항상 표시), ["공과대학", "컴퓨터학부"] = 해당 단과대학·학부·학과 한정
 *   schedule{text, slots[]}      활동 일정 (참여 가능 여부 판단용)
 *       slots: 요구하는 참여 시간대. [] = 요구하는 시간대 없음(제출형 등), null = 확인 필요
 *   deadline                     신청 마감일 "YYYY-MM-DD" (지원 기한 확인용, 활동 일정과 별개)
 *   deadlineNote                 마감 시각 등 보충 (선택, 없으면 null)
 *   sourceUrl, sourceLabel       원문 링크와 표시 문구(선택). 원문이 없으면 sourceUrl은 null
 *   attachments[]                추가 링크 [{label, url}] (선택)
 *   image                        포스터 {src, alt, origin} (선택). origin은 이미지 출처 주소
 * 필터용 값이 null이면 "확인 필요"로 표시하고, 필터에서는 숨기지 않고 통과시킨다.
 */
(function (root) {
  // D-day 계산 기준일. 실제 오늘 날짜를 쓰지 않아 화면이 항상 같게 보이도록 고정한다.
  var REFERENCE_DATE = "2026-11-12";

  var INTERESTS = ["IT", "디자인", "창업", "봉사", "어학·글로벌"];

  var GRADES = [
    { value: 1, label: "1학년" },
    { value: 2, label: "2학년" },
    { value: 3, label: "3학년" },
    { value: 4, label: "4학년" }
  ];

  var STATUSES = [
    { value: "enrolled", label: "재학생" },
    { value: "leave", label: "휴학생" },
    { value: "grad", label: "대학원생" },
    { value: "general", label: "일반인(비재학)" }
  ];

  var SLOTS = [
    { value: "semester-eve", label: "학기 중 평일 저녁" },
    { value: "weekend", label: "주말" },
    { value: "vacation", label: "방학 중" }
  ];

  // 국립목포대 단과대학과 학부·학과. 웹 검색 결과를 바탕으로 한 것이라 실제와 다를 수 있다.
  // 자연과학대학은 학과 목록을 확인하지 못해 단과대학 단위로만 둔다.
  var DEPARTMENTS = [
    { college: "인문대학", items: ["국어국문·문예창작학부", "글로벌커뮤니케이션학부", "인문콘텐츠학부"] },
    { college: "사회과학대학", items: ["법·경찰학부", "행정·언론미디어학부", "지적학과", "사회복지학과", "관광학과"] },
    { college: "자연과학대학", items: ["자연과학대학 (학과 미확인)"] },
    { college: "생명·의과학대학", items: ["식품·제약공학부", "원예산림학부", "수산생명의학과", "간호학과"] },
    { college: "공과대학", items: ["반도체공학과", "기계조선해양공학부", "전기공학과", "인공지능공학과", "컴퓨터학부", "건축·토목·환경공학부", "도시계획및조경학부", "건축학과", "에너지화학공학과", "스마트모빌리티학부"] },
    { college: "생활과학예술체육대학", items: ["아동학과", "식품영양학과", "패션의류학과", "음악공연기획학부", "아트앤디자인학부", "체육학과", "예술크리에이티브학부"] },
    { college: "사범대학", items: ["교육학과", "윤리교육과", "영어교육과", "수학교육과", "환경교육과"] },
    { college: "경영대학", items: ["경영학부", "경제무역학부"] },
    { college: "약학대학", items: ["약학과"] }
  ];

  // 학과 한 곳을 고르면 그 학과와 소속 단과대학이 모두 "내 소속"으로 취급된다.
  function departmentScopes(name) {
    if (!name) return [];
    for (var i = 0; i < DEPARTMENTS.length; i++) {
      if (DEPARTMENTS[i].items.indexOf(name) > -1) return [name, DEPARTMENTS[i].college];
    }
    return [name];
  }

  var ACTIVITIES = [
    /* ---------- 교내 (국립목포대) ---------- */
    {
      id: "r01", title: "국립목포대 제4차 외국어 특강 영어 회화", scope: "campus",
      interests: ["어학·글로벌"],
      eligibility: {
        text: "국립목포대 학생 대상 안내. 세부 학년은 확인 필요", grades: null,
        status: { enrolled: true, leave: null, grad: null, general: null }, departments: null
      },
      schedule: { text: "11/3~12/11, 6주. 반별 요일·시간 확인 필요", slots: null },
      deadline: "2026-10-28", deadlineNote: null,
      sourceUrl: "https://oia.mokpo.ac.kr/bbs/iiee/155/286755/artclView.do",
      attachments: [],
      image: {
        src: "images/oia-lecture.png", alt: "제4차 외국어 특강 영어 회화 포스터",
        origin: "https://oia.mokpo.ac.kr/bbs/iiee/155/263474/download.do"
      },
      isSample: false
    },
    {
      id: "r02", title: "제2회 Glocart-M 전시 작가·단체 공모", scope: "campus",
      interests: ["디자인"],
      eligibility: {
        text: "일반 부문은 지역 예술인·단체, 청년작가 부문은 재학생 중심. 학년 제한 명시 없음", grades: null,
        status: { enrolled: true, leave: null, grad: null, general: true }, departments: null
      },
      schedule: { text: "9/17~12/16 사이 협의한 2주. 설치·철수 일정 확인 필요", slots: null },
      deadline: "2026-07-20", deadlineNote: "18:00까지",
      sourceUrl: "https://arts.mokpo.ac.kr/bbs/admgraduate/357/284820/artclView.do",
      attachments: [],
      image: {
        src: "images/glocart.jpg", alt: "제2회 Glocart-M 전시 작가·단체 공개모집 포스터",
        origin: "https://t1.daumcdn.net/news/202607/09/moneytoday/20260709104010852tptt.jpg"
      },
      isSample: false
    },
    {
      id: "r03", title: "하계 해외봉사단 파두단 2기", scope: "campus",
      interests: ["봉사", "어학·글로벌"],
      eligibility: {
        text: "전 학과 대상. 유학생·초과학기자·졸업유예자 제외", grades: null,
        status: { enrolled: true, leave: null, grad: null, general: false }, departments: null
      },
      schedule: { text: "4/27~9/11 전체 활동. 인도네시아 파견 8/17~8/29(방학 중·주말 포함)", slots: ["vacation", "weekend"] },
      deadline: "2026-04-07", deadlineNote: "24:00까지",
      sourceUrl: "https://moe.mokpo.ac.kr/bbs/moe/1699/282273/artclView.do",
      attachments: [],
      image: {
        src: "images/padudan.jpg", alt: "하계 해외봉사단 파두단 2기 모집 포스터",
        origin: "https://moe.mokpo.ac.kr/CrossEditor/binary/images/000371/20260331102022545_EOQXSXGN.jpg"
      },
      isSample: false
    },
    {
      id: "r04", title: "2026 RISE 창업동아리", scope: "campus",
      interests: ["창업"],
      eligibility: {
        text: "국립목포대 재학생 2인 이상 팀. 학년 제한 명시 없음", grades: null,
        status: { enrolled: true, leave: null, grad: null, general: false }, departments: null
      },
      schedule: { text: "4/6~11/13 운영. 팀별 활동 요일·시간 확인 필요", slots: null },
      deadline: "2026-03-27", deadlineNote: "18:00까지 (연장 공고 기준)",
      sourceUrl: "https://www.mokpo.ac.kr/www/308/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGd3d3JTJGMTQ4JTJGMTcwMjYyJTJGYXJ0Y2xWaWV3LmRvJTNG",
      attachments: [
        { label: "최초 모집 게시글", url: "https://dpa.mokpo.ac.kr/bbs/dpa/327/281911/artclView.do" }
      ],
      // 사용자가 제공한 최초 모집 포스터(마감 3/20 표기). 신청 마감일은 연장 공고 기준(3/27)을 쓴다.
      image: {
        src: "images/RISE.jpg", alt: "2026학년도 RISE 사업단 창업동아리 모집 포스터 (최초 모집)",
        origin: "https://dpa.mokpo.ac.kr/bbs/dpa/327/281911/artclView.do"
      },
      isSample: false
    },
    {
      id: "r05", title: "제9기 B-CYCLE 멘토링 멘토", scope: "campus",
      interests: ["봉사"],
      eligibility: {
        text: "직전 학기 80점 또는 평점 2.75/4.5 이상인 재학생. 교직과정 이수자 우선, 영어·수학 우대", grades: null,
        status: { enrolled: true, leave: null, grad: null, general: false }, departments: null
      },
      schedule: { text: "9~12월, 주 2회·총 4시간 이상 1:1 멘토링. 활동 요일·시간 확인 필요", slots: null },
      deadline: "2026-06-21", deadlineNote: null,
      sourceUrl: "https://gsit.mokpo.ac.kr/bbs/trade/255/284184/artclView.do",
      attachments: [],
      image: {
        src: "images/bcycle.jpg", alt: "제9기 B-CYCLE 멘토링 멘토 모집 포스터",
        origin: "https://dpa.mokpo.ac.kr/bbs/hanyak/193/260186/download.do"
      },
      isSample: false
    },

    /* ---------- 교외 ---------- */
    {
      id: "e01", title: "현대자동차그룹 차량용 앱 개발 공모전", scope: "external",
      interests: ["IT"],
      eligibility: {
        text: "대학·대학원생, 일반인, 스타트업. 개인 또는 최대 5인 팀", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: null, grad: true, general: true }, departments: null
      },
      schedule: { text: "본선 진출팀 오프라인 PT 12/3~12/4, 시간 확인 필요. 수상팀 전시·시상 2027년 2월", slots: null },
      deadline: "2026-11-15", deadlineNote: null,
      sourceUrl: "https://appdevchallenge.auto-hmg.io/notice/c0a1a000-2026-4923-8000-000000000001",
      attachments: [],
      image: {
        src: "images/hyundai.webp", alt: "현대자동차그룹 차량용 앱 개발 공모전 포스터",
        origin: "https://appdevchallenge.auto-hmg.io/images/poster/final-contest-poster.webp?dpl=dpl_GmF2AHWZMQpfjmkoHAz6HN5tuiXG"
      },
      isSample: false
    },
    {
      id: "e02", title: "전남광주통합특별시 중국언어문화경진대회", scope: "external",
      interests: ["어학·글로벌"],
      eligibility: {
        text: "대한민국 국민. 중화권 총 5년 이상 체류자, 역대 대상 수상자 등은 참가 제한", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: true, grad: true, general: true }, departments: null
      },
      schedule: { text: "본선 11/28(토) 10:00~12:00", slots: ["weekend"] },
      deadline: "2026-11-18", deadlineNote: null,
      sourceUrl: "https://icf.icehs.kr/boardCnts/fileDown.do?fileSeq=066ba07721dc713aacae3cd74486e178",
      sourceLabel: "모집 안내문 보기 (파일)",
      attachments: [],
      image: {
        src: "images/china.png", alt: "중국언어문화경진대회 포스터",
        origin: "https://icf.icehs.kr/upload/keditor/icfhs/210705/2026/10/20261029_125615191_48078.png"
      },
      isSample: false
    },
    {
      id: "e03", title: "차세대통신 X 융합 창업 아이디어 경진대회", scope: "external",
      interests: ["IT", "창업"],
      eligibility: {
        text: "전국 대학·전문대 재학생. 휴학생·대학원생 제외. 개인 또는 2~4인 팀", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: false, grad: false, general: false }, departments: null
      },
      schedule: { text: "본선 12/18(금), 코엑스. 시간 확인 필요", slots: null },
      deadline: "2026-11-18", deadlineNote: null,
      sourceUrl: "https://cs.kookmin.ac.kr/news/event/2032?pn=84",
      attachments: [],
      image: {
        src: "images/kookmin.jpg", alt: "차세대통신 X 융합 창업 아이디어 경진대회 포스터",
        origin: "https://wfile.kookmin.ac.kr/files-v2/2026%20%EC%B0%A8%EC%84%B8%EB%8C%80%ED%86%B5%EC%8B%A0%20x%20%EC%9C%B5%ED%95%A9%20%EC%B0%BD%EC%97%85%20%EC%95%84%EC%9D%B4%EB%94%94%EC%96%B4%20%EA%B2%BD%EC%A7%84%EB%8C%80%ED%9A%8C_%ED%8F%AC%EC%8A%A4%ED%84%B0.jpg?id=c46a82df20129c3d7b0f446f3f4fe482&type=image"
      },
      isSample: false
    },
    {
      id: "e04", title: "건학 50주년 동명대학교 캐릭터 공모전", scope: "external",
      interests: ["디자인"],
      eligibility: {
        text: "만 14세 이상 누구나. 개인 또는 최대 4인 팀", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: true, grad: true, general: true }, departments: null
      },
      schedule: { text: "작품 제작 후 이메일 제출. 별도 참여 시간 명시 없음. 결과 발표 12/9 예정", slots: [] },
      deadline: "2026-11-27", deadlineNote: null,
      sourceUrl: "https://mis.tu.ac.kr/tuhome/sub07_01_11.do?articleNo=428766&mode=view",
      attachments: [
        { label: "포스터가 있는 게시글", url: "https://www.tu.ac.kr/interior/sub05_01.do?articleNo=429056&mode=view" }
      ],
      image: {
        src: "images/tongmyong.png", alt: "건학 50주년 동명대학교 캐릭터 디자인 공모전 포스터",
        origin: "https://www.tu.ac.kr/interior/sub05_01.do?articleNo=429056&mode=view"
      },
      isSample: false
    },
    {
      id: "e05", title: "한림대·KERIS 전국 대학생 AI 창업 해커톤", scope: "external",
      interests: ["IT", "창업"],
      eligibility: {
        text: "전국 대학 재학생, 팀당 최대 4명", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: null, grad: null, general: false }, departments: null
      },
      schedule: { text: "온라인 OT 11/16(월) 19:00~20:00. 본 대회 11/19~11/20에는 평일 낮 일정도 포함", slots: ["semester-eve"] },
      deadline: "2026-11-11", deadlineNote: "17:00까지",
      sourceUrl: "https://ces.hallym.ac.kr/bbs/hallym/155/392020/artclView.do",
      attachments: [],
      image: {
        src: "images/hallym.png", alt: "한림대·KERIS 전국 대학생 AI 창업 해커톤 포스터",
        origin: "https://ces.hallym.ac.kr/bbs/hallym/155/236005/download.do"
      },
      isSample: false
    },
    {
      id: "e06", title: "한양대 ERICA 전국 대학생 SW 창업 아이디어톤", scope: "external",
      interests: ["IT", "창업"],
      eligibility: {
        text: "전국 대학생 예비창업팀. 휴학생도 참여 가능하며 상금 지급 대상에서는 제외", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: true, grad: null, general: null }, departments: null
      },
      schedule: { text: "대회 11/2~12/5, 온라인 예선·본선과 오프라인 결선. 단계별 참여 시간 확인 필요", slots: null },
      deadline: "2026-11-01", deadlineNote: null,
      sourceUrl: "https://computer.hanyang.ac.kr/news/notice.php?code=notice&idx=879&page=11&ptype=view",
      attachments: [],
      image: {
        src: "images/hanyang.png", alt: "한양대 ERICA 전국 대학생 SW 창업 아이디어톤 포스터",
        origin: "https://computer.hanyang.ac.kr/admin/data/webedit/20260928093340_00028130.png"
      },
      isSample: false
    },
    {
      id: "e07", title: "KT&G복지재단 동계 해외봉사단 상상위더스", scope: "external",
      interests: ["봉사", "어학·글로벌"],
      eligibility: {
        text: "대한민국 국적의 만 18세 이상 대학생. 해외여행 결격 사유가 없어야 함. 전형별 조건 적용", grades: [1, 2, 3, 4],
        status: { enrolled: true, leave: null, grad: null, general: false }, departments: null
      },
      schedule: { text: "인도네시아 파견 2027년 1/13~1/22 또는 1/16~1/25(방학 중·주말 포함). 국내 공식 일정은 별도 확인", slots: ["vacation", "weekend"] },
      deadline: "2026-10-06", deadlineNote: "10:00까지",
      sourceUrl: "https://m.ktngwelfare.org/enter/volunteerApply/volunteer/807",
      attachments: [],
      image: {
        src: "images/ktng.jpg", alt: "KT&G복지재단 동계 해외봉사단 상상위더스 모집 포스터",
        origin: "https://images.ktngwelfare.org/images/1304/260916_%EC%83%81%EC%83%81%EC%9C%84%EB%8D%94%EC%8A%A4%EB%8F%99%EA%B3%84-%EB%8B%A8%EC%9B%90-%EB%AA%A8%EC%A7%91-%EC%9B%B9%ED%8F%AC%EC%8A%A4%ED%84%B0_%EC%9D%B8%EC%9B%90%EC%88%98%EC%A0%95.jpg"
      },
      isSample: false
    },

    /* ---------- 예시(가상) 공고: 학년·재학 상태·대상 학과 필터 확인용 ---------- */
    {
      id: "s01", title: "컴퓨터학부 캡스톤 프로젝트 팀원 모집", scope: "campus",
      interests: ["IT"],
      eligibility: {
        text: "컴퓨터학부 3~4학년 재학생", grades: [3, 4],
        status: { enrolled: true, leave: false, grad: false, general: false }, departments: ["컴퓨터학부"]
      },
      schedule: { text: "학기 중 매주 화·목 저녁", slots: ["semester-eve"] },
      deadline: "2026-11-25", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    },
    {
      id: "s02", title: "공과대학 산학협력 현장실습", scope: "campus",
      interests: ["IT"],
      eligibility: {
        text: "공과대학 3학년 이상 재학생", grades: [3, 4],
        status: { enrolled: true, leave: false, grad: false, general: false }, departments: ["공과대학"]
      },
      schedule: { text: "방학 중 4주", slots: ["vacation"] },
      deadline: "2026-12-04", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    },
    {
      id: "s03", title: "간호학과 해외 의료봉사 서포터즈", scope: "campus",
      interests: ["봉사", "어학·글로벌"],
      eligibility: {
        text: "간호학과 2학년 이상 재학생", grades: [2, 3, 4],
        status: { enrolled: true, leave: false, grad: false, general: false }, departments: ["간호학과"]
      },
      schedule: { text: "주말 사전교육 후 방학 중 파견", slots: ["weekend", "vacation"] },
      deadline: "2026-12-10", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    },
    {
      id: "s04", title: "신입생 진로 탐색 멘토링", scope: "campus",
      interests: ["창업", "봉사"],
      eligibility: {
        text: "전 학과 1학년 재학생", grades: [1],
        status: { enrolled: true, leave: false, grad: false, general: false }, departments: null
      },
      schedule: { text: "학기 중 평일 저녁 4회", slots: ["semester-eve"] },
      deadline: "2026-11-30", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    },
    {
      id: "s05", title: "생활과학예술체육대학 미디어 콘텐츠 제작 스튜디오", scope: "campus",
      interests: ["디자인"],
      eligibility: {
        text: "생활과학예술체육대학 2학년 이상. 휴학생 참여 가능", grades: [2, 3, 4],
        status: { enrolled: true, leave: true, grad: false, general: false }, departments: ["생활과학예술체육대학"]
      },
      schedule: { text: "주말 제작 워크숍", slots: ["weekend"] },
      deadline: "2026-12-12", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    },
    {
      id: "s06", title: "대학원생 연구 아이디어 창업 경진대회", scope: "external",
      interests: ["창업", "IT"],
      eligibility: {
        text: "대학원생 대상. 학부생은 참가할 수 없음", grades: null,
        status: { enrolled: false, leave: false, grad: true, general: false }, departments: null
      },
      schedule: { text: "주말 이틀 진행", slots: ["weekend"] },
      deadline: "2026-12-18", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    },
    {
      id: "s07", title: "휴학생·청년 인턴십 연계 프로그램", scope: "external",
      interests: ["창업"],
      eligibility: {
        text: "휴학생 및 만 19~34세 일반 청년. 재학생은 참가할 수 없음", grades: null,
        status: { enrolled: false, leave: true, grad: null, general: true }, departments: null
      },
      schedule: { text: "방학 중 6주 인턴십", slots: ["vacation"] },
      deadline: "2026-12-20", deadlineNote: null, sourceUrl: null, attachments: [], image: null, isSample: true
    }
  ];

  var api = {
    REFERENCE_DATE: REFERENCE_DATE,
    INTERESTS: INTERESTS,
    GRADES: GRADES,
    STATUSES: STATUSES,
    SLOTS: SLOTS,
    DEPARTMENTS: DEPARTMENTS,
    departmentScopes: departmentScopes,
    ACTIVITIES: ACTIVITIES
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.AppData = api;
  }
})(this);
