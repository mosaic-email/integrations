const REQUEST_SCHEMA = "emailformat-sfmc-provider-plan-request-v1"
const RESULT_SCHEMA = "emailformat-sfmc-provider-plan-result-v1"
const OPERATION_ID = "emailformat.compile_provider_plan"
const PROVIDER_ID = "sfmc-format-provider-v1"
const NUMBER_PATTERN = "^-?[0-9]{1,9}(\\.[0-9]{1,6})?$"
const ATTRIBUTE_PATTERN = "^[A-Za-z_][A-Za-z0-9_.]{0,127}$"
const CONDITION_OPERATORS = [
  "equals",
  "not-equals",
  "contains",
  "not-contains",
  "starts-with",
  "ends-with",
  "is-empty",
  "is-not-empty",
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
]
const STALE_PROFILE_DIAGNOSTIC = {
  code: "SFMC_TARGET_CONFIGURATION_STALE",
  message: "sfmc.target-configuration.invalid",
  severity: "error",
}
const VARIABLE_BINDING_DIAGNOSTIC = {
  code: "SFMC_VARIABLE_BINDING_MISSING",
  message: "sfmc.variable.binding.missing",
  severity: "warning",
}

if (context.operationId !== OPERATION_ID) throw new Error("UNKNOWN_OPERATION")
validateRequest(input)

const modules = input.modules
const profileSupported = profileSupports(input.profile, modules)
const bindings = resolveSfmcProviderBindings(input)
const variations = modules.flatMap((module) =>
  (module.variations ?? []).map((variation) => ({
    ...variation,
    moduleInstanceId: module.instanceId,
  }))
)
const conditionPlan = input.dynamicModuleEmission
  ? buildSfmcModuleConditionPlan(variations)
  : { preamble: "", expressions: new Map() }
const conditionExpressions = input.dynamicModuleEmission
  ? variations.map((variation) => ({
      moduleInstanceId: variation.moduleInstanceId,
      variationId: variation.variationId ?? variation.segmentId,
      expression:
        conditionPlan.expressions.get(
          conditionPlanKey(
            variation.moduleInstanceId,
            variation.variationId ?? variation.segmentId
          )
        ) ?? invalid("CONDITION_PLAN_INVALID"),
    }))
  : []
const scalarProjection =
  input.scalarUsages.length > 0
    ? buildSfmcScalarProjection(input.scalarUsages, bindings.bindings)
    : { preamble: "", values: new Map(), diagnostics: [] }
const scalarValues = [...scalarProjection.values.entries()].map(
  ([usageId, value]) => ({ usageId, value })
)
const rasterExpressions = input.dynamicModuleEmission
  ? buildRasterExpressions(input.rasterRegions, modules, conditionPlan.expressions)
  : []

return {
  schemaVersion: RESULT_SCHEMA,
  providerId: PROVIDER_ID,
  sourceChecksum: input.sourceChecksum,
  profileSupported,
  conditionPreamble: conditionPlan.preamble,
  conditionExpressions,
  scalarPreamble: scalarProjection.preamble,
  scalarValues,
  bindingDiagnostics: bindings.diagnostics,
  scalarDiagnostics: scalarProjection.diagnostics,
  rasterExpressions,
  branchSyntax: {
    ifPrefix: "%%[ IF ",
    elseifPrefix: "%%[ ELSEIF ",
    suffix: " THEN ]%%",
    elseBranch: "%%[ ELSE ]%%",
    endBranch: "%%[ ENDIF ]%%",
  },
  diagnosticTemplates: {
    invalidConfiguration: STALE_PROFILE_DIAGNOSTIC,
    staleProfile: STALE_PROFILE_DIAGNOSTIC,
  },
}

