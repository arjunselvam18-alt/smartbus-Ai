import fs from 'fs';
import path from 'path';
import { RawRouteRecord } from '../services/routeEngine';

// Parse CSV line taking quotes into account
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseChennaiRoutesCSV(csvContent: string): RawRouteRecord[] {
  const lines = csvContent.split(/\r?\n/);
  const routes: RawRouteRecord[] = [];
  let currentCategory = 'Regular Routes';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect section headers
    if (line.includes('Letter Prefixed Routes')) {
      currentCategory = 'Letter Prefixed Routes';
      continue;
    }
    if (line.includes('Cut Service Bus Routes')) {
      currentCategory = 'Cut Service Feeder Routes';
      continue;
    }
    if (line.includes('EXTN and X Service Bus Routes') || line.includes('EXTN')) {
      currentCategory = 'EXTN & Express Routes';
      continue;
    }
    if (line.includes('S-Prefixed Bus Routes')) {
      currentCategory = 'S-Prefixed Small Bus Feeders';
      continue;
    }
    if (line.includes('Secretariat and Rajaji Bhavan Routes')) {
      currentCategory = 'Secretariat & Office Special Routes';
      continue;
    }

    const cols = parseCSVLine(line);
    if (cols.length < 3) continue;

    const routeNum = cols[0].replace(/^"/, '').replace(/"$/, '').trim();
    if (!routeNum || routeNum.toLowerCase() === 'route' || routeNum.startsWith('The aforementioned') || routeNum.startsWith('These make single trips')) {
      continue;
    }

    const origin = (cols[1] || '').replace(/^"/, '').replace(/"$/, '').replace(/[,;]+$/, '').trim();
    const destination = (cols[2] || '').replace(/^"/, '').replace(/"$/, '').replace(/[,;]+$/, '').trim();
    const via = (cols[3] || '').replace(/^"/, '').replace(/"$/, '').trim();
    const notes = (cols[4] || '').replace(/^"/, '').replace(/"$/, '').trim();

    if (!origin || !destination) continue;

    routes.push({
      route: routeNum,
      origin,
      destination,
      via,
      notes: notes || undefined,
      category: currentCategory,
    });
  }

  return routes;
}
