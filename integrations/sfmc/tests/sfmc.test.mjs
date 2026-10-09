import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import Ajv2020 from "ajv/dist/2020.js"

const root = new URL("../", import.meta.url)
const ajv = new Ajv2020({ allErrors: true, strict: false })
const json = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"))
const digest = (bytes) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex")
const workerSource = await readFile(new URL("src/worker.js", root), "utf8")
const workerBundle = await readFile(new URL("dist/worker.js", root), "utf8")
const release = await json("mosaic-package-release.json")
const manifest = await json("mosaic-package.json")
const support = await json("tests/fixtures/supported-host-contract.json")
const hostSchema = await json("schemas/mosaic-package-release-v3.schema.json")
const requestSchema = await json("schemas/emailformat.sfmc_provider_plan_request_v1.schema.json")
const resultSchema = await json("schemas/emailformat.sfmc_provider_plan_result_v1.schema.json")
const request = await json("tests/fixtures/plan-request.json")
const expectedResult = await json("tests/fixtures/plan-result.json")

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]"
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}"
}

function run(input, operationId = "emailformat.compile_provider_plan") {
  return Function("input", "context", workerBundle)(input, { operationId })
}

function schemaValidator(schema) {
  const validate = ajv.compile(schema)
  return (value) => assert.equal(validate(value), true, JSON.stringify(validate.errors))
}

test("release descriptor matches pinned package identities and host compatibility", () => {
  const valid = schemaValidator(hostSchema)
  valid(release)
  assert.equal(release.schemaVersion, support.releaseSchemaVersion)
  assert.equal(hostSchema.properties.schemaVersion.const, release.schemaVersion)
  assert.equal(release.hostContract, support.hostContract)
  assert.equal(release.publisherKey, "lockidynamics")
  assert.equal(release.packageKey, "emailformat")
  assert.equal(release.catalogSlug, "sfmc-format")
  assert.equal(release.version, "1.12.28")
  assert.equal(release.mosaicCompatibility.minimumVersion, support.minimumMosaicVersion)
  assert.equal(release.compilerCompatibility.minimumVersion, support.minimumCompilerVersion)
  assert.equal(release.compilerCompatibility.minimumVersion, 140)
  assert.equal(manifest.name, "SFMC")
  assert.equal(manifest.slug, release.catalogSlug)
  assert.equal(manifest.version, release.version)
  assert.equal(manifest.mosaicVersion, release.mosaicCompatibility.minimumVersion)
  assert.equal(release.interfaces.worker.version, support.workerInterface)
  assert.equal(release.interfaces.worker.artifactPath, "dist/worker.js")
  assert.equal(release.interfaces.worker.operations[0].id, "emailformat.compile_provider_plan")
  assert.equal(release.interfaces.worker.operations[0].inputSchemaId, "emailformat.sfmc_provider_plan_request_v1")
  assert.equal(release.interfaces.worker.operations[0].resultSchemaId, "emailformat.sfmc_provider_plan_result_v1")
  assert.deepEqual(release.capabilities, [])
  assert.equal(release.contributions[0].id, "emailformat.sfmc_provider_plan")
  assert.equal(release.contributions[0].kind, "output")
  assert.equal(release.contributions[0].requiredCapabilityId, null)
  assert.deepEqual(release.interfaces.data.records, [])
  assert.deepEqual(release.interfaces.data.migrations, [])
  assert.deepEqual(release.artifacts.map(({ path }) => path), [
    "dist/worker.js",
    "schemas/emailformat.sfmc_provider_plan_request_v1.schema.json",
    "schemas/emailformat.sfmc_provider_plan_result_v1.schema.json",
  ])
  assert.ok(compareVersions(release.version, support.previousBundledVersion) > 0)
  if (support.previousExternalVersion) {
    assert.ok(compareVersions(release.version, support.previousExternalVersion) > 0)
    assert.equal(release.compilerCompatibility.minimumVersion, support.previousExternalCompilerVersion)
    assert.equal(release.mosaicCompatibility.minimumVersion, support.previousExternalMosaicMinimumVersion)
    assert.deepEqual(
      Object.fromEntries(release.artifacts.map(({ path, digest }) => [path, digest])),
      support.previousExternalArtifactDigests
    )
  }
})

