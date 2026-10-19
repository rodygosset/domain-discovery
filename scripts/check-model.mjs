#!/usr/bin/env node
// Checks domain-model.json for completeness and broken references.
// Usage: node check-model.mjs <path/to/domain-model.json>
// Paths in the model resolve against the folder that holds the model file.

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const file = process.argv[2]
if (!file) {
  console.error("Usage: node check-model.mjs <path/to/domain-model.json>")
  process.exit(2)
}

let model
try {
  model = JSON.parse(readFileSync(file, "utf8"))
} catch (error) {
  console.error(`Cannot read ${file}: ${error.message}`)
  process.exit(2)
}

const root = dirname(resolve(file))
const errors = []
const fail = (where, message) => errors.push(`${where}: ${message}`)

const sections = {
  glossary: "term.",
  subdomains: "sub.",
  contexts: "ctx.",
  relations: "rel.",
  valueObjects: "vo.",
  aggregates: "agg.",
  commands: "cmd.",
  events: "evt.",
  policies: "pol.",
  queries: "qry.",
  errors: "err.",
  externalSystems: "ext.",
  tensions: "ten.",
  stories: "sto."
}

const required = {
  glossary: ["term", "meaning", "context", "retire"],
  subdomains: ["name", "kind", "why"],
  contexts: ["name", "subdomain", "purpose", "module"],
  relations: ["from", "to", "via", "translation", "carries"],
  valueObjects: ["context", "name", "kind", "rules", "replaces"],
  aggregates: ["context", "name", "identity", "why", "states", "entities", "invariants", "persistence"],
  commands: ["aggregate", "name", "intent", "actor", "input", "emits", "rejectsWith", "replaces"],
  events: ["aggregate", "name", "fields"],
  policies: ["context", "name", "trigger", "then", "timing", "replaces"],
  queries: ["context", "name", "input", "output", "replaces"],
  errors: ["context", "name", "fields", "meaning"],
  externalSystems: ["context", "name", "purpose", "operations", "current"],
  tensions: ["code", "user", "resolution"],
  stories: ["title", "kind", "steps", "refs"]
}

const enums = {
  "subdomains.kind": ["core", "supporting", "generic"],
  "relations.via": ["event", "call"],
  "relations.translation": ["none", "acl"],
  "valueObjects.kind": ["id", "value"],
  "policies.timing": ["eventual", "same-transaction"]
}

// Top-level shape

for (const key of ["version", "repo", "purpose", ...Object.keys(sections), "outOfScope", "openQuestions", "plan"]) {
  if (!(key in model)) fail("model", `missing top-level key "${key}"`)
}
if (errors.length > 0) report()

if (!Array.isArray(model.repo.checks) || model.repo.checks.length === 0) {
  fail("repo.checks", "list at least one build or test command")
}
if (!["refactor", "greenfield"].includes(model.repo.mode)) fail("repo.mode", `must be "refactor" or "greenfield"`)
const contextRoot = model.repo.layout?.contextRoot
let contextPattern
if (typeof contextRoot !== "string" || !contextRoot.includes("<context>")) {
  fail("repo.layout.contextRoot", `must contain "<context>", such as "src/<context>"`)
} else {
  const escaped = contextRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<context>", "[^/]+")
  contextPattern = new RegExp(`^${escaped}$`)
}
if (typeof model.repo.storage !== "string" || model.repo.storage.length === 0) {
  fail("repo.storage", `name the storage package, or "none"`)
}
const frontendKinds = ["none", "foldkit", "tanstack-start-atom", "other"]
const frontend = model.repo.frontend
if (!frontend || !frontendKinds.includes(frontend.kind)) {
  fail("repo.frontend", `"kind" must be one of ${frontendKinds.join(", ")}`)
} else if (frontend.kind !== "none") {
  if (!frontend.path) fail("repo.frontend", `"path" is required when "kind" is "${frontend.kind}"`)
  else if (!existsSync(resolve(root, frontend.path))) fail("repo.frontend", `folder not found: ${frontend.path}`)
  const transports = ["rpc", "http-api", "server-fn", "local", "other"]
  if (!transports.includes(frontend.transport)) {
    fail("repo.frontend", `"transport" must be one of ${transports.join(", ")}`)
  } else if (frontend.transport === "server-fn" && frontend.kind === "foldkit") {
    fail("repo.frontend", `"server-fn" only exists for TanStack Start`)
  }
}
for (const key of ["summary", "users", "value"]) {
  if (!model.purpose[key] || model.purpose[key].length === 0) fail("purpose", `missing "${key}"`)
}

// Ids, status, evidence, required fields

const ids = new Map()
const register = (id, where, prefix) => {
  if (typeof id !== "string" || !id.startsWith(prefix)) {
    fail(where, `id "${id}" must start with "${prefix}"`)
    return
  }
  if (ids.has(id)) fail(where, `duplicate id "${id}", also used in ${ids.get(id)}`)
  ids.set(id, where)
}

