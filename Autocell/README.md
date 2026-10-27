# AutoCell

**Clean spreadsheets by describing the work, not by manually repeating it.**

AutoCell is an AI-assisted spreadsheet cleanup workspace built for the OpenFire Hackathon. Upload an Excel or CSV file, inspect the data in a live grid, and ask the agent to find inconsistencies or apply cleanup operations in plain language. Review visible changes, undo or redo edits, and export the result.

**Built by MEDU** · **TypeScript · React · Node.js · Groq**

---

## The problem

Spreadsheet data often contains duplicate rows, blank cells, inconsistent date formats, mixed capitalization, extra whitespace, and suspicious numeric values. Fixing these problems manually is repetitive and can introduce more mistakes.

AutoCell aims to shorten the loop between spotting a data issue and applying a cleanup: describe the task, inspect the result, then keep or undo the change.

## Who it is for

- Students and researchers preparing survey, experiment, or project data.
- Analysts and operations teams cleaning reports before analysis.
- Small businesses and independent builders working with customer, sales, inventory, or finance spreadsheets.
- Anyone who understands the desired result but wants to avoid repetitive cell-by-cell work.

## Features

- Upload .xlsx, .xls, and .csv files; Excel workbooks can include multiple sheets.
- Detect common patterns such as duplicates, blank cells, mixed date formats, inconsistent casing in status/plan fields, and some numeric anomalies.
- Ask supported questions about totals, averages, minimums, maximums, and row counts.
- Remove duplicate or empty rows; normalize simple date separators; fill missing cells; trim whitespace.
- Sort rows, change letter case, add or delete columns, and apply supported numeric transformations.
- Edit cells, add or delete sheets, and undo or redo changes.
- Export the workbook as .xlsx or export the first sheet as .csv.
- Use built-in rules for common tasks and optionally use Groq to interpret requests that are not covered by the built-in logic.

## Run on Windows

### Requirements

- Node.js 18 or newer and npm.
- A Groq API key is optional for AI-assisted interpretation. Get one from [Groq Console](https://console.groq.com/).

### 1. Configure the environment

From this Autocell directory, copy the template:

~~~bat
copy .env.example .env
~~~

Open .env and set your key and port:

~~~dotenv
GROQ_API_KEY=your_groq_api_key_here
PORT=7777
~~~

Keep the real key private. Without a key, supported built-in cleanup operations can still run, but open-ended AI interpretation is limited.

### 2. Install dependencies

~~~bash
npm run setup
~~~

### 3. Run in development mode

~~~bash
npm run dev
~~~

Open **http://localhost:3000** and keep the terminal running. The frontend runs on port 3000 and proxies API requests to the backend on port 7777.

### One-click Windows launcher

After configuring .env, double-click **start.bat**. It checks for Node.js, installs dependencies if missing, builds the frontend/backend if their build folders are missing, opens the browser, and starts the production server at **http://localhost:7777**.

### Production build from the terminal

~~~bash
npm run build
npm start
~~~

Open **http://localhost:7777**.

## Example prompts

- “Recognize patterns”
- “Fix all patterns”
- “Remove duplicate rows”
- “Normalize dates”
- “Trim extra whitespace”
- “Sort by MRR descending”
- “What is the average MRR?”
- “Fill missing values with N/A”

## How it works

1. The server reads the uploaded workbook with SheetJS and keeps the active sheet data in memory.
2. Common requests are handled by the built-in rules. When a request is not handled and a Groq key is available, the server asks the model for a structured response and operations.
3. The server applies supported operations, returns updated sheet data and operation logs, and records snapshots for undo/redo.
4. The client displays the updated grid and offers Excel or CSV export.

## Technology

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Spreadsheet handling:** SheetJS (xlsx)
- **AI integration:** Groq API with structured JSON responses

## Data handling and limitations

- Workbook data is held in memory and resets when the server restarts.
- For requests sent to Groq, the server includes column headers, up to 15 sample rows from the active sheet, and the user's prompt. Avoid sensitive data unless you are comfortable sending that sample to the external API.
- This is a local, single-user prototype. Do not expose it directly to the public internet without authentication and other security controls.
- CSV export includes the first sheet only.
- Some cleanup rules are heuristic. Review changes before relying on them; use undo if necessary.

## License

See the repository's LICENSE file.

**AutoCell: describe the cleanup, inspect the result, and keep control of your data.**