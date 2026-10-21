/* ==========================================================================
   exam-engine.js — محرك بناء الاختبار التدريبي (منطق خالص، بلا DOM)
   --------------------------------------------------------------------------
   يقرأ بنك الأسئلة الموجود فعليًا (window.QUESTIONS_BANK) للقراءة فقط، ولا
   ينسخه ولا يعدّل أي سؤال. المخرَج «نموذج اختبار» (exam) تستهلكه واجهة المعاينة
   ومولّد Word (docx-writer.js) بالنموذج نفسه — فما يراه الطالب في المعاينة هو
   ما يُكتب في الملف.

   قواعد النزاهة (مقصودة ومُختبَرة):
   - لا يُدرَج سؤال بلا تحقق من استقلاليته: السؤال الذي يشير إلى «النص السابق»
     (أو يصرّح مصدره بأنه يعتمد على نص خارج البنك) ولا يرافقه نص في البنك يُستبعد
     من مجموعة الاختبار، ولا يُرقَّع بنص مختلق.
   - لا تكرار سؤال داخل اختبار واحد (بالمعرّف ثم بالنص المُطبَّع)، ولا تكرار
     «سرّي» عند نقص الأسئلة: إن تجاوز المطلوب المتاح يُرفض الطلب برمز INSUFFICIENT.
   - لا يُعاد صياغة أي نص: الإزالة الوحيدة هي ترقيم السؤال الأصلي في مطلع
     السطر (مثل «٥ - » أو «54 ـ») لأن الاختبار الجديد له ترقيمه المتسلسل.
   - كل الخيارات تُحفظ كاملة وبترتيبها الأصلي؛ والنص المرجعي (context) يُرفق مرة
     واحدة بكتلة الأسئلة التي تشترك فيه.
   - العشوائية مقيَّدة: تُوزَّع الأسئلة على الأقسام المختارة (تصنيف حقيقي في
     البنك)، ثم على المواضيع الفرعية داخل كل قسم، ثم يُختار عشوائيًا (بذرة
     قابلة للتكرار) داخل كل موضوع فقط.
   - مستوى الصعوبة غير مُتاح كخيار: حقل difficulty في البنك تقدير آلي بالكلمات
     المفتاحية وليس تصنيفًا موثوقًا (راجع تقرير بنك الأسئلة) — لذلك لا يُعرض.
   ========================================================================== */

