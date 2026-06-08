# Canonical Auth Schema DDL

**Date**: 2026-06-04  
**Status**: Guidance / planning only  
**Scope**: Proposed canonical SQL schema for target auth identity, role, and scope model.

---

## 1. Purpose

This document defines the target canonical auth schema.

It is intended to sit beside:

- `docs/role-scope-matrix.md`
- `docs/implementation-guidance-component-auth-service-slicing.md`
- `docs/adr/0001-auth-identity-resolution-and-capability-model.md`

This document is design guidance, not executed migration SQL.

---

## 2. Migration Principle

Keep legacy tables readable during migration:

- `auth_accounts`
- `auth_account_group_scope`
- `tb_karyawan_auth`
- `tb_karyawan_roles`
- `tb_user`
- `tb_user_group_access`

Add canonical tables first. Cut behavior later.

---

## 3. Canonical DDL

### 3.1 `auth_identities`

```sql
CREATE TABLE auth_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NULL,
  login_id VARCHAR(80) NOT NULL,
  login_type ENUM('employee_nip', 'account', 'legacy_pin', 'service') NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NULL,
  status ENUM('active', 'disabled', 'locked') NOT NULL DEFAULT 'active',
  password_updated_at DATETIME NULL,
  last_login_at DATETIME NULL,
  migrated_from VARCHAR(64) NULL,
  migrated_from_key VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_identities_login_id (login_id),
  UNIQUE KEY uq_auth_identities_employee_login_type (employee_id, login_type),
  KEY idx_auth_identities_employee_id (employee_id),
  KEY idx_auth_identities_status (status),

  CONSTRAINT fk_auth_identities_employee
    FOREIGN KEY (employee_id) REFERENCES tb_karyawan(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.2 `auth_subject_links`

```sql
CREATE TABLE auth_subject_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity_id BIGINT UNSIGNED NOT NULL,
  subject_type ENUM('account', 'employee_nip', 'legacy_pin') NOT NULL,
  subject_value VARCHAR(191) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  source_table VARCHAR(64) NOT NULL,
  source_pk VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_subject_links_subject (subject_type, subject_value),
  KEY idx_auth_subject_links_identity (identity_id, is_active),

  CONSTRAINT fk_auth_subject_links_identity
    FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.3 `auth_roles`

```sql
CREATE TABLE auth_roles (
  role_key VARCHAR(64) NOT NULL,
  role_type ENUM('global', 'group', 'service') NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (role_key),
  KEY idx_auth_roles_role_type (role_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.4 `auth_scopes`

```sql
CREATE TABLE auth_scopes (
  scope_key VARCHAR(128) NOT NULL,
  scope_type ENUM('global', 'group', 'self', 'service') NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (scope_key),
  KEY idx_auth_scopes_scope_type (scope_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.5 `auth_role_scopes`

```sql
CREATE TABLE auth_role_scopes (
  role_key VARCHAR(64) NOT NULL,
  scope_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (role_key, scope_key),

  CONSTRAINT fk_auth_role_scopes_role
    FOREIGN KEY (role_key) REFERENCES auth_roles(role_key)
    ON DELETE CASCADE,

  CONSTRAINT fk_auth_role_scopes_scope
    FOREIGN KEY (scope_key) REFERENCES auth_scopes(scope_key)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.6 `auth_identity_global_roles`

```sql
CREATE TABLE auth_identity_global_roles (
  identity_id BIGINT UNSIGNED NOT NULL,
  role_key VARCHAR(64) NOT NULL,
  granted_by_identity_id BIGINT UNSIGNED NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (identity_id, role_key),
  KEY idx_auth_identity_global_roles_role (role_key),

  CONSTRAINT fk_auth_identity_global_roles_identity
    FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_auth_identity_global_roles_role
    FOREIGN KEY (role_key) REFERENCES auth_roles(role_key)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.7 `auth_identity_group_roles`

```sql
CREATE TABLE auth_identity_group_roles (
  identity_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  role_key VARCHAR(64) NOT NULL,
  granted_by_identity_id BIGINT UNSIGNED NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (identity_id, group_id, role_key),
  KEY idx_auth_identity_group_roles_group (group_id, role_key),
  KEY idx_auth_identity_group_roles_identity (identity_id),

  CONSTRAINT fk_auth_identity_group_roles_identity
    FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_auth_identity_group_roles_role
    FOREIGN KEY (role_key) REFERENCES auth_roles(role_key)
    ON DELETE CASCADE,

  CONSTRAINT fk_auth_identity_group_roles_group
    FOREIGN KEY (group_id) REFERENCES tb_group(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.8 Optional `auth_scope_overrides`

```sql
CREATE TABLE auth_scope_overrides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NULL,
  scope_key VARCHAR(128) NOT NULL,
  effect ENUM('allow', 'deny') NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_scope_override (identity_id, group_id, scope_key),
  KEY idx_auth_scope_overrides_scope (scope_key),

  CONSTRAINT fk_auth_scope_overrides_identity
    FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_auth_scope_overrides_scope
    FOREIGN KEY (scope_key) REFERENCES auth_scopes(scope_key)
    ON DELETE CASCADE,

  CONSTRAINT fk_auth_scope_overrides_group
    FOREIGN KEY (group_id) REFERENCES tb_group(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. Seed Guidance

### 4.1 Roles

Seed at least:

- `super_admin`
- `hr_admin`
- `scheduler_admin`
- `viewer`
- `employee`
- `service_account`
- `group_owner`
- `group_leader`
- `group_scheduler`
- `group_viewer`
- `group_member`

### 4.2 Scopes

Seed from `docs/role-scope-matrix.md`.

---

## 5. Usage Rules

- `employee_id` may be `NULL` only for bootstrap admin or service accounts.
- `login_type='legacy_pin'` is transitional only.
- `auth_subject_links` preserves old typed subjects during cookie/session migration.
- `auth_scope_overrides` should not be created unless exception rules are a real requirement.

---

## 6. Migration Notes

- Create canonical tables first.
- Backfill from legacy identity and group-scope tables.
- Run canonical-vs-legacy comparison before route cutover.
- Move route checks to scope engine before removing legacy authority sources.
