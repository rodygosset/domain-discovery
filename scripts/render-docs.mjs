#!/usr/bin/env node
// Renders docs/domain/*.md from domain-model.json.
// Usage: node render-docs.mjs <path/to/domain-model.json> [--check]
// Writes next to the model, in docs/domain. With --check, compares instead of writing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const args = process.argv.slice(2)
const check = args.includes("--check")
const file = args.find((arg) => !arg.startsWith("--"))
if (!file) {
  console.error("Usage: node render-docs.mjs <path/to/domain-model.json> [--check]")
  process.exit(2)
}

let model
try {
  model = JSON.parse(readFileSync(file, "utf8"))
} catch (error) {
  console.error(`Cannot read ${file}: ${error.message}`)
  process.exit(2)
}

const out = join(dirname(resolve(file)), "docs", "domain")

// Helpers

const list = (key) => model[key] ?? []
const byId = new Map()
for (const key of ["glossary", "subdomains", "contexts", "relations", "valueObjects", "aggregates", "commands", "events", "policies", "queries", "errors", "externalSystems", "stories"]) {
  for (const element of list(key)) byId.set(element.id, element)
}
const nameOf = (id) => byId.get(id)?.name ?? byId.get(id)?.term ?? byId.get(id)?.title ?? id
const names = (ids) => (ids ?? []).map(nameOf).join(", ")
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
const table = (headers, rows) =>
  rows.length === 0
    ? "None.\n"
    : [
      `| ${headers.join(" | ")} |`,
      `|${headers.map(() => "---").join("|")}|`,
      ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)
    ].join("\n") + "\n"
