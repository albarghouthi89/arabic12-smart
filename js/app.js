/* ==========================================================================
   app.js — التوجيه (Router) وربط الواجهة بمحركات المحتوى والتقدم
   ========================================================================== */

(function () {
  const main = document.getElementById("app-main");
  const backBtn = document.getElementById("back-btn");
  const headerTitle = document.getElementById("header-title");
  const xpChip = document.getElementById("xp-chip");
  const streakChip = document.getElementById("streak-chip");
  const appHeader = document.querySelector(".app-header");
  const headerExtra = document.getElementById("header-extra");

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
  let tkTimer = null; // مؤقت عدّاد التحدي اليومي في اللوحة الرئيسية

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
    // أيقونات SVG بدل الإيموجي (اللوحة الجديدة) — الأرقام نفسها من حالة التقدّم الحقيقية
    streakChip.innerHTML = `<svg class="tk-ico" stroke-width="2" aria-hidden="true"><use href="#i-flame"/></svg><span><span class="num">${st.streak.count}</span> يوم</span>`;
    xpChip.innerHTML = `<svg class="tk-ico" stroke-width="1.5" aria-hidden="true"><use href="#i-star"/></svg><span><span class="num">${st.xp}</span> XP</span>`;
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
    if (window.TopLoader) window.TopLoader.pulse(); // شريط تحميل علوي ناعم عند كل انتقال (splash.js)
    clear(main);
    // إعادة ضبط ما تضيفه لوحة التحكم الجديدة (عرض أعرض + عناصر الشريط العلوي + مؤقت التحدي)
    main.classList.remove("tk-dash");
    if (appHeader) appHeader.classList.remove("has-extra");
    if (headerExtra) headerExtra.innerHTML = "";
    if (tkTimer) { clearInterval(tkTimer); tkTimer = null; }
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
    try {
      viewDashboardV2(container);
    } catch (e) {
      // شبكة أمان: إن حدث أي خطأ في اللوحة الجديدة تُعرض اللوحة السابقة كما كانت دون أي فقد للوظائف
      console.error("[dashboard] fallback to legacy view:", e);
      clear(container);
      main.classList.remove("tk-dash");
      if (appHeader) appHeader.classList.remove("has-extra");
      if (headerExtra) headerExtra.innerHTML = "";
      if (tkTimer) { clearInterval(tkTimer); tkTimer = null; }
      headerTitle.textContent = ARABIC12_DATA.meta.systemTitle;
      viewDashboardLegacy(container);
    }
  }

  // ======================================================================
  // VIEW: Dashboard v2 — لوحة تحكم عصرية (Glass / Gradient / Micro-interactions)
  // نفس البيانات والمسارات والأدوات القائمة تمامًا؛ التغيير في العرض فقط.
  // ======================================================================
  const ico = (name, cls) => `<svg class="tk-ico${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escHtml = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function greetingWord() {
    const h = new Date().getHours();
    return h < 5 ? "ليلة موفقة" : h < 12 ? "صباح الخير" : h < 17 ? "طاب يومك" : "مساء الخير";
  }

  // أيام الأسبوع (السبت → الجمعة): نُعلّم أيام السلسلة الفعلية من streak.count وآخر يوم نشاط
  function weekStrip(st) {
    const days = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];
    const pad = n => String(n).padStart(2, "0");
    const fmt = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const todayIdx = (now.getDay() + 1) % 7; // السبت = 0
    const last = st.streak.lastActiveDate ? new Date(st.streak.lastActiveDate + "T12:00:00") : null;
    return days.map((label, i) => {
      const d = new Date(now); d.setDate(now.getDate() - todayIdx + i);
      let on = false;
      if (last && st.streak.count > 0) {
        const diff = Math.round((last - d) / 86400000); // 0 = آخر يوم نشاط
        on = diff >= 0 && diff < st.streak.count;
      }
      return { label, on, today: fmt(d) === fmt(now) };
    });
  }

  function viewDashboardV2(container) {
    const st = Progress.getState();
    const current = getCurrentLesson();
    const mastery = Progress.computeMastery(current.id);
    const meta = ARABIC12_DATA.meta;
    const lessons = sortedLessons().filter(l => l.status === "done");
    container.classList.add("tk-dash");
    const root = el("div", "tkd");
    container.appendChild(root);

    // ---------- الشريط العلوي: شعار + تحية + «عن المنصة» ----------
    headerTitle.innerHTML = `<span class="tk-brand-name">تمكّن</span><small>نظام الطالب الذكي</small>`;
    appHeader.classList.add("has-extra");
    const desktopGreet = el("div", "tkd-greet tk-greet-desktop");
    const aboutBtn = el("button", "tk-about-btn",
      `${ico("info")}<span class="lbl-long">عن المنصة والتواصل مع المعلم</span><span class="lbl-mid">عن المنصة</span>`);
    aboutBtn.type = "button";
    aboutBtn.setAttribute("aria-label", "عن المنصة والتواصل مع المعلم");
    aboutBtn.addEventListener("click", () => go("about", "ℹ️ عن المنصة"));
    headerExtra.appendChild(desktopGreet);
    headerExtra.appendChild(aboutBtn);

    // تحية للجوال (داخل الصفحة)
    const mobileGreet = el("div", "tkd-greet tkd-greet--compact");
    root.appendChild(mobileGreet);

    let editing = false;
    function renderGreet() {
      [desktopGreet, mobileGreet].forEach(box => {
        const name = (Progress.getState().studentName || "").trim();
        let h = `<span class="tkd-greet-ico">${ico("sparkles")}</span><span class="tkd-greet-text">${greetingWord()}،</span>`;
        if (editing) {
          h += `<input class="tkd-name-input" type="text" maxlength="24" value="${escHtml(name)}" placeholder="اكتب اسمك" aria-label="اسم الطالب" autocomplete="off">` +
               `<button type="button" class="tkd-name-save" aria-label="حفظ الاسم">${ico("check")}</button>`;
        } else {
          h += `<button type="button" class="tkd-name-btn${name ? " has-name" : ""}" aria-label="${name ? "تعديل الاسم" : "أضف اسمك"}"><span>${name ? escHtml(name) : "أضف اسمك"}</span>${ico("pencil")}</button>`;
        }
        box.innerHTML = h;
        const input = box.querySelector(".tkd-name-input");
        const commit = (save) => {
          if (save && input) Progress.setStudentName(input.value.trim());
          editing = false; renderGreet();
        };
        if (input) {
          input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(true); } if (e.key === "Escape") commit(false); });
          box.querySelector(".tkd-name-save").addEventListener("click", () => commit(true));
          if (box.offsetParent !== null) { input.focus(); input.select(); }
        } else {
          box.querySelector(".tkd-name-btn").addEventListener("click", () => { editing = true; renderGreet(); });
        }
      });
    }
    renderGreet();

    // شريط حالة الحساب/التجربة المجانية (إن وُجد حساب حقيقي) + رابط «حسابي» — كما كانا
    if (typeof PlatformUI !== "undefined" && PlatformUI.renderStatusBanner) PlatformUI.renderStatusBanner(root, go);
    if (typeof PlatformUI !== "undefined" && PlatformUI.renderAccountLink) PlatformUI.renderAccountLink(root, go);

    // ---------- Hero ----------
    const pct = mastery.hasData ? mastery.overall : 0;
    const today = Progress.todayStr();
    const doneToday = st.dailyChallenge.lastDate === today;
    const week = weekStrip(st);
    const hero = el("section", "tkd-hero tkd-reveal");
    hero.setAttribute("aria-labelledby", "tkd-hero-title");
    hero.innerHTML = `
      <div class="tkd-hero-deco" aria-hidden="true">
        <div class="tkd-hero-dots"></div><div class="tkd-orb tkd-orb-a"></div><div class="tkd-orb tkd-orb-b"></div>
        <svg class="tkd-spark" style="top:32px;inset-inline-end:46%"><use href="#i-sparkles"/></svg>
        <svg class="tkd-spark" style="bottom:40px;inset-inline-start:42%;width:16px;height:16px;animation-delay:1.2s"><use href="#i-sparkles"/></svg>
      </div>
      <div class="tkd-hero-grid">
        <div class="tkd-hero-main">
          <div>
            <span class="tkd-pill">${ico("graduation")}الصف الثاني عشر العلمي · توجيهي · ${escHtml(meta.country)}</span>
            <h1 id="tkd-hero-title">اللغة العربية<span>رحلتك نحو الإتقان الكامل</span></h1>
            <p class="tkd-teacher"><span class="av" aria-hidden="true">عب</span><span>إعداد المعلم <strong>${escHtml(meta.teacher)}</strong><span class="sep">•</span>الفصل الدراسي الأول ${escHtml(meta.year)}</span></p>
          </div>
          <div class="tkd-lesson">
            <div class="tkd-lesson-row">
              <span class="tkd-lesson-ico">${ico("book-open")}</span>
              <div class="tkd-lesson-txt"><small>الدرس الحالي</small><b>${escHtml(current.title)}</b></div>
              <button type="button" class="tkd-switch" data-act="switch">${ico("swap")}تبديل الدرس</button>
            </div>
            <div class="tkd-bar-head"><span>${mastery.hasData ? "نسبة إتقان الدرس" : "لم تبدأ هذا الدرس بعد"}</span><b>${pct}%</b></div>
            <div class="tkd-bar" role="progressbar" aria-label="تقدّم الدرس الحالي" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i data-w="${pct}"></i></div>
          </div>
        </div>
        <aside class="tkd-quest" aria-labelledby="tkd-quest-title">
          <div class="tkd-quest-head">
            <div class="tkd-quest-title"><span class="tkd-quest-ico">${ico("target")}</span>
              <div><h2 id="tkd-quest-title">التحدي اليومي</h2><p>${doneToday ? "أحسنت! أنجزت تحدّي اليوم" : "سؤال واحد اليوم — هل تقبل التحدي؟"}</p></div></div>
            <span class="tkd-xp">${ico("star")}<span dir="ltr">+8 XP</span></span>
          </div>
          <p class="tkd-cd-label">${ico("timer")}ينتهي التحدي خلال</p>
          <div class="tkd-cd" role="timer" aria-live="off" aria-label="الوقت المتبقي للتحدي اليومي">
            <div><b data-cd="h">00</b><small>ساعة</small></div><div><b data-cd="m">00</b><small>دقيقة</small></div><div><b data-cd="s">00</b><small>ثانية</small></div>
          </div>
          <div class="tkd-week" aria-label="أيام هذا الأسبوع">${week.map(d => `<div><span class="tkd-day${d.on ? " on" : ""}${d.today ? " today" : ""}">${d.on ? ico("check") : ""}</span><small${d.today ? ' class="today"' : ""}>${d.label}</small></div>`).join("")}</div>
          <button type="button" class="tkd-cta${doneToday ? " done" : ""}" data-act="daily">${ico("zap")}<span>${doneToday ? "أُنجز اليوم — جرّب سؤالًا آخر" : "ابدأ التحدي الآن"}</span></button>
        </aside>
      </div>`;
    root.appendChild(hero);
    hero.querySelector('[data-act="switch"]').addEventListener("click", () => go("lessons", "📚 دروسي"));
    hero.querySelector('[data-act="daily"]').addEventListener("click", () => go("daily", "📅 التحدي اليومي"));

    // عدّاد حتى منتصف الليل
    const cdEls = { h: hero.querySelector('[data-cd="h"]'), m: hero.querySelector('[data-cd="m"]'), s: hero.querySelector('[data-cd="s"]') };
    const pad2 = n => String(n).padStart(2, "0");
    function tick() {
      if (!cdEls.h.isConnected) { clearInterval(tkTimer); tkTimer = null; return; }
      const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
      const sec = Math.max(0, Math.floor((end - now) / 1000));
      cdEls.h.textContent = pad2(Math.floor(sec / 3600));
      cdEls.m.textContent = pad2(Math.floor(sec % 3600 / 60));
      cdEls.s.textContent = pad2(sec % 60);
    }
    tick(); tkTimer = setInterval(tick, 1000);

    // ---------- «أكمل من حيث توقفت» (ميزة قائمة) ----------
    if (typeof QBankUI !== "undefined" && typeof QuestionBank !== "undefined" && QBankUI.getLastSession) {
      const lastSession = QBankUI.getLastSession();
      if (lastSession) {
        const rb = el("button", "tkd-resume tkd-reveal");
        rb.type = "button";
        rb.innerHTML = `<b>أكمل تدريبك</b><span>${escHtml(lastSession.subcategory)} — السؤال ${lastSession.currentIndex} من ${lastSession.total} · متابعة التدريب ←</span>`;
        rb.addEventListener("click", () => {
          const quiz = QuestionBank.filterQuestions({ categoryKey: lastSession.categoryKey, subcategory: lastSession.subcategory });
          go("bankPractice", "تدرّب: " + lastSession.subcategory, {
            quiz, mode: "practice",
            categoryKey: lastSession.categoryKey, subcategory: lastSession.subcategory,
            startIndex: Math.min(Math.max(lastSession.currentIndex - 1, 0), Math.max(quiz.length - 1, 0))
          });
        });
        root.appendChild(rb);
      }
    }

    // ---------- أقسام البطاقات ----------
    const lib = window.LIBRARY_MANIFEST ? window.LIBRARY_MANIFEST.items : [];
    const pagesOf = (kind) => { const it = lib.find(i => i.kind === kind && i.semester === 1 && i.current); return it ? it.current.expectedPages : null; };
    const lf = window.LESSON_FILES ? window.LESSON_FILES.items.length : 0;
    const bankMeta = (typeof QuestionBank !== "undefined" && QuestionBank.meta()) ? QuestionBank.meta() : null;
    const has = {
      lib: typeof LibraryUI !== "undefined",
      files: typeof LessonFilesUI !== "undefined",
      exam: typeof ExamUI !== "undefined" && typeof ExamEngine !== "undefined",
      bank: typeof QuestionBank !== "undefined" && typeof QBankUI !== "undefined" && !!bankMeta
    };
    const card = (c, i) => {
      const b = el("button", `tkd-card tkd-t-${c.tone} tkd-reveal`);
      b.type = "button";
      b.style.setProperty("--d", (i * 60) + "ms");
      b.innerHTML = `<div class="tkd-card-top"><span class="tkd-ico">${ico(c.icon)}</span><span class="tkd-badge">${escHtml(c.badge)}</span></div>
        <div><h3>${escHtml(c.title)}</h3><p>${escHtml(c.desc)}</p></div>
        <span class="tkd-open">افتح${ico("arrow-left")}</span>`;
      b.addEventListener("click", c.onClick);
      return b;
    };
    const section = (id, title, sub, accent, icon, cards, gridCls) => {
      const sec = el("section", `tkd-sec--${accent}`);
      sec.setAttribute("aria-labelledby", "tkd-" + id);
      sec.innerHTML = `<div class="tkd-sec-head tkd-reveal"><span class="tkd-sec-chip">${ico(icon)}</span>
        <div><h2 id="tkd-${id}">${title}</h2><p>${sub}</p></div><span class="tkd-sec-line" aria-hidden="true"></span></div>`;
      const grid = el("div", "tkd-grid " + (gridCls || ""));
      cards.forEach((c, i) => grid.appendChild(card(c, i)));
      sec.appendChild(grid);
      return sec;
    };

    const learn = [
      { icon: "book-open", tone: "indigo", title: "دروسي", desc: "الدروس الـ" + ARABIC12_DATA.lessons.length + " للفصل الأول، مرتّبة وجاهزة.", badge: ARABIC12_DATA.lessons.length + " درسًا", onClick: () => go("lessons", "📚 دروسي") },
      { icon: "lightbulb", tone: "violet", title: "افهم", desc: "التعلّم والاستكشاف، ويشمل الخريطة الذهنية.", badge: "تفاعلي", onClick: () => go("lessonHub", current.title, { lessonId: current.id, tab: "understand" }) }
    ];
    if (has.lib) {
      learn.push(
        { icon: "book", tone: "sky", title: "الكتاب المدرسي", desc: "اقرأ كتاب الطالب داخل المنصة.", badge: (pagesOf("textbook") || "—") + " صفحة", onClick: () => go("libraryTextbook", "📘 الكتاب المدرسي") },
        { icon: "calendar", tone: "cyan", title: "الخطة الفصلية", desc: "الخطة الرسمية للفصل الدراسي.", badge: "PDF", onClick: () => go("libraryPlan", "🗓️ الخطة الفصلية") },
        { icon: "file-text", tone: "blue", title: "الملزمة", desc: "ملزمة الفصل الأول — اقرأها أو نزّلها PDF.", badge: (pagesOf("booklet") || "—") + " صفحة", onClick: () => go("libraryBooklet", "📓 الملزمة") }
      );
    }
    if (has.files) {
      learn.push({ icon: "network", tone: "purple", title: "ملفات المراجعة", desc: "خرائط ذهنية وأوراق عمل PDF لكل درس.", badge: lf + " ملفًا", onClick: () => go("lessonFilesHub", "📎 ملفات المراجعة") });
    }
    root.appendChild(section("learn", "التعلّم", "ابدأ من الدرس ثم ارجع للكتاب والملفات", "indigo", "book-open", learn, "tkd-grid--3"));

    const train = [];
    if (has.bank) train.push({ icon: "graduation", tone: "emerald", title: "الأسئلة الوزارية والتجريبية", desc: "أسئلة حقيقية من اختبارات فعلية، مصنّفة حسب الموضوع.", badge: bankMeta.totalQuestions + " سؤالًا", onClick: () => go("bankHome", "📝 الاختبارات التجريبية والوزارية") });
    if (has.exam) train.push({ icon: "clipboard-check", tone: "teal", title: "محاكاة الاختبار الوزاري", desc: "ابنِ اختبارًا تدريبيًا بمواصفاتك وحمّله Word.", badge: "Word", onClick: () => go("examSetup", "📝 محاكاة الاختبار الوزاري") });
    train.push({ icon: "target", tone: "green", title: "تحدي 100%", desc: "اختبار الإتقان لدرسك الحالي.", badge: "إتقان", onClick: () => go("challenge100", "🎯 تحدي 100%") });
    train.push({ icon: "search", tone: "lime", title: "مصائد الاختبار", desc: "تدرّب على الأسئلة الملتبسة قبل أن تقع فيها.", badge: "أسئلة ملتبسة", onClick: () => go("traps", "🕵️ مصائد الاختبار") });
    root.appendChild(section("train", "التدريب", "اختبر نفسك كما في الاختبار الحقيقي", "emerald", "clipboard-check", train, train.length >= 4 ? "tkd-grid--4" : "tkd-grid--3"));

    // صف: الأدوات الذكية (عمودان) + الإنجاز (عمود)
    const split = el("div", "tkd-split");
    split.appendChild(section("smart", "أدوات التعلّم الذكي", "ذاكر بذكاء لا بجهد أكبر", "fuchsia", "sparkles", [
      { icon: "refresh", tone: "fuchsia", title: "استرجاع ذكي", desc: "مراجعة متباعدة تثبّت المعلومة في الذاكرة طويلة المدى.", badge: "مراجعة متباعدة", onClick: () => go("retrieval", "🔁 استرجاع ذكي") },
      { icon: "flask", tone: "rose", title: "مختبر الأخطاء", desc: "حلّل أخطاءك المتكررة وحوّلها إلى نقاط قوة.", badge: "تحليل الأخطاء", onClick: () => go("errorlab", "🔬 مختبر الأخطاء") }
    ]));
    // الإتقان العام = متوسط الدروس التي بدأها الطالب فعلًا (من نتائج حقيقية فقط)
    const withData = lessons.map(l => Progress.computeMastery(l.id)).filter(m => m.hasData);
    const overall = withData.length ? Math.round(withData.reduce((a, m) => a + m.overall, 0) / withData.length) : null;
    const masteredN = withData.filter(m => m.overall >= 90).length;
    const psec = el("section", "tkd-sec--amber");
    psec.setAttribute("aria-labelledby", "tkd-progress");
    psec.innerHTML = `<div class="tkd-sec-head tkd-reveal"><span class="tkd-sec-chip">${ico("trophy")}</span><div><h2 id="tkd-progress">الإنجاز والمتابعة</h2><p>أين وصلت؟</p></div><span class="tkd-sec-line" aria-hidden="true"></span></div>`;
    const pc = el("button", "tkd-card tkd-pcard tkd-reveal");
    pc.type = "button";
    pc.innerHTML = `<div class="tkd-card-top"><span class="tkd-ico">${ico("trophy")}</span><span class="tkd-badge">مستوى الإتقان</span></div>
      <div><h3>تقدّمي</h3><p>متابعة مستوى إتقانك للدروس.</p></div>
      <div style="margin-top:auto"><div class="big"><span>الإتقان العام</span><b>${overall === null ? "—" : overall + "<em>%</em>"}</b></div>
      <div class="tkd-pbar" role="progressbar" aria-label="مستوى الإتقان العام" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${overall || 0}"><i data-w="${overall || 0}"></i></div>
      <div class="tkd-pfoot"><span><b>${masteredN}</b> من ${lessons.length} دروس مُتقَنة${overall === null ? " — ابدأ أول نشاط لتظهر نتيجتك" : ""}</span><span>التقرير${ico("arrow-left")}</span></div></div>`;
    pc.addEventListener("click", () => go("myprogress", "🏆 تقدّمي"));
    psec.appendChild(pc);
    split.appendChild(psec);
    root.appendChild(split);

    // ---------- Elite Mode ----------
    const elite = el("button", "tkd-elite tkd-reveal");
    elite.type = "button";
    elite.innerHTML = `<div class="tkd-elite-deco" aria-hidden="true"><div class="o1"></div><div class="o2"></div><div class="gr"></div>
        <svg class="tkd-spark" style="top:24px;inset-inline-end:28%;width:16px;height:16px"><use href="#i-sparkles"/></svg></div>
      <div class="tkd-elite-row">
        <span class="tkd-crown">${ico("crown")}</span>
        <div class="tkd-elite-txt"><small>Elite Mode</small><h2>هل أنت مستعد للسؤال الأصعب؟</h2><p>تحدٍّ مخصّص للطامحين إلى العلامة الكاملة — أسئلة استدلال وتميّز لا يجتازها إلا المتقنون.</p></div>
        <span class="tkd-elite-btn">ادخل التحدي${ico("arrow-left")}</span>
      </div>`;
    elite.addEventListener("click", () => go("elite", "⭐ Elite Mode"));
    root.appendChild(elite);

    // ---------- حركات الدخول (ظهور تدريجي + امتلاء الأشرطة) ----------
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = [...root.querySelectorAll(".tkd-reveal")];
    const fillBars = () => root.querySelectorAll("[data-w]").forEach(b => { b.style.width = b.getAttribute("data-w") + "%"; });
    if (reduce || !("IntersectionObserver" in window)) {
      reveals.forEach(r => r.classList.add("in")); fillBars();
    } else {
      const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }),
        { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
      reveals.forEach(r => io.observe(r));
      setTimeout(() => reveals.forEach(r => r.classList.add("in")), 2500); // شبكة أمان
      setTimeout(fillBars, 350);
    }
  }

  function viewDashboardLegacy(container) {
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
    // بطاقتا «الكتاب المدرسي» و«الخطة الفصلية» (إضافة جديدة — js/library/*): نقطة دخول واحدة
    // واضحة لكل قسم من الصفحة الرئيسية، دون تكرارها في أماكن أخرى.
    if (typeof LibraryUI !== "undefined") {
      learnGrid.appendChild(dashboardCard({
        icon: "📘", title: "الكتاب المدرسي", desc: "اقرأ كتاب الطالب داخل المنصة.",
        onClick: () => go("libraryTextbook", "📘 الكتاب المدرسي")
      }));
      learnGrid.appendChild(dashboardCard({
        icon: "🗓️", title: "الخطة الفصلية", desc: "الخطة الرسمية للفصل الدراسي.",
        onClick: () => go("libraryPlan", "🗓️ الخطة الفصلية")
      }));
      learnGrid.appendChild(dashboardCard({
        icon: "📓", title: "الملزمة", desc: "ملزمة الفصل الأول — اقرأها أو نزّلها PDF.",
        onClick: () => go("libraryBooklet", "📓 الملزمة")
      }));
    }
    // «ملفات المراجعة» (إضافة جديدة): الخرائط الذهنية وأوراق العمل PDF مرتّبة حسب المجال والدرس.
    if (typeof LessonFilesUI !== "undefined") {
      learnGrid.appendChild(dashboardCard({
        icon: "📎", title: "ملفات المراجعة", desc: "خرائط ذهنية وأوراق عمل PDF لكل درس.",
        onClick: () => go("lessonFilesHub", "📎 ملفات المراجعة")
      }));
    }
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
    // بطاقة «محاكاة الاختبار الوزاري» (إضافة جديدة — js/exam/*): بناء اختبار تدريبي وتنزيله Word.
    if (typeof ExamUI !== "undefined" && typeof ExamEngine !== "undefined") {
      trainGrid.appendChild(dashboardCard({
        icon: "🧾", title: "محاكاة الاختبار الوزاري", desc: "ابنِ اختبارًا تدريبيًا وحمّله Word.",
        onClick: () => go("examSetup", "📝 محاكاة الاختبار الوزاري")
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
    // «ملفات الدرس» (إضافة جديدة — js/library/lesson-files-ui.js): ورقة العمل + خرائط المراجعة PDF لهذا الدرس.
    if (typeof LessonFilesUI !== "undefined") tabs.push({ key: "files", label: "📎 ملفات الدرس" });
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
      if (active === "files" && typeof LessonFilesUI !== "undefined") LessonFilesUI.renderLessonTab(body, lesson);
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
  // الكتاب المدرسي + الخطة الفصلية + محاكاة الاختبار (إضافة جديدة) — منطقها بالكامل في
  // js/library/* و js/exam/*؛ هنا فقط تسجيل المسارات بنفس أسلوب مسارات بنك الأسئلة.
  // ======================================================================
  if (typeof LibraryUI !== "undefined") {
    Object.assign(VIEWS, { libraryTextbook: LibraryUI.viewTextbook, libraryPlan: LibraryUI.viewPlan, libraryBooklet: LibraryUI.viewBooklet });
  }
  if (typeof LessonFilesUI !== "undefined") {
    Object.assign(VIEWS, { lessonFilesHub: LessonFilesUI.viewHub, lessonFile: LessonFilesUI.viewFile });
  }
  if (typeof ExamUI !== "undefined") {
    Object.assign(VIEWS, { examSetup: ExamUI.viewSetup, examPreview: ExamUI.viewPreview });
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
  // Answer Audit (إضافة جديدة — المرحلة الثالثة): أداة منفصلة تمامًا عن
  // QuestionAudit، تفحص فقط جودة الإجابات المُضافة (answer-audit.js) —
  // بنفس أسلوب التسجيل والحماية بوضع المعلم أعلاه، دون أي تعديل عليه.
  if (typeof AAuditUI !== "undefined") {
    Object.assign(VIEWS, { bankAnswerAudit: AAuditUI.viewAnswerAudit });
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
