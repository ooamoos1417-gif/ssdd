/* =====================================================================
   منطق لوحة تحكم المعلم
   ===================================================================== */

let currentUser = null;
let currentProfile = null;

(async function init() {
  const auth = await requireRole("teacher");
  if (!auth) return;
  currentUser = auth.session.user;

  fixFileInputAccept();
  await loadProfile();
  loadShowcaseContent();
  await loadSubscriptionInfo();
  bindNav();
  bindSidebarToggle();
  bindModals();
  bindLogout();
  bindEvidenceUpload();
  bindEntityForms();
  bindScheduleUpload();
  bindCertificateUpload();
  bindCourseUpload();
  bindShareForm();
  bindCriterionUpload();
  bindShowcaseForm();
  bindShowcaseAvatarUpload();

  await Promise.all([
    loadEvidenceFiles(),
    loadSchedule(),
    loadCertificates(),
    loadCourses(),
    loadVisits(),
    loadEvaluations(),
    loadShareLinks(),
    loadCriteriaGrid(),
  ]);
})();

/* ---------------------- التنقّل ---------------------- */
function bindNav() {
  const links = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".section");
  const topbarTitle = document.getElementById("topbarTitle");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.dataset.target;
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      sections.forEach((s) => (s.style.display = s.id === targetId ? "block" : "none"));
      topbarTitle.textContent = link.textContent.trim();
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("sidebarOverlay").classList.remove("show");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  sections.forEach((s) => (s.style.display = s.id === "home" ? "block" : "none"));
}

function bindSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  document.getElementById("menuToggle").addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.classList.add("show");
  });
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });
}

function bindLogout() {
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
}

function bindModals() {
  document.querySelectorAll("[data-modal]").forEach((btn) => {
    btn.addEventListener("click", () => document.getElementById(btn.dataset.modal).classList.add("show"));
  });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".modal-overlay").classList.remove("show"));
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("show"); });
  });
}
function closeModal(id) { document.getElementById(id).classList.remove("show"); }

/* =====================================================================
   تجهيز الملفات قبل الرفع
   - يقبل ملفات بأسماء عربية أو إنجليزية (الاسم الأصلي يبقى للعرض،
     والاسم المستخدم في التخزين يكون إنجليزيًا آمنًا)
   - يعالج جوالات سامسونج (ملفات بدون نوع، صور كبيرة جدًا)
   ===================================================================== */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT = {
  pdf: "application/pdf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const EXT_BY_MIME = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
  "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// نزيل قيد accept حتى تظهر كل الملفات في نافذة الاختيار على جوالات سامسونج،
// ونتحقق من نوع الملف بعد الاختيار بدل ذلك.
function fixFileInputAccept() {
  document.querySelectorAll('input[type="file"]').forEach((input) => input.removeAttribute("accept"));
}

function getFileExt(name) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}

// تصغير الصور الكبيرة (صور جوالات سامسونج غالبًا كبيرة جدًا)
async function compressImageIfNeeded(file) {
  if (!file.type.startsWith("image/") || /gif|svg|heic|heif/.test(file.type)) return file;
  if (file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const img = await loadImageFromFile(file);
    const maxSide = 2400;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "image.jpg", { type: "image/jpeg" });
  } catch (e) {
    return file;
  }
}

async function prepareFileForUpload(raw) {
  let file = raw;
  const ext0 = getFileExt(raw.name);
  const type = raw.type || MIME_BY_EXT[ext0] || "";

  const allowed = type.startsWith("image/") || EXT_BY_MIME[type] || MIME_BY_EXT[ext0];
  if (!allowed) throw new Error("نوع الملف غير مدعوم (المسموح: PDF وصور وWord وExcel)");

  if (type !== raw.type) file = new File([raw], raw.name, { type });
  file = await compressImageIfNeeded(file);

  const ext = getFileExt(file.name) || EXT_BY_MIME[file.type] || "bin";
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return new File([file], safeName, { type: file.type });
}

async function safeUpload(rawFile, folder) {
  const file = await prepareFileForUpload(rawFile);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("حجم الملف أكبر من 20 ميجابايت");
  const { url, path } = await uploadEvidenceFile(file, currentUser.id, folder);
  return { url, path, type: file.type, size: file.size };
}

function uploadFailMessage(name, err) {
  const msg = err && err.message ? err.message : "";
  const arabicReason = /[\u0600-\u06FF]/.test(msg) ? ` — ${msg}` : "";
  return `تعذّر رفع ${name}${arabicReason}`;
}

