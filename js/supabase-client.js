/* =====================================================================
   إعداد اتصال Supabase (مصادقة حقيقية — بدون تسجيل ذاتي)
   ضع بيانات مشروعك هنا من: Supabase Dashboard → Project Settings → API
   ===================================================================== */

const SUPABASE_URL = "https://illvlyyewpsfdliobfyn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsbHZseXlld3BzZmRsaW9iZnluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc2ODAsImV4cCI6MjEwMDY1MzY4MH0.u5y39noWjqXXYJ3BJlAT7Edwm_L5g59HOuLaRkaK_l8";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EVIDENCE_BUCKET = "evidence-files";

/* ---------------------------------------------------------------------
   دوال مساعدة عامة
   --------------------------------------------------------------------- */

function showToast(message, type = "info") {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// يتأكد من وجود جلسة دخول فعّالة، ويُعيد التوجيه لصفحة الدخول إن لم توجد
async function requireSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = "index.html";
    return null;
  }
  return data.session;
}

// يتأكد أن المستخدم الحالي معلّق حسابه أو أدمن حسب الحاجة، ويوجّه تلقائيًا
// للوحة الصحيحة (المعلم إلى dashboard، الأدمن إلى admin)
async function requireRole(expectedRole) {
  const session = await requireSession();
  if (!session) return null;

  const { data: account, error } = await supabaseClient
    .from("accounts")
    .select("role, suspended, subscription_status, subscription_end_date")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !account) {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
    return null;
  }

  if (account.suspended) {
    showToast("تم إيقاف هذا الحساب. تواصل مع إدارة المنصة.", "error");
    await supabaseClient.auth.signOut();
    setTimeout(() => (window.location.href = "index.html"), 1500);
    return null;
  }

  if (account.role !== expectedRole) {
    window.location.href = account.role === "admin" ? "admin.html" : "dashboard.html";
    return null;
  }

  return { session, account };
}

// رفع ملف إلى حاوية الشواهد ضمن مجلد المعلم، وإرجاع رابط عام له
async function uploadEvidenceFile(file, teacherId, subFolder = "") {
  const cleanName = file.name.replace(/[^\w.\-\u0600-\u06FF]/g, "_");
  const path = `${teacherId}/${subFolder ? subFolder + "/" : ""}${Date.now()}_${cleanName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (uploadError) throw uploadError;

  const { data } = supabaseClient.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function deleteEvidenceFile(path) {
  if (!path) return;
  await supabaseClient.storage.from(EVIDENCE_BUCKET).remove([path]);
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  const units = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function iconForFileType(typeOrName = "") {
  const t = (typeOrName || "").toLowerCase();
  if (t.includes("pdf")) return "📕";
  if (t.includes("word") || t.includes(".doc")) return "📘";
  if (t.includes("sheet") || t.includes(".xls") || t.includes("excel")) return "📗";
  if (t.includes("image") || /\.(png|jpe?g|gif|webp)$/i.test(t)) return "🖼️";
  return "📄";
}

function initials(name = "") {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed.charAt(0) : "م";
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// توليد كلمة مرور مبدئية عشوائية قوية (يستخدمها الأدمن عند إنشاء حساب معلم)
function generateStrongPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pass = "";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) pass += chars[array[i] % chars.length];
  return pass;
}
