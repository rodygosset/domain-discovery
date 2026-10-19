---
name: domain-discovery
description: Models the business domain of an Effect v4 TypeScript codebase, existing or new. For an existing codebase it reads the code first, then interviews the user in plain language. For a new one it interviews the user from a blank page. It and writes domain-model.json and Markdown domain docs with the glossary, bounded contexts, aggregates, commands, events, policies and a step-by-step refactoring or build plan in Effect v4 constructs, including moving a Foldkit or TanStack Start frontend onto browser-safe contracts over RPC, HttpApi, server functions or local-first storage. Another agent can apply the plan without asking questions. Use when the user wants to find or design the domain model or ubiquitous language of an Effect codebase, or to plan a domain-driven design refactor or build.
---

# Domain discovery

Interview the user about an Effect v4 codebase and write two outputs at the repository root:

- `domain-model.json`: the model and the plan. Another agent applies the plan without asking anything, so the file must answer every question that agent could have. The plan's last step deletes it.
- `docs/domain/`: Markdown docs rendered from the model. They describe the code once the plan has run, for every agent that works on it later.

## Modes

Pick the mode first and record it in `repo.mode`.

- `refactor`: the repository already has application code. Read it, then interview the user. The plan moves the existing code into the target shape and keeps its behavior.
- `greenfield`: the repository is empty or holds only a scaffold. There is no code to read, so the user is the only source. The plan builds the target shape from nothing.

Steps marked "refactor only" are skipped in greenfield mode.

## Rules

- Start from what happens, not from what exists. Events and the rules that guard them decide the shape of the model. Tables and classes are evidence, not the answer.
- Keep DDD terms out of the conversation. You think "invariant". You ask "Can this ever be refused?" [references/interview.md](references/interview.md) gives the plain question for each concept.
- Use the user's words. Never offer a term the user has not said.
- Treat the code as evidence of what the system does. Treat the user as the authority on what it means. Record each disagreement as a tension, whether between the code and the user or between two things the user said.
- Ask one question per message, as multiple choice: up to 4 likely answers, the most likely first and marked "(recommended)". Use the harness's questionnaire tool when it has one, such as `AskUserQuestion` in Claude Code. Without one, write the options as a numbered list. The user can always answer in their own words.
- Map every planned change to an Effect v4 construct from [references/effect-mapping.md](references/effect-mapping.md). For a Foldkit or TanStack Start frontend, also follow [references/frontend.md](references/frontend.md).

## Writing

These rules cover every text you produce: messages to the user, questions, summaries, every file you write, and the text fields of `domain-model.json`.

- Before writing anything, load pstack's `unslop`, `technical-writing` and `bro` skills. If they are not installed, read them from `https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/<name>/SKILL.md`.
- Apply `unslop` and `technical-writing` to every text before you send or save it.
- Apply `bro` to every message to the user: say it the way one person talks to another, with no jargon.
- Keep it short. One idea per sentence. Plain, everyday words.
- Cut what does no work: filler, recaps, preambles, hedging, compliments, closing offers.
- Make it easy to scan. Lead with the point. Use short lists and tables when they make it faster to read.

## Workflow

Copy this checklist and tick it off as you go.

```
- [ ] 1. Draft the model
- [ ] 2. Confirm the purpose
- [ ] 3. Walk the timeline
- [ ] 4. Find causes and rules
- [ ] 5. Draw boundaries and rank them
- [ ] 6. Resolve tensions and replay stories
- [ ] 7. Write the plan
- [ ] 8. Check and get sign-off
- [ ] 9. Render the docs
```

### 1. Draft the model

Write the draft into `domain-model.json` in the format of [references/model-format.md](references/model-format.md), with `"status": "hypothesis"` on every entry. End this step with a draft that fills every section, even where the entries are guesses.

- `refactor`: follow [references/reading-code.md](references/reading-code.md). Use the file and line as evidence. Ask the user nothing during this step.
- `greenfield`: ask the user to describe the system in a few sentences, and for any notes, specs or sketches they already have. Draft from their answer. Quote it as evidence.

### 2. Confirm the purpose

Write three sentences on who uses the system and what it gets them. Ask the user to correct them. Then ask who would notice first if the system stopped.

### 3. Walk the timeline

Tell the main story back as a numbered list of things that happened, in the past tense and in the user's words. Ask what is wrong, missing or out of order. Then ask about the unhappy paths: changing one's mind, undoing, correcting mistakes, disputes, deadlines that pass.

Each confirmed step is an event. Save each confirmed story in `stories`, in the user's words.

### 4. Find causes and rules

For each event, ask what made it happen: a person, an automatic reaction to another event, the passing of time, or another system. A person makes a command. An automatic reaction is a policy.

For each command, ask what could make it refuse and what must be checked first. Then ask whether that information must be exactly right at that moment. The data one decision must see exactly right forms one aggregate. Anything that can catch up later travels by event. Record the user's answer as the aggregate's `why`.

### 5. Draw boundaries and rank them

Show the user where a word seems to change meaning between people, teams or, in refactor mode, parts of the code. Confirm each boundary. Then ask which parts set the business apart from competitors, and rank each part as core, supporting or generic.

### 6. Resolve tensions and replay stories

Ask about each tension and record the answer as its `resolution`. Then ask for three real cases, including the strangest one the user remembers. In greenfield mode, ask for the cases the user expects, including the hardest one. Walk each case through the model in plain words. Fix the model where a case does not fit. Save each case as a story of kind `case`. Ask what to leave out of this plan, and record it in `outOfScope`.

Set an element to `"confirmed"` only when the user agreed with it or told you to decide.

### 7. Write the plan

First settle the technical choices the plan needs: `repo.storage`, `repo.frontend.kind` and `repo.frontend.transport`. In refactor mode, take them from the code. In greenfield mode, ask the user, one plain question each. [references/frontend.md](references/frontend.md) suggests a default transport.

Then follow the layout, the step order and the step rules in [references/effect-mapping.md](references/effect-mapping.md). When `repo.frontend.kind` is not `none`, add the frontend steps from [references/frontend.md](references/frontend.md). Each step lists the exact files it creates, moves, edits and deletes, the model ids it implements, and the commands that verify it.

### 8. Check and get sign-off

From the repository root, run `scripts/check-model.mjs` from this skill's folder. Fix every error it reports. Repeat until it prints `OK`.

```bash
node <skill-folder>/scripts/check-model.mjs domain-model.json
```

Then show the user a one-screen summary in plain words: the parts of the business, the main stories, and what will move where (refactor) or what will be built (greenfield). Ask for sign-off. Apply any correction to the model and run the checker again.

### 9. Render the docs

Run `scripts/render-docs.mjs` from this skill's folder. It writes `docs/domain/`: `README.md`, `glossary.md`, `context-map.md`, `stories.md`, `decisions.md`, `architecture.md` and one file per context in `contexts/`.

```bash
node <skill-folder>/scripts/render-docs.mjs domain-model.json
```

Read every file. If something is wrong or unclear, fix the model, not the docs, then render again. The docs are only as clear as the text fields in the model.

## Done when

- The checker prints `OK`.
- The user has signed off on the summary.
- `node <skill-folder>/scripts/render-docs.mjs domain-model.json --check` prints `OK`.
