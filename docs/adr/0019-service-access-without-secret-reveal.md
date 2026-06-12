# ADR-0019: Service Access Without Secret Reveal

Date: 2026-05-23

Status: Accepted

Service Access lets a User or Machine Identity operate insecur across organizations for support, abuse response, incident investigation, and reliability, but it must not become a secret exfiltration path. V1 will provide Service Access over platform state, audit/operation state, and decrypted Sensitive Metadata after Sensitive Detail Gate, but without Secret Reveal, Secret Delivery, Sensitive Values, or raw request/provider bodies.

## Consequences

Service Access is separate from customer Organization Access granted through memberships and roles. Service Access to decrypted Sensitive Metadata must pass Sensitive Detail Gate, be reason-coded, and be audited; Sensitive Values remain unavailable through Service Access as plaintext.

## Amendment (2026-06-11): Service Access surface deferred past V1

The record above says V1 will provide Service Access. The 2026-05-25 scope review deferred the Service Access product surface past V1: no Service Access product surface, permissions, or workflows are in active scope, per the deferred-scope parking lot in [docs/phasing.md](../phasing.md). The boundary constraints in this ADR remain binding on V1 design: Service Access stays a separate cross-organization gate beside Organization Access (ADR-0034, ADR-0037), excludes Secret Reveal, Secret Delivery, Sensitive Values, and approval scope (ADR-0016, ADR-0044, ADR-0051), and any future Service Access surface must pass Sensitive Detail Gate with reason-coded, separately audited access.
