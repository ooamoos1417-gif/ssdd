/* =====================================================================
   منتقي الألوان — تسمح للمعلمة والمديرة باختيار لون واجهتها الخاص
   يعمل تلقائيًا في أي صفحة تحتوي على هذا الملف (لوحة المعلمة أو المديرة)
   ولا يحتاج أي تعديل آخر في الصفحة.
   ===================================================================== */

(function () {
  const PRESETS = [
    "#12897f", // الأخضر الافتراضي
    "#3d3568", // بنفسجي
    "#2f80ed", // أزرق
    "#c2185b", // وردي غامق
    "#c99a3f", // ذهبي
    "#1b4965", // كحلي
    "#2ea36b", // أخضر فاتح
    "#a15c1c", // بني برتقالي
  ];

  let themeStorageMode = null; // "profile" أو "local"
  let currentUid = null;

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState === "complete" || document.readyState === "interactive") init();

  async function init() {
    if (window.__themePickerInitDone) return;
    window.__themePickerInitDone = true;

    injectStyles();
    injectButton();

    try {
      if (typeof supabaseClient === "undefined") return;
      const { data: userData } = await supabaseClient.auth.getUser();
      if (!userData || !userData.user) return;
      currentUid = userData.user.id;

      const { data: profileRow } = await supabaseClient
        .from("profiles")
        .select("id, theme_color")
        .eq("id", currentUid)
        .maybeSingle();

      let savedColor = null;
      if (profileRow) {
        themeStorageMode = "profile";
        savedColor = profileRow.theme_color;
      } else {
        themeStorageMode = "local";
        savedColor = localStorage.getItem("admin_theme_color");
      }

      if (savedColor) applyTheme(savedColor);
    } catch (e) {
      console.error("theme-picker init error", e);
    }
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #themePickerBtn{
        position:fixed; bottom:22px; left:22px; z-index:500;
        width:52px; height:52px; border-radius:50%; border:none; cursor:pointer;
        background:linear-gradient(135deg, var(--brand-600,#12897f), var(--brand-700,#0f766e));
        color:#fff; font-size:22px; box-shadow:0 10px 24px rgba(0,0,0,.25);
        display:flex; align-items:center; justify-content:center; transition:transform .15s ease;
      }
      #themePickerBtn:hover{ transform:scale(1.08); }
      #themePickerPanel{
        position:fixed; bottom:84px; left:22px; z-index:500;
        background:#fff; border-radius:16px; padding:18px; width:230px;
        box-shadow:0 20px 45px rgba(0,0,0,.22); border:1px solid #eee;
        display:none; direction:rtl; font-family:inherit;
      }
      #themePickerPanel.show{ display:block; }
      #themePickerPanel h4{ font-size:14px; margin:0 0 12px; color:#333; }
      #themePickerSwatches{ display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
      .tp-swatch{
        width:32px; height:32px; border-radius:50%; cursor:pointer; border:2px solid #fff;
        box-shadow:0 0 0 1.5px #ddd; transition:transform .12s ease;
      }
      .tp-swatch:hover{ transform:scale(1.12); }
      .tp-swatch.active{ box-shadow:0 0 0 2.5px #333; }
      #themePickerCustomRow{ display:flex; align-items:center; gap:8px; margin-bottom:10px; }
      #themePickerCustomRow input[type=color]{
        width:34px; height:34px; border:none; padding:0; border-radius:8px; cursor:pointer; background:none;
      }
      #themePickerCustomRow span{ font-size:12.5px; color:#666; }
      #themePickerReset{
        width:100%; padding:8px; border-radius:8px; border:1px solid #ddd; background:#f7f7fa;
        font-size:12.5px; color:#555; cursor:pointer;
      }
      #themePickerReset:hover{ background:#eee; }
    `;
    document.head.appendChild(style);
  }

  function injectButton() {
    const btn = document.createElement("button");
    btn.id = "themePickerBtn";
    btn.type = "button";
    btn.title = "تغيير ألوان الواجهة";
    btn.innerHTML = "🎨";
    document.body.appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "themePickerPanel";
    panel.innerHTML = `
      <h4>اختاري لون الواجهة</h4>
      <div id="themePickerSwatches">
        ${PRESETS.map((c) => `<span class="tp-swatch" data-color="${c}" style="background:${c}"></span>`).join("")}
      </div>
      <div id="themePickerCustomRow">
        <input type="color" id="themePickerCustom" value="#12897f" />
        <span>لون مخصص</span>
      </div>
      <button id="themePickerReset" type="button">استعادة اللون الافتراضي</button>
    `;
    document.body.appendChild(panel);

    btn.addEventListener("click", () => panel.classList.toggle("show"));
    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove("show");
    });

    panel.querySelectorAll(".tp-swatch").forEach((sw) => {
      sw.addEventListener("click", () => selectColor(sw.dataset.color));
    });
    document.getElementById("themePickerCustom").addEventListener("input", (e) => selectColor(e.target.value));
    document.getElementById("themePickerReset").addEventListener("click", () => selectColor(null));
  }

  async function selectColor(hex) {
    applyTheme(hex);
    markActiveSwatch(hex);
    await saveTheme(hex);
  }

  function markActiveSwatch(hex) {
    document.querySelectorAll(".tp-swatch").forEach((sw) => {
      sw.classList.toggle("active", hex && sw.dataset.color.toLowerCase() === hex.toLowerCase());
    });
  }

  function applyTheme(hex) {
    const root = document.documentElement.style;
    if (!hex) {
      // إعادة الألوان الافتراضية (إزالة أي تخصيص)
      ["900", "700", "600", "500", "300", "100", "50"].forEach((k) => root.removeProperty(`--brand-${k}`));
      return;
    }
    const ramp = buildRamp(hex);
    root.setProperty("--brand-900", ramp["900"]);
    root.setProperty("--brand-700", ramp["700"]);
    root.setProperty("--brand-600", ramp["600"]);
    root.setProperty("--brand-500", ramp["500"]);
    root.setProperty("--brand-300", ramp["300"]);
    root.setProperty("--brand-100", ramp["100"]);
    root.setProperty("--brand-50", ramp["50"]);
  }

  async function saveTheme(hex) {
    try {
      if (themeStorageMode === "profile" && currentUid) {
        await supabaseClient.from("profiles").update({ theme_color: hex }).eq("id", currentUid);
      } else {
        if (hex) localStorage.setItem("admin_theme_color", hex);
        else localStorage.removeItem("admin_theme_color");
      }
      if (typeof showToast === "function") showToast("تم تحديث لون الواجهة", "success");
    } catch (e) {
      console.error("theme save error", e);
    }
  }

  /* ---------------- أدوات تحويل الألوان (HEX <-> HSL) ---------------- */
  function hexToHsl(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function buildRamp(baseHex) {
    const { h, s, l } = hexToHsl(baseHex);
    return {
      900: hslToHex(h, s, clamp(l - 30, 6, 95)),
      700: hslToHex(h, s, clamp(l - 14, 8, 95)),
      600: hslToHex(h, s, clamp(l - 4, 8, 95)),
      500: hslToHex(h, s, clamp(l + 6, 8, 95)),
      300: hslToHex(h, clamp(s - 15, 0, 100), clamp(l + 34, 10, 95)),
      100: hslToHex(h, clamp(s - 25, 0, 100), clamp(l + 52, 10, 97)),
      50: hslToHex(h, clamp(s - 30, 0, 100), clamp(l + 60, 10, 98)),
    };
  }

  window.buildThemeRamp = buildRamp; // متاحة لملفات أخرى مثل تصدير الـ PDF
})();