const ExamEngine = (function () {
  // ترتيب أقسام الاختبار كما في نموذج الاختبارات (قراءة ثم لغة ثم أدب ثم كتابة)
  const SECTION_ORDER = ["READ", "KGB", "LIT", "WR"];
  const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
    "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر",
    "التاسع عشر", "العشرون", "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون", "الرابع والعشرون", "الخامس والعشرون",
    "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون", "التاسع والعشرون", "الثلاثون"];
  const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

  // سجل المقررات المدعومة: إضافة مقرر جديد = تسجيله هنا (أو عبر registerCourse) ببنك أسئلة خاص به.
  const courses = [];
  const cache = new Map();
  function registerCourse(c) {
    const i = courses.findIndex(x => x.id === c.id);
    if (i >= 0) courses[i] = c; else courses.push(c);
    cache.delete(c.id);
  }
  registerCourse({
    id: "ar12-sci",
    grade: "الثاني عشر",
    track: "العلمي والتكنولوجي",
    subject: "اللغة العربية",
    getBank: () => (typeof window !== "undefined" ? window.QUESTIONS_BANK : (typeof global !== "undefined" ? global.QUESTIONS_BANK : null))
  });
  function listCourses() { return courses.map(c => ({ id: c.id, grade: c.grade, track: c.track, subject: c.subject })); }
  function courseById(id) { return courses.find(c => c.id === id) || null; }

  // ------------------------------------------------------------------
  // أدوات نصّية
  // ------------------------------------------------------------------
  const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
  function norm(s) { return String(s || "").replace(DIACRITICS, "").replace(/[إأآ]/g, "ا").replace(/\s+/g, " ").trim(); }

  // ترقيم السؤال الأصلي في مطلع النص: «٥ - » «54 ـ» «13 . » «6ـ » (حتى 3 خانات فقط)
  const LEAD_NUM = /^\s*[\d٠-٩]{1,3}\s*[\.\-ـ–—:)]+\s*/;
  function stripLeadingNumber(line) { return String(line).replace(LEAD_NUM, ""); }

  // سطر خيار مضمَّن في نص السؤال: «أ - ...» «ب. ...» «ج) ...»
  const OPTION_LINE = /^\s*[أبجدهـ]\s*[\.\-ـ–—\)]\s*\S/;

  function stemLinesOf(q) {
    const lines = String(q.question || "").split(/\r?\n/).map(l => l.replace(/\s+$/g, ""));
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length) lines[0] = stripLeadingNumber(lines[0]);
    return lines;
  }
  function hasInlineOptions(lines) { return lines.some(l => OPTION_LINE.test(l)); }

  // ------------------------------------------------------------------
  // أهلية السؤال (الاستقلالية + سلامة البيانات)
  // ------------------------------------------------------------------
  const DEP_RE = /السابق|السابقة|السابقين|أعلاه|اعلاه|الآتي ذكره|المذكور(?:ة)? في النص|من النص|في النص|للنص|وفق النص|بحسب النص|حسب النص|النصين|الفقرة (?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|الأخيرة)|المقطع (?:الأول|الثاني|الثالث|الرابع|الأخير)/;
  const STUB_CTX = /^[\(\s]*نفس\s+(?:نص|قصة|القصة|النص|قصيدة)|المذكور(?:ة)?\s+في\s+السؤال|الوارد(?:ة)?\s+مع\s+السؤال/;
  const SRC_DEP_NOTE = /يعتمد|خارج النطاق|سبق نطاق|صفحات سابقة|صفحة سابقة/;
  const QUOTED = /[«"“][^«»"“”]{25,}[»"”]/;
  const OPTION_ONLY_PREFIX = /^\s*[أبجد]\s*[\.\-ـ–—\)]/;

  function dependsOnMissingText(q, lines) {
    if (q.context && String(q.context).trim()) {
      // «نفس نص (...) الوارد مع السؤال 12»: ليس نصًا حقيقيًا بل إحالة إلى سؤال آخر → لا يصلح للإرفاق
      const c = String(q.context).trim();
      if (c.length < 220 && STUB_CTX.test(c)) return "نصّه المرجعي مجرد إحالة إلى سؤال آخر (غير مرفق فعليًا)";
      return null;                                                      // النص مرفق في البنك
    }
    if (q._extractionNotes && SRC_DEP_NOTE.test(q._extractionNotes) && !/سطور للإجابة/.test(q._extractionNotes)) {
      return "مصدر السؤال يصرّح بأنه يعتمد على نص غير موجود في البنك";
    }
    const body = lines.filter(l => !OPTION_ONLY_PREFIX.test(l));
    const bodyText = body.join("\n");
    if (!DEP_RE.test(norm(bodyText))) return null;
    // يعتمد لفظيًا على نص سابق: نقبله فقط إن كان النص مضمّنًا داخل السؤال نفسه
    const embedded = QUOTED.test(bodyText) || / {3,}/.test(bodyText) || bodyText.length > 170;
    return embedded ? null : "يشير إلى نص سابق غير مرفق في البنك";
  }

  function semesterOf(q) {
    const s = String(q.source || "");
    if (/الفصل(?: الدراسي)? الأول/.test(s)) return 1;
    if (/الفصل(?: الدراسي)? الثاني/.test(s)) return 2;
    return null;
  }

  function evaluate(q) {
    const lines = stemLinesOf(q);
    if (!lines.length) return { ok: false, reason: "نص السؤال فارغ" };
    if (q.questionType === "mcq") {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.some(c => !String(c || "").trim())) {
        return { ok: false, reason: "خيارات السؤال ناقصة" };
      }
    }
    const dep = dependsOnMissingText(q, lines);
    if (dep) return { ok: false, reason: dep };
    const sem = semesterOf(q);
    if (sem === null) return { ok: false, reason: "الفصل الدراسي غير محدد في المصدر" };
    return { ok: true, semester: sem, lines };
  }

  // ------------------------------------------------------------------
  // مجموعة الأسئلة الصالحة (مخزَّنة مؤقتًا لكل مقرر)
  // ------------------------------------------------------------------
  function pool(courseId) {
    if (cache.has(courseId)) return cache.get(courseId);
    const course = courseById(courseId);
    const bank = course && course.getBank();
    const result = { eligible: [], excluded: [], dupes: 0, categories: [], semesters: {} };
    if (!bank || !Array.isArray(bank.questions)) { cache.set(courseId, result); return result; }
    result.categories = (bank.meta && bank.meta.categories) || [];
    const seen = new Set();
    bank.questions.forEach(q => {
      const ev = evaluate(q);
      if (!ev.ok) { result.excluded.push({ id: q.id, reason: ev.reason }); return; }
      const key = norm(q.question) + "||" + norm(q.context || "") + "||" + (q.choices || []).map(norm).join("|");
      if (seen.has(key)) { result.dupes++; result.excluded.push({ id: q.id, reason: "مكرر بنصه في البنك" }); return; }
      seen.add(key);
      result.eligible.push({ q, lines: ev.lines, semester: ev.semester });
    });
    result.eligible.forEach(e => { result.semesters[e.semester] = (result.semesters[e.semester] || 0) + 1; });
    cache.set(courseId, result);
    return result;
  }

  function categoryKeyOf(courseId, q) {
    const cat = pool(courseId).categories.find(c => c.name === q.category);
    return cat ? cat.key : null;
  }

  // الأقسام المتاحة فعلًا (بتصنيف حقيقي) مع أعدادها للفصل المحدد
  function availability(courseId, semester) {
    const p = pool(courseId);
    const bySection = {};
    p.categories.forEach(c => { bySection[c.key] = { key: c.key, name: c.name, icon: c.icon, count: 0 }; });
    p.eligible.forEach(e => {
      if (e.semester !== semester) return;
      const k = categoryKeyOf(courseId, e.q);
      if (k && bySection[k]) bySection[k].count++;
    });
    const sections = SECTION_ORDER.filter(k => bySection[k]).map(k => bySection[k])
      .concat(Object.keys(bySection).filter(k => !SECTION_ORDER.includes(k)).map(k => bySection[k]));
    return {
      sections,
      total: sections.reduce((a, s) => a + s.count, 0),
      semestersAvailable: Object.keys(p.semesters).map(Number).filter(s => p.semesters[s] > 0),
      excluded: p.excluded.length,
      excludedDependent: p.excluded.filter(x => /نص|يعتمد|يشير|إحالة/.test(x.reason)).length,
      bankTotal: p.eligible.length + p.excluded.length
    };
  }

  function availableFor(courseId, semester, sectionKeys) {
    const a = availability(courseId, semester);
    const set = new Set(sectionKeys);
    return a.sections.filter(s => set.has(s.key)).reduce((n, s) => n + s.count, 0);
  }

  // ------------------------------------------------------------------
  // عشوائية قابلة للتكرار (mulberry32)
  // ------------------------------------------------------------------
  function rngFrom(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function newSeed() {
    try { const a = new Uint32Array(1); (typeof crypto !== "undefined" && crypto.getRandomValues ? crypto : require("crypto").webcrypto).getRandomValues(a); return a[0] || 1; }
    catch (e) { return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1; }
  }

  // تقسيم count على مجموعات بنسبة أحجامها (أكبر باقٍ) مع حدّ أدنى/أقصى لكل مجموعة
  function allocate(sizes, count, minEach) {
    const n = sizes.length;
    const alloc = new Array(n).fill(0);
    let left = count;
    if (minEach) {
      for (let i = 0; i < n && left > 0; i++) { if (sizes[i] > 0) { alloc[i] = 1; left--; } }
    }
    while (left > 0) {
      const room = sizes.map((s, i) => Math.max(0, s - alloc[i]));
      const totalRoom = room.reduce((a, b) => a + b, 0);
      if (totalRoom === 0) break;
      const quotas = room.map(r => (r / totalRoom) * left);
      const floors = quotas.map(Math.floor);
      let given = 0;
      floors.forEach((f, i) => { const g = Math.min(f, room[i]); alloc[i] += g; given += g; });
      left -= given;
      if (left <= 0) break;
      // الباقي لأكبر الكسور
      const order = quotas.map((q, i) => ({ i, frac: q - Math.floor(q), room: room[i] - Math.min(floors[i], room[i]) }))
        .filter(o => o.room > 0).sort((a, b) => b.frac - a.frac || b.room - a.room);
      if (!order.length) break;
      for (const o of order) { if (left <= 0) break; alloc[o.i]++; left--; }
    }
    return alloc;
  }

  function naturalKey(q) {
    // ترتيب الأسئلة التي تشترك في نص: بحسب صفحة المصدر ثم رقم السؤال الأصلي
    const num = String(q.originalQuestionNumber == null ? "" : q.originalQuestionNumber);
    const parts = num.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).match(/\d+/g) || [];
    return [Number(q.sourcePage) || 0].concat(parts.map(Number));
  }
  function cmpKeys(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // الاختيار
  // ------------------------------------------------------------------
  function pickSection(entries, quota, rnd, chosenContexts) {
    // entries: [{q, lines}] لقسم واحد. توزيع على المواضيع الفرعية ثم اختيار عشوائي داخلها.
    if (quota <= 0) return [];
    const groups = new Map();
    entries.forEach(e => { const k = e.q.subcategory || "—"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
    const names = [...groups.keys()].sort();
    const alloc = allocate(names.map(n => groups.get(n).length), quota, false);
    const out = [];
    names.forEach((n, gi) => {
      const list = groups.get(n).slice();
      for (let k = 0; k < alloc[gi] && list.length; k++) {
        // أولوية خفيفة لأسئلة النص الذي اختير له سؤال سابق (تقليل عدد النصوص الطويلة)
        const weights = list.map(e => (e.q.context && chosenContexts.has(String(e.q.context).trim())) ? 3 : 1);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = rnd() * total, idx = 0;
        for (; idx < list.length; idx++) { r -= weights[idx]; if (r < 0) break; }
        idx = Math.min(idx, list.length - 1);
        const [picked] = list.splice(idx, 1);
        if (picked.q.context) chosenContexts.add(String(picked.q.context).trim());
        out.push(picked);
      }
    });
    return out;
  }

  /**
   * generate({courseId, semester, sections:[key], count, seed?, includeAnswers?})
   * -> { ok:true, exam } | { ok:false, code, message, available? }
   */
  function generate(opts) {
    opts = opts || {};
    const courseId = opts.courseId || "ar12-sci";
    const course = courseById(courseId);
    if (!course) return { ok: false, code: "NO_COURSE", message: "المقرر غير مدعوم." };
    const semester = Number(opts.semester) || 1;
    const count = Math.floor(Number(opts.count));
    const avail = availability(courseId, semester);
    if (!avail.total) return { ok: false, code: "NO_CONTENT", message: "لا تتوفر أسئلة لهذا الفصل الدراسي في البنك." };
    const wanted = (opts.sections && opts.sections.length ? opts.sections : avail.sections.map(s => s.key));
    const validKeys = new Set(avail.sections.filter(s => s.count > 0).map(s => s.key));
    const sectionKeys = SECTION_ORDER.concat(avail.sections.map(s => s.key)).filter((k, i, a) => a.indexOf(k) === i)
      .filter(k => wanted.includes(k) && validKeys.has(k));
    if (!sectionKeys.length) return { ok: false, code: "NO_SECTION", message: "اختر قسمًا واحدًا على الأقل من الأقسام المتاحة." };
    if (!(count >= 1)) return { ok: false, code: "BAD_COUNT", message: "عدد الأسئلة يجب أن يكون 1 أو أكثر." };
    const availableCount = sectionKeys.reduce((n, k) => n + avail.sections.find(s => s.key === k).count, 0);
    if (count > availableCount) {
      return {
        ok: false, code: "INSUFFICIENT", available: availableCount, requested: count,
        message: `المطلوب ${count} سؤالًا لكن المتاح في الأقسام المختارة ${availableCount} فقط. لن تُكرَّر أي أسئلة؛ قلّل العدد أو أضف أقسامًا.`
      };
    }

    const seed = opts.seed ? (opts.seed >>> 0) : newSeed();
    const rnd = rngFrom(seed);
    const p = pool(courseId);
    const bySection = {};
    sectionKeys.forEach(k => { bySection[k] = []; });
    p.eligible.forEach(e => {
      if (e.semester !== semester) return;
      const k = categoryKeyOf(courseId, e.q);
      if (bySection[k]) bySection[k].push(e);
    });
    const sizes = sectionKeys.map(k => bySection[k].length);
    const alloc = allocate(sizes, count, count >= sectionKeys.length);
    const chosenContexts = new Set();
    const picks = {};
    sectionKeys.forEach((k, i) => { picks[k] = pickSection(bySection[k], alloc[i], rnd, chosenContexts); });

    // ---- بناء الكتل ----
    const blocks = [];
    const catName = (k) => (avail.sections.find(s => s.key === k) || {}).name || k;
    sectionKeys.forEach(k => {
      const entries = picks[k];
      if (!entries.length) return;
      const withCtx = new Map();
      const plain = [];
      entries.forEach(e => {
        const c = e.q.context && String(e.q.context).trim();
        if (c) { if (!withCtx.has(c)) withCtx.set(c, []); withCtx.get(c).push(e); } else plain.push(e);
      });
      [...withCtx.entries()].forEach(([ctx, list]) => {
        list.sort((a, b) => cmpKeys(naturalKey(a.q), naturalKey(b.q)));
        blocks.push({ sectionKey: k, sectionName: catName(k), passage: ctx, entries: list });
      });
      if (plain.length) {
        plain.sort((a, b) => (a.q.subcategory || "").localeCompare(b.q.subcategory || "", "ar") || cmpKeys(naturalKey(a.q), naturalKey(b.q)));
        blocks.push({ sectionKey: k, sectionName: catName(k), passage: null, entries: plain });
      }
    });

    let total = 0;
    const examBlocks = blocks.map((b, bi) => {
      const ord = ORDINALS[bi] ? ORDINALS[bi] : String(bi + 1);
      const questions = b.entries.map((e, qi) => {
        total++;
        const q = e.q;
        const inline = hasInlineOptions(e.lines);
        let answerLines = 0;
        if (q.questionType === "essay") answerLines = 12;
        else if (q.questionType === "short_answer" && !inline && !/[\.…]{6,}/.test(e.lines.join("\n"))) answerLines = 3;
        return {
          id: q.id, number: qi + 1, type: q.questionType,
          stemLines: e.lines.slice(),
          choices: q.questionType === "mcq" ? q.choices.slice() : null,
          inlineOptions: inline,
          answerLines,
          category: q.category, subcategory: q.subcategory || null
        };
      });
      // النص نفسه قد تشترك فيه أسئلة من قسمين (مثل قصيدة للقراءة والبلاغة): يُطبع مرة واحدة،
      // والكتلة اللاحقة تحيل إلى موضعه بدل تكراره.
      const firstIdx = b.passage ? blocks.findIndex(x => x.passage === b.passage) : -1;
      const isRepeat = b.passage && firstIdx >= 0 && firstIdx < bi;
      const refOrd = isRepeat ? (ORDINALS[firstIdx] || String(firstIdx + 1)) : null;
      return {
        ordinal: ord,
        sectionKey: b.sectionKey, sectionName: b.sectionName,
        intro: isRepeat ? "اعتمد على النص الوارد في السؤال " + refOrd + "، ثم أجب عن الأسئلة التي تليه:"
          : (b.passage ? "اقرأ النص الآتي، ثم أجب عن الأسئلة التي تليه:" : "أجب عن الأسئلة الآتية:"),
        passage: isRepeat ? null : b.passage,
        passageRef: refOrd,
        questions
      };
    });

    const bySectionCount = {};
    examBlocks.forEach(b => { bySectionCount[b.sectionKey] = (bySectionCount[b.sectionKey] || 0) + b.questions.length; });

    const exam = {
      kind: "practice-exam",
      official: false,
      createdAt: new Date().toISOString(),
      seed,
      params: { courseId, semester, sections: sectionKeys.slice(), count, includeAnswers: !!opts.includeAnswers },
      course: { grade: course.grade, track: course.track, subject: course.subject },
      semesterLabel: semester === 1 ? "الفصل الدراسي الأول" : "الفصل الدراسي الثاني",
      totals: { questions: total, passages: examBlocks.filter(b => b.passage).length, blocks: examBlocks.length, bySection: bySectionCount },
      sections: sectionKeys.map(k => ({ key: k, name: catName(k), count: bySectionCount[k] || 0 })),
      blocks: examBlocks,
      answerKey: null
    };
    if (opts.includeAnswers) exam.answerKey = buildAnswerKey(exam, p);
    return { ok: true, exam };
  }

  // مفتاح الإجابات — اختياري ولا يُبنى إلا بطلب صريح؛ لا يشمل إلا الإجابات الموثّقة
  function buildAnswerKey(exam, p) {
    const byId = new Map(p.eligible.map(e => [e.q.id, e.q]));
    const rows = [];
    exam.blocks.forEach(b => b.questions.forEach(q => {
      const src = byId.get(q.id);
      let text;
      if (!src) text = "—";
      else if (src.needsAnswerReview) text = "الإجابة قيد مراجعة المعلم";
      else if (src.questionType === "mcq" && typeof src.correctAnswer === "number") text = LETTERS[src.correctAnswer] + " — " + src.choices[src.correctAnswer];
      else if (src.questionType === "short_answer" && typeof src.correctAnswer === "string" && src.correctAnswer.trim()) text = src.correctAnswer.trim();
      else if (src.questionType === "essay") text = "سؤال مقالي: يُقيَّم بمعايير لا بإجابة واحدة";
      else text = "الإجابة قيد مراجعة المعلم";
      rows.push({ block: b.ordinal, number: q.number, text });
    }));
    return rows;
  }

  const api = {
    SECTION_ORDER, LETTERS,
    registerCourse, listCourses,
    availability, availableFor, generate,
    pool, newSeed,
    _internals: { norm, stripLeadingNumber, dependsOnMissingText, allocate, hasInlineOptions, stemLinesOf, semesterOf, evaluate }
  };
  return api;
})();

if (typeof window !== "undefined") window.ExamEngine = ExamEngine;
if (typeof module !== "undefined" && module.exports) module.exports = ExamEngine;
