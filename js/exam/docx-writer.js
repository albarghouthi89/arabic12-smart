/* ==========================================================================
   docx-writer.js — مولّد ملف Word (.docx) حقيقي، داخل المتصفح، بلا أي مكتبة أو خادم
   --------------------------------------------------------------------------
   يكتب حزمة OOXML صالحة (ZIP بصيغة STORE + XML) مباشرة، فيعمل دون إنترنت ودون
   تبعية خارجية. المخرَج ملف .docx حقيقي قابل للتحرير في Word/LibreOffice/Google Docs.

   مواصفات الملف (مقصودة):
   - A4، هوامش 2 سم، اتجاه RTL كامل: كل فقرة bidi وكل مقطع rtl بخط Arial
     (موجود في Word وبه عربية متصلة الحروف) بحجم 13pt.
   - لا ترويسة (header) ولا صور ولا علامة مائية ولا غلاف ولا شعارات ولا أي
     اسم مدرسة/معلم/وزارة. يبدأ الملف مباشرة بـ«السؤال الأول».
   - تذييل (footer) صغير فقط: ترقيم الصفحات + عبارة أنه اختبار تدريبي مولَّد من
     محتوى المنصة وليس اختبارًا رسميًا.
   - الخيارات رأسية، سطرًا لكل خيار، بحروف أ ب ج د؛ والسؤال وخياراته مرتبطة
     (keepNext) كي لا تنفصل عبر الصفحات قدر الإمكان.
   - مساحة إجابة (خطوط منقّطة) للأسئلة المقالية/القصيرة غير ذات الخيارات المضمَّنة.
   - مفتاح الإجابات: لا يُكتب إلا إذا طلبه الطالب صراحة (exam.answerKey != null)،
     وفي صفحة مستقلة آخر الملف.
   ========================================================================== */

