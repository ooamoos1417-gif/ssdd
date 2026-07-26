/* =====================================================================
   منطق لوحة تحكم المعلم
   ===================================================================== */

let currentUser = null;
let currentProfile = null;

(async function init() {
  const auth = await requireRole("teacher");
  if (!auth) return;
  currentUser = auth.session.user;

  await loadProfile();
  await loadSubscriptionInfo();
  bindNav();
  bindSidebarToggle();
  bindModals();
  bindLogout();
  bindEvidenceUpload();
  bindEntityForms();
  bindShareForm();

  await Promise.all([
    loadEvidenceFiles(),
    loadSchedule(),
    loadCertificates(),
    loadCourses(),
    loadVisits(),
    loadEvaluations(),
    loadShareLinks(),
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
  zone.addEventListener("drop", (e) => handleEvidenceFiles(e.dataTransfer.files));
  input.addEventListener("change", (e) => handleEvidenceFiles(e.target.files));
  document.getElementById("evidenceCategoryFilter").addEventListener("change", loadEvidenceFiles);
}

async function handleEvidenceFiles(fileList) {
  const category = document.getElementById("evidenceCategoryInput").value;
  const files = Array.from(fileList);
  if (!files.length) return;

  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) { showToast(`الملف "${file.name}" أكبر من 20 ميجابايت`, "error"); continue; }
    try {
      showToast(`جاري رفع ${file.name} ...`, "info");
      const { url, path } = await uploadEvidenceFile(file, currentUser.id, "evidence");
      const { error } = await supabaseClient.from("evidence_files").insert({
        teacher_id: currentUser.id, file_name: file.name, category,
        file_url: url, file_path: path, file_type: file.type, file_size: file.size,
      });
      if (error) throw error;
      showToast(`تم رفع ${file.name}`, "success");
    } catch (err) {
      console.error(err);
      showToast(`تعذّر رفع ${file.name}`, "error");
    }
  }
  document.getElementById("evidenceFileInput").value = "";
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
  return `
    <div class="file-row">
      <div class="ficon">${iconForFileType(f.file_type || f.file_name)}</div>
      <div class="finfo">
        <div class="fname">${escapeHtml(f.file_name)}</div>
        <div class="fmeta">${f.category || "عام"} · ${formatFileSize(f.file_size)} · ${formatDate(f.uploaded_at)}</div>
      </div>
      <div class="factions">
        <a class="icon-btn" href="${f.file_url}" target="_blank" title="فتح/تنزيل">⬇️</a>
        <button class="icon-btn" data-delete-file="${f.id}" data-path="${f.file_path}" title="حذف">🗑️</button>
      </div>
    </div>`;
}

async function deleteEvidenceFileRow(id, path) {
  if (!confirm("هل تريد حذف هذا الملف نهائيًا؟")) return;
  await deleteEvidenceFile(path);
  const { error } = await supabaseClient.from("evidence_files").delete().eq("id", id);
  if (error) return showToast("تعذّر حذف الملف", "error");
  showToast("تم حذف الملف", "success");
  loadEvidenceFiles();
}

/* =====================================================================
   نماذج الأقسام الأخرى
   ===================================================================== */
function bindEntityForms() {
  document.getElementById("scheduleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.from("schedule").insert({
      teacher_id: currentUser.id, day: val("scheduleDay"), period: val("schedulePeriod"),
      class_name: val("scheduleClass"), subject: val("scheduleSubject"),
    });
    if (error) return showToast("تعذّر إضافة الحصة", "error");
    e.target.reset(); closeModal("scheduleModal"); showToast("تمت إضافة الحصة", "success"); loadSchedule();
  });

  document.getElementById("certificateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitWithOptionalFile(e, "certFile", "certificates", {
      title: val("certTitle"), issuer: val("certIssuer"), issue_date: val("certDate") || null,
    }, "certificateModal", loadCertificates);
  });

  document.getElementById("courseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitWithOptionalFile(e, "courseFile", "courses", {
      title: val("courseTitle"), provider: val("courseProvider"), hours: numOrNull("courseHours"), course_date: val("courseDate") || null,
    }, "courseModal", loadCourses);
  });

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

