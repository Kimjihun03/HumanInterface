const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../data.js");
const F = require("../filter.js");

const ids = (list) => list.map((a) => a.id).sort();
const ALL = D.ACTIVITIES;                          // 실제 공고 12건 + 예시 공고 7건
const REAL = ALL.filter((a) => !a.isSample);       // 실제 공고 12건
const runAll = (c) => ids(F.filterActivities(ALL, c));
const run = (c) => ids(F.filterActivities(REAL, c)); // 실제 공고만 대상으로 한 결과
const byId = (id) => ALL.find((a) => a.id === id);
const REAL_IDS = ids(REAL);
const scopes = D.departmentScopes;

// 필터 규칙 자체를 검증하기 위한 가상 목록
const SYN = [
  { id: "s1", interests: ["IT"], eligibility: { grades: [2, 3] }, schedule: { slots: ["weekend"] } },
  { id: "s2", interests: ["IT", "창업"], eligibility: { grades: [3, 4] }, schedule: { slots: ["vacation", "weekend"] } },
  { id: "s3", interests: ["봉사"], eligibility: { grades: [1, 2, 3, 4] }, schedule: { slots: ["semester-eve"] } },
  { id: "s4", interests: ["봉사"], eligibility: { grades: null }, schedule: { slots: null } }
];
const syn = (c) => ids(F.filterActivities(SYN, c));

/* ---------- 구성 ---------- */
test("공고는 19건: 실제 12건(교내 5, 교외 7) + 예시 7건", () => {
  assert.equal(ALL.length, 19);
  assert.equal(REAL.length, 12);
  assert.equal(ALL.filter((a) => a.isSample).length, 7);
  assert.equal(REAL.filter((a) => a.scope === "campus").length, 5);
  assert.equal(REAL.filter((a) => a.scope === "external").length, 7);
  assert.equal(ALL.filter((a) => a.scope === "campus").length, 10);
  assert.equal(ALL.filter((a) => a.scope === "external").length, 9);
});

test("조건이 없으면 전체를 반환한다", () => {
  assert.equal(runAll({}).length, 19);
  assert.equal(runAll({ interests: [], grades: [], slots: [], statuses: [], departmentScopes: [] }).length, 19);
  assert.equal(run({}).length, 12);
});

/* ---------- 관심 분야·일정 (실제 공고 기준) ---------- */
test("관심 분야 단독: 선택한 분야와 겹치는 공고만 남는다", () => {
  assert.deepEqual(run({ interests: ["IT"] }), ["e01", "e03", "e05", "e06"]);
  assert.deepEqual(run({ interests: ["디자인"] }), ["e04", "r02"]);
});

test("관심 분야 복수 선택은 OR로 합쳐진다", () => {
  assert.deepEqual(run({ interests: ["디자인", "어학·글로벌"] }), ["e02", "e04", "e07", "r01", "r02", "r03"]);
});

test("참여 일정 단독: 요구 슬롯이 모두 포함된 공고와 일정 미확인 공고가 남는다", () => {
  assert.deepEqual(run({ slots: ["weekend"] }), ["e01", "e02", "e03", "e04", "e06", "r01", "r02", "r04", "r05"]);
  assert.deepEqual(run({ slots: ["vacation"] }), ["e01", "e03", "e04", "e06", "r01", "r02", "r04", "r05"]);
  assert.deepEqual(run({ slots: ["semester-eve"] }), ["e01", "e03", "e04", "e05", "e06", "r01", "r02", "r04", "r05"]);
  assert.equal(run({ slots: ["weekend", "vacation"] }).length, 11);
});

test("참여 시간 요구가 없는 공고(slots: [])는 어떤 일정 선택에도 통과한다", () => {
  assert.deepEqual(byId("e04").schedule.slots, []);
  ["semester-eve", "weekend", "vacation"].forEach((s) => assert.ok(run({ slots: [s] }).includes("e04"), s));
});

test("서로 다른 조건은 AND로 결합된다", () => {
  assert.deepEqual(run({ interests: ["IT"], slots: ["weekend"] }), ["e01", "e03", "e06"]);
  assert.deepEqual(run({ interests: ["봉사"], slots: ["semester-eve"] }), ["r05"]);
});

test("필터용 값이 null인 공고는 숨기지 않는다 (확인 필요)", () => {
  assert.equal(byId("r01").eligibility.grades, null);
  assert.equal(byId("r01").schedule.slots, null);
  assert.ok(run({ grades: [4] }).includes("r01"));
  assert.ok(run({ slots: ["semester-eve"] }).includes("r05"));
});

/* ---------- 학년 ---------- */
test("규칙 검증(가상 목록): 학년은 허용 학년과 겹치는 공고만 남기고 미확인은 통과한다", () => {
  assert.deepEqual(syn({ grades: [1] }), ["s3", "s4"]);
  assert.deepEqual(syn({ grades: [2] }), ["s1", "s3", "s4"]);
  assert.deepEqual(syn({ grades: [1, 4] }), ["s2", "s3", "s4"]);
});