const checkStatus = (element, where) => {
  if (element.status !== "confirmed") fail(where, `status is "${element.status}", must be "confirmed"`)
  if (!Array.isArray(element.evidence)) fail(where, `"evidence" must be a list`)
}

checkStatus(model.purpose, "purpose")

for (const [section, prefix] of Object.entries(sections)) {
  if (!Array.isArray(model[section])) {
    fail(section, "must be a list")
    continue
  }
  for (const element of model[section]) {
    const where = `${section}.${element.id ?? "?"}`
    register(element.id, where, prefix)
    checkStatus(element, where)
    for (const field of required[section]) {
      if (!(field in element)) fail(where, `missing "${field}"`)
    }
    for (const [path, allowed] of Object.entries(enums)) {
      const [owner, field] = path.split(".")
      if (owner === section && !allowed.includes(element[field])) {
        fail(where, `"${field}" is "${element[field]}", expected one of ${allowed.join(", ")}`)
      }
    }
  }
}

for (const aggregate of model.aggregates) {
  for (const invariant of aggregate.invariants ?? []) {
    register(invariant.id, `aggregates.${aggregate.id}.invariants.${invariant.id}`, "inv.")
  }
}

// References

const byId = (section) => new Set(model[section].map((element) => element.id))
const has = {
  ctx: byId("contexts"),
  sub: byId("subdomains"),
  vo: byId("valueObjects"),
  agg: byId("aggregates"),
  cmd: byId("commands"),
  evt: byId("events"),
  err: byId("errors")
}
const ref = (where, field, value, set) => {
  if (!set.has(value)) fail(where, `"${field}" points to unknown id "${value}"`)
}

for (const term of model.glossary) ref(`glossary.${term.id}`, "context", term.context, has.ctx)
for (const context of model.contexts) {
  ref(`contexts.${context.id}`, "subdomain", context.subdomain, has.sub)
  if (contextPattern && !contextPattern.test(context.module ?? "")) {
    fail(`contexts.${context.id}`, `module "${context.module}" does not follow repo.layout.contextRoot "${contextRoot}"`)
  }
}
for (const relation of model.relations) {
  const where = `relations.${relation.id}`
  ref(where, "from", relation.from, has.ctx)
  ref(where, "to", relation.to, has.ctx)
  for (const id of relation.carries ?? []) ref(where, "carries", id, new Set([...has.evt, ...has.cmd, ...byId("queries")]))
}
for (const valueObject of model.valueObjects) {
  const where = `valueObjects.${valueObject.id}`
  ref(where, "context", valueObject.context, has.ctx)
  if (valueObject.kind === "id" && !valueObject.shape) fail(where, `an id needs "shape"`)
  if (valueObject.kind === "value" && !valueObject.fields) fail(where, `a value needs "fields"`)
}
for (const aggregate of model.aggregates) {
  const where = `aggregates.${aggregate.id}`
  ref(where, "context", aggregate.context, has.ctx)
  ref(where, "identity", aggregate.identity, has.vo)
  if (!Array.isArray(aggregate.states) || aggregate.states.length === 0) fail(where, "needs at least one state")
  for (const invariant of aggregate.invariants ?? []) {
    if (!invariant.rule) fail(`${where}.invariants.${invariant.id}`, `missing "rule"`)
    ref(`${where}.invariants.${invariant.id}`, "error", invariant.error, has.err)
  }
  if (!model.commands.some((command) => command.aggregate === aggregate.id)) {
    fail(where, "no command changes this aggregate")
  }
}
const emitted = new Set()
for (const command of model.commands) {
  const where = `commands.${command.id}`
  ref(where, "aggregate", command.aggregate, has.agg)
  if (!command.emits?.length) fail(where, "must emit at least one event")
  for (const id of command.emits ?? []) {
    ref(where, "emits", id, has.evt)
    emitted.add(id)
  }
  for (const id of command.rejectsWith ?? []) ref(where, "rejectsWith", id, has.err)
}
for (const event of model.events) {
  const where = `events.${event.id}`
  ref(where, "aggregate", event.aggregate, has.agg)
  if (!emitted.has(event.id)) fail(where, "no command emits this event")
}
for (const policy of model.policies) {
  const where = `policies.${policy.id}`
  ref(where, "context", policy.context, has.ctx)
  ref(where, "then", policy.then, has.cmd)
  const trigger = policy.trigger ?? {}
  if (trigger.event) ref(where, "trigger.event", trigger.event, has.evt)
  else if (!trigger.schedule) fail(where, `"trigger" needs "event" or "schedule"`)
}
for (const section of ["queries", "errors", "externalSystems"]) {
  for (const element of model[section]) ref(`${section}.${element.id}`, "context", element.context, has.ctx)
}
for (const tension of model.tensions) {
  if (!tension.resolution) fail(`tensions.${tension.id}`, "has no resolution")
}
if (!Array.isArray(model.outOfScope)) fail("outOfScope", "must be a list, empty if nothing was left out")
for (const story of model.stories) {
  const where = `stories.${story.id}`
  if (!["main", "unhappy", "case"].includes(story.kind)) fail(where, `"kind" must be main, unhappy or case`)
  if (!story.steps?.length) fail(where, "has no steps")
  for (const id of story.refs ?? []) if (!ids.has(id)) fail(where, `refs unknown id "${id}"`)
}
if (!model.stories.some((story) => story.kind === "main")) fail("stories", "needs at least one main story")
if (!model.stories.some((story) => story.kind === "case")) fail("stories", "needs at least one real case")
if (model.openQuestions.length > 0) {
  fail("openQuestions", `${model.openQuestions.length} question(s) still open`)
}

