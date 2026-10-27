# Autocell - AI-Powered Spreadsheet Quality & Cleanup Agent by MEDU

Autocell is an intelligent spreadsheet audit, remediation, and cleaning tool designed to inspect data, identify formatting errors, missing entries, duplicates, and outliers, and apply automated cleanup actions.

---

## Quick Start (Windows)

Simply double-click:
```bat
start.bat
```
This batch script will:
1. Verify Node.js is installed.
2. Automatically install server & client dependencies if missing.
3. Automatically build the client and compile the server if needed.
4. Launch the browser to `http://localhost:7777`.
5. Start the production server on port 7777.

---

## Development Mode

To run in live-reload development mode:
```bat
dev.bat
```
Or via terminal:
```bash
npm run dev
```

---

## Available NPM Scripts

- `npm run setup`: Install dependencies for both root and client.
- `npm run dev`: Concurrently run backend server (`ts-node-dev`) and Vite client.
- `npm run build`: Build both the React client and compile the Express backend.
- `npm run build:client`: Build only the React client.
- `npm run build:server`: Compile TypeScript backend into `dist/`.
- `npm start`: Run the compiled production server.
