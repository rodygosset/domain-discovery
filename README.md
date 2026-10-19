# domain-discovery

An agent skill that models the business domain of an Effect v4 codebase, existing or new. It interviews you in plain language, then writes a plan another agent can carry out without asking questions.

## Install

```bash
npx skills add rodygosset/domain-discovery
```

## Use

Open your Effect v4 project and ask your agent:

> Model the domain of this codebase.

For an empty project:

> Help me model the domain for a new app.

## What you get

- `domain-model.json`: the model and a step-by-step refactor or build plan, written in Effect v4 code shapes.
- `docs/domain/`: Markdown docs for every agent that works on the code later. They cover the glossary, the contexts, the aggregates, the stories and the decisions.

The plan's last step deletes `domain-model.json`. The docs stay as the record of the domain.

## How it works

1. In an existing codebase, the agent reads the code and drafts a model. In a new one, it starts from your description.
2. It interviews you, one question at a time, with no jargon. It asks what happens, what can go wrong, and what must never be allowed.
3. It replays real cases through the model and fixes what doesn't fit.
4. It writes the plan and checks it with `scripts/check-model.mjs`.
5. You sign off, and it renders the docs with `scripts/render-docs.mjs`.

## Supports

- Effect v4 only, using its own modules: `Schema`, `Context.Service`, `Layer`, `effect/sql`, `effect/rpc`, `effect/http-api`, `effect/reactivity`.
- Frontends built with Foldkit, or with TanStack Start and Effect Atom.
- Frontends that reach the server over RPC, HttpApi or server functions, or that keep data on the device.

## Requirements

- Node, to run the two scripts. They have no dependencies.
- pstack's `unslop`, `technical-writing` and `bro` writing skills. The agent fetches them from GitHub if they aren't installed.
