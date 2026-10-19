# Frontend

The frontend is an entry point into the domain, like an HTTP endpoint. It sends commands and queries through the contracts and shows the results. It holds no business rules.

Read this file when `repo.frontend.kind` is not `none`.

## Contents
- Rules for every frontend
- Foldkit
- TanStack Start with Effect Atom
- Other frontends
- Frontend steps

## Rules for every frontend

- Frontend files import a context only through its `contract.ts`. Add a lint rule that enforces it, such as `no-restricted-imports` for `*/domain/*`, `*/application/*`, `*/infrastructure/*` and `*/index.ts` of each context.
- Group frontend files by context, using the context folder names from the model.
- Reuse contract schemas such as `OrderId` and `Money` in frontend state. Never redefine a domain type in the frontend.
- A rule checked in the browser for quick feedback must also run in the aggregate. Put the shared check in a `Schema.check` on a value object, so both sides use the same code.
- Show a domain error by matching on its `_tag`. Never parse error messages.
- Screen state stays in the frontend: open dialogs, form drafts, loading flags. It never enters the domain model.

## Foldkit

Foldkit uses The Elm Architecture. Keep its terms apart from the domain terms:

| Foldkit | Domain | Relationship |
|---|---|---|
| Message `ClickedPlaceOrder` | none | a fact about the screen |
| Command `PlaceOrder` | command `PlaceOrder` | the Foldkit Command calls the domain command over RPC |
| Message `SucceededPlaceOrder`, `FailedPlaceOrder` | event `OrderPlaced`, error `OrderAlreadyPlaced` | the screen learns the result |
| Model | aggregate state | the Model holds what the screen shows, not the business state |
| Subscription | streaming `Rpc` such as `WatchOrders` | domain events arrive as Messages |

Target layout:

```
<frontend>/src/
  entry.ts                    Runtime.makeApplication({ ..., resources: ClientsLive })
  clients.ts                  one Context.Service per contract, merged into ClientsLive
  <context>/
    <screen>/
      model.ts                Schema Model built from contract schemas
      message.ts              facts about the screen, Succeeded*/Failed* results
      command.ts              Command.define per server call
      update.ts, view.ts, subscription.ts
```

Client service, one per contract:

```ts
import { Context, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { RpcClient, RpcClientError, RpcSerialization } from "effect/rpc"
import { OrderingRpcs } from "../../src/ordering/contract.ts"

export class OrderingClient extends Context.Service<
  OrderingClient,
  RpcClient.FromGroup<typeof OrderingRpcs, RpcClientError.RpcClientError>
>()("web/OrderingClient") {
  static readonly layer = Layer.effect(OrderingClient, RpcClient.make(OrderingRpcs)).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url: "/rpc" })),
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson])
  )
}
```

Foldkit Command:

```ts
export const PlaceOrder = Command.define("PlaceOrder", {
  args: { id: OrderId },
  messages: [Message.SucceededPlaceOrder, Message.FailedPlaceOrder],
  execute: ({ id }) =>
    Effect.gen(function*() {
      const client = yield* OrderingClient
      yield* client.PlaceOrder(new PlaceOrderCommand({ id }))
      return Message.SucceededPlaceOrder({ id })
    }).pipe(
      Effect.catchTag("OrderAlreadyPlaced", () => Effect.succeed(Message.FailedPlaceOrder({ reason: "AlreadyPlaced" }))),
      Effect.catch(() => Effect.succeed(Message.FailedPlaceOrder({ reason: "Unavailable" })))
    )
})
```

The import path of `contract.ts` depends on the repository. In a monorepo, expose each `contract.ts` through the server package's `exports` map. Import the contract's `PlaceOrder` as `PlaceOrderCommand` so it does not clash with the Foldkit Command name. Use `AsyncData` from `foldkit` for loaded query results in the Model.

## TanStack Start with Effect Atom

The browser reaches the domain only through RPC. A TanStack Start server route serves the RPC groups. Atoms from `effect/reactivity` call them, and `@effect/atom-react` hooks read the atoms.

Target layout:

```
src/
  <context>/                  the bounded contexts, unchanged
  server/
    rpc.ts                    HttpRouter.toWebHandler over RpcServer.layerHttp for every contract
  routes/
    rpc.ts                    server route that passes the Request to the handler from server/rpc.ts
    <screen>.tsx              components: useAtomValue, useAtomSet
  web/
    <context>/
      client.ts               AtomRpc.Service for the context's contract
      atoms.ts                queries and mutations with reactivity keys
```

Server handler:

```ts
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { OrderingRpcs } from "../ordering/contract.ts"
import { OrderingLive } from "../ordering/index.ts"

export const { handler } = HttpRouter.toWebHandler(
  RpcServer.layerHttp({ group: OrderingRpcs, path: "/rpc", protocol: "http" }).pipe(
    Layer.provide([OrderingLive, RpcSerialization.layerNdjson])
  )
)
```

`OrderingLive` is the context's `index.ts` export that provides `OrderingRpcsLive` with all its dependencies. Mount `handler` in a server route at `/rpc` with the server route API of the project's TanStack Start version.

Client and atoms:

```ts
import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { OrderingRpcs } from "../../ordering/contract.ts"

export class OrderingClient extends AtomRpc.Service<OrderingClient>()("web/OrderingClient", {
  group: OrderingRpcs,
  protocol: RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson])
  )
}) {}

export const draftOrders = OrderingClient.query("ListDraftOrders", undefined, { reactivityKeys: ["orders"] })
export const placeOrder = OrderingClient.mutation("PlaceOrder")
```

A component calls `useAtomSet(placeOrder)` with `{ payload, reactivityKeys: ["orders"] }`. The mutation refreshes every query on the same key. Name reactivity keys after aggregates.

- Use server functions only where TanStack Start needs them, such as a loader that prefills data for server rendering. A server function calls the same command or query service through a `ManagedRuntime` built from the application layer. It never holds rules.
- To render on the server with data, dehydrate the atoms in the loader with `Hydration.dehydrate`. Wrap the page in `HydrationBoundary` from `@effect/atom-react`.
- Read query atoms with `useAtomValue`. It returns an `AsyncResult`. Match the failure on the error `_tag`.

## Other frontends

Set `repo.frontend.kind` to `other`. The plan replaces each server call with a call through the contract's `RpcClient` and leaves the screen code as it is.

## Frontend steps

Add these steps after the contracts exist. Each step names the command and query ids whose callers it moves in `refs`.

1. Add the client for each contract: `clients.ts` for Foldkit, `web/<context>/client.ts` for TanStack Start.
2. Move the screens of one context at a time onto its client. For Foldkit, replace each fetch in a Command with a client call. For TanStack Start, replace each server function, loader call or `fetch` with a query or mutation atom.
3. Move each business rule found in frontend code into its aggregate or value object. Keep a browser copy only as a shared `Schema.check`.
4. Replace polling with a Subscription (Foldkit) or a query on a streaming `Rpc` (TanStack Start), when the model has an event the screen waits for.
5. Move frontend files into the `<context>/` folders and add the import lint rule.
6. Delete the old endpoints and server functions that nothing calls.