function validateRequest(value) {
  if (
    !record(value) ||
    !exactKeys(value, [
      "dynamicModuleEmission",
      "emailId",
      "emailLibraryId",
      "modules",
      "personalization",
      "purpose",
      "rasterRegions",
      "scalarUsages",
      "schemaVersion",
      "sourceChecksum",
      "profile",
    ]) ||
    value.schemaVersion !== REQUEST_SCHEMA ||
    !string(value.emailId, 1, 256) ||
    !string(value.emailLibraryId, 1, 256) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.sourceChecksum) ||
    !["authoring-preview", "recipient-output"].includes(value.purpose) ||
    typeof value.dynamicModuleEmission !== "boolean" ||
    !record(value.profile) ||
    !Array.isArray(value.modules) ||
    value.modules.length > 512 ||
    !Array.isArray(value.scalarUsages) ||
    value.scalarUsages.length > 1_000 ||
    !Array.isArray(value.rasterRegions) ||
    value.rasterRegions.length > 128
  )
    invalid("INVALID_INPUT")

  let variationCount = 0
  const instanceIds = new Set()
  for (const module of value.modules) {
    if (
      !record(module) ||
      !exactKeys(module, ["instanceId"], ["fallbackBehavior", "variations"]) ||
      !string(module.instanceId, 1, 512) ||
      instanceIds.has(module.instanceId) ||
      (module.fallbackBehavior !== undefined &&
        !["show", "hide"].includes(module.fallbackBehavior)) ||
      (module.variations !== undefined &&
        (!Array.isArray(module.variations) || module.variations.length > 64))
    )
      invalid("INVALID_MODULE")
    instanceIds.add(module.instanceId)
    const variationIds = new Set()
    for (const variation of module.variations ?? []) {
      variationCount += 1
      if (
        !record(variation) ||
        !exactKeys(
          variation,
          [
            "condition",
            "segmentId",
            "segmentName",
            "variationId",
          ],
          ["parentVariationId"]
        ) ||
        variationCount > 64 ||
        !string(variation.variationId, 1, 512) ||
        variationIds.has(variation.variationId) ||
        (variation.parentVariationId !== undefined &&
          !string(variation.parentVariationId, 1, 512)) ||
        !string(variation.segmentId, 1, 512) ||
        !string(variation.segmentName, 1, 512)
      )
        invalid("INVALID_VARIATION")
      variationIds.add(variation.variationId)
      validateCondition(variation.condition)
    }
  }

  const usageIds = new Set()
  for (const usage of value.scalarUsages) {
    if (
      !record(usage) ||
      !exactKeys(usage, [
        "bindingVersion",
        "definitionVersion",
        "fallback",
        "usageId",
        "variableId",
      ]) ||
      !string(usage.usageId, 1, 512) ||
      usageIds.has(usage.usageId) ||
      !string(usage.variableId, 1, 160) ||
      !positiveInteger(usage.definitionVersion) ||
      !positiveInteger(usage.bindingVersion) ||
      !string(usage.fallback, 0, 1_000_000)
    )
      invalid("INVALID_SCALAR_USAGE")
    usageIds.add(usage.usageId)
  }

  const catalog = value.personalization
  if (
    !record(catalog) ||
    !exactKeys(catalog, ["valid", "schemaVersion", "libraryId", "variables"]) ||
    typeof catalog.valid !== "boolean" ||
    (catalog.schemaVersion !== null && !string(catalog.schemaVersion, 1, 128)) ||
    (catalog.libraryId !== null && !string(catalog.libraryId, 1, 256)) ||
    (catalog.variables !== null &&
      (!Array.isArray(catalog.variables) || catalog.variables.length > 200))
  )
    invalid("INVALID_PERSONALIZATION")

  const regionIds = new Set()
  for (const region of value.rasterRegions) {
    if (
      !record(region) ||
      !exactKeys(region, ["moduleInstanceIds", "regionId", "states"]) ||
      !string(region.regionId, 1, 128) ||
      regionIds.has(region.regionId) ||
      !Array.isArray(region.moduleInstanceIds) ||
      region.moduleInstanceIds.length < 1 ||
      region.moduleInstanceIds.length > 512 ||
      new Set(region.moduleInstanceIds).size !== region.moduleInstanceIds.length ||
      region.moduleInstanceIds.some(
        (id) => !string(id, 1, 512) || !instanceIds.has(id)
      ) ||
      !Array.isArray(region.states) ||
      region.states.length < 1 ||
      region.states.length > 64
    )
      invalid("INVALID_RASTER_REGION")
    regionIds.add(region.regionId)
    const stateIds = new Set()
    for (const state of region.states) {
      if (
        !record(state) ||
        !exactKeys(state, ["selection", "stateId"]) ||
        !string(state.stateId, 1, 128) ||
        stateIds.has(state.stateId) ||
        !Array.isArray(state.selection) ||
        state.selection.length > 512
      )
        invalid("INVALID_RASTER_STATE")
      stateIds.add(state.stateId)
      for (const selected of state.selection) {
        if (
          !record(selected) ||
          !exactKeys(selected, ["moduleInstanceId", "variationId"]) ||
          !string(selected.moduleInstanceId, 1, 512) ||
          (selected.variationId !== null &&
            !string(selected.variationId, 1, 512))
        )
          invalid("INVALID_RASTER_SELECTION")
      }
    }
  }
  if (value.purpose === "authoring-preview" && value.dynamicModuleEmission)
    invalid("INVALID_EMISSION_MODE")
}

