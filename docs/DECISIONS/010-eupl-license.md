# 010 — EUPL-1.2 license

**Date:** 2026-07-09
**Status:** Accepted

## Context

The project was originally licensed under LGPL-3.0. LGPL-3.0 has jurisdiction gaps (disputes governed by "the courts of [place]" — the bracket is unfilled in many template copies). EUPL-1.2 has a stronger jurisdiction clause: disputes are governed by the law of the Licensor's EU member state, with specific language about competent courts.

## Decision

Converted from LGPL-3.0 to EUPL-1.2. Full license text in `LICENSE`, SPDX headers (`SPDX-License-Identifier: EUPL-1.2`) in all 12 source files. No references to LGPL remain.

## Consequences

- Stronger jurisdiction clause — better alignment with potential EU business base
- Non-standard for npm — will trigger legal review at many organizations
- EUPL-1.2 is compatible with GPLv2, GPLv3, AGPLv3, and LGPL-3.0 via the interoperability clause
- SPDX headers ensure per-file license clarity
