# Future payment release specification

## Status and boundary

This specification preserves payment design for a release after CAPTAIN Tier A.
No payment option, module, recipe, or template is exposed by the current
release. Reintroduction requires every acceptance criterion below.

## Domain model

`PaymentCheckoutAdapter` initiates a checkout from a product, amount, currency,
customer, return path, and metadata. It returns one of:

- a redirect URL;
- a hosted-browser instruction;
- a pending reference and authenticated polling endpoint;
- a successful receipt identifier.

Server-side components own provider secrets, initiation, status verification,
and webhook processing. Clients never receive secret keys or decide whether a
payment succeeded.

## Planned processors

- **Clerk Billing:** Web-first Clerk/Stripe checkout with authenticated server
  initiation and Clerk-supported webhook verification.
- **Custom API:** Backend-mediated contract for web and mobile with an explicit
  initiation and status schema.
- **FedaPay:** Server-mediated initiation, redirect handling, transaction
  verification, and signed webhook processing for supported stacks.
- **Paystack:** Server-mediated initialization and verification, web redirect,
  mobile browser/WebView handoff, and HMAC webhook verification.

Unsupported processor/topology/orchestration combinations must be compatibility
blocks rather than generated placeholders.

## Security requirements

- Verify every webhook signature over the provider-required raw payload before
  parsing or persistence.
- Authenticate initiation and polling endpoints and bind payment references to
  the requesting principal.
- Treat return URLs and client callbacks as navigation only, never proof of
  payment.
- Make webhook handling idempotent and reject replayed or mismatched events.
- Validate amount, currency, product, environment, and provider account on the
  server.
- Keep secrets server-only and emit documented environment placeholders.
- Log correlation identifiers without logging secrets or sensitive customer
  data.

## Platform matrix

| Processor | Next.js web | Expo mobile |
|---|---:|---:|
| Clerk Billing | Required | Blocked until supported |
| Custom API | Required | Required |
| FedaPay | Required | Decide during implementation |
| Paystack | Required | Required |

## Future validation

- Contract tests use authoritative recorded request/response fixtures.
- Cryptographic tests cover valid, invalid, missing, and replayed signatures.
- Initiation and polling tests cover authentication, ownership, provider
  failure, timeout, pending, success, and idempotency.
- Generated fixtures typecheck, lint, and build for every supported cell.
- Documentation includes provider dashboard, callback URL, secret, and sandbox
  setup instructions.

## Release acceptance criteria

Payment may return to the public schema only when all supported matrix cells
have complete server and client wiring, all security requirements are tested,
unsupported cells are blocked, and the main Tier A smoke guarantees remain
green.
