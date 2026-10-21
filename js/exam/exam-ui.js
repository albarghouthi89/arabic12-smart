/* ==========================================================================
   exam-ui.js — واجهة «محاكاة الاختبار الوزاري»: إعداد → إنشاء → معاينة → تنزيل Word
   --------------------------------------------------------------------------
   تعتمد على ExamEngine (اختيار الأسئلة) وDocxWriter (ملف Word حقيقي) وقشرة
   AppShell. كل خيار يظهر في الإعداد مصدره بيانات حقيقية في البنك: الأقسام
   وأعدادها، الفصل المتاح، الحد الأقصى للأسئلة. لا يوجد خيار صعوبة (لأن حقل
   الصعوبة في البنك تقدير آلي غير موثوق) ولا أقسام وهمية.
   ========================================================================== */

const ExamUI = (function () {
  const COUNT_PRESETS = [10, 15, 20, 30, 40];
  const saved = { courseId: null, semester: 1, sections: null, count: 20, includeAnswers: false };

  function shell() { return window.AppShell; }
  function el(tag, cls, html) { return shell().el(tag, cls, html); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function go(view, title, opts) { return shell().go(view, title, opts); }

  // ------------------------------------------------------------------
  // الإعداد
  // ------------------------------------------------------------------
  function viewSetup(container) {
    const courses = ExamEngine.listCourses();
    if (!saved.courseId || !courses.some(c => c.id === saved.courseId)) saved.courseId = courses[0].id;

    const hero = el("div", "hero exam-hero");
    hero.innerHTML = `<h1>📝 محاكاة الاختبار الوزاري</h1>
      <p class="hero-sub">ابنِ اختبارًا تدريبيًا مخصَّصًا من أسئلة المنصة، ثم حمّله بصيغة Word للطباعة أو الحل.</p>`;
    container.appendChild(hero);
    container.appendChild(el("div", "qz-panel qz-panel-info exam-disclaimer",
      "⚠️ هذا اختبار <strong>تدريبي</strong> يُولَّد من أسئلة المنصة، وليس اختبارًا وزاريًا رسميًا ولا يُنسب إلى الوزارة."));

    const card = el("div", "qz-card exam-setup");
    container.appendChild(card);

    // --- الصف / المقرر ---
    const courseRow = el("div", "bk-field");
    courseRow.appendChild(el("label", null, "الصف والمقرر:"));
    const courseSel = el("select", "bk-select");
    courseSel.id = "exam-course";
    courses.forEach(c => {
      const o = el("option", null, `الصف ${esc(c.grade)} ${esc(c.track)} — ${esc(c.subject)}`);
      o.value = c.id; if (c.id === saved.courseId) o.selected = true; courseSel.appendChild(o);
    });
    courseRow.appendChild(courseSel);
    card.appendChild(courseRow);

    // --- الفصل الدراسي ---
    const semRow = el("div", "bk-field");
    semRow.appendChild(el("label", null, "الفصل الدراسي:"));
    const semSel = el("select", "bk-select");
    semSel.id = "exam-semester";
    semRow.appendChild(semSel);
    card.appendChild(semRow);

    // --- الأقسام ---
    const secBox = el("fieldset", "exam-sections");
    secBox.appendChild(el("legend", null, "أقسام الاختبار (تصنيف حقيقي في بنك الأسئلة):"));
    const secList = el("div", "exam-sec-list");
    secBox.appendChild(secList);
    card.appendChild(secBox);

    // --- عدد الأسئلة ---
    const countRow = el("div", "bk-field");
    countRow.appendChild(el("label", null, "عدد الأسئلة:"));
    const countWrap = el("div", "exam-count-wrap");
    const countInput = el("input", "bk-select exam-count-input");
    countInput.type = "number"; countInput.min = "1"; countInput.step = "1"; countInput.id = "exam-count";
    countInput.setAttribute("inputmode", "numeric");
    const chips = el("div", "exam-chips");
    countWrap.appendChild(countInput);
    countWrap.appendChild(chips);
    countRow.appendChild(countWrap);
    card.appendChild(countRow);
    const hint = el("div", "exam-hint");
    hint.setAttribute("aria-live", "polite");
    card.appendChild(hint);

    // --- مفتاح الإجابات (اختياري) ---
    const ansRow = el("label", "exam-check exam-answers-opt");
    const ansBox = el("input"); ansBox.type = "checkbox"; ansBox.id = "exam-answers"; ansBox.checked = saved.includeAnswers;
    ansRow.appendChild(ansBox);
    ansRow.appendChild(el("span", null, "أرغب في صفحة مفتاح إجابات في آخر الملف <span class=\"qz-muted\">(غير مفعّل افتراضيًا؛ الاختبار نفسه بلا إجابات)</span>"));
    card.appendChild(ansRow);

    const notes = el("div", "exam-notes qz-muted");
    card.appendChild(notes);

    const err = el("div", "exam-error hidden");
    err.setAttribute("role", "alert");
    card.appendChild(err);

    const actions = el("div", "qz-actions");
    const createBtn = el("button", "qz-btn qz-btn-primary", "إنشاء الاختبار التدريبي");
    createBtn.type = "button"; createBtn.id = "exam-create";
    actions.appendChild(createBtn);
    card.appendChild(actions);

    // ---------- منطق التحديث الحي ----------
    function currentCourse() { return courseSel.value; }
    function selectedSemester() { return Number(semSel.value) || 1; }
    function selectedSections() { return [...secList.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value); }
    function avail() { return ExamEngine.availableFor(currentCourse(), selectedSemester(), selectedSections()); }

    function fillSemesters() {
      semSel.innerHTML = "";
      const have = ExamEngine.availability(currentCourse(), 1).semestersAvailable;
      [1, 2].forEach(s => {
        const a = ExamEngine.availability(currentCourse(), s);
        const o = el("option", null, `${s === 1 ? "الفصل الدراسي الأول" : "الفصل الدراسي الثاني"}${a.total ? ` (${a.total} سؤالًا)` : " — لا يتوفر محتوى بعد"}`);
        o.value = String(s);
        if (!a.total) o.disabled = true;
        semSel.appendChild(o);
      });
      const first = [1, 2].find(s => ExamEngine.availability(currentCourse(), s).total);
      semSel.value = String(have.includes(saved.semester) ? saved.semester : (first || 1));
    }

    function fillSections() {
      const a = ExamEngine.availability(currentCourse(), selectedSemester());
      const prev = saved.sections;
      secList.innerHTML = "";
      a.sections.forEach(s => {
        const lab = el("label", "exam-check");
        const cb = el("input"); cb.type = "checkbox"; cb.value = s.key;
        cb.checked = s.count > 0 && (!prev || prev.includes(s.key));
        cb.disabled = s.count === 0;
        cb.dataset.count = s.count;
        lab.appendChild(cb);
        lab.appendChild(el("span", null, `${s.icon || ""} ${esc(s.name)} <span class="qz-muted">(${s.count} متاح)</span>`));
        cb.addEventListener("change", refresh);
        secList.appendChild(lab);
      });
      if (!selectedSections().length) secList.querySelectorAll("input:not(:disabled)").forEach(cb => { cb.checked = true; });
    }

    function fillChips() {
      chips.innerHTML = "";
      const max = avail();
      COUNT_PRESETS.filter(n => n <= max).forEach(n => {
        const b = el("button", "exam-chip", String(n));
        b.type = "button";
        b.addEventListener("click", () => { countInput.value = String(n); refresh(); });
        chips.appendChild(b);
      });
      if (max > 0 && !COUNT_PRESETS.includes(max)) {
        const b = el("button", "exam-chip", `الحد الأقصى (${max})`);
        b.type = "button";
        b.addEventListener("click", () => { countInput.value = String(max); refresh(); });
        chips.appendChild(b);
      }
    }

    function refresh() {
      const max = avail();
      const n = Math.floor(Number(countInput.value));
      countInput.max = String(max);
      fillChips();
      err.classList.add("hidden");
      let msg = `المتاح في الأقسام والفصل المحدَّدين: <strong>${max}</strong> سؤالًا. لن يُكرَّر أي سؤال في الاختبار الواحد.`;
      let ok = true;
      if (!selectedSections().length || max === 0) {
        msg = "اختر قسمًا واحدًا على الأقل."; ok = false;
      } else if (!(n >= 1)) {
        msg += " أدخل عدد الأسئلة (1 فأكثر)."; ok = false;
      } else if (n > max) {
        msg = `⚠️ طلبتَ ${n} سؤالًا لكن المتاح <strong>${max}</strong> فقط. لن نكرّر أسئلة بصمت — قلّل العدد أو أضف أقسامًا.`;
        ok = false;
      }
      hint.innerHTML = msg;
      hint.classList.toggle("exam-hint-warn", !ok);
      createBtn.disabled = !ok;
      const a = ExamEngine.availability(currentCourse(), selectedSemester());
      notes.innerHTML = a.excluded
        ? `ℹ️ استُبعد <strong>${a.excluded}</strong> سؤالًا من أصل ${a.bankTotal} في البنك لأنه يحيل إلى نص غير مرفق معه (أو مكرر)، حتى لا يظهر في الاختبار سؤال بلا نصه. ` +
          `الأقسام والأعداد أعلاه تحسب الأسئلة الصالحة فقط.`
        : "";
      saved.courseId = currentCourse(); saved.semester = selectedSemester();
      saved.sections = selectedSections(); saved.includeAnswers = ansBox.checked;
      if (n >= 1) saved.count = n;
    }

    courseSel.addEventListener("change", () => { fillSemesters(); fillSections(); refresh(); });
    semSel.addEventListener("change", () => { saved.sections = null; fillSections(); refresh(); });
    countInput.addEventListener("input", refresh);
    ansBox.addEventListener("change", refresh);

    fillSemesters();
    fillSections();
    const a0 = avail();
    countInput.value = String(Math.min(saved.count || 20, a0 || 1));
    refresh();

    createBtn.addEventListener("click", () => {
      const res = ExamEngine.generate({
        courseId: currentCourse(), semester: selectedSemester(), sections: selectedSections(),
        count: Number(countInput.value), includeAnswers: ansBox.checked
      });
      if (!res.ok) {
        err.innerHTML = "⚠️ " + esc(res.message);
        err.classList.remove("hidden");
        return;
      }
      go("examPreview", "🧾 معاينة الاختبار", { exam: res.exam });
    });
  }

  // ------------------------------------------------------------------
  // المعاينة + التنزيل
  // ------------------------------------------------------------------
  function viewPreview(container, opts) {
    const exam = opts.exam;
    if (!exam) { container.appendChild(el("div", "qz-panel qz-panel-bad", "لا يوجد اختبار لمعاينته. ارجع وأنشئ اختبارًا.")); return; }
    container.innerHTML = "";

    const card = el("div", "qz-card exam-summary");
    card.setAttribute("data-exam-summary", "1");
    const secRows = exam.sections.map(s => `<li>${esc(s.name)}: <strong>${s.count}</strong></li>`).join("");
    card.innerHTML = `
      <h3>🧾 الاختبار التدريبي جاهز</h3>
      <dl class="lib-dl exam-dl">
        <div><dt>المقرر</dt><dd>${esc(exam.course.subject)} — الصف ${esc(exam.course.grade)} ${esc(exam.course.track)}</dd></div>
        <div><dt>الفصل الدراسي</dt><dd>${esc(exam.semesterLabel)}</dd></div>
        <div><dt>عدد الأسئلة</dt><dd id="exam-total">${exam.totals.questions}</dd></div>
        <div><dt>الأقسام المضمَّنة</dt><dd><ul class="exam-seclist">${secRows}</ul></dd></div>
        <div><dt>النصوص المرجعية</dt><dd>${exam.totals.passages ? exam.totals.passages + " نص مرفق كاملًا" : "لا نصوص"}</dd></div>
        <div><dt>مفتاح الإجابات</dt><dd>${exam.answerKey ? "مُضمَّن في صفحة مستقلة (بطلبك)" : "غير مضمَّن (النسخة بلا إجابات)"}</dd></div>
      </dl>
      <p class="qz-panel qz-panel-info">هذا اختبار تدريبي مولَّد من محتوى المنصة، وليس اختبارًا وزاريًا رسميًا.</p>`;
    container.appendChild(card);

    const actions = el("div", "qz-actions exam-actions");
    const dl = el("button", "qz-btn qz-btn-primary", "⬇ تنزيل Word");
    dl.type = "button"; dl.id = "exam-download";
    const pv = el("button", "qz-btn qz-btn-outline", "👁 معاينة الاختبار كاملًا");
    pv.type = "button"; pv.id = "exam-toggle-preview"; pv.setAttribute("aria-expanded", "false");
    const nw = el("button", "qz-btn qz-btn-ghost", "🔄 إنشاء اختبار جديد");
    nw.type = "button"; nw.id = "exam-new";
    actions.appendChild(dl); actions.appendChild(pv); actions.appendChild(nw);
    container.appendChild(actions);
    const status = el("div", "exam-status");
    status.setAttribute("aria-live", "polite");
    container.appendChild(status);

    const paper = el("div", "exam-paper");
    paper.id = "exam-paper";
    container.appendChild(paper);
    let full = false;
    function renderPaper() {
      paper.innerHTML = "";
      exam.blocks.forEach(b => {
        const sec = el("section", "exam-block");
        sec.appendChild(el("h4", "exam-block-title", `السؤال ${esc(b.ordinal)}: ${esc(b.intro)}`));
        if (!full) {
          sec.appendChild(el("div", "exam-block-sec qz-muted", esc(b.sectionName) + (b.passage ? " — مع نص مرجعي" : "")));
        }
        if (b.passage && full) sec.appendChild(el("div", "bk-context-box", esc(b.passage)));
        else if (b.passage && !full) sec.appendChild(el("div", "exam-passage-chip", "📄 نص مرجعي مرفق (" + b.passage.length + " حرفًا)"));
        const ol = el("ol", "exam-qlist");
        b.questions.forEach(q => {
          const li = el("li", "exam-q");
          if (full) {
            let html = q.stemLines.map(l => `<div class="exam-q-line">${esc(l)}</div>`).join("");
            if (q.choices) html += `<div class="exam-q-opts">` + q.choices.map((c, i) => `<div class="exam-q-opt"><span class="exam-q-letter">${ExamEngine.LETTERS[i]})</span> ${esc(c)}</div>`).join("") + `</div>`;
            if (q.answerLines) html += `<div class="exam-q-blank" aria-hidden="true">${"· ".repeat(30)}</div>`;
            li.innerHTML = html;
          } else {
            const first = q.stemLines[0] || "";
            li.textContent = first.length > 90 ? first.slice(0, 90) + "…" : first;
          }
          ol.appendChild(li);
        });
        sec.appendChild(ol);
        paper.appendChild(sec);
      });
    }
    renderPaper();

    pv.addEventListener("click", () => {
      full = !full;
      pv.textContent = full ? "🗜 عرض مختصر" : "👁 معاينة الاختبار كاملًا";
      pv.setAttribute("aria-expanded", full ? "true" : "false");
      paper.classList.toggle("exam-paper-full", full);
      renderPaper();
      if (full) paper.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    dl.addEventListener("click", () => {
      try {
        const blob = DocxWriter.toBlob(exam);
        const name = DocxWriter.fileNameFor(exam);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name; a.style.display = "none";
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
        status.className = "exam-status exam-status-ok";
        status.textContent = "✅ بدأ تنزيل الملف: " + name;
      } catch (e) {
        status.className = "exam-status exam-status-bad";
        status.textContent = "⚠️ تعذّر إنشاء ملف Word: " + (e && e.message ? e.message : e);
      }
    });

    nw.addEventListener("click", () => {
      const res = ExamEngine.generate({
        courseId: exam.params.courseId, semester: exam.params.semester, sections: exam.params.sections,
        count: exam.params.count, includeAnswers: exam.params.includeAnswers
      });
      if (!res.ok) { status.className = "exam-status exam-status-bad"; status.textContent = "⚠️ " + res.message; return; }
      opts.exam = res.exam;   // نفس كائن opts المحفوظ في سجل التنقّل، فيبقى الرجوع متسقًا
      viewPreview(container, opts);
      window.scrollTo({ top: 0, behavior: "smooth" });
      const st = container.querySelector(".exam-status");
      if (st) { st.className = "exam-status exam-status-ok"; st.textContent = "🔄 أُنشئ اختبار جديد بأسئلة مختلفة (بالإعدادات نفسها)."; }
    });
  }

  return { viewSetup, viewPreview };
})();

window.ExamUI = ExamUI;
