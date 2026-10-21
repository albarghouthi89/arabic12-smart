/* ==========================================================================
   lesson-files-ui.js — واجهات «ملفات الدرس» و«ملفات المراجعة» و«عرض ملف»
   --------------------------------------------------------------------------
   يعتمد على: window.LESSON_FILES (lesson-files.js)، PdfViewer (pdf-viewer.js)،
   وقشرة AppShell. لا يعدّل أي ملف محتوى أو منطق قائم:
   - renderLessonTab(container, lesson) → تبويب «📎 ملفات الدرس» داخل مركز الدرس.
   - viewHub  → شاشة «ملفات المراجعة»: كل الخرائط وأوراق العمل مجمَّعة حسب المجال.
   - viewFile → عارض ملف واحد (PDF.js) مع زر تنزيل PDF.
   ========================================================================== */

const LessonFilesUI = (function () {
  const KIND = {
    mindmap: { icon: "🗺️", label: "خريطة ذهنية", plural: "الخرائط الذهنية", cls: "lf-mm" },
    worksheet: { icon: "📝", label: "ورقة عمل", plural: "أوراق العمل", cls: "lf-ws" }
  };
  const DOMAIN_ORDER = ["آيات وبلاغة", "البلاغة", "الأدب — القضايا الأدبية", "القراءة — النصوص الأدبية", "الكلمة والجملة", "التعبير والكتابة", "التعبير"];
  let activeViewer = null;
  const ui = { tab: "mindmap" };

  function shell() { return window.AppShell; }
  function el(tag, cls, html) { return shell().el(tag, cls, html); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function data() { return window.LESSON_FILES || { items: [], bundles: [], related: {} }; }
  function byId(id) { return data().items.find(i => i.id === id) || null; }
  function lessonById(id) { return (typeof ARABIC12_DATA !== "undefined" ? ARABIC12_DATA.lessons : []).find(l => l.id === id) || null; }
  function destroyViewer() { if (activeViewer) { try { activeViewer.destroy(); } catch (e) { /* */ } activeViewer = null; } }

  function sizeLabel(b) { return "\u2066" + (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB") + "\u2069"; }
  function pagesLabel(n) { return n === 1 ? "صفحة واحدة" : (n === 2 ? "صفحتان" : n + " صفحات"); }
  function dlName(item) {
    const k = KIND[item.kind] ? KIND[item.kind].label : "ملف";
    return (k + " - " + item.title).replace(/[\\/:*?"<>|؟]/g, "").replace(/\s+/g, " ").trim() + ".pdf";
  }

  function filesForLesson(lessonId) {
    const d = data();
    const exact = d.items.filter(i => i.lessonId === lessonId);
    const rel = (d.related && d.related[lessonId] || []).map(byId).filter(Boolean);
    const rank = { mindmap: 0, worksheet: 1 };
    exact.sort((a, b) => (rank[a.kind] - rank[b.kind]));
    return { exact, related: rel };
  }

  function downloadLink(item, cls) {
    const a = el("a", cls || "qz-btn qz-btn-primary lf-btn", "⬇ تنزيل PDF");
    a.href = item.file;
    a.setAttribute("download", dlName(item));
    a.setAttribute("data-lf-download", item.id);
    a.rel = "noopener";
    return a;
  }

  function fileCard(item, opts) {
    opts = opts || {};
    const km = KIND[item.kind];
    const card = el("article", "lf-card " + km.cls);
    card.setAttribute("data-file-id", item.id);
    const lesson = item.lessonId ? lessonById(item.lessonId) : null;
    const chips = [km.label, pagesLabel(item.pages), sizeLabel(item.sizeBytes)];
    card.innerHTML = `
      <div class="lf-icon" aria-hidden="true">${km.icon}</div>
      <div class="lf-body">
        <h4 class="lf-title">${esc(item.title)}</h4>
        <div class="lf-meta">${chips.map(c => `<span class="lf-chip">${esc(c)}</span>`).join("")}${item.domain ? `<span class="lf-chip lf-chip-soft">${esc(item.domain)}</span>` : ""}</div>
        ${opts.showLesson && lesson ? `<div class="lf-lesson">مرتبطة بدرس: <strong>${esc(lesson.title)}</strong></div>` : ""}
        ${opts.showLesson && !lesson ? `<div class="lf-lesson lf-lesson-none">مراجعة عامة — لا يوجد درس مطابق لها في المنصة بعد</div>` : ""}
      </div>`;
    const actions = el("div", "lf-actions");
    const open = el("button", "qz-btn qz-btn-outline lf-btn", "👁 عرض");
    open.type = "button";
    open.addEventListener("click", () => shell().go("lessonFile", item.title, { id: item.id }));
    actions.appendChild(open);
    actions.appendChild(downloadLink(item));
    card.appendChild(actions);
    return card;
  }

  // ---------------------------------------------------------------- تبويب الدرس
  function renderLessonTab(container, lesson) {
    destroyViewer();
    const { exact, related } = filesForLesson(lesson.id);
    const intro = el("div", "lf-intro");
    intro.innerHTML = `<h3>📎 ملفات الدرس</h3>
      <p class="qz-muted">خريطة المراجعة الذهنية وورقة العمل الخاصة بدرس «${esc(lesson.title)}» — بصيغة PDF منسّقة وجاهزة للتنزيل والطباعة، بترويسة المدرسة والمعلم.</p>`;
    container.appendChild(intro);

    if (!exact.length && !related.length) {
      container.appendChild(el("div", "qz-card lib-missing",
        `<div class="lib-missing-icon" aria-hidden="true">📂</div><h3>لا ملفات لهذا الدرس بعد</h3><p class="qz-muted">لم يُرفع للمعلم ملف خاص بهذا الدرس حتى الآن.</p>`));
    }

    const hasWs = exact.some(i => i.kind === "worksheet");
    const list = el("div", "lf-list");
    exact.forEach(i => list.appendChild(fileCard(i)));
    container.appendChild(list);
    if (!hasWs && exact.length) {
      container.appendChild(el("p", "qz-muted lf-note", "ℹ️ لا توجد ورقة عمل مخصّصة لهذا الدرس في ملف أوراق العمل الحالي."));
    }
    if (related.length) {
      container.appendChild(el("h4", "lf-sub", "ذات صلة (من المجال نفسه)"));
      const rl = el("div", "lf-list");
      related.forEach(i => rl.appendChild(fileCard(i)));
      container.appendChild(rl);
    }
    const all = el("div", "lf-more");
    const b = el("button", "qz-btn qz-btn-ghost", "📎 كل ملفات المراجعة ←");
    b.type = "button";
    b.addEventListener("click", () => shell().go("lessonFilesHub", "📎 ملفات المراجعة"));
    all.appendChild(b);
    container.appendChild(all);
  }

  // ---------------------------------------------------------------- شاشة الملفات
  function viewHub(container, opts) {
    destroyViewer();
    opts = opts || {};
    if (opts.tab && KIND[opts.tab]) ui.tab = opts.tab;
    const d = data();
    const hero = el("div", "hero lib-hero");
    hero.innerHTML = `<h1>📎 ملفات المراجعة</h1>
      <p class="hero-sub">${d.items.filter(i => i.kind === "mindmap").length} خريطة ذهنية و${d.items.filter(i => i.kind === "worksheet").length} ورقة عمل — PDF بترويسة المدرسة والمعلم</p>`;
    container.appendChild(hero);

    const tabs = el("div", "lib-tabs");
    tabs.setAttribute("role", "tablist");
    Object.keys(KIND).forEach(k => {
      const n = d.items.filter(i => i.kind === k).length;
      const b = el("button", "lib-tab" + (ui.tab === k ? " active" : ""), `${KIND[k].icon} ${KIND[k].plural} <span class="lib-tab-note">${n}</span>`);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", ui.tab === k ? "true" : "false");
      b.dataset.tab = k;
      b.addEventListener("click", () => { ui.tab = k; container.innerHTML = ""; viewHub(container, { tab: k }); });
      tabs.appendChild(b);
    });
    container.appendChild(tabs);

    const bundle = d.bundles.find(b => b.kind === "bundle-" + ui.tab);
    if (bundle) {
      const row = el("div", "qz-card lf-bundle");
      row.innerHTML = `<div><strong>${ui.tab === "mindmap" ? "كل الخرائط الذهنية في ملف واحد" : "كل أوراق العمل في ملف واحد"}</strong>
        <div class="qz-muted">${pagesLabel(bundle.pages).replace(/^(\d+) صفحات$/, "$1 صفحة")} · ${sizeLabel(bundle.sizeBytes)} · بالترويسة نفسها</div></div>`;
      const a = el("a", "qz-btn qz-btn-primary lf-btn", "⬇ تنزيل الكل PDF");
      a.href = bundle.file;
      a.setAttribute("download", ui.tab === "mindmap" ? "خرائط المراجعة الذهنية - الفصل الأول.pdf" : "أوراق العمل المتقدمة - الفصل الأول.pdf");
      a.setAttribute("data-lf-download", bundle.id);
      row.appendChild(a);
      container.appendChild(row);
    }

    const items = d.items.filter(i => i.kind === ui.tab);
    const domains = [];
    items.forEach(i => { if (domains.indexOf(i.domain) < 0) domains.push(i.domain); });
    domains.sort((a, b) => (DOMAIN_ORDER.indexOf(a) + 100) % 100 - (DOMAIN_ORDER.indexOf(b) + 100) % 100);
    domains.forEach(dom => {
      const group = items.filter(i => i.domain === dom);
      container.appendChild(el("h3", "dash-section-title lf-domain", `${esc(dom)} <span class="lib-tab-note">${group.length}</span>`));
      const list = el("div", "lf-list");
      group.forEach(i => list.appendChild(fileCard(i, { showLesson: true })));
      container.appendChild(list);
    });
    if (ui.tab === "worksheet") {
      container.appendChild(el("p", "qz-muted lf-note", "ملاحظة: ملف «نموذج الإجابة» مخصّص للمعلم ولا يُنشر هنا."));
    }
  }

  // ---------------------------------------------------------------- عارض ملف
  function viewFile(container, opts) {
    destroyViewer();
    const item = byId(opts && opts.id);
    if (!item) {
      container.appendChild(el("div", "qz-card lib-missing", `<div class="lib-missing-icon">📂</div><h3>الملف غير موجود</h3><p class="qz-muted">تعذّر العثور على هذا الملف في السجل.</p>`));
      return;
    }
    const km = KIND[item.kind];
    const hero = el("div", "hero lib-hero");
    hero.innerHTML = `<h1>${km.icon} ${esc(item.title)}</h1><p class="hero-sub">${km.label} · ${esc(item.domain || "")} · ${pagesLabel(item.pages)}</p>`;
    container.appendChild(hero);

    const bar = el("div", "lf-viewbar");
    bar.appendChild(downloadLink(item));
    const lesson = item.lessonId ? lessonById(item.lessonId) : null;
    if (lesson && lesson.status === "done") {
      const lb = el("button", "qz-btn qz-btn-outline lf-btn", `📚 اذهب إلى الدرس: ${esc(lesson.title)}`);
      lb.type = "button";
      lb.addEventListener("click", () => shell().go("lessonHub", lesson.title, { lessonId: lesson.id, tab: "files" }));
      bar.appendChild(lb);
    }
    container.appendChild(bar);

    const holder = el("div", "lib-viewer lf-viewer");
    holder.setAttribute("data-lib-state", "published");
    holder.setAttribute("data-item", item.id);
    container.appendChild(holder);
    activeViewer = PdfViewer.mount(holder, {
      url: item.file,
      expectedPages: item.pages,
      positionKey: item.id + ":" + String(item.sha256 || "").slice(0, 8),
      label: `${km.label} — ${item.title}`,
      downloadUrl: item.file,
      downloadName: dlName(item)
    });
    activeViewer.ready.catch(() => { /* الرسالة معروضة داخل العارض */ });
  }

  return {
    renderLessonTab,
    viewHub,
    viewFile,
    filesForLesson,
    destroyViewer,
    _dlName: dlName
  };
})();

window.LessonFilesUI = LessonFilesUI;
