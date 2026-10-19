# Effect v4 mapping

The target shape for the refactoring plan. Use these constructs and this layout by default. Deviate only where the model records a reason in `evidence`.

## Contents
- Import paths
- Target layout
- Concept to construct
- Code shapes
- Step order
- Rules for every step

For a frontend, also read [frontend.md](frontend.md).

## Import paths

Effect 4 stable ships these modules inside the `effect` package: `effect` (core, `Schema`, `Context`, `Layer`), `effect/schema` (`Model`), `effect/sql`, `effect/http`, `effect/http-api`, `effect/rpc` and `effect/reactivity`. Database drivers are separate packages, such as `@effect/sql-pg`. Never import from `effect/unstable/*`, which only beta versions had.

## Target layout

One folder per bounded context. Server code in another context imports it through `index.ts`. Browser code imports it through `contract/`, or through `browser.ts` when the context runs in the browser.

```
src/<context>/
  index.ts                         server API: service classes and <Context>Live
  contract/
    index.ts                       browser-safe schemas: ids, values, commands, queries, events, errors
    Rpc.ts or HttpApi.ts           browser-safe transport definition, when the transport needs one
  browser.ts                       layer that runs the context in the browser, for transport local only
  domain/
    <Name>.ts                      one value object per file
    <Aggregate>.ts                 states, commands, events, decide, evolve
    errors.ts                      domain errors of this context
    <Aggregate>Repository.ts       repository interface only
  application/
    <Aggregate>Commands.ts         one method per command
    <Context>Queries.ts            read operations
    <Context>Events.ts             in-process event bus
    policies.ts                    reactions to events and schedules
  infrastructure/
    Sql<Aggregate>Repository.ts    repository layer on SqlClient
    Memory<Aggregate>Repository.ts repository layer for tests
    <External>.ts                  adapter for an external system
    From<Upstream>.ts              translation from an upstream context
    RpcHandlers.ts or HttpApiHandlers.ts   server handlers for the transport
    Browser<Aggregate>Repository.ts        repository layer on browser storage, for transport local only
```

## Concept to construct

| Model element | Effect v4 construct | File |
|---|---|---|
| Value object, `kind: id` | `Schema.String.pipe(Schema.brand("OrderId"))` | `domain/OrderId.ts` |
| Value object, `kind: value` | `Schema.Class`, rules as `Schema.check(...)` | `domain/<Name>.ts` |
| Entity inside an aggregate | `Schema.Class` with a branded id field | `domain/<Aggregate>.ts` |
| Aggregate state | one `Schema.TaggedClass` per state, joined with `Schema.Union([...]).pipe(Schema.toTaggedUnion("_tag"))` | `domain/<Aggregate>.ts` |
| Command | `Schema.TaggedClass`, joined per aggregate with `toTaggedUnion` | `domain/<Aggregate>.ts` |
| Event | `Schema.TaggedClass`, joined per aggregate with `toTaggedUnion` | `domain/<Aggregate>.ts` |
| Invariant | a check inside `decide` that fails with the invariant's error | `domain/<Aggregate>.ts` |
| Domain error | `Schema.TaggedError` | `domain/errors.ts` |
| Repository | `Context.Service` interface; `layer` with `SqlModel.makeRepository`; `layerTest` on `Ref` | `domain/`, `infrastructure/` |
| Command handling | `Context.Service`, one `Effect.fn("<Service>.<method>")` per command | `application/<Aggregate>Commands.ts` |
| Query | `Context.Service`; reads with `SqlSchema.findAll` or `SqlSchema.findOneOption` | `application/<Context>Queries.ts` |
| Event bus | `Context.Service` over `PubSub.bounded`, `subscribe` as `Stream.fromPubSub` | `application/<Context>Events.ts` |
| Policy, `timing: eventual` | `Layer.effectDiscard` that runs `Stream.runForEach` on the bus with `Effect.forkScoped` | `application/policies.ts` |
| Policy, `timing: same-transaction` | a second step in the same command method, wrapped in `sql.withTransaction` | `application/<Aggregate>Commands.ts` |
| Policy, schedule trigger | `Layer.effectDiscard` with `Effect.repeat` and `Schedule.cron` | `application/policies.ts` |
| External system | `Context.Service` port in `application/`, adapter `layer` on `HttpClient` | `infrastructure/<External>.ts` |
| Relation with `translation: acl` | downstream subscribes to the upstream bus and decodes into its own commands | `infrastructure/From<Upstream>.ts` |
| Current time | `DateTime.now`, so tests control it with `TestClock` | anywhere |
| New ids | a small `Context.Service` per id kind, so tests fix the values | `application/` |
| Contract | schemas re-exported from `domain/`, plus one `Schema.TaggedClass` per query and a schema for its result | `contract/index.ts` |
| Transport `rpc` | `RpcGroup.make` from the contract schemas; handlers with `<Group>.toLayer` | `contract/Rpc.ts`, `infrastructure/RpcHandlers.ts` |
| Transport `http-api` | `HttpApiGroup.make` with one endpoint per command and query, errors annotated with `HttpApiSchema.status`; handlers with `HttpApiBuilder.group` | `contract/HttpApi.ts`, `infrastructure/HttpApiHandlers.ts` |
| Transport `server-fn` | one TanStack Start `createServerFn` per command and query, run through a `ManagedRuntime` of the application layer | the frontend's server files |
| Transport `local` | the context runs in the browser. `browser.ts` builds its layer with repositories on `IndexedDb` from `@effect/platform-browser` or on `@effect/sql-sqlite-wasm`. Sync with a server, if any, is an external system, for example built on `effect/eventlog` | `browser.ts`, `infrastructure/Browser<Aggregate>Repository.ts` |
| Transport `other` | the existing mechanism, with each handler calling one command or query service method | existing files |
| Any other entry point | HTTP endpoints, CLI commands or queue consumers that only decode input and call a command or query service | existing files |

