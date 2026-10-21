/* ==========================================================================
   quiz.js — محرك الأسئلة والتغذية الراجعة
   يعرض كل أنواع التفاعلات: جرّب / تحدي 100% / مصائد الاختبار / مختبر الأخطاء /
   اشرح لي / ماذا لو / التحدي اليومي / التشخيص السريع.
   لا يعتمد على أي إطار عمل خارجي — DOM API مباشرة، لضمان العمل بلا خادم.
   ========================================================================== */

const QuizEngine = (function () {

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function clear(container) { container.innerHTML = ""; }

  // ------------------------------------------------------------------
  // مرحلة «جرّب» — سؤال بسلّم Hint → Explanation → Answer → Retry
  // ------------------------------------------------------------------
  function renderPracticeQuestion(container, q, lessonId, onDone) {
    clear(container);
    let attempts = 0;
    let usedHint = false;
    let currentQ = q;
    let isRetry = false;

    function build() {
      clear(container);
      const wrap = el("div", "qz-card");
      wrap.appendChild(el("div", "qz-badge", `${isRetry ? "سؤال مشابه" : "سؤال"} · مهارة: ${q.skill} · مستوى ${q.level}`));
      wrap.appendChild(el("p", "qz-stem", currentQ.stem));

      const optsWrap = el("div", "qz-options");
      currentQ.options.forEach((opt, idx) => {
        const btn = el("button", "qz-option", opt);
        btn.setAttribute("type", "button");
        btn.addEventListener("click", () => handleAnswer(idx, btn, optsWrap));
        optsWrap.appendChild(btn);
      });
      wrap.appendChild(optsWrap);

      const actions = el("div", "qz-actions");
      if (!isRetry) {
        const hintBtn = el("button", "qz-btn qz-btn-ghost", "💡 تلميح");
        hintBtn.addEventListener("click", () => {
          usedHint = true;
          feedbackZone.innerHTML = `<div class="qz-hint">💡 ${q.hint}</div>`;
        });
        actions.appendChild(hintBtn);
      }
      wrap.appendChild(actions);

      const feedbackZone = el("div", "qz-feedback-zone");
      wrap.appendChild(feedbackZone);
      container.appendChild(wrap);

      function handleAnswer(idx, btn, optsWrap) {
        attempts++;
        const correct = idx === currentQ.answer;
        [...optsWrap.children].forEach(b => b.disabled = true);
        btn.classList.add(correct ? "qz-correct" : "qz-wrong");

        Progress.recordAnswer({
          lessonId, questionId: isRetry ? q.id + "_retry" : q.id,
          skill: q.skill, correct, source: "practice",
          xp: correct ? (attempts === 1 ? 10 : 6) : 2
        });

        if (correct) {
          feedbackZone.innerHTML = `
            <div class="qz-panel qz-panel-good">
              <strong>✅ إجابة صحيحة${attempts === 1 && !usedHint ? " من أول محاولة!" : ""}</strong>
              <p>${q.why}</p>
            </div>`;
          const nextBtn = el("button", "qz-btn qz-btn-primary", isRetry || attempts > 1 ? "متابعة →" : "التالي →");
          nextBtn.addEventListener("click", () => onDone && onDone(true));
          feedbackZone.appendChild(nextBtn);
        } else if (attempts === 1 && !isRetry) {
          feedbackZone.innerHTML = `<div class="qz-panel qz-panel-warn"><strong>❌ ليست صحيحة تمامًا</strong><p>راجع التلميح، ثم حاول مرة أخرى.</p></div>`;
          const retryBtn = el("button", "qz-btn qz-btn-primary", "🔁 حاول مرة أخرى");
          retryBtn.addEventListener("click", build);
          feedbackZone.appendChild(retryBtn);
        } else {
          const optionsHtml = `<div class="qz-options" style="pointer-events:none">${currentQ.options.map((o, i) => `<div class="qz-option ${i === currentQ.answer ? 'qz-correct' : ''}">${o}</div>`).join("")}</div>`;
          feedbackZone.innerHTML = `
            <div class="qz-panel qz-panel-bad">
              <div class="qz-fb-row"><span class="qz-fb-label">إجابتك</span><span>${currentQ.options[idx]}</span></div>
              <div class="qz-fb-row"><span class="qz-fb-label">الصحيح</span><span>${currentQ.options[currentQ.answer]}</span></div>
              <div class="qz-fb-row"><span class="qz-fb-label">لماذا؟</span><span>${q.why}</span></div>
              <div class="qz-fb-row qz-fb-watch"><span class="qz-fb-label">⚠️ انتبه</span><span>${q.watch}</span></div>
            </div>`;
          if (q.retry && !isRetry) {
            const retryBtn2 = el("button", "qz-btn qz-btn-primary", "🔁 جرّب سؤالًا مشابهًا");
            retryBtn2.addEventListener("click", () => {
              isRetry = true; currentQ = q.retry; attempts = 0; build();
            });
            feedbackZone.appendChild(retryBtn2);
          } else {
            const nextBtn2 = el("button", "qz-btn qz-btn-primary", "متابعة →");
            nextBtn2.addEventListener("click", () => onDone && onDone(false));
            feedbackZone.appendChild(nextBtn2);
          }
        }
      }
    }
    build();
  }

  // ------------------------------------------------------------------
  // تحدي 100% — تسلسل مستويات
  // ------------------------------------------------------------------
  function renderChallenge100(container, lesson, onFinish) {
    clear(container);
    const levels = lesson.challenge100.levels;
    let li = 0, qi = 0;
    const results = {}; // skill -> {correct,total}
    lesson.challenge100 ? null : null;

    function ensureSkill(sk) { if (!results[sk]) results[sk] = { correct: 0, total: 0 }; }

    function renderIntro() {
      clear(container);
      const level = levels[li];
      const wrap = el("div", "qz-card qz-level-intro");
      const eliteTag = level.level === 5 ? `<div class="qz-elite-tag">⭐ هل أنت مستعد للسؤال الأصعب؟</div>` : "";
      wrap.innerHTML = `
        ${eliteTag}
        <div class="qz-level-num">المستوى ${level.level} / 5</div>
        <h3>${level.name}</h3>
        <p class="qz-muted">${level.questions.length} سؤال${level.questions.length > 1 ? "ات" : ""} عالي الجودة يقيس إتقانًا حقيقيًا لا حفظًا سطحيًا.</p>`;
      const startBtn = el("button", "qz-btn qz-btn-primary", "ابدأ المستوى");
      startBtn.addEventListener("click", () => { qi = 0; renderQuestion(); });
      wrap.appendChild(startBtn);
      container.appendChild(wrap);
    }

    function renderQuestion() {
      clear(container);
      const level = levels[li];
      const q = level.questions[qi];
      ensureSkill(level.skill);

      const wrap = el("div", "qz-card");
      wrap.appendChild(el("div", "qz-badge", `المستوى ${level.level} — ${level.name} · سؤال ${qi + 1}/${level.questions.length}`));
      wrap.appendChild(el("p", "qz-stem", q.stem));
      const optsWrap = el("div", "qz-options");
      q.options.forEach((opt, idx) => {
        const btn = el("button", "qz-option", opt);
        btn.addEventListener("click", () => handle(idx, btn, optsWrap));
        optsWrap.appendChild(btn);
      });
      wrap.appendChild(optsWrap);
      const fbZone = el("div", "qz-feedback-zone");
      wrap.appendChild(fbZone);
      container.appendChild(wrap);

      function handle(idx, btn, optsWrap) {
        const correct = idx === q.answer;
        [...optsWrap.children].forEach(b => b.disabled = true);
        btn.classList.add(correct ? "qz-correct" : "qz-wrong");
        results[level.skill].total++;
        if (correct) results[level.skill].correct++;

        let reasoningBlock = "";
        if (level.level === 5) {
          reasoningBlock = `<div class="qz-reasoning"><strong>Reasoning Feedback:</strong> هل كانت طريقة تفكيرك صحيحة قبل الاختيار؟ راجع التعليل التالي وقارنه بما فكّرت فيه.</div>`;
        }
        fbZone.innerHTML = `
          <div class="qz-panel ${correct ? 'qz-panel-good' : 'qz-panel-bad'}">
            <strong>${correct ? "✅ صحيح" : "❌ غير صحيح — الإجابة الصحيحة: " + q.options[q.answer]}</strong>
            <p>${q.why}</p>
          </div>${reasoningBlock}`;
        const nextBtn = el("button", "qz-btn qz-btn-primary", "متابعة →");
        nextBtn.addEventListener("click", advance);
        fbZone.appendChild(nextBtn);
      }
    }

    function advance() {
      const level = levels[li];
      qi++;
      if (qi < level.questions.length) { renderQuestion(); return; }
      li++;
      if (li < levels.length) { renderIntro(); return; }
      finish();
    }

    function finish() {
      const scoresBySkill = {};
      let sumC = 0, sumT = 0;
      Object.keys(results).forEach(sk => {
        const r = results[sk];
        scoresBySkill[sk] = r.total ? Math.round((r.correct / r.total) * 100) : 0;
        sumC += r.correct; sumT += r.total;
      });
      const overall = sumT ? Math.round((sumC / sumT) * 100) : 0;
      const saved = Progress.recordChallenge100(lesson.id, scoresBySkill, overall);
      const newBadges = Progress.checkBadges(lesson.id);
      onFinish && onFinish({ overall, scoresBySkill, newBadges, saved });
    }

    renderIntro();
  }

  // ------------------------------------------------------------------
  // مصائد الاختبار
  // ------------------------------------------------------------------
  function renderExamTrap(container, trap, lessonId, onDone) {
    clear(container);
    let attempts = 0;
    const wrap = el("div", "qz-card qz-trap-card");
    wrap.appendChild(el("div", "qz-badge qz-badge-trap", `🕵️ مصيدة: ${trap.pair[0]} ⚔️ ${trap.pair[1]}`));
    wrap.appendChild(el("p", "qz-stem", trap.stem));
    const optsWrap = el("div", "qz-options");
    trap.options.forEach((opt, idx) => {
      const btn = el("button", "qz-option", opt);
      btn.addEventListener("click", () => handle(idx, btn));
      optsWrap.appendChild(btn);
    });
    wrap.appendChild(optsWrap);
    const fbZone = el("div", "qz-feedback-zone");
    wrap.appendChild(fbZone);
    container.appendChild(wrap);

    function handle(idx, btn) {
      attempts++;
      const correct = idx === trap.answer;
      [...optsWrap.children].forEach(b => b.disabled = true);
      btn.classList.add(correct ? "qz-correct" : "qz-wrong");
      Progress.recordExamTrap(lessonId, trap.id, correct && attempts === 1);

      if (correct) {
        fbZone.innerHTML = `
          <div class="qz-panel qz-panel-good"><strong>✅ نجوت من المصيدة!</strong></div>
          <div class="qz-panel qz-panel-info">
            <div class="qz-fb-row"><span class="qz-fb-label">القرينة</span><span>${trap.clue}</span></div>
            <div class="qz-fb-row"><span class="qz-fb-label">القاعدة للسؤال القادم</span><span>${trap.ruleForNext}</span></div>
          </div>`;
        const nextBtn = el("button", "qz-btn qz-btn-primary", "المصيدة التالية →");
        nextBtn.addEventListener("click", () => onDone && onDone());
        fbZone.appendChild(nextBtn);
      } else {
        const why = (trap.wrongChoiceExplain && trap.wrongChoiceExplain[idx]) || "هذا الخيار قريب الشبه بالإجابة الصحيحة، وهذا بالضبط سبب كونه مصيدة.";
        fbZone.innerHTML = `
          <div class="qz-panel qz-panel-bad">
            <div class="qz-fb-row"><span class="qz-fb-label">لماذا بدا هذا صحيحًا؟</span><span>${why}</span></div>
            <div class="qz-fb-row"><span class="qz-fb-label">القرينة الكاشفة</span><span>${trap.clue}</span></div>
            <div class="qz-fb-row"><span class="qz-fb-label">القاعدة للسؤال القادم</span><span>${trap.ruleForNext}</span></div>
          </div>`;
        const retryBtn = el("button", "qz-btn qz-btn-ghost", "🔁 حاول هذه المصيدة مرة أخرى");
        retryBtn.addEventListener("click", () => renderExamTrap(container, trap, lessonId, onDone));
        const nextBtn = el("button", "qz-btn qz-btn-primary", "تخطَّ إلى المصيدة التالية →");
        nextBtn.addEventListener("click", () => onDone && onDone());
        fbZone.appendChild(retryBtn);
        fbZone.appendChild(nextBtn);
      }
    }
  }

  // ------------------------------------------------------------------
  // مختبر الأخطاء
  // ------------------------------------------------------------------
  function renderErrorLab(container, item, lessonId, onDone) {
    clear(container);
    const wrap = el("div", "qz-card qz-errorlab-card");
    wrap.appendChild(el("div", "qz-badge", "🔬 مختبر الأخطاء"));
    wrap.appendChild(el("p", "qz-stem", item.prompt));
    wrap.appendChild(el("p", "qz-question-mini", item.question));

    const list = el("div", "qz-samples");
    item.samples.forEach(s => {
      const card = el("div", "qz-sample");
      card.innerHTML = `<div class="qz-sample-label">${s.label}</div><div class="qz-sample-text">${s.text}</div>`;
      const btn = el("button", "qz-btn qz-btn-outline", "اختر هذه الإجابة");
      btn.addEventListener("click", () => handle(s, card));
      card.appendChild(btn);
      list.appendChild(card);
    });
    wrap.appendChild(list);
    const fbZone = el("div", "qz-feedback-zone");
    wrap.appendChild(fbZone);
    container.appendChild(wrap);

    function handle(chosen, card) {
      const solved = chosen.verdict === "full";
      Progress.recordErrorLab(lessonId, item.id, solved);
      [...list.querySelectorAll(".qz-btn")].forEach(b => b.disabled = true);

      const verdictLabel = { full: "✅ الدرجة الكاملة", incomplete: "🟡 ناقصة (تصنيف صحيح دون تعليل)", simple_error: "🟠 خطأ بسيط", conceptual_error: "🔴 خطأ مفاهيمي" };
      let html = `<div class="qz-panel ${solved ? 'qz-panel-good' : 'qz-panel-warn'}"><strong>${solved ? "أحسنت! هذه فعلًا الإجابة الكاملة." : "لم تختر إجابة الدرجة الكاملة — إليك تحليل كل الإجابات:"}</strong></div>`;
      item.samples.forEach(s => {
        html += `<div class="qz-panel qz-panel-info"><div class="qz-fb-row"><span class="qz-fb-label">${s.label} — ${verdictLabel[s.verdict]}</span><span>${s.why}</span></div></div>`;
      });
      fbZone.innerHTML = html;
      const nextBtn = el("button", "qz-btn qz-btn-primary", "التالي →");
      nextBtn.addEventListener("click", () => onDone && onDone());
      fbZone.appendChild(nextBtn);
    }
  }

  // ------------------------------------------------------------------
  // اشرح لي (Teach It)
  // ------------------------------------------------------------------
  function renderTeachIt(container, item, lessonId) {
    clear(container);
    const wrap = el("div", "qz-card qz-teachit-card");
    wrap.appendChild(el("div", "qz-badge", "🧠 اشرح لي"));
    wrap.appendChild(el("p", "qz-stem", item.prompt));
    const ta = el("textarea", "qz-textarea");
    ta.placeholder = "اكتب شرحك بكلماتك هنا...";
    ta.rows = 5;
    wrap.appendChild(ta);
    const submitBtn = el("button", "qz-btn qz-btn-primary", "أرسل للتقييم");
    wrap.appendChild(submitBtn);
    const fbZone = el("div", "qz-feedback-zone");
    wrap.appendChild(fbZone);
    container.appendChild(wrap);

    submitBtn.addEventListener("click", () => {
      const text = ta.value.trim();
      if (!text) { fbZone.innerHTML = `<div class="qz-panel qz-panel-warn">اكتب إجابتك أولًا قبل الإرسال.</div>`; return; }
      const matched = [], missing = [];
      item.requiredIdeas.forEach(idea => {
        const found = idea.labels.some(l => text.includes(l));
        if (found) matched.push(idea); else missing.push(idea);
      });
      const score = item.requiredIdeas.length ? matched.length / item.requiredIdeas.length : 0;
      Progress.recordTeachIt(lessonId, item.id, score, { matched: matched.length, total: item.requiredIdeas.length }, text);

      const pct = Math.round(score * 100);
      let level = "حاول مرة أخرى";
      if (pct >= 85) level = "إتقان ممتاز";
      else if (pct >= 60) level = "فهم جيد — قابل للتحسين";
      else if (pct >= 30) level = "بداية فهم — يحتاج تعميقًا";

      fbZone.innerHTML = `
        <div class="qz-panel ${pct >= 60 ? 'qz-panel-good' : 'qz-panel-warn'}">
          <strong>التقييم: ${pct}% — ${level}</strong>
        </div>
        <div class="qz-panel qz-panel-info">
          <div class="qz-fb-row"><span class="qz-fb-label">✅ ما أتقنته</span><span>${matched.length ? matched.map(m => m.key).join("، ") : "لم تُغطِّ عناصر كافية بعد."}</span></div>
          <div class="qz-fb-row"><span class="qz-fb-label">🔸 ما ينقصك</span><span>${missing.length ? missing.map(m => m.feedbackMissing).join(" ") : "لا شيء — إجابتك مكتملة العناصر!"}</span></div>
        </div>
        <details class="qz-model-answer"><summary>عرض نموذج إجابة</summary><p>${item.modelAnswer}</p></details>`;
      const retryBtn = el("button", "qz-btn qz-btn-ghost", "🔁 حاول مرة أخرى");
      retryBtn.addEventListener("click", () => { ta.value = ""; fbZone.innerHTML = ""; });
      fbZone.appendChild(retryBtn);
    });
  }

  // ------------------------------------------------------------------
  // ماذا لو؟
  // ------------------------------------------------------------------
  function renderWhatIf(container, item) {
    clear(container);
    const wrap = el("div", "qz-card qz-whatif-card");
    wrap.appendChild(el("div", "qz-badge", "🔄 ماذا لو؟"));
    wrap.appendChild(el("div", "qz-whatif-base", `<span class="qz-fb-label">الأصل</span> ${item.base}`));
    wrap.appendChild(el("div", "qz-whatif-change", `❓ ${item.change}`));
    const revealBtn = el("button", "qz-btn qz-btn-primary", "اكشف النتيجة");
    wrap.appendChild(revealBtn);
    const fbZone = el("div", "qz-feedback-zone");
    wrap.appendChild(fbZone);
    container.appendChild(wrap);
    revealBtn.addEventListener("click", () => {
      fbZone.innerHTML = `
        <div class="qz-panel qz-panel-info">
          <div class="qz-fb-row"><span class="qz-fb-label">يصبح</span><span>${item.result}</span></div>
          <div class="qz-fb-row"><span class="qz-fb-label">الأثر</span><span>${item.effect}</span></div>
          <div class="qz-fb-row"><span class="qz-fb-label">فكّر</span><span>${item.question}</span></div>
        </div>`;
      revealBtn.disabled = true;
    });
  }

  // ------------------------------------------------------------------
  // التحدي اليومي (Daily Challenge)
  // ------------------------------------------------------------------
  function pickDailyIndex(len, dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
    return hash % len;
  }

  function renderDailyChallenge(container, lessons) {
    clear(container);
    const today = Progress.todayStr();
    const state = Progress.getState();
    const already = state.dailyChallenge.lastDate === today;

    // بنك مُجمَّع من كل الدروس المتاحة — يتيح تحديًا يوميًا يغطي المقرر كاملًا
    const lessonList = Array.isArray(lessons) ? lessons : [lessons];
    const combinedPool = [];
    lessonList.forEach(l => (l.dailyChallengePool || []).forEach(q => combinedPool.push(Object.assign({ lessonTitle: l.title }, q))));
    if (combinedPool.length === 0) {
      container.appendChild(el("div", "qz-panel qz-panel-info", "لا يوجد بنك تحدٍّ يومي متاح بعد."));
      return;
    }
    const idx = pickDailyIndex(combinedPool.length, today);
    const q = combinedPool[idx];

    const wrap = el("div", "qz-card qz-daily-card");
    wrap.appendChild(el("div", "qz-badge", `📅 التحدي اليومي — ${today} · ${q.lessonTitle}`));
    wrap.appendChild(el("p", "qz-stem", q.stem));

    if (already) {
      const wasCorrect = state.dailyChallenge.history[today];
      wrap.appendChild(el("div", "qz-panel qz-panel-info", `لقد أجبت عن تحدي اليوم بالفعل (${wasCorrect ? "✅ إجابة صحيحة" : "❌ إجابة غير صحيحة"}). عُد غدًا لتحدٍّ جديد!`));
      container.appendChild(wrap);
      return;
    }

    const optsWrap = el("div", "qz-options");
    q.options.forEach((opt, i) => {
      const btn = el("button", "qz-option", opt);
      btn.addEventListener("click", () => {
        const correct = i === q.answer;
        [...optsWrap.children].forEach(b => b.disabled = true);
        btn.classList.add(correct ? "qz-correct" : "qz-wrong");
        Progress.recordDailyChallenge(correct);
        const fb = el("div", `qz-panel ${correct ? 'qz-panel-good' : 'qz-panel-bad'}`, correct ? "✅ إجابة صحيحة! حافظ على تتابعك اليومي 🔥" : `❌ الإجابة الصحيحة: ${q.options[q.answer]}`);
        wrap.appendChild(fb);
      });
      optsWrap.appendChild(btn);
    });
    wrap.appendChild(optsWrap);
    container.appendChild(wrap);
  }

  return {
    renderPracticeQuestion,
    renderChallenge100,
    renderExamTrap,
    renderErrorLab,
    renderTeachIt,
    renderWhatIf,
    renderDailyChallenge,
    pickDailyIndex
  };
})();