function validateCondition(value, depth = 0, nodes = { count: 0 }) {
  nodes.count += 1
  if (depth > 4 || nodes.count > 31 || !record(value))
    invalid("INVALID_CONDITION")
  if (value.kind === "group") {
    if (
      !exactKeys(value, ["children", "kind", "operator"]) ||
      !["and", "or"].includes(value.operator) ||
      !Array.isArray(value.children) ||
      value.children.length < 1 ||
      value.children.length > 16
    )
      invalid("INVALID_CONDITION")
    for (const child of value.children)
      validateCondition(child, depth + 1, nodes)
    return
  }
  if (
    value.kind !== "comparison" ||
    !exactKeys(value, ["binding", "id", "kind", "operator", "value"]) ||
    !string(value.id, 1, 512) ||
    !CONDITION_OPERATORS.includes(value.operator) ||
    !string(value.value, 0, 256) ||
    !record(value.binding) ||
    !exactKeys(value.binding, [
      "attributeName",
      "bindingVersion",
      "definitionVersion",
      "variableId",
    ]) ||
    !string(value.binding.variableId, 1, 160) ||
    !positiveInteger(value.binding.definitionVersion) ||
    !positiveInteger(value.binding.bindingVersion) ||
    !string(value.binding.attributeName, 1, 128)
  )
    invalid("INVALID_CONDITION")
}

function profileSupports(profile, modules) {
  try {
    const operators = new Set(profile.moduleVariations.conditionOperators)
    const groups = new Set(profile.moduleVariations.conditionGroups)
    const visit = (condition) =>
      condition.kind === "group"
        ? groups.has(condition.operator) && condition.children.every(visit)
        : operators.has(condition.operator)
    return (
      profile.schemaVersion === "emailformat-profile-v1" &&
      profile.tokenCatalog.delimiter.id === "percent-pair" &&
      profile.tokenCatalog.delimiter.opener === "%%" &&
      profile.tokenCatalog.delimiter.closer === "%%" &&
      profile.tokenCatalog.delimiter.active &&
      profile.tokenCatalog.entries.every(({ rawToken }) =>
        /^%%[A-Za-z_][A-Za-z0-9_]{0,63}%%$/.test(rawToken)
      ) &&
      profile.variableBinding.syntax === "AttributeValue" &&
      profile.variableBinding.attributeNamePattern === ATTRIBUTE_PATTERN &&
      profile.configurationCapabilities.includes("custom-head") &&
      profile.configurationCapabilities.includes("custom-closing") &&
      profile.tokenCatalog.authoredEmission === "inert-only" &&
      profile.variableBinding.typedUsageTypes.includes("string") &&
      profile.moduleVariations.applicationScopes.includes("module") &&
      profile.moduleVariations.outputSurfaces.includes("html") &&
      profile.moduleVariations.outputSurfaces.includes("text") &&
      profile.moduleVariations.branchOrder === "saved-array-first-match" &&
      profile.moduleVariations.nestedSemantics === "ancestor-and" &&
      profile.diagnostics.includes("SFMC_RAW_PROVIDER_CODE_UNSUPPORTED") &&
      profile.diagnostics.includes("SFMC_TARGET_CONFIGURATION_STALE") &&
      profile.diagnostics.includes("SFMC_VARIABLE_BINDING_MISSING") &&
      modules.every(
        (module) =>
          profile.moduleVariations.fallbackBehaviors.includes(
            module.fallbackBehavior ?? "show"
          ) &&
          (module.variations ?? []).every(({ condition }) => visit(condition))
      )
    )
  } catch {
    return false
  }
}

