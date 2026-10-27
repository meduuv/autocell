# AutoCell

**Clean spreadsheets by describing the work, not by manually repeating it.**

AutoCell is an AI-assisted spreadsheet cleanup workspace built for the OpenFire Hackathon. Upload an Excel or CSV file, inspect the data in a live grid, and ask the agent to find inconsistencies or apply cleanup operations in plain language. Review the visible changes, undo or redo edits, and export the result.

**Built by MEDU** · **TypeScript · React · Node.js · Groq**

---

## The problem

Messy spreadsheet data creates work before meaningful analysis can even begin. The same dataset can contain duplicated rows, blank cells, inconsistent date formats, mixed capitalization, whitespace, and suspicious numeric values. People often fix these issues manually, repeat the same steps across files, and risk introducing new errors while doing so.

The bottleneck is not a lack of spreadsheet software. It is the gap between noticing a data problem and carrying out the cleanup reliably.

## Who AutoCell is for

AutoCell is designed for people who work with spreadsheet data but do not want every cleanup task to become a manual, formula-heavy process:

- **Students and researchers** preparing survey, experiment, or project data.
- **Analysts and operations teams** cleaning reports before they are used for decisions.
- **Small businesses and independent builders** working with customer, sales, inventory, or finance spreadsheets.
- **Anyone who knows what should change** but would rather describe the intent than perform repetitive cell-by-cell edits.

## How it works

1. **Load a workbook.** Upload an .xlsx, .xls, or .csv file. Excel workbooks can contain multiple sheets.
2. **Inspect the data.** Work with the active sheet in a spreadsheet grid and see row and column counts.
3. **Describe the task.** Ask AutoCell to detect patterns, clean inconsistencies, calculate a statistic, or transform a column.
4. **Apply and inspect.** Common requests use built-in operations; when a request needs language interpretation and a Groq key is configured, AutoCell can ask the model for structured operations. The grid and operation log update with the result.
5. **Recover or export.** Undo or redo changes, then download the workbook as Excel or export the first sheet as CSV.

The goal is to make spreadsheet cleanup more approachable while keeping the result visible and editable.

## What it can do

### Inspect and summarize
- Detect common issues such as duplicate rows, missing cells, mixed date formats, inconsistent casing in status/plan fields, and suspicious negative or unusually large values in relevant numeric columns.
- Answer supported numeric questions such as totals, averages, minimums, maximums, and row counts.

### Clean and transform
- Remove exact duplicate rows and fully empty rows.
- Normalize simple date separators, fill missing values, and trim excess whitespace.
- Capitalize, uppercase, or lowercase a selected column.
- Sort rows, correct negative values in selected/relevant numeric columns, and add or delete columns.
- Apply supported numeric transformations, including row/serial-based formulas.

### Keep control of the work
- View changes in the spreadsheet grid and operation logs.
- Edit cells directly.
- Add and delete sheets.
- Undo and redo changes.
- Export the current workbook to .xlsx or the first sheet to .csv.

**Important:** cleanup is not a substitute for domain knowledge. For example, a negative amount is not always an error, and a blank value should not always become N/A. Review the result before using it for consequential decisions.

## Example prompts

Try these after the app starts:

- “Recognize patterns”
- “Fix all patterns”
- “Remove duplicate rows”
- “Normalize dates”
- “Trim extra whitespace”
- “Sort by MRR descending”
- “What is the average MRR?”
- “Fill missing values with N/A”
- “Change MRR 2x by serial number”

The built-in rule engine handles common commands. More open-ended requests depend on the configured Groq API key and the model's interpretation.

## Run AutoCell locally

### Requirements

- **Node.js 18 or newer**
- npm, included with Node.js
- A Groq API key for AI-assisted interpretation of requests that are not handled by the built-in rules. You can get a key from [Groq Console](https://console.groq.com/). The key is optional for the rule-based features.

### 1. Download the project

Clone the repository, then move into the app directory. The source code is currently inside the Autocell/ subfolder.

~~~bash
git clone https://github.com/meduuv/autocell.git
cd autocell/Autocell
~~~

If you already downloaded the repository ZIP, open the extracted repository folder and run the following commands from its Autocell subfolder.

### 2. Configure the environment

Create a local environment file from the template.

**Windows Command Prompt:**

~~~bat
copy .env.example .env
~~~

**macOS, Linux, or Git Bash:**

~~~bash
cp .env.example .env
~~~

Open .env and set your key and port:

~~~dotenv
GROQ_API_KEY=your_groq_api_key_here
PORT=7777
~~~

Keep the real API key private. Do not commit .env or paste the key into issues, screenshots, or public demos. If you do not configure a key, supported built-in cleanup commands can still run, but open-ended AI interpretation will be limited.

### 3. Install dependencies

Run this from the Autocell directory:

~~~bash
npm run setup
~~~

This installs the backend and frontend dependencies.

### 4. Start development mode

~~~bash
npm run dev
~~~

The app's default production URL is **http://localhost:7777**. For the normal app experience, use the Windows `start.bat` launcher or follow the production build instructions below. When you specifically run `npm run dev`, Vite serves a separate development frontend on port 3000 and proxies API requests to the backend on port 7777.

### Quick start on Windows

After configuring .env, you can also double-click **start.bat** inside the Autocell folder. It checks for Node.js, installs missing dependencies, builds the frontend and backend when their build folders are missing, opens the app in your browser, and starts the production server.

The production app is served at **http://localhost:7777**.

### Build and run the production version manually

From the Autocell directory:

~~~bash
npm run build
npm start
~~~

Then open **http://localhost:7777**.

## Technology

| Layer | Implementation |
| --- | --- |
| User interface | React 18, TypeScript, Vite, Tailwind CSS |
| API server | Node.js, Express, TypeScript |
| Spreadsheet parsing and export | SheetJS (xlsx) |
| Language-model integration | Groq API, using structured JSON responses |
| Development workflow | npm scripts, ts-node-dev, Vite proxy |

AutoCell uses a small operation engine for transformations and maintains the active workbook in server memory. This keeps the prototype simple to run and avoids requiring a database.

## Data handling and current scope

- The active workbook is held in the server's memory; restarting the server resets the in-memory session.
- When a Groq API key is configured and a request reaches the model, AutoCell sends the sheet's column headers, a sample of up to 15 data rows, and the user's prompt to Groq. Do not use sensitive data unless you are comfortable sending that sample to the external API.
- This is a local, single-user prototype, not a hardened multi-user service. Do not expose it directly to the public internet without adding authentication and appropriate security controls.
- Excel export preserves the workbook's sheets as data tables. CSV export contains only the first sheet.
- Some cleanup choices are heuristic. Inspect the transformed values and use undo if the result is not what you intended.

## Project structure

~~~text
autocell/
├── README.md
├── LICENSE
└── Autocell/
    ├── client/          # React + Vite interface
    ├── server/          # Express API and spreadsheet operations
    ├── .env.example     # Environment variable template
    ├── package.json
    ├── start.bat        # Windows production launcher
    └── dev.bat          # Windows development launcher
~~~

## License

See [LICENSE](LICENSE).

---

AutoCell is built around a simple idea: **data cleanup should be clear enough to describe, visible enough to verify, and easy enough to undo.**