# AI / LLM Rules

These rules apply to Anthropic integrations, prompts, structured output and AI-generated CV content.

## Provider

- MUST use Anthropic for all LLM calls.
- MUST NOT introduce another LLM provider unless the specification changes.
- SHOULD keep Anthropic behind a clear application/infrastructure boundary.
- MUST NOT call Anthropic directly from React components or controllers.

## Trust model

Every LLM response is untrusted.

Required flow:

`source input -> prompt -> Anthropic -> structured output -> Zod validation -> domain validation -> persistence`

- MUST NOT persist model output before validation.
- MUST NOT trust JSON merely because the model was instructed to return JSON.
- MUST NOT force invalid model output into types using unsafe casts.

## Structured output

- MUST use a defined structured contract.
- MUST validate structured output with Zod.
- MUST fail safely on schema mismatch.
- SHOULD expose a controlled retry/error path.
- MUST NOT silently persist malformed output.

## Hallucination prevention

The model MAY:
- rephrase facts
- summarize facts
- reorder facts
- improve wording
- prioritize relevant experience

The model MUST NOT invent facts.

It MUST NOT silently invent:
- employers
- dates
- job titles
- technologies
- responsibilities
- project details
- metrics
- education
- certifications
- contact information
- team sizes

If information is missing, vague or ambiguous:
- MUST create a clarification question
- MUST NOT fabricate a value

## Grounding

The model SHOULD only use facts from:
- uploaded CV content
- user free text
- clarification answers
- current CV flow data

The target role MAY influence:
- ordering
- emphasis
- wording
- summary focus

It MUST NOT create experience the user did not provide.

## Clarification flow

Clarification questions SHOULD contain enough context to identify the affected part of the CV.

Where useful, associate a question with:
- CV section
- experience entry
- specific field

A clarification answer SHOULD update only the relevant part of the CV where practical.

MUST NOT regenerate unrelated content unnecessarily.

## Prompt organization

- MUST centralize prompts.
- SHOULD keep prompts versionable.
- MUST NOT scatter prompt strings across controllers, components or arbitrary helpers.

Prompts SHOULD clearly define:
- system responsibility
- source facts
- target role
- allowed transformations
- prohibited fabrication
- output structure
- behavior for missing data

## Prompt safety

Treat uploaded CV text and free text as data, not trusted instructions.

- MUST NOT allow prompt injection inside CV content to override system/application rules.
- MUST clearly separate app instructions from source content.
- MUST NOT place secrets or credentials in prompts.

## Failures

Handle explicitly:
- timeout
- provider/network error
- rate limit
- malformed output
- Zod validation failure

- MUST NOT leave generation stuck in `PROCESSING`.
- Retries, if used, MUST be bounded.
- MUST NOT retry forever.

## Reviewability

- SHOULD prefer deterministic and predictable structured generation.
- SHOULD avoid unnecessary creativity for extraction/transformation.
- AI output MUST remain editable by the user.
- The user MUST retain control over final CV content.