/* ---------------------- أداة عامة: إضافة رابط بدل رفع ملف ---------------------- */
function bindLinkAdd(inputId, btnId, handler) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  const submit = () => {
    const url = input.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      showToast("الرجاء إدخال رابط صحيح يبدأ بـ http:// أو https://", "error");
      return;
    }
    handler(url);
    input.value = "";
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
}

/* ---------------------- الملف الشخصي وحالة الاشتراك ---------------------- */
async function loadProfile() {
  const { data } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
  currentProfile = data || { full_name: "", subject: "", school: "", stage: "" };

  const name = currentProfile.full_name || currentUser.email;
  document.getElementById("sidebarName").textContent = name;
  document.getElementById("sidebarRole").textContent = currentProfile.subject || "معلم";
  document.getElementById("avatarInitial").textContent = initials(name);
}

async function loadSubscriptionInfo() {
  const box = document.getElementById("subscriptionInfo");
  const { data: account } = await supabaseClient
    .from("accounts")
    .select("subscription_status, subscription_end_date")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (!account) { box.textContent = "تعذّر تحميل حالة الاشتراك"; return; }

  const statusLabel = { active: "نشط ✅", expired: "منتهي ⛔", trial: "تجربة ⏳" }[account.subscription_status] || account.subscription_status;
  box.innerHTML = `
    <div><b>الحالة:</b> ${statusLabel}</div>
    <div style="margin-top:6px;"><b>ينتهي في:</b> ${account.subscription_end_date ? formatDate(account.subscription_end_date) : "غير محدد"}</div>
  `;
}

/* =====================================================================
   ملفات الشواهد
   ===================================================================== */
function bindEvidenceUpload() {
  const zone = document.getElementById("evidenceDropZone");
  const input = document.getElementById("evidenceFileInput");

  document.getElementById("browseEvidence").addEventListener("click", () => input.click());
  zone.addEventListener("click", (e) => { if (e.target === zone) input.click(); });
  ["dragenter", "dragover"].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => handleEvidenceFiles(Array.from(e.dataTransfer.files)));
  input.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    handleEvidenceFiles(files);
  });
  document.getElementById("evidenceCategoryFilter").addEventListener("change", loadEvidenceFiles);

  bindLinkAdd("evidenceLinkInput", "addEvidenceLinkBtn", handleEvidenceLink);
}

async function handleEvidenceFiles(fileList) {
  const category = document.getElementById("evidenceCategoryInput").value;
  const files = Array.from(fileList);
  if (!files.length) return;

  for (const file of files) {
    try {
      showToast(`جاري رفع ${file.name} ...`, "info");
      const up = await safeUpload(file, "evidence");
      const { error } = await supabaseClient.from("evidence_files").insert({
        teacher_id: currentUser.id, file_name: file.name, category,
        file_url: up.url, file_path: up.path, file_type: up.type, file_size: up.size,
      });
      if (error) throw error;
      showToast(`تم رفع ${file.name}`, "success");
    } catch (err) {
      console.error(err);
      showToast(uploadFailMessage(file.name, err), "error");
    }
  }
  loadEvidenceFiles();
}

async function handleEvidenceLink(url) {
  const category = document.getElementById("evidenceCategoryInput").value;
  const { error } = await supabaseClient.from("evidence_files").insert({
    teacher_id: currentUser.id, file_name: url, category,
    file_url: url, file_path: null, file_type: "link", file_size: null,
  });
  if (error) { console.error(error); showToast("تعذّر إضافة الرابط", "error"); return; }
  showToast("تم إضافة الرابط", "success");
  loadEvidenceFiles();
}

async function loadEvidenceFiles() {
  const { data, error } = await supabaseClient.from("evidence_files").select("*").eq("teacher_id", currentUser.id).order("uploaded_at", { ascending: false });
  if (error) { console.error(error); return; }

  const filterSelect = document.getElementById("evidenceCategoryFilter");
  const cats = [...new Set(data.map((f) => f.category || "عام"))];
  const currentFilter = filterSelect.value;
  filterSelect.innerHTML = `<option value="all">كل التصنيفات</option>` + cats.map((c) => `<option value="${c}">${c}</option>`).join("");
  filterSelect.value = cats.includes(currentFilter) ? currentFilter : "all";

  const filtered = filterSelect.value === "all" ? data : data.filter((f) => f.category === filterSelect.value);
  const list = document.getElementById("evidenceList");
  list.innerHTML = filtered.length ? filtered.map(fileRowHtml).join("") : `<p class="empty-state"><span class="icon">📂</span>لا توجد ملفات في هذا التصنيف</p>`;
  list.querySelectorAll("[data-delete-file]").forEach((btn) => btn.addEventListener("click", () => deleteEvidenceFileRow(btn.dataset.deleteFile, btn.dataset.path)));

  document.getElementById("statFiles").textContent = data.length;
}