const fields = (map) => Object.entries(map ?? {}).map(([key, type]) => `\`${key}: ${type}\``).join(", ") || "none"
const contextRoot = model.repo?.layout?.contextRoot ?? "src/<context>"
const [rootBefore, rootAfter] = contextRoot.split("<context>")
const folder = (context) => {
  const module = context.module
  if (module.startsWith(rootBefore) && module.endsWith(rootAfter)) {
    return module.slice(rootBefore.length, module.length - rootAfter.length)
  }
  return module.split("/").filter(Boolean).pop()
}
const contextFile = (context) => `contexts/${folder(context)}.md`
const contextOf = (element) => element.context ?? byId.get(element.aggregate)?.context
const inContext = (key, id) => list(key).filter((element) => contextOf(element) === id)
const mermaidId = (id) => id.replace(/^ctx\./, "")
const frontend = model.repo?.frontend ?? { kind: "none" }
const transport = frontend.kind === "none" ? "none" : frontend.transport
const doc = (...parts) =>
  parts.filter((part) => part !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"

const files = new Map()

// README.md

files.set("README.md", doc(
  "# Domain",
  "",
  model.purpose.summary,
  "",
  `Users: ${model.purpose.users.join(", ")}.`,
  "",
  `What they get: ${model.purpose.value}`,
  "",
  "## Contexts",
  "",
  table(
    ["Context", "Rank", "Purpose", "Folder"],
    list("contexts").map((context) => [
      `[${context.name}](${contextFile(context)})`,
      byId.get(context.subdomain)?.kind,
      context.purpose,
      `\`${context.module}\``
    ])
  ),
  "## Files",
  "",
  "- [glossary.md](glossary.md): the words to use, and the words not to use.",
  "- [context-map.md](context-map.md): the contexts and how they talk.",
  "- [stories.md](stories.md): what happens, step by step.",
  "- [decisions.md](decisions.md): why the model has this shape.",
  "- [architecture.md](architecture.md): where code goes, and how to add to it.",
  "- `contexts/`: one file per context, with its aggregates, rules, commands and events.",
  "",
  "## Keeping these docs true",
  "",
  "- These files describe the code as it is. Update them in the same change as the code.",
  "- A new command, event, rule, query or reaction goes in its context file.",
  "- A new word goes in `glossary.md`. A word that changes meaning gets a new entry.",
  "- A new context, or a change in who talks to whom, goes in `context-map.md`.",
  "- A new or changed flow goes in `stories.md`.",
  "- A reversed decision goes in `decisions.md`, with the reason.",
  ""
))

// glossary.md

const termsByWord = new Map()
for (const term of list("glossary")) {
  const word = term.term.toLowerCase()
  termsByWord.set(word, [...(termsByWord.get(word) ?? []), term])
}
const sharedTerms = [...termsByWord].filter(([, terms]) => new Set(terms.map((term) => term.context)).size > 1)

files.set("glossary.md", doc(
  "# Glossary",
  "",
  "Use these words in code, docs and conversation. Never use the words in the last column.",
  "",
  ...list("contexts").flatMap((context) => [
    `## ${context.name}`,
    "",
    table(
      ["Word", "Meaning", "Do not say"],
      inContext("glossary", context.id).map((term) => [term.term, term.meaning, term.retire.join(", ")])
    )
  ]),
  sharedTerms.length === 0 ? undefined : doc(
    "## Words that change meaning between contexts",
    "",
    table(
      ["Word", "Context", "Meaning"],
      sharedTerms.flatMap(([, terms]) => terms.map((term) => [term.term, nameOf(term.context), term.meaning]))
    )
  )
))

// context-map.md

files.set("context-map.md", doc(
  "# Context map",
  "",
  "```mermaid",
  "flowchart LR",
  ...list("contexts").map((context) => `  ${mermaidId(context.id)}[${context.name}]`),
  ...list("relations").map((relation) =>
    `  ${mermaidId(relation.from)} -->|${names(relation.carries) || relation.via}| ${mermaidId(relation.to)}`
  ),
  "```",
  "",
  "## Relations",
  "",
  table(
    ["From", "To", "How", "What crosses", "Translation"],
    list("relations").map((relation) => [
      nameOf(relation.from),
      nameOf(relation.to),
      relation.via,
      names(relation.carries),
      relation.translation === "acl"
        ? `\`${byId.get(relation.to)?.module}/infrastructure/From${nameOf(relation.from)}.ts\``
        : "none"
    ])
  ),
  "## Ownership",
  "",
  table(
    ["Context", "Owns"],
    list("contexts").map((context) => [
      context.name,
      inContext("aggregates", context.id).map((aggregate) => aggregate.name).join(", ") || "no aggregate"
    ])
  )
))

// contexts/<context>.md

for (const context of list("contexts")) {
  const subdomain = byId.get(context.subdomain)
  const relations = list("relations").filter((relation) => relation.from === context.id || relation.to === context.id)
  files.set(contextFile(context), doc(
    `# ${context.name}`,
    "",
    context.purpose,
    "",
    `Part of ${subdomain?.name} (${subdomain?.kind}). Code: \`${context.module}\`.`,
    "",
    "## Aggregates",
    "",
    ...inContext("aggregates", context.id).flatMap((aggregate) => [
      `### ${aggregate.name}`,
      "",
      `Identity: \`${nameOf(aggregate.identity)}\`.`,
      "",
      `Boundary: ${aggregate.why}`,
      "",
      "Stages:",
      "",
      table(["Stage", "Fields"], aggregate.states.map((state) => [state.name, fields(state.fields)])),
      aggregate.entities.length === 0 ? undefined : doc(
        "Entities:",
        "",
        table(["Entity", "Fields"], aggregate.entities.map((entity) => [entity.name, fields(entity.fields)]))
      ),
      "Rules:",
      "",
      table(["Rule", "Error"], aggregate.invariants.map((invariant) => [invariant.rule, nameOf(invariant.error)])),
      "Commands:",
      "",
      table(
        ["Command", "Who", "Why", "Emits", "Refused with"],
        list("commands").filter((command) => command.aggregate === aggregate.id).map((command) => [
          command.name,
          command.actor,
          command.intent,
          names(command.emits),
          names(command.rejectsWith)
        ])
      ),
      "Events:",
      "",
      table(
        ["Event", "Fields"],
        list("events").filter((event) => event.aggregate === aggregate.id).map((event) => [event.name, fields(event.fields)])
      )
    ]),
    "## Value objects",
    "",
    table(
      ["Name", "Shape", "Rules"],
      inContext("valueObjects", context.id).map((value) => [
        value.name,
        value.kind === "id" ? `id, \`${value.shape}\`` : fields(value.fields),
        value.rules.join("; ")
      ])
    ),
    "## Reactions",
    "",
    table(
      ["Name", "When", "Then", "Timing"],
      inContext("policies", context.id).map((policy) => [
        policy.name,
        policy.trigger.event ? nameOf(policy.trigger.event) : `schedule \`${policy.trigger.schedule}\``,
        nameOf(policy.then),
        policy.timing
      ])
    ),
    "## Queries",
    "",
    table(
      ["Query", "Input", "Output"],
      inContext("queries", context.id).map((query) => [query.name, fields(query.input), fields(query.output)])
    ),
    "## Errors",
    "",
    table(["Error", "Meaning"], inContext("errors", context.id).map((error) => [error.name, error.meaning])),
    "## External systems",
    "",
    table(
      ["System", "Purpose", "Operations"],
      inContext("externalSystems", context.id).map((system) => [system.name, system.purpose, system.operations.join(", ")])
    ),
    "## Talks to",
    "",
    table(
      ["Direction", "Context", "What crosses"],
      relations.map((relation) =>
        relation.from === context.id
          ? ["sends to", nameOf(relation.to), names(relation.carries)]
          : ["receives from", nameOf(relation.from), names(relation.carries)]
      )
    )
  ))
}

// stories.md

const storyGroups = [
  ["main", "Main stories"],
  ["unhappy", "When things go wrong"],
  ["case", "Real cases checked against the model"]
]
files.set("stories.md", doc(
  "# Stories",
  "",
  "What happens, in the words of the people who use the system.",
  "",
  ...storyGroups.flatMap(([kind, heading]) => {
    const stories = list("stories").filter((story) => story.kind === kind)
    if (stories.length === 0) return []
    return [
      `## ${heading}`,
      "",
      ...stories.flatMap((story) => [`### ${story.title}`, "", ...story.steps.map((step, i) => `${i + 1}. ${step}`), ""])
    ]
  })
))

// decisions.md

const delegated = [...byId.values()].flatMap((element) =>
  (element.evidence ?? [])
    .filter((entry) => typeof entry === "string" && entry.startsWith("decided:"))
    .map((entry) => [nameOf(element.id), entry.slice("decided:".length).trim()])
)
files.set("decisions.md", doc(
  "# Decisions",
  "",
  "Why the model has this shape. Read this before changing a boundary or a name.",
  "",
  "## Disagreements settled",
  "",
  table(["The code did", "The people said", "Decision"], list("tensions").map((tension) => [tension.code, tension.user, tension.resolution])),
  "## Aggregate boundaries",
  "",
  table(["Aggregate", "Why the boundary is here"], list("aggregates").map((aggregate) => [aggregate.name, aggregate.why])),
  "## Decided without the people",
  "",
  "These were left to the agent, which picked the option that kept behavior unchanged.",
  "",
  table(["Element", "Reason"], delegated),
  "## Left out",
  "",
  list("outOfScope").length === 0 ? "Nothing.\n" : list("outOfScope").map((item) => `- ${item}`).join("\n") + "\n"
))

// architecture.md

const transportFiles = {
  rpc: { contract: "contract/Rpc.ts", handlers: "infrastructure/RpcHandlers.ts" },
  "http-api": { contract: "contract/HttpApi.ts", handlers: "infrastructure/HttpApiHandlers.ts" }
}[transport]
const exposeStep = {
  rpc: "Add an `Rpc.make` entry to `contract/Rpc.ts` and a handler to `infrastructure/RpcHandlers.ts`.",
  "http-api": "Add an endpoint to `contract/HttpApi.ts` and a handler to `infrastructure/HttpApiHandlers.ts`.",
  local: "The frontend calls the new method directly, through the layer in `browser.ts`.",
  other: "Add a handler to the existing entry point. It calls the new method and nothing else.",
  none: "Add a handler to the entry point that serves it. It calls the new method and nothing else."
}[transport]

files.set("architecture.md", doc(
  "# Architecture",
  "",
  "Where code goes, and how to add to it. Built with Effect v4.",
  "",
  "## Layout",
  "",
  `One folder per context, at \`${contextRoot}\`:`,
  "",
  table(["Context", "Folder"], list("contexts").map((context) => [context.name, `\`${context.module}\``])),
  "Inside each context folder:",
  "",
  "```",
  "index.ts                     server API: service classes and the context layer",
  "contract/",
  "  index.ts                   browser-safe schemas: ids, values, commands, queries, events, errors",
  transportFiles ? `${`  ${transportFiles.contract.split("/")[1]}`.padEnd(29)}browser-safe transport definition` : undefined,
  transport === "local" ? "browser.ts                   layer that runs the context in the browser" : undefined,
  "domain/                      value objects, aggregates, errors, repository interfaces",
  "application/                 command services, queries, event bus, reactions",
  "infrastructure/              repository layers, external system adapters, translations",
  transportFiles ? `${`  ${transportFiles.handlers.split("/")[1]}`.padEnd(29)}server handlers for the transport` : undefined,
  "```",
  "",
  model.repo.storage && model.repo.storage !== "none" ? `Repositories store data with \`${model.repo.storage}\`.\n` : undefined,
  "## Import rules",
  "",
  "- `domain/` imports only `effect` and other files in `domain/`.",
  "- `contract/` imports only `effect`, `effect/rpc`, `effect/http-api` and `domain/`.",
  "- Another context's server code imports this context only through `index.ts`.",
  "- Browser code imports a context only through `contract/`" + (transport === "local" ? " and `browser.ts`." : "."),
  frontend.kind === "none" ? undefined : doc(
    "",
    "## Frontend",
    "",
    `The ${frontend.kind} frontend in \`${frontend.path}\` reaches the domain through \`${transport}\`. Its files are grouped by context. Screen state stays in the frontend.`
  ),
  "",
  "## Add a command",
  "",
  "1. Add the command class to `domain/<Aggregate>.ts` and to its command union.",
  "2. Add its decide function there. It checks the rules and returns events. Test each rule.",
  "3. Add any new event, its case in `evolve`, and any new error in `domain/errors.ts`.",
  "4. Add a method to `application/<Aggregate>Commands.ts`. It loads, decides, saves and publishes.",
  `5. Export the command from \`contract/index.ts\`. ${exposeStep}`,
  "6. Add the command to the context file in `docs/domain/contexts/`, and any new word to `docs/domain/glossary.md`.",
  "",
  "## Add a reaction to an event",
  "",
  "1. Add the reaction to `application/policies.ts`. It runs after its event and calls one command method.",
  "2. If both changes must succeed or fail together, call the second command inside the first command's method, in one storage transaction, instead.",
  "3. Add the reaction to the context file.",
  "",
  "## Add a query",
  "",
  "1. Add the query class and its result schema to `contract/index.ts`.",
  `2. Add a method to \`application/<Context>Queries.ts\`. ${exposeStep}`,
  "3. Add the query to the context file.",
  "",
  "## Add an external system",
  "",
  "1. Add a `Context.Service` port in `application/`.",
  "2. Add its adapter layer and a test layer in `infrastructure/<System>.ts`.",
  "3. Add the system to the context file.",
  ""
))

// Write or check

const problems = []
for (const [path, content] of files) {
  const target = join(out, path)
  if (check) {
    if (!existsSync(target)) problems.push(`missing: docs/domain/${path}`)
    else if (readFileSync(target, "utf8") !== content) problems.push(`out of date: docs/domain/${path}`)
  } else {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

if (problems.length > 0) {
  console.log(problems.join("\n"))
  console.log(`\n${problems.length} problem(s). Fix the model, then render the docs again.`)
  process.exit(1)
}
console.log(check ? "OK" : `Wrote ${files.size} files to docs/domain.`)
