# Frontend

The frontend is an entry point into the domain, like an HTTP endpoint. It sends commands and queries and shows the results. It holds no business rules.

Read this file when `repo.frontend.kind` is not `none`.

## Contents
- Transports
- Rules for every frontend
- Foldkit
- TanStack Start with Effect Atom
- Other frontends
- Frontend steps

## Transports

`repo.frontend.transport` says how the frontend reaches the domain. Keep the transport the code uses today. Changing it is a behavior change and needs a resolved tension.

| Transport | The frontend calls | The frontend imports |
|---|---|---|
| `rpc` | an `RpcClient` built from `contract/Rpc.ts` | `contract/` |
| `http-api` | an `HttpApiClient` built from `contract/HttpApi.ts` | `contract/` |
| `server-fn` | TanStack Start server functions that call the command and query services | `contract/` |
| `local` | the command and query services directly, running in the browser on the layer from `browser.ts` | `contract/` and `browser.ts` |
| `other` | the existing mechanism, moved behind one client service per context | `contract/` |

In every case, the frontend code that triggers a command or reads a query depends on a single service per context. Only the layer behind that service changes with the transport. This keeps screens the same if the transport changes later.

## Rules for every frontend

- Frontend files import a context only through the files in the table above. Add a lint rule that enforces it, such as `no-restricted-imports` on the other folders of each context.
- Group frontend files by context, using the context folder names from the model.
- Reuse contract schemas such as `OrderId` and `Money` in frontend state. Never redefine a domain type in the frontend.
- A rule checked in the browser for quick feedback must also run in the aggregate. Put the shared check in a `Schema.check` on a value object, so both sides use the same code. With transport `local`, the aggregate already runs in the browser, so delete the copy.
- Show a domain error by matching on its `_tag`. Never parse error messages.
- Screen state stays in the frontend: open dialogs, form drafts, loading flags. It never enters the domain model.

## Foldkit

Foldkit uses The Elm Architecture. Keep its terms apart from the domain terms:

| Foldkit | Domain | Relationship |
|---|---|---|
| Message `ClickedPlaceOrder` | none | a fact about the screen |
| Command `PlaceOrder` | command `PlaceOrder` | the Foldkit Command sends the domain command through the client service |
| Message `SucceededPlaceOrder`, `FailedPlaceOrder` | event `OrderPlaced`, error `OrderAlreadyPlaced` | the screen learns the result |
| Model | aggregate state | the Model holds what the screen shows, not the business state |
| Subscription | an event stream | domain events arrive as Messages |

Target layout:

```
<frontend>/src/
  entry.ts                    Runtime.makeApplication({ ..., resources: ClientsLive })
  clients.ts                  one client service per context, merged into ClientsLive
  <context>/
    <screen>/
      model.ts                Schema Model built from contract schemas
      message.ts              facts about the screen, Succeeded* and Failed* results
      command.ts              Command.define per call to the client service
      update.ts, view.ts, subscription.ts
```

The client service in `clients.ts` depends on the transport:

| Transport | Client service |
|---|---|
| `rpc` | `Context.Service` over `RpcClient.make(OrderingRpcs)`, with `RpcClient.layerProtocolHttp` |
| `http-api` | `Context.Service` over `HttpApiClient.make(api)`, with `FetchHttpClient.layer` |
| `local` | none: Commands yield `OrderCommands` and `OrderingQueries`, and `ClientsLive` is the layer from `browser.ts` |
| `other` | `Context.Service` whose methods wrap the existing calls |

A Foldkit Command, here with transport `rpc`. With another transport, only the line that calls the client changes.

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

Import the contract's `PlaceOrder` as `PlaceOrderCommand` so it does not clash with the Foldkit Command name. Use `AsyncData` from `foldkit` for loaded query results in the Model. A Subscription turns an event stream into Messages: a streaming `Rpc`, an HTTP event stream, or with transport `local` the context's event bus.

## TanStack Start with Effect Atom

Atoms from `effect/reactivity` call the domain, and `@effect/atom-react` hooks read the atoms.

Target layout:

```
src/
  <context>/                  the bounded contexts
  server/                     transport wiring for rpc, http-api or server-fn
  routes/
    <screen>.tsx              components: useAtomValue, useAtomSet
  web/
    <context>/
      client.ts               the client for the transport
      atoms.ts                queries and mutations with reactivity keys
```

The client and the atoms depend on the transport:

| Transport | `server/` | `web/<context>/client.ts` and `atoms.ts` |
|---|---|---|
| `rpc` | `HttpRouter.toWebHandler` over `RpcServer.layerHttp`, mounted on a server route | `AtomRpc.Service` with the group; atoms from `.query` and `.mutation` |
| `http-api` | `HttpRouter.toWebHandler` over `HttpApiBuilder.layer`, mounted on a server route | `AtomHttpApi.Service` with the API; atoms from `.query` and `.mutation` |
| `server-fn` | one `createServerFn` per command and query, each running one service method through a `ManagedRuntime` | `Atom.runtime` atoms and `fn` atoms that call the server functions |
| `local` | none | `Atom.runtime` on the layer from `browser.ts`; atoms and `fn` atoms that call the services |
| `other` | the existing server code | `Atom.runtime` on a client service that wraps the existing calls |

Atoms with transport `rpc`:

```ts
export class OrderingClient extends AtomRpc.Service<OrderingClient>()("web/OrderingClient", {
  group: OrderingRpcs,
  protocol: RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson])
  )
}) {}

export const draftOrders = OrderingClient.query("ListDraftOrders", new ListDraftOrders({}), { reactivityKeys: ["orders"] })
export const placeOrder = OrderingClient.mutation("PlaceOrder")
```

- A component calls `useAtomSet(placeOrder)` with `{ payload, reactivityKeys: ["orders"] }`. The mutation refreshes every query on the same key. Name reactivity keys after aggregates. With transport `local`, give each mutation atom the same keys through `Atom.withReactivity`.
- Read query atoms with `useAtomValue`. It returns an `AsyncResult`. Match the failure on the error `_tag`.
- Mount server handlers with the server route API of the project's TanStack Start version.
- To render on the server with data, dehydrate the atoms in the loader with `Hydration.dehydrate`. Wrap the page in `HydrationBoundary` from `@effect/atom-react`. With transport `local`, there is no server data to render.

## Other frontends

Set `repo.frontend.kind` to `other`. The plan moves each call to the domain behind one client service per context and leaves the screen code as it is.

## Frontend steps

Add these steps after the contracts exist. Each step names the command and query ids whose callers it moves in `refs`.

1. Add one client service per context for the transport. With transport `local`, add `browser.ts` and the browser repositories instead.
2. Move the screens of one context at a time onto its client service. For Foldkit, replace each direct call in a Command. For TanStack Start, replace each server function, loader call or `fetch` with a query or mutation atom.
3. Move each business rule found in frontend code into its aggregate or value object. Keep a browser copy only as a shared `Schema.check`, and only when the domain does not already run in the browser.
4. Replace polling with a Subscription (Foldkit) or a stream atom (TanStack Start), when the model has an event the screen waits for.
5. Move frontend files into the `<context>/` folders and add the import lint rule.
6. Delete the old endpoints, server functions and client code that nothing calls.
