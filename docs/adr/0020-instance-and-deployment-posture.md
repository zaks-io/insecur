# ADR-0020: Instance And Deployment Posture

Date: 2026-05-23

Status: Accepted

insecur uses one product model for both insecur-operated service and customer-operated deployments. An **Instance** is the deployment boundary above **Organization**. A **Hosted Instance** such as insecur.cloud and a **Self-Hosted Instance** in a customer-controlled Cloudflare account use the same insecur runtime, **Instance Configuration**, **Organization** model, and codebase. Self-hosting is not a rewrite, fork, or alternate deployment stack.

## Considered Options

- Separate self-hosted product or non-Cloudflare runtime such as Kubernetes or Docker services.
- Treat self-host as out of scope and reserve it for a later refactor.

## Consequences

**Organization** remains the secrets tenant boundary; **Instance** owns onboarding posture, **Instance Identity Configuration**, rate limits, **Instance Operator** assignments, and instance-scoped **Webhook Subscriptions**. **Organization Configuration** owns tenant governance such as approval policy and organization-scoped **Webhook Subscriptions**.

On a **Hosted Instance**, customers primarily work at the **Organization** layer and **Instance Operator** defaults to insecur administration. On a **Self-Hosted Instance**, the customer holds **Instance Operator** and may configure **Instance Configuration** freely, including rate limits.

**Service Access** remains separate from **Instance Operator**. **Service Access** is insecur platform operations across **Organizations** in a **Hosted Instance**; it is not customer Instance administration.

Self-hosting means deploying insecur into customer-controlled Cloudflare infrastructure, not operating a portable non-Cloudflare binary. A future portable runtime would be a separate decision and is not implied by this model.

**Instance Bootstrap** uses a one-time **Bootstrap Secret** and an explicit bootstrap command. Bootstrap creates the **Instance**, **Instance Configuration**, first **Organization**, enough **Instance Identity Configuration** for WorkOS AuthKit, and a pending **Bootstrap Operator Claim**. The first **Instance Operator** is granted only after a **Human Identity Provider**-authenticated **User** presents the **Bootstrap Secret** through a safe sensitive input path; merely being the first successful login is not enough, and there is no temporary local-admin authentication path. Claim completion also creates an owner **Membership** for that **User** in the first **Organization**; the instance-level grant and organization-level grant are separate audit events. The **Bootstrap Secret** is consumed or rotated after the claim completes. A **Self-Hosted Instance** typically begins with locked onboarding until bootstrap and operator claim completion are done.

**Event Notifications** are metadata-safe webhook deliveries. Subscribers choose **Webhook Event Types** per **Webhook Subscription**, payloads exclude **Sensitive Values** and **Sensitive Metadata**, and deliveries are HMAC-signed with a **Webhook Signing Secret**.

Identity is **Instance Identity Configuration** for the complete system. **Organization**-scoped identity may be added later without changing the **Instance** and **Organization** configuration split.
