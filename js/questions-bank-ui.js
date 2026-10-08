/* ==========================================================================
   questions-bank-ui.js — واجهات بنك الأسئلة التجريبية والوزارية
   يعتمد على: QuestionBank (questions-bank.js), Progress (progress.js),
   ونظام قشرة صغير window.AppShell يوفّره app.js إضافيًا (el/clear/go/goRoot/
   back/refreshChips/scrollTop) حتى لا نكرر تلك الدوال ولا نُعدّل app.js
   إلا بأسطر إضافة بسيطة (بطاقة لوحة + مسارات VIEWS جديدة).
   لا يحذف ولا يُعدّل أي كود موجود مسبقًا.
   ========================================================================== */

const QBankUI = (function () {
  const PAGE_SIZE = 20;

  function shell() { return window.AppShell; }
  function el(tag, cls, html) { return shell().el(tag, cls, html); }
  function clear(c) { return shell().clear(c); }
  function go(view, title, opts) { return shell().go(view, title, opts); }
  function goRoot(view, title, opts) { return shell().goRoot(view, title, opts); }
  function backNav() { return shell().back(); }
  function refreshChips() { return shell().refreshChips(); }
  function scrollTop() { return shell().scrollTop(); }

  const DIFF_LABEL = { "سهل": "سهل", "متوسط": "متوسط", "صعب": "صعب" };
  const QTYPE_LABEL = { mcq: "اختيار من متعدد", short_answer: "إجابة قصيرة", essay: "مقالي/إنشائي" };

  // ======================================================================
  // "أكمل من حيث توقفت" (إضافة جديدة) — تخزين منفصل تمامًا (مفتاح خاص) لا
  // يتقاطع مع progress.js أو questions-bank.js: يحفظ فقط آخر جلسة تدرّب
  // كاملة على موضوع فرعي لم تُنهَ بعد، ليعرضها app.js في الصفحة الرئيسية.
  // ======================================================================
  const LAST_SESSION_KEY = "arabic12_bank_lastsession_v1";
  function saveLastSession(state) {
    try { localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function getLastSession() {
    try {
      const raw = localStorage.getItem(LAST_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearLastSession() {
    try { localStorage.removeItem(LAST_SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function badge(text, cls) { return el("span", "bk-badge " + (cls || ""), text); }

  function sourceLine(q) {
    const bits = [q.source];
    if (q.sourcePage) bits.push(`ص ${q.sourcePage}`);
    if (q.originalQuestionNumber) bits.push(`سؤال ${q.originalQuestionNumber} في الأصل`);
    return bits.filter(Boolean).join(" — ");
  }

  function questionMetaRow(q) {
    const row = el("div", "bk-meta-row");
    row.appendChild(badge(q.category, "bk-badge-cat"));
    if (q.subcategory) row.appendChild(badge(q.subcategory, "bk-badge-topic"));
    row.appendChild(badge(q.sourceType, q.sourceType === "وزاري" ? "bk-badge-official" : "bk-badge-trial"));
    row.appendChild(badge(DIFF_LABEL[q.difficulty] || q.difficulty, "bk-badge-diff"));
    if (q.needsAnswerReview) row.appendChild(badge("بحاجة لمراجعة المعلم", "bk-badge-review"));
    return row;
  }

  function questionSourceFooter(q) {
    const f = el("div", "bk-source-footer", "📎 " + sourceLine(q));
    return f;
  }

  function bookmarkButton(q, onToggle) {
    const isBk = QuestionBank.isBookmarked(q.id);
    const b = el("button", "bk-bookmark-btn" + (isBk ? " active" : ""), isBk ? "★ محفوظ" : "☆ حفظ");
    b.addEventListener("click", () => {
      const now = QuestionBank.toggleBookmark(q.id);
      b.classList.toggle("active", now);
      b.textContent = now ? "★ محفوظ" : "☆ حفظ";
      if (onToggle) onToggle(now);
    });
    return b;
  }

  // ======================================================================
  // عرض سؤال واحد — اختيار من متعدد
  // ======================================================================
  function renderMcqQuestion(container, q, opts) {
    opts = opts || {};
    clear(container);
    const card = el("div", "qz-card");
    card.appendChild(questionMetaRow(q));
    if (q.context) card.appendChild(el("div", "bk-context-box", q.context.replace(/\n/g, "<br>")));
    card.appendChild(el("p", "qz-stem", q.question.replace(/\n/g, "<br>")));

    const optsWrap = el("div", "qz-options");
    let answered = false;
    q.choices.forEach((choiceText, i) => {
      const btn = el("button", "qz-option", choiceText);
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = i === q.correctAnswer;
        [...optsWrap.children].forEach((b, bi) => {
          b.disabled = true;
          if (bi === q.correctAnswer) b.classList.add("qz-correct");
          if (bi === i && !correct) b.classList.add("qz-wrong");
        });
        const fb = el("div", "qz-feedback-zone");
        fb.appendChild(el("div", "qz-panel " + (correct ? "qz-panel-good" : "qz-panel-bad"),
          correct ? "✅ إجابة صحيحة!" : `❌ إجابة غير صحيحة. الإجابة الصحيحة: «${q.choices[q.correctAnswer]}»`));
        if (q._extractionNotes) fb.appendChild(el("div", "qz-panel qz-panel-info", "ملاحظة من المصدر: " + q._extractionNotes));
        card.appendChild(fb);
        card.appendChild(questionSourceFooter(q));
        const { xp } = QuestionBank.recordAttempt(q, correct, { mode: opts.mode || "practice" });
        refreshChips();
        const nextBtn = el("button", "qz-btn qz-btn-primary", opts.nextLabel || "التالي ←");
        nextBtn.addEventListener("click", () => opts.onAnswered && opts.onAnswered(correct, xp));
        card.appendChild(nextBtn);
      });
      optsWrap.appendChild(btn);
    });
    card.appendChild(optsWrap);
    const actions = el("div", "qz-actions");
    actions.appendChild(bookmarkButton(q));
    card.appendChild(actions);
    container.appendChild(card);
  }

  // ======================================================================
  // عرض سؤال واحد — إجابة قصيرة (تقييم ذاتي عند وجود نموذج إجابة)
  // ======================================================================
  function renderShortAnswerQuestion(container, q, opts) {
    opts = opts || {};
    clear(container);
    const card = el("div", "qz-card");
    card.appendChild(questionMetaRow(q));
    if (q.context) card.appendChild(el("div", "bk-context-box", q.context.replace(/\n/g, "<br>")));
    card.appendChild(el("p", "qz-stem", q.question.replace(/\n/g, "<br>")));

    const ta = el("textarea", "qz-textarea");
    ta.rows = 3;
    ta.placeholder = "اكتب إجابتك هنا (اختياري) قبل إظهار النموذج...";
    card.appendChild(ta);

    const hasModel = q.questionType === "short_answer" && typeof q.correctAnswer === "string" && q.correctAnswer.trim();
    const revealBtn = el("button", "qz-btn qz-btn-outline", hasModel ? "إظهار الإجابة النموذجية" : "لا توجد إجابة نموذجية موثّقة لهذا السؤال");
    if (!hasModel) revealBtn.disabled = true;
    card.appendChild(revealBtn);

    const zone = el("div", "qz-feedback-zone");
    card.appendChild(zone);

    revealBtn.addEventListener("click", () => {
      clear(zone);
      zone.appendChild(el("div", "qz-model-answer", "<strong>الإجابة النموذجية (من المصدر):</strong><br>" + q.correctAnswer.replace(/\n/g, "<br>")));
      const selfRow = el("div", "qz-actions");
      const rightBtn = el("button", "qz-btn qz-btn-primary", "✅ إجابتي كانت صحيحة");
      const wrongBtn = el("button", "qz-btn qz-btn-ghost", "❌ إجابتي كانت خاطئة");
      const mark = (correct) => {
        rightBtn.disabled = true; wrongBtn.disabled = true;
        const { xp } = QuestionBank.recordAttempt(q, correct, { mode: opts.mode || "practice" });
        refreshChips();
        card.appendChild(questionSourceFooter(q));
        const nextBtn = el("button", "qz-btn qz-btn-primary", opts.nextLabel || "التالي ←");
        nextBtn.addEventListener("click", () => opts.onAnswered && opts.onAnswered(correct, xp));
        card.appendChild(nextBtn);
      };
      rightBtn.addEventListener("click", () => mark(true));
      wrongBtn.addEventListener("click", () => mark(false));
      selfRow.appendChild(rightBtn); selfRow.appendChild(wrongBtn);
      zone.appendChild(el("div", "qz-hint", "تقييم ذاتي: قارن إجابتك بالنموذج ثم حدّد صدقًا."));
      zone.appendChild(selfRow);
      revealBtn.disabled = true;
    });

    if (!hasModel) {
      card.appendChild(el("div", "qz-panel qz-panel-warn", "هذا السؤال بحاجة لمراجعة المعلم لعدم توفر إجابة رسمية موثّقة من مصدره — يمكنك الاطلاع عليه والتدرّب عليه، لكنه لا يُحتسب آليًا ضمن نقاط الإتقان."));
      const skipBtn = el("button", "qz-btn qz-btn-primary", opts.nextLabel || "التالي ←");
      skipBtn.addEventListener("click", () => opts.onAnswered && opts.onAnswered(null, 0));
      card.appendChild(skipBtn);
    }

    const actions = el("div", "qz-actions");
    actions.appendChild(bookmarkButton(q));
    card.appendChild(actions);
    container.appendChild(card);
  }

  // ======================================================================
  // عرض سؤال واحد — إنشائي/كتابة (بلا تصحيح آلي أو ذاتي بمعنى صح/خطأ)
  // ======================================================================
  function renderEssayQuestion(container, q, opts) {
    opts = opts || {};
    clear(container);
    const card = el("div", "qz-card");
    card.appendChild(questionMetaRow(q));
    card.appendChild(el("p", "qz-stem", q.question.replace(/\n/g, "<br>")));
    card.appendChild(el("div", "qz-panel qz-panel-info", "سؤال كتابة/إنشاء مفتوح — لا توجد إجابة واحدة صحيحة بطبيعته. تدرّب على التخطيط والكتابة، ثم راجع مع معلمك."));
    const ta = el("textarea", "qz-textarea");
    ta.rows = 6;
    ta.placeholder = "اكتب مسودتك هنا...";
    card.appendChild(ta);
    card.appendChild(questionSourceFooter(q));
    const doneBtn = el("button", "qz-btn qz-btn-primary", opts.nextLabel || "التالي ←");
    doneBtn.addEventListener("click", () => opts.onAnswered && opts.onAnswered(null, 0));
    card.appendChild(doneBtn);
    container.appendChild(card);
  }

  function renderQuestionAny(container, q, opts) {
    if (q.questionType === "mcq") return renderMcqQuestion(container, q, opts);
    if (q.questionType === "essay") return renderEssayQuestion(container, q, opts);
    return renderShortAnswerQuestion(container, q, opts);
  }

  // ======================================================================
  // تشغيل تسلسل أسئلة (تدرّب / اختبار ذكي / مراجعة سريعة / أسئلة خاطئة)
  // ======================================================================
  function runSequence(container, questions, opts) {
    opts = opts || {};
    const total = questions.length;
    let idx = Math.min(Math.max(opts.startIndex || 0, 0), Math.max(total - 1, 0));
    const results = {}; // index -> true | false | null — إعادة الحساب من الخريطة تمنع العد المضاعف عند التنقل للخلف

    const navRow = el("div", "sequence-nav");
    const prevSlot = el("span", "sequence-prev-slot");
    navRow.appendChild(prevSlot);
    const backBtn = el("button", "qz-btn qz-btn-ghost", "⬅ العودة إلى المجموعة");
    backBtn.addEventListener("click", () => backNav());
    navRow.appendChild(backBtn);

    const progressLine = el("div", "sequence-progress");
    const qBox = el("div");
    container.appendChild(navRow);
    container.appendChild(progressLine);
    container.appendChild(qBox);

    function scoreSummary() {
      const scored = Object.values(results).filter(v => v === true || v === false);
      const correctCount = scored.filter(v => v === true).length;
      return { correctCount, scoredCount: scored.length };
    }

    function renderFinish() {
      clear(prevSlot);
      clear(qBox);
      const { correctCount, scoredCount } = scoreSummary();
      const pct = scoredCount ? Math.round((correctCount / scoredCount) * 100) : null;
      const summary = el("div", "qz-panel qz-panel-good",
        `🎉 أنهيت هذه المجموعة! ${pct !== null ? `نتيجتك: ${correctCount}/${scoredCount} (${pct}%)` : "أحسنت على المحاولة!"}`);
      qBox.appendChild(summary);

      const actions = el("div", "qz-actions");
      const retryBtn = el("button", "qz-btn qz-btn-outline", "🔁 إعادة التدريب");
      retryBtn.addEventListener("click", () => {
        Object.keys(results).forEach(k => delete results[k]);
        idx = 0;
        renderCurrent();
      });
      actions.appendChild(retryBtn);

      const groupBtn = el("button", "qz-btn qz-btn-outline", "⬅ العودة إلى المجموعة");
      groupBtn.addEventListener("click", () => backNav());
      actions.appendChild(groupBtn);

      const homeBtn = el("button", "qz-btn qz-btn-primary", "العودة لبنك الأسئلة");
      homeBtn.addEventListener("click", () => goRoot("bankHome", "📝 الاختبارات التجريبية والوزارية"));
      actions.appendChild(homeBtn);

      qBox.appendChild(actions);
      // أُنهيت المجموعة كاملة — لم يعد هناك ما يُستأنف، فنزيل حالة "أكمل من حيث توقفت" إن وُجدت
      if (opts.mode === "practice" && opts.subcategory) clearLastSession();
      if (opts.onFinish) opts.onFinish(scoreSummary());
    }

    function renderCurrent() {
      progressLine.textContent = `سؤال ${Math.min(idx + 1, total)} من ${total}`;
      if (idx >= total) { renderFinish(); return; }

      // "أكمل من حيث توقفت" (إضافة جديدة) — نحفظ فقط لجلسات التدرّب الكاملة
      // على موضوع فرعي (وليس للأسئلة المفردة أو الاختبارات الذكية العشوائية)
      if (opts.mode === "practice" && opts.subcategory) {
        saveLastSession({
          categoryKey: opts.categoryKey || null,
          subcategory: opts.subcategory,
          currentIndex: idx + 1,
          total,
          updatedAt: new Date().toISOString()
        });
      }

      clear(prevSlot);
      if (idx > 0) {
        const prev = el("button", "qz-btn qz-btn-ghost", "→ السابق");
        prev.addEventListener("click", () => { idx--; renderCurrent(); });
        prevSlot.appendChild(prev);
      }

      renderQuestionAny(qBox, questions[idx], {
        mode: opts.mode,
        onAnswered: (correct) => {
          results[idx] = correct;
          idx++;
          renderCurrent();
        }
      });
    }
    renderCurrent();
  }

  // ======================================================================
  // VIEW: الصفحة الرئيسة لبنك الأسئلة
  // ======================================================================
  function viewHome(container) {
    const meta = QuestionBank.meta();
    const stats = QuestionBank.overallStats();

    const hero = el("div", "hero");
    hero.innerHTML = `<h1>📝 الاختبارات التجريبية والوزارية</h1>
      <p class="hero-sub">${meta.totalQuestions} سؤالًا حقيقيًا من ${meta.sources.length} ملفات اختبار فعلية (الفصل الدراسي الأول)</p>`;
    container.appendChild(hero);

    const statsRow = el("div", "stats-row");
    statsRow.appendChild(el("div", "stat-box", `<strong>${stats.totalQuestions}</strong><span>إجمالي الأسئلة</span>`));
    statsRow.appendChild(el("div", "stat-box", `<strong>${stats.answerableCount}</strong><span>لها إجابة موثّقة</span>`));
    statsRow.appendChild(el("div", "stat-box", `<strong>${stats.attemptedQuestions}</strong><span>تدرّبت عليها</span>`));
    statsRow.appendChild(el("div", "stat-box", `<strong>${stats.accuracy === null ? "—" : stats.accuracy + "%"}</strong><span>دقّتك العامة</span>`));
    container.appendChild(statsRow);

    if (stats.dueCount > 0) {
      const dueBanner = el("button", "daily-banner", `<span>🔁 استرجاع ذكي</span><span>${stats.dueCount} سؤالًا مستحقًا للمراجعة الآن</span>`);
      dueBanner.addEventListener("click", () => {
        const quiz = QuestionBank.getDueQuestions();
        go("bankPractice", "🔁 مراجعة مستحقة", { quiz, mode: "retrieval" });
      });
      container.appendChild(dueBanner);
    }

    const grid = el("div", "dash-grid");
    grid.appendChild(bankDashCard("📚", "جميع الأسئلة", `${meta.totalQuestions} سؤالًا`, () => go("bankCategory", "📚 جميع الأسئلة", { categoryKey: null })));
    meta.categories.forEach(c => {
      grid.appendChild(bankDashCard(c.icon, c.name, `${c.count} سؤالًا`, () => go("bankCategory", `${c.icon} ${c.name}`, { categoryKey: c.key })));
    });
    container.appendChild(grid);

    const toolsGrid = el("div", "dash-grid");
    toolsGrid.appendChild(bankDashCard("🧠", "بناء اختبار ذكي", "مخصَّص حسب الموضوع والصعوبة", () => go("bankQuizSetup", "🧠 بناء اختبار ذكي")));
    toolsGrid.appendChild(bankDashCard("🏛️", "محاكاة اختبار وزاري", "بلا تغذية راجعة فورية + تقرير شامل", () => go("bankSimSetup", "🏛️ محاكاة اختبار وزاري")));
    toolsGrid.appendChild(bankDashCard("⏱️", "مراجعة سريعة", "5 / 10 / 20 دقيقة", () => go("bankQuickReview", "⏱️ مراجعة سريعة")));
    toolsGrid.appendChild(bankDashCard("🔍", "تصفّح وبحث", "كل الأسئلة مع فلاتر متقدّمة", () => go("bankBrowse", "🔍 تصفّح البنك", {})));
    toolsGrid.appendChild(bankDashCard("★", "المحفوظات", `${stats.bookmarkCount} سؤالًا محفوظًا`, () => go("bankBookmarks", "★ الأسئلة المحفوظة")));
    toolsGrid.appendChild(bankDashCard("🎯", "سؤال الـ100%", "أصعب سؤال متاح الآن", () => go("bankHundred", "🎯 سؤال الـ100%")));
    toolsGrid.appendChild(bankDashCard("📅", "سؤال اليوم", "من بنك الأسئلة الحقيقي", () => go("bankDaily", "📅 سؤال اليوم من البنك")));
    toolsGrid.appendChild(bankDashCard("🔬", "مختبر الأخطاء", "راجع أخطاءك السابقة وحلّلها", () => go("bankErrorLab", "🔬 مختبر الأخطاء — بنك الأسئلة")));
    container.appendChild(toolsGrid);

    // بطاقة تدقيق الأسئلة — تظهر فقط في وضع المعلم (window.TEACHER_MODE)،
    // ولا تظهر أبدًا لطالب عادي يتصفّح الموقع بشكل طبيعي.
    if (window.TEACHER_MODE) {
      const adminGrid = el("div", "dash-grid");
      adminGrid.appendChild(bankDashCard("🛠️", "تدقيق الأسئلة (وضع المعلم)", "فحص منطقي لجودة الأسئلة — بلا أي تعديل تلقائي", () => go("bankAudit", "🛠️ تدقيق الأسئلة — وضع المعلم")));
      container.appendChild(adminGrid);
    }
  }

  function bankDashCard(icon, title, desc, onClick) {
    const c = el("button", "dash-card");
    c.innerHTML = `<div class="dash-card-icon">${icon}</div><div class="dash-card-title">${title}</div><div class="dash-card-desc">${desc}</div>`;
    c.addEventListener("click", onClick);
    return c;
  }

  // ======================================================================
  // VIEW: صفحة فئة (تعرض الموضوعات الفرعية الحقيقية + إتقان كل موضوع)
  // ======================================================================
  function viewCategory(container, opts) {
    const categoryKey = opts.categoryKey || null;
    const meta = QuestionBank.meta();
    const subtopics = categoryKey ? QuestionBank.getSubtopics(categoryKey) : null;
    const catMastery = categoryKey ? QuestionBank.computeCategoryMastery(categoryKey) : null;

    if (catMastery && catMastery.hasData) {
      container.appendChild(shell().progressBar ? shell().progressBar(catMastery.overall, "إتقانك في هذه الفئة", "pbar-primary") : el("div"));
    }

    const actionsRow = el("div", "qz-actions");
    const quizBtn = el("button", "qz-btn qz-btn-primary", "🧠 اختبار ذكي في هذه الفئة");
    quizBtn.addEventListener("click", () => go("bankQuizSetup", "🧠 بناء اختبار ذكي", { categoryKey }));
    const browseBtn = el("button", "qz-btn qz-btn-outline", "🔍 تصفّح كل الأسئلة هنا");
    browseBtn.addEventListener("click", () => go("bankBrowse", "🔍 تصفّح", { categoryKey }));
    actionsRow.appendChild(quizBtn); actionsRow.appendChild(browseBtn);
    container.appendChild(actionsRow);

    if (!subtopics) {
      // "جميع الأسئلة": اعرض الفئات الأربع كبطاقات موجزة
      const grid = el("div", "dash-grid");
      meta.categories.forEach(c => {
        grid.appendChild(bankDashCard(c.icon, c.name, `${c.count} سؤالًا`, () => go("bankCategory", `${c.icon} ${c.name}`, { categoryKey: c.key })));
      });
      container.appendChild(grid);
      return;
    }

    container.appendChild(el("h3", null, "الموضوعات الفرعية"));
    const list = el("div", "lesson-list");
    subtopics.forEach(st => {
      const topicMastery = QuestionBank.computeTopicMastery(categoryKey)[st.name];
      const card = el("div", "lesson-item");
      card.innerHTML = `
        <div class="lesson-item-icon">📌</div>
        <div class="lesson-item-body">
          <div class="lesson-item-title">${st.name}</div>
          <div class="lesson-item-meta">${st.count} سؤالًا${topicMastery && topicMastery.pct !== null ? ` · إتقانك: ${topicMastery.pct}%` : ""}</div>
        </div>`;
      card.addEventListener("click", () => go("bankTopic", `📌 ${st.name}`, { categoryKey, subcategory: st.name }));
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  // ======================================================================
  // VIEW: صفحة تفاصيل موضوع فرعي
  // ======================================================================
  function viewTopic(container, opts) {
    const { categoryKey, subcategory } = opts;
    const questions = QuestionBank.filterQuestions({ categoryKey, subcategory });
    const answerable = questions.filter(QuestionBank.isAnswerable);
    const mastery = QuestionBank.computeTopicMastery(categoryKey)[subcategory];

    container.appendChild(el("p", "stage-prompt", `${questions.length} سؤالًا في هذا الموضوع (${answerable.length} منها لها إجابة موثّقة للتدرّب الآلي).`));
    if (mastery && mastery.pct !== null) {
      container.appendChild(shell().progressBar(mastery.pct, "إتقانك في هذا الموضوع", "pbar-skill"));
    }

    const actionsRow = el("div", "qz-actions");
    const practiceBtn = el("button", "qz-btn qz-btn-primary", "تدرّب على هذا الموضوع");
    practiceBtn.addEventListener("click", () => {
      // نمرّر المجموعة الكاملة بترتيبها الأصلي (بلا خلط ولا سقف 15 سؤالًا) لضمان تسلسل 1←2←...←N
      // كامل داخل المجموعة دون العودة لصفحة التصنيف — filterQuestions تحافظ على ترتيب البيانات المصدر.
      go("bankPractice", "تدرّب: " + subcategory, { quiz: questions.slice(), mode: "practice", categoryKey, subcategory });
    });
    actionsRow.appendChild(practiceBtn);
    container.appendChild(actionsRow);

    container.appendChild(el("h3", null, "كل أسئلة هذا الموضوع"));
    renderQuestionListBrowsable(container, questions, questions);
  }

  // ======================================================================
  // VIEW: تدرّب (تشغيل تسلسل أسئلة مُمرَّر عبر opts.quiz)
  // ======================================================================
  function viewPractice(container, opts) {
    const quiz = opts.quiz || [];
    if (!quiz.length) {
      container.appendChild(el("div", "qz-panel qz-panel-info", "لا توجد أسئلة كافية بهذه الفلاتر حاليًا."));
      return;
    }
    runSequence(container, quiz, {
      mode: opts.mode || "practice", startIndex: opts.startIndex || 0,
      categoryKey: opts.categoryKey || null, subcategory: opts.subcategory || null
    });
  }

  // ======================================================================
  // VIEW: إعداد اختبار ذكي
  // ======================================================================
  function viewQuizSetup(container, opts) {
    const categoryKey = opts.categoryKey || null;
    const meta = QuestionBank.meta();
    const card = el("div", "qz-card");
    card.appendChild(el("h3", null, "🧠 بناء اختبار ذكي"));

    const catRow = el("div", "bk-field");
    catRow.appendChild(el("label", null, "الفئة:"));
    const catSelect = el("select", "bk-select");
    catSelect.appendChild(el("option", null, "كل الفئات")).value = "";
    meta.categories.forEach(c => {
      const o = el("option", null, `${c.icon} ${c.name} (${c.count})`);
      o.value = c.key;
      if (c.key === categoryKey) o.selected = true;
      catSelect.appendChild(o);
    });
    catRow.appendChild(catSelect);
    card.appendChild(catRow);

    const diffRow = el("div", "bk-field");
    diffRow.appendChild(el("label", null, "مستوى الصعوبة:"));
    const diffSelect = el("select", "bk-select");
    ["", "سهل", "متوسط", "صعب"].forEach(d => { const o = el("option", null, d || "كل المستويات"); o.value = d; diffSelect.appendChild(o); });
    diffRow.appendChild(diffSelect);
    card.appendChild(diffRow);

    const countRow = el("div", "bk-field");
    countRow.appendChild(el("label", null, "عدد الأسئلة:"));
    const countInput = el("input", "bk-select");
    countInput.type = "number"; countInput.min = "5"; countInput.max = "50"; countInput.value = "10";
    countRow.appendChild(countInput);
    card.appendChild(countRow);

    const startBtn = el("button", "qz-btn qz-btn-primary", "ابدأ الاختبار");
    startBtn.addEventListener("click", () => {
      const quiz = QuestionBank.buildSmartQuiz({
        count: parseInt(countInput.value, 10) || 10,
        categoryKey: catSelect.value || null,
        difficulty: diffSelect.value || null
      });
      go("bankPractice", "🧠 اختبار ذكي", { quiz, mode: "smart-quiz" });
    });
    card.appendChild(startBtn);
    container.appendChild(card);
  }

  // ======================================================================
  // VIEW: مراجعة سريعة
  // ======================================================================
  function viewQuickReview(container) {
    const card = el("div", "qz-card");
    card.appendChild(el("h3", null, "⏱️ مراجعة سريعة"));
    card.appendChild(el("p", "qz-muted", "اختر المدة، وسنبني لك مجموعة أسئلة ذكية (المستحقة أولًا) بحجم مناسب."));
    const row = el("div", "qz-actions");
    [5, 10, 20].forEach(min => {
      const b = el("button", "qz-btn qz-btn-outline", `${min} دقائق`);
      b.addEventListener("click", () => {
        const quiz = QuestionBank.buildQuickReview(min);
        go("bankPractice", `⏱️ مراجعة ${min} دقائق`, { quiz, mode: "quick-review" });
      });
      row.appendChild(b);
    });
    card.appendChild(row);
    container.appendChild(card);
  }

  // ======================================================================
  // VIEW: إعداد محاكاة اختبار وزاري
  // ======================================================================
  function viewSimSetup(container, opts) {
    const categoryKey = opts.categoryKey || null;
    const meta = QuestionBank.meta();
    const card = el("div", "qz-card");
    card.appendChild(el("h3", null, "🏛️ محاكاة اختبار وزاري"));
    card.appendChild(el("div", "qz-panel qz-panel-info", "لن تظهر لك الإجابة الصحيحة بعد كل سؤال — فقط تقرير نهائي شامل بعد الانتهاء، تمامًا كالاختبار الحقيقي."));

    const catRow = el("div", "bk-field");
    catRow.appendChild(el("label", null, "الفئة:"));
    const catSelect = el("select", "bk-select");
    catSelect.appendChild(el("option", null, "كل الفئات")).value = "";
    meta.categories.forEach(c => { const o = el("option", null, `${c.icon} ${c.name}`); o.value = c.key; catSelect.appendChild(o); });
    catRow.appendChild(catSelect);
    card.appendChild(catRow);

    const countRow = el("div", "bk-field");
    countRow.appendChild(el("label", null, "عدد الأسئلة:"));
    const countInput = el("input", "bk-select");
    countInput.type = "number"; countInput.min = "5"; countInput.max = "40"; countInput.value = "20";
    countRow.appendChild(countInput);
    card.appendChild(countRow);

    const startBtn = el("button", "qz-btn qz-btn-primary", "ابدأ المحاكاة");
    startBtn.addEventListener("click", () => {
      const quiz = QuestionBank.buildSimulation({ count: parseInt(countInput.value, 10) || 20, categoryKey: catSelect.value || null });
      go("bankSimRun", "🏛️ محاكاة اختبار وزاري", { quiz, categoryKey: catSelect.value || null });
    });
    card.appendChild(startBtn);
    container.appendChild(card);
  }

  // ======================================================================
  // VIEW: تشغيل المحاكاة (بلا تغذية راجعة فورية)
  // ======================================================================
  function viewSimRun(container, opts) {
    const quiz = opts.quiz || [];
    if (!quiz.length) { container.appendChild(el("div", "qz-panel qz-panel-info", "لا توجد أسئلة كافية.")); return; }
    let idx = 0;
    const answers = {}; // qid -> chosenIndex (mcq) | text (short) | true(essay attempted)
    const progressLine = el("div", "sequence-progress");
    const qBox = el("div");
    container.appendChild(progressLine); container.appendChild(qBox);

    function renderCurrent() {
      progressLine.textContent = `سؤال ${idx + 1} من ${quiz.length} — بلا تصحيح فوري`;
      clear(qBox);
      const q = quiz[idx];
      const card = el("div", "qz-card");
      card.appendChild(questionMetaRow(q));
      if (q.context) card.appendChild(el("div", "bk-context-box", q.context.replace(/\n/g, "<br>")));
      card.appendChild(el("p", "qz-stem", q.question.replace(/\n/g, "<br>")));

      if (q.questionType === "mcq") {
        const optsWrap = el("div", "qz-options");
        q.choices.forEach((c, i) => {
          const b = el("button", "qz-option" + (answers[q.id] === i ? " qz-selected" : ""), c);
          b.addEventListener("click", () => { answers[q.id] = i; renderCurrent(); });
          optsWrap.appendChild(b);
        });
        card.appendChild(optsWrap);
      } else {
        const ta = el("textarea", "qz-textarea");
        ta.rows = 3; ta.placeholder = "اكتب إجابتك...";
        ta.value = answers[q.id] || "";
        ta.addEventListener("input", () => { answers[q.id] = ta.value; });
        card.appendChild(ta);
      }
      const nav = el("div", "qz-actions");
      if (idx > 0) { const prev = el("button", "qz-btn qz-btn-ghost", "→ السابق"); prev.addEventListener("click", () => { idx--; renderCurrent(); }); nav.appendChild(prev); }
      const nextLabel = idx === quiz.length - 1 ? "إنهاء وعرض التقرير" : "التالي ←";
      const next = el("button", "qz-btn qz-btn-primary", nextLabel);
      next.addEventListener("click", () => {
        if (idx === quiz.length - 1) { go("bankSimSelfMark", "مراجعة وتصحيح", { quiz, answers, categoryKey: opts.categoryKey }); }
        else { idx++; renderCurrent(); }
      });
      nav.appendChild(next);
      card.appendChild(nav);
      qBox.appendChild(card);
    }
    renderCurrent();
  }

  // ======================================================================
  // VIEW: تصحيح المحاكاة — آلي للاختيار من متعدد، تقييم ذاتي للإجابات المفتوحة
  // ======================================================================
  function viewSimSelfMark(container, opts) {
    const { quiz, answers, categoryKey } = opts;
    const correctness = {};
    let idx = 0;

    quiz.forEach(q => {
      if (q.questionType === "mcq") correctness[q.id] = (answers[q.id] === q.correctAnswer);
    });
    const toSelfMark = quiz.filter(q => q.questionType === "short_answer" && QuestionBank.isAnswerable(q));

    if (!toSelfMark.length) {
      finish();
      return;
    }
    container.appendChild(el("div", "qz-panel qz-panel-info", `بقي ${toSelfMark.length} سؤالًا مفتوحًا لتقيّمه بنفسك مقابل النموذج، ثم ستظهر النتيجة النهائية.`));
    const qBox = el("div");
    container.appendChild(qBox);

    function renderNext() {
      if (idx >= toSelfMark.length) { finish(); return; }
      const q = toSelfMark[idx];
      clear(qBox);
      const card = el("div", "qz-card");
      card.appendChild(el("p", "qz-stem", q.question.replace(/\n/g, "<br>")));
      card.appendChild(el("div", "qz-panel qz-panel-info", "إجابتك: " + (answers[q.id] ? answers[q.id] : "(لم تكتب شيئًا)")));
      card.appendChild(el("div", "qz-model-answer", "<strong>النموذج:</strong><br>" + q.correctAnswer.replace(/\n/g, "<br>")));
      const row = el("div", "qz-actions");
      const okBtn = el("button", "qz-btn qz-btn-primary", "✅ كانت صحيحة");
      const noBtn = el("button", "qz-btn qz-btn-ghost", "❌ كانت خاطئة");
      okBtn.addEventListener("click", () => { correctness[q.id] = true; idx++; renderNext(); });
      noBtn.addEventListener("click", () => { correctness[q.id] = false; idx++; renderNext(); });
      row.appendChild(okBtn); row.appendChild(noBtn);
      card.appendChild(row);
      qBox.appendChild(card);
    }
    renderNext();

    function finish() {
      const report = QuestionBank.gradeSimulation(quiz, correctness, categoryKey);
      refreshChips();
      goRoot("bankSimReport", "📊 تقرير المحاكاة", { report });
    }
  }

  // ======================================================================
  // VIEW: تقرير المحاكاة النهائي
  // ======================================================================
  function viewSimReport(container, opts) {
    const r = opts.report;
    const wrap = el("div", "mastery-score-screen");
    wrap.appendChild(el("div", "mastery-big-score", r.overall === null ? "—" : r.overall + "%"));
    wrap.appendChild(el("div", "mastery-big-label", `النتيجة النهائية (${r.correct}/${r.scoredQuestions} مُصحَّح آليًا وذاتيًا)`));
    if (r.excludedCount) wrap.appendChild(el("p", "qz-muted", `${r.excludedCount} سؤالًا إنشائيًا استُبعد من الاحتساب (لا إجابة واحدة صحيحة بطبيعته).`));
    container.appendChild(wrap);

    container.appendChild(el("h3", null, "تحليل نقاط الضعف حسب الموضوع"));
    const sorted = Object.entries(r.byTopic).sort((a, b) => a[1].pct - b[1].pct);
    sorted.forEach(([topic, v]) => {
      container.appendChild(shell().progressBar(v.pct, `${topic} (${v.correct}/${v.total})`, v.pct < 60 ? "pbar-skill" : "pbar-primary"));
    });

    if (r.wrongIds.length) {
      const reviewBtn = el("button", "qz-btn qz-btn-outline", "🔬 راجع أسئلتك الخاطئة في مختبر الأخطاء");
      reviewBtn.addEventListener("click", () => go("bankErrorLab", "🔬 مختبر الأخطاء", { ids: r.wrongIds }));
      container.appendChild(reviewBtn);
    }
    const homeBtn = el("button", "qz-btn qz-btn-primary", "العودة لبنك الأسئلة");
    homeBtn.addEventListener("click", () => goRoot("bankHome", "📝 الاختبارات التجريبية والوزارية"));
    container.appendChild(homeBtn);
  }

  // ======================================================================
  // VIEW: مختبر الأخطاء (بنك الأسئلة) — مراجعة الأسئلة المُخطأ فيها وتحليلها
  // ======================================================================
  function viewErrorLab(container, opts) {
    const ids = opts && opts.ids;
    const wrong = ids ? ids.map(QuestionBank.byId).filter(Boolean) : QuestionBank.getWrongQuestions();
    if (!wrong.length) {
      container.appendChild(el("div", "qz-panel qz-panel-good", "🎉 لا توجد أخطاء مسجَّلة حاليًا في بنك الأسئلة — واصل التدرّب!"));
      return;
    }
    container.appendChild(el("p", "stage-prompt", `${wrong.length} سؤالًا أخطأت فيه سابقًا. راجع كل حالة وحلّل سبب الخطأ.`));
    wrong.forEach(q => {
      const card = el("div", "qz-card");
      card.appendChild(questionMetaRow(q));
      card.appendChild(el("p", "qz-stem", q.question.replace(/\n/g, "<br>")));
      if (q.questionType === "mcq") {
        const list = el("div", "qz-options");
        q.choices.forEach((c, i) => {
          const cls = i === q.correctAnswer ? "qz-option qz-correct" : "qz-option";
          const o = el("div", cls, c); o.style.pointerEvents = "none"; list.appendChild(o);
        });
        card.appendChild(list);
        card.appendChild(el("div", "qz-panel qz-panel-good", `الإجابة الصحيحة: «${q.choices[q.correctAnswer]}»`));
      } else if (QuestionBank.isAnswerable(q)) {
        card.appendChild(el("div", "qz-model-answer", "<strong>النموذج:</strong><br>" + q.correctAnswer.replace(/\n/g, "<br>")));
      }
      card.appendChild(questionSourceFooter(q));
      container.appendChild(card);
    });
  }

  // ======================================================================
  // VIEW: المحفوظات
  // ======================================================================
  function viewBookmarks(container) {
    const qs = QuestionBank.getBookmarked();
    if (!qs.length) { container.appendChild(el("div", "qz-panel qz-panel-info", "لم تحفظ أي سؤال بعد — اضغط «☆ حفظ» تحت أي سؤال لإضافته هنا.")); return; }
    const practiceBtn = el("button", "qz-btn qz-btn-primary", "تدرّب على المحفوظات");
    practiceBtn.addEventListener("click", () => go("bankPractice", "★ المحفوظات", { quiz: qs, mode: "bookmarks" }));
    container.appendChild(practiceBtn);
    renderQuestionListBrowsable(container, qs, qs);
  }

  // ======================================================================
  // VIEW: سؤال اليوم من البنك
  // ======================================================================
  function viewDaily(container) {
    if (QuestionBank.dailyBankDoneToday()) {
      container.appendChild(el("div", "qz-panel qz-panel-good", "✅ أنجزت سؤال اليوم من بنك الأسئلة بالفعل — عد غدًا لسؤال جديد."));
      return;
    }
    const q = QuestionBank.getDailyBankQuestion();
    if (!q) { container.appendChild(el("div", "qz-panel qz-panel-info", "لا تتوفر أسئلة مجابة كافية بعد.")); return; }
    renderQuestionAny(container, q, {
      mode: "daily",
      onAnswered: (correct) => {
        QuestionBank.recordDailyBank(q.id, correct);
        container.appendChild(el("div", "qz-panel qz-panel-good", "تم تسجيل سؤال اليوم! عد غدًا لسؤال جديد."));
      }
    });
  }

  // ======================================================================
  // VIEW: سؤال الـ100%
  // ======================================================================
  function viewHundred(container) {
    const q = QuestionBank.getHundredPercentQuestion();
    if (!q) { container.appendChild(el("div", "qz-panel qz-panel-info", "لا تتوفر أسئلة صعبة مجابة كافية بعد.")); return; }
    container.appendChild(el("div", "elite-gate", `<div class="elite-icon">🎯</div><h2>سؤال الـ100%</h2><p class="qz-muted">من أصعب أسئلة البنك المتاحة فعليًا — بلا تخمين ولا اختلاق: كل معلومة هنا موثّقة من مصدرها.</p>`));
    renderQuestionAny(container, q, { mode: "hundred", onAnswered: () => {} });
  }

  // ======================================================================
  // تصفّح + بحث + فلاتر متقدّمة (مع تحميل تدريجي لحماية الأداء)
  // ======================================================================
  function viewBrowse(container, opts) {
    const state = {
      categoryKey: opts.categoryKey || "", subcategory: "", sourceType: "", difficulty: "",
      questionType: "", search: "", onlyNeedsReview: false, onlyBookmarked: false,
      onlyWrong: false, onlyUnanswered: false, visibleCount: PAGE_SIZE
    };
    const meta = QuestionBank.meta();

    const filtersBox = el("div", "bk-filters");
    const searchInput = el("input", "bk-select");
    searchInput.type = "search"; searchInput.placeholder = "ابحث في نص السؤال أو الموضوع...";
    searchInput.addEventListener("input", () => { state.search = searchInput.value; state.visibleCount = PAGE_SIZE; renderResults(); });
    filtersBox.appendChild(searchInput);

    function makeSelect(labelAll, options, onChange, currentVal) {
      const s = el("select", "bk-select");
      const optAll = el("option", null, labelAll); optAll.value = ""; s.appendChild(optAll);
      options.forEach(([val, label]) => { const o = el("option", null, label); o.value = val; if (val === currentVal) o.selected = true; s.appendChild(o); });
      s.addEventListener("change", () => { onChange(s.value); state.visibleCount = PAGE_SIZE; renderResults(); });
      return s;
    }

    const catSelect = makeSelect("كل الفئات", meta.categories.map(c => [c.key, `${c.icon} ${c.name}`]), v => { state.categoryKey = v; state.subcategory = ""; renderResults(); rebuildSubtopicSelect(); }, state.categoryKey);
    filtersBox.appendChild(catSelect);

    const subtopicSlot = el("div");
    filtersBox.appendChild(subtopicSlot);
    function rebuildSubtopicSelect() {
      clear(subtopicSlot);
      if (!state.categoryKey) return;
      const subs = QuestionBank.getSubtopics(state.categoryKey);
      const sSel = makeSelect("كل الموضوعات", subs.map(s => [s.name, `${s.name} (${s.count})`]), v => { state.subcategory = v; }, state.subcategory);
      subtopicSlot.appendChild(sSel);
    }
    rebuildSubtopicSelect();

    filtersBox.appendChild(makeSelect("كل مصادر الأسئلة", [["وزاري", "وزاري"], ["تجريبي", "تجريبي"]], v => state.sourceType = v));
    filtersBox.appendChild(makeSelect("كل مستويات الصعوبة", [["سهل", "سهل"], ["متوسط", "متوسط"], ["صعب", "صعب"]], v => state.difficulty = v));
    filtersBox.appendChild(makeSelect("كل أنواع الأسئلة", [["mcq", "اختيار من متعدد"], ["short_answer", "إجابة قصيرة"], ["essay", "إنشائي"]], v => state.questionType = v));

    const toggles = el("div", "bk-toggle-row");
    function makeToggle(label, key) {
      const b = el("button", "qz-btn qz-btn-outline bk-toggle-btn", label);
      b.addEventListener("click", () => { state[key] = !state[key]; b.classList.toggle("active", state[key]); state.visibleCount = PAGE_SIZE; renderResults(); });
      toggles.appendChild(b);
    }
    makeToggle("أخطأت فيها", "onlyWrong");
    makeToggle("لم أجرّبها", "onlyUnanswered");
    makeToggle("محفوظة", "onlyBookmarked");
    makeToggle("بحاجة لمراجعة المعلم", "onlyNeedsReview");
    filtersBox.appendChild(toggles);

    container.appendChild(filtersBox);
    const countLine = el("p", "qz-muted");
    container.appendChild(countLine);
    const resultsBox = el("div");
    container.appendChild(resultsBox);
    const loadMoreBtn = el("button", "qz-btn qz-btn-ghost", "تحميل المزيد");
    loadMoreBtn.addEventListener("click", () => { state.visibleCount += PAGE_SIZE; renderResults(); });
    container.appendChild(loadMoreBtn);

    function renderResults() {
      const all = QuestionBank.filterQuestions({
        categoryKey: state.categoryKey || null, subcategory: state.subcategory || null,
        sourceType: state.sourceType || null, difficulty: state.difficulty || null,
        questionType: state.questionType || null, search: state.search,
        onlyNeedsReview: state.onlyNeedsReview || null, onlyBookmarked: state.onlyBookmarked || null,
        onlyWrong: state.onlyWrong || null, onlyUnanswered: state.onlyUnanswered || null
      });
      countLine.textContent = `${all.length} نتيجة`;
      clear(resultsBox);
      renderQuestionListBrowsable(resultsBox, all.slice(0, state.visibleCount), all);
      loadMoreBtn.classList.toggle("hidden", all.length <= state.visibleCount);
    }
    renderResults();
  }

  // fullList: قائمة التسلسل الكاملة التي يجب أن يتنقل الطالب خلالها بالترتيب (تدرّج) —
  // إن لم تُمرَّر نستخدم "questions" نفسها؛ فتح أي سؤال يبدأ من موضعه الحقيقي داخل fullList
  // بدل فتح مصفوفة بعنصر واحد فقط (وهو سبب رجوع الطالب لصفحة التصنيف بعد كل سؤال).
  function renderQuestionListBrowsable(container, questions, fullList) {
    const seqList = fullList || questions;
    questions.forEach(q => {
      const card = el("div", "bk-browse-item");
      card.appendChild(questionMetaRow(q));
      card.appendChild(el("p", "bk-browse-stem", (q.question || "").slice(0, 160).replace(/\n/g, " ") + (q.question.length > 160 ? "…" : "")));
      const row = el("div", "qz-actions");
      const openBtn = el("button", "qz-btn qz-btn-outline", "فتح السؤال");
      openBtn.addEventListener("click", () => {
        const startIndex = Math.max(seqList.indexOf(q), 0);
        go("bankPractice", "سؤال", { quiz: seqList.slice(), startIndex, mode: "single" });
      });
      row.appendChild(openBtn);
      row.appendChild(bookmarkButton(q));
      card.appendChild(row);
      container.appendChild(card);
    });
  }

  return {
    viewHome, viewCategory, viewTopic, viewPractice, viewQuizSetup, viewQuickReview,
    viewSimSetup, viewSimRun, viewSimSelfMark, viewSimReport, viewErrorLab,
    viewBookmarks, viewDaily, viewHundred, viewBrowse,
    getLastSession, clearLastSession
  };
})();
