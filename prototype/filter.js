/*
 * 필터 로직. DOM과 분리한 순수 함수라 Node에서 그대로 검증할 수 있다.
 *
 * 규칙
 * - 서로 다른 조건 사이는 AND, 같은 조건 안의 복수 선택은 OR.
 * - 선택하지 않은 조건은 거르지 않는다.
 * - 필터용 값이 null(확인 필요)인 공고는 숨기지 않고 통과시킨다.
 * - 재학 상태는 선택한 상태 중 하나라도 지원 가능(true) 또는 확인 필요(null)이면 통과한다.
 * - 대상 학과는 전 학과·학과 무관 공고를 항상 통과시키고, 학과가 한정된 공고만 내 소속과 대조한다.
 * - 일정은 공고가 요구하는 슬롯이 모두 내가 선택한 슬롯에 포함될 때 통과한다.
 */
(function (root) {
  function filterActivities(list, conditions) {
    var c = conditions || {};
    var interests = c.interests || [];
    var grades = c.grades || [];
    var slots = c.slots || [];
    var statuses = c.statuses || [];
    var scopes = c.departmentScopes || [];

    return list.filter(function (a) {
      // 재학 상태: 선택한 상태 중 하나라도 "제외(false)"가 아니면 통과. 불명확(null)은 통과.
      if (statuses.length && a.eligibility.status &&
          !statuses.some(function (s) { return a.eligibility.status[s] !== false; })) {
        return false;
      }
      // 대상 학과: 전 학과·학과 무관(null 또는 빈 목록)인 공고는 항상 통과.
      // 학과가 한정된 공고는 내 학과나 소속 단과대학이 대상에 들어 있을 때만 통과.
      var depts = a.eligibility.departments;
      if (scopes.length && depts && depts.length &&
          !depts.some(function (d) { return scopes.indexOf(d) > -1; })) {
        return false;
      }
      if (interests.length &&
          !a.interests.some(function (i) { return interests.indexOf(i) > -1; })) {
        return false;
      }
      if (grades.length && a.eligibility.grades &&
          !a.eligibility.grades.some(function (g) { return grades.indexOf(g) > -1; })) {
        return false;
      }
      if (slots.length && a.schedule.slots &&
          !a.schedule.slots.every(function (s) { return slots.indexOf(s) > -1; })) {
        return false;
      }
      return true;
    });
  }

  // "YYYY-MM-DD" 두 날짜의 일 수 차이(마감일 - 기준일). 마감일이 없으면 null.
  function daysUntil(deadline, referenceDate) {
    if (!deadline) return null;
    function toUtc(s) {
      var p = s.split("-");
      return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    return Math.round((toUtc(deadline) - toUtc(referenceDate)) / 86400000);
  }

  // 목록을 페이지로 나눈다. page가 범위를 벗어나면 가까운 유효한 페이지로 맞춘다.
  // 돌려주는 값: { items, page, totalPages, total, start, end } (start·end는 1부터 센 번호, 비면 0)
  function paginate(list, page, size) {
    var total = list.length;
    var perPage = size > 0 ? size : 10;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    var p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
    var from = (p - 1) * perPage;
    var items = list.slice(from, from + perPage);
    return {
      items: items, page: p, totalPages: totalPages, total: total,
      start: items.length ? from + 1 : 0, end: items.length ? from + items.length : 0
    };
  }

  var api = { filterActivities: filterActivities, daysUntil: daysUntil, paginate: paginate };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Filter = api;
  }
})(this);
