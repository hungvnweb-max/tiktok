# AGENTS

## Required Reads

Always read these files before implementing any task:

- `docs/PRD.md`
- `docs/AGENT_RULES.md`
- `docs/BACKLOG.md`

If any of these files are empty or missing important details, treat that as missing context rather than permission to invent rigid product rules.

## Required Pre-Implementation Checklist

Before implementing any task:

1. Restate the task scope.
2. List the files or modules that will likely change.
3. Identify risks and assumptions.
4. Preserve extensibility in the design.
5. Avoid hardcoding global product rules.

## Configuration Principles

All business rules must remain configurable through content formats wherever applicable.

Do not hardcode any of the following as permanent global rules:

- one fixed video duration forever
- one fixed scene count forever
- one fixed subtitle mode forever
- one fixed template forever

When adding or changing logic:

- prefer content-format-driven configuration over branching on a single format
- keep delivery, publishing, subtitle, template, pacing, and structure rules data-driven
- design for multiple platforms, providers, and content formats even if only one is active today
- keep future variation possible without large refactors

## Implementation Guardrails

- Preserve clean abstractions between domain rules, provider integrations, transports, and persistence.
- Do not couple the system to a single platform, provider, or workflow mode forever.
- Treat current defaults as defaults, not immutable rules.
- If a rule may vary by format, platform, provider, or workflow mode, model it as configuration.

## Risk Handling

When requirements are unclear:

- state the assumption explicitly before implementation
- choose the most extensible option that fits the current codebase
- avoid introducing shortcuts that would freeze future product decisions into code
