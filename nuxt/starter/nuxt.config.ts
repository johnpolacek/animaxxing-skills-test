export default defineNuxtConfig({
  compatibilityDate: "2025-11-01",
  ssr: true,
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },
  telemetry: false,
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Lifecycle",
      meta: [{ name: "description", content: "A three page site." }],
    },
  },
});