function resolveSfmcProviderBindings(request) {
  const usages = request.scalarUsages
  const conditions = request.modules.flatMap((module) =>
    (module.variations ?? []).flatMap((variation) =>
      collectConditionBindings(
        variation.condition,
        module.instanceId + "/variation/" + variation.variationId
      )
    )
  )
  const references = [
    ...usages.map((usage) => ({
      variableId: usage.variableId,
      definitionVersion: usage.definitionVersion,
      bindingVersion: usage.bindingVersion,
      sourceId: usage.usageId,
      expectedAttributeName: undefined,
    })),
    ...conditions
      .filter(({ binding }) => binding.variableId.startsWith("var_"))
      .map(({ binding, sourceId }) => ({
        variableId: binding.variableId,
        definitionVersion: binding.definitionVersion,
        bindingVersion: binding.bindingVersion,
        sourceId,
        expectedAttributeName: binding.attributeName,
      })),
  ]
  if (references.length === 0) return { bindings: new Map(), diagnostics: [] }

  const invalidSourceId = references[0].sourceId
  const failCatalog = () => ({
    bindings: new Map(),
    diagnostics: [
      {
        code: "PERSONALIZATION_CATALOG_INVALID",
        message: "personalization.catalog.invalid",
        severity: "error",
        sourceId: invalidSourceId,
      },
    ],
  })
  const context = request.personalization
  try {
    if (
      context.valid !== true ||
      context.schemaVersion !== "mosaic-email-personalization-input-v1" ||
      context.libraryId !== request.emailLibraryId ||
      !Array.isArray(context.variables) ||
      context.variables.length > 200
    )
      return failCatalog()
    const variables = context.variables.map((value) => {
      if (!record(value)) invalid()
      const keys = Object.keys(value).sort().join("\n")
      if (
        keys !== "bindings\ndefinitionCount\nid\nstatus" ||
        !string(value.id, 1, 160) ||
        !/^var_[a-z0-9][a-z0-9_-]{0,155}$/.test(value.id) ||
        (value.status !== "active" && value.status !== "retired") ||
        !Number.isSafeInteger(value.definitionCount) ||
        value.definitionCount < 1 ||
        value.definitionCount > 100 ||
        !Array.isArray(value.bindings) ||
        value.bindings.length > 100
      )
        invalid()
      const profilePattern = new RegExp(
        request.profile.variableBinding.attributeNamePattern,
        "u"
      )
      const bindings = value.bindings.map((candidate, index) => {
        if (!record(candidate)) invalid()
        if (
          Object.keys(candidate).sort().join("\n") !==
            "attributeName\ndefinitionVersion\nversion" ||
          candidate.version !== index + 1 ||
          !positiveInteger(candidate.definitionVersion) ||
          candidate.definitionVersion > value.definitionCount ||
          (candidate.attributeName !== null &&
            (!string(candidate.attributeName, 1, 128) ||
              !profilePattern.test(candidate.attributeName)))
        )
          invalid()
        return {
          version: index + 1,
          definitionVersion: candidate.definitionVersion,
          attributeName: candidate.attributeName,
        }
      })
      return {
        id: value.id,
        status: value.status,
        bindings,
      }
    })
    if (new Set(variables.map(({ id }) => id)).size !== variables.length)
      return failCatalog()
    const byId = new Map(variables.map((variable) => [variable.id, variable]))
    const diagnostics = []
    const resolvedBindings = new Map()
    for (const reference of references) {
      const variable = byId.get(reference.variableId)
      const binding = variable?.bindings[reference.bindingVersion - 1]
      if (
        variable?.status !== "active" ||
        binding?.version !== reference.bindingVersion ||
        binding.definitionVersion !== reference.definitionVersion ||
        (reference.expectedAttributeName !== undefined &&
          binding.attributeName !== reference.expectedAttributeName)
      ) {
        diagnostics.push({
          code: "PERSONALIZATION_DEFINITION_UNAVAILABLE",
          message: "personalization.definition.unavailable",
          severity: "error",
          sourceId: reference.sourceId,
        })
      } else if (reference.expectedAttributeName === undefined) {
        resolvedBindings.set(reference.sourceId, binding.attributeName)
      }
    }
    return { bindings: resolvedBindings, diagnostics }
  } catch {
    return failCatalog()
  }
}