function fileRowHtml(f) {
  const isLink = f.file_type === "link";
  return `
    <div class="file-row">
      <div class="ficon">${isLink ? "🔗" : iconForFileType(f.file_type || f.file_name)}</div>
      <div class="finfo">
        <div class="fname">${isLink ? "رابط خارجي" : escapeHtml(f.file_name)}</div>
        <div class="fmeta">${f.category || "عام"} · ${isLink ? "رابط" : formatFileSize(f.file_size)} · ${formatDate(f.uploaded_at)}</div>
      </div>
      <div class="factions">
        <a class="icon-btn" href="${f.file_url}" target="_blank" title="${isLink ? "فتح الرابط" : "فتح/تنزيل"}">${isLink ? "🔗" : "⬇️"}</a>
        <button class="icon-btn" data-delete-file="${f.id}" data-path="${f.file_path || ""}" title="حذف">🗑️</button>
      </div>
    </div>`;
}

async function deleteEvidenceFileRow(id, path) {
  if (!confirm("هل تريد حذف هذا الملف نهائيًا؟")) return;
  if (path) await deleteEvidenceFile(path);
  const { error } = await supabaseClient.from("evidence_files").delete().eq("id", id);
  if (error) return showToast("تعذّر حذف الملف", "error");
  showToast("تم حذف الملف", "success");
  loadEvidenceFiles();
}

/* =====================================================================
   نماذج الأقسام الأخرى
   ===================================================================== */
function bindEntityForms() {
  document.getElementById("visitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.from("classroom_visits").insert({
      teacher_id: currentUser.id, visitor_name: val("visitVisitor"), visit_date: val("visitDate") || null,
      rating: numOrNull("visitRating"), notes: val("visitNotes"),
    });
    if (error) return showToast("تعذّر إضافة الزيارة", "error");
    e.target.reset(); closeModal("visitModal"); showToast("تمت إضافة الزيارة", "success"); loadVisits();
  });

  document.getElementById("evaluationForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.from("evaluations").insert({
      teacher_id: currentUser.id, period: val("evalPeriod"), score: numOrNull("evalScore"), notes: val("evalNotes"),
    });
    if (error) return showToast("تعذّر إضافة التقييم", "error");
    e.target.reset(); closeModal("evaluationModal"); showToast("تمت إضافة التقييم", "success"); loadEvaluations();
  });
}

function val(id) { return document.getElementById(id).value.trim(); }
function numOrNull(id) { const v = document.getElementById(id).value; return v === "" ? null : Number(v); }

/* ---------------------- رفع مباشر بدون نص: الجدول/الشهادات/الدورات ---------------------- */
function bindDropZoneUpload(zoneId, inputId, browseId, handler) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  document.getElementById(browseId).addEventListener("click", () => input.click());
  zone.addEventListener("click", (e) => { if (e.target === zone) input.click(); });
  ["dragenter", "dragover"].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => handler(Array.from(e.dataTransfer.files)));
  input.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    input.value = "";
    handler(files);
  });
}

function bindScheduleUpload() {
  bindDropZoneUpload("scheduleDropZone", "scheduleFileInput", "browseSchedule", handleScheduleFiles);
  bindLinkAdd("scheduleLinkInput", "addScheduleLinkBtn", handleScheduleLink);
}
function bindCertificateUpload() {
  bindDropZoneUpload("certificateDropZone", "certificateFileInput", "browseCertificate", handleCertificateFiles);
  bindLinkAdd("certificateLinkInput", "addCertificateLinkBtn", handleCertificateLink);
}
function bindCourseUpload() {
  bindDropZoneUpload("courseDropZone", "courseFileInput", "browseCourse", handleCourseFiles);
  bindLinkAdd("courseLinkInput", "addCourseLinkBtn", handleCourseLink);
}

