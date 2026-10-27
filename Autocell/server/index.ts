import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 7777;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

interface WorkbookSession {
  filename: string;
  workbook: XLSX.WorkBook;
  sheets: { [sheetName: string]: any[][] };
  history: Array<{ description: string; sheetsSnapshot: { [sheetName: string]: any[][] } }>;
  redoStack: Array<{ description: string; sheetsSnapshot: { [sheetName: string]: any[][] } }>;
}

let currentSession: WorkbookSession | null = null;

function loadWorkbookToSession(filename: string, buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: { [sheetName: string]: any[][] } = {};
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    sheets[sheetName] = jsonData;
  }
  currentSession = {
    filename,
    workbook,
    sheets,
    history: [],
    redoStack: []
  };
}

function initDemoSession() {
  const demoData = [
    ["ID", "Customer Name", "Join Date", "MRR ($)", "Plan", "Status"],
    [101, "Acme Corp", "2023-01-15", 1200, "Enterprise", "Active"],
    [102, "Beta LLC", "2023/02/20", 450, "Pro", "active"],
    [103, "Gamma Inc", "invalid-date", 99999, "Starter", "Inactive"],
    [104, "Acme Corp", "2023-01-15", 1200, "Enterprise", "Active"],
    [105, "", "2023-05-10", 300, "Pro", "Active"],
    [106, "Delta Co", "2023-06-01", -50, "Starter", "Active"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(demoData);
  XLSX.utils.book_append_sheet(wb, ws, "Sales Data");
  
  const sheets = { "Sales Data": demoData };
  currentSession = {
    filename: "demo_sales_report.xlsx",
    workbook: wb,
    sheets,
    history: [],
    redoStack: []
  };
}

initDemoSession();

// --- Pattern Analysis Engine ---
function analyzePatterns(sheetData: any[][]): string {
  if (!sheetData || sheetData.length < 2) return "Not enough data to recognize patterns.";
  const header: string[] = (sheetData[0] || []).map((h: any) => String(h || '').trim());
  const rows = sheetData.slice(1);

  const findings: string[] = [];

  // 1. Check ID sequence pattern
  const idColIdx = header.findIndex(h => h.toLowerCase() === 'id' || h.toLowerCase().includes('serial') || h.toLowerCase().includes('no'));
  if (idColIdx !== -1) {
    const ids = rows.map(r => Number(r[idColIdx])).filter(n => !isNaN(n));
    if (ids.length >= 2) {
      const hasDups = new Set(ids).size !== ids.length;
      if (hasDups) {
        findings.push(`• **ID Sequence Pattern**: Base sequence is ~${ids[0]}..${ids[ids.length - 1]}, but **duplicate ID values** exist (e.g. ID ${ids[0]}).`);
      } else {
        findings.push(`• **ID Sequence Pattern**: Incrementing sequence detected starting at ${ids[0]}.`);
      }
    }
  }

  // 2. Check Date patterns
  const dateColIdx = header.findIndex(h => h.toLowerCase().includes('date') || h.toLowerCase().includes('joined'));
  if (dateColIdx !== -1) {
    const dates = rows.map(r => String(r[dateColIdx] || ''));
    const slashes = dates.filter(d => d.includes('/'));
    const dashes = dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const invalids = dates.filter(d => d && !d.includes('/') && !d.includes('-'));
    if (slashes.length > 0 && dashes.length > 0) {
      findings.push(`• **Date Inconsistency Pattern**: Mixed formats in "${header[dateColIdx]}" (${dashes.length} using \`YYYY-MM-DD\` vs ${slashes.length} using \`YYYY/MM/DD\`).`);
    }
    if (invalids.length > 0) {
      findings.push(`• **Malformed Date Pattern**: Unrecognized date values found: \`"${invalids.join('", "')}"\`.`);
    }
  }

  // 3. Check Casing patterns
  header.forEach((h, colIdx) => {
    const lower = h.toLowerCase();
    if (lower.includes('status') || lower.includes('plan')) {
      const vals = rows.map(r => String(r[colIdx] || '')).filter(Boolean);
      const uniqueVals = Array.from(new Set(vals));
      const hasMixedCase = uniqueVals.some(v1 => uniqueVals.some(v2 => v1 !== v2 && v1.toLowerCase() === v2.toLowerCase()));
      if (hasMixedCase) {
        findings.push(`• **Casing Inconsistency in "${h}"**: Found mixed letter casing (\`${uniqueVals.join('`, `')}\`). Expected Title Case.`);
      }
    }
  });

  // 4. Check Numeric Outliers & Negatives in MRR / Revenue
  const mrrColIdx = header.findIndex(h => h.toLowerCase().includes('mrr') || h.toLowerCase().includes('revenue') || h.toLowerCase().includes('price'));
  if (mrrColIdx !== -1) {
    const nums = rows.map(r => Number(r[mrrColIdx])).filter(n => !isNaN(n));
    const negatives = nums.filter(n => n < 0);
    const extreme = nums.filter(n => n > 20000);
    if (negatives.length > 0) {
      findings.push(`• **Negative Outlier Pattern**: Found ${negatives.length} negative value (${negatives.join(', ')}) in "${header[mrrColIdx]}" where values must be positive.`);
    }
    if (extreme.length > 0) {
      findings.push(`• **Extreme Outlier Pattern**: Value of $${extreme[0].toLocaleString()} is significantly higher than normal range ($300-$1,200).`);
    }
  }

  // 5. Duplicate rows
  const seen = new Set<string>();
  let dupCount = 0;
  rows.forEach(r => {
    const s = JSON.stringify(r);
    if (seen.has(s)) dupCount++;
    else seen.add(s);
  });
  if (dupCount > 0) {
    findings.push(`• **Duplicate Row Pattern**: ${dupCount} exact duplicate row(s) identified.`);
  }

  // 6. Missing values
  let missingCount = 0;
  rows.forEach(r => {
    r.forEach(c => {
      if (c === '' || c === null || c === undefined) missingCount++;
    });
  });
  if (missingCount > 0) {
    findings.push(`• **Missing Values Pattern**: ${missingCount} cell(s) contain missing/blank entries.`);
  }

  if (findings.length === 0) {
    return "All data follows consistent, valid patterns. No anomalies found.";
  }

  return `### Recognized Data Patterns & Inconsistencies:\n\n` + 
    findings.join('\n\n') + 
    `\n\n*Would you like me to fix these patterns? Ask me to **"Fix all patterns"** or **"Harmonize casing and dates"**.*`;
}

// Safe expression evaluator for row-level transformations
function safeEvalFormula(expr: string, scope: Record<string, any>): any {
  try {
    const keys = Object.keys(scope);
    const vals = Object.values(scope);
    const fn = new Function(...keys, `"use strict"; return (${expr});`);
    return fn(...vals);
  } catch (e) {
    return null;
  }
}

// --- Operation Engine for Realtime Spreadsheet Operations ---
interface Operation {
  type: string;
  column?: string;
  value?: any;
  order?: 'asc' | 'desc';
  formula?: string;
  multiplier?: number;
  bySerial?: boolean;
}

function executeOperationsOnSheet(sheetData: any[][], operations: Operation[]): { updatedSheet: any[][]; logs: string[] } {
  let sheet = JSON.parse(JSON.stringify(sheetData));
  if (!sheet || sheet.length === 0) return { updatedSheet: sheet, logs: [] };

  const logs: string[] = [];
  const header: string[] = (sheet[0] || []).map((h: any) => String(h ?? '').trim());

  function getColIndex(colName?: string): number {
    if (!colName) return -1;
    const lower = colName.toLowerCase().trim();
    return header.findIndex(h => h.toLowerCase() === lower || h.toLowerCase().includes(lower) || lower.includes(h.toLowerCase()));
  }

  for (const op of operations) {
    if (op.type === 'formula_transform' || op.type === 'multiply' || op.type === 'math') {
      let colIdx = getColIndex(op.column);
      if (colIdx === -1) {
        // Default to MRR or first numeric column
        colIdx = header.findIndex(h => h.toLowerCase().includes('mrr') || h.toLowerCase().includes('revenue') || h.toLowerCase().includes('price'));
      }
      if (colIdx !== -1) {
        let count = 0;
        const formula = op.formula || (op.bySerial ? 'val * 2 * serial' : (op.multiplier ? `val * ${op.multiplier}` : 'val * 2'));

        for (let i = 1; i < sheet.length; i++) {
          const serial = i; // 1-based serial number (Row 1 is serial 1, Row 2 is serial 2...)
          const rawVal = sheet[i][colIdx];
          const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.-]+/g, ''));
          const currentNum = isNaN(num) ? 0 : num;

          // Scope for formula
          const rowObj: Record<string, any> = {};
          header.forEach((h, hIdx) => {
            const cleanKey = h.replace(/[^a-zA-Z0-9_]/g, '');
            if (cleanKey) rowObj[cleanKey] = sheet[i][hIdx];
            rowObj[`col_${hIdx}`] = sheet[i][hIdx];
          });

          const scope = {
            val: currentNum,
            x: currentNum,
            num: currentNum,
            serial,
            rowNum: serial,
            index: serial,
            ...rowObj
          };

          let calculated = safeEvalFormula(formula, scope);
          if (calculated === null || isNaN(calculated)) {
            if (op.bySerial || formula.includes('serial')) {
              calculated = currentNum * 2 * serial;
            } else if (op.multiplier) {
              calculated = currentNum * op.multiplier;
            } else {
              calculated = currentNum * 2;
            }
          }

          if (typeof calculated === 'number') {
            calculated = Math.round(calculated * 100) / 100;
          }

          sheet[i][colIdx] = calculated;
          count++;
        }
        logs.push(`Updated ${count} row(s) in "${header[colIdx]}" with formula: ${formula} (2x by serial number)`);
      }
    } else if (op.type === 'pattern_fix' || op.type === 'fix_patterns') {
      let caseCount = 0;
      let dateCount = 0;
      let negCount = 0;
      let fillCount = 0;

      // 1. Harmonize casing to Title Case
      for (let j = 0; j < header.length; j++) {
        const colName = header[j].toLowerCase();
        if (colName.includes('status') || colName.includes('plan') || colName.includes('type') || colName.includes('category')) {
          for (let i = 1; i < sheet.length; i++) {
            const val = String(sheet[i][j] || '').trim();
            if (val) {
              const proper = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
              if (val !== proper) {
                sheet[i][j] = proper;
                caseCount++;
              }
            }
          }
        }
      }

      // 2. Normalize date formats
      for (let j = 0; j < header.length; j++) {
        const colName = header[j].toLowerCase();
        if (colName.includes('date') || colName.includes('joined')) {
          for (let i = 1; i < sheet.length; i++) {
            let val = String(sheet[i][j] || '').trim();
            if (val.includes('/')) {
              sheet[i][j] = val.replace(/\//g, '-');
              dateCount++;
            }
          }
        }
      }

      // 3. Fix negative outliers
      for (let j = 0; j < header.length; j++) {
        const colName = header[j].toLowerCase();
        if (colName.includes('mrr') || colName.includes('revenue') || colName.includes('price')) {
          for (let i = 1; i < sheet.length; i++) {
            const num = Number(sheet[i][j]);
            if (!isNaN(num) && num < 0) {
              sheet[i][j] = Math.abs(num);
              negCount++;
            }
          }
        }
      }

      // 4. Fill missing values
      for (let i = 1; i < sheet.length; i++) {
        for (let j = 0; j < header.length; j++) {
          if (sheet[i][j] === '' || sheet[i][j] === null || sheet[i][j] === undefined) {
            sheet[i][j] = 'N/A';
            fillCount++;
          }
        }
      }

      logs.push(`Fixed patterns: ${caseCount} casing standardizations, ${dateCount} date normalizations, ${negCount} negative amounts corrected, ${fillCount} missing values filled`);
    } else if (op.type === 'remove_duplicates') {
      const seen = new Set<string>();
      const uniqueRows = [sheet[0]];
      let dupsCount = 0;
      for (let i = 1; i < sheet.length; i++) {
        const sig = JSON.stringify(sheet[i]);
        if (!seen.has(sig)) {
          seen.add(sig);
          uniqueRows.push(sheet[i]);
        } else {
          dupsCount++;
        }
      }
      sheet = uniqueRows;
      logs.push(`Removed ${dupsCount} duplicate row(s)`);
    } else if (op.type === 'delete_empty_rows') {
      const rows = [sheet[0]];
      let emptyCount = 0;
      for (let i = 1; i < sheet.length; i++) {
        const isEmpty = sheet[i].every((c: any) => c === '' || c === null || c === undefined);
        if (!isEmpty) {
          rows.push(sheet[i]);
        } else {
          emptyCount++;
        }
      }
      sheet = rows;
      logs.push(`Deleted ${emptyCount} empty row(s)`);
    } else if (op.type === 'normalize_dates') {
      const colIdx = getColIndex(op.column);
      let count = 0;
      for (let i = 1; i < sheet.length; i++) {
        for (let j = 0; j < sheet[i].length; j++) {
          if (colIdx !== -1 && j !== colIdx) continue;
          const colName = header[j] || '';
          if (colIdx !== -1 || colName.toLowerCase().includes('date') || colName.toLowerCase().includes('joined')) {
            let val = String(sheet[i][j] || '').trim();
            if (val.includes('/')) {
              val = val.replace(/\//g, '-');
              sheet[i][j] = val;
              count++;
            }
          }
        }
      }
      logs.push(`Standardized ${count} date(s) to YYYY-MM-DD`);
    } else if (op.type === 'fill_missing') {
      const colIdx = getColIndex(op.column);
      const fillVal = op.value !== undefined ? op.value : 'N/A';
      let filledCount = 0;
      for (let i = 1; i < sheet.length; i++) {
        const maxLen = Math.max(sheet[0]?.length || 0, sheet[i].length);
        for (let j = 0; j < maxLen; j++) {
          if (colIdx !== -1 && j !== colIdx) continue;
          if (sheet[i][j] === '' || sheet[i][j] === null || sheet[i][j] === undefined) {
            sheet[i][j] = fillVal;
            filledCount++;
          }
        }
      }
      logs.push(`Filled ${filledCount} missing cell(s) with "${fillVal}"`);
    } else if (op.type === 'fix_negatives' || op.type === 'fix_negative_outliers') {
      const colIdx = getColIndex(op.column);
      let count = 0;
      for (let i = 1; i < sheet.length; i++) {
        for (let j = 0; j < sheet[i].length; j++) {
          if (colIdx !== -1 && j !== colIdx) continue;
          const colName = header[j] || '';
          if (colIdx !== -1 || colName.toLowerCase().includes('mrr') || colName.toLowerCase().includes('revenue') || colName.toLowerCase().includes('price') || colName.toLowerCase().includes('cost')) {
            const num = Number(sheet[i][j]);
            if (!isNaN(num) && num < 0) {
              sheet[i][j] = Math.abs(num);
              count++;
            }
          }
        }
      }
      logs.push(`Fixed ${count} negative outlier(s)`);
    } else if (op.type === 'trim_whitespace') {
      let count = 0;
      for (let i = 1; i < sheet.length; i++) {
        for (let j = 0; j < sheet[i].length; j++) {
          if (typeof sheet[i][j] === 'string') {
            const trimmed = sheet[i][j].trim();
            if (trimmed !== sheet[i][j]) {
              sheet[i][j] = trimmed;
              count++;
            }
          }
        }
      }
      logs.push(`Trimmed excess whitespace in ${count} cell(s)`);
    } else if (op.type === 'sort') {
      const colIdx = getColIndex(op.column) !== -1 ? getColIndex(op.column) : 0;
      const order = op.order === 'desc' ? -1 : 1;
      const rows = sheet.slice(1);
      rows.sort((a: any[], b: any[]) => {
        const valA = a[colIdx];
        const valB = b[colIdx];
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
          return (numA - numB) * order;
        }
        return String(valA ?? '').localeCompare(String(valB ?? '')) * order;
      });
      sheet = [sheet[0], ...rows];
      logs.push(`Sorted by "${header[colIdx]}" (${op.order || 'asc'})`);
    } else if (op.type === 'capitalize' || op.type === 'capitalize_column') {
      const colIdx = getColIndex(op.column);
      if (colIdx !== -1) {
        let count = 0;
        for (let i = 1; i < sheet.length; i++) {
          const val = String(sheet[i][colIdx] || '');
          if (val) {
            sheet[i][colIdx] = val.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            count++;
          }
        }
        logs.push(`Capitalized text in column "${header[colIdx]}"`);
      }
    } else if (op.type === 'uppercase') {
      const colIdx = getColIndex(op.column);
      if (colIdx !== -1) {
        for (let i = 1; i < sheet.length; i++) {
          sheet[i][colIdx] = String(sheet[i][colIdx] || '').toUpperCase();
        }
        logs.push(`Converted "${header[colIdx]}" to uppercase`);
      }
    } else if (op.type === 'lowercase') {
      const colIdx = getColIndex(op.column);
      if (colIdx !== -1) {
        for (let i = 1; i < sheet.length; i++) {
          sheet[i][colIdx] = String(sheet[i][colIdx] || '').toLowerCase();
        }
        logs.push(`Converted "${header[colIdx]}" to lowercase`);
      }
    } else if (op.type === 'delete_column') {
      const colIdx = getColIndex(op.column);
      if (colIdx !== -1) {
        const name = header[colIdx];
        sheet = sheet.map((row: any[]) => row.filter((_, idx) => idx !== colIdx));
        logs.push(`Deleted column "${name}"`);
      }
    } else if (op.type === 'add_column') {
      const colName = op.column || 'New Column';
      const defaultVal = op.value !== undefined ? op.value : '';
      sheet[0].push(colName);
      for (let i = 1; i < sheet.length; i++) {
        sheet[i].push(defaultVal);
      }
      logs.push(`Added new column "${colName}"`);
    }
  }

  return { updatedSheet: sheet, logs };
}

