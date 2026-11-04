<div align="center">
  <img src="logo.png" alt="SFMC" width="180" />
  <h1>SFMC</h1>
  <p>Deterministic Salesforce Marketing Cloud output for Mosaic Email.</p>
</div>

SFMC is a standalone Mosaic package that supplies provider-specific emission plans for Mosaic-owned Email compilation and declares connected SFMC operations. The host freezes typed inputs, validates and replays the emission plan, and owns rendering, authorization, target configuration, HTML safety checks, and final artifacts.

The offline Worker receives only a bounded profile, module-variation conditions, raster selections, scalar usage references, and a projected personalization catalog. It does not receive arbitrary HTML, access external services, retain data, or rewrite host output. Connected operations are dispatched by Mosaic's trusted host adapter using authoritative Library, Email, completion-evidence, and connection context. Package Worker input never contains credentials, access tokens, recipient-row keys or values, or raw SFMC rows.

## Compatibility

| | Version |
|---|---|
| SFMC package | `1.60.0` |
| Mosaic | `≥0.0.5` |
| Compiler bridge | `≥160` |

This maintenance release retains the explicit native system-token profile contract and requires compiler bridge 160. Mosaic 0.0.4 is the first host floor for the declared connected-operation contract.

The host may preserve only the fixed native system-token names declared by this
release. The Worker validates that bounded profile list but does not receive
authored Email content or render tokens. Mosaic continues to own source
validation, placement checks, output rendering and final artifact safety. The
previous `inert-only` profile remains supported for compatibility.

The release declares four Library-scoped metadata operations (connection verification, Content Builder folders, Data Extensions, and Data Extension fields), a privileged recipient preview, and a privileged publication operation for a completed Email. Preview and publish inputs carry only Mosaic IDs; the host resolves authoritative completed output, recipient selection, Library binding, BU, and installed credentials. These declarations require matching host dispatch and capability enforcement; the package declaration alone does not execute network operations.

## Shared metadata

Shared Content Builder uses the configured child MID. For Shared Data Extensions, enable Enterprise shared metadata for the Library in Mosaic and authorize the Enterprise BU on the SFMC Installed Package Access tab. Mosaic resolves and verifies the Enterprise MID without changing the child binding. This exposes Enterprise shared metadata, not a verified child-BU DE subset, and grants no recipient-row access. Package access changes can take five minutes to propagate.

## Connected-operation maintenance — 1.60.0

This release preserves the 1.15.0 Worker and operation-schema bytes. The new
version identifies the reviewed maintenance baseline; it does not add provider
network access to the Worker or change frozen Email output.

The accompanying Mosaic host changes validate recipient response completeness,
classify SOAP read failures separately from uncertain writes, and expose the
existing optional image-folder destination in the explicit Push to SFMC sheet.
Deploy that Mosaic host source separately: updating this package in Admin does
not deploy host code. No new database migration is introduced by this release.

Connected operations remain bounded: explicit metadata refresh, separate transient
recipient preview, and manually requested delivery of completed Email assets.
There is no continuous email synchronization, audience import, send operation,
or browser-session credential capture. Shared metadata uses an explicitly
verified Enterprise context and never substitutes the Library's child MID.

The implementation borrows concepts, not code or dependencies, from
[SFMC DevTools](https://github.com/Accenture/sfmc-devtools) (metadata identity and
dependency validation), [SFMC Data Loader](https://github.com/JoernBerkefeld/sfmc-dataloader)
(explicit job outcomes), [SFMC Scout](https://github.com/MetalHacker01/SFMC_Scout)
(bounded search UX), [VS Code AMPscript](https://github.com/Bizcuit/vscode-ampscript)
(explicit DE-column metadata), and [SFMC SDK](https://github.com/DougMidgley/SFMC-SDK)
(operation-aware errors and bounded paging). Existing Mosaic authority and
immutable-artifact contracts remain authoritative.
