---
layout: home

hero:
  name: QRForge
  text: Open-source QR code platform
  tagline: Generate static codes in the browser, and run dynamic codes, analytics and a REST API on your own server.
  image:
    src: /logo.svg
    alt: QRForge
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Self-host with Docker
      link: /guide/docker
    - theme: alt
      text: GitHub
      link: https://github.com/kspkr/QrForge

features:
  - title: Local generation
    details: Static codes are rendered on your device. The content is never uploaded, and no account is required.
  - title: Dynamic codes
    details: Change a printed code's destination at any time. Supports passwords, expiry dates, UTM parameters, custom slugs and a change history.
  - title: Designer
    details: Colors, module and corner shapes, logos, frames, labels and presets, with a warning whenever a design is likely to scan poorly.
  - title: Privacy-preserving analytics
    details: Scan counts, unique visitors, devices, browsers, countries and referrers. IP addresses are not stored.
  - title: Libraries and tools
    details: A dependency-free core library, React components, a CLI, a JavaScript SDK and an OpenAPI-documented REST API.
  - title: Self-hosted
    details: Runs with Docker Compose on PostgreSQL, or as a single binary on SQLite. No paid services are required.
---
