# Vinyl Collection Starter

Starter project for a 5-friend vinyl collection app: backend (Node/Express + Postgres) and frontend (React + Chart.js).

Quick start

1. Backend

```bash
cd vinyl-starter/server
cp .env.example .env   # edit DB and JWT secrets
npm install
npm run dev
```

2. Create DB schema

Connect to Postgres and run `server/sql/create_tables.sql`.

3. Frontend

```bash
cd vinyl-starter/client
npm install
npm run dev
```

Files of interest

- `server/` - Express API, auth, collection, analytics, Discogs/Last.fm stubs
- `server/sql/create_tables.sql` - DB schema
- `server/analytics/queries.sql` - example analytics SQL
- `client/` - React app scaffold with sample pages and Chart.js usage

This project is a starter scaffold with comments in files explaining purpose. Fill `.env` with credentials and implement API keys for Discogs/Last.fm.