test("release digest and declared package assets are exact", async () => {
  const descriptor = { ...release }
  delete descriptor.$schema
  delete descriptor.releaseDigest
  assert.equal(digest(Buffer.from(stableJson(descriptor))), release.releaseDigest)
  for (const artifact of release.artifacts) {
    const bytes = await readFile(new URL(artifact.path, root))
    assert.equal(bytes.byteLength, artifact.byteSize, artifact.path)
    assert.equal(digest(bytes), artifact.digest, artifact.path)
    const name = artifact.path.split("/").at(-1)
    assert.equal(digest(await readFile(new URL(".release-assets/" + name, root))), artifact.digest, name)
  }
  assert.deepEqual(
    await readFile(new URL(".release-assets/mosaic-package-release.json", root)),
    Buffer.from(JSON.stringify(release, null, 2) + "\n")
  )
})

test("operation schemas use only the supported bounded package-schema dialect", () => {
  const allowed = new Set([
    "$schema", "type", "properties", "required", "additionalProperties", "items",
    "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "enum", "const", "oneOf", "anyOf", "allOf", "description",
  ])
  for (const [name, schema] of [
    ["request", requestSchema],
    ["result", resultSchema],
  ]) {
    let nodes = 0
    let maximumDepth = 0
    const visit = (node, depth) => {
      nodes += 1
      maximumDepth = Math.max(maximumDepth, depth)
      for (const [key, value] of Object.entries(node)) {
        assert.ok(allowed.has(key), name + " uses unsupported schema keyword " + key)
        if (key === "properties") {
          for (const child of Object.values(value)) visit(child, depth + 1)
        } else if (key === "items") {
          visit(value, depth + 1)
        } else if (["oneOf", "anyOf", "allOf"].includes(key)) {
          for (const child of value) visit(child, depth + 1)
        }
      }
    }
    visit(schema, 1)
    assert.ok(nodes <= 2_000, name + " schema node count " + nodes)
    assert.ok(maximumDepth <= 24, name + " schema depth " + maximumDepth)
  }
})

test("request fixture and Worker golden conform to their frozen schemas", () => {
  schemaValidator(requestSchema)(request)
  schemaValidator(resultSchema)(expectedResult)
  assert.deepEqual(run(request), expectedResult)
  assert.equal(run(request).sourceChecksum, request.sourceChecksum)
  assert.equal(JSON.stringify(run(request)), JSON.stringify(run(request)))
})

