/* =====================================================================
   تصدير ملف الإنجاز كملف PDF (html2canvas + jsPDF)
   ===================================================================== */

document.getElementById("exportPdfBtn").addEventListener("click", exportPortfolioAsPdf);

async function exportPortfolioAsPdf() {
  const btn = document.getElementById("exportPdfBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner dark"></span> جاري التجهيز...`;

  const sections = document.querySelectorAll(".section");
  const sidebar = document.getElementById("sidebar");
  const topbar = document.querySelector(".topbar");
  const prevSidebarDisplay = sidebar.style.display;
  const prevTopbarDisplay = topbar.style.display;

  sections.forEach((s) => (s.style.display = "block"));
  sidebar.style.display = "none";
  topbar.style.display = "none";

  const target = document.getElementById("portfolioContent");

  try {
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#fff5fa" });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const teacherName = (currentProfile && currentProfile.full_name) || "ملف_الإنجاز";
    pdf.save(`ملف_إنجاز_${teacherName}.pdf`);
    showToast("تم تنزيل ملف الإنجاز بصيغة PDF", "success");
  } catch (err) {
    console.error(err);
    showToast("تعذّر إنشاء ملف PDF", "error");
  } finally {
    sections.forEach((s) => {
      const activeLink = document.querySelector(".nav-link.active");
      s.style.display = activeLink && activeLink.dataset.target === s.id ? "block" : "none";
    });
    sidebar.style.display = prevSidebarDisplay;
    topbar.style.display = prevTopbarDisplay;
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