function collectConditionBindings(condition, sourceId) {
  if (condition.kind === "group")
    return condition.children.flatMap((child) =>
      collectConditionBindings(child, sourceId)
    )
  return [{ binding: condition.binding, sourceId: sourceId + "/" + condition.id }]
}

function buildSfmcScalarProjection(personalization, bindingNames) {
  const lines = ["%%["]
  const values = new Map()
  const diagnostics = []
  for (const [index, usage] of [...personalization].sort((left, right) =>
    left.usageId.localeCompare(right.usageId)
  ).entries()) {
    const name = "@_mosaic_scalar_" + (index + 1)
    lines.push("VAR " + name)
    const attributeName = bindingNames.get(usage.usageId) ?? null
    if (attributeName === null) {
      lines.push("SET " + name + " = " + ampString(usage.fallback))
      diagnostics.push({
        ...VARIABLE_BINDING_DIAGNOSTIC,
        sourceId: usage.usageId,
      })
    } else {
      lines.push(
        "SET " + name + " = AttributeValue(" + ampString(attributeName) + ")"
      )
      lines.push("IF Empty(Trim(" + name + ")) THEN")
      lines.push("  SET " + name + " = " + ampString(usage.fallback))
      lines.push("ENDIF")
    }
    values.set(usage.usageId, "%%=v(" + name + ")=%%")
  }
  lines.push("]%%")
  return {
    preamble: lines.join("\n"),
    values,
    diagnostics,
  }
}

function buildSfmcModuleConditionPlan(variations) {
  const conditions = [
    ...new Map(
      [...variations]
        .sort(
          (left, right) =>
            left.segmentId.localeCompare(right.segmentId) ||
            canonicalJson(left.condition).localeCompare(
              canonicalJson(right.condition)
            )
        )
        .map((variation) => [
          variation.segmentId + ":" + canonicalJson(variation.condition),
          variation,
        ])
    ).entries(),
  ]
  const allocated = new Set()
  const allocate = (label, fallback, suffixes) => {
    let base =
      label
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64) || fallback
    if (!/^[a-z]/.test(base)) base = fallback + "_" + base
    let candidate = base
    let ordinal = 1
    while (suffixes.some((suffix) => allocated.has(candidate + suffix)))
      candidate = base + "_" + ++ordinal
    suffixes.forEach((suffix) => allocated.add(candidate + suffix))
    return "@" + candidate
  }
  const segmentNames = new Map(
    conditions.map(([signature, segment]) => [
      signature,
      allocate(segment.segmentName, "segment", [""]),
    ])
  )
  const names = new Map()
  const numericFields = new Set()
  const visit = (condition) => {
    if (condition.kind === "group") return condition.children.forEach(visit)
    const name = condition.binding.attributeName
    const key = name.toLowerCase()
    if (!names.has(key) || name < names.get(key)) names.set(key, name)
    if (condition.operator.startsWith("greater-") || condition.operator.startsWith("less-"))
      numericFields.add(key)
  }
  conditions.forEach(([, segment]) => visit(segment.condition))
  const fields = new Map()
  const lines = []
  for (const [key, name] of [...names.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    const prefix = allocate(name, "field", [
      "",
      "_raw",
      "_ascii_accepted",
      "_number",
      "_numeric",
    ])
    const field = {
      text: prefix,
      asciiAccepted: prefix + "_ascii_accepted",
      number: prefix + "_number",
      numeric: prefix + "_numeric",
    }
    fields.set(key, field)
    lines.push(
      "VAR " + prefix + "_raw, " + field.text + ", " + field.asciiAccepted,
      "SET " + prefix + "_raw = AttributeValue(" + ampString(name) + ")",
      "SET " + field.text + ' = ""',
      "SET " + field.asciiAccepted + " = 0",
      "IF Empty(" + prefix + "_raw) THEN",
      "SET " + field.asciiAccepted + " = 1",
      'ELSEIF NOT Empty(RegExMatch(' +
        prefix +
        '_raw, "^[\\x00-\\x7F]+$", 0)) THEN',
      "SET " + field.text + " = Lowercase(Trim(" + prefix + "_raw))",
      "SET " + field.asciiAccepted + " = 1",
      "ENDIF"
    )
    if (numericFields.has(key))
      lines.push(
        "VAR " + field.number + ", " + field.numeric,
        "SET " + field.number + " = 0",
        "SET " + field.numeric + " = 0",
        "IF NOT Empty(RegExMatch(" +
          field.text +
          ", " +
          ampString(NUMBER_PATTERN) +
          ", 0)) THEN",
        "SET " + field.number + " = Add(" + field.text + ", 0)",
        "SET " + field.numeric + " = 1",
        "ENDIF"
      )
  }
  const expressionsByCondition = new Map()
  conditions.forEach(([conditionKey, { condition }]) => {
    const variable = segmentNames.get(conditionKey)
    expressionsByCondition.set(conditionKey, variable + " == 1")
    lines.push(
      "VAR " + variable,
      "SET " + variable + " = 0",
      "IF " + emitModuleVariationCondition(condition, fields) + " THEN",
      "SET " + variable + " = 1",
      "ENDIF"
    )
  })
  const expressions = new Map()
  variations.forEach((variation) => {
    const variationId = variation.variationId ?? variation.segmentId
    expressions.set(
      conditionPlanKey(variation.moduleInstanceId, variationId),
      expressionsByCondition.get(
        variation.segmentId + ":" + canonicalJson(variation.condition)
      )
    )
  })
  return {
    preamble: lines.length ? "%%[\n" + lines.join("\n") + "\n]%%" : "",
    expressions,
  }
}