if (model.repo.mode === "greenfield") {
  for (const section of Object.keys(sections)) {
    for (const element of model[section]) {
      if (element.replaces?.length) fail(`${section}.${element.id}`, "greenfield mode has nothing to replace")
    }
  }
  for (const step of model.plan.steps ?? []) {
    if (step.move?.length) fail(`plan.${step.id}`, "greenfield mode has nothing to move")
  }
}

// Code evidence must point at real files

const codePath = (entry) => {
  if (typeof entry !== "string" || /^(user|decided):/.test(entry)) return undefined
  return entry.split(/[: ]/)[0]
}
const checkPaths = (list, where) => {
  for (const entry of list ?? []) {
    const path = codePath(entry)
    if (path && !existsSync(resolve(root, path))) fail(where, `file not found: ${path}`)
  }
}
for (const section of Object.keys(sections)) {
  for (const element of model[section]) {
    const where = `${section}.${element.id}`
    checkPaths(element.evidence, where)
    checkPaths(element.replaces, where)
  }
}

// Plan

const steps = model.plan.steps ?? []
if (steps.length === 0) fail("plan.steps", "the plan has no steps")
const seenSteps = new Set()
const planned = new Set()
const touched = new Set()
for (const step of steps) {
  const where = `plan.${step.id ?? "?"}`
  if (typeof step.id !== "string" || !step.id.startsWith("step.")) fail(where, `id must start with "step."`)
  if (!step.title) fail(where, `missing "title"`)
  for (const id of step.dependsOn ?? []) {
    if (!seenSteps.has(id)) fail(where, `depends on "${id}", which is unknown or comes later`)
  }
  for (const id of step.refs ?? []) {
    if (!ids.has(id)) fail(where, `refs unknown id "${id}"`)
    planned.add(id)
  }
  const changes = ["create", "move", "edit", "delete"].reduce((count, key) => count + (step[key]?.length ?? 0), 0)
  if (changes === 0) fail(where, "changes no files")
  if (!step.verify?.length) fail(where, `"verify" lists no commands`)
  const known = (path) => touched.has(path) || existsSync(resolve(root, path))
  for (const move of step.move ?? []) {
    if (!known(move.from)) fail(where, `move source not found: ${move.from}`)
    touched.add(move.to)
  }
  for (const edit of step.edit ?? []) {
    if (!known(edit.path)) fail(where, `edited file not found: ${edit.path}`)
    if (!edit.change) fail(where, `edit of ${edit.path} has no "change"`)
  }
  for (const path of step.delete ?? []) {
    if (!known(path)) fail(where, `deleted file not found: ${path}`)
  }
  for (const create of step.create ?? []) {
    if (!create.path || !create.construct) fail(where, `each create needs "path" and "construct"`)
    if (create.from && !ids.has(create.from)) fail(where, `create "from" points to unknown id "${create.from}"`)
    touched.add(create.path)
  }
  seenSteps.add(step.id)
}

const mustPlan = ["valueObjects", "aggregates", "commands", "events", "policies", "queries", "errors", "externalSystems", "relations"]
for (const section of mustPlan) {
  for (const element of model[section]) {
    if (!planned.has(element.id)) fail(`${section}.${element.id}`, "no plan step refs it")
  }
}

const lastStep = steps.at(-1)
if (lastStep && !(lastStep.delete ?? []).includes("domain-model.json")) {
  fail(`plan.${lastStep.id}`, "the last step must delete domain-model.json, after checking docs/domain against the code")
}

report()

function report() {
  if (errors.length === 0) {
    console.log("OK")
    process.exit(0)
  }
  console.log(errors.join("\n"))
  console.log(`\n${errors.length} problem(s). Fix them and run the checker again.`)
  process.exit(1)
}