async function handleScheduleFiles(fileList) {
  let ok = false;
  for (const file of Array.from(fileList)) {
    try {
      showToast(`جاري رفع ${file.name} ...`, "info");
      const up = await safeUpload(file, "schedule");
      const { error } = await supabaseClient.from("schedule").insert({
        teacher_id: currentUser.id, day: "", period: "", class_name: "", subject: "",
        file_url: up.url, file_path: up.path, file_type: up.type,
      });
      if (error) throw error;
      ok = true;
    } catch (err) {
      console.error(err); showToast(uploadFailMessage(file.name, err), "error");
    }
  }
  if (ok) showToast("تم رفع الجدول", "success");
  loadSchedule();
}

async function handleScheduleLink(url) {
  const { error } = await supabaseClient.from("schedule").insert({
    teacher_id: currentUser.id, day: "", period: "", class_name: "", subject: "",
    file_url: url, file_path: null, file_type: "link",
  });
  if (error) { console.error(error); showToast("تعذّر إضافة الرابط", "error"); return; }
  showToast("تم إضافة رابط الجدول", "success");
  loadSchedule();
}

async function handleCertificateFiles(fileList) {
  let ok = false;
  for (const file of Array.from(fileList)) {
    try {
      showToast(`جاري رفع ${file.name} ...`, "info");
      const up = await safeUpload(file, "certificates");
      const { error } = await supabaseClient.from("certificates").insert({
        teacher_id: currentUser.id, title: file.name, file_url: up.url, file_path: up.path, file_type: up.type,
      });
      if (error) throw error;
      ok = true;
    } catch (err) {
      console.error(err); showToast(uploadFailMessage(file.name, err), "error");
    }
  }
  if (ok) showToast("تم رفع الشهادة", "success");
  loadCertificates();
}

async function handleCertificateLink(url) {
  const { error } = await supabaseClient.from("certificates").insert({
    teacher_id: currentUser.id, title: "رابط خارجي", file_url: url, file_path: null, file_type: "link",
  });
  if (error) { console.error(error); showToast("تعذّر إضافة الرابط", "error"); return; }
  showToast("تم إضافة الرابط", "success");
  loadCertificates();
}

async function handleCourseFiles(fileList) {
  let ok = false;
  for (const file of Array.from(fileList)) {
    try {
      showToast(`جاري رفع ${file.name} ...`, "info");
      const up = await safeUpload(file, "courses");
      const { error } = await supabaseClient.from("courses").insert({
        teacher_id: currentUser.id, title: file.name, file_url: up.url, file_path: up.path, file_type: up.type,
      });
      if (error) throw error;
      ok = true;
    } catch (err) {
      console.error(err); showToast(uploadFailMessage(file.name, err), "error");
    }
  }
  if (ok) showToast("تم رفع الدورة", "success");
  loadCourses();
}

async function handleCourseLink(url) {
  const { error } = await supabaseClient.from("courses").insert({
    teacher_id: currentUser.id, title: "رابط خارجي", file_url: url, file_path: null, file_type: "link",
  });
  if (error) { console.error(error); showToast("تعذّر إضافة الرابط", "error"); return; }
  showToast("تم إضافة الرابط", "success");
  loadCourses();
}

function fileCardHtml(item, table, reloadFnName) {
  const isLink = item.file_type === "link";
  const label = isLink
    ? (item.title && item.title !== "رابط خارجي" ? item.title : "رابط خارجي")
    : (item.file_type && item.file_type.startsWith("image/") ? "صورة" : (item.title || "ملف"));
  return `
    <div class="card list-card">
      <div class="top">
        <h3>${isLink ? "🔗" : iconForFileType(item.file_type || item.title || "")} ${escapeHtml(label)}</h3>
        <button class="icon-btn" onclick="deleteRow('${table}','${item.id}', ${reloadFnName}, '${item.file_path || ""}')">🗑️</button>
      </div>
      <div class="meta-row"><span class="badge">${formatDate(item.created_at)}</span></div>
      ${item.file_url ? `<a class="btn btn-outline btn-sm" href="${item.file_url}" target="_blank">${isLink ? "فتح الرابط 🔗" : "عرض الملف 📄"}</a>` : ""}
    </div>`;
}

async function loadSchedule() {
  const { data, error } = await supabaseClient.from("schedule").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("scheduleGrid").innerHTML = data.length
    ? data.map((s) => fileCardHtml(s, "schedule", "loadSchedule")).join("")
    : `<p class="empty-state">لا توجد صور للجدول بعد</p>`;
}