const DocxWriter = (function () {
  // ------------------------------------------------------------------
  // ZIP (STORE) — بلا ضغط، يكفي لملفات XML الصغيرة ويُبقي الكود قصيرًا وقابلًا للفحص
  // ------------------------------------------------------------------
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  function zipStore(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = ((((now.getFullYear() - 1980) & 0x7F) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name);
      const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new Uint8Array([
        0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)
      ]);
      chunks.push(local, name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += local.length + name.length + data.length;
    });
    const cdStart = offset;
    central.forEach(c => {
      const hdr = new Uint8Array([
        0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(c.crc), ...u32(c.size), ...u32(c.size), ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(c.offset)
      ]);
      chunks.push(hdr, c.name);
      offset += hdr.length + c.name.length;
    });
    const cdSize = offset - cdStart;
    chunks.push(new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
      ...u32(cdSize), ...u32(cdStart), ...u16(0)]));
    let total = 0; chunks.forEach(c => { total += c.length; });
    const out = new Uint8Array(total);
    let p = 0; chunks.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }

  // ------------------------------------------------------------------
  // أدوات XML
  // ------------------------------------------------------------------
  // محارف تحكّم غير مسموحة في XML 1.0 (ما عدا tab/LF/CR) تُحذف
  const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  function esc(s) {
    return String(s == null ? "" : s).replace(ILLEGAL, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const FONT = "Arial";
  const SZ = 26;          // 13pt
  const SZ_H = 28;        // 14pt
  const SZ_FOOT = 17;     // 8.5pt

  function rPr(o) {
    o = o || {};
    return '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:eastAsia="' + FONT + '" w:cs="' + FONT + '"/>' +
      (o.bold ? "<w:b/><w:bCs/>" : "") +
      (o.color ? '<w:color w:val="' + o.color + '"/>' : "") +
      '<w:sz w:val="' + (o.sz || SZ) + '"/><w:szCs w:val="' + (o.sz || SZ) + '"/><w:rtl/></w:rPr>';
  }
  // فقرة نصية: النص يُكتب كما هو، مع الحفاظ على المسافات المتتالية
  function run(text, o) {
    return '<w:r>' + rPr(o) + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }
  function tabRun(o) { return '<w:r>' + rPr(o) + '<w:tab/></w:r>'; }

  function para(runsXml, p) {
    p = p || {};
    let ppr = "";
    if (p.style) ppr += '<w:pStyle w:val="' + p.style + '"/>';
    if (p.keepNext) ppr += "<w:keepNext/>";
    if (p.keepLines) ppr += "<w:keepLines/>";
    if (p.pageBreakBefore) ppr += "<w:pageBreakBefore/>";
    if (p.border) ppr += "<w:pBdr>" + p.border + "</w:pBdr>";
    if (p.shade) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="' + p.shade + '"/>';
    if (p.tabs) ppr += "<w:tabs>" + p.tabs + "</w:tabs>";
    ppr += "<w:bidi/>";
    if (p.spacing) ppr += '<w:spacing ' + p.spacing + '/>';
    if (p.ind) ppr += '<w:ind ' + p.ind + '/>';
    if (p.jc) ppr += '<w:jc w:val="' + p.jc + '"/>';
    return "<w:p><w:pPr>" + ppr + "</w:pPr>" + (runsXml || "") + "</w:p>";
  }

  const BOX = ['top', 'left', 'bottom', 'right'].map(s => '<w:' + s + ' w:val="single" w:sz="4" w:space="6" w:color="9AA0AE"/>').join("");
  const DOT_BOTTOM = '<w:bottom w:val="dotted" w:sz="6" w:space="1" w:color="6B7080"/>';
  const HEAD_BOTTOM = '<w:bottom w:val="single" w:sz="8" w:space="2" w:color="423BD6"/>';

  // ------------------------------------------------------------------
  // بناء المستند من نموذج الاختبار
  // ------------------------------------------------------------------
  const OPT_IND = 'w:left="567"';             // بداية السطر في الفقرات RTL = اليمين
  const Q_IND = 'w:left="567" w:hanging="567"';

  function buildBodyXml(exam) {
    const out = [];
    const L = (typeof ExamEngine !== "undefined" && ExamEngine.LETTERS) || ["أ", "ب", "ج", "د", "هـ", "و"];

    exam.blocks.forEach((b, bi) => {
      // عنوان الكتلة
      out.push(para(
        run("السؤال " + b.ordinal + ": ", { bold: true, sz: SZ_H }) + run(b.intro, { bold: true, sz: SZ_H }),
        { keepNext: true, border: HEAD_BOTTOM, spacing: bi === 0 ? 'w:before="0" w:after="160"' : 'w:before="360" w:after="160"' }
      ));

      // النص المرجعي (كاملًا، سطرًا بسطر كما هو)
      if (b.passage) {
        const lines = String(b.passage).split(/\r?\n/);
        lines.forEach((ln, i) => {
          out.push(para(run(ln), {
            border: BOX, shade: "F5F6FB",
            spacing: 'w:before="0" w:after="' + (i === lines.length - 1 ? '200' : '0') + '" w:line="360" w:lineRule="auto"'
          }));
        });
      }

      b.questions.forEach((q, qi) => {
        const lastLineIdx = q.stemLines.length - 1;
        const hasMoreAfterStem = !!(q.choices && q.choices.length) || q.answerLines > 0 || q.stemLines.length > 1;
        // السطر الأول من السؤال مع رقمه (تعليق معلّق)
        q.stemLines.forEach((ln, li) => {
          if (li === 0) {
            out.push(para(run(q.number + ".", { bold: true }) + tabRun() + run(ln), {
              keepNext: hasMoreAfterStem, keepLines: true, ind: Q_IND,
              spacing: 'w:before="120" w:after="40" w:line="360" w:lineRule="auto"'
            }));
          } else {
            // الأسطر اللاحقة (خيارات مضمَّنة/أجزاء السؤال): فقرة لكل سطر بنفس إزاحة السؤال
            out.push(para(run(ln), {
              keepNext: li < lastLineIdx || !!(q.choices && q.choices.length) || q.answerLines > 0,
              keepLines: true, ind: OPT_IND, spacing: 'w:before="0" w:after="30" w:line="360" w:lineRule="auto"'
            }));
          }
        });
        if (q.choices && q.choices.length) {
          q.choices.forEach((c, ci) => {
            out.push(para(run(L[ci] + ")") + run("  ") + run(c), {
              keepNext: ci < q.choices.length - 1 || false, keepLines: true,
              ind: OPT_IND, spacing: 'w:before="0" w:after="30" w:line="360" w:lineRule="auto"'
            }));
          });
        }
        if (q.answerLines > 0) {
          // كل خط منقّط فقرة مستقلة تفصلها فقرة فارغة بلا حدود؛ وإلا يدمج Word الحدود
          // المتماثلة المتتالية ويرسم خطًا واحدًا فقط.
          for (let i = 0; i < q.answerLines; i++) {
            out.push(para("", { keepNext: true, border: DOT_BOTTOM, ind: OPT_IND,
              spacing: 'w:before="' + (i === 0 ? '120' : '0') + '" w:after="0" w:line="360" w:lineRule="exact"' }));
            out.push(para("", { keepNext: i < q.answerLines - 1, spacing: 'w:before="0" w:after="0" w:line="120" w:lineRule="exact"' }));
          }
        }
        // فاصل بسيط بين الأسئلة
        out.push(para("", { spacing: 'w:before="0" w:after="60" w:line="120" w:lineRule="exact"' }));
      });
    });

    // مفتاح الإجابات (اختياري بطلب الطالب فقط)
    if (exam.answerKey && exam.answerKey.length) {
      out.push(para(run("مفتاح الإجابات (بناءً على طلبك)", { bold: true, sz: SZ_H }), { pageBreakBefore: true, keepNext: true, border: HEAD_BOTTOM, spacing: 'w:before="0" w:after="160"' }));
      out.push(para(run("الإجابات الموثّقة فقط؛ ما لم تُوثَّق إجابته يُشار إليه بأنه قيد المراجعة."), { spacing: 'w:after="160"' }));
      let cur = null;
      exam.answerKey.forEach(r => {
        if (r.block !== cur) {
          cur = r.block;
          out.push(para(run("السؤال " + r.block, { bold: true }), { keepNext: true, spacing: 'w:before="200" w:after="60"' }));
        }
        out.push(para(run(r.number + ". ", { bold: true }) + run(r.text), { ind: OPT_IND, keepLines: true, spacing: 'w:before="0" w:after="40" w:line="340" w:lineRule="auto"' }));
      });
    }

    return out.join("");
  }

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function documentXml(exam) {
    // لا headerReference إطلاقًا: لا ترويسة. تذييل واحد فقط.
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document ' + NS + '><w:body>' + buildBodyXml(exam) +
      '<w:sectPr><w:footerReference w:type="default" r:id="rId3"/>' +
      '<w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>' +
      '<w:cols w:space="720"/><w:bidi/></w:sectPr></w:body></w:document>';
  }

  function footerXml() {
    const o = { sz: SZ_FOOT, color: "6B7080" };
    const fld = (instr) =>
      '<w:r>' + rPr(o) + '<w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r>' + rPr(o) + '<w:instrText xml:space="preserve"> ' + instr + ' </w:instrText></w:r>' +
      '<w:r>' + rPr(o) + '<w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r>' + rPr(o) + '<w:t>1</w:t></w:r>' +
      '<w:r>' + rPr(o) + '<w:fldChar w:fldCharType="end"/></w:r>';
    const p1 = para(run("اختبار تدريبي مولَّد من محتوى منصة الطالب الذكي — وليس اختبارًا رسميًا", o),
      { jc: "center", border: '<w:top w:val="single" w:sz="4" w:space="4" w:color="C9CCD8"/>', spacing: 'w:before="0" w:after="20"' });
    const p2 = para(run("صفحة ", o) + fld("PAGE") + run(" من ", o) + fld("NUMPAGES"), { jc: "center", spacing: 'w:before="0" w:after="0"' });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '>' + p1 + p2 + '</w:ftr>';
  }

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles ' + NS + '>' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + FONT + '" w:hAnsi="' + FONT + '" w:eastAsia="' + FONT + '" w:cs="' + FONT + '"/>' +
      '<w:sz w:val="' + SZ + '"/><w:szCs w:val="' + SZ + '"/><w:lang w:val="ar-SA" w:eastAsia="ar-SA" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="80" w:line="340" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/></w:pPr><w:rPr><w:rtl/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/></w:pPr></w:style>' +
      '</w:styles>';
  }

  function settingsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:settings ' + NS + '><w:zoom w:percent="100"/><w:defaultTabStop w:val="567"/>' +
      '<w:characterSpacingControl w:val="doNotCompress"/>' +
      '<w:themeFontLang w:val="ar-SA" w:bidi="ar-SA"/></w:settings>';
  }

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    '</Relationships>';

  function coreXml(exam) {
    const iso = (exam.createdAt || new Date().toISOString()).replace(/\.\d+Z$/, "Z");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>اختبار تدريبي</dc:title><dc:language>ar-SA</dc:language>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created></cp:coreProperties>';
  }
  const APP_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>';

  /** يعيد Uint8Array لمحتوى ملف .docx */
  function build(exam) {
    return zipStore([
      { name: "[Content_Types].xml", data: CONTENT_TYPES },
      { name: "_rels/.rels", data: ROOT_RELS },
      { name: "word/document.xml", data: documentXml(exam) },
      { name: "word/styles.xml", data: stylesXml() },
      { name: "word/settings.xml", data: settingsXml() },
      { name: "word/footer1.xml", data: footerXml() },
      { name: "word/_rels/document.xml.rels", data: DOC_RELS },
      { name: "docProps/core.xml", data: coreXml(exam) },
      { name: "docProps/app.xml", data: APP_XML }
    ]);
  }

  const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  function toBlob(exam) { return new Blob([build(exam)], { type: MIME }); }

  function fileNameFor(exam) {
    const d = new Date(exam.createdAt || Date.now());
    const p = (n) => String(n).padStart(2, "0");
    const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
    return "اختبار-تدريبي-" + (exam.params && exam.params.courseId === "ar12-sci" ? "عربي-12-علمي" : "مقرر") + "-ف" + exam.params.semester + "-" + stamp + ".docx";
  }

  return { build, toBlob, fileNameFor, MIME, _crc32: crc32, _zipStore: zipStore };
})();

if (typeof window !== "undefined") window.DocxWriter = DocxWriter;
if (typeof module !== "undefined" && module.exports) module.exports = DocxWriter;
