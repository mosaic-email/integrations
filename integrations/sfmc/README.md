<div align="center">
  <img src="logo.png" alt="SFMC" width="180" />
  <h1>SFMC</h1>
  <p>Deterministic Salesforce Marketing Cloud output for Mosaic Email.</p>
</div>

SFMC is a standalone Mosaic package that supplies provider-specific emission plans for Mosaic-owned Email compilation. The host freezes typed inputs, validates and replays the returned plan, and owns rendering, authorization, target configuration, HTML safety checks, and final artifacts.

The Worker receives only a bounded profile, module-variation conditions, raster selections, scalar usage references, and a projected personalization catalog. It does not receive arbitrary HTML, access external services, retain data, or rewrite host output.

## Compatibility

| | Version |
|---|---|
| SFMC package | `1.12.28` |
| Mosaic | `≥0.0.3` |
| Compiler bridge | `≥140` |

The compiler bridge floor is 140 because that is the first host version with the declared provider-plan operation.
