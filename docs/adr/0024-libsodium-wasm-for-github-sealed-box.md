# ADR-0024: libsodium WASM For GitHub Sealed-Box Encryption

Date: 2026-05-24

Status: Accepted

insecur encrypts GitHub Actions secrets using libsodium compiled to WebAssembly (`libsodium-wrappers`) inside the Cloudflare Worker. GitHub's secrets API requires each value to be sealed client-side with the target's public key using libsodium's NaCl sealed box (`crypto_box_seal`: X25519 and XSalsa20-Poly1305 with a blake2b-derived nonce). The Workers runtime's WebCrypto does not implement the sealed-box construction even where it now supports X25519/Ed25519, so a sealed-box implementation must be supplied.

## Considered Options

- Pure-JS sealed box (tweetnacl plus a JavaScript blake2b, or a maintained sealed-box library). Rejected as the default: it puts a hand-assembled cryptographic path on the exact operation that protects secrets, and would have to be validated against libsodium test vectors and maintained.
- Defer GitHub Actions sync from V1. Rejected: GitHub Actions is a promised V1 sync provider, and the crypto path is feasible today.

## Consequences

A WebAssembly module ships in the Worker bundle; it is instantiated once at module scope (the Workers runtime does not support `WebAssembly.instantiateStreaming`) and awaited (`await sodium.ready`) before first use. Bundle size is modest and within Workers limits. The dependency is swappable later without a domain-model change. This decision is an implementation choice and is not recorded in `CONTEXT.md`.
