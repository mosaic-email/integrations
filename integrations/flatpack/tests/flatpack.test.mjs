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
const request = await json("tests/fixtures/plan-request.json")
const source = await json("tests/fixtures/source.json")

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]"
  return "{" + Object.keys(value)
    .sort()
    .map((key) => JSON.stringify(key) + ":" + stableJson(value[key]))
    .join(",") + "}"
}

function run(input, operationId = "flatpack.rasterize_region") {
  return Function("input", "context", workerBundle)(input, { operationId })
}

test("release descriptor matches the pinned host contract and compatibility floor", () => {
  const valid = ajv.compile(hostSchema)
  assert.equal(valid(release), true, JSON.stringify(valid.errors))
  assert.equal(release.schemaVersion, support.releaseSchemaVersion)
  assert.equal(hostSchema.properties.schemaVersion.const, release.schemaVersion)
  assert.ok(hostSchema.required.includes("compilerCompatibility"))
  assert.deepEqual(Object.keys(release).sort(), Object.keys(hostSchema.properties).sort())
  assert.equal(release.hostContract, support.hostContract)
  assert.equal(release.mosaicCompatibility.minimumVersion, support.minimumMosaicVersion)
  assert.equal(release.compilerCompatibility.minimumVersion, support.minimumCompilerVersion)
  assert.equal(manifest.version, release.version)
  assert.equal(manifest.mosaicVersion, release.mosaicCompatibility.minimumVersion)
  assert.equal(release.interfaces.worker.version, support.workerInterface)
  assert.equal(release.interfaces.data.records.length, 0)
  assert.equal(release.interfaces.data.migrations.length, 0)
  assert.deepEqual(
    release.artifacts.map(({ path }) => path),
    [
      "dist/worker.js",
      "schemas/flatpack.email_raster_source_v1.schema.json",
      "schemas/flatpack.email_raster_plan_request_v2.schema.json",
      "schemas/flatpack.email_raster_plan_v2.schema.json",
    ]
  )
  assert.ok(compareVersions(release.version, support.previousBundledVersion) > 0)
  assert.ok(compareVersions(release.version, support.previousExternalVersion) > 0)
})

test("release descriptor digest and every declared release asset are exact", async () => {
  const digestSource = { ...release }
  delete digestSource.$schema
  delete digestSource.releaseDigest
  assert.equal(digest(Buffer.from(stableJson(digestSource))), release.releaseDigest)
  for (const artifact of release.artifacts) {
    const bytes = await readFile(new URL(artifact.path, root))
    assert.equal(bytes.byteLength, artifact.byteSize, artifact.path)
    assert.equal(digest(bytes), artifact.digest, artifact.path)
    const assetName = artifact.path.split("/").at(-1)
    assert.equal(
      digest(await readFile(new URL(".release-assets/" + assetName, root))),
      artifact.digest,
      assetName
    )
  }
  assert.deepEqual(
    await readFile(new URL(".release-assets/mosaic-package-release.json", root)),
    Buffer.from(JSON.stringify(release, null, 2) + "\n")
  )
})

test("FlatPack source, request, and result fixtures match their pinned schema identities", async () => {
  for (const [schemaName, value, schemaVersion] of [
    ["flatpack.email_raster_source_v1.schema.json", source, "mosaic-email-raster-regions-v1"],
    ["flatpack.email_raster_plan_request_v2.schema.json", request, "mosaic-email-raster-plan-request-v2"],
    ["flatpack.email_raster_plan_v2.schema.json", run(request), "mosaic-email-raster-plan-v2"],
  ]) {
    const schema = await json("schemas/" + schemaName)
    const valid = ajv.compile(schema)
    assert.equal(valid(value), true, schemaName + ": " + JSON.stringify(valid.errors))
    const version =
      schema.properties.hostContract?.const ?? schema.properties.schemaVersion?.const
    assert.equal(version, schemaVersion, schemaName)
    assert.deepEqual(Object.keys(value).sort(), [...schema.required].sort(), schemaName)
  }
})

test("FlatPack Worker returns deterministic plans and respects Dark Mode governance", () => {
  assert.deepEqual(run(request), {
    schemaVersion: "mosaic-email-raster-plan-v2",
    kind: "rasterize-region",
    regionId: request.regionId,
    sourceChecksum: request.sourceChecksum,
    states: request.states,
    variants: ["desktop-light", "desktop-dark", "mobile-light", "mobile-dark"],
  })
  assert.equal(JSON.stringify(run(request)), JSON.stringify(run(request)))
  assert.deepEqual(run({ ...request, darkModeEnabled: false }).variants, [
    "desktop-light",
    "mobile-light",
  ])
})

test("FlatPack Worker rejects invalid source checksums, missing inputs, and non-canonical selections", () => {
  assert.throws(() => run({ ...request, sourceChecksum: "sha256:bad" }), /INVALID_INPUT/u)
  assert.throws(() => run({ ...request, darkModeEnabled: undefined }), /INVALID_INPUT/u)
  assert.throws(
    () =>
      run({
        ...request,
        states: [
          {
            ...request.states[0],
            selectionKey: '{"variationId":null,"moduleInstanceId":"module_hero"}',
          },
        ],
      }),
    /NON_CANONICAL_SELECTION/u
  )
  assert.throws(() => run(request, "flatpack.other_operation"), /UNKNOWN_OPERATION/u)
})

test("FlatPack Worker bounds region IDs to the request schema", () => {
  const maxLength = "r".repeat(128)
  assert.equal(run({ ...request, regionId: maxLength }).regionId, maxLength)
  assert.throws(() => run({ ...request, regionId: "" }), /INVALID_INPUT/u)
  assert.throws(() => run({ ...request, regionId: "r".repeat(129) }), /INVALID_INPUT/u)
})

test("source and distribution are identical and the Worker has no host escape surface", async () => {
  assert.equal(workerBundle, workerSource)
  for (const forbidden of [
    "fetch(",
    "XMLHttpRequest",
    "process.",
    "require(",
    "import(",
    "document",
    "window",
    "Prisma",
    "SQL",
    "secret",
  ])
    assert.equal(workerBundle.includes(forbidden), false, forbidden)
  const packageJson = await json("package.json")
  const packageLock = await json("package-lock.json")
  assert.equal(packageJson.version, release.version)
  assert.equal(packageLock.version, release.version)
  assert.equal(packageLock.packages[""].version, release.version)
  assert.equal(Object.keys(packageJson).includes("dependencies"), false)
  for (const path of ["src/worker.js", "dist/worker.js", "scripts/build-release.mjs"]) {
    const fileText = await readFile(new URL(path, root), "utf8")
    assert.doesNotMatch(fileText, /from\s*["'](?:\.\.\/\.\.\/|@mosaic\/)/u)
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
