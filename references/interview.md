# Interview

The user never hears a DDD term. You hold the concept and ask the plain question.

## Contents
- Concept to question
- How to ask
- Greenfield mode
- When the user is unsure
- Traps

## Concept to question

| You are looking for | Ask |
|---|---|
| Purpose | "Who uses this, and what does it get them?" "If it stopped tomorrow, who would notice first?" |
| Glossary term | "What do you call this?" "Is a [their word] the same as a [code word]?" "Does [word] mean the same thing to [other team]?" |
| Event | "What happens next?" "How do you know that step is done?" "Tell me about the last time this happened." |
| Unhappy path | "What if they change their mind?" "Can this be undone?" "What happens when someone made a mistake?" "What if nobody acts?" |
| Command | "Who makes that happen?" "Why would someone do that?" For a generic edit: "When someone changes this, what are they really doing?" |
| Actor | "Who is allowed to do that? Who is not?" |
| Policy | "Does that always happen after [event]? Automatically, or does someone decide?" |
| Policy timing | "If the second part fails, should the first part be undone, or is it fine to retry the second part later?" |
| Schedule | "Does anything happen just because time passes?" |
| Invariant | "Can this ever be refused? What would make you say no?" "What must be true before you allow it?" |
| Aggregate boundary | "To decide yes or no, what exactly do you look at?" "If two people did this at the same moment, what could go wrong?" "Does that have to be exactly right at that moment, or can it catch up a little later?" |
| Entity or value | "If this changed, would it still be the same one?" "Do you follow this particular one over time?" "Are two of these with the same details interchangeable?" |
| Lifecycle state | "What stages does it go through?" "What can you do at one stage that you cannot do at another?" |
| Bounded context | "Who else cares about this, and do they see it the same way?" "When it goes to [team], what do they need from it?" |
| Subdomain kind | "What do you do that competitors don't?" "If you bought this part off the shelf, would you lose anything?" "Where do the arguments and special cases pile up?" |
| Tension | "The code calls this [X] and treats it as [Y]. Is that right?" |

## How to ask

- Ask one question per message. The message holds the question and the draft it refers to, nothing else. Follow the writing rules in `SKILL.md`.
- Lead with a concrete draft: "Here is how I think it goes. What is wrong?" People correct a draft faster than they describe from scratch.
- Ask for stories, not definitions: "Tell me about the last time..."
- Ask open questions. "What happens if..." beats "So X happens, right?"
- Ask "Is that always true?" after every rule.
- Ask "why" up to three times when a rule looks arbitrary. It may be a real constraint or a leftover from an old system.
- Repeat the user's exact words back and use them in the model.
- Update `domain-model.json` after each answer. Quote the answer in `evidence`.

## Greenfield mode

There is no code to check answers against, so the stories carry the whole model.

- Ask for more stories than in refactor mode, and for the hardest cases the user expects.
- Ask "How do you do this today, without the software?" Spreadsheets, emails and paper forms show the real steps and words.
- When two answers contradict each other, record a tension and ask which one holds.

## When the user is unsure

- If the user does not know, ask who would know, and record the question in `openQuestions`.
- If the user says "you decide", pick the option that keeps behavior unchanged. Mark it `confirmed` with `"decided: <reason>"` in `evidence`.
- If the code and the user disagree, add a tension. Ask which one is right. The answer goes in `resolution`.

## Traps

- Copying the database tables as aggregates. Tables group data for storage. Aggregates group the data one decision needs.
- Accepting `create`, `update` and `delete` as commands. Ask what the person is trying to do.
- One aggregate per screen, or one giant aggregate. Ask the consistency question for each rule.
- Contexts split by layer, such as frontend, backend and database. Split by meaning.
- Taking code names as the user's language.
- Modeling only the happy path.
