# Code standards

These rules apply to all maintained source, tests, scripts, configuration, and
templates. Only dependencies, machine-generated files (including Convex
`_generated` files), and build outputs are exempt.

## General rules

- Prefer control-flow nesting of at most three levels. Extract meaningful
  operations or use early returns when that makes the code clearer.
- Choose simple implementations that meet the goals without sacrificing
  performance. Avoid complexity for its own sake.
- Repetition is acceptable. Follow “repeat until good” and YAGNI: introduce an
  abstraction when it solves a real problem, rather than enforcing DRY blindly.
- Avoid barrel files: import directly from the defining module instead of
  re-exporting another module's declarations, including type-only exports.

## Documentation and comments

- Give exported/public functions, callable variables, classes, methods, and APIs
  concise intent documentation (`/** ... */`). Describe what the operation
  represents or accomplishes. Public API methods include interface/type methods
  and callable properties of exported objects. Local export lists and default
  exports follow the same rule. Document internal code when its intent needs
  explanation; avoid boilerplate documentation on obvious local functions.
- Prefer clear code over unnecessary comments. Reserve explanatory comments for
  non-obvious performance optimizations and references to mathematics or
  algorithms. Keep useful intent documentation separate from implementation
  narration.

## Naming

- Use complete, descriptive names; expand our own shortcuts. Conventional
  acronyms such as HTTP, URL, ID, CLI, and established ecosystem names such as
  API, JSON, JSX, npm, pnpm, and Expo are acceptable. Preserve names required by
  external APIs, frameworks, configuration formats, and command-line tools.
- Include units in names unless the type already communicates them, for example
  `timeoutMilliseconds` or a `Duration` value.
- Do not put implementation types in names. Name values for their purpose.
- Refactor code that needs a vague `Utils` or `Helper` name into a meaningful
  operation or module.

## Enforcement

- The code standards checker reports barrel re-exports and missing public intent
  documentation as errors. Control-flow nesting deeper than three is a warning
  and does not fail lint. Each function starts a new nesting scope; `else if`
  chains count as one level.
- Naming, units, simplicity, and unnecessary comments are review guidance, not
  automated guarantees. Do not hide errors with blanket ignores or suppressions.
- Preserve framework checks when adding standards checking to lint. Guidance
  applies even in projects that have not enabled automated checking.
