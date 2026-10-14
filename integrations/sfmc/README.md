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
| SFMC package | `1.13.0` |
| Mosaic | `≥0.0.4` |
| Compiler bridge | `≥140` |

The compiler bridge floor remains 140 because this release preserves the existing provider-plan operation. Mosaic 0.0.4 is the first host floor for the declared connected-operation contract.

The release declares four Library-scoped metadata operations (connection verification, Content Builder folders, Data Extensions, and Data Extension fields), a privileged recipient preview, and a privileged publication operation for a completed Email. Preview and publish inputs carry only Mosaic IDs; the host resolves authoritative completed output, recipient selection, Library binding, BU, and installed credentials. These declarations require matching host dispatch and capability enforcement; the package declaration alone does not execute network operations.
