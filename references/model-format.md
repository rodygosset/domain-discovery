# Model format

`domain-model.json` is the only output. A refactoring agent reads it and nothing else, so every name, file path and decision it needs is in this file.

## Contents
- Shared fields
- Field types
- Full example
- Section rules

## Shared fields

Every element outside `plan` has these fields:

- `id`: unique across the file. Use the prefix for its section, then a camelCase name: `term.`, `sub.`, `ctx.`, `rel.`, `vo.`, `agg.`, `inv.`, `cmd.`, `evt.`, `pol.`, `qry.`, `err.`, `ext.`, `ten.`.
- `status`: `"hypothesis"` while it comes only from code. `"confirmed"` once the user agrees or explicitly delegates the decision to you.
- `evidence`: a list of strings. Code evidence is `"path/to/file.ts:42"`. User evidence is `"user: <their words>"`. A decision the user delegated is `"decided: <reason>"`.

## Field types

`fields`, `input` and `output` map a name to a type string. A type string is one of:

- An Effect Schema name: `String`, `NonEmptyString`, `Number`, `Int`, `Boolean`, `DateTimeUtc`.
- The `name` of a value object, entity or aggregate state in the same context.
- `Option<T>`, `Array<T>`, or a literal union written as `"a" | "b"`.

## Full example

The example is an online shop, trimmed. Ids such as `ctx.shipping` and `cmd.prepareShipment` point to entries left out.