async function loadCertificates() {
  const { data, error } = await supabaseClient.from("certificates").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("statCerts").textContent = data.length;
  document.getElementById("certificatesGrid").innerHTML = data.length
    ? data.map((c) => fileCardHtml(c, "certificates", "loadCertificates")).join("")
    : `<p class="empty-state">لا توجد شهادات مضافة بعد</p>`;
}

async function loadCourses() {
  const { data, error } = await supabaseClient.from("courses").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("statCourses").textContent = data.length;
  document.getElementById("coursesGrid").innerHTML = data.length
    ? data.map((c) => fileCardHtml(c, "courses", "loadCourses")).join("")
    : `<p class="empty-state">لا توجد دورات مضافة بعد</p>`;
}

async function loadVisits() {
  const { data, error } = await supabaseClient.from("classroom_visits").select("*").eq("teacher_id", currentUser.id).order("visit_date", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("statVisits").textContent = data.length;
  document.getElementById("visitsGrid").innerHTML = data.length ? data.map((v) => `
      <div class="card list-card">
        <div class="top"><h3>🚪 ${escapeHtml(v.visitor_name)}</h3><button class="icon-btn" onclick="deleteRow('classroom_visits','${v.id}', loadVisits)">🗑️</button></div>
        <div class="meta-row"><span class="badge">${formatDate(v.visit_date)}</span>${v.rating != null ? `<span class="rating-pill">⭐ ${v.rating}/100</span>` : ""}</div>
        ${v.notes ? `<p class="notes">${escapeHtml(v.notes)}</p>` : ""}
      </div>`).join("") : `<p class="empty-state">لا توجد زيارات مسجّلة بعد</p>`;
}

async function loadEvaluations() {
  const { data, error } = await supabaseClient.from("evaluations").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("evaluationGrid").innerHTML = data.length ? data.map((ev) => `
      <div class="card list-card">
        <div class="top"><h3>📊 ${escapeHtml(ev.period)}</h3><button class="icon-btn" onclick="deleteRow('evaluations','${ev.id}', loadEvaluations)">🗑️</button></div>
        <div class="meta-row">${ev.score != null ? `<span class="rating-pill">${ev.score}/100</span>` : ""}</div>
        ${ev.notes ? `<p class="notes">${escapeHtml(ev.notes)}</p>` : ""}
      </div>`).join("") : `<p class="empty-state">لا توجد تقييمات مضافة بعد</p>`;
}

async function deleteRow(table, id, reload, filePath) {
  if (!confirm("هل تريد حذف هذا العنصر؟")) return;
  if (filePath) await deleteEvidenceFile(filePath);
  const { error } = await supabaseClient.from(table).delete().eq("id", id);
  if (error) return showToast("تعذّر الحذف", "error");
  showToast("تم الحذف", "success");
  reload();
}

/* =====================================================================
   مشاركة الملف
   ===================================================================== */
function bindShareForm() {
  document.getElementById("shareForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const days = document.getElementById("shareExpiry").value;
    const expiresAt = days === "never" ? null : new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
    const token = generateShareToken();

    const { error } = await supabaseClient.from("share_links").insert({
      teacher_id: currentUser.id, token, expires_at: expiresAt,
    });
    if (error) { showToast("تعذّر إنشاء الرابط", "error"); return; }

    const fullUrl = `${window.location.origin}${window.location.pathname.replace("dashboard.html", "")}share.html?token=${token}`;
    document.getElementById("shareResultLink").value = fullUrl;
    document.getElementById("shareResultBox").style.display = "block";
    document.getElementById("shareForm").style.display = "none";
    showToast("تم إنشاء رابط المشاركة", "success");
    loadShareLinks();
  });

  document.getElementById("copyShareLinkBtn").addEventListener("click", async () => {
    const input = document.getElementById("shareResultLink");
    await navigator.clipboard.writeText(input.value);
    showToast("تم نسخ الرابط", "success");
  });

  document.getElementById("shareModal").addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined || e.target.id === "shareModal") resetShareModal();
  });
  document.querySelector('#shareModal .modal-close').addEventListener("click", resetShareModal);
}

function resetShareModal() {
  document.getElementById("shareForm").reset();
  document.getElementById("shareForm").style.display = "block";
  document.getElementById("shareResultBox").style.display = "none";
}

