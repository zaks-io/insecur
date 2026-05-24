# ADR-0021: Small-Group Production First

Date: 2026-05-24

Status: Accepted

insecur will target Small-Group Production before broad public multi-tenant operations: personal projects and relatively small trusted groups are the primary near-term users, but the domain model remains enterprise-ready through organizations, memberships, roles, authorization scopes, tenant-qualified audit, and tenant-bound keys. V1 uses Bounded Onboarding: Instance Bootstrap creates the first Organization, enough Instance Identity Configuration for WorkOS AuthKit, and a pending Bootstrap Operator Claim; the first Instance Operator is granted only after a Human Identity Provider-authenticated User presents the Bootstrap Secret; claim completion also creates that User's owner Membership in the first Organization; later Organizations are created by Instance Operators; and normal Users join through Invitations and Memberships. This supersedes the earlier "public multi-tenant production from day one" posture without weakening the Storage Security Gate or object-level authorization baseline; broad public signup, unrelated-hostile-tenant operations, and larger enterprise administration can be added later without a domain refactor.
