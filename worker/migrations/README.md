# D1 Migrations

Store SQL migrations for the `sentences` table and related schema in this directory. A typical first migration might create the `sentences` table with columns such as `id`, `spanish`, `english`, `source`, `difficulty`, and timestamps.

Apply migrations with `wrangler d1 migrations apply <database-name>` once you have defined them.