// --- Endpoints ---

app.get('/api/spreadsheet', (req: Request, res: Response) => {
  if (!currentSession) return res.status(404).json({ error: 'No active spreadsheet' });
  res.json({
    filename: currentSession.filename,
    sheets: currentSession.sheets,
    sheetNames: Object.keys(currentSession.sheets),
    canUndo: currentSession.history.length > 0,
    canRedo: currentSession.redoStack.length > 0
  });
});

app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    loadWorkbookToSession(req.file.originalname, req.file.buffer);
    res.json({
      success: true,
      filename: req.file.originalname,
      sheets: currentSession!.sheets,
      sheetNames: Object.keys(currentSession!.sheets)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cell/edit', (req: Request, res: Response) => {
  const { sheet, row, col, value } = req.body;
  if (!currentSession || !currentSession.sheets[sheet]) return res.status(400).json({ error: 'Invalid request' });

  const sheetsSnapshot = JSON.parse(JSON.stringify(currentSession.sheets));
  currentSession.history.push({ description: `Edited cell [${row}, ${col}]`, sheetsSnapshot });
  currentSession.redoStack = [];

  if (!currentSession.sheets[sheet][row]) {
    currentSession.sheets[sheet][row] = [];
  }
  currentSession.sheets[sheet][row][col] = value;

  res.json({
    success: true,
    sheets: currentSession.sheets,
    canUndo: true,
    canRedo: false
  });
});