function emitModuleVariationCondition(condition, fields) {
  if (condition.kind === "group") {
    const joiner = condition.operator === "and" ? " AND " : " OR "
    return (
      "(" +
      condition.children
        .map((child) => emitModuleVariationCondition(child, fields))
        .join(joiner) +
      ")"
    )
  }
  const field = fields.get(condition.binding.attributeName.toLowerCase())
  const source = field.text
  const value = normalizeModuleConditionText(condition.value)
  const literal = ampString(value)
  const equal =
    "(Length(" +
    source +
    ") == " +
    value.length +
    " AND IndexOf(" +
    source +
    ", " +
    literal +
    ") == 1)"
  if (condition.operator === "is-empty")
    return "(" + field.asciiAccepted + " == 1 AND Empty(" + source + "))"
  if (condition.operator === "is-not-empty")
    return (
      "(" + field.asciiAccepted + " == 1 AND NOT Empty(" + source + "))"
    )
  let expression
  switch (condition.operator) {
    case "equals":
      expression = equal
      break
    case "not-equals":
      expression = "NOT " + equal
      break
    case "contains":
      expression = "IndexOf(" + source + ", " + literal + ") > 0"
      break
    case "not-contains":
      expression = "IndexOf(" + source + ", " + literal + ") == 0"
      break
    case "starts-with":
      expression = "IndexOf(" + source + ", " + literal + ") == 1"
      break
    case "ends-with":
      expression =
        "(Length(" +
        source +
        ") >= " +
        value.length +
        " AND IndexOf(Concat(\"~\", Substring(Concat(" +
        literal +
        ", " +
        source +
        "), Add(Length(" +
        source +
        "), 1), " +
        value.length +
        ")), Concat(\"~\", " +
        literal +
        ")) == 1)"
      break
    default: {
      const operator = {
        "greater-than": ">",
        "greater-than-or-equal": ">=",
        "less-than": "<",
        "less-than-or-equal": "<=",
      }[condition.operator]
      return (
        "(" +
        field.numeric +
        " == 1 AND " +
        field.number +
        " " +
        operator +
        " " +
        Number(value) +
        ")"
      )
    }
  }
  return (
    "(" +
    field.asciiAccepted +
    " == 1 AND NOT Empty(" +
    source +
    ") AND " +
    expression +
    ")"
  )
}

