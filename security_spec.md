# Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}/...` belongs solely to the authenticated user whose `request.auth.uid == userId` and whose email is verified (`request.auth.token.email_verified == true`).
2. **PII Isolation**: User email and account metadata live exclusively in `/users/{userId}/private/profile`, readable and writable only by the owner.
3. **Immutable Identity & Temporal Integrity**: `ownerId` and `createdAt` cannot be modified after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. **Bounded Arrays & Strings**: All IDs match `^[a-zA-Z0-9_\-]+$` with length <= 128. `dashboardLayout` <= 12 modules, `channels` <= 8 channels, `plaintext` <= 237 bytes (Meshtastic LoRa payload limit).
5. **Strict Key Allowlisting**: Create requires exact `hasAll` + `hasOnly`; update requires action-scoped `affectedKeys().hasOnly(...)`.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/uid1/configs/default`.
2. Cross-tenant read/write by `uid2` to `/users/uid1/configs/default`.
3. Unverified email user attempting write to own `/users/uid1/configs/default`.
4. Shadow field injection (`isAdmin: true`) during `create` on `configs`.
5. Shadow field injection (`extraFlag: 1`) during `update` on `configs`.
6. Owner spoofing (`ownerId: "victimUid"`) inside payload written under `/users/uid1/configs/cfg1`.
7. Client-forged `createdAt` timestamp not equal to `request.time`.
8. Client-forged `updatedAt` timestamp not equal to `request.time`.
9. Oversized `id` path variable (> 128 chars or invalid regex characters).
10. Oversized `plaintext` (> 237 chars) in `messages`.
11. Unbounded `dashboardLayout` (> 12 items) or `channels` (> 8 items) array poisoning.
12. Mutating immutable `createdAt` or `ownerId` during `configs` update.
