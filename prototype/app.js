/* 화면 렌더링과 이벤트 처리. 필터 규칙은 filter.js에 있다. */
(function () {
  var D = window.AppData;
  var F = window.Filter;

  var GROUPS = [
    {
      key: "interests", title: "관심 분야",
      options: D.INTERESTS.map(function (v) { return { value: v, label: v }; })
    },
    { key: "grades", title: "지원 자격 (학년)", options: D.GRADES },
    { key: "statuses", title: "지원 자격 (재학 상태)", options: D.STATUSES },
    { key: "slots", title: "참여 가능 일정", options: D.SLOTS }
  ];

  // department는 체크박스 여러 개가 아니라 "내 학과" 하나를 고르는 선택 상자다.
  // page·pageSize: 목록을 한 번에 pageSize개씩 보여 주고 page번째 페이지를 표시한다.
  var PAGE_SIZES = [10, 20, 50];
  var state = {
    interests: [], grades: [], statuses: [], slots: [], department: null, selectedId: null,
    page: 1, pageSize: PAGE_SIZES[0]
  };
  var lastConditionKey = "";    // 조건이 바뀌면 1페이지로 돌아가기 위해 이전 조건을 기억한다
  var pendingFocusPage = null;  // 페이지를 옮긴 뒤 키보드 포커스를 현재 페이지 버튼에 돌려놓는다

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  function labelOf(key, value) {
    if (key === "department") return "학과: " + value;
    var group = GROUPS.filter(function (g) { return g.key === key; })[0];
    var opt = group.options.filter(function (o) { return o.value === value; })[0];
    return opt ? opt.label : String(value);
  }

  function selectedCount() {
    return state.interests.length + state.grades.length + state.statuses.length +
      state.slots.length + (state.department ? 1 : 0);
  }

  function hasAnyCondition() {
    return selectedCount() > 0;
  }

  // 필터에 넘길 조건. skip을 주면 그 조건 하나를 뺀 상태로 만든다.
  function conditions(skip) {
    var c = {
      interests: state.interests, grades: state.grades, statuses: state.statuses, slots: state.slots,
      departmentScopes: D.departmentScopes(state.department)
    };
    if (skip) {
      if (skip.key === "department") c.departmentScopes = [];
      else c[skip.key] = state[skip.key].filter(function (x) { return x !== skip.value; });
    }
    return c;
  }

  function currentResults() {
    return F.filterActivities(D.ACTIVITIES, conditions());
  }

  // 선택된 조건을 하나씩 뺐을 때 결과가 1건 이상 생기는 경우를 모은다.
  function relaxSuggestions() {
    var out = [];
    function test(key, value) {
      var n = F.filterActivities(D.ACTIVITIES, conditions({ key: key, value: value })).length;
      if (n > 0) out.push({ key: key, value: value, count: n });
    }
    GROUPS.forEach(function (g) { state[g.key].forEach(function (v) { test(g.key, v); }); });
    if (state.department) test("department", state.department);
    return out;
  }

  function formatDeadline(deadline, note) {
    if (!deadline) return null;
    var p = deadline.split("-");
    var days = F.daysUntil(deadline, D.REFERENCE_DATE);
    var tag = days < 0 ? "마감" : days === 0 ? "D-day" : "D-" + days;
    return Number(p[0]) + "년 " + Number(p[1]) + "월 " + Number(p[2]) + "일 (" + tag + ")" +
      (note ? " · " + note : "");
  }

  function formatDeadlineShort(deadline) {
    if (!deadline) return null;
    var p = deadline.split("-");
    var days = F.daysUntil(deadline, D.REFERENCE_DATE);
    var tag = days < 0 ? "마감" : days === 0 ? "D-day" : "D-" + days;
    return Number(p[1]) + "/" + Number(p[2]) + " (" + tag + ")";
  }

  function unclearBadge() {
    return h("span", { class: "badge badge-unclear", text: "확인 필요" });
  }

  /* ---------- 조건 패널 ---------- */
  // 대상 학과: 내 학과를 하나 고른다. 전 학과·학과 무관 공고는 어떤 학과를 골라도 계속 보인다.
  function buildDepartmentGroup() {
    var select = h("select", { id: "department-select", class: "select", "aria-describedby": "department-help" },
      [h("option", { value: "", text: "선택 안 함" })]);
    D.DEPARTMENTS.forEach(function (c) {
      var og = h("optgroup", { label: c.college });
      c.items.forEach(function (name) { og.appendChild(h("option", { value: name, text: name })); });
      select.appendChild(og);
    });
    select.addEventListener("change", function () {
      state.department = select.value || null;
      render();
    });
    return h("fieldset", { class: "group" }, [
      h("legend", { text: "대상 학과 (내 학과)" }),
      select,
      h("p", { id: "department-help", class: "help", text: "전 학과·학과 무관 공고는 항상 표시됩니다." })
    ]);
  }

  function buildFilters() {
    var root = document.getElementById("filter-groups");
    GROUPS.forEach(function (g) {
      if (g.key === "slots") root.appendChild(buildDepartmentGroup());
      var fs = h("fieldset", { class: "group" }, [h("legend", { text: g.title })]);
      g.options.forEach(function (o) {
        var input = h("input", { type: "checkbox", "data-key": g.key, value: String(o.value) });
        input.addEventListener("change", onFilterChange);
        fs.appendChild(h("label", { class: "check" }, [input, h("span", { text: o.label })]));
      });
      root.appendChild(fs);
    });
  }

  function onFilterChange(e) {
    var key = e.target.getAttribute("data-key");
    var value = key === "grades" ? Number(e.target.value) : e.target.value;
    var list = state[key];
    var idx = list.indexOf(value);
    if (e.target.checked && idx === -1) list.push(value);
    if (!e.target.checked && idx > -1) list.splice(idx, 1);
    render();
  }

  function removeCondition(key, value) {
    if (key === "department") state.department = null;
    else state[key] = state[key].filter(function (v) { return v !== value; });
    render();
  }

  function resetAll() {
    state.interests = [];
    state.grades = [];
    state.statuses = [];
    state.slots = [];
    state.department = null;
    render();
  }

  function syncCheckboxes() {
    document.getElementById("department-select").value = state.department || "";
    var boxes = document.querySelectorAll("#filter-groups input[type=checkbox]");
    Array.prototype.forEach.call(boxes, function (box) {
      var key = box.getAttribute("data-key");
      var value = key === "grades" ? Number(box.value) : box.value;
      box.checked = state[key].indexOf(value) > -1;
    });
  }

  /* ---------- 결과 영역 ---------- */
  function renderChips() {
    var root = document.getElementById("chips");
    root.textContent = "";
    GROUPS.forEach(function (g) {
      state[g.key].forEach(function (v) {
        var btn = h("button", {
          type: "button", class: "chip",
          "aria-label": labelOf(g.key, v) + " 조건 해제"
        }, [h("span", { text: labelOf(g.key, v) }), h("span", { class: "chip-x", "aria-hidden": "true", text: "✕" })]);
        btn.addEventListener("click", function () { removeCondition(g.key, v); });
        root.appendChild(btn);
      });
    });
    if (state.department) {
      var dept = h("button", {
        type: "button", class: "chip",
        "aria-label": labelOf("department", state.department) + " 조건 해제"
      }, [h("span", { text: labelOf("department", state.department) }), h("span", { class: "chip-x", "aria-hidden": "true", text: "✕" })]);
      dept.addEventListener("click", function () { removeCondition("department"); });
      root.appendChild(dept);
    }
  }

  // 페이지 이동 버튼: 이전 · 페이지 번호(또는 현재/전체) · 다음
  function renderPager(totalPages) {
    var nav = document.getElementById("pager");
    nav.textContent = "";
    if (totalPages <= 1) return;

    function pageButton(label, page, extra) {
      var b = h("button", { type: "button", class: "page-btn" + (extra ? " " + extra : ""), "data-page": String(page), text: label });
      b.addEventListener("click", function () { goToPage(page); });
      return b;
    }
    var prev = pageButton("‹ 이전", state.page - 1, "page-prev");
    var next = pageButton("다음 ›", state.page + 1, "page-next");
    if (state.page <= 1) prev.disabled = true;
    if (state.page >= totalPages) next.disabled = true;

    // 번호는 처음·끝·현재 앞뒤만 보여 주고 사이는 …로 줄인다.
    var nums = h("span", { class: "pager-nums" });
    var last = 0;
    for (var i = 1; i <= totalPages; i++) {
      if (i !== 1 && i !== totalPages && Math.abs(i - state.page) > 1) continue;
      if (last && i - last > 1) nums.appendChild(h("span", { class: "page-gap", "aria-hidden": "true", text: "…" }));
      var b = pageButton(String(i), i, i === state.page ? "current" : "");
      b.setAttribute("aria-label", i + "페이지" + (i === state.page ? " (현재)" : ""));
      if (i === state.page) b.setAttribute("aria-current", "page");
      nums.appendChild(b);
      last = i;
    }
    // 좁은 화면에서는 번호 대신 "2 / 5 페이지"만 보여 준다.
    var status = h("span", { class: "pager-status", text: state.page + " / " + totalPages + " 페이지" });

    [prev, nums, status, next].forEach(function (el) { nav.appendChild(el); });
  }

  function goToPage(page) {
    state.page = page;
    pendingFocusPage = page;
    render();
    // 새 페이지의 첫 공고가 보이도록 목록 위로 이동한다(고정 바에 가리지 않게 scroll-margin-top 사용).
    document.querySelector(".results").scrollIntoView({ block: "start" });
  }

  function renderList(results, pageItems) {
    var root = document.getElementById("list");
    root.textContent = "";

    if (results.length === 0) {
      var reset = h("button", { type: "button", class: "btn", text: "모두 초기화" });
      reset.addEventListener("click", resetAll);

      // 조건을 하나만 해제했을 때 결과가 생기는 경우를 바로 눌러 볼 수 있게 안내한다.
      var tips = relaxSuggestions().map(function (s) {
        var b = h("button", {
          type: "button", class: "btn btn-tip",
          text: "‘" + labelOf(s.key, s.value) + "’ 해제 → " + s.count + "건"
        });
        b.addEventListener("click", function () { removeCondition(s.key, s.value); });
        return b;
      });
      var tipBox = tips.length
        ? h("div", { class: "tips" }, [h("p", { class: "tips-title", text: "이 조건을 해제하면 결과가 나옵니다." })].concat(tips))
        : null;

      root.appendChild(h("div", { class: "empty", role: "status" }, [
        h("p", { class: "empty-title", text: "조건에 맞는 공고가 없습니다." }),
        h("p", { text: "위 조건을 하나씩 해제하거나 모두 초기화해 다시 찾아보세요." }),
        tipBox,
        reset
      ]));
      return;
    }

    pageItems.forEach(function (a) {
      var selected = a.id === state.selectedId;
      var short = formatDeadlineShort(a.deadline);
      var deadlineLine = h("p", { class: "card-deadline" }, [
        h("span", { text: "신청 마감 " }),
        short ? h("strong", { text: short }) : unclearBadge()
      ]);
      var card = h("button", {
        type: "button",
        "data-id": a.id,
        class: "card" + (selected ? " selected" : ""),
        "aria-pressed": selected ? "true" : "false"
      }, [
        h("span", { class: "card-top" }, [
          h("span", {
            class: "badge " + (a.scope === "campus" ? "badge-campus" : "badge-external"),
            text: a.scope === "campus" ? "교내" : "교외"
          }),
          a.isSample ? h("span", { class: "badge badge-sample", text: "예시" }) : null,
          h("span", { class: "card-interests", text: a.interests.join(" · ") })
        ]),
        h("span", { class: "card-title", text: a.title }),
        deadlineLine
      ]);
      card.addEventListener("click", function () {
        state.selectedId = a.id;
        render();
      });
      root.appendChild(card);
    });
  }

  /* ---------- 상세 패널 ---------- */
  function infoBlock(title, text, note) {
    var body = text ? h("p", { text: text }) : h("p", {}, [unclearBadge()]);
    var kids = [h("h3", { text: title }), body];
    if (note) kids.push(h("p", { class: "note", text: note }));
    return h("div", { class: "info" }, kids);
  }

  // 지원 자격: 원문 요약 문구와 함께 재학 상태별 지원 가능 여부, 대상 학과를 보여 준다.
  function eligibilityBlock(e) {
    var kids = [h("h3", { text: "지원 자격" }), e.text ? h("p", { text: e.text }) : h("p", {}, [unclearBadge()])];
    if (e.status) {
      var parts = D.STATUSES.map(function (s) {
        var v = e.status[s.value];
        return s.label + " " + (v === true ? "가능" : v === false ? "제외" : "확인 필요");
      });
      kids.push(h("p", { class: "meta", text: "재학 상태: " + parts.join(" · ") }));
    }
    kids.push(h("p", {
      class: "meta",
      text: "대상 학과: " + (e.departments && e.departments.length ? e.departments.join(", ") : "전 학과·학과 무관")
    }));
    return h("div", { class: "info" }, kids);
  }

  // 포스터 이미지. 누르면 원본 크기로 열리고, 불러오지 못하면 안내 문구와 출처 링크를 보여 준다.
  function posterBlock(image) {
    var wrap = h("div", { class: "poster-wrap" });
    var img = h("img", { class: "poster", src: image.src, alt: image.alt });
    // 파일 하나로 합친 버전(standalone.html)은 이미지가 data: 주소라 새 탭으로 열 수 없다(브라우저가 막음).
    var embedded = /^data:/.test(image.src);
    var link = embedded ? img
      : h("a", { href: image.src, target: "_blank", rel: "noopener noreferrer", "aria-label": image.alt + " 크게 보기" }, [img]);
    img.addEventListener("error", function () {
      wrap.textContent = "";
      wrap.appendChild(h("p", { class: "note", text: "포스터 이미지를 불러오지 못했습니다." }));
      if (image.origin) {
        wrap.appendChild(h("a", { class: "source-link", href: image.origin, target: "_blank", rel: "noopener noreferrer", text: "이미지 출처 열기" }));
      }
    });
    wrap.appendChild(link);
    wrap.appendChild(h("p", { class: "note", text: embedded ? "포스터 이미지(축소본)" : "포스터 이미지 · 누르면 크게 볼 수 있습니다" }));
    if (embedded && image.origin) {
      wrap.appendChild(h("a", { class: "source-link", href: image.origin, target: "_blank", rel: "noopener noreferrer", text: "원본 이미지 보기" }));
    }
    return wrap;
  }

  function renderDetail(results) {
    var root = document.getElementById("detail");
    root.textContent = "";
    var a = results.filter(function (x) { return x.id === state.selectedId; })[0];

    if (!a) {
      root.appendChild(h("p", { class: "placeholder", text: "목록에서 공고를 선택하면 지원 자격, 활동 일정, 신청 마감일을 확인할 수 있습니다." }));
      return;
    }

    root.appendChild(h("div", { class: "detail-head" }, [
      h("span", {
        class: "badge " + (a.scope === "campus" ? "badge-campus" : "badge-external"),
        text: a.scope === "campus" ? "교내" : "교외"
      }),
      a.isSample ? h("span", { class: "badge badge-sample", text: "예시" }) : null,
      h("h3", { class: "detail-title", text: a.title })
    ]));
    root.appendChild(h("p", {
      class: "sample-warning",
      text: a.isSample
        ? "예시 데이터입니다. 실제 공고가 아닙니다."
        : "공고 원문을 요약한 정보입니다. 지원 전에 원문에서 다시 확인하세요."
    }));
    root.appendChild(eligibilityBlock(a.eligibility));
    root.appendChild(infoBlock("활동 일정", a.schedule.text, "참여할 수 있는지 판단하는 정보"));
    root.appendChild(infoBlock("신청 마감일", formatDeadline(a.deadline, a.deadlineNote), "지원 기한을 확인하는 정보"));
    if (a.sourceUrl) {
      root.appendChild(h("a", {
        class: "source-link", href: a.sourceUrl, target: "_blank", rel: "noopener noreferrer",
        text: a.sourceLabel || (a.isSample ? "원문 보기 (샘플 링크)" : "원문 보기")
      }));
    } else {
      root.appendChild(h("p", { class: "note", text: "원문 링크 없음" }));
    }
    (a.attachments || []).forEach(function (l) {
      root.appendChild(h("a", {
        class: "source-link", href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.label
      }));
    });
    if (a.image) root.appendChild(posterBlock(a.image));
  }

  /* ---------- 전체 렌더 ---------- */
  var mobileQuery = window.matchMedia("(max-width: 960px)");
  var pendingFocusId = null;
  var wasOpen = false;

  // 모바일에서는 조건 패널이 접혀 있으므로 토글 버튼에 선택 개수와 결과 건수를 함께 보여 준다.
  function updateToggle(resultCount) {
    var n = selectedCount();
    var btn = document.getElementById("filter-toggle");
    var open = document.getElementById("filters").classList.contains("open");
    btn.textContent = "";
    btn.appendChild(h("span", {
      text: "조건 설정" + (n ? " · " + n + "개 선택" : "") + " · 결과 " + resultCount + "건"
    }));
    btn.appendChild(h("span", { "aria-hidden": "true", text: open ? "▲" : "▼" }));
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    document.getElementById("filter-apply").textContent = "결과 " + resultCount + "건 보기";
  }

  // 모바일: 조건 패널을 접고 목록 맨 위로 이동한다.
  function applyAndShowResults() {
    document.getElementById("filters").classList.remove("open");
    render();
    // 상단 고정 바에 가리지 않도록 scroll-margin-top이 걸린 목록 영역으로 이동한다.
    document.querySelector(".results").scrollIntoView({ block: "start" });
  }

  function closeDetail() {
    if (state.selectedId === null) return;
    pendingFocusId = state.selectedId;
    state.selectedId = null;
    render();
  }

  function render() {
    var active = document.activeElement;
    var focusId = pendingFocusId || (active && active.getAttribute ? active.getAttribute("data-id") : null);
    pendingFocusId = null;

    var results = currentResults();
    var stillVisible = results.some(function (a) { return a.id === state.selectedId; });
    if (!stillVisible) state.selectedId = null;

    // 조건이 바뀌면 1페이지로 돌아간다. 선택한 공고가 다른 페이지에 있어도 상세는 그대로 유지한다.
    var conditionKey = JSON.stringify([state.interests, state.grades, state.statuses, state.slots, state.department]);
    if (conditionKey !== lastConditionKey) { state.page = 1; lastConditionKey = conditionKey; }
    var pg = F.paginate(results, state.page, state.pageSize);
    state.page = pg.page;

    syncCheckboxes();
    document.getElementById("page-size").value = String(state.pageSize);
    document.getElementById("result-count").textContent =
      "전체 " + D.ACTIVITIES.length + "건 중 " + results.length + "건" +
      (pg.totalPages > 1 ? " · " + pg.start + "–" + pg.end + "번째 표시" : "");
    document.getElementById("reset-btn").disabled = !hasAnyCondition();
    updateToggle(results.length);
    renderChips();
    renderList(results, pg.items);
    renderPager(pg.totalPages);
    renderDetail(results);

    // 모바일에서는 선택한 공고의 상세가 하단 시트로 열린다.
    var isOpen = state.selectedId !== null;
    document.getElementById("detail-panel").classList.toggle("open", isOpen);
    document.getElementById("backdrop").classList.toggle("open", isOpen);
    document.body.classList.toggle("sheet-open", isOpen);

    if (pendingFocusPage !== null) {
      var pageBtn = document.querySelector('#pager .page-btn[data-page="' + pendingFocusPage + '"]:not(:disabled)') ||
        document.querySelector("#pager .page-btn.current");
      if (pageBtn) pageBtn.focus({ preventScroll: true });
      pendingFocusPage = null;
    } else if (isOpen && !wasOpen && mobileQuery.matches) {
      document.getElementById("detail-close").focus();
    } else if (focusId) {
      var card = document.querySelector('.card[data-id="' + focusId + '"]');
      if (card) card.focus();
    }
    wasOpen = isOpen;
  }

  var sampleCount = D.ACTIVITIES.filter(function (a) { return a.isSample; }).length;
  document.getElementById("sample-note").textContent = sampleCount === 0
    ? "클릭형 프로토타입 · 실제 공고 " + D.ACTIVITIES.length + "건 (원문 요약)"
    : "클릭형 프로토타입 · 실제 공고 " + (D.ACTIVITIES.length - sampleCount) + "건 + 예시(가상) 공고 " + sampleCount + "건";

  buildFilters();
  var sizeSelect = document.getElementById("page-size");
  PAGE_SIZES.forEach(function (n) { sizeSelect.appendChild(h("option", { value: String(n), text: n + "개" })); });
  sizeSelect.addEventListener("change", function () {
    state.pageSize = Number(sizeSelect.value);
    state.page = 1;
    render();
  });
  document.getElementById("reset-btn").addEventListener("click", resetAll);
  document.getElementById("filter-toggle").addEventListener("click", function () {
    document.getElementById("filters").classList.toggle("open");
    render();
  });
  document.getElementById("filter-apply").addEventListener("click", applyAndShowResults);
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("backdrop").addEventListener("click", closeDetail);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mobileQuery.matches) closeDetail();
  });
  render();
})();