test("실제 공고 12건만으로는 학년 조건이 결과를 바꾸지 못한다", () => {
  [1, 2, 3, 4].forEach((g) => assert.equal(run({ grades: [g] }).length, 12));
});

test("예시 공고를 포함하면 학년 조건이 결과를 바꾼다", () => {
  assert.deepEqual(runAll({ grades: [1] }), [...REAL_IDS, "s04", "s06", "s07"].sort());
  assert.deepEqual(runAll({ grades: [2] }), [...REAL_IDS, "s03", "s05", "s06", "s07"].sort());
  assert.deepEqual(runAll({ grades: [3] }), [...REAL_IDS, "s01", "s02", "s03", "s05", "s06", "s07"].sort());
  assert.deepEqual(runAll({ grades: [1, 3] }).length, 12 + 7);   // 1학년 또는 3학년 → 예시 7건 모두 해당
});

/* ---------- 재학 상태 ---------- */
test("재학 상태 단독(실제 공고): 제외(false)인 공고만 빠지고 가능·확인 필요는 남는다", () => {
  assert.equal(run({ statuses: ["enrolled"] }).length, 12);
  assert.deepEqual(run({ statuses: ["leave"] }), REAL_IDS.filter((i) => i !== "e03"));
  assert.deepEqual(run({ statuses: ["grad"] }), run({ statuses: ["leave"] }));
  assert.deepEqual(run({ statuses: ["general"] }), ["e01", "e02", "e04", "e06", "r01", "r02"]);
});

test("재학 상태 단독(예시 포함): 재학생 전용·휴학생·대학원생·일반 대상 공고가 구분된다", () => {
  assert.deepEqual(runAll({ statuses: ["enrolled"] }), ids(ALL).filter((i) => i !== "s06" && i !== "s07"));
  assert.deepEqual(runAll({ statuses: ["leave"] }), [...REAL_IDS.filter((i) => i !== "e03"), "s05", "s07"].sort());
  assert.deepEqual(runAll({ statuses: ["grad"] }), [...REAL_IDS.filter((i) => i !== "e03"), "s06", "s07"].sort());
  assert.deepEqual(runAll({ statuses: ["general"] }), ["e01", "e02", "e04", "e06", "r01", "r02", "s07"]);
});

test("재학 상태 복수 선택은 OR이다 (하나라도 해당하면 포함)", () => {
  assert.equal(run({ statuses: ["leave", "general"] }).length, 11);
  assert.equal(run({ statuses: ["enrolled", "general"] }).length, 12);
  assert.ok(runAll({ statuses: ["enrolled", "grad"] }).includes("s06"));
  assert.ok(runAll({ statuses: ["enrolled", "grad"] }).includes("s01"));
});

test("재학 상태는 다른 조건과 AND로 결합되고, 결과 0건 조합을 만든다", () => {
  assert.deepEqual(run({ interests: ["창업"], statuses: ["leave"] }), ["e05", "e06", "r04"]);
  const zero = { interests: ["봉사"], statuses: ["general"] };
  assert.deepEqual(runAll(zero), []);                                         // 봉사 공고는 모두 재학생·대학생 한정
  assert.deepEqual(runAll({ ...zero, statuses: [] }), ["e07", "r03", "r05", "s03", "s04"]);
  assert.equal(runAll({}).length, 19);                                        // 초기화하면 전체
});

/* ---------- 대상 학과 ---------- */
test("대상 학과(실제 공고): 모두 학과 무관이라 어떤 학과를 골라도 12건이 남는다", () => {
  ["컴퓨터학부", "간호학과", "약학과", "자연과학대학 (학과 미확인)"].forEach((n) =>
    assert.equal(run({ departmentScopes: scopes(n) }).length, 12, n));
  REAL.forEach((a) => assert.equal(a.eligibility.departments, null, a.id));
});

test("대상 학과(예시 포함): 학과 한정 공고는 내 학과·소속 단과대학일 때만 보이고 무관 공고는 항상 보인다", () => {
  const dept = (n) => runAll({ departmentScopes: scopes(n) });
  const all19 = ids(ALL);
  assert.deepEqual(dept("컴퓨터학부"), all19.filter((i) => i !== "s03" && i !== "s05"));   // s01(학부)·s02(공과대학) 보임
  assert.deepEqual(dept("전기공학과"), all19.filter((i) => i !== "s01" && i !== "s03" && i !== "s05")); // s02(공과대학)만 보임
  assert.deepEqual(dept("간호학과"), all19.filter((i) => !["s01", "s02", "s05"].includes(i)));
  assert.deepEqual(dept("아트앤디자인학부"), all19.filter((i) => !["s01", "s02", "s03"].includes(i))); // s05(생활과학예술체육대학)
  assert.deepEqual(dept("국어국문·문예창작학부"), [...REAL_IDS, "s04", "s06", "s07"].sort());      // 한정 공고 4건은 빠짐
  assert.deepEqual(runAll({}), all19);                                                         // 학과 미선택이면 거르지 않음
});