```json
{
  "version": 1,
  "repo": {
    "effectVersion": "4.0.5",
    "packageManager": "pnpm",
    "checks": ["pnpm tsc --noEmit", "pnpm vitest run"]
  },
  "purpose": {
    "summary": "Customers buy products online and the warehouse ships them.",
    "users": ["customer", "warehouse staff"],
    "value": "Customers receive what they paid for.",
    "status": "confirmed",
    "evidence": ["user: we sell, we ship, that's the business"]
  },
  "glossary": [
    {
      "id": "term.order",
      "term": "Order",
      "meaning": "What a customer commits to buy at checkout.",
      "context": "ctx.ordering",
      "retire": ["Cart", "Basket"],
      "status": "confirmed",
      "evidence": ["src/cart/CartService.ts:12", "user: it's an order as soon as they check out"]
    }
  ],
  "subdomains": [
    { "id": "sub.sales", "name": "Sales", "kind": "core", "why": "Pricing rules are what sets the shop apart.", "status": "confirmed", "evidence": ["user: ..."] }
  ],
  "contexts": [
    { "id": "ctx.ordering", "name": "Ordering", "subdomain": "sub.sales", "purpose": "Take and price customer orders.", "module": "src/ordering", "status": "confirmed", "evidence": [] }
  ],
  "relations": [
    { "id": "rel.orderingToShipping", "from": "ctx.ordering", "to": "ctx.shipping", "via": "event", "translation": "acl", "carries": ["evt.orderPlaced"], "status": "confirmed", "evidence": [] }
  ],
  "valueObjects": [
    { "id": "vo.orderId", "context": "ctx.ordering", "name": "OrderId", "kind": "id", "shape": "String", "rules": ["UUID v4"], "replaces": ["src/cart/Cart.ts:4"], "status": "confirmed", "evidence": [] },
    { "id": "vo.money", "context": "ctx.ordering", "name": "Money", "kind": "value", "fields": { "cents": "Int", "currency": "\"EUR\" | \"USD\"" }, "rules": ["cents is zero or more"], "replaces": [], "status": "confirmed", "evidence": [] }
  ],
  "aggregates": [
    {
      "id": "agg.order",
      "context": "ctx.ordering",
      "name": "Order",
      "identity": "vo.orderId",
      "states": [
        { "name": "DraftOrder", "fields": { "id": "OrderId", "total": "Money" } },
        { "name": "PlacedOrder", "fields": { "id": "OrderId", "total": "Money", "placedAt": "DateTimeUtc" } }
      ],
      "entities": [],
      "invariants": [
        { "id": "inv.placeOnce", "rule": "An order is placed at most once.", "error": "err.orderAlreadyPlaced", "evidence": ["src/cart/CartService.ts:88"] }
      ],
      "persistence": { "current": "table carts (src/db/schema.sql:10)", "strategy": "state" },
      "status": "confirmed",
      "evidence": []
    }
  ],
  "commands": [
    { "id": "cmd.placeOrder", "aggregate": "agg.order", "name": "PlaceOrder", "intent": "Commit to buy what is in the order.", "actor": "customer", "input": { "id": "OrderId" }, "emits": ["evt.orderPlaced"], "rejectsWith": ["err.orderAlreadyPlaced"], "replaces": ["src/cart/CartService.ts:80 CartService.update"], "status": "confirmed", "evidence": [] }
  ],
  "events": [
    { "id": "evt.orderPlaced", "aggregate": "agg.order", "name": "OrderPlaced", "fields": { "id": "OrderId", "placedAt": "DateTimeUtc" }, "status": "confirmed", "evidence": [] }
  ],
  "policies": [
    { "id": "pol.prepareShipmentOnPlace", "context": "ctx.shipping", "name": "PrepareShipmentForPlacedOrder", "trigger": { "event": "evt.orderPlaced" }, "then": "cmd.prepareShipment", "timing": "eventual", "replaces": ["src/cart/hooks.ts:5"], "status": "confirmed", "evidence": [] }
  ],
  "queries": [
    { "id": "qry.listDraftOrders", "context": "ctx.ordering", "name": "ListDraftOrders", "input": {}, "output": { "orders": "Array<DraftOrder>" }, "replaces": ["src/cart/CartService.ts:30"], "status": "confirmed", "evidence": [] }
  ],
  "errors": [
    { "id": "err.orderAlreadyPlaced", "context": "ctx.ordering", "name": "OrderAlreadyPlaced", "fields": { "id": "OrderId" }, "meaning": "The customer tried to place the same order twice.", "status": "confirmed", "evidence": [] }
  ],
  "externalSystems": [
    { "id": "ext.carrier", "context": "ctx.shipping", "name": "Carrier", "purpose": "Parcel delivery service.", "operations": ["bookPickup"], "current": "src/carrier/client.ts", "status": "confirmed", "evidence": [] }
  ],
  "tensions": [
    { "id": "ten.cartName", "code": "Calls it Cart from start to finish.", "user": "Calls it Order once checkout starts.", "resolution": "Rename to Order.", "status": "confirmed", "evidence": [] }
  ],
  "openQuestions": [],
  "plan": {
    "steps": [
      {
        "id": "step.01",
        "title": "Add Ordering value objects",
        "refs": ["ctx.ordering", "vo.orderId", "vo.money"],
        "create": [{ "path": "src/ordering/domain/OrderId.ts", "construct": "branded Schema", "from": "vo.orderId" }],
        "move": [],
        "edit": [{ "path": "src/cart/Cart.ts", "change": "Type the id field as OrderId." }],
        "delete": [],
        "dependsOn": [],
        "verify": ["pnpm tsc --noEmit"]
      }
    ]
  }
}
```

## Section rules

- `glossary`: one entry per domain term. `retire` lists the code names that the refactor renames to `term`.
- `subdomains.kind`: `core` (what sets the business apart), `supporting` (needed, specific to them) or `generic` (anyone's version would do).
- `contexts.module`: the folder the context will own after the refactor.
- `relations.via`: `event` or `call`. `translation`: `none`, or `acl` when the downstream context converts the upstream model into its own.
- `valueObjects.kind`: `id` uses `shape`. `value` uses `fields`.
- `aggregates.states`: one entry per lifecycle stage that has different data or allows different commands. A single stage is fine.
- `aggregates.persistence.strategy`: `state` (store the current state) unless the code already stores events.
- `commands.replaces` and `queries.replaces`: every current function, endpoint or handler that the new element supersedes.
- `policies.trigger`: `{ "event": "<evt id>" }` or `{ "schedule": "<cron>" }`. `timing`: `same-transaction` only when the user said both changes must succeed or fail together.
- `openQuestions`: must be empty at hand-over.
- `plan.steps`: ordered. Every model id appears in some step's `refs`. Each step changes at least one file, names commands in `verify`, and keeps the build and tests passing.
