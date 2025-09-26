# Data Directory

Use this folder for temporary data snapshots, cached Tatoeba exports, or other artifacts that should not be committed. The `.gitignore` entry excludes `data/cache/` by default; add more subdirectories to `.gitignore` if needed.

When seeding D1, prefer loading data directly through Wrangler or SQL migrations rather than keeping large dumps in the repository.