test("대상 학과(가상 목록): null·[]·한정 공고 처리", () => {
  const list = [
    { id: "d1", eligibility: { departments: null } },
    { id: "d2", eligibility: { departments: [] } },
    { id: "d3", eligibility: { departments: ["컴퓨터학부"] } },
    { id: "d4", eligibility: { departments: ["공과대학"] } },
    { id: "d5", eligibility: { departments: ["간호학과", "약학과"] } }
  ];
  const f = (name) => ids(F.filterActivities(list.map((a) => ({ interests: [], schedule: {}, ...a })), { departmentScopes: scopes(name) }));
  assert.deepEqual(f(null), ["d1", "d2", "d3", "d4", "d5"]);
  assert.deepEqual(f("컴퓨터학부"), ["d1", "d2", "d3", "d4"]);
  assert.deepEqual(f("전기공학과"), ["d1", "d2", "d4"]);
  assert.deepEqual(f("간호학과"), ["d1", "d2", "d5"]);
  assert.deepEqual(f("국어국문·문예창작학부"), ["d1", "d2"]);
});

test("departmentScopes: 학과를 고르면 학과와 소속 단과대학을 돌려준다", () => {
  assert.deepEqual(scopes("컴퓨터학부"), ["컴퓨터학부", "공과대학"]);
  assert.deepEqual(scopes(null), []);
  assert.deepEqual(scopes(""), []);
});

test("필터 조합(예시 포함): 컴퓨터학부 3학년 재학생이 IT·평일 저녁으로 찾으면 s01이 함께 나온다", () => {
  const c = { interests: ["IT"], grades: [3], statuses: ["enrolled"], slots: ["semester-eve"], departmentScopes: scopes("컴퓨터학부") };
  assert.deepEqual(runAll(c), ["e01", "e03", "e05", "e06", "s01"]);
  // 1학년이면 s01(3~4학년)은 빠진다
  assert.ok(!runAll({ ...c, grades: [1] }).includes("s01"));
  // 간호학과 학생이면 s01은 보이지 않는다
  assert.ok(!runAll({ ...c, departmentScopes: scopes("간호학과") }).includes("s01"));
});

/* ---------- 페이지 나누기 ---------- */
test("paginate: 10·20·50개씩 나누면 19건은 2페이지·1페이지·1페이지다", () => {
  const items = ids(ALL);
  const p10 = F.paginate(items, 1, 10);
  assert.equal(p10.totalPages, 2);
  assert.equal(p10.items.length, 10);
  assert.deepEqual([p10.start, p10.end, p10.total], [1, 10, 19]);
  const p10b = F.paginate(items, 2, 10);
  assert.equal(p10b.items.length, 9);
  assert.deepEqual([p10b.start, p10b.end], [11, 19]);
  assert.deepEqual([...p10.items, ...p10b.items], items);                  // 빠지거나 겹치는 공고 없음
  [20, 50].forEach((n) => {
    const p = F.paginate(items, 1, n);
    assert.equal(p.totalPages, 1, n + "개씩");
    assert.deepEqual(p.items, items);
  });
});

test("paginate: 선택한 개수와 공고 수가 같거나 하나 많을 때 경계", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => i + 1);
  assert.equal(F.paginate(mk(10), 1, 10).totalPages, 1);
  assert.equal(F.paginate(mk(11), 1, 10).totalPages, 2);
  assert.deepEqual(F.paginate(mk(11), 2, 10).items, [11]);
  assert.equal(F.paginate(mk(50), 1, 50).totalPages, 1);
  assert.equal(F.paginate(mk(51), 1, 50).totalPages, 2);
  assert.equal(F.paginate(mk(120), 3, 50).items.length, 20);
});

test("paginate: 범위를 벗어난 페이지는 가까운 유효한 페이지로 맞추고, 빈 목록은 1페이지다", () => {
  const items = ids(ALL);
  assert.equal(F.paginate(items, 99, 10).page, 2);
  assert.equal(F.paginate(items, 0, 10).page, 1);
  assert.equal(F.paginate(items, -3, 10).page, 1);
  assert.equal(F.paginate(items, NaN, 10).page, 1);
  const empty = F.paginate([], 1, 10);
  assert.deepEqual([empty.page, empty.totalPages, empty.total, empty.start, empty.end, empty.items.length], [1, 1, 0, 0, 0, 0]);
});

