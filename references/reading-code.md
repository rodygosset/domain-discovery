# Reading the code

Turn an Effect v4 codebase into a first draft of the model. Every entry starts as `"status": "hypothesis"` with the file and line as evidence.

## Contents
- Order of reading
- Where each model element hides
- Signs of a boundary
- Signs of a misleading name

## Order of reading

1. `package.json`: record the Effect version, the package manager and the commands that build and test. These become `repo.checks`.
2. The edges: `HttpApi` groups, `RpcGroup` definitions, CLI commands, queue consumers. Each operation that changes something is a candidate command. Each read is a candidate query.
3. The `Context.Service` classes and their `Layer` graph. Note what each service depends on.
4. The schemas: `Schema.Class`, `Schema.Struct`, `Schema.TaggedError`, and the SQL tables and migrations.
5. The text that humans read: UI strings, error messages, log messages, `Effect.fn` span names.
6. Git history: `git log --format= --name-only | sort | uniq -c | sort -rn | head -40` shows where change concentrates.

## Where each model element hides

| Model element | Look for |
|---|---|
| Glossary term | Names in UI strings and error messages first, then schema and service names. Record every synonym. |
| Event | A `*_at` or `*_by` column. Each value of a status field such as `Schema.Literals([...])`. Every email, notification, webhook or log line that reports something finished. |
| Command | An endpoint, RPC or form handler that writes. A service method whose name is a verb. A generic `update` or `save` is a hint that several commands hide behind one function. |
| Actor | Auth middleware, `HttpApiSecurity`, role checks, `createdBy` fields. |
| Invariant | `Effect.fail` and `return yield* new SomeError(...)`. `Effect.filterOrFail`. `Schema.check` filters. Guard `if` statements before a write. Unique constraints and foreign keys. |
| Aggregate boundary | `sql.withTransaction` blocks, `SELECT ... FOR UPDATE`, version columns, retries on conflict. What is written together in one transaction is a candidate aggregate. |
| Value object | Primitives with rules attached: a string validated in several places, an amount always passed with a currency, a pair of dates that form a period. Structs compared field by field. |
| Entity | Something with an id that changes over time and is tracked across changes. |
| Policy | `PubSub` subscribers, `Stream.runForEach` loops, `Layer.effectDiscard` background tasks, `Effect.forkScoped` work started after a write, database triggers. |
| Schedule | `Schedule.cron`, `Effect.repeat` loops, external cron jobs that call an endpoint. |
| Query | Read endpoints, list and search functions, joins that build screens. |
| External system | `HttpClient` services, SDK clients, webhooks received. |
| Domain error | `Schema.TaggedError` definitions whose message a user would understand. Errors about storage or the network are not domain errors. |

## Signs of a boundary

- One word with two meanings in different modules: `Product` with price fields in one place and stock fields in another.
- A large schema whose fields split into groups that different modules read.
- A service that many unrelated services depend on.
- Folders that the git history shows change separately.
- Cycles in the `Layer` graph.

Record each candidate context with the evidence. The user confirms or merges them later.

## Signs of a misleading name

Record these as tensions, not as glossary terms:

- Technical names: `Manager`, `Handler`, `Processor`, `Data`, `Info`, `Record`, `Item`.
- Numeric or vague status values: `status: 3`, `flag`, `type`.
- A name that differs between the UI text and the code for the same thing.
- One function that does different things depending on a mode argument.