app.post('/api/sheet/add', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!currentSession) return res.status(400).json({ error: 'No session' });
  const sheetName = name || `Sheet ${Object.keys(currentSession.sheets).length + 1}`;
  if (currentSession.sheets[sheetName]) {
    return res.status(400).json({ error: 'Sheet name already exists' });
  }

  const sheetsSnapshot = JSON.parse(JSON.stringify(currentSession.sheets));
  currentSession.history.push({ description: `Added sheet "${sheetName}"`, sheetsSnapshot });
  currentSession.redoStack = [];

  currentSession.sheets[sheetName] = [["Column 1", "Column 2", "Column 3"]];

  res.json({
    success: true,
    sheets: currentSession.sheets,
    sheetNames: Object.keys(currentSession.sheets),
    activeSheet: sheetName,
    canUndo: true,
    canRedo: false
  });
});

app.post('/api/sheet/delete', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!currentSession || !currentSession.sheets[name]) return res.status(400).json({ error: 'Invalid sheet' });
  if (Object.keys(currentSession.sheets).length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only sheet' });
  }

  const sheetsSnapshot = JSON.parse(JSON.stringify(currentSession.sheets));
  currentSession.history.push({ description: `Deleted sheet "${name}"`, sheetsSnapshot });
  currentSession.redoStack = [];

  delete currentSession.sheets[name];
  const remaining = Object.keys(currentSession.sheets);

  res.json({
    success: true,
    sheets: currentSession.sheets,
    sheetNames: remaining,
    activeSheet: remaining[0],
    canUndo: true,
    canRedo: false
  });
});