test("필터 결과도 페이지로 나뉜다: 학년 3학년 18건은 10개씩 2페이지(10 + 8)", () => {
  const filtered = F.filterActivities(ALL, { grades: [3] });
  assert.equal(filtered.length, 18);
  const pages = [F.paginate(filtered, 1, 10), F.paginate(filtered, 2, 10)];
  assert.deepEqual(pages.map((p) => p.items.length), [10, 8]);
  assert.equal(pages[0].totalPages, 2);
});

/* ---------- 데이터 형식 ---------- */
test("자격 데이터 형식: 재학 상태 4종은 true·false·null이고 학과는 null 또는 알려진 이름이다", () => {
  const known = new Set();
  D.DEPARTMENTS.forEach((c) => { known.add(c.college); c.items.forEach((i) => known.add(i)); });
  ALL.forEach((a) => {
    D.STATUSES.forEach((s) => assert.ok([true, false, null].includes(a.eligibility.status[s.value]), a.id + ":" + s.value));
    const d = a.eligibility.departments;
    assert.ok(d === null || (Array.isArray(d) && d.length > 0 && d.every((x) => known.has(x))), a.id + " 학과");
  });
});

test("데이터 형식: 필수 필드가 있고 활동 일정과 신청 마감일이 별도 필드다", () => {
  const seen = new Set();
  ALL.forEach((a) => {
    seen.add(a.id);
    assert.ok(a.title && ["campus", "external"].includes(a.scope), a.id);
    assert.ok(Array.isArray(a.interests) && a.interests.length > 0, a.id);
    a.interests.forEach((i) => assert.ok(D.INTERESTS.includes(i), a.id + ":" + i));
    assert.ok("text" in a.eligibility && "grades" in a.eligibility, a.id);
    assert.ok("text" in a.schedule && "slots" in a.schedule, a.id);
    assert.ok(a.deadline === null || /^\d{4}-\d{2}-\d{2}$/.test(a.deadline), a.id);
    assert.ok(a.sourceUrl === null || a.sourceUrl.startsWith("http"), a.id);
    assert.equal(typeof a.isSample, "boolean", a.id);
    assert.notEqual(a.schedule.text, a.deadline, a.id);
  });
  assert.equal(seen.size, 19, "id 중복 없음");
});

test("실제 공고는 모두 원문 링크, 신청 마감일, 포스터 이미지를 가진다", () => {
  REAL.forEach((a) => {
    assert.ok(a.sourceUrl && a.sourceUrl.startsWith("https://"), a.id + " 원문");
    assert.ok(a.deadline, a.id + " 마감일");
    assert.ok(a.image && a.image.src && a.image.alt && a.image.origin, a.id + " 이미지");
    assert.ok(a.eligibility.text && a.schedule.text, a.id + " 자격·일정 문구");
  });
});

test("실제 공고 포스터는 모두 로컬 파일이고 실제로 존재하며 공고마다 다르다", () => {
  REAL.forEach((a) => {
    assert.ok(!/^https?:/.test(a.image.src), a.id + " 원격 이미지");
    const p = path.join(__dirname, "..", a.image.src);
    assert.ok(fs.existsSync(p) && fs.statSync(p).size > 10000, a.id + " " + a.image.src);
  });
  assert.equal(new Set(REAL.map((a) => a.image.src)).size, 12);
});

test("예시 공고는 원문 링크와 이미지가 없고 신청 마감이 기준일 이후다", () => {
  ALL.filter((a) => a.isSample).forEach((a) => {
    assert.equal(a.sourceUrl, null, a.id);
    assert.ok(!a.image, a.id);
    assert.ok(F.daysUntil(a.deadline, D.REFERENCE_DATE) >= 0, a.id);
  });
});

test("확인 필요 사례가 각각 있다", () => {
  assert.ok(ALL.some((a) => a.eligibility.grades === null), "학년 확인 필요");
  assert.ok(ALL.some((a) => a.schedule.slots === null), "일정 확인 필요");
  assert.ok(ALL.some((a) => Object.values(a.eligibility.status).includes(null)), "재학 상태 확인 필요");
});

test("daysUntil: 기준일과의 일 수 차이를 계산한다", () => {
  assert.equal(F.daysUntil("2026-12-05", "2026-11-12"), 23);
  assert.equal(F.daysUntil("2026-11-12", "2026-11-12"), 0);
  assert.equal(F.daysUntil("2026-11-10", "2026-11-12"), -2);
  assert.equal(F.daysUntil(null, "2026-11-12"), null);
});

test("신청 마감일 분포(실제 공고): 기준일 이후 4건, 이전 8건", () => {
  const days = REAL.map((a) => F.daysUntil(a.deadline, D.REFERENCE_DATE));
  assert.equal(days.filter((d) => d >= 0).length, 4);
  assert.equal(days.filter((d) => d < 0).length, 8);
});