## Code shapes

The examples use an online shop. The `ordering` context owns the `Order` aggregate.

Aggregate module. One decide function per command checks the rules and returns events. `evolve` applies one event. Both are pure and need no services.

```ts
import { DateTime, Effect, Schema } from "effect"
import { OrderAlreadyPlaced } from "./errors.ts"
import { Money } from "./Money.ts"
import { OrderId } from "./OrderId.ts"

export class DraftOrder extends Schema.TaggedClass<DraftOrder>()("DraftOrder", {
  id: OrderId,
  total: Money
}) {}

export class PlacedOrder extends Schema.TaggedClass<PlacedOrder>()("PlacedOrder", {
  id: OrderId,
  total: Money,
  placedAt: Schema.DateTimeUtc
}) {}

export const Order = Schema.Union([DraftOrder, PlacedOrder]).pipe(Schema.toTaggedUnion("_tag"))
export type Order = typeof Order.Type

export class PlaceOrder extends Schema.TaggedClass<PlaceOrder>()("PlaceOrder", {
  id: OrderId
}) {}

export class OrderPlaced extends Schema.TaggedClass<OrderPlaced>()("OrderPlaced", {
  id: OrderId,
  placedAt: Schema.DateTimeUtc
}) {}

export const OrderEvent = Schema.Union([OrderPlaced]).pipe(Schema.toTaggedUnion("_tag"))
export type OrderEvent = typeof OrderEvent.Type

export const place = Effect.fn("Order.place")(function*(state: Order, command: PlaceOrder) {
  if (state._tag === "PlacedOrder") {
    return yield* new OrderAlreadyPlaced({ id: command.id })
  }
  const placedAt = yield* DateTime.now
  return [new OrderPlaced({ id: command.id, placedAt })]
})

export const evolve = (state: Order, event: OrderEvent): Order =>
  OrderEvent.match(event, {
    OrderPlaced: (e) => new PlacedOrder({ id: state.id, total: state.total, placedAt: e.placedAt })
  })
```

Name each decide function after the command's verb: `place` for `PlaceOrder`.

Domain error:

```ts
import { Schema } from "effect"
import { OrderId } from "./OrderId.ts"

export class OrderAlreadyPlaced extends Schema.TaggedError<OrderAlreadyPlaced>()("OrderAlreadyPlaced", {
  id: OrderId
}) {}
```

Command service. It loads, decides, saves and publishes. It holds no rules. It imports the aggregate module as a namespace: `import * as Order from "../domain/Order.ts"`.

```ts
export class OrderCommands extends Context.Service<OrderCommands, {
  place(command: Order.PlaceOrder): Effect.Effect<void, OrderAlreadyPlaced | OrderNotFound>
}>()("app/ordering/OrderCommands") {
  static readonly layerNoDeps = Layer.effect(
    OrderCommands,
    Effect.gen(function*() {
      const repository = yield* OrderRepository
      const events = yield* OrderingEvents

      const place = Effect.fn("OrderCommands.place")(function*(command: Order.PlaceOrder) {
        const state = yield* repository.get(command.id)
        const emitted = yield* Order.place(state, command)
        yield* repository.save(emitted.reduce(Order.evolve, state))
        yield* events.publishAll(emitted)
      })

      return OrderCommands.of({ place })
    })
  )

  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([SqlOrderRepository.layer, OrderingEvents.layer])
  )

  static readonly layerTest = this.layerNoDeps.pipe(
    Layer.provideMerge([MemoryOrderRepository.layerTest, OrderingEvents.layer])
  )
}
```

