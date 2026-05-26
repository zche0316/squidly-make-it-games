/** Squidly access-click navigation back to the Games hub. */
export function initBackToHub() {
  const hubUrl = new URL("../index.html", document.baseURI || window.location.href).href;
  document.getElementById("back-access-btn")?.addEventListener("access-click", () => {
    window.location.href = hubUrl;
  });
}