// توكن عشوائي آمن (256-بت) — غير قابل للتخمين
function generateShareToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadShareLinks() {
  const { data, error } = await supabaseClient.from("share_links").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }

  const body = document.getElementById("shareLinksTableBody");
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="6"><p class="empty-state">لا توجد روابط مشاركة بعد</p></td></tr>`;
    return;
  }

  body.innerHTML = data.map((l) => {
    const status = getShareStatus(l);
    const badgeClass = { active: "success", expired: "warn", disabled: "mute" }[status];
    const badgeLabel = { active: "فعّال", expired: "منتهي", disabled: "معطّل" }[status];
    const url = `${window.location.origin}${window.location.pathname.replace("dashboard.html", "")}share.html?token=${l.token}`;
    return `
      <tr>
        <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:left; font-family:monospace; font-size:11.5px;">${url}</td>
        <td>${formatDate(l.created_at)}</td>
        <td>${l.expires_at ? formatDate(l.expires_at) : "بدون انتهاء"}</td>
        <td>${l.view_count}</td>
        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        <td style="display:flex; gap:6px;">
          <button class="icon-btn" onclick="copyShareUrl('${url}')" title="نسخ">📋</button>
          ${status !== "disabled" ? `<button class="icon-btn" onclick="toggleShareLink('${l.id}', true)" title="تعطيل">🚫</button>` : `<button class="icon-btn" onclick="toggleShareLink('${l.id}', false)" title="تفعيل">✅</button>`}
          <button class="icon-btn" onclick="deleteRow('share_links','${l.id}', loadShareLinks)" title="حذف">🗑️</button>
        </td>
      </tr>`;
  }).join("");
}

function getShareStatus(link) {
  if (link.disabled) return "disabled";
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return "expired";
  return "active";
}

async function copyShareUrl(url) {
  await navigator.clipboard.writeText(url);
  showToast("تم نسخ الرابط", "success");
}

async function toggleShareLink(id, disable) {
  const { error } = await supabaseClient.from("share_links").update({ disabled: disable }).eq("id", id);
  if (error) return showToast("تعذّر تحديث الرابط", "error");
  showToast(disable ? "تم تعطيل الرابط" : "تم تفعيل الرابط", "success");
  loadShareLinks();
}

/* =====================================================================
   المعايير — شواهد غير محدودة لكل معيار
   ===================================================================== */
const CRITERIA = [
  { id: "job-duties", title: "أداء الواجبات الوظيفية" },
  { id: "professional-community", title: "التفاعل مع المجتمع المهني" },
  { id: "parents-interaction", title: "التفاعل مع أولياء الأمور" },
  { id: "teaching-strategies", title: "التنوع في استراتيجيات التدريس" },
  { id: "learners-results", title: "تحسين نتائج المتعلمين" },
  { id: "learning-plan", title: "إعداد وتنفيذ خطة التعلم" },
  { id: "learning-tech", title: "توظيف تقنيات ووسائل التعلم المناسبة" },
  { id: "learning-environment", title: "تهيئة بيئة تعليمية" },
  { id: "classroom-management", title: "الإدارة الصفية" },
  { id: "results-analysis", title: "تحليل نتائج المتعلمين وتشخيص مستوياتهم" },
  { id: "assessment-methods", title: "تنوع أساليب التقويم" },
  { id: "other-criteria", title: "معايير أخرى" },
];

let currentCriterionId = null;
let criterionCounts = {};

// يُحسب عدد شواهد كل معيار دفعة واحدة (استعلام واحد بدل 11 استعلامًا)
async function loadCriteriaGrid() {
  const { data, error } = await supabaseClient
    .from("criteria_evidence")
    .select("criterion_id")
    .eq("teacher_id", currentUser.id);

  if (error) { console.error(error); return; }

  criterionCounts = {};
  data.forEach((row) => { criterionCounts[row.criterion_id] = (criterionCounts[row.criterion_id] || 0) + 1; });

  const grid = document.getElementById("criteriaGrid");
  grid.innerHTML = CRITERIA.map((c) => {
    const count = criterionCounts[c.id] || 0;
    return `
      <div class="card list-card">
        <div class="top">
          <h3>${escapeHtml(c.title)}</h3>
          <span class="badge gold" id="criterionBadge-${c.id}">${count} ${count === 1 ? "شاهد" : "شواهد"}</span>
        </div>
        <button class="btn btn-outline btn-sm" style="width:100%; margin-top:8px;" onclick="openCriterionModal('${c.id}')">
          عرض / إضافة شواهد
        </button>
      </div>`;
  }).join("");
}

function updateCriterionBadge(criterionId) {
  const badge = document.getElementById(`criterionBadge-${criterionId}`);
  if (!badge) return;
  const count = criterionCounts[criterionId] || 0;
  badge.textContent = `${count} ${count === 1 ? "شاهد" : "شواهد"}`;
}

function openCriterionModal(criterionId) {
  currentCriterionId = criterionId;
  const criterion = CRITERIA.find((c) => c.id === criterionId);
  document.getElementById("criterionModalTitle").textContent = criterion ? criterion.title : "—";
  document.getElementById("criterionTitleInput").value = "";
  document.getElementById("criterionModal").classList.add("show");
  loadCriterionEvidence();
}

async function loadCriterionEvidence() {
  const { data, error } = await supabaseClient
    .from("criteria_evidence")
    .select("*")
    .eq("teacher_id", currentUser.id)
    .eq("criterion_id", currentCriterionId)
    .order("uploaded_at", { ascending: false });

  if (error) { console.error(error); return; }

  criterionCounts[currentCriterionId] = data.length;
  updateCriterionBadge(currentCriterionId);
  document.getElementById("criterionEvidenceCount").textContent = `${data.length} ${data.length === 1 ? "شاهد" : "شواهد"}`;

  const list = document.getElementById("criterionEvidenceList");
  list.innerHTML = data.length
    ? data.map((f) => criterionFileRowHtml(f)).join("")
    : `<p class="empty-state">لا توجد شواهد لهذا المعيار بعد</p>`;

  list.querySelectorAll("[data-crit-delete]").forEach((btn) =>
    btn.addEventListener("click", () => deleteCriterionEvidence(btn.dataset.critDelete, btn.dataset.path))
  );
  list.querySelectorAll("[data-crit-edit]").forEach((btn) =>
    btn.addEventListener("click", () => startEditCriterionTitle(btn.dataset.critEdit))
  );
}

function criterionFileRowHtml(f) {
  const isLink = f.file_type === "link";
  return `
    <div class="file-row" id="critRow-${f.id}">
      <div class="ficon">${isLink ? "🔗" : iconForFileType(f.file_type || f.file_name)}</div>
      <div class="finfo">
        <div class="fname" id="critTitle-${f.id}">${escapeHtml(f.title || (isLink ? "رابط خارجي" : f.file_name))}</div>
        <div class="fmeta">${isLink ? "رابط خارجي" : escapeHtml(f.file_name)} · ${formatDate(f.uploaded_at)}</div>
      </div>
      <div class="factions">
        <a class="icon-btn" href="${f.file_url}" target="_blank" title="${isLink ? "فتح الرابط" : "فتح/تنزيل"}">${isLink ? "🔗" : "⬇️"}</a>
        <button class="icon-btn" data-crit-edit="${f.id}" title="تعديل الوصف">✏️</button>
        <button class="icon-btn" data-crit-delete="${f.id}" data-path="${f.file_path || ""}" title="حذف">🗑️</button>
      </div>
    </div>`;
}

function startEditCriterionTitle(id) {
  const titleEl = document.getElementById(`critTitle-${id}`);
  const current = titleEl.textContent;
  titleEl.innerHTML = `
    <div style="display:flex; gap:6px;">
      <input type="text" id="critEditInput-${id}" value="${escapeHtml(current)}" style="flex:1; padding:6px 8px; border:1.5px solid var(--line); border-radius:8px; font-size:13px;" />
      <button class="icon-btn" onclick="saveCriterionTitle('${id}')" title="حفظ">✔️</button>
    </div>`;
  document.getElementById(`critEditInput-${id}`).focus();
}

async function saveCriterionTitle(id) {
  const input = document.getElementById(`critEditInput-${id}`);
  const newTitle = input.value.trim();
  const { error } = await supabaseClient.from("criteria_evidence").update({ title: newTitle }).eq("id", id);
  if (error) { showToast("تعذّر حفظ التعديل", "error"); return; }
  showToast("تم حفظ التعديل", "success");
  loadCriterionEvidence();
}

async function deleteCriterionEvidence(id, path) {
  if (!confirm("هل تريد حذف هذا الشاهد نهائيًا؟")) return;
  if (path) await deleteEvidenceFile(path);
  const { error } = await supabaseClient.from("criteria_evidence").delete().eq("id", id);
  if (error) return showToast("تعذّر حذف الشاهد", "error");
  showToast("تم حذف الشاهد", "success");
  loadCriterionEvidence();
}

function bindCriterionUpload() {
  const zone = document.getElementById("criterionUploadZone");
  const input = document.getElementById("criterionFileInput");

  document.getElementById("browseCriterionFile").addEventListener("click", () => input.click());
  zone.addEventListener("click", (e) => { if (e.target === zone) input.click(); });
  ["dragenter", "dragover"].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((evt) => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => handleCriterionFiles(Array.from(e.dataTransfer.files)));
  input.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    handleCriterionFiles(files);
  });

  bindLinkAdd("criterionLinkInput", "addCriterionLinkBtn", handleCriterionLink);
}

async function handleCriterionFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length || !currentCriterionId) return;
  const title = document.getElementById("criterionTitleInput").value.trim();

  for (const file of files) {
    try {
      showToast(`جاري رفع ${file.name} ...`, "info");
      const up = await safeUpload(file, `criteria/${currentCriterionId}`);
      const { error } = await supabaseClient.from("criteria_evidence").insert({
        teacher_id: currentUser.id, criterion_id: currentCriterionId,
        title: title || "", file_name: file.name, file_url: up.url, file_path: up.path, file_type: up.type,
      });
      if (error) throw error;
      showToast(`تم رفع ${file.name}`, "success");
    } catch (err) {
      console.error(err);
      showToast(uploadFailMessage(file.name, err), "error");
    }
  }
  document.getElementById("criterionTitleInput").value = "";
  loadCriterionEvidence();
}

async function handleCriterionLink(url) {
  if (!currentCriterionId) return;
  const title = document.getElementById("criterionTitleInput").value.trim();
  const { error } = await supabaseClient.from("criteria_evidence").insert({
    teacher_id: currentUser.id, criterion_id: currentCriterionId,
    title: title || "", file_name: url, file_url: url, file_path: null, file_type: "link",
  });
  if (error) { console.error(error); showToast("تعذّر إضافة الرابط", "error"); return; }
  showToast("تم إضافة الرابط", "success");
  document.getElementById("criterionTitleInput").value = "";
  loadCriterionEvidence();
}

/* =====================================================================
   محتوى صفحة العرض التقديمي (المقدمة/الرسالة/الرؤية/رؤية 2030 + الصورة)
   ===================================================================== */
function loadShowcaseContent() {
  document.getElementById("showcaseIntro").value = currentProfile.intro_text || "";
  document.getElementById("showcaseMission").value = currentProfile.mission_text || "";
  document.getElementById("showcaseVision").value = currentProfile.vision_text || "";
  document.getElementById("showcaseVision2030").value = currentProfile.vision2030_text || "";

  const preview = document.getElementById("showcaseAvatarPreview");
  if (currentProfile.avatar_url) {
    preview.innerHTML = `<img src="${currentProfile.avatar_url}" alt="الصورة الشخصية" style="width:100%; height:100%; object-fit:cover;" />`;
  }
}

function bindShowcaseForm() {
  document.getElementById("showcaseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("showcaseSaveBtn");
    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = `<span class="spinner dark"></span>`;

    const { error } = await supabaseClient.from("profiles").update({
      intro_text: val("showcaseIntro"),
      mission_text: val("showcaseMission"),
      vision_text: val("showcaseVision"),
      vision2030_text: val("showcaseVision2030"),
    }).eq("id", currentUser.id);

    btn.disabled = false;
    btn.textContent = original;

    if (error) return showToast("تعذّر حفظ المحتوى", "error");
    showToast("تم حفظ محتوى صفحة العرض", "success");
    await loadProfile();
  });
}

function bindShowcaseAvatarUpload() {
  const input = document.getElementById("showcaseAvatarInput");
  document.getElementById("showcaseAvatarBtn").addEventListener("click", () => input.click());

  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
    if (!looksLikeImage) { showToast("يجب اختيار ملف صورة", "error"); return; }

    try {
      showToast("جاري رفع الصورة...", "info");
      const up = await safeUpload(file, "avatar");
      const { error } = await supabaseClient.from("profiles").update({ avatar_url: up.url }).eq("id", currentUser.id);
      if (error) throw error;
      showToast("تم تحديث الصورة الشخصية", "success");
      await loadProfile();
      loadShowcaseContent();
    } catch (err) {
      console.error(err);
      showToast(uploadFailMessage("الصورة", err), "error");
    }
  });
}