The SQL repository keeps its row shape in `infrastructure/`, as a `Model.Class` from `effect/schema`. It builds the basic operations with `SqlModel.makeRepository` from `effect/sql`, and converts between rows and aggregate states. Rows never leave `infrastructure/`.

Contract. It re-exports domain schemas and adds the query schemas. It imports only `effect` and files in `domain/`, so a browser bundle can include it.

```ts
import { Schema } from "effect"
import { DraftOrder } from "../domain/Order.ts"

export { Money } from "../domain/Money.ts"
export { OrderId } from "../domain/OrderId.ts"
export { DraftOrder, OrderEvent, OrderPlaced, PlaceOrder } from "../domain/Order.ts"
export { OrderAlreadyPlaced, OrderNotFound } from "../domain/errors.ts"

export class ListDraftOrders extends Schema.TaggedClass<ListDraftOrders>()("ListDraftOrders", {}) {}
export const DraftOrders = Schema.Array(DraftOrder)
```

The transport the model names in `repo.frontend.transport` decides what comes next. Keep the transport the code uses today. Changing it is a behavior change and needs a resolved tension.

Transport `rpc`, in `contract/Rpc.ts`:

```ts
export const OrderingRpcs = RpcGroup.make(
  Rpc.make("PlaceOrder", { payload: PlaceOrder, error: Schema.Union([OrderAlreadyPlaced, OrderNotFound]) }),
  Rpc.make("ListDraftOrders", { payload: ListDraftOrders, success: DraftOrders }),
  Rpc.make("WatchOrders", { success: OrderEvent, stream: true })
)
```

Transport `http-api`, in `contract/HttpApi.ts`. HTTP status codes live here, never in `domain/`:

```ts
export class OrderingApi extends HttpApiGroup.make("ordering").add(
  HttpApiEndpoint.post("placeOrder", "/orders/:id/place", {
    params: { id: OrderId },
    error: [OrderAlreadyPlaced.pipe(HttpApiSchema.status(409)), OrderNotFound.pipe(HttpApiSchema.status(404))]
  }),
  HttpApiEndpoint.get("listDraftOrders", "/orders/drafts", { success: DraftOrders })
) {}
```

Handlers call one service method each and hold no logic:

```ts
export const OrderingRpcHandlers = OrderingRpcs.toLayer(
  Effect.gen(function*() {
    const commands = yield* OrderCommands
    const queries = yield* OrderingQueries
    const events = yield* OrderingEvents
    return {
      PlaceOrder: (command) => commands.place(command),
      ListDraftOrders: (query) => queries.listDraftOrders(query),
      WatchOrders: () => events.subscribe
    }
  })
)
```

Infrastructure failures stay out of domain signatures. Convert them with `Effect.orDie`, unless the current code recovers from them. In that case add one `<Context>StorageError` to `domain/errors.ts` and record it in `errors`.

Tests use `@effect/vitest`. Aggregate tests call decide functions with a state and assert the events or the error. Command service tests provide `layerTest`. Name each test after the rule it proves, in glossary terms: `"rejects placing an order twice"`.

## Step order

Plan the steps in this order. Split a step per aggregate or per context when it would touch more than about 15 files.

1. Create the context folders and value objects. Point existing code at the new types.
2. Add domain errors.
3. Add each aggregate module with its tests. Nothing calls it yet.
4. Add the repository interface, the SQL layer that wraps the existing queries, and the memory layer.
5. Add each command service. Move callers to it one command at a time. Delete each old function once nothing calls it.
6. Add the event buses and policies. Delete the hooks, listeners and callbacks they replace.
7. Add query services and move read callers.
8. Add ports and adapters for external systems, and the translation for each `acl` relation.
9. Add each context's `contract/index.ts`. Add the transport files that `repo.frontend.transport` calls for, and serve them next to the existing endpoints.
10. If `repo.frontend.kind` is not `none`, move the frontend onto the contracts. [frontend.md](frontend.md) gives the steps.
11. Rename what is left to the glossary terms in each `retire` list.
12. Build the application layer from each context's `layer`. Delete dead modules and endpoints that nothing calls.

## Rules for every step

- Leave `repo.checks` passing at the end of each step.
- Use glossary terms for every name the step creates.
- Never import from another context's `domain/`, `application/` or `infrastructure/`. Import its `index.ts`, or from browser code its `contract/` or `browser.ts`.
- Files in `domain/` import only `effect` and other files in `domain/`. Files in `contract/` import only `effect`, `effect/rpc`, `effect/http-api` and `domain/`. This keeps `contract/` safe for the browser.
- Keep behavior unchanged. A behavior change needs a tension with a resolution in the model.
