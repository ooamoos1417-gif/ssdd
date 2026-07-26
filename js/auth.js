/* =====================================================================
   منطق تسجيل الدخول — لا يوجد تسجيل حساب أو استرجاع كلمة مرور في هذا
   التطبيق إطلاقًا. الحسابات تُنشأ حصرًا من لوحة الأدمن.
   ===================================================================== */

const loginForm = document.getElementById("loginForm");
const formMsg = document.getElementById("formMsg");
const loginBtn = document.getElementById("loginBtn");

function showMsg(text, type = "error") {
  formMsg.textContent = text;
  formMsg.className = `form-msg show ${type}`;
}
function hideMsg() {
  formMsg.className = "form-msg";
}
function setLoading(loading) {
  loginBtn.disabled = loading;
  loginBtn.innerHTML = loading ? `<span class="spinner"></span>` : `<span class="btn-label">تسجيل الدخول</span>`;
}

// إن كان هناك جلسة فعّالة بالفعل، وجّهه مباشرة حسب دوره
(async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) return;

  const { data: account } = await supabaseClient
    .from("accounts")
    .select("role, suspended")
    .eq("id", data.session.user.id)
    .maybeSingle();

  if (!account || account.suspended) {
    await supabaseClient.auth.signOut();
    return;
  }
  window.location.href = account.role === "admin" ? "admin.html" : "dashboard.html";
})();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  setLoading(true);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    setLoading(false);
    showMsg(translateAuthError(error.message), "error");
    return;
  }

  // تحقّق من حالة الحساب (إيقاف/دور) قبل التوجيه
  const { data: account, error: accError } = await supabaseClient
    .from("accounts")
    .select("role, suspended")
    .eq("id", data.user.id)
    .maybeSingle();

  setLoading(false);

  if (accError || !account) {
    showMsg("تعذّر العثور على بيانات حسابك. تواصل مع إدارة المنصة.", "error");
    await supabaseClient.auth.signOut();
    return;
  }

  if (account.suspended) {
    showMsg("تم إيقاف هذا الحساب. تواصل مع إدارة المنصة لمزيد من التفاصيل.", "error");
    await supabaseClient.auth.signOut();
    return;
  }

  window.location.href = account.role === "admin" ? "admin.html" : "dashboard.html";
});

function translateAuthError(msg = "") {
  const map = {
    "Invalid login credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "Email not confirmed": "لم يتم تأكيد البريد الإلكتروني بعد — تواصل مع إدارة المنصة",
  };
  return map[msg] || "حدث خطأ غير متوقع، حاول مرة أخرى";
}
