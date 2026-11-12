/*
 * 브라우저 점검용 스크립트(자동 테스트 아님). index.html을 연 페이지에 이 파일을 불러온 뒤
 * `await window.__audit()`을 실행하면 현재 화면 크기에서 아래를 검사해 { problems, metrics }를 돌려준다.
 *  - 가로 스크롤, 화면 밖으로 넘치는 요소
 *  - 모바일 터치 대상 최소 44px
 *  - 조건 패널(접이식)과 "결과 N건 보기" 버튼, 목록이 고정 바에 가리는지
 *  - 상세 시트: 화면 아래에 붙는지, 닫기 버튼이 항상 보이는지, 포스터가 화면 안에 들어오는지
 *  - 결과 없음 안내, 초기화 후 전체 복귀
 * 화면 크기는 개발자 도구의 기기 에뮬레이션으로 바꿔 가며 반복 실행한다.
 */
window.__audit = async function () {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const mobile = matchMedia("(max-width: 960px)").matches;
  const total = window.AppData.ACTIVITIES.length;
  const P = [];
  const M = { vw: innerWidth, vh: innerHeight, mobileLayout: mobile };

  const check = (name) => {
    if (document.documentElement.scrollWidth > innerWidth) P.push(name + ": 가로 스크롤");
    const ov = qa("body *").filter((e) => vis(e) && !e.closest(".backdrop") &&
      getComputedStyle(e).position !== "fixed" && e.getBoundingClientRect().right > innerWidth + 1);
    if (ov.length) P.push(name + ": 화면 밖 요소 " + ov.slice(0, 3).map((e) => e.className || e.tagName).join(","));
    if (mobile) {
      const sm = qa("button:not(.chip), select, summary, label.check, a.source-link")
        .filter((e) => vis(e) && e.getBoundingClientRect().height < 43);
      if (sm.length) {
        P.push(name + ": 작은 터치 대상 " + sm.slice(0, 3)
          .map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height)).join(","));
      }
    }
  };
  const box = (k, v) => qa("#filter-groups input").find((i) => i.dataset.key === k && i.value === v).click();
  const openFilters = () => { if (mobile && !q("#filters").classList.contains("open")) q("#filter-toggle").click(); };
  const closeFilters = () => { if (mobile) q("#filter-apply").click(); };

  q("#reset-btn").click(); closeFilters();
  window.scrollTo(0, 0); await wait(100);
  check("initial");

  // 페이지 나누기: 10개씩이면 2페이지가 되고, 다음·이전·개수 변경이 동작하는지
  if (total > 10) {
    const sizeEl = q("#page-size");
    if (sizeEl.value !== "10") { sizeEl.value = "10"; sizeEl.dispatchEvent(new Event("change")); }
    const next = q("#pager .page-next");
    if (!next || next.disabled) P.push("pager: 다음 버튼 없음");
    else {
      const nb = next.getBoundingClientRect();
      if (mobile && nb.height < 43) P.push("pager: 다음 버튼 높이 " + Math.round(nb.height));
      if (nb.right > innerWidth + 1 || nb.left < 0) P.push("pager: 다음 버튼이 화면 밖");
      const first = qa(".card").length;
      next.click(); await wait(300);
      const second = qa(".card").length;
      M.pages = { first, second, status: q("#pager .pager-status")?.textContent };
      if (first !== 10 || second !== total - 10) P.push("pager: 페이지별 개수 " + first + "/" + second);
      if (q("#pager .page-next").disabled !== true) P.push("pager: 마지막 페이지에서 다음 버튼이 활성");
      check("page-2");
      const pb = q("#pager .page-prev"); pb.click(); await wait(200);
      if (qa(".card").length !== 10) P.push("pager: 이전 버튼 동작 실패");
    }
    sizeEl.value = "50"; sizeEl.dispatchEvent(new Event("change"));
    if (qa(".card").length !== total || q("#pager .page-btn")) P.push("pager: 50개씩 보기에서 한 페이지로 안 나옴");
    sizeEl.value = "10"; sizeEl.dispatchEvent(new Event("change"));
  }

  if (mobile) {
    const tl = q("#filter-toggle > span");
    M.toggleLines = Math.round(tl.getBoundingClientRect().height / 20);
    if (M.toggleLines > 2) P.push("initial: 조건 바 문구가 " + M.toggleLines + "줄");
  }

  // 조건 패널
  openFilters();
  box("interests", "IT"); box("interests", "디자인"); box("grades", "3"); box("statuses", "enrolled"); box("slots", "semester-eve");
  const sel = q("#department-select"); sel.value = "아트앤디자인학부"; sel.dispatchEvent(new Event("change"));
  await wait(50); check("filters-open");
  if (mobile) {
    const act = q(".filter-actions").getBoundingClientRect(); const fb = q("#filter-body").getBoundingClientRect();
    if (!(act.bottom <= innerHeight + 1 && act.top >= 0)) P.push("filters-open: 적용 버튼이 화면 밖");
    if (fb.bottom > innerHeight) P.push("filters-open: 패널이 화면보다 큼");
    M.panelBottom = Math.round(fb.bottom);
    q("#filter-apply").click(); await wait(400);
    const bar = q("#filters").getBoundingClientRect(); const rs = q(".results").getBoundingClientRect();
    if (q("#filters").classList.contains("open")) P.push("apply: 패널이 닫히지 않음");
    if (rs.top < bar.bottom - 1) P.push("apply: 목록 제목이 고정 바에 가림");
    check("after-apply");
  }
  q("#reset-btn").click(); closeFilters(); await wait(300);

  // 공고 선택 → 상세
  const card = qa(".card").find((c) => c.dataset.id === "r04");   // 1페이지에 있고 긴 포스터가 있는 공고
  card.scrollIntoView({ block: "center" }); await wait(150);
  const cr = card.getBoundingClientRect();
  if (!card.contains(document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2))) P.push("card: 탭 불가(가려짐)");
  card.click(); await wait(900);
  const sheet = q("#detail-panel"); const sh = sheet.getBoundingClientRect();
  M.detail = { position: getComputedStyle(sheet).position, top: Math.round(sh.top), bottom: Math.round(sh.bottom), height: Math.round(sh.height) };
  if (mobile) {
    if (Math.round(sh.bottom) !== innerHeight) P.push("sheet: 화면 아래에 붙지 않음");
    if (sh.top < 0) P.push("sheet: 위로 넘침");
    const cl = q("#detail-close").getBoundingClientRect();
    if (!(cl.top >= sh.top && cl.bottom <= sh.bottom)) P.push("sheet: 닫기 버튼 안 보임");
  }
  const po = q("#detail .poster");
  if (!po) P.push("detail: 포스터 없음");
  else { const p = po.getBoundingClientRect(); if (p.left < 0 || p.right > innerWidth) P.push("detail: 포스터가 화면 밖"); M.posterWidth = Math.round(p.width); }
  check("detail-open");
  if (mobile) {
    sheet.scrollTop = sheet.scrollHeight; await wait(100);
    const cl2 = q("#detail-close").getBoundingClientRect();
    if (!(cl2.top >= sh.top - 1 && cl2.bottom <= sh.bottom)) P.push("sheet: 스크롤하면 닫기 버튼 사라짐");
    q("#backdrop").click(); await wait(100);
    if (vis(sheet)) P.push("sheet: 바깥 터치로 안 닫힘");
  }

  // 결과 없음
  openFilters(); box("interests", "봉사"); box("statuses", "general"); closeFilters(); await wait(300);
  const em = q(".empty");
  if (!em) P.push("empty: 안내 없음"); else if (em.scrollWidth > em.clientWidth) P.push("empty: 가로 넘침");
  check("empty");

  q("#reset-btn").click(); closeFilters();
  M.reset = q("#result-count").textContent.replace(/\s/g, "");
  if (!M.reset.includes("전체" + total + "건중" + total + "건")) P.push("reset: 전체 복귀 실패");
  return { problems: P, metrics: M };
};