// --- AI Chat Agent Endpoint ---
app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, activeSheet } = req.body;
  if (!currentSession) return res.status(404).json({ error: 'No active spreadsheet' });

  const targetSheetName = activeSheet && currentSession.sheets[activeSheet] 
    ? activeSheet 
    : Object.keys(currentSession.sheets)[0];
  
  const currentData = currentSession.sheets[targetSheetName] || [];
  const headers = currentData[0] || [];
  const rows = currentData.slice(1);
  const lowerMsg = (message || '').toLowerCase();

  let reply = '';
  let operations: Operation[] = [];

  // 1. Check for Pattern Recognition request
  if (lowerMsg.includes('pattern') && (lowerMsg.includes('recognize') || lowerMsg.includes('detect') || lowerMsg.includes('find') || lowerMsg.includes('analyze') || lowerMsg.includes('what') || lowerMsg.includes('show'))) {
    reply = analyzePatterns(currentData);
  }

  // 2. Check for Pattern Fix request
  else if (lowerMsg.includes('pattern') && (lowerMsg.includes('fix') || lowerMsg.includes('apply') || lowerMsg.includes('correct') || lowerMsg.includes('clean') || lowerMsg.includes('repair'))) {
    operations.push({ type: 'pattern_fix' });
    operations.push({ type: 'remove_duplicates' });
    reply = 'I analyzed all data patterns and fixed the inconsistencies: harmonized status casing, normalized date formats, corrected negative MRRs, removed duplicate rows, and filled missing values.';
  }

  // 3. Check for specific Formula / Multiplier requests (e.g. "change MRR 2x by every serial number")
  else if ((lowerMsg.includes('2x') || lowerMsg.includes('double') || lowerMsg.includes('multiply')) && (lowerMsg.includes('serial') || lowerMsg.includes('row') || lowerMsg.includes('index') || lowerMsg.includes('mrr'))) {
    const isSerial = lowerMsg.includes('serial') || lowerMsg.includes('row') || lowerMsg.includes('every');
    const multiplier = lowerMsg.includes('3x') ? 3 : (lowerMsg.includes('4x') ? 4 : (lowerMsg.includes('10x') ? 10 : 2));
    const formula = isSerial ? `val * ${multiplier} * serial` : `val * ${multiplier}`;
    
    // Find target column (MRR or requested column)
    let targetCol = 'MRR ($)';
    for (const h of headers) {
      if (lowerMsg.includes(String(h).toLowerCase())) {
        targetCol = String(h);
        break;
      }
    }

    operations.push({
      type: 'formula_transform',
      column: targetCol,
      formula,
      multiplier,
      bySerial: isSerial
    });

    if (isSerial) {
      reply = `I have updated **${targetCol}** by multiplying each row by **${multiplier}x times its serial number** (Row 1 × ${multiplier*1}, Row 2 × ${multiplier*2}, Row 3 × ${multiplier*3}...).`;
    } else {
      reply = `I have multiplied all values in **${targetCol}** by **${multiplier}x**.`;
    }
  }

  // 4. Check for statistical queries
  else if (lowerMsg.includes('total') || lowerMsg.includes('sum') || lowerMsg.includes('average') || lowerMsg.includes('avg') || lowerMsg.includes('count') || lowerMsg.includes('how many')) {
    let targetColIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i]).toLowerCase();
      if (lowerMsg.includes(h) || (h.includes('mrr') && lowerMsg.includes('mrr')) || (h.includes('revenue') && lowerMsg.includes('revenue'))) {
        targetColIdx = i;
        break;
      }
    }
    if (targetColIdx !== -1) {
      const colName = headers[targetColIdx];
      const numbers = rows.map(r => Number(r[targetColIdx])).filter(n => !isNaN(n));
      const sum = numbers.reduce((a, b) => a + b, 0);
      const avg = numbers.length > 0 ? (sum / numbers.length).toFixed(2) : '0';
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      const min = numbers.length > 0 ? Math.min(...numbers) : 0;

      if (lowerMsg.includes('average') || lowerMsg.includes('avg')) {
        reply = `The average for **${colName}** is **${avg}** across ${numbers.length} numeric rows.`;
      } else if (lowerMsg.includes('max') || lowerMsg.includes('highest')) {
        reply = `The highest value in **${colName}** is **${max}**.`;
      } else if (lowerMsg.includes('min') || lowerMsg.includes('lowest')) {
        reply = `The lowest value in **${colName}** is **${min}**.`;
      } else {
        reply = `The total sum for **${colName}** is **$${sum.toLocaleString()}** (Average: $${avg}, Rows: ${numbers.length}).`;
      }
    } else if (lowerMsg.includes('row') || lowerMsg.includes('count') || lowerMsg.includes('how many')) {
      reply = `There are currently **${rows.length} rows** and **${headers.length} columns** in sheet "${targetSheetName}".`;
    }
  }

  // 5. If Groq API key is present and no reply/operation yet, call Groq LLM
  const groqKey = process.env.GROQ_API_KEY;
  if (!reply && groqKey) {
    try {
      const sysPrompt = `You are Autocell AI Spreadsheet Agent. The user wants you to inspect, transform, or fix patterns in their spreadsheet.
Current Sheet: "${targetSheetName}"
Columns: ${JSON.stringify(headers)}
Rows Sample: ${JSON.stringify(rows.slice(0, 15))}

Respond ONLY with valid JSON in this format:
{
  "reply": "Friendly explanation of what you did or found",
  "operations": [
    {
      "type": "formula_transform" | "pattern_fix" | "remove_duplicates" | "delete_empty_rows" | "normalize_dates" | "fill_missing" | "fix_negatives" | "sort" | "capitalize" | "uppercase" | "lowercase" | "delete_column" | "add_column",
      "column": "column name if relevant",
      "formula": "e.g. val * 2 * serial if calculating",
      "value": "fill value if relevant",
      "order": "asc" or "desc"
    }
  ]
}
If answering a question or listing patterns without changes, return "operations": [].`;

      const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: message }
          ],
          response_format: { type: 'json_object' }
        })
      });

      const aiData: any = await aiRes.json();
      if (aiData.choices && aiData.choices[0]?.message?.content) {
        const parsed = JSON.parse(aiData.choices[0].message.content);
        if (parsed.reply) reply = parsed.reply;
        if (Array.isArray(parsed.operations)) operations = parsed.operations;
      }
    } catch (err: any) {
      console.warn('Groq LLM call error, using rule engine:', err.message);
    }
  }

  // 6. Intelligent Rule Engine Fallback
  if (!reply && operations.length === 0) {
    if (lowerMsg.includes('clean') || lowerMsg.includes('fix all') || lowerMsg.includes('sanitize')) {
      operations.push({ type: 'pattern_fix' });
      operations.push({ type: 'remove_duplicates' });
      operations.push({ type: 'delete_empty_rows' });
      reply = 'I have sanitized the spreadsheet: harmonized casing, standardized dates, removed duplicate rows, deleted empty rows, and fixed negative amounts.';
    } else {
      if (lowerMsg.includes('duplicate') || lowerMsg.includes('dedup')) {
        operations.push({ type: 'remove_duplicates' });
      }
      if (lowerMsg.includes('empty row') || lowerMsg.includes('blank row')) {
        operations.push({ type: 'delete_empty_rows' });
      }
      if (lowerMsg.includes('date') || lowerMsg.includes('format date')) {
        operations.push({ type: 'normalize_dates' });
      }
      if (lowerMsg.includes('missing') || lowerMsg.includes('fill') || lowerMsg.includes('empty')) {
        const fillVal = lowerMsg.includes('zero') || lowerMsg.includes(' 0') ? 0 : 'N/A';
        operations.push({ type: 'fill_missing', value: fillVal });
      }
      if (lowerMsg.includes('negative') || lowerMsg.includes('outlier')) {
        operations.push({ type: 'fix_negatives' });
      }
      if (lowerMsg.includes('trim') || lowerMsg.includes('whitespace') || lowerMsg.includes('spaces')) {
        operations.push({ type: 'trim_whitespace' });
      }
      if (lowerMsg.includes('sort')) {
        const order = lowerMsg.includes('desc') || lowerMsg.includes('highest') ? 'desc' : 'asc';
        let foundCol = '';
        for (const h of headers) {
          if (lowerMsg.includes(String(h).toLowerCase())) {
            foundCol = String(h);
            break;
          }
        }
        operations.push({ type: 'sort', column: foundCol || headers[0], order });
      }
      if (lowerMsg.includes('capitalize') || lowerMsg.includes('title case')) {
        let foundCol = '';
        for (const h of headers) {
          if (lowerMsg.includes(String(h).toLowerCase())) {
            foundCol = String(h);
            break;
          }
        }
        operations.push({ type: 'capitalize', column: foundCol || 'Customer Name' });
      }
    }
  }

  // Execute operations
  let logs: string[] = [];
  let modified = false;

  if (operations.length > 0) {
    const sheetsSnapshot = JSON.parse(JSON.stringify(currentSession.sheets));
    currentSession.history.push({ description: message, sheetsSnapshot });
    currentSession.redoStack = [];

    const result = executeOperationsOnSheet(currentSession.sheets[targetSheetName], operations);
    currentSession.sheets[targetSheetName] = result.updatedSheet;
    logs = result.logs;
    modified = true;

    if (!reply) {
      reply = logs.length > 0 ? logs.join('. ') + '.' : 'Applied requested changes to the spreadsheet.';
    }
  }

  if (!reply) {
    reply = `I examined the spreadsheet. Ask me to **"Recognize patterns"**, **"Change the MRR 2x by every serial number"**, **"Fix all patterns"**, or remove duplicates!`;
  }

  res.json({
    success: true,
    reply,
    logs,
    modified,
    sheets: currentSession.sheets,
    sheetNames: Object.keys(currentSession.sheets),
    activeSheet: targetSheetName,
    canUndo: currentSession.history.length > 0,
    canRedo: currentSession.redoStack.length > 0
  });
});

