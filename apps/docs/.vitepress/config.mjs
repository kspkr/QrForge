import { defineConfig } from "vitepress";

const REPO = "https://github.com/kspkr/QrForge";

// Served from the site root locally; the GitHub Pages build sets DOCS_BASE=/QrForge/docs/.
const base = process.env.DOCS_BASE || "/";

export default defineConfig({
  title: "QRForge",
  description: "The open-source QR platform. Create, customize, track and self-host QR codes.",
  lang: "en-US",
  base,
  cleanUrls: true,
  lastUpdated: false,
  // Fail the build on dead links, except http://localhost URLs used in examples.
  ignoreDeadLinks: "localhostLinks",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` }],
    ["meta", { name: "theme-color", content: "#ff6a2b" }],
  ],
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "QRForge",
    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      {
        text: "Packages",
        items: [
          { text: "@qrforge/core", link: "/guide/core" },
          { text: "@qrforge/react", link: "/guide/react" },
          { text: "qrforge (CLI)", link: "/guide/cli" },
          { text: "@qrforge/sdk", link: "/guide/sdk" },
        ],
      },
      { text: "API", link: "/guide/api" },
      { text: "Self-hosting", link: "/guide/self-hosting" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Architecture", link: "/guide/architecture" },
            { text: "FAQ", link: "/guide/faq" },
          ],
        },
        {
          text: "Libraries & tools",
          items: [
            { text: "Core library", link: "/guide/core" },
            { text: "React", link: "/guide/react" },
            { text: "CLI", link: "/guide/cli" },
            { text: "JavaScript SDK", link: "/guide/sdk" },
          ],
        },
        {
          text: "Server",
          items: [
            { text: "REST API", link: "/guide/api" },
            { text: "Dynamic QR codes", link: "/guide/dynamic-qr-codes" },
            { text: "Analytics", link: "/guide/analytics" },
          ],
        },
        {
          text: "Operations",
          items: [
            { text: "Docker", link: "/guide/docker" },
            { text: "Self-hosting", link: "/guide/self-hosting" },
            { text: "GitHub Pages", link: "/guide/github-pages" },
            { text: "Custom domains", link: "/guide/custom-domains" },
            { text: "Kubernetes", link: "/guide/kubernetes" },
            { text: "Security", link: "/guide/security" },
          ],
        },
        {
          text: "Contributing",
          items: [
            { text: "Development", link: "/guide/development" },
            { text: "Contributing", link: "/guide/contributing" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: REPO }],
    search: { provider: "local" },
    editLink: {
      pattern: `${REPO}/edit/main/apps/docs/:path`,
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "QRForge contributors",
    },
  },
});
