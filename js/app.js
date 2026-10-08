/* ==========================================================================
   app.js — التوجيه (Router) وربط الواجهة بمحركات المحتوى والتقدم
   ========================================================================== */

(function () {
  const main = document.getElementById("app-main");
  const backBtn = document.getElementById("back-btn");
  const headerTitle = document.getElementById("header-title");
  const xpChip = document.getElementById("xp-chip");
  const streakChip = document.getElementById("streak-chip");

  // ======================================================================
  // إدارة «الدرس الحالي» — يدعم عدد غير محدود من الدروس
  // ======================================================================
  const CURRENT_LESSON_KEY = "arabic12_current_lesson_id";
  const sortedLessons = () => [...ARABIC12_DATA.lessons].sort((a, b) => a.order - b.order);

  function getCurrentLesson() {
    const savedId = localStorage.getItem(CURRENT_LESSON_KEY);
    const found = savedId && ARABIC12_DATA.lessons.find(l => l.id === savedId);
    return found || sortedLessons()[0];
  }
  function setCurrentLesson(id) {
    try { localStorage.setItem(CURRENT_LESSON_KEY, id); } catch (e) { /* ignore */ }
  }
  function nextLessonAfter(lesson) {
    const list = sortedLessons();
    const idx = list.findIndex(l => l.id === lesson.id);
    return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  }

  let viewStack = [];

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function clear(c) { c.innerHTML = ""; }
  function scrollTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  function refreshChips() {
    const st = Progress.getState();
    xpChip.textContent = `⭐ ${st.xp} XP`;
    streakChip.textContent = `🔥 ${st.streak.count} يوم`;
  }

  function go(view, title, opts) {
    viewStack.push({ view, title, opts });
    render(view, title, opts);
  }
  function goRoot(view, title, opts) {
    viewStack = [{ view, title, opts }];
    render(view, title, opts);
  }
  function back() {
    if (viewStack.length > 1) {
      viewStack.pop();
      const top = viewStack[viewStack.length - 1];
      render(top.view, top.title, top.opts);
    }
  }
  backBtn.addEventListener("click", back);

  function render(view, title, opts) {
    clear(main);
    headerTitle.textContent = title || ARABIC12_DATA.meta.systemTitle;
    backBtn.classList.toggle("hidden", viewStack.length <= 1);
    refreshChips();
    scrollTop();
    VIEWS[view](main, opts || {});
  }

  // ======================================================================
  // بطاقة عرض عامة (Card component helper)
  // ======================================================================
  function dashboardCard({ icon, title, desc, onClick, badge }) {
    const c = el("button", "dash-card");
    c.innerHTML = `
      <div class="dash-card-icon">${icon}</div>
      <div class="dash-card-title">${title}</div>
      <div class="dash-card-desc">${desc}</div>
      ${badge ? `<div class="dash-card-badge">${badge}</div>` : ""}
    `;
    c.addEventListener("click", onClick);
    return c;
  }

  function progressBar(pct, label, colorClass) {
    const wrap = el("div", "pbar-wrap");
    wrap.innerHTML = `
      <div class="pbar-label"><span>${label}</span><span>${pct === null ? "—" : pct + "%"}</span></div>
      <div class="pbar-track"><div class="pbar-fill ${colorClass || ""}" style="width:${pct || 0}%"></div></div>`;
    return wrap;
  }

  // ======================================================================
  // VIEW: Dashboard
  // ======================================================================
  function viewDashboard(container) {
    const st = Progress.getState();
    const current = getCurrentLesson();
    const mastery = Progress.computeMastery(current.id);

    if (!st.studentName) {
      const nameCard = el("div", "namecard");
      nameCard.innerHTML = `
        <p>👋 أهلًا بك! ما اسمك؟ <span class="qz-muted">(اختياري — لتخصيص تجربتك فقط، يُحفظ على جهازك فقط)</span></p>`;
      const row = el("div", "namecard-row");
      const input = el("input", "namecard-input");
      input.placeholder = "اسمك هنا...";
      input.type = "text";
      const btn = el("button", "qz-btn qz-btn-primary", "حفظ");
      btn.addEventListener("click", () => {
        if (input.value.trim()) { Progress.setStudentName(input.value.trim()); render("dashboard", ARABIC12_DATA.meta.systemTitle); }
      });
      row.appendChild(input); row.appendChild(btn);
      nameCard.appendChild(row);
      container.appendChild(nameCard);
    } else {
      container.appendChild(el("p", "welcome-line", `أهلًا بعودتك، ${st.studentName} 👋`));
    }

    const hero = el("div", "hero");
    hero.innerHTML = `
      <h1>${ARABIC12_DATA.meta.systemTitle}</h1>
      <p class="hero-sub">${ARABIC12_DATA.meta.subjectLine}</p>
      <p class="hero-teacher">إعداد المعلم: ${ARABIC12_DATA.meta.teacher}</p>`;
    container.appendChild(hero);

    // شريط حالة الحساب/التجربة المجانية/الاشتراك (إضافة جديدة — المرحلة
    // الثانية التجارية). خامل تمامًا ولا يظهر أي شيء إن لم يكن الطالب مسجَّل
    // الدخول بحساب حقيقي عبر Supabase — لا يؤثر على تجربة الضيف المحلية.
    if (typeof PlatformUI !== "undefined" && PlatformUI.renderStatusBanner) {
      PlatformUI.renderStatusBanner(container, go);
    }

    // رابط صغير وغير ملفت لصفحة "عن المنصة" (إضافة جديدة) — نص بسيط لا بطاقة
    // كبيرة، حفاظًا على بساطة الصفحة الرئيسية وعدم إضافة ازدحام بصري.
    const aboutLink = el("button", "about-link", "ℹ️ عن المنصة والتواصل مع المعلم");
    aboutLink.addEventListener("click", () => go("about", "ℹ️ عن المنصة"));
    container.appendChild(aboutLink);

    // رابط "حسابي واشتراكي" (إضافة جديدة — المرحلة الثانية) — يظهر فقط لحساب
    // حقيقي مسجَّل الدخول، بنفس الأسلوب البصري لرابط "عن المنصة" أعلاه بالضبط.
    if (typeof PlatformUI !== "undefined" && PlatformUI.renderAccountLink) {
      PlatformUI.renderAccountLink(container, go);
    }

    // شريط الدرس الحالي — قابل للتبديل
    const currentLessonBar = el("button", "current-lesson-bar");
    currentLessonBar.innerHTML = `<span>${current.icon} الدرس الحالي: <strong>${current.title}</strong></span><span class="switch-lesson-link">تبديل الدرس ↺</span>`;
    currentLessonBar.addEventListener("click", () => go("lessons", "📚 دروسي"));
    container.appendChild(currentLessonBar);

    if (mastery.hasData) {
      container.appendChild(progressBar(mastery.overall, `إتقانك في «${current.title}»`, "pbar-primary"));
    }

    // ==================================================================
    // "أكمل من حيث توقفت" (إضافة جديدة) — إن كان الطالب قد بدأ تدرّبًا على
    // موضوع فرعي في بنك الأسئلة الوزارية ولم ينهه، تظهر هذه البطاقة ليكمل
    // مباشرة من نفس السؤال دون البحث عن مكان توقفه. تُستخدم بيانات موجودة
    // فعليًا (QuestionBank.filterQuestions) ولا تُضيف أي محتوى جديد.
    // ==================================================================
    if (typeof QBankUI !== "undefined" && typeof QuestionBank !== "undefined" && QBankUI.getLastSession) {
      const lastSession = QBankUI.getLastSession();
      if (lastSession) {
        const resumeBanner = el("button", "daily-banner resume-banner");
        resumeBanner.innerHTML = `<span>🎯 أكمل تدريبك</span><span>${lastSession.subcategory} — السؤال ${lastSession.currentIndex} من ${lastSession.total} · متابعة التدريب ←</span>`;
        resumeBanner.addEventListener("click", () => {
          const quiz = QuestionBank.filterQuestions({ categoryKey: lastSession.categoryKey, subcategory: lastSession.subcategory });
          go("bankPractice", "تدرّب: " + lastSession.subcategory, {
            quiz, mode: "practice",
            categoryKey: lastSession.categoryKey, subcategory: lastSession.subcategory,
            startIndex: Math.min(Math.max(lastSession.currentIndex - 1, 0), Math.max(quiz.length - 1, 0))
          });
        });
        container.appendChild(resumeBanner);
      }
    }

    // بطاقة التحدي اليومي
    const dailyBanner = el("button", "daily-banner");
    const today = Progress.todayStr();
    const doneToday = st.dailyChallenge.lastDate === today;
    dailyBanner.innerHTML = `<span>📅 التحدي اليومي</span><span>${doneToday ? "✅ أُنجز اليوم" : "سؤال واحد اليوم — هل تقبل التحدي؟"}</span>`;
    dailyBanner.addEventListener("click", () => go("daily", "📅 التحدي اليومي"));
    container.appendChild(dailyBanner);

    // ==================================================================
    // تنظيم بصري (إضافة جديدة — بدون حذف أو حذف أي أداة): نفس البطاقات
    // والأدوات الموجودة تمامًا، مُجمَّعة فقط تحت عناوين أقسام واضحة بدل
    // شبكة واحدة طويلة، لتقليل الازدحام البصري وتحسين وضوح "ماذا أفعل الآن؟"
    // دون أي تغيير في أسماء الأدوات أو وجهاتها (onClick) أو حذف أي منها.
    // ==================================================================
    container.appendChild(el("h3", "dash-section-title", "📚 التعلّم"));
    const learnGrid = el("div", "dash-grid");
    learnGrid.appendChild(dashboardCard({
      icon: "📚", title: "دروسي", desc: `${ARABIC12_DATA.lessons.length} درسًا متاحًا.`,
      onClick: () => go("lessons", "📚 دروسي")
    }));
    learnGrid.appendChild(dashboardCard({
      icon: "🧠", title: "افهم", desc: "التعلّم والاستكشاف (يشمل الخريطة الذهنية).",
      onClick: () => go("lessonHub", current.title, { lessonId: current.id, tab: "understand" })
    }));
    container.appendChild(learnGrid);

    container.appendChild(el("h3", "dash-section-title", "🎯 التدريب"));
    const trainGrid = el("div", "dash-grid");
    trainGrid.appendChild(dashboardCard({
      icon: "🎯", title: "تحدي 100%", desc: "اختبار الإتقان.",
      onClick: () => go("challenge100", "🎯 تحدي 100%")
    }));
    trainGrid.appendChild(dashboardCard({
      icon: "🕵️", title: "مصائد الاختبار", desc: "التدرب على الأسئلة الملتبسة.",
      onClick: () => go("traps", "🕵️ مصائد الاختبار")
    }));
    // بطاقة بنك الأسئلة التجريبية والوزارية (إضافة سابقة — لا تُعدّل، تُنقل هنا
    // بصريًا فقط لتُجاور بقية أدوات "التدريب" ضمن إعادة التنظيم البصري)
    if (typeof QuestionBank !== "undefined" && typeof QBankUI !== "undefined") {
      const bankMeta = QuestionBank.meta();
      trainGrid.appendChild(dashboardCard({
        icon: "📝", title: "الأسئلة الوزارية والتجريبية",
        desc: `${bankMeta.totalQuestions} سؤالًا حقيقيًا من اختبارات فعلية.`,
        onClick: () => go("bankHome", "📝 الاختبارات التجريبية والوزارية")
      }));
    }
    container.appendChild(trainGrid);

    container.appendChild(el("h3", "dash-section-title", "🧠 أدوات التعلّم الذكي"));
    const smartGrid = el("div", "dash-grid");
    smartGrid.appendChild(dashboardCard({
      icon: "🔬", title: "مختبر الأخطاء", desc: "تحليل الأخطاء.",
      onClick: () => go("errorlab", "🔬 مختبر الأخطاء")
    }));
    smartGrid.appendChild(dashboardCard({
      icon: "🔁", title: "استرجاع ذكي", desc: "مراجعة متباعدة.",
      onClick: () => go("retrieval", "🔁 استرجاع ذكي")
    }));
    container.appendChild(smartGrid);

    container.appendChild(el("h3", "dash-section-title", "🏆 تقدّمي"));
    const progressGrid = el("div", "dash-grid");
    progressGrid.appendChild(dashboardCard({
      icon: "🏆", title: "تقدّمي", desc: "متابعة مستوى الإتقان.",
      onClick: () => go("myprogress", "🏆 تقدّمي")
    }));
    container.appendChild(progressGrid);

    const eliteBtn = el("button", "elite-banner", "⭐ Elite Mode — هل أنت مستعد للسؤال الأصعب؟");
    eliteBtn.addEventListener("click", () => go("elite", "⭐ Elite Mode"));
    container.appendChild(eliteBtn);
  }

  // ======================================================================
  // VIEW: قائمة الدروس
  // ======================================================================
  function viewLessons(container) {
    const wrap = el("div", "lesson-list");
    const current = getCurrentLesson();
    sortedLessons().forEach(l => {
      const m = Progress.computeMastery(l.id);
      const statusHtml = l.status === "done"
        ? (m.hasData ? `<div class="lesson-item-status lesson-status-done">${m.overall}% إتقان</div>` : `<div class="lesson-item-status lesson-status-done">✅ متاح</div>`)
        : `<div class="lesson-item-status lesson-status-pending">⏳ قيد الانتظار</div>`;
      const card = el("div", "lesson-item" + (l.id === current.id ? " lesson-item-current" : ""));
      card.innerHTML = `
        <div class="lesson-item-icon">${l.icon}</div>
        <div class="lesson-item-body">
          <div class="lesson-item-title">${l.title} <span class="qz-muted">— ${l.subtitle}</span></div>
          <div class="lesson-item-meta">${l.unit} · ${l.domain} · ${l.week}</div>
        </div>
        ${statusHtml}`;
      card.addEventListener("click", () => {
        if (l.status !== "done") return;
        setCurrentLesson(l.id);
        go("lessonHub", l.title, { lessonId: l.id, tab: "discover" });
      });
      wrap.appendChild(card);
    });
    container.appendChild(wrap);
  }

  // ======================================================================
  // VIEW: مركز الدرس (Discover / Understand / Practice + روابط فرعية)
  // ======================================================================
  function viewLessonHub(container, opts) {
    const lesson = ARABIC12_DATA.lessons.find(l => l.id === opts.lessonId) || getCurrentLesson();
    setCurrentLesson(lesson.id);
    const tabs = [
      { key: "diagnostic", label: "🧪 تشخيص" },
      { key: "discover", label: "1️⃣ اكتشف" },
      { key: "understand", label: "2️⃣ افهم" },
      { key: "practice", label: "3️⃣ جرّب" },
      { key: "whatif", label: "🔄 ماذا لو" },
      { key: "teachit", label: "🧠 اشرح لي" },
      { key: "mindmap", label: "🗺️ الخريطة الذهنية" }
    ];
    const tabBar = el("div", "tabbar");
    const body = el("div", "tab-body");
    let active = opts.tab || "discover";

    function renderTab() {
      clear(body);
      [...tabBar.children].forEach(b => b.classList.toggle("active", b.dataset.key === active));
      if (active === "diagnostic") renderDiagnostic(body, lesson);
      if (active === "discover") renderDiscover(body, lesson);
      if (active === "understand") renderUnderstand(body, lesson);
      if (active === "practice") renderPracticeSequence(body, lesson);
      if (active === "whatif") renderWhatIfList(body, lesson);
      if (active === "teachit") renderTeachItList(body, lesson);
      if (active === "mindmap") renderMindMapTabs(body, lesson);
    }

    tabs.forEach(t => {
      const b = el("button", "tabbar-btn", t.label);
      b.dataset.key = t.key;
      b.addEventListener("click", () => { active = t.key; renderTab(); scrollTop(); });
      tabBar.appendChild(b);
    });

    container.appendChild(tabBar);
    container.appendChild(body);
    renderTab();

    const nextLesson = nextLessonAfter(lesson);
    if (nextLesson && nextLesson.status === "done") {
      const nextBar = el("button", "next-lesson-bar", `الدرس التالي: ${nextLesson.icon} ${nextLesson.title} ←`);
      nextBar.addEventListener("click", () => { setCurrentLesson(nextLesson.id); go("lessonHub", nextLesson.title, { lessonId: nextLesson.id, tab: "discover" }); });
      container.appendChild(nextBar);
    }
  }

  function renderDiscover(container, lesson) {
    const d = lesson.discover;
    container.appendChild(el("p", "stage-prompt", d.prompt));
    const list = el("div", "discover-list");
    d.items.forEach(it => {
      const row = el("div", "discover-item");
      row.innerHTML = `<span class="discover-text">${it.text}</span>`;
      const tagBtn = el("button", "qz-btn qz-btn-outline discover-tagbtn", "ما نوعها؟");
      const revealed = el("span", "discover-tag hidden", `${it.tag} — ${it.note}`);
      tagBtn.addEventListener("click", () => { revealed.classList.remove("hidden"); tagBtn.classList.add("hidden"); });
      row.appendChild(tagBtn);
      row.appendChild(revealed);
      list.appendChild(row);
    });
    container.appendChild(list);

    const qBox = el("div", "discover-questions");
    qBox.innerHTML = `<strong>فكّر:</strong><ul>${d.questions.map(q => `<li>${q}</li>`).join("")}</ul>`;
    container.appendChild(qBox);

    const revealBtn = el("button", "qz-btn qz-btn-primary", "اكشف الفكرة الجامعة →");
    const revealBox = el("div", "qz-panel qz-panel-good hidden");
    revealBox.textContent = d.reveal;
    revealBtn.addEventListener("click", () => { revealBox.classList.remove("hidden"); revealBtn.disabled = true; });
    container.appendChild(revealBtn);
    container.appendChild(revealBox);
  }

  function renderConceptBody(concept) {
    const box = el("div", "concept-body");
    if (concept.type === "cards") {
      box.appendChild(el("p", "concept-summary", concept.summary));
      const pts = el("div", "concept-points");
      (concept.points || []).forEach(p => pts.appendChild(el("div", "concept-point", `<strong>${p.label}</strong><span>${p.detail}</span>`)));
      box.appendChild(pts);
      if (concept.note) box.appendChild(el("p", "concept-note", "🔹 " + concept.note));
      if (concept.bridge) box.appendChild(el("p", "concept-note", "🔗 " + concept.bridge));
      if (concept.example) {
        const ex = concept.example;
        let bd = "";
        if (ex.breakdown) bd = `<div class="example-breakdown">${Object.entries(ex.breakdown).map(([k, v]) => `<span><b>${k}</b>: ${v}</span>`).join("")}</div>`;
        box.appendChild(el("div", "example-box", `<div class="example-text">«${ex.text}»</div>${bd}`));
      }
    } else if (concept.type === "tabs") {
      const tabHead = el("div", "mini-tabs");
      const tabBody = el("div", "mini-tab-body");
      concept.tabs.forEach((t, i) => {
        const b = el("button", "mini-tab-btn" + (i === 0 ? " active" : ""), t.name);
        b.addEventListener("click", () => {
          [...tabHead.children].forEach(x => x.classList.remove("active"));
          b.classList.add("active");
          renderMiniTab(t);
        });
        tabHead.appendChild(b);
      });
      function renderMiniTab(t) {
        clear(tabBody);
        tabBody.appendChild(el("p", "concept-summary", t.def));
        [t.example, t.example2].filter(Boolean).forEach(ex => {
          tabBody.appendChild(el("div", "example-box", `<div class="example-text">«${ex.text}»${ex.ref ? ` <span class="example-ref">(${ex.ref})</span>` : ""}</div><div class="example-note">${ex.note}</div>`));
        });
      }
      box.appendChild(tabHead); box.appendChild(tabBody);
      renderMiniTab(concept.tabs[0]);
      if (concept.discriminator) box.appendChild(el("p", "concept-note", "🎯 " + concept.discriminator));
    } else if (concept.type === "accordion") {
      (concept.points || []).forEach(p => {
        const item = el("div", "accordion-item");
        const head = el("button", "accordion-head", `<span>${p.label}</span><span>+</span>`);
        const bodyEl = el("div", "accordion-body hidden", p.detail);
        head.addEventListener("click", () => bodyEl.classList.toggle("hidden"));
        item.appendChild(head); item.appendChild(bodyEl);
        box.appendChild(item);
      });
    } else if (concept.type === "compare") {
      if (concept.intro) box.appendChild(el("p", "concept-summary", concept.intro));
      const table = el("div", "compare-table");
      const header = el("div", "compare-row compare-header");
      header.innerHTML = `<span>القسم</span><span>الصيغة</span><span>مثال</span><span>المحذوف</span>`;
      table.appendChild(header);
      concept.rows.forEach(r => {
        const row = el("div", "compare-row");
        row.innerHTML = `<span><strong>${r.name}</strong></span><span>${r.formula}</span><span>${r.example}</span><span>${r.removed}</span>`;
        table.appendChild(row);
      });
      box.appendChild(table);
      if (concept.trapNote) box.appendChild(el("p", "concept-note concept-note-warn", "⚠️ " + concept.trapNote));
    }
    return box;
  }

  function renderUnderstand(container, lesson) {
    lesson.concepts.forEach(concept => {
      const card = el("div", "concept-card");
      const head = el("button", "concept-head", `<span>${concept.title}</span><span class="concept-skill-tag">${concept.skill}</span>`);
      const body = renderConceptBody(concept);
      body.classList.add("hidden");
      let opened = false;
      head.addEventListener("click", () => {
        body.classList.toggle("hidden");
        if (!opened) { Progress.recordConceptViewed(lesson.id, concept.id); Progress.checkBadges(lesson.id); refreshChips(); opened = true; }
      });
      card.appendChild(head); card.appendChild(body);
      container.appendChild(card);
    });
  }

  function renderPracticeSequence(container, lesson) {
    let idx = 0;
    const progressLine = el("div", "sequence-progress");
    container.appendChild(progressLine);
    const qContainer = el("div");
    container.appendChild(qContainer);

    function next() {
      progressLine.textContent = `سؤال ${Math.min(idx + 1, lesson.practice.length)} من ${lesson.practice.length}`;
      if (idx >= lesson.practice.length) {
        const mastery = Progress.computeMastery(lesson.id);
        Progress.checkBadges(lesson.id);
        clear(qContainer);
        qContainer.appendChild(el("div", "qz-panel qz-panel-good", `🎉 أنهيت مرحلة «جرّب»! إتقانك الحالي: ${mastery.overall}%`));
        refreshChips();
        return;
      }
      QuizEngine.renderPracticeQuestion(qContainer, lesson.practice[idx], lesson.id, () => { idx++; refreshChips(); next(); });
    }
    next();
  }

  function renderWhatIfList(container, lesson) {
    lesson.whatIf.forEach(item => {
      const box = el("div");
      QuizEngine.renderWhatIf(box, item);
      container.appendChild(box);
    });
  }

  function renderTeachItList(container, lesson) {
    lesson.teachIt.forEach(item => {
      const box = el("div");
      QuizEngine.renderTeachIt(box, item, lesson.id);
      container.appendChild(box);
    });
  }

  function renderMindMapTabs(container, lesson) {
    const tabHead = el("div", "mini-tabs");
    const tabBody = el("div");
    const modes = [
      { key: "full", label: "🗺️ عرض الكل", fn: MindMapEngine.renderFull },
      { key: "quiz", label: "🧠 وضع الاختبار", fn: MindMapEngine.renderQuizMode },
      { key: "blank", label: "✏️ الخريطة الفارغة", fn: MindMapEngine.renderBlank }
    ];
    modes.forEach((m, i) => {
      const b = el("button", "mini-tab-btn" + (i === 0 ? " active" : ""), m.label);
      b.addEventListener("click", () => { [...tabHead.children].forEach(x => x.classList.remove("active")); b.classList.add("active"); m.fn(tabBody, lesson); });
      tabHead.appendChild(b);
    });
    container.appendChild(tabHead); container.appendChild(tabBody);
    modes[0].fn(tabBody, lesson);
  }

  // ======================================================================
  // VIEW: تشخيص سريع + توصيات + تدريب علاجي قصير
  // ======================================================================
  function renderDiagnostic(container, lesson) {
    const ls = Progress.ensureLesson(lesson.id);
    if (ls.diagnostic.done) {
      container.appendChild(el("div", "qz-panel qz-panel-info", "✅ أنجزت التشخيص السريع لهذا الدرس من قبل."));
    }
    container.appendChild(el("p", "stage-prompt", "تشخيص سريع (3 أسئلة) — الهدف ليس الدرجة، بل معرفة نقطة انطلاقك."));
    let idx = 0;
    const weak = [];
    const qContainer = el("div");
    container.appendChild(qContainer);

    function next() {
      if (idx >= lesson.diagnostic.length) {
        ls.diagnostic.done = true;
        ls.diagnostic.weakConcepts = weak;
        clear(qContainer);
        if (weak.length === 0) {
          qContainer.appendChild(el("div", "qz-panel qz-panel-good", "🌟 ممتاز! تبدو ملمًّا بأساسيات الدرس. انتقل إلى «افهم» و«جرّب» لتعميق الإتقان."));
        } else {
          const box = el("div", "qz-panel qz-panel-warn");
          box.innerHTML = `<strong>نوصي بمراجعة:</strong> ${weak.map(w => (lesson.concepts.find(c => c.id === w) || {}).title || w).join("، ")}`;
          qContainer.appendChild(box);
          const remedyBtn = el("button", "qz-btn qz-btn-primary", "ابدأ تدريبًا علاجيًا قصيرًا (3–5 أسئلة)");
          remedyBtn.addEventListener("click", () => runRemediation(qContainer, lesson, weak));
          qContainer.appendChild(remedyBtn);
        }
        return;
      }
      const q = lesson.diagnostic[idx];
      if (q.diagnosticOnly) { idx++; next(); return; }
      clear(qContainer);
      const wrap = el("div", "qz-card");
      wrap.appendChild(el("p", "qz-stem", q.stem));
      const optsWrap = el("div", "qz-options");
      q.options.forEach((opt, i) => {
        const btn = el("button", "qz-option", opt);
        btn.addEventListener("click", () => {
          const correct = i === q.answer;
          [...optsWrap.children].forEach(b => b.disabled = true);
          btn.classList.add(correct ? "qz-correct" : "qz-wrong");
          if (!correct && q.mapsToConcept) weak.push(q.mapsToConcept);
          setTimeout(() => { idx++; next(); }, 600);
        });
        optsWrap.appendChild(btn);
      });
      wrap.appendChild(optsWrap);
      qContainer.appendChild(wrap);
    }
    next();
  }

  function runRemediation(container, lesson, weakConceptIds) {
    const pool = [];
    lesson.practice.filter(p => weakConceptIds.includes(p.concept)).forEach(p => {
      pool.push(p);
      if (p.retry) pool.push(Object.assign({}, p, { stem: p.retry.stem, options: p.retry.options, answer: p.retry.answer, retry: null }));
    });
    const items = pool.slice(0, 5);
    if (items.length === 0) { container.appendChild(el("div", "qz-panel qz-panel-info", "لا توجد أسئلة علاجية إضافية متاحة لهذا المفهوم حاليًا — راجع بطاقة المفهوم في «افهم».")); return; }
    let idx = 0;
    const box = el("div", "remediation-box");
    box.appendChild(el("div", "qz-badge", `🩹 تدريب علاجي قصير (${items.length} أسئلة فقط — لا عقاب بكثرة الأسئلة)`));
    container.appendChild(box);
    const qBox = el("div");
    container.appendChild(qBox);
    function next() {
      if (idx >= items.length) {
        const mastery = Progress.computeMastery(lesson.id);
        clear(qBox);
        qBox.appendChild(el("div", "qz-panel qz-panel-good", `تم! إتقانك المحدَّث: ${mastery.overall}%. ${mastery.overall >= 70 ? "أحسنت، يمكنك الانتقال الآن." : "راجع البطاقة مرة أخرى قبل المتابعة."}`));
        return;
      }
      QuizEngine.renderPracticeQuestion(qBox, items[idx], lesson.id, () => { idx++; refreshChips(); next(); });
    }
    next();
  }

  // ======================================================================
  // VIEW: تحدي 100%
  // ======================================================================
  function viewChallenge100(container) {
    const lesson = getCurrentLesson();
    const intro = el("div", "qz-card");
    intro.innerHTML = `
      <h3>🎯 تحدي 100% — ${lesson.title}</h3>
      <p class="qz-muted">خمسة مستويات: فهم ← تطبيق ← تمييز ← تحليل ← Elite Challenge. عدد قليل من الأسئلة عالية الجودة تقيس إتقانًا حقيقيًا.</p>`;
    const startBtn = el("button", "qz-btn qz-btn-primary", "ابدأ التحدي");
    intro.appendChild(startBtn);
    container.appendChild(intro);
    const runZone = el("div");
    container.appendChild(runZone);

    startBtn.addEventListener("click", () => {
      clear(intro);
      QuizEngine.renderChallenge100(runZone, lesson, (result) => {
        clear(runZone);
        renderMasteryScoreScreen(runZone, result);
      });
    });
  }

  function renderMasteryScoreScreen(container, result) {
    const wrap = el("div", "mastery-score-screen");
    wrap.appendChild(el("div", "mastery-big-score", `${result.overall}%`));
    wrap.appendChild(el("div", "mastery-big-label", "MASTERY SCORE"));
    Object.entries(result.scoresBySkill).forEach(([sk, val]) => {
      wrap.appendChild(progressBar(val, sk, "pbar-skill"));
    });
    if (result.newBadges && result.newBadges.length) {
      const badgeBox = el("div", "badges-earned");
      badgeBox.innerHTML = `<strong>🏅 شارات جديدة:</strong>`;
      result.newBadges.forEach(b => badgeBox.appendChild(el("span", "badge-pill", `${b.icon} ${b.title}`)));
      wrap.appendChild(badgeBox);
    }
    const homeBtn = el("button", "qz-btn qz-btn-primary", "العودة للوحة الرئيسية");
    homeBtn.addEventListener("click", () => goRoot("dashboard", ARABIC12_DATA.meta.systemTitle));
    wrap.appendChild(homeBtn);
    container.appendChild(wrap);
    refreshChips();
  }

  // ======================================================================
  // VIEW: مصائد الاختبار (تسلسل)
  // ======================================================================
  function viewTraps(container) {
    const lesson = getCurrentLesson();
    let idx = 0;
    const progressLine = el("div", "sequence-progress");
    container.appendChild(progressLine);
    const box = el("div");
    container.appendChild(box);
    function next() {
      progressLine.textContent = `مصيدة ${Math.min(idx + 1, lesson.examTraps.length)} من ${lesson.examTraps.length} — ${lesson.title}`;
      if (idx >= lesson.examTraps.length) {
        clear(box);
        box.appendChild(el("div", "qz-panel qz-panel-good", "🎉 انتهيت من كل مصائد الاختبار المتاحة لهذا الدرس."));
        Progress.checkBadges(lesson.id); refreshChips();
        return;
      }
      QuizEngine.renderExamTrap(box, lesson.examTraps[idx], lesson.id, () => { idx++; next(); });
    }
    next();
  }

  // ======================================================================
  // VIEW: مختبر الأخطاء (تسلسل)
  // ======================================================================
  function viewErrorLab(container) {
    const lesson = getCurrentLesson();
    let idx = 0;
    const progressLine = el("div", "sequence-progress");
    container.appendChild(progressLine);
    const box = el("div");
    container.appendChild(box);
    function next() {
      progressLine.textContent = `حالة ${Math.min(idx + 1, lesson.errorLab.length)} من ${lesson.errorLab.length} — ${lesson.title}`;
      if (idx >= lesson.errorLab.length) {
        clear(box);
        box.appendChild(el("div", "qz-panel qz-panel-good", "🎉 أنهيت جميع حالات مختبر الأخطاء."));
        Progress.checkBadges(lesson.id); refreshChips();
        return;
      }
      QuizEngine.renderErrorLab(box, lesson.errorLab[idx], lesson.id, () => { idx++; next(); });
    }
    next();
  }

  // ======================================================================
  // VIEW: استرجاع ذكي
  // ======================================================================
  function viewRetrieval(container) {
    const lesson = getCurrentLesson();
    const summary = Progress.getRetrievalSummary(lesson.id);
    const cards = el("div", "retrieval-summary");
    cards.appendChild(el("div", "retrieval-stat retrieval-new", `<strong>${summary["new"]}</strong><span>جديد</span>`));
    cards.appendChild(el("div", "retrieval-stat retrieval-needs", `<strong>${summary["needs"]}</strong><span>يحتاج تثبيتًا</span>`));
    cards.appendChild(el("div", "retrieval-stat retrieval-mastered", `<strong>${summary["mastered"]}</strong><span>متقن</span>`));
    container.appendChild(cards);

    if (summary.due.length === 0) {
      container.appendChild(el("div", "qz-panel qz-panel-info", "لا توجد عناصر مستحقة للمراجعة الآن — عُد لاحقًا، أو جرّب أسئلة جديدة من «جرّب» أو «تحدي 100%» لبناء بنك استرجاعك."));
      return;
    }
    container.appendChild(el("p", "stage-prompt", `لديك ${summary.due.length} عنصرًا مستحقًا للمراجعة اليوم. سنعرض لك أسئلة مشابهة (لا نفس السؤال) لقياس ثبات إتقانك.`));

    const dueKeys = summary.due;
    let idx = 0;
    const box = el("div");
    container.appendChild(box);

    function findQuestionByKey(key) {
      let q = lesson.practice.find(p => p.id === key);
      if (q) return q;
      const baseId = key.replace("_retry", "");
      q = lesson.practice.find(p => p.id === baseId);
      if (q && q.retry) return Object.assign({}, q, { stem: q.retry.stem, options: q.retry.options, answer: q.retry.answer, id: q.id, retry: null });
      return null;
    }

    function next() {
      if (idx >= dueKeys.length) {
        clear(box);
        box.appendChild(el("div", "qz-panel qz-panel-good", "🎉 راجعت كل العناصر المستحقة اليوم."));
        return;
      }
      const q = findQuestionByKey(dueKeys[idx]);
      if (!q) { idx++; next(); return; }
      QuizEngine.renderPracticeQuestion(box, q, lesson.id, () => { idx++; refreshChips(); next(); });
    }
    next();
  }

  // ======================================================================
  // VIEW: التحدي اليومي — بنك مُجمَّع من كل الدروس المتاحة
  // ======================================================================
  function viewDaily(container) {
    const availableLessons = sortedLessons().filter(l => l.status === "done" && l.dailyChallengePool && l.dailyChallengePool.length);
    QuizEngine.renderDailyChallenge(container, availableLessons);
  }

  // ======================================================================
  // VIEW: Elite Mode
  // ======================================================================
  function viewElite(container) {
    const lesson = getCurrentLesson();
    const eliteLevel = lesson.challenge100.levels.find(l => l.level === 5);
    const gate = el("div", "elite-gate");
    gate.innerHTML = `<div class="elite-icon">⭐</div><h2>هل أنت مستعد للسؤال الأصعب؟</h2><p class="qz-muted">درس: ${lesson.title} — سؤال مركّب يقيس التحليل الأدبي العميق — بعد إجابتك ستحصل على تغذية راجعة حول طريقة تفكيرك، لا الدرجة فقط.</p>`;
    const startBtn = el("button", "qz-btn qz-btn-primary", "نعم، أنا مستعد");
    gate.appendChild(startBtn);
    container.appendChild(gate);
    const runZone = el("div");
    container.appendChild(runZone);

    startBtn.addEventListener("click", () => {
      clear(gate);
      const fakeLesson = Object.assign({}, lesson, { challenge100: { levels: [eliteLevel] } });
      QuizEngine.renderChallenge100(runZone, fakeLesson, (result) => {
        clear(runZone);
        renderMasteryScoreScreen(runZone, result);
      });
    });
  }

  // ======================================================================
  // VIEW: تقدّمي (My Progress)
  // ======================================================================
  function viewMyProgress(container) {
    const st = Progress.getState();
    const current = getCurrentLesson();
    const mastery = Progress.computeMastery(current.id);
    const rec = Progress.getRecommendation(current.id);

    const statsRow = el("div", "stats-row");
    statsRow.appendChild(el("div", "stat-box", `<strong>${st.xp}</strong><span>XP</span>`));
    statsRow.appendChild(el("div", "stat-box", `<strong>${st.streak.count}</strong><span>أيام متتالية 🔥</span>`));
    statsRow.appendChild(el("div", "stat-box", `<strong>${st.badges.length}</strong><span>شارات</span>`));
    container.appendChild(statsRow);

    // نظرة عامة على كل دروس المقرر
    const doneLessons = sortedLessons().filter(l => l.status === "done");
    if (doneLessons.length > 1) {
      container.appendChild(el("h3", null, "نظرة عامة على المقرر"));
      const overviewBox = el("div", "course-overview");
      doneLessons.forEach(l => {
        const m = Progress.computeMastery(l.id);
        const row = el("div", "course-overview-row" + (l.id === current.id ? " course-overview-current" : ""));
        row.innerHTML = `<span>${l.icon} ${l.title}</span><span>${m.hasData ? m.overall + "%" : "لم يبدأ"}</span>`;
        row.addEventListener("click", () => { setCurrentLesson(l.id); render("myprogress", "🏆 تقدّمي"); });
        overviewBox.appendChild(row);
      });
      container.appendChild(overviewBox);
    }

    container.appendChild(el("h3", null, `الإتقان التفصيلي — ${current.title}`));
    if (mastery.hasData) {
      Progress.SKILLS.forEach(sk => {
        if (mastery.bySkill[sk] !== null) container.appendChild(progressBar(mastery.bySkill[sk], sk, "pbar-skill"));
      });
    } else {
      container.appendChild(el("div", "qz-panel qz-panel-info", "لم تبدأ بعد أي نشاط تقييمي في هذا الدرس — ابدأ من «افهم» ثم «جرّب» لبناء بيانات إتقانك الحقيقية."));
    }

    if (rec) {
      const recBox = el("div", "qz-panel qz-panel-warn");
      recBox.innerHTML = `<strong>💡 توصية:</strong> ننصحك بمراجعة مهارة «${rec.skill}» (${rec.score}% حاليًا) في «${current.title}».`;
      container.appendChild(recBox);
    }

    container.appendChild(el("h3", null, "الشارات"));
    const badgeGrid = el("div", "badge-grid");
    Progress.BADGES_CATALOG.forEach(b => {
      const earned = st.badges.includes(b.id);
      const card = el("div", "badge-card" + (earned ? " earned" : ""));
      card.innerHTML = `<div class="badge-icon">${b.icon}</div><div class="badge-title">${b.title}</div><div class="badge-desc">${b.desc}</div>`;
      badgeGrid.appendChild(card);
    });
    container.appendChild(badgeGrid);

    const reportBtn = el("button", "qz-btn qz-btn-primary", "📄 عرض تقرير الإتقان الكامل");
    reportBtn.addEventListener("click", () => go("report", "📄 تقرير الإتقان"));
    container.appendChild(reportBtn);
  }

  // ======================================================================
  // VIEW: تقرير الإتقان (MY MASTERY REPORT)
  // ======================================================================
  function viewReport(container) {
    const st = Progress.getState();
    const current = getCurrentLesson();
    const ls = Progress.ensureLesson(current.id);
    const mastery = Progress.computeMastery(current.id);

    const sortedSkills = Progress.SKILLS.filter(s => mastery.bySkill[s] !== null).sort((a, b) => mastery.bySkill[b] - mastery.bySkill[a]);
    const strongest = sortedSkills[0];
    const weakest = sortedSkills[sortedSkills.length - 1];

    const wrap = el("div", "report-wrap");
    wrap.innerHTML = `
      <div class="report-header">
        <h2>تقرير إتقان الطالب</h2>
        <p>${st.studentName || "طالب"} — ${ARABIC12_DATA.meta.subjectLine}</p>
        <p class="qz-muted">${new Date().toLocaleDateString("ar-QA")}</p>
      </div>
      <div class="report-score">${mastery.overall}%</div>
      <p class="report-score-label">نسبة الإتقان الإجمالية — درس: ${current.title}</p>`;

    if (strongest) wrap.innerHTML += `<div class="qz-panel qz-panel-good"><strong>أقوى مهارة:</strong> ${strongest} (${mastery.bySkill[strongest]}%)</div>`;
    if (weakest && weakest !== strongest) wrap.innerHTML += `<div class="qz-panel qz-panel-warn"><strong>أضعف مهارة:</strong> ${weakest} (${mastery.bySkill[weakest]}%)</div>`;

    const errorsBox = el("div", "qz-panel qz-panel-info");
    if (ls.recentErrors.length) {
      errorsBox.innerHTML = `<strong>آخر الأخطاء المسجّلة:</strong> ${ls.recentErrors.length} خطأ في آخر الأنشطة — راجع «مختبر الأخطاء» و«مصائد الاختبار» لتعزيز نقاط الضعف.`;
    } else {
      errorsBox.innerHTML = `<strong>لا أخطاء مسجَّلة بعد</strong> — ابدأ التدرب لتكوين بيانات دقيقة.`;
    }
    wrap.appendChild(errorsBox);

    const challengeBox = el("div", "qz-panel qz-panel-info");
    challengeBox.innerHTML = `<strong>تحدي 100%:</strong> أفضل نتيجة = ${ls.challenge100.bestOverall}% (${ls.challenge100.attempts.length} محاولة)`;
    wrap.appendChild(challengeBox);

    const doneLessons = sortedLessons().filter(l => l.status === "done");
    const needsReview = doneLessons.map(l => ({ l, m: Progress.computeMastery(l.id) })).filter(x => x.m.hasData && x.m.overall < 70);
    if (needsReview.length) {
      const reviewBox = el("div", "qz-panel qz-panel-warn");
      reviewBox.innerHTML = `<strong>📚 دروس تحتاج مراجعة:</strong> ${needsReview.map(x => `${x.l.title} (${x.m.overall}%)`).join("، ")}`;
      wrap.appendChild(reviewBox);
    }

    const printBtn = el("button", "qz-btn qz-btn-outline", "🖨️ طباعة / تصدير (اختياري)");
    printBtn.addEventListener("click", () => window.print());
    wrap.appendChild(printBtn);

    container.appendChild(wrap);
  }

  // ======================================================================
  // VIEW: عن المنصة (إضافة جديدة) — الهوية المهنية للمعلم + التواصل
  // ======================================================================
  // ملاحظات مهمة بخصوص هذه الصفحة تحديدًا:
  // - لا تحتوي على أي بريد إلكتروني إطلاقًا (بناءً على طلب صريح).
  // - رمز واتساب (QR) يظهر هنا فقط — في هذه الصفحة الواحدة — وبحجم متوسط
  //   غير مبالغ فيه، وليس في أي صفحة أخرى من صفحات الموقع.
  // - رقم الهاتف قابل للنقر (tel:) ليفتح الاتصال مباشرة على الجوال، وزر
  //   واتساب منفصل يفتح محادثة عبر wa.me بصيغة دولية صحيحة (+974).
  function viewAbout(container) {
    const m = ARABIC12_DATA.meta;
    const card = el("div", "qz-card about-card");
    card.innerHTML = `
      <h2 style="margin-top:0">${m.systemTitle}</h2>
      <p class="qz-muted">منصة تعليمية للغة العربية — ${m.subjectLine}</p>
      <hr style="border:none;border-top:1px solid var(--border, #e5e5e5);margin:16px 0">
      <p><strong>إعداد وتطوير</strong><br>المعلم ${m.teacher}</p>
      <p>${m.teacherRole || ""}</p>
      <p>${m.school || ""}</p>`;
    container.appendChild(card);

    const contactCard = el("div", "qz-card about-contact-card");
    contactCard.appendChild(el("h3", null, "للتواصل"));

    const phoneRow = el("p", null);
    const phoneLink = el("a", "about-phone-link", `📞 ${m.phone}`);
    phoneLink.href = `tel:${m.phoneIntl || m.phone}`;
    phoneRow.appendChild(phoneLink);
    contactCard.appendChild(phoneRow);

    const waBtn = el("a", "qz-btn qz-btn-primary about-whatsapp-btn", "💬 تواصل عبر واتساب");
    waBtn.href = `https://wa.me/${(m.phoneIntl || "").replace(/[^0-9]/g, "")}`;
    waBtn.target = "_blank";
    waBtn.rel = "noopener";
    contactCard.appendChild(waBtn);

    const qrWrap = el("div", "about-qr-wrap");
    qrWrap.innerHTML = `<img src="assets/whatsapp-qr.png" alt="رمز الاستجابة السريعة للتواصل عبر واتساب" class="about-qr-img">
      <p class="qz-muted about-qr-caption">امسح الرمز للتواصل مباشرة عبر واتساب</p>`;
    contactCard.appendChild(qrWrap);

    container.appendChild(contactCard);
  }

  // ======================================================================
  const VIEWS = {
    dashboard: viewDashboard,
    about: viewAbout,
    lessons: viewLessons,
    lessonHub: viewLessonHub,
    challenge100: viewChallenge100,
    traps: viewTraps,
    errorlab: viewErrorLab,
    retrieval: viewRetrieval,
    daily: viewDaily,
    elite: viewElite,
    myprogress: viewMyProgress,
    report: viewReport
  };

  // ======================================================================
  // مسارات بنك الأسئلة التجريبية والوزارية (إضافة جديدة — منطقها في
  // questions-bank-ui.js، هنا فقط تسجيل في جدول التوجيه دون أي حذف أو تعديل
  // لأي مسار موجود مسبقًا أعلاه)
  // ======================================================================
  if (typeof QBankUI !== "undefined") {
    Object.assign(VIEWS, {
      bankHome: QBankUI.viewHome,
      bankCategory: QBankUI.viewCategory,
      bankTopic: QBankUI.viewTopic,
      bankPractice: QBankUI.viewPractice,
      bankQuizSetup: QBankUI.viewQuizSetup,
      bankQuickReview: QBankUI.viewQuickReview,
      bankSimSetup: QBankUI.viewSimSetup,
      bankSimRun: QBankUI.viewSimRun,
      bankSimSelfMark: QBankUI.viewSimSelfMark,
      bankSimReport: QBankUI.viewSimReport,
      bankErrorLab: QBankUI.viewErrorLab,
      bankBookmarks: QBankUI.viewBookmarks,
      bankDaily: QBankUI.viewDaily,
      bankHundred: QBankUI.viewHundred,
      bankBrowse: QBankUI.viewBrowse
    });
  }

  // ======================================================================
  // وضع المعلم (إضافة جديدة) — بلا أي نظام تسجيل دخول أو اشتراكات أو
  // Supabase: مجرّد رابط خاص لا يظهر في تنقّل الطالب العادي
  // (index.html?teacher=1 أو #teacher-audit). يُستخدم فقط لإظهار مسار
  // "تدقيق الأسئلة" (question-audit-ui.js) الذي يُشغَّل يدويًا من المعلم.
  // ======================================================================
  window.TEACHER_MODE = /[?&]teacher=1(?:&|$)/.test(location.search) || location.hash.replace(/^#/, "") === "teacher-audit";
  if (typeof QAuditUI !== "undefined") {
    Object.assign(VIEWS, { bankAudit: QAuditUI.viewAudit });
  }

  // مسار "حسابي" (إضافة جديدة — المرحلة الثانية التجارية) — منطقه بالكامل في
  // js/platform/platform-ui.js، هنا فقط تسجيل في جدول التوجيه بنفس أسلوب
  // تسجيل مسارات بنك الأسئلة أعلاه، دون أي حذف أو تعديل لأي مسار موجود.
  if (typeof PlatformUI !== "undefined") {
    Object.assign(VIEWS, { account: PlatformUI.viewAccount });
  }

  // قشرة صغيرة تُتيح لملفات بنك الأسئلة (questions-bank-ui.js) استخدام أدوات
  // الواجهة نفسها (el/clear/go/goRoot/back/refreshChips/scrollTop/progressBar)
  // دون تكرارها، ودون كسر التغليف الحالي لبقية دوال app.js.
  window.AppShell = { el, clear, go, goRoot, back, refreshChips, scrollTop, progressBar, dashboardCard };

  // إقلاع التطبيق
  function bootApp() {
    // إذا كان المعلم دخل مباشرة عبر رابط التدقيق الخاص (#teacher-audit)، افتح
    // صفحة التدقيق فورًا؛ وإلا فالسلوك الافتراضي المعتاد للوحة الرئيسية.
    if (window.TEACHER_MODE && location.hash.replace(/^#/, "") === "teacher-audit" && typeof QAuditUI !== "undefined") {
      goRoot("bankAudit", "🛠️ تدقيق الأسئلة — وضع المعلم");
    } else {
      goRoot("dashboard", ARABIC12_DATA.meta.systemTitle);
    }
  }

  // بوابة الحسابات الحقيقية (إضافة جديدة — المرحلة الثانية التجارية): إن كانت
  // js/platform/auth-gate.js محمَّلة ومعرِّفة window.PlatformBoot، يُستدعى
  // bootApp فقط بعد نجاح تسجيل الدخول (أو فورًا إن لم تُفعَّل Supabase بعد،
  // فتعمل المنصة تمامًا كنسختها الأصلية دون أي تغيير في هذا المسار).
  if (window.PlatformBoot) {
    window.PlatformBoot(bootApp);
  } else {
    bootApp();
  }
})();