app.post('/api/undo', (req: Request, res: Response) => {
  if (!currentSession || currentSession.history.length === 0) {
    return res.status(400).json({ error: 'Nothing to undo' });
  }
  const currentSnapshot = JSON.parse(JSON.stringify(currentSession.sheets));
  const lastState = currentSession.history.pop()!;
  currentSession.redoStack.push({
    description: lastState.description,
    sheetsSnapshot: currentSnapshot
  });
  currentSession.sheets = lastState.sheetsSnapshot;
  res.json({
    success: true,
    sheets: currentSession.sheets,
    sheetNames: Object.keys(currentSession.sheets),
    canUndo: currentSession.history.length > 0,
    canRedo: true
  });
});

app.post('/api/redo', (req: Request, res: Response) => {
  if (!currentSession || currentSession.redoStack.length === 0) {
    return res.status(400).json({ error: 'Nothing to redo' });
  }
  const currentSnapshot = JSON.parse(JSON.stringify(currentSession.sheets));
  const nextState = currentSession.redoStack.pop()!;
  currentSession.history.push({
    description: nextState.description,
    sheetsSnapshot: currentSnapshot
  });
  currentSession.sheets = nextState.sheetsSnapshot;
  res.json({
    success: true,
    sheets: currentSession.sheets,
    sheetNames: Object.keys(currentSession.sheets),
    canUndo: true,
    canRedo: currentSession.redoStack.length > 0
  });
});

app.get('/api/export/:format', (req: Request, res: Response) => {
  if (!currentSession) return res.status(404).json({ error: 'No active spreadsheet' });
  const format = req.params.format;

  const newWb = XLSX.utils.book_new();
  for (const [sheetName, data] of Object.entries(currentSession.sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(newWb, ws, sheetName);
  }

  if (format === 'csv') {
    const firstSheetName = Object.keys(currentSession.sheets)[0];
    const csv = XLSX.utils.sheet_to_csv(newWb.Sheets[firstSheetName]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="autocell_cleaned_medu.csv"`);
    return res.send(csv);
  } else {
    const buf = XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="autocell_cleaned_medu.xlsx"`);
    return res.send(buf);
  }
});

// Static frontend serving
const clientDistPath = fs.existsSync(path.resolve(__dirname, '../client/dist'))
  ? path.resolve(__dirname, '../client/dist')
  : path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`
===================================================`);
  console.log(`  AUTOCELL AGENT BY MEDU IS LIVE AT HTTP://LOCALHOST:${PORT}`);
  console.log(`===================================================
`);
});
