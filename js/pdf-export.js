/* =====================================================================
   تصدير ملف الإنجاز كملف PDF تفاعلي — يعرض صور الشواهد والملفات الفعلية
   مع روابط قابلة للنقر داخل الـ PDF تفتح الملف الأصلي.
   ===================================================================== */

document.getElementById("exportPdfBtn").addEventListener("click", exportPortfolioAsPdf);

const PDF_CRITERIA_LABELS = {
  "job-duties": "أداء الواجبات الوظيفية",
  "professional-responsibility": "المسؤولية تجاه المهنة",
  "human-relations": "العلاقات الإنسانية",
  "classroom-management": "الإدارة الصفية",
  "lesson-planning": "التخطيط للتدريس",
  "lesson-delivery": "تنفيذ الدروس",
  "tech-use": "توظيف التقنيات التعليمية",
  "results-analysis": "تحليل نتائج الطلاب ومتابعتهم",
  "community-participation": "الأنشطة والمشاركة المجتمعية",
  "self-development": "التنمية المهنية الذاتية",
  "assessment-methods": "تنوع أساليب التقويم",
  "other-criteria": "معايير أخرى",
};

async function exportPortfolioAsPdf() {
  const btn = document.getElementById("exportPdfBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner dark"></span> جاري تجهيز الملف...`;

  let container = null;
  try {
    btn.innerHTML = `<span class="spinner dark"></span> جاري جلب البيانات...`;
    const data = await pdfFetchAllData();

    btn.innerHTML = `<span class="spinner dark"></span> جاري تجهيز الصور...`;
    container = pdfBuildContainer(data);
    document.body.appendChild(container);
    await pdfPreloadImages(container);

    btn.innerHTML = `<span class="spinner dark"></span> جاري إنشاء PDF...`;
    await pdfRenderContainer(container, data);

    showToast("تم تنزيل ملف الإنجاز التفاعلي بصيغة PDF", "success");
  } catch (err) {
    console.error(err);
    showToast("تعذّر إنشاء ملف PDF", "error");
  } finally {
    if (container && container.parentNode) container.remove();
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

/* ---------------------------------------------------------------------
   1) جلب كل بيانات المعلمة مباشرة من قاعدة البيانات
   --------------------------------------------------------------------- */
async function pdfFetchAllData() {
  const uid = currentUser.id;
  const [profileRes, scheduleRes, certsRes, coursesRes, visitsRes, evalsRes, criteriaRes, filesRes] =
    await Promise.all([
      supabaseClient.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabaseClient.from("schedule").select("*").eq("teacher_id", uid).order("created_at", { ascending: false }),
      supabaseClient.from("certificates").select("*").eq("teacher_id", uid).order("created_at", { ascending: false }),
      supabaseClient.from("courses").select("*").eq("teacher_id", uid).order("created_at", { ascending: false }),
      supabaseClient.from("classroom_visits").select("*").eq("teacher_id", uid).order("visit_date", { ascending: false }),
      supabaseClient.from("evaluations").select("*").eq("teacher_id", uid).order("created_at", { ascending: false }),
      supabaseClient.from("criteria_evidence").select("*").eq("teacher_id", uid),
      supabaseClient.from("evidence_files").select("*").eq("teacher_id", uid).order("uploaded_at", { ascending: false }),
    ]);

  return {
    profile: profileRes.data || currentProfile || {},
    schedule: scheduleRes.data || [],
    certificates: certsRes.data || [],
    courses: coursesRes.data || [],
    visits: visitsRes.data || [],
    evaluations: evalsRes.data || [],
    criteria: criteriaRes.data || [],
    files: filesRes.data || [],
  };
}

/* ---------------------------------------------------------------------
   2) بناء صفحة العرض الخاصة بالتصدير (مخفية خارج الشاشة)
   --------------------------------------------------------------------- */
function pdfBuildContainer(data) {
  const p = data.profile || {};
  const wrap = document.createElement("div");
  wrap.id = "pdfExportRoot";
  wrap.style.cssText =
    "position:fixed; top:0; left:-99999px; width:900px; background:#ffffff; " +
    "direction:rtl; font-family:'Tajawal','Segoe UI',Arial,sans-serif; color:#2b2b3d; padding:0;";

  wrap.innerHTML = `
    <style>
      #pdfExportRoot * { box-sizing: border-box; }
      #pdfExportRoot .pdf-cover {
        background: linear-gradient(135deg,#0b6e4f,#0f9d67 60%,#c9a227);
        color:#fff; padding:48px 40px; text-align:center;
      }
      #pdfExportRoot .pdf-cover h1 { font-size:30px; margin:16px 0 4px; }
      #pdfExportRoot .pdf-cover h2 { font-size:18px; font-weight:400; opacity:.95; margin:0 0 6px; }
      #pdfExportRoot .pdf-cover .badge-row { margin-top:18px; display:flex; justify-content:center; gap:10px; flex-wrap:wrap; }
      #pdfExportRoot .pdf-cover .badge-row span {
        background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.5);
        border-radius:20px; padding:6px 16px; font-size:13px;
      }
      #pdfExportRoot .pdf-avatar {
        width:100px; height:100px; border-radius:50%; object-fit:cover;
        border:4px solid #fff; margin-bottom:10px; background:#fff;
      }
      #pdfExportRoot .pdf-section { padding:26px 36px; border-bottom:1px solid #eee; }
      #pdfExportRoot .pdf-section h3 {
        font-size:20px; margin:0 0 16px; color:#0b6e4f; display:flex; align-items:center; gap:8px;
        border-bottom:2px solid #c9a227; padding-bottom:8px;
      }
      #pdfExportRoot .pdf-empty { color:#999; font-size:14px; }
      #pdfExportRoot .pdf-grid { display:flex; flex-wrap:wrap; gap:14px; }
      #pdfExportRoot .pdf-card {
        width:260px; border:1px solid #e3e3ee; border-radius:12px; overflow:hidden;
        background:#fbfbfe; box-shadow:0 2px 4px rgba(0,0,0,.04);
      }
      #pdfExportRoot .pdf-card .pdf-img-wrap {
        width:100%; height:170px; background:#f1f1f6; display:flex; align-items:center; justify-content:center; overflow:hidden;
      }
      #pdfExportRoot .pdf-card img { width:100%; height:100%; object-fit:cover; }
      #pdfExportRoot .pdf-card .pdf-icon-big { font-size:46px; }
      #pdfExportRoot .pdf-card .pdf-card-body { padding:10px 12px; }
      #pdfExportRoot .pdf-card .pdf-card-title { font-size:14px; font-weight:700; margin:0 0 4px; }
      #pdfExportRoot .pdf-card .pdf-card-meta { font-size:11px; color:#666; }
      #pdfExportRoot .pdf-card .pdf-link-tag {
        display:inline-block; margin-top:6px; font-size:11px; color:#0b6e4f; font-weight:700;
      }
      #pdfExportRoot .pdf-list-row {
        display:flex; justify-content:space-between; align-items:center;
        border:1px solid #e3e3ee; border-radius:10px; padding:10px 14px; margin-bottom:10px; background:#fbfbfe;
      }
      #pdfExportRoot .pdf-stats { display:flex; gap:14px; flex-wrap:wrap; padding:20px 36px; background:#f7f9fb; }
      #pdfExportRoot .pdf-stat { flex:1; min-width:110px; text-align:center; background:#fff; border-radius:10px; padding:14px; border:1px solid #eee; }
      #pdfExportRoot .pdf-stat b { display:block; font-size:22px; color:#0b6e4f; }
      #pdfExportRoot .pdf-stat span { font-size:12px; color:#666; }
      #pdfExportRoot .pdf-footer { text-align:center; padding:18px; font-size:11px; color:#999; }
    </style>

    <div class="pdf-cover">
      ${p.avatar_url ? `<img class="pdf-avatar" src="${p.avatar_url}" crossorigin="anonymous" />` : ""}
      <h1>${_pdfEsc(p.full_name || "ملف الإنجاز")}</h1>
      <h2>${_pdfEsc(p.subject || "")}${p.stage ? " — " + _pdfEsc(p.stage) : ""}</h2>
      <div class="badge-row">
        ${p.school ? `<span>🏫 ${_pdfEsc(p.school)}</span>` : ""}
        <span>📅 ${_pdfFormatDate(new Date().toISOString())}</span>
      </div>
    </div>

    <div class="pdf-stats">
      <div class="pdf-stat"><b>${data.certificates.length}</b><span>شهادات</span></div>
      <div class="pdf-stat"><b>${data.courses.length}</b><span>دورات تدريبية</span></div>
      <div class="pdf-stat"><b>${data.visits.length}</b><span>زيارات صفية</span></div>
      <div class="pdf-stat"><b>${data.files.length}</b><span>ملفات شواهد</span></div>
      <div class="pdf-stat"><b>${data.criteria.length}</b><span>شواهد المعايير</span></div>
    </div>

    <div class="pdf-section">
      <h3>📅 الجدول الدراسي</h3>
      ${_pdfFileGrid(data.schedule, (s) => "صورة الجدول")}
    </div>

    <div class="pdf-section">
      <h3>🏅 الشهادات</h3>
      ${_pdfFileGrid(data.certificates, (c) => c.title || "شهادة", (c) => _pdfMeta([c.issuer, c.issue_date && _pdfFormatDate(c.issue_date)]))}
    </div>

    <div class="pdf-section">
      <h3>🎓 الدورات التدريبية</h3>
      ${_pdfFileGrid(data.courses, (c) => c.title || "دورة", (c) => _pdfMeta([c.provider, c.hours && c.hours + " ساعة", c.course_date && _pdfFormatDate(c.course_date)]))}
    </div>

    <div class="pdf-section">
      <h3>🚪 الزيارات الصفية</h3>
      ${
        data.visits.length
          ? data.visits.map((v) => `
            <div class="pdf-list-row">
              <div><b>${_pdfEsc(v.visitor_name || "زائر")}</b> — ${_pdfFormatDate(v.visit_date)}${v.notes ? `<div style="font-size:12px;color:#666;margin-top:4px;">${_pdfEsc(v.notes)}</div>` : ""}</div>
              ${v.rating != null ? `<span style="background:#0b6e4f;color:#fff;border-radius:14px;padding:4px 12px;font-size:12px;">⭐ ${v.rating}/100</span>` : ""}
            </div>`).join("")
          : `<p class="pdf-empty">لا توجد زيارات مسجّلة</p>`
      }
    </div>

    <div class="pdf-section">
      <h3>📊 التقييم الأدائي</h3>
      ${
        data.evaluations.length
          ? data.evaluations.map((ev) => `
            <div class="pdf-list-row">
              <div><b>${_pdfEsc(ev.period || "تقييم")}</b>${ev.notes ? `<div style="font-size:12px;color:#666;margin-top:4px;">${_pdfEsc(ev.notes)}</div>` : ""}</div>
              ${ev.score != null ? `<span style="background:#c9a227;color:#fff;border-radius:14px;padding:4px 12px;font-size:12px;">${ev.score}/100</span>` : ""}
            </div>`).join("")
          : `<p class="pdf-empty">لا توجد تقييمات مسجّلة</p>`
      }
    </div>

    <div class="pdf-section">
      <h3>🧩 شواهد المعايير</h3>
      ${_pdfCriteriaSections(data.criteria)}
    </div>

    <div class="pdf-section" style="border-bottom:none;">
      <h3>📂 ملفات الشواهد العامة</h3>
      ${_pdfFileGrid(data.files, (f) => f.file_name || "ملف", (f) => _pdfMeta([f.category, f.uploaded_at && _pdfFormatDate(f.uploaded_at)]))}
    </div>

    <div class="pdf-footer">تم إنشاء هذا الملف تلقائيًا من منصة ملف إنجاز المعلمة — ${_pdfFormatDate(new Date().toISOString())}</div>
  `;

  return wrap;
}

function _pdfCriteriaSections(criteria) {
  if (!criteria.length) return `<p class="pdf-empty">لا توجد شواهد مضافة على المعايير بعد</p>`;
  const byCriterion = {};
  criteria.forEach((c) => {
    const key = c.criterion_id || "other-criteria";
    (byCriterion[key] = byCriterion[key] || []).push(c);
  });
  return Object.keys(byCriterion)
    .map((key) => {
      const label = PDF_CRITERIA_LABELS[key] || key.replace(/-/g, " ");
      return `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:14px; color:#3d3568; margin-bottom:8px;">▸ ${_pdfEsc(label)}</div>
          ${_pdfFileGrid(byCriterion[key], (e) => e.title || label)}
        </div>`;
    })
    .join("");
}

function _pdfMeta(parts) {
  return parts.filter(Boolean).join(" · ");
}

function _pdfFileGrid(items, titleFn, metaFn) {
  if (!items || !items.length) return `<p class="pdf-empty">لا توجد بيانات مضافة بعد</p>`;
  return `<div class="pdf-grid">
    ${items
      .map((item) => {
        const isImg = _pdfIsImage(item.file_type, item.file_url);
        const title = titleFn ? titleFn(item) : "ملف";
        const meta = metaFn ? metaFn(item) : "";
        const url = item.file_url || "";
        return `
        <div class="pdf-card" ${url ? `data-pdf-link="${_pdfEsc(url)}"` : ""}>
          <div class="pdf-img-wrap">
            ${
              isImg && url
                ? `<img src="${_pdfEsc(url)}" crossorigin="anonymous" data-original-src="${_pdfEsc(url)}" />`
                : `<span class="pdf-icon-big">${_pdfIconForFileType(item.file_type, url)}</span>`
            }
          </div>
          <div class="pdf-card-body">
            <p class="pdf-card-title">${_pdfEsc(title)}</p>
            ${meta ? `<p class="pdf-card-meta">${_pdfEsc(meta)}</p>` : ""}
            ${url ? `<span class="pdf-link-tag">🔗 اضغط لفتح الملف الأصلي</span>` : ""}
          </div>
        </div>`;
      })
      .join("")}
  </div>`;
}

/* ---------------------------------------------------------------------
   3) تحويل كل صورة إلى Data URL حتى تظهر بشكل صحيح داخل الـ PDF
   --------------------------------------------------------------------- */
async function pdfPreloadImages(container) {
  const imgs = Array.from(container.querySelectorAll("img[data-original-src], img.pdf-avatar"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("data-original-src") || img.getAttribute("src");
      try {
        const res = await fetch(src, { mode: "cors" });
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        img.src = dataUrl;
      } catch (e) {
        const wrap = img.closest(".pdf-img-wrap");
        if (wrap) wrap.innerHTML = `<span class="pdf-icon-big">🖼️</span>`;
      }
    })
  );
  await new Promise((r) => setTimeout(r, 150));
}

/* ---------------------------------------------------------------------
   4) تحويل الحاوية إلى PDF متعدد الصفحات مع روابط قابلة للنقر فعليًا
   --------------------------------------------------------------------- */
async function pdfRenderContainer(container, data) {
  const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const mmPerPx = pageWidth / container.offsetWidth;

  const imgWidth = pageWidth;
  const imgHeight = canvas.height * (imgWidth / canvas.width);
  const totalPages = Math.max(1, Math.ceil(imgHeight / pageHeight));
  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  const containerRect = container.getBoundingClientRect();
  const linkEls = Array.from(container.querySelectorAll("[data-pdf-link]"));
  const links = linkEls.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      url: el.getAttribute("data-pdf-link"),
      topMm: (r.top - containerRect.top) * mmPerPx,
      leftMm: (r.left - containerRect.left) * mmPerPx,
      widthMm: r.width * mmPerPx,
      heightMm: r.height * mmPerPx,
    };
  });

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();
    const position = -page * pageHeight;
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);

    const pageTopMm = page * pageHeight;
    const pageBottomMm = pageTopMm + pageHeight;
    links.forEach((l) => {
      const linkTop = l.topMm;
      const linkBottom = l.topMm + l.heightMm;
      if (linkBottom <= pageTopMm || linkTop >= pageBottomMm) return;
      const clippedTop = Math.max(linkTop, pageTopMm) - pageTopMm;
      const clippedBottom = Math.min(linkBottom, pageBottomMm) - pageTopMm;
      const h = clippedBottom - clippedTop;
      if (h <= 0) return;
      try {
        pdf.link(l.leftMm, clippedTop, l.widthMm, h, { url: l.url });
      } catch (e) {}
    });
  }

  const teacherName = (data.profile && data.profile.full_name) || "ملف_الإنجاز";
  pdf.save(`ملف_إنجاز_${teacherName}.pdf`);
}

/* ---------------------------------------------------------------------
   أدوات مساعدة محلية
   --------------------------------------------------------------------- */
function _pdfEsc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _pdfFormatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch (e) {
    return "";
  }
}

function _pdfIsImage(fileType, url) {
  if (fileType && fileType.startsWith("image/")) return true;
  if (!fileType && url && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url)) return true;
  return false;
}

function _pdfIconForFileType(fileType, url) {
  const t = (fileType || url || "").toLowerCase();
  if (t.includes("pdf")) return "📄";
  if (t.includes("word") || t.includes(".doc")) return "📝";
  if (t.includes("sheet") || t.includes(".xls")) return "📊";
  if (t.includes("presentation") || t.includes(".ppt")) return "📽️";
  return "📁";
}