test("Worker owns profile support, scalar mapping, variation aliases, and raster selection", () => {
  const result = run(request)
  assert.equal(result.profileSupported, true)
  assert.match(result.conditionPreamble, /^%%\[\n/u)
  assert.match(result.conditionPreamble, /AttributeValue\("Country"\)/u)
  assert.match(result.conditionPreamble, /RegExMatch\(/u)
  assert.match(result.scalarPreamble, /AttributeValue\("Country"\)/u)
  assert.deepEqual(result.scalarValues, [
    { usageId: "usage_first_name", value: "%%=v(@_mosaic_scalar_1)=%%" },
    { usageId: "usage_subject", value: "%%=v(@_mosaic_scalar_2)=%%" },
  ])
  assert.deepEqual(result.scalarDiagnostics, [
    {
      code: "SFMC_VARIABLE_BINDING_MISSING",
      message: "sfmc.variable.binding.missing",
      severity: "warning",
      sourceId: "usage_first_name",
    },
  ])
  assert.deepEqual(result.rasterExpressions.map(({ regionId, stateId }) => ({ regionId, stateId })), [
    { regionId: "region_hero", stateId: "state_default" },
    { regionId: "region_hero", stateId: "state_welcome" },
    { regionId: "region_hero", stateId: "state_vip" },
  ])
  assert.deepEqual(result.branchSyntax, {
    ifPrefix: "%%[ IF ",
    elseifPrefix: "%%[ ELSEIF ",
    suffix: " THEN ]%%",
    elseBranch: "%%[ ELSE ]%%",
    endBranch: "%%[ ENDIF ]%%",
  })
})

test("invalid or stale pinned catalog mappings return keyed diagnostics without host output", () => {
  const invalidCatalog = {
    ...request,
    personalization: { valid: false, schemaVersion: null, libraryId: null, variables: null },
  }
  const invalidResult = run(invalidCatalog)
  assert.deepEqual(invalidResult.bindingDiagnostics, [{
    code: "PERSONALIZATION_CATALOG_INVALID",
    message: "personalization.catalog.invalid",
    severity: "error",
    sourceId: "usage_first_name",
  }])
  assert.equal(invalidResult.scalarValues.length, request.scalarUsages.length)

  const staleCatalog = structuredClone(request)
  staleCatalog.scalarUsages[1].definitionVersion = 2
  staleCatalog.modules[0].variations[0].condition.children[0].binding.definitionVersion = 2
  const staleResult = run(staleCatalog)
  assert.ok(staleResult.bindingDiagnostics.some((diagnostic) =>
    diagnostic.code === "PERSONALIZATION_DEFINITION_UNAVAILABLE" && diagnostic.sourceId === "usage_subject"
  ))
  assert.ok(staleResult.bindingDiagnostics.some((diagnostic) =>
    diagnostic.code === "PERSONALIZATION_DEFINITION_UNAVAILABLE" && diagnostic.sourceId === "module_hero/variation/variation_parent/condition_country"
  ))
})

test("catalog projections reject bindings that reference definitions outside the bounded definition count", () => {
  const malformedCatalog = {
    ...request,
    modules: [],
    scalarUsages: [{
      usageId: "usage_orphaned_definition",
      variableId: "var_orphaned",
      definitionVersion: 999,
      bindingVersion: 1,
      fallback: "Fallback",
    }],
    rasterRegions: [],
    personalization: {
      valid: true,
      schemaVersion: "mosaic-email-personalization-input-v1",
      libraryId: "library_test",
      variables: [{
        id: "var_orphaned",
        status: "active",
        definitionCount: 1,
        bindings: [{ version: 1, definitionVersion: 999, attributeName: "CustomerId" }],
      }],
    },
  }
  const result = run(malformedCatalog)
  assert.deepEqual(result.bindingDiagnostics, [{
    code: "PERSONALIZATION_CATALOG_INVALID",
    message: "personalization.catalog.invalid",
    severity: "error",
    sourceId: "usage_orphaned_definition",
  }])
})

test("static recipient mode suppresses condition/raster plans but retains scalar projection", () => {
  const result = run({ ...request, dynamicModuleEmission: false })
  assert.equal(result.conditionPreamble, "")
  assert.deepEqual(result.conditionExpressions, [])
  assert.deepEqual(result.rasterExpressions, [])
  assert.notEqual(result.scalarPreamble, "")
  assert.equal(result.scalarValues.length, 2)
})

test("profile incompatibility and empty-reference catalog behavior remain distinct", () => {
  const incompatible = structuredClone(request)
  incompatible.profile.configurationCapabilities = ["custom-head"]
  assert.equal(run(incompatible).profileSupported, false)

  const noReferences = {
    ...request,
    modules: [],
    scalarUsages: [],
    rasterRegions: [],
    personalization: { valid: false, schemaVersion: null, libraryId: null, variables: null },
  }
  const result = run(noReferences)
  assert.deepEqual(result.bindingDiagnostics, [])
  assert.deepEqual(result.scalarDiagnostics, [])
  assert.equal(result.scalarPreamble, "")
})

test("Worker rejects malformed request identity, unsupported operation, and out-of-bounds inputs", () => {
  assert.throws(() => run({ ...request, sourceChecksum: "sha256:bad" }), /INVALID_INPUT/u)
  assert.throws(() => run({ ...request, personalization: null }), /INVALID_PERSONALIZATION/u)
  assert.throws(() => run(request, "emailformat.other_operation"), /UNKNOWN_OPERATION/u)
  assert.throws(() => run({ ...request, scalarUsages: Array(1001).fill(request.scalarUsages[0]) }), /INVALID_INPUT/u)
  const oversizedStaticSelection = structuredClone(request)
  oversizedStaticSelection.dynamicModuleEmission = false
  oversizedStaticSelection.rasterRegions[0].states[0].selection = Array(513).fill({
    moduleInstanceId: "module_hero",
    variationId: null,
  })
  assert.throws(() => run(oversizedStaticSelection), /INVALID_RASTER_STATE/u)
})

test("Worker source and distribution match and expose no host escape surface", async () => {
  assert.equal(workerBundle, workerSource)
  for (const forbidden of ["fetch(", "XMLHttpRequest", "process.", "require(", "import(", "document", "window", "Prisma", "SQL", "secret"])
    assert.equal(workerBundle.includes(forbidden), false, forbidden)
  const packageJson = await json("package.json")
  const packageLock = await json("package-lock.json")
  assert.equal(packageJson.version, release.version)
  assert.equal(packageLock.version, release.version)
  assert.equal(packageLock.packages[""].version, release.version)
  assert.equal(Object.hasOwn(packageJson, "dependencies"), false)
  for (const path of ["src/worker.js", "dist/worker.js", "scripts/build-release.mjs"]) {
    const source = await readFile(new URL(path, root), "utf8")
    assert.doesNotMatch(source, /from\s*["'](?:\.\.\/\.\.\/|@mosaic\/)/u)
  }
})

function compareVersions(left, right) {
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}
