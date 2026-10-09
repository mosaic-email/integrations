# Mosaic Integrations

Official independently versioned ESP and third-party integrations for Mosaic,
a Locki Dynamics LLC product. This repository is private.

## Repository boundary

Integration packages belong in `integrations/<integration-id>/`, each with its
own version and release identity. FlatPack is the first planned migration;
no integration has been implemented or migrated here yet.

Mosaic's mandatory internal `packages/`, core `docs/`, compiler, governance,
Review, and Complete authority remain in the core application repository.
Use the core application's existing package and delivery contracts; this
repository does not define a new host API.

## Development and releases

Read `AGENTS.md` before making changes. Add package-specific build and test
commands when the first integration is migrated; no tooling is installed yet.
Declare minimum supported Mosaic/compiler versions and required interface
contracts. Pin exact package releases and digests independently of host versions.

Do not commit credentials, customer data, generated release assets, or local
configuration. Releases must use the core application's approved verification
and immutable identity requirements. Publishing and migration require explicit
scope and verification.

## Ownership

Mosaic is a Locki Dynamics LLC product.
Copyright (c) 2026 Locki Dynamics LLC. All rights reserved.
No open-source license is granted by this scaffold; distribution licensing must
be approved before public release.
