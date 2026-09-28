# Contributing

Bug reports, documentation fixes, new content types and features are all welcome.

The complete guide is [CONTRIBUTING.md](https://github.com/kspkr/QrForge/blob/main/CONTRIBUTING.md) in the repository. In short:

1. Pick an issue labelled [`good first issue`](https://github.com/kspkr/QrForge/labels/good%20first%20issue) or [`help wanted`](https://github.com/kspkr/QrForge/labels/help%20wanted), or open an issue to discuss a larger change first.
2. Fork the repository and follow [Development](./development) to run it locally.
3. Keep changes focused, add tests, and run `npm test`, `npm run test:go` and `npm run lint`.
4. Open a pull request using the template.

Project rules:

- No dependencies on paid APIs or proprietary services. Optional integrations need a free, local alternative.
- Static generation stays local, and analytics stay anonymous.
- New visual styles must pass the decoder round-trip tests in `packages/core`.
- Every control in the UI must work; no placeholder features.

Participation is covered by the [Code of Conduct](https://github.com/kspkr/QrForge/blob/main/CODE_OF_CONDUCT.md). To report a vulnerability, see [Security](./security#reporting-a-vulnerability).
