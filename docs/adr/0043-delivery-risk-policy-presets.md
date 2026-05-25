# ADR-0043: Delivery Risk Policy Presets

Date: 2026-05-25
Status: Accepted

## Decision

V1 exposes Delivery Risk Policy through simple named presets rather than a custom policy editor. The user-facing presets are Strict, Balanced, and Automation-Friendly, with Balanced as the default for newly provisioned Organizations and Projects.

The presets are backed by enterprise-ready policy infrastructure: each preset resolves to a versioned Delivery Risk Policy template with explicit scope, effective version, audit records, and migration behavior. Users see the simple preset names in V1; the system stores enough structure to support future enterprise policy surfaces without refactoring delivery authorization, audit, or approval boundaries.

Strict keeps non-protected development Secret Use available for First Value and local workflows, but requires human review or confirmation for preview delivery and all protected production gates. Balanced allows non-protected development automation and allows non-protected preview automation only after explicit project or environment enablement. Automation-Friendly allows non-protected development and preview automation within scoped policy. All presets keep Protected Environment production approval, High-Assurance Challenges, and protected delivery approval evidence in the Human Approval Surface.

A Risk-Broadening Delivery Policy Change, such as Strict to Balanced, Balanced to Automation-Friendly, or enabling preview automation inside Balanced, requires the Human Approval Surface and a High-Assurance Challenge. A Risk-Tightening Delivery Policy Change may be completed by an authorized User in the authenticated web app without a High-Assurance Challenge, but remains audited. No Delivery Risk Policy Preset change is completed solely through an agent-reachable channel in V1.

## Options Considered

- Hard-code one delivery posture. Rejected because it hides the risk decision and makes teams that intentionally want preview automation fight the product.
- Expose a full custom policy surface in V1. Rejected because it adds onboarding friction and broad enterprise UX before the core delivery loop is proven.
- Expose simple presets backed by durable policy infrastructure. Accepted because it gives users sane defaults now while preserving an enterprise-friendly model for future expansion.

## Consequences

Delivery Risk Policy becomes a versioned domain object even when the UI only shows presets. Audit must record the active preset, policy template version, scope, actor, and before/after effective policy for changes.

V1 onboarding does not ask users to design a policy. Guided Organization Provisioning applies Balanced by default. Users may switch to Strict or Automation-Friendly later, subject to configuration authorization, risk-broadening step-up rules, and audit.

No preset can make Protected Environment production approval terminal-only or agent-clearable in V1.
