/* ==========================================================================
   library-ui.js — واجهات «الكتاب المدرسي» و«الخطة الفصلية» + إدارة المراجع (المعلم)
   --------------------------------------------------------------------------
   يعتمد على: window.LIBRARY_MANIFEST (سجل الملفات)، PdfViewer (pdf-viewer.js)،
   وقشرة AppShell التي يوفّرها app.js (نفس نمط questions-bank-ui.js).
   لا يُعدّل أي ملف محتوى أو منطق موجود، ولا يعرض أي كتاب/خطة غير موجودة فعليًا.
   ========================================================================== */

const LibraryUI = (function () {
  const KIND_META = {
    textbook: { icon: "📘", title: "الكتاب المدرسي", missingWhat: "ملف الكتاب (PDF)" },
    plan: { icon: "🗓️", title: "الخطة الفصلية", missingWhat: "ملف الخطة الفصلية الرسمي" },
    booklet: { icon: "📓", title: "الملزمة", missingWhat: "ملزمة المعلم (PDF)" }
  };
  let activeViewer = null;
  const uiState = { courseId: null, semester: null };

  function shell() { return window.AppShell; }
  function el(tag, cls, html) { return shell().el(tag, cls, html); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function manifest() { return window.LIBRARY_MANIFEST || { courses: [], semesters: [], items: [] }; }
  function courseOf(id) { return manifest().courses.find(c => c.id === id) || null; }
  function semLabel(id) { const s = manifest().semesters.find(x => x.id === id); return s ? s.label : "الفصل " + id; }
  function findItem(kind, courseId, semester) {
    return manifest().items.find(i => i.kind === kind && i.courseId === courseId && i.semester === semester) || null;
  }
  // الطالب يرى فقط: حالة approved + إصدار current موجود. غير ذلك = "لم يُرفع".
  function isPublished(item) { return !!(item && item.status === "approved" && item.current && item.current.file); }
  function positionKey(item) { return item.id + "@v" + item.current.version + ":" + String(item.current.sha256 || "").slice(0, 8); }

  function destroyViewer() { if (activeViewer) { try { activeViewer.destroy(); } catch (e) { /* */ } activeViewer = null; } }

  // ------------------------------------------------------------------
  // عرض الصفحة الرئيسية لقسم (كتاب | خطة)
  // ------------------------------------------------------------------
  function viewLibrary(kind) {
    return function (container, opts) {
      destroyViewer();
      opts = opts || {};
      const km = KIND_META[kind];
      const m = manifest();
      if (!uiState.courseId || !courseOf(uiState.courseId)) uiState.courseId = (m.courses[0] || {}).id;
      if (opts.courseId) uiState.courseId = opts.courseId;
      // الفصل الافتراضي: الأول الذي له مرجع منشور، وإلا الأول
      const semIds = m.semesters.map(s => s.id);
      // فتح القسم من الرئيسية يبدأ دائمًا بأول فصل له مرجع منشور؛ الفصل المختار يُحمَل فقط داخل إعادة رسم الشاشة نفسها.
      let sem = opts.semester;
      if (!sem || !semIds.includes(sem)) {
        sem = (semIds.find(s => isPublished(findItem(kind, uiState.courseId, s)))) || semIds[0];
      }
      uiState.semester = sem;

      container.className = container.className.replace(/\blib-page\b/g, "").trim();
      const course = courseOf(uiState.courseId);

      const hero = el("div", "hero lib-hero");
      hero.innerHTML = `<h1>${km.icon} ${km.title}</h1>
        <p class="hero-sub">${course ? esc(course.subject) + " — الصف " + esc(course.grade) + " " + esc(course.track) : ""}</p>`;
      container.appendChild(hero);

      // اختيار الصف/المادة يظهر فقط عند وجود أكثر من مقرر في السجل (قابلية التوسّع بلا ازدحام)
      if (m.courses.length > 1) {
        const row = el("div", "bk-field");
        row.appendChild(el("label", null, "المقرر:"));
        const sel = el("select", "bk-select");
        m.courses.forEach(c => {
          const o = el("option", null, `${esc(c.subject)} — الصف ${esc(c.grade)} ${esc(c.track)}`);
          o.value = c.id; if (c.id === uiState.courseId) o.selected = true; sel.appendChild(o);
        });
        sel.addEventListener("change", () => { uiState.courseId = sel.value; rerender(); });
        row.appendChild(sel);
        container.appendChild(row);
      }

      // تبويبات الفصل الدراسي
      const tabs = el("div", "lib-tabs");
      tabs.setAttribute("role", "tablist");
      m.semesters.forEach(s => {
        const it = findItem(kind, uiState.courseId, s.id);
        const pub = isPublished(it);
        const b = el("button", "lib-tab" + (s.id === sem ? " active" : "") + (pub ? "" : " lib-tab-missing"),
          `${esc(s.label)}${pub ? "" : ' <span class="lib-tab-note">لم يُرفع</span>'}`);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", s.id === sem ? "true" : "false");
        b.dataset.semester = s.id;
        b.addEventListener("click", () => { uiState.semester = s.id; rerender(); });
        tabs.appendChild(b);
      });
      container.appendChild(tabs);

      const item = findItem(kind, uiState.courseId, sem);
      if (!isPublished(item)) {
        renderMissing(container, kind, course, sem, item);
      } else {
        renderPublished(container, kind, course, sem, item);
      }

      if (window.TEACHER_MODE) renderAdminPanel(container, kind, course, sem, item, rerender);

      function rerender() {
        container.innerHTML = "";
        viewLibrary(kind)(container, { courseId: uiState.courseId, semester: uiState.semester });
      }
    };
  }

  function renderMissing(container, kind, course, sem, item) {
    const km = KIND_META[kind];
    const card = el("div", "qz-card lib-missing");
    card.setAttribute("data-lib-state", "missing");
    const why = (item && item.missingNote) || `${km.missingWhat} لهذا الفصل لم يُرفع بعد.`;
    card.innerHTML = `
      <div class="lib-missing-icon" aria-hidden="true">📂</div>
      <h3>${km.title} — ${esc(semLabel(sem))}: لم يُرفع بعد</h3>
      <p>${esc(why)}</p>
      <p class="qz-muted">لن يظهر هنا أي كتاب أو خطة أو ملزمة بديلة أو تجريبية. بمجرد اعتماد الملف الأصلي من المعلم سيظهر في هذا المكان تلقائيًا.</p>`;
    container.appendChild(card);
  }

  function renderPublished(container, kind, course, sem, item) {
    const cur = item.current;
    const km = KIND_META[kind];

    const meta = el("div", "qz-card lib-meta");
    const rows = [
      ["العنوان", cur.title],
      ["المقرر", course ? `${course.subject} — الصف ${course.grade} ${course.track}` : ""],
      ["الفصل الدراسي", semLabel(item.semester)],
      ["العام الدراسي", item.academicYear],
      ["بيانات الإصدار (من الملف)", cur.editionLabel],
      ["عدد الصفحات", cur.expectedPages],
      ["نسخة السجل", cur.versionLabel || ("النسخة " + cur.version)]
    ].filter(r => r[1]);
    meta.innerHTML = `<dl class="lib-dl">${rows.map(r => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join("")}</dl>` +
      (cur.note ? `<p class="qz-panel qz-panel-info lib-note">${esc(cur.note)}</p>` : "");
    container.appendChild(meta);

    const resumeBox = el("div", "lib-resume hidden");
    container.appendChild(resumeBox);

    const holder = el("div", "lib-viewer");
    holder.setAttribute("data-lib-state", "published");
    holder.setAttribute("data-item", item.id);
    container.appendChild(holder);

    activeViewer = PdfViewer.mount(holder, {
      url: cur.file,
      expectedPages: cur.expectedPages,
      positionKey: positionKey(item),
      label: `${km.title} — ${cur.title}`,
      downloadUrl: cur.downloadable ? cur.file : null,
      downloadName: cur.file.split("/").pop()
    });
    activeViewer.ready.then(info => {
      if (info && info.resumed && info.page > 1) {
        resumeBox.classList.remove("hidden");
        resumeBox.innerHTML = `↩️ تم استئناف القراءة من الصفحة <strong>${info.page}</strong>. `;
        const first = el("button", "qz-btn qz-btn-ghost lib-resume-btn", "البدء من الصفحة 1");
        first.type = "button";
        first.addEventListener("click", () => { activeViewer.goTo(1); resumeBox.classList.add("hidden"); });
        resumeBox.appendChild(first);
      }
    }).catch(() => { /* الرسالة معروضة داخل العارض نفسه */ });
  }

  // ------------------------------------------------------------------
  // إدارة المراجع (وضع المعلم فقط): تجهيز حزمة نشر — لا رفع فعلي للخادم
  // ------------------------------------------------------------------
  async function sha256Hex(buf) {
    if (!(window.crypto && crypto.subtle)) return null;
    const d = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function buildManifestUpdate(base, p) {
    const next = JSON.parse(JSON.stringify(base));
    let item = next.items.find(i => i.kind === p.kind && i.courseId === p.courseId && i.semester === p.semester);
    const today = p.today || new Date().toISOString().slice(0, 10);
    const entry = {
      version: 1, versionLabel: "",
      file: p.filePath, title: p.title, coverText: p.coverText || "",
      editionLabel: p.editionLabel, publisher: p.publisher || "",
      expectedPages: p.pages, sizeBytes: p.size, sha256: p.sha256 || "",
      addedOn: today, note: p.note || ""
    };
    if (p.kind === "plan" || p.kind === "booklet") entry.downloadable = p.downloadable !== false;
    if (!item) {
      item = { id: `${p.kind}-${p.courseId}-s${p.semester}`, kind: p.kind, courseId: p.courseId, semester: p.semester,
        academicYear: p.academicYear, status: "approved", current: null, history: [] };
      next.items.push(item);
    }
    if (item.current) {
      if (item.current.sha256 && p.sha256 && item.current.sha256 === p.sha256) {
        throw new Error("هذا الملف مطابق تمامًا (بالبصمة) للنسخة المعتمدة حاليًا — لا حاجة للاستبدال.");
      }
      item.history = item.history || [];
      item.history.push(Object.assign({}, item.current, { replacedOn: today, replacedReason: p.reason || "" }));
      entry.version = item.current.version + 1;
    }
    entry.versionLabel = p.versionLabel || ("النسخة " + entry.version);
    item.current = entry;
    item.status = "approved";
    item.academicYear = p.academicYear || item.academicYear;
    delete item.missingNote;
    return next;
  }

  function serializeManifest(m) {
    return "/* manifest.js — مُولَّد من أداة إدارة المراجع (وضع المعلم). راجع التعليق الكامل في النسخة الأصلية. */\n" +
      "window.LIBRARY_MANIFEST = " + JSON.stringify(m, null, 2) + ";\n";
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function renderAdminPanel(container, kind, course, sem, item, rerender) {
    const km = KIND_META[kind];
    const card = el("div", "qz-card lib-admin");
    card.setAttribute("data-lib-admin", "1");
    card.innerHTML = `
      <h3>🛠️ إدارة المراجع — وضع المعلم</h3>
      <p class="qz-muted">هذه أداة تجهيز: تفحص ملف PDF من جهازك (عدد الصفحات + بصمة SHA-256)، وتُنتج <strong>سجلًّا محدَّثًا</strong> وملفًا باسمه الصحيح لتضعهما في مجلد الموقع ثم تنشر. <strong>لا ترفع شيئًا إلى الخادم</strong> (الموقع ثابت بلا خادم رفع).</p>`;
    const form = el("div", "lib-admin-form");
    form.innerHTML = `
      <label>ملف PDF: <input type="file" accept="application/pdf" class="bk-select" data-f="file"></label>
      <label>العنوان كما على الملف: <input type="text" class="bk-select" data-f="title" value="${esc(item && item.current ? item.current.title : "")}"></label>
      <label>بيانات الإصدار كما هي مطبوعة (غلاف/تذييل): <input type="text" class="bk-select" data-f="edition" placeholder="مثال: طبعة 1448 - 2026"></label>
      <label>العام الدراسي: <input type="text" class="bk-select" data-f="year" value="${esc(item ? item.academicYear : "2026-2027")}"></label>
      <label>سبب الاستبدال (إن وُجدت نسخة سابقة): <input type="text" class="bk-select" data-f="reason"></label>
      <div class="lib-admin-info" data-f="info" aria-live="polite"></div>
      <div class="qz-actions">
        <button type="button" class="qz-btn qz-btn-outline" data-act="preview" disabled>👁 معاينة محلية (غير منشورة)</button>
        <button type="button" class="qz-btn qz-btn-primary" data-act="pack" disabled>📦 تجهيز حزمة النشر</button>
      </div>
      <div class="lib-admin-out" data-f="out"></div>`;
    card.appendChild(form);
    container.appendChild(card);

    const q = (s) => form.querySelector(`[data-f="${s}"]`);
    let picked = null; // {file, pages, sha, size}

    q("file").addEventListener("change", async () => {
      const f = q("file").files[0];
      picked = null;
      form.querySelector('[data-act="preview"]').disabled = true;
      form.querySelector('[data-act="pack"]').disabled = true;
      q("out").innerHTML = "";
      if (!f) { q("info").textContent = ""; return; }
      q("info").textContent = "⏳ جارٍ فحص الملف…";
      try {
        const buf = await f.arrayBuffer();
        const head = new Uint8Array(buf.slice(0, 5));
        if (String.fromCharCode.apply(null, head) !== "%PDF-") throw new Error("الملف ليس PDF حقيقيًا (الترويسة لا تبدأ بـ %PDF-).");
        const lib = await PdfViewer.loadLib();
        const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        const sha = await sha256Hex(buf);
        picked = { file: f, pages: doc.numPages, sha, size: f.size, buf };
        try { doc.destroy(); } catch (e) { /* */ }
        const cur = item && item.current;
        let cmp = "";
        if (cur) {
          cmp = (cur.sha256 && sha === cur.sha256)
            ? '<br>⚠️ مطابق تمامًا للنسخة المعتمدة الآن — لا حاجة للاستبدال.'
            : `<br>ℹ️ يختلف عن النسخة المعتمدة (${cur.expectedPages} صفحة، ${esc(cur.versionLabel || "")}). عند التجهيز ستُنقل القديمة إلى history ويزيد رقم النسخة.`;
        }
        q("info").innerHTML = `✅ PDF صالح — ${doc.numPages} صفحة — ${(f.size / 1048576).toFixed(2)} MB<br>SHA-256: <code>${sha || "غير متاح في هذا المتصفح"}</code>${cmp}`;
        form.querySelector('[data-act="preview"]').disabled = false;
        form.querySelector('[data-act="pack"]').disabled = false;
      } catch (e) {
        q("info").innerHTML = "❌ " + esc(e.message || e);
      }
    });

    form.querySelector('[data-act="preview"]').addEventListener("click", () => {
      if (!picked) return;
      q("out").innerHTML = "";
      const box = el("div", "lib-viewer");
      q("out").appendChild(el("p", "qz-panel qz-panel-info", "معاينة محلية من جهازك فقط — الطلاب لا يرونها حتى تُنشر."));
      q("out").appendChild(box);
      const url = URL.createObjectURL(picked.file);
      PdfViewer.mount(box, { url, expectedPages: picked.pages, positionKey: null, label: "معاينة محلية" });
    });

    form.querySelector('[data-act="pack"]').addEventListener("click", () => {
      if (!picked) return;
      const title = q("title").value.trim();
      const edition = q("edition").value.trim();
      const year = q("year").value.trim();
      if (!title || !edition || !year) { q("out").innerHTML = '<p class="qz-panel qz-panel-bad">أكمل العنوان وبيانات الإصدار والعام الدراسي كما هي في الملف — لا تُملأ تلقائيًا حتى لا تُختلق.</p>'; return; }
      try {
        const nextVer = (item && item.current) ? item.current.version + 1 : 1;
        const fileName = `${kind === "plan" ? "semester-plan" : (kind === "booklet" ? "booklet" : "textbook")}-${course.id}-s${sem}-v${nextVer}.pdf`;
        const updated = buildManifestUpdate(manifest(), {
          kind, courseId: course.id, semester: sem, academicYear: year,
          filePath: "library/files/" + fileName, title, editionLabel: edition,
          pages: picked.pages, size: picked.size, sha256: picked.sha, reason: q("reason").value.trim()
        });
        q("out").innerHTML = "";
        const ok = el("div", "qz-panel qz-panel-good");
        ok.innerHTML = `تم التجهيز. الخطوات: (1) انسخ الملف المُنزَّل <code>${esc(fileName)}</code> إلى المجلد <code>library/files/</code>. (2) استبدل <code>js/library/manifest.js</code> بالملف المُنزَّل. (3) انشر الموقع. إلى حين النشر يبقى الطلاب على النسخة المعتمدة الحالية.`;
        q("out").appendChild(ok);
        const row = el("div", "qz-actions");
        const b1 = el("button", "qz-btn qz-btn-primary", "⬇ manifest.js المحدَّث");
        b1.type = "button";
        b1.addEventListener("click", () => downloadBlob(new Blob([serializeManifest(updated)], { type: "text/javascript;charset=utf-8" }), "manifest.js"));
        const b2 = el("button", "qz-btn qz-btn-outline", "⬇ ملف PDF باسمه الجديد");
        b2.type = "button";
        b2.addEventListener("click", () => downloadBlob(new Blob([picked.buf], { type: "application/pdf" }), fileName));
        row.appendChild(b1); row.appendChild(b2);
        q("out").appendChild(row);
      } catch (e) {
        q("out").innerHTML = `<p class="qz-panel qz-panel-bad">${esc(e.message || e)}</p>`;
      }
    });
  }

  return {
    viewTextbook: viewLibrary("textbook"),
    viewPlan: viewLibrary("plan"),
    viewBooklet: viewLibrary("booklet"),
    // مكشوفة للاختبار
    _buildManifestUpdate: buildManifestUpdate,
    _serializeManifest: serializeManifest,
    _isPublished: isPublished,
    destroyViewer
  };
})();

window.LibraryUI = LibraryUI;
