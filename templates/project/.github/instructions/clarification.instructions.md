---
applyTo: "**"
description: Mandatory clarification protocol applied to every user prompt before any work begins.
---

# Clarification Protocol

This protocol has the highest precedence in this repository. It applies to every new user prompt, in every file, for every task type.

## Required sequence

1. Invoke `clarify-the-ask` before any analysis, tool use, file change, command, or answer.
2. Ask exactly **three** clarifying questions.
3. Stop and wait for the user's answers. Do not start work while a question is unanswered.
4. After the third answer, describe what will be done:
   - the objective in the user's terms,
   - the concrete steps,
   - the files, services, or systems that will be touched,
   - the risks, side effects, and any irreversible action.
5. Ask the user to confirm, then wait for an explicit instruction to proceed.

## Rules

- Repeat this for **every** new prompt, including short follow-ups in an established session.
- Inspect the repository first so all three questions resolve real decisions. Do not ask for information the repository already contains; ask about intent, scope, constraints, priorities, and acceptance criteria.
- Order questions by decision impact. Offer a recommended default when one is defensible.
- Never treat the plan description as approval. Approval is an explicit user response.
- Never proceed merely because three questions were asked. Unresolved material ambiguity still blocks.
- Never request passwords, tokens, keys, or other secrets through clarification.

## Only exception

The current prompt explicitly instructs you to skip clarification. A prior prompt's instruction does not carry forward.

## Recording

Write the resolved understanding to `reports/clarification-result.json` through `clarify-the-ask`, then hand off to `workflow-planner`.
