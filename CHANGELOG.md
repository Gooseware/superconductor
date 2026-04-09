# Changelog

## [0.4.1](https://github.com/gemini-cli-extensions/superconductor/compare/superconductor-v0.4.0...superconductor-v0.4.1) (2026-03-11)


### Bug Fixes

* update readme ([d1957ae](https://github.com/gemini-cli-extensions/superconductor/commit/d1957ae0b965f2aa769331b9d850b7dd93eeb27a))

## [0.4.0](https://github.com/gemini-cli-extensions/superconductor/compare/superconductor-v0.3.1...superconductor-v0.4.0) (2026-03-10)


### Features

* integrate Plan Mode and extension-native policies into Superconductor ([4a4d9b2](https://github.com/gemini-cli-extensions/superconductor/commit/4a4d9b2d21d896c032161aa0247fb1ab9a7e59bc))
* **plan:** add superconductor as planning directory ([5cf078c](https://github.com/gemini-cli-extensions/superconductor/commit/5cf078c9c186fa9474e579123ecaeee3533fa1e2))
* **plan:** basic plan mode tool integration ([923ef57](https://github.com/gemini-cli-extensions/superconductor/commit/923ef57c06cb97aeef1a3d0cf2c192f7bb28e63d))
* **policy:** move and configure superconductor policies ([e0fbc72](https://github.com/gemini-cli-extensions/superconductor/commit/e0fbc723cc3eb693063ae13b0d39fa00376b3594))
* **setup:** add user confirmation loop for product requirements drafting ([6907cae](https://github.com/gemini-cli-extensions/superconductor/commit/6907cae60aef8e858c6495ca46957f46c22b1470))
* **setup:** allow intelligent self-correction on tool failures ([898daa7](https://github.com/gemini-cli-extensions/superconductor/commit/898daa707793eba6884583d9d22cd6623719c4fc))
* **setup:** enforce run_shell_command for listing external templates ([1224569](https://github.com/gemini-cli-extensions/superconductor/commit/122456948166283fb37af9317596472cdf487cb5))
* **setup:** implement shallow artifact inference with state priority table ([68a2a2c](https://github.com/gemini-cli-extensions/superconductor/commit/68a2a2ceb24603bf3ecb59a80a44d4551d450671))
* **setup:** mandate relative paths for file operations in plan mode ([a717aa0](https://github.com/gemini-cli-extensions/superconductor/commit/a717aa0d909605cf373a7036592f2748b092655f))
* **setup:** use ask_user tool for interactive prompts ([e71e8e0](https://github.com/gemini-cli-extensions/superconductor/commit/e71e8e0d6b7086855789ba9c0acb35cac439279d))


### Bug Fixes

* **superconductor:** refine plan mode entry logic in setup and newTrack ([3d9b3c8](https://github.com/gemini-cli-extensions/superconductor/commit/3d9b3c8cc34849120e778bfebd02b47230953e29))
* **superconductor:** refine plan mode entry logic in setup and newTrack ([9a413d2](https://github.com/gemini-cli-extensions/superconductor/commit/9a413d28332763d231dbb6f9a693ae604856b7e2))
* **plan:** configure agent to avoid redirection in shell commands which is blocked by plan mode ([7b27eca](https://github.com/gemini-cli-extensions/superconductor/commit/7b27eca892c9f7f2d7f624569ad7f62a33832740))
* **plan:** use extension-native policies folder ([db6d52d](https://github.com/gemini-cli-extensions/superconductor/commit/db6d52dd33cb5492ecc7df1444e67f9f615091d6))
* **setup:** refine project maturity detection and harden resume edge-cases ([eb9d127](https://github.com/gemini-cli-extensions/superconductor/commit/eb9d1277c1e0b29593e3929f902ca0fcbef0b2fc))
* **setup:** Remove model selection constraint from setup command ([90b583f](https://github.com/gemini-cli-extensions/superconductor/commit/90b583fd2f6a3167e436d72778f7d9ab94498263))

## [0.3.1](https://github.com/gemini-cli-extensions/superconductor/compare/superconductor-v0.3.0...superconductor-v0.3.1) (2026-02-19)


### Bug Fixes

* **superconductor:** Address review comments and standardize interactive flows ([f025c7d](https://github.com/gemini-cli-extensions/superconductor/commit/f025c7d1552077cc2e5b6d2ae80ae85ac4298b28))

## [0.3.0](https://github.com/gemini-cli-extensions/superconductor/compare/superconductor-v0.2.0...superconductor-v0.3.0) (2026-02-11)


### Features

* add /superconductor:review command ([d4749d3](https://github.com/gemini-cli-extensions/superconductor/commit/d4749d320ae983a12064488eb4b605529b0841e9))
* add /superconductor:review command ([d6e382a](https://github.com/gemini-cli-extensions/superconductor/commit/d6e382a980a816339c9ca9904a4744a635af7bd0))
* **superconductor:** address review comments to make recommendations more conversational ([8630f35](https://github.com/gemini-cli-extensions/superconductor/commit/8630f358f1d4ecf9e6c2815d0c607cf8c49ee3e8))
* **superconductor:** make review recommendations more conversational ([44446c6](https://github.com/gemini-cli-extensions/superconductor/commit/44446c6338bdc5159fd8d9c7cf4c362e48d34e40))
* **superconductor:** make review recommendations more conversational ([ec3dd99](https://github.com/gemini-cli-extensions/superconductor/commit/ec3dd996afd98e7c695cc8dee79f3779b8e1d105))
* **superconductor:** update review process to commit fixes and update plan ([c26980a](https://github.com/gemini-cli-extensions/superconductor/commit/c26980a5b9f952974c8c3cbcd82dc8c3ab2911f9))
* **review:** update review process to commit fixes and update plan ([0d533be](https://github.com/gemini-cli-extensions/superconductor/commit/0d533be1c3ebfc07fd04cf8219ddc5964343c24a))


### Bug Fixes

* commit changed superconductor files at the end of newTrack ([232c08b](https://github.com/gemini-cli-extensions/superconductor/commit/232c08b3c99e362981019a6b8e7ca8de55d78357))
* Commit superconductor files at the end of :newTrack ([#94](https://github.com/gemini-cli-extensions/superconductor/issues/94)) ([232c08b](https://github.com/gemini-cli-extensions/superconductor/commit/232c08b3c99e362981019a6b8e7ca8de55d78357))
* **superconductor:** move pre-initialization overview before resume check ([774fb49](https://github.com/gemini-cli-extensions/superconductor/commit/774fb49119d1f4d8d87dff22cbc14924fdb02a5b))
* **superconductor:** move pre-initialization overview before resume check ([f2b7ba5](https://github.com/gemini-cli-extensions/superconductor/commit/f2b7ba5c8963990ad454853692182f9367a099be)), closes [#81](https://github.com/gemini-cli-extensions/superconductor/issues/81)
* improve error message when required files are missing in review command ([d61c588](https://github.com/gemini-cli-extensions/superconductor/commit/d61c588c6d4adc3393468180d62f13097f589e4c))

## [0.2.0](https://github.com/gemini-cli-extensions/superconductor/compare/superconductor-v0.1.1...superconductor-v0.2.0) (2026-01-14)


### Features

* Add GitHub Actions workflow to package and upload release assets. ([5e0fcb0](https://github.com/gemini-cli-extensions/superconductor/commit/5e0fcb0d4d19acfd8f62b08b5f9404a1a4f53f14))
* Add GitHub Actions workflow to package and upload release assets. ([20858c9](https://github.com/gemini-cli-extensions/superconductor/commit/20858c90b48eabb5fe77aefab5a216269cc77c09))
* **superconductor:** implement tracks directory abstraction ([caeb814](https://github.com/gemini-cli-extensions/superconductor/commit/caeb8146bec590eda35bc7934b796656804fcf9a))
* Implement Universal File Resolution Protocol ([fe902f3](https://github.com/gemini-cli-extensions/superconductor/commit/fe902f32762630e674f186b742f4ebb778473702))
* integrate release asset packaging into release-please workflow ([3ef512c](https://github.com/gemini-cli-extensions/superconductor/commit/3ef512c3320e7877f1c05ed34433cf28a3111b30))
* introduce index markdown files and the Universal File Resolution Protocol ([bbb69c9](https://github.com/gemini-cli-extensions/superconductor/commit/bbb69c9fa8d4a6b3c225bfb665d565715523fa7d))
* introduce index.md files for file resolution ([cbd24d2](https://github.com/gemini-cli-extensions/superconductor/commit/cbd24d2b086697a3ca6e147e6b0edfedb84f99ce))
* **styleguide:** Add comprehensive Google C# Style Guide summary ([6672f4e](https://github.com/gemini-cli-extensions/superconductor/commit/6672f4ec2d2aa3831b164635a3e4dc0aa6f17679))
* **styleguide:** Add comprehensive Google C# Style Guide summary ([e222aca](https://github.com/gemini-cli-extensions/superconductor/commit/e222aca7eb7475c07e618b410444f14090d62715))


### Bug Fixes

* build tarball outside source tree to avoid self-inclusion ([830f584](https://github.com/gemini-cli-extensions/superconductor/commit/830f5847c206a9b76d58ebed0c184ff6c0c6e725))
* **superconductor:** ensure track completion and doc sync are committed automatically ([f6a1522](https://github.com/gemini-cli-extensions/superconductor/commit/f6a1522d0dea1e0ea887fcd732f1b47475dc0226))
* **superconductor:** ensure track completion and doc sync are committed automatically ([e3630ac](https://github.com/gemini-cli-extensions/superconductor/commit/e3630acc146a641f29fdf23f9c28d5d9cdf945b8))
* **superconductor:** remove hardcoded path hints in favor of Universal File Resolution Protocol ([6b14aaa](https://github.com/gemini-cli-extensions/superconductor/commit/6b14aaa6f8bffd29b2dc3eb5fc22b2ed1d19418d))
* Correct typos, step numbering, and documentation errors ([ab9516b](https://github.com/gemini-cli-extensions/superconductor/commit/ab9516ba6dd29d0ec5ea40b2cb2abab83fc791be))
* Correct typos, step numbering, and documentation errors ([d825c32](https://github.com/gemini-cli-extensions/superconductor/commit/d825c326061ab63a4d3b8928cbf32bc3f6a9c797))
* Correct typos, trailing whitespace and grammar ([484d5f3](https://github.com/gemini-cli-extensions/superconductor/commit/484d5f3cf7a0c4a8cbbcaff71f74b62c0af3dd35))
* Correct typos, trailing whitespace and grammar ([94edcbb](https://github.com/gemini-cli-extensions/superconductor/commit/94edcbbd0102eb6f9d5977eebf0cc3511aff6f64))
* Replace manual text input with interactive options ([b49d770](https://github.com/gemini-cli-extensions/superconductor/commit/b49d77058ccd5ccedc83c1974cc36a2340b637ab))
* Replace manual text input with interactive options ([746b2e5](https://github.com/gemini-cli-extensions/superconductor/commit/746b2e5f0a5ee9fc49edf8480dad3b8afffe8064))
* **setup:** clarify definition of 'track' in setup flow ([819dcc9](https://github.com/gemini-cli-extensions/superconductor/commit/819dcc989d70d572d81655e0ac0314ede987f8b4))
* **setup:** Enhance project analysis protocol to avoid excessive token consumption. ([#6](https://github.com/gemini-cli-extensions/superconductor/issues/6)) ([1e60e8a](https://github.com/gemini-cli-extensions/superconductor/commit/1e60e8a96e5abeab966ff8d5bd95e14e3e331cfa))
* standardize Markdown checkbox format for tracks and plans ([92080f0](https://github.com/gemini-cli-extensions/superconductor/commit/92080f0508ca370373adee1addec07855506adeb))
* standardize Markdown checkbox format for tracks and plans ([84634e7](https://github.com/gemini-cli-extensions/superconductor/commit/84634e774bc37bd3996815dfd6ed41a519b45c1d))
* **styleguide:** Clarify usage of 'var' in C# guidelines for better readability ([a67b6c0](https://github.com/gemini-cli-extensions/superconductor/commit/a67b6c08cac15de54f01cd1e64fff3f99bc55462))
* **styleguide:** Enhance C# guidelines with additional rules for constants, collections, and argument clarity ([eea7495](https://github.com/gemini-cli-extensions/superconductor/commit/eea7495194edb01f6cfa86774cf2981ed012bf73))
* **styleguide:** Update C# formatting rules and guidelines for consistency ([50f39ab](https://github.com/gemini-cli-extensions/superconductor/commit/50f39abf9941ff4786e3b995d4c077bfdf07b9c9))
* **styleguide:** Update C# guidelines by removing async method suffix rule and adding best practices for structs, collection types, file organization, and namespaces ([8bfc888](https://github.com/gemini-cli-extensions/superconductor/commit/8bfc888b1b1a4191228f0d85e3ac89fe25fb9541))
* **styleguide:** Update C# guidelines for member ordering and enhance clarity on  string interpolation ([0e0991b](https://github.com/gemini-cli-extensions/superconductor/commit/0e0991b73210f83b2b26007e813603d3cd2f0d48))
