# spanishType

SpanishType is a typing game that serves random Spanish/English sentence pairs sourced from Tatoeba. The frontend runs on Cloudflare Pages, while a Cloudflare Worker powers the API and reads data from a Cloudflare D1 database seeded by a custom ingestion script.

## Project Structure

```
.
├── frontend/         # Static client for the typing game (served via Cloudflare Pages)
│   ├── public/       # Public assets and HTML entry point
│   └── src/          # Application source code (framework TBD)
├── worker/           # Cloudflare Worker API + D1 integration
│   ├── src/          # Worker TypeScript sources
│   └── migrations/   # SQL migrations for the D1 database
├── scripts/          # Tooling and ingestion scripts (e.g., Tatoeba fetcher)
├── data/             # Local data snapshots or cache (never checked in)
└── README.md         # Project documentation
```

### Next Steps
- Decide on the frontend stack (React/Svelte/etc.) and scaffold the client.
- Define the D1 schema and write initial migrations.
- Implement the ingestion script that hydrates D1 with curated Tatoeba sentences.
- Flesh out the Worker API endpoints and connect them to the database.
