/* ==========================================================================
   mindmap.js — الخريطة الذهنية التفاعلية (عرض كامل / وضع اختبار / خريطة فارغة)
   ========================================================================== */

const MindMapEngine = (function () {

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function clear(c) { c.innerHTML = ""; }

  // ------------------------------------------------------------------
  // وضع العرض الكامل (SHOW ALL) — قابل للطي/التوسيع
  // ------------------------------------------------------------------
  function renderFull(container, lesson) {
    clear(container);
    const wrap = el("div", "mm-wrap");
    wrap.appendChild(el("div", "mm-center", lesson.mindMap.center));

    const branches = el("div", "mm-branches");
    lesson.mindMap.branches.forEach(branch => {
      const bEl = el("div", `mm-branch mm-color-${branch.color}`);
      const head = el("button", "mm-branch-head", `<span>${branch.label}</span><span class="mm-caret">▾</span>`);
      const childrenWrap = el("div", "mm-children");
      branch.children.forEach(child => {
        const cEl = el("div", "mm-child");
        const cBtn = el("button", "mm-child-btn", child.label);
        const detail = el("div", "mm-detail hidden", child.detail);
        cBtn.addEventListener("click", () => {
          detail.classList.toggle("hidden");
          Progress.ensureLesson(lesson.id).mindMap.viewedBranches.includes(child.id) ||
            Progress.ensureLesson(lesson.id).mindMap.viewedBranches.push(child.id);
        });
        cEl.appendChild(cBtn);
        cEl.appendChild(detail);
        childrenWrap.appendChild(cEl);
      });
      head.addEventListener("click", () => childrenWrap.classList.toggle("hidden"));
      bEl.appendChild(head);
      bEl.appendChild(childrenWrap);
      branches.appendChild(bEl);
    });
    wrap.appendChild(branches);
    container.appendChild(wrap);
  }

  // ------------------------------------------------------------------
  // وضع الاختبار (QUIZ MODE) — إخفاء التفاصيل وطلب الاسترجاع أولًا
  // ------------------------------------------------------------------
  function renderQuizMode(container, lesson) {
    clear(container);
    const wrap = el("div", "mm-wrap");
    wrap.appendChild(el("div", "mm-center", lesson.mindMap.center));
    wrap.appendChild(el("p", "mm-instructions", "🧠 حاول أن تتذكّر تفصيل كل فرع في ذهنك قبل الضغط على «كشف الإجابة»."));

    const branches = el("div", "mm-branches");
    lesson.mindMap.branches.forEach(branch => {
      const bEl = el("div", `mm-branch mm-color-${branch.color}`);
      bEl.appendChild(el("div", "mm-branch-head mm-branch-head-static", branch.label));
      const childrenWrap = el("div", "mm-children");
      branch.children.forEach(child => {
        const cEl = el("div", "mm-child mm-quiz-child");
        cEl.appendChild(el("div", "mm-child-label", child.label));
        const revealBtn = el("button", "qz-btn qz-btn-outline mm-reveal-btn", "استرجع ثم اكشف الإجابة");
        const detail = el("div", "mm-detail hidden", child.detail);
        const rateRow = el("div", "mm-rate-row hidden");
        const goodBtn = el("button", "qz-btn qz-btn-primary", "تذكّرتها ✅");
        const badBtn = el("button", "qz-btn qz-btn-ghost", "لم أتذكّرها ❌");
        rateRow.appendChild(goodBtn); rateRow.appendChild(badBtn);

        revealBtn.addEventListener("click", () => {
          detail.classList.remove("hidden");
          rateRow.classList.remove("hidden");
          revealBtn.disabled = true;
        });
        function logResult(correct) {
          Progress.recordAnswer({ lessonId: lesson.id, questionId: "mindmap_" + child.id, skill: "فهم", correct, source: "mindmap_quiz", xp: correct ? 6 : 2 });
          goodBtn.disabled = true; badBtn.disabled = true;
        }
        goodBtn.addEventListener("click", () => logResult(true));
        badBtn.addEventListener("click", () => logResult(false));

        cEl.appendChild(revealBtn);
        cEl.appendChild(detail);
        cEl.appendChild(rateRow);
        childrenWrap.appendChild(cEl);
      });
      bEl.appendChild(childrenWrap);
      branches.appendChild(bEl);
    });
    wrap.appendChild(branches);
    container.appendChild(wrap);
  }

  // ------------------------------------------------------------------
  // الخريطة الذهنية الفارغة (BLANK MIND MAP) — Retrieval Practice
  // ------------------------------------------------------------------
  function renderBlank(container, lesson) {
    clear(container);
    const wrap = el("div", "mm-wrap");
    wrap.appendChild(el("div", "mm-center", lesson.mindMap.center));
    wrap.appendChild(el("p", "mm-instructions", "✏️ املأ الفراغات من ذاكرتك، ثم أرسل للمقارنة بالنموذج."));

    const form = el("div", "mm-blank-form");
    const inputs = [];
    lesson.mindMap.blankTemplate.forEach((item, i) => {
      const row = el("div", "mm-blank-row");
      row.appendChild(el("label", "mm-blank-label", `${item.branch} ← ${item.field}`));
      const input = el("textarea", "qz-textarea mm-blank-input");
      input.rows = 2;
      row.appendChild(input);
      inputs.push(input);
      form.appendChild(row);
    });
    wrap.appendChild(form);

    const submitBtn = el("button", "qz-btn qz-btn-primary", "قارن بالنموذج الصحيح");
    wrap.appendChild(submitBtn);
    const resultZone = el("div", "mm-blank-results");
    wrap.appendChild(resultZone);
    container.appendChild(wrap);

    submitBtn.addEventListener("click", () => {
      clear(resultZone);
      let filledCount = 0;
      lesson.mindMap.blankTemplate.forEach((item, i) => {
        const studentAnswer = inputs[i].value.trim();
        if (studentAnswer) filledCount++;
        const row = el("div", "qz-panel qz-panel-info mm-blank-compare");
        row.innerHTML = `
          <div class="qz-fb-row"><span class="qz-fb-label">${item.branch} ← ${item.field}</span></div>
          <div class="qz-fb-row"><span class="qz-fb-label">إجابتك</span><span>${studentAnswer || "(بلا إجابة)"}</span></div>
          <div class="qz-fb-row"><span class="qz-fb-label">النموذج الصحيح</span><span>${item.answer}</span></div>`;
        resultZone.appendChild(row);
      });
      const score = filledCount / lesson.mindMap.blankTemplate.length;
      Progress.ensureLesson(lesson.id).mindMap.blankBestScore = Math.max(Progress.ensureLesson(lesson.id).mindMap.blankBestScore, score);
      Progress.recordAnswer({ lessonId: lesson.id, questionId: "mindmap_blank", skill: "تحليل", correct: score >= 0.75, source: "mindmap_blank", xp: Math.round(score * 15) });
      submitBtn.disabled = true;
    });
  }

  return { renderFull, renderQuizMode, renderBlank };
})();