function buildRasterExpressions(regions, allModules, expressions) {
  return regions.flatMap((region) => {
    const modules = region.moduleInstanceIds.map((id) => {
      const module = allModules.find((item) => item.instanceId === id)
      if (!module) invalid("INVALID_RASTER_SELECTION")
      return {
        instanceId: module.instanceId,
        variations: (module.variations ?? []).map(
          ({ variationId, parentVariationId }) => ({
            variationId,
            ...(parentVariationId === undefined ? {} : { parentVariationId }),
          })
        ),
      }
    })
    return region.states.map((state) => ({
      regionId: region.regionId,
      stateId: state.stateId,
      expression: sfmcModuleSelectionExpression(
        modules,
        state.selection,
        expressions
      ),
    }))
  })
}

function sfmcModuleSelectionExpression(modules, selection, expressions) {
  if (selection.length !== modules.length) invalid("EMAIL_RASTER_SELECTION_INVALID")
  const clauses = []
  modules.forEach((module, index) => {
    const selected = selection[index]
    if (selected.moduleInstanceId !== module.instanceId)
      invalid("EMAIL_RASTER_SELECTION_INVALID")
    const variations = module.variations ?? []
    const expression = (id) => {
      const value = expressions.get(conditionPlanKey(module.instanceId, id))
      if (!value) invalid("EMAIL_RASTER_CONDITION_INVALID")
      return "(" + value + ")"
    }
    const children = (parent) =>
      variations.filter((variation) => variation.parentVariationId === parent)
    const chain = []
    let current =
      selected.variationId === null
        ? undefined
        : variations.find(
            (variation) => variation.variationId === selected.variationId
          )
    if (selected.variationId !== null && !current)
      invalid("EMAIL_RASTER_SELECTION_INVALID")
    const seen = new Set()
    while (current) {
      if (seen.has(current.variationId))
        invalid("EMAIL_RASTER_CONDITION_INVALID")
      seen.add(current.variationId)
      chain.unshift(current)
      const parent = current.parentVariationId
      current =
        parent === undefined
          ? undefined
          : variations.find((variation) => variation.variationId === parent)
      if (parent !== undefined && !current)
        invalid("EMAIL_RASTER_CONDITION_INVALID")
    }
    for (const branch of chain) {
      const siblings = children(branch.parentVariationId)
      for (const earlier of siblings.slice(
        0,
        siblings.findIndex(
          (sibling) => sibling.variationId === branch.variationId
        )
      ))
        clauses.push("NOT " + expression(earlier.variationId))
      clauses.push(expression(branch.variationId))
    }
    for (const child of children(selected.variationId ?? undefined))
      clauses.push("NOT " + expression(child.variationId))
  })
  return clauses.length ? "(" + clauses.join(" AND ") + ")" : "1 == 1"
}

function conditionPlanKey(moduleInstanceId, variationId) {
  return (
    moduleInstanceId.length +
    ":" +
    moduleInstanceId +
    variationId.length +
    ":" +
    variationId
  )
}

function normalizeModuleConditionText(value) {
  return value
    .replace(/^[\x09-\x0D\x20]+|[\x09-\x0D\x20]+$/g, "")
    .replace(/[A-Z]/g, (character) => character.toLowerCase())
}

function canonicalJson(value, path = "$", seen = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(path + " must contain a finite number")
    return JSON.stringify(value)
  }
  if (seen.has(value)) invalid(path + " contains a cycle")
  seen.add(value)
  try {
    if (Array.isArray(value))
      return (
        "[" +
        value.map((item, index) =>
          canonicalJson(item, path + "[" + index + "]", seen)
        ).join(",") +
        "]"
      )
    if (!record(value)) invalid(path + " must contain only plain objects")
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key]
        if (child === undefined) invalid(path + "." + key + " cannot be undefined")
        return JSON.stringify(key) + ":" + canonicalJson(child, path + "." + key, seen)
      })
    return "{" + entries.join(",") + "}"
  } finally {
    seen.delete(value)
  }
}

function ampString(value) {
  return '"' + value.replaceAll('"', '""') + '"'
}

function record(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
}

function exactKeys(value, required, optional = []) {
  const keys = Object.keys(value).sort()
  const expected = [...required, ...optional].sort()
  return (
    keys.length >= required.length &&
    keys.every((key, index) => expected.includes(key)) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    new Set(keys).size === keys.length
  )
}

function string(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1
}

function invalid(message = "INVALID_INPUT") {
  throw new Error(message)
}
