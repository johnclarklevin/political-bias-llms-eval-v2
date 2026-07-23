# License scope

This repository uses separate licenses for software and research content.

## Original software: MIT

Copyright © 2026 John Clark Levin.

The original software in `code/`, together with the original workflow and software-support files in `.github/`, `package.json`, and `.gitignore`, is licensed under the [MIT License](LICENSE-CODE). Source files in `code/` carry the SPDX identifier `MIT`.

## Research content: CC BY-NC-SA 4.0

To the extent John Clark Levin holds copyright, related rights, or database rights in the original research content, those rights are licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](LICENSE-CONTENT). This scope includes `assets/`, `config/`, `data/`, `docs/`, `README.md`, and the release manifests and checksums.

The license grant applies only to rights the licensor is legally able to license. It does not override third-party rights, contractual restrictions, privacy or publicity rights, trademarks, or material in the public domain.

## Washington Post and upstream material

The political prompts, endpoint descriptions, source methodology, comparison data, and vendored source material originate from or incorporate material published by The Washington Post in [`washingtonpost/political-bias-llm-eval`](https://github.com/washingtonpost/political-bias-llm-eval) at commit `a8cf5914fb0a71836ef8ab838537863ee85234b9`. That material is licensed CC BY-NC-SA 4.0. Adaptations in this repository are distributed under the same license elements. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and a description of changes.

The `vendor/washington-post-source/` directory remains governed by the `LICENSE` file inside that directory. Original software outside `vendor/` is not relicensed merely because the repository also contains CC-licensed research material.

## Model outputs and factual data

Some records may not qualify for copyright protection in every jurisdiction. The CC BY-NC-SA 4.0 notice applies to any copyright, related rights, and database rights the licensor holds in the compilation and content; it does not assert rights where none exist.

## No endorsement

Nothing in this repository implies endorsement by The Washington Post, ModelSlant, OpenAI, any polling organization, or any other cited party.
