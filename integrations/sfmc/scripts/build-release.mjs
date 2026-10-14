import { createHash } from "node:crypto"
import { basename, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)))
const manifest = await readJson("mosaic-package.json")
const packageJson = await readJson("package.json")
const release = await readJson("mosaic-package-release.json")
const support = await readJson("tests/fixtures/supported-host-contract.json")
const artifactFiles = [
  ["dist/worker.js", "worker", "text/javascript"],
  ["schemas/emailformat.sfmc_provider_plan_request_v1.schema.json", "schema", "application/schema+json"],
  ["schemas/emailformat.sfmc_provider_plan_result_v1.schema.json", "schema", "application/schema+json"],
  ...support.connectedOperations.flatMap(({ inputSchemaId, resultSchemaId }) => [
    [`schemas/${inputSchemaId}.schema.json`, "schema", "application/schema+json"],
    [`schemas/${resultSchemaId}.schema.json`, "schema", "application/schema+json"],
  ]),
]
const expectedConnectedOperationIds = [
  "emailformat.verify_connection",
  "emailformat.list_content_folders",
  "emailformat.list_data_extensions",
  "emailformat.list_data_extension_fields",
  "emailformat.preview_recipient",
  "emailformat.publish_completed_email",
]
const operationDeclarations = support.connectedOperations.map(
  ({ id, inputSchemaId, resultSchemaId }) => ({ id, inputSchemaId, resultSchemaId })
)
const expectedContributions = support.connectedOperations.map(
  ({ id, capability, inputSchemaId, resultSchemaId }) => ({
    id,
    kind: "connector-operation",
    operationId: id,
    inputSchemaId,
    resultSchemaId,
    requiredCapabilityId: capability,
  })
)

if (
  packageJson.version !== manifest.version ||
  manifest.version !== release.version ||
  release.schemaVersion !== support.releaseSchemaVersion ||
  release.hostContract !== support.hostContract ||
  release.mosaicCompatibility.minimumVersion !== support.minimumMosaicVersion ||
  release.compilerCompatibility?.minimumVersion !== support.minimumCompilerVersion ||
  support.connectedOperations.length !== expectedConnectedOperationIds.length ||
  support.connectedOperations.some(({ id }, index) => id !== expectedConnectedOperationIds[index]) ||
  release.interfaces.connectorJobs?.version !== "mosaic-package-connector-job-v1" ||
  canonicalJson(release.interfaces.connectorJobs.operations) !== canonicalJson(operationDeclarations) ||
  canonicalJson(
    release.capabilities.map(({ id, requestedScope, requestedClassification }) => ({
      id,
      requestedScope,
      requestedClassification,
    }))
  ) !== canonicalJson(support.connectedCapabilities) ||
  canonicalJson(
    release.contributions.slice(1).map(
      ({ id, kind, operationId, inputSchemaId, resultSchemaId, requiredCapabilityId }) => ({
        id,
        kind,
        operationId,
        inputSchemaId,
        resultSchemaId,
        requiredCapabilityId,
      })
    )
  ) !== canonicalJson(expectedContributions) ||
  release.contributions[0]?.id !== "emailformat.sfmc_provider_plan" ||
  release.contributions[0]?.kind !== "output"
)
  throw new Error("SFMC_RELEASE_SUPPORT_FIXTURE_MISMATCH")

await copyFile(resolveInsidePackage("src/worker.js"), resolveInsidePackage("dist/worker.js"))
release.artifacts = await Promise.all(
  artifactFiles.map(async ([path, kind, mediaType]) => {
    const bytes = await readFile(resolveInsidePackage(path))
    return { path, kind, mediaType, byteSize: bytes.byteLength, digest: digest(bytes) }
  })
)
release.releaseDigest = digest(
  Buffer.from(canonicalJson(withoutReleaseLocationAndDigest(release)), "utf8")
)
await writeJson("mosaic-package-release.json", release)

const assetDirectory = resolveInsidePackage(".release-assets")
await rm(assetDirectory, { recursive: true, force: true })
await mkdir(assetDirectory, { recursive: true })
await copyFile(
  resolveInsidePackage("mosaic-package-release.json"),
  join(assetDirectory, "mosaic-package-release.json")
)
const names = new Set(["mosaic-package-release.json"])
for (const artifact of release.artifacts) {
  const name = basename(artifact.path)
  if (names.has(name)) throw new Error("SFMC_RELEASE_ASSET_NAME_COLLISION")
  names.add(name)
  await copyFile(resolveInsidePackage(artifact.path), join(assetDirectory, name))
}
console.log("Built SFMC " + release.version + " release assets in .release-assets/")

async function readJson(path) {
  return JSON.parse(await readFile(resolveInsidePackage(path), "utf8"))
}

async function writeJson(path, value) {
  await writeFile(
    resolveInsidePackage(path),
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  )
}

function resolveInsidePackage(path) {
  const resolved = resolve(packageRoot, path)
  if (!resolved.startsWith(packageRoot + sep))
    throw new Error("SFMC_RELEASE_PATH_INVALID")
  return resolved
}

function digest(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex")
}

function withoutReleaseLocationAndDigest(value) {
  const { $schema, releaseDigest, ...descriptor } = value
  return descriptor
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]"
  return "{" + Object.keys(value)
    .sort()
    .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
    .join(",") + "}"
}
