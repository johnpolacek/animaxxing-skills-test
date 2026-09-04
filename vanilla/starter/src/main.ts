// Site script. Nothing motion-related lives here yet.
const year = document.querySelector<HTMLElement>("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());
