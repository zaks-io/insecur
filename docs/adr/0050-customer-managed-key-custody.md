# ADR-0050: Customer-Managed Key Custody

Date: 2026-05-25
Status: Accepted

insecur will support Customer-Managed Key Custody as an Organization-scoped mode on a Hosted Instance. The customer supplies a customer-controlled wrapping authority, grants insecur runtime limited use of it for that Organization's data-key chain, and can revoke that grant outside insecur. This buys a stronger custody property than ADR-0044's default Hosted Instance posture: while the grant is active, insecur runtime can decrypt only through the customer-granted path for approved delivery operations; after the customer revokes or disables the grant, insecur cannot perform future decrypting operations for that Organization.

This is not a zero-knowledge claim. During an active grant, insecur runtime can still decrypt for legitimate Secret Delivery, Runtime Injection, Secret Sync, Key Rotation rewrap, and Sensitive Metadata detail paths that the product authorizes. Customer-facing language must present this as a security option with explicit limits, not as a privacy tier or broad privacy promise: Customer-Managed Key Custody makes future decrypting operations depend on the customer's active grant; it does not make insecur technically incapable while the grant is active.

Enabling, replacing, or disabling Customer-Managed Key Custody through insecur requires Organization Configuration authority, the Human Approval Surface, and a High-Assurance Challenge. Replacement is a key migration: verify access to the new custody root, rewrap Organization Data Keys to it, audit the change, and then retire the prior custody root. If the customer revokes or breaks custody access externally, the Organization becomes Custody-Locked: decrypting operations fail closed, while non-decrypting navigation, status, audit, and recovery surfaces remain available according to Metadata Visibility Policy.

## Considered Options

- **insecur-controlled Hosted Instance custody only.** Rejected as the only model because it cannot support the customer-controlled revocation property.
- **Raw key upload.** Rejected because it would move customer key material into insecur custody and weaken the claim this mode exists to provide.
- **Full zero-knowledge language.** Rejected because approved server-side delivery paths still require insecur runtime to decrypt while the customer grant is active.

## Amendment (2026-06-11): Custody migration rewraps both data-key sets

The replacement sentence above says the key migration "rewrap[s] Organization Data Keys to it." Under the flat wrap topology decided in the 2026-06-03 ADR-0005/0028 amendments (reconciled in ADR-0031's matching amendment), Project Data Keys are wrapped directly under the instance root key, not under an Organization Data Key, so rewrapping only the organization set would leave every project secret in the Organization decryptable through the instance root after the customer revokes the grant. Enabling or replacing Customer-Managed Key Custody therefore rewraps both Organization Data Keys and Project Data Keys, every key wrapped under the instance root for that Organization, onto the customer custody authority, so after revocation no key in the Organization's scope can be unwrapped without the customer grant. This is the same uniform rewrap primitive ADR-0028 and ADR-0031 define, applied across both sets; it does not reintroduce a chained topology for custody-enabled Organizations.
