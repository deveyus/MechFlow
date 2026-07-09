# 012 — Hardware-backed commit signing

**Date:** 2026-07-09
**Status:** Accepted

## Context

Software signing keys are stored on disk and can be exfiltrated by malware. Hardware keys bound to FIDO2/USB devices provide a higher assurance level — the private key never leaves the device.

## Decision

All commits signed with Titan Key (ecdsa-sk, FIDO2) via SSH. Configuration: `gpg.format=ssh`, `user.signingkey` pointing to `~/.ssh/id_ecdsa_sk.pub`, `commit.gpgsign=true`. Signature format uses `ssh` (not legacy GPG), enabled by Git's `gpg.format=ssh` option.

## Consequences

- Commits are verifiably signed with a hardware-backed key
- Key is registered on GitHub as a signing key — verified "Good" signatures on all commits
- Cannot sign commits without the physical Titan Key present
- Key type is `ecdsa-sk` — supported by GitHub, GitLab, and most forge platforms
