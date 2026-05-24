# ADR-0019: Service Access Without Secret Reveal

Date: 2026-05-23

Status: Accepted

Service Access lets a User or Machine Identity operate insecur across organizations for support, abuse response, incident investigation, and reliability, but it must not become a secret exfiltration path. V1 will provide Service Access over platform state, audit/operation state, and decrypted Sensitive Metadata after Sensitive Detail Gate, but without Secret Reveal, Secret Delivery, Sensitive Values, or raw request/provider bodies.

## Consequences

Service Access is separate from customer Organization Access granted through memberships and roles. Service Access to decrypted Sensitive Metadata must pass Sensitive Detail Gate, be reason-coded, and be audited; Sensitive Values remain unavailable through Service Access as plaintext.