async function submitWithOptionalFile(e, fileInputId, table, fields, modalId, reload) {
  const fileInput = document.getElementById(fileInputId);
  const file = fileInput.files[0];
  let file_url = null, file_path = null;
  try {
    if (file) {
      const uploaded = await uploadEvidenceFile(file, currentUser.id, table);
      file_url = uploaded.url; file_path = uploaded.path;
    }
    const { error } = await supabaseClient.from(table).insert({ teacher_id: currentUser.id, ...fields, file_url, file_path });
    if (error) throw error;
    e.target.reset(); closeModal(modalId); showToast("تمت الإضافة بنجاح", "success"); reload();
  } catch (err) {
    console.error(err); showToast("تعذّرت عملية الإضافة", "error");
  }
}

function val(id) { return document.getElementById(id).value.trim(); }
function numOrNull(id) { const v = document.getElementById(id).value; return v === "" ? null : Number(v); }

async function loadSchedule() {
  const { data, error } = await supabaseClient.from("schedule").select("*").eq("teacher_id", currentUser.id).order("day", { ascending: true });
  if (error) { console.error(error); return; }
  const body = document.getElementById("scheduleTableBody");
  body.innerHTML = data.length ? data.map((s) => `
      <tr>
        <td>${escapeHtml(s.day)}</td><td>${escapeHtml(s.period)}</td><td>${escapeHtml(s.class_name)}</td><td>${escapeHtml(s.subject)}</td>
        <td><button class="icon-btn" onclick="deleteRow('schedule','${s.id}', loadSchedule)">🗑️</button></td>
      </tr>`).join("") : `<tr><td colspan="5"><p class="empty-state">لا توجد حصص مضافة بعد</p></td></tr>`;
}

async function loadCertificates() {
  const { data, error } = await supabaseClient.from("certificates").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("statCerts").textContent = data.length;
  document.getElementById("certificatesGrid").innerHTML = data.length ? data.map((c) => `
      <div class="card list-card">
        <div class="top"><h3>🏅 ${escapeHtml(c.title)}</h3><button class="icon-btn" onclick="deleteRow('certificates','${c.id}', loadCertificates, '${c.file_path || ""}')">🗑️</button></div>
        <div class="meta-row">${c.issuer ? `<span class="badge">${escapeHtml(c.issuer)}</span>` : ""}${c.issue_date ? `<span class="badge gold">${formatDate(c.issue_date)}</span>` : ""}</div>
        ${c.file_url ? `<a class="btn btn-outline btn-sm" href="${c.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
      </div>`).join("") : `<p class="empty-state">لا توجد شهادات مضافة بعد</p>`;
}

async function loadCourses() {
  const { data, error } = await supabaseClient.from("courses").select("*").eq("teacher_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { console.error(error); return; }
  document.getElementById("statCourses").textContent = data.length;
  document.getElementById("coursesGrid").innerHTML = data.length ? data.map((c) => `
      <div class="card list-card">
        <div class="top"><h3>🎓 ${escapeHtml(c.title)}</h3><button class="icon-btn" onclick="deleteRow('courses','${c.id}', loadCourses, '${c.file_path || ""}')">🗑️</button></div>
        <div class="meta-row">
          ${c.provider ? `<span class="badge">${escapeHtml(c.provider)}</span>` : ""}
          ${c.hours ? `<span class="badge gold">${c.hours} ساعة</span>` : ""}
          ${c.course_date ? `<span class="badge">${formatDate(c.course_date)}</span>` : ""}
        </div>
        ${c.file_url ? `<a class="btn btn-outline btn-sm" href="${c.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
      </div>`).join("") : `<p class="empty-state">لا توجد دورات مضافة بعد</p>`;
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
