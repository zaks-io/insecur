# ADR-0052: Web No-Reveal Boundary And Management Parity

Date: 2026-05-25

Status: Accepted

## Decision

The tenant web console has full management parity with the CLI, with one structural exception: the browser is never a Secret Reveal surface.

Parity means the browser accepts Sensitive Values through a safe input path (a masked field over TLS in a request body, never a URL, query string, or log) to create Blind Secret Writes, and can drive secret create, rotate, generate, development-only import, sync and policy binding, App Connection setup (ADR-0011, the web-canonical connection wizard), and approval. The earlier instinct to keep the browser metadata-only is rejected: masked input over TLS is the same safe-input path the API already accepts and is not the risk. The risk is Secret Reveal, the egress of a stored plaintext value (see **Secret Reveal** in [docs/context/glossary/runtime-injection.md](../context/glossary/runtime-injection.md)).

So the boundary is drawn at reveal, not at input. The browser never returns or renders a stored Sensitive Value, in any Environment, not even once immediately after creation, and offers no read-back, copy-of-stored-value, or "show" affordance. This is enforced structurally: the short-lived access token the BFF mints for a browser session (ADR-0051) never carries Secret Reveal scope, so no current or future web endpoint can return a stored Sensitive Value to the browser. This is deliberately stricter than the glossary, which permits Secret Reveal outside Protected Environments (see **Secret Reveal** in [docs/context/glossary/runtime-injection.md](../context/glossary/runtime-injection.md)); the browser declines even that permitted reveal.

Where Secret Reveal is legitimately needed it stays a CLI-side egress in a non-protected Environment, authorized out of band through the Human Approval Surface. The hybrid step-up model is: protected mutations take a per-action High-Assurance Challenge, while reveals may be covered by a time-boxed elevation window; because the browser never reveals, that window governs CLI-side reveals cleared via the web challenge (ADR-0032). The elevation window is dropped for V1 (see the Amendment below).

Management parity is org-configurable. An Organization Configuration may narrow the web mutation surface (for example, restrict secret writes to the CLI). Narrowing or broadening that surface is itself a configuration change and is gated like other Risk-Broadening changes through the High-Assurance Challenge. Configuration can only narrow the surface; it can never reach below the no-reveal boundary, because that boundary is a property of the token, not a setting.

## Options Considered

- **Metadata-only browser (never accept a Sensitive Value).** Rejected. It conflates "a secret transiting the browser" with "Secret Reveal." Masked input over TLS is a documented safe-input path with no reveal risk; banning it pushes routine management to the CLI for no security gain and fragments the product.
- **Show-once at creation.** Rejected. Displaying a generated or just-written value once is still a browser reveal on a higher-exposure surface (extensions, screen-share, screenshots, clipboard sync), and it contradicts the First Value Proof, where a service-generated Blind Secret Write is verified by HMAC challenge and the value is never shown.
- **Browser mirrors CLI reveal rules (reveal allowed outside Protected Environments).** Rejected. It makes the highest-exposure surface, which is also the Human Approval Surface, a reveal surface, and forces conditional reveal scope into the web token, weakening the structural guarantee.
- **Full management parity with a structural no-reveal boundary at the token, org-configurable narrowing.** Accepted. It keeps the web useful for real work while making the one guarantee that matters impossible to violate by construction.

## Consequences

- The web session token is minted without Secret Reveal scope. No-reveal in the browser is a token property, not UI logic, so it holds even against a careless future endpoint or a compromised web client.
- Secret editing in the browser is write-only: a value is replaced by a new Blind Secret Write, never loaded-then-edited. App Connection reauthorization pastes a new credential; the old one is never shown.
- This extends ADR-0044 from "no product read path for agents and ordinary sessions" to the primary human web surface specifically, and complements ADR-0016 delivery-first egress: the browser drives delivery and management but is structurally barred from reveal.
- A developer who genuinely needs to see a non-protected value uses the CLI; the web cannot satisfy that need, by design.
- The org-configurable parity toggle is a Risk-Broadening or tightening change subject to the High-Assurance Challenge and audit; it cannot expose reveal.

## Amendment (2026-06-11): No elevation window in V1; per-reveal challenge only

The time-boxed elevation window above is dropped for V1. Any CLI-side Secret Reveal in a non-protected Environment requires its own per-reveal High-Assurance Challenge against a bounded operation describing that exact reveal, cleared on the Human Approval Surface; clearing it grants no reusable authority for future actions, exactly the ADR-0032 bounded-operation model (see ADR-0032's matching 2026-06-11 amendment for who may clear a bounded operation). A reusable window cleared once via the web challenge would hand standing reveal authority to anything holding the CLI session token, including an agent inheriting `INSECUR_SESSION_TOKEN`; that contradiction with ADR-0032's "grants no reusable authority" rule is what this amendment removes. The CLI reveal command itself is deferred past V1: docs/cli-and-sync.md defines no reveal command, and implementing agents must not invent one. If a time-boxed elevation window is ever wanted later, it needs its own ADR specifying TTL, session/Environment/secret-scope binding, web-app revocation, per-reveal audit, and the agent-inheritance consequence, reconciled against ADR-0032.
