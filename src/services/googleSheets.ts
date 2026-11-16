/**
 * SmartBus AI - Google Sheets Integration Service via Google Apps Script Web App API
 * Supports 10 defined tabs: Users, Buses, Routes, Stops, Route_Stops,
 * GPS_Logs, Crowd_Estimates, Bus_Arrivals, Crowd_Reports, Settings
 */

import { getAdminToken } from './staffService';

export interface SheetsTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  availableSheets?: string[];
  version?: string;
  timestamp?: string;
  readVerified?: boolean;
  writeVerified?: boolean;
}

export const SHEETS_SCHEMA = [
  {
    name: 'Users',
    columns: ['id', 'email', 'password_hash', 'salt', 'role', 'name', 'status', 'created_at'],
    description: 'System user accounts with salted password hashes. Passwords are encrypted before saving.',
  },
  {
    name: 'Buses',
    columns: [
      'id',
      'bus_number',
      'route_id',
      'route_name',
      'route_number',
      'capacity',
      'current_passengers',
      'crowd_percentage',
      'crowd_category',
      'latitude',
      'longitude',
      'speed_kmh',
      'status',
      'location_source',
      'last_updated',
      'next_stop_name',
      'eta_next_stop_min',
    ],
    description: 'Fleet of public buses with live coordinates, speeds, and crowd occupancy percentages.',
  },
  {
    name: 'Routes',
    columns: ['id', 'route_number', 'route_name', 'start_point', 'end_point', 'distance_km', 'estimated_duration_min', 'city'],
    description: 'Designated transit routes with terminals and distances.',
  },
  {
    name: 'Stops',
    columns: ['id', 'code', 'name', 'latitude', 'longitude', 'city', 'address', 'shelter_available'],
    description: 'Physical bus stop locations with geographic coordinates and city identifiers.',
  },
  {
    name: 'Route_Stops',
    columns: ['id', 'route_id', 'stop_id', 'sequence_order', 'distance_from_start_km', 'typical_time_min'],
    description: 'Ordered sequence of stops along each route with transit timings.',
  },
  {
    name: 'GPS_Logs',
    columns: ['id', 'bus_id', 'latitude', 'longitude', 'speed_kmh', 'location_source', 'timestamp'],
    description: 'Audit log of historical bus coordinates, tagged as SIMULATED, MANUAL, or REAL-TIME GPS.',
  },
  {
    name: 'Crowd_Estimates',
    columns: ['id', 'bus_id', 'passenger_count', 'crowd_percentage', 'crowd_category', 'detection_source', 'timestamp'],
    description: 'Computer vision and camera inference logs recording passenger numbers.',
  },
  {
    name: 'Bus_Arrivals',
    columns: ['id', 'stop_id', 'bus_id', 'estimated_arrival_min', 'scheduled_time', 'crowd_category', 'status'],
    description: 'Real-time and simulated arrival predictions for passengers waiting at stops.',
  },
  {
    name: 'Crowd_Reports',
    columns: ['id', 'bus_id', 'reported_by', 'crowd_level', 'comment', 'timestamp', 'verified'],
    description: 'Passenger crowd-sourced reports and onboard verification.',
  },
  {
    name: 'Settings',
    columns: ['key', 'value', 'updated_at'],
    description: 'Application parameters, simulation speed, and model threshold settings.',
  },
];

/**
 * COMPLETE GOOGLE APPS SCRIPT CODE FOR BOUND EXISTING SPREADSHEET
 * Paste this directly into Extensions > Apps Script in your existing spreadsheet.
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * SmartBus AI - Google Sheets Backend Web App API (Code.gs)
 * ============================================================================
 * Bound to your existing Google Spreadsheet.
 * Deploy as: Web app -> Execute as: Me -> Who has access: Anyone
 */

// Helper to return standardized JSON output with CORS support
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// SHA-256 Password Hasher with Salt (Passwords are NEVER stored in plain text)
function hashPassword(password, salt) {
  var rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < rawBytes.length; i++) {
    var b = rawBytes[i];
    if (b < 0) b += 256;
    var str = b.toString(16);
    if (str.length === 1) str = '0' + str;
    hex += str;
  }
  return hex;
}

// Helper: Convert sheet rows into array of objects using Row 1 headers
function getSheetRecords(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var results = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    results.push(obj);
  }
  return results;
}

// Helper: Find row index by ID column (1-based row number)
function findRowById(sheet, id) {
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(id)) {
      return r + 1; // 1-indexed for Sheets API
    }
  }
  return -1;
}

// ============================================================================
// 1. GET REQUEST HANDLER (doGet)
// ============================================================================
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ACTION: Ping & Health Check
    if (action === 'ping') {
      var sheetNames = ss.getSheets().map(function(s) { return s.getName(); });
      return jsonResponse({
        status: 'ok',
        success: true,
        version: '1.2.0',
        message: 'SmartBus AI Web App API connected successfully to your spreadsheet.',
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName(),
        availableSheets: sheetNames,
        timestamp: new Date().toISOString()
      });
    }

    // ACTION: Read All Records from a Specific Tab
    if (action === 'getData') {
      var sheetName = e.parameter.sheet;
      if (!sheetName) throw new Error('Missing parameter: sheet');
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error('Sheet not found: ' + sheetName);

      var records = getSheetRecords(sheet);
      return jsonResponse({
        status: 'ok',
        success: true,
        sheet: sheetName,
        count: records.length,
        data: records
      });
    }

    // ACTION: Get User Profile by Email (without exposing password_hash or salt)
    if (action === 'getUser') {
      var email = (e.parameter.email || '').toLowerCase().trim();
      if (!email) throw new Error('Missing email parameter');
      var userSheet = ss.getSheetByName('Users');
      if (!userSheet) throw new Error('Users sheet not found');
      var users = getSheetRecords(userSheet);
      var match = null;
      for (var u = 0; u < users.length; u++) {
        if (String(users[u].email).toLowerCase() === email) {
          match = {
            id: users[u].id,
            email: users[u].email,
            role: users[u].role,
            name: users[u].name,
            status: users[u].status,
            created_at: users[u].created_at
          };
          break;
        }
      }
      if (!match) return jsonResponse({ status: 'error', message: 'User not found' });
      return jsonResponse({ status: 'ok', success: true, user: match });
    }

    // ACTION: Test Read and Write Verification
    if (action === 'testReadWrite') {
      var settingsSheet = ss.getSheetByName('Settings');
      if (!settingsSheet) throw new Error('Settings sheet tab is missing in your spreadsheet.');
      var testKey = 'connection_test_ping';
      var testVal = 'Verified at ' + new Date().toISOString();
      // Write test row
      settingsSheet.appendRow([testKey, testVal, new Date().toISOString()]);
      // Read back rows
      var readRows = getSheetRecords(settingsSheet);
      return jsonResponse({
        status: 'ok',
        success: true,
        readVerified: true,
        writeVerified: true,
        message: 'Read & Write permissions verified successfully on your existing spreadsheet!',
        totalSettingsEntries: readRows.length,
        timestamp: new Date().toISOString()
      });
    }

    return jsonResponse({ status: 'error', message: 'Unknown GET action: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', success: false, message: err.toString() });
  }
}

// ============================================================================
// 2. POST REQUEST HANDLER (doPost)
// ============================================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No post data provided in request body');
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var data = payload.data || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ------------------------------------------------------------------------
    // USER REGISTRATION (Secure Salt + SHA-256)
    // ------------------------------------------------------------------------
    if (action === 'registerUser') {
      var email = (data.email || '').toLowerCase().trim();
      var password = data.password || '';
      var name = (data.name || '').trim();
      var role = (data.role || 'passenger').toLowerCase();

      if (!email || !password || !name) {
        throw new Error('Email, password, and name are required for registration');
      }

      var uSheet = ss.getSheetByName('Users');
      if (!uSheet) throw new Error('Users sheet not found');

      // Check duplicate
      var existingUsers = getSheetRecords(uSheet);
      for (var i = 0; i < existingUsers.length; i++) {
        if (String(existingUsers[i].email).toLowerCase() === email) {
          return jsonResponse({ status: 'error', message: 'An account with this email already exists' });
        }
      }

      // Generate random salt and hash password securely
      var salt = Utilities.getUuid().substring(0, 16);
      var hash = hashPassword(password, salt);
      var userId = 'usr_' + Utilities.getUuid().substring(0, 8);
      var createdAt = new Date().toISOString();

      uSheet.appendRow([userId, email, hash, salt, role, name, 'active', createdAt]);

      return jsonResponse({
        status: 'ok',
        success: true,
        message: 'User registered successfully into Google Sheets',
        user: { id: userId, email: email, name: name, role: role, status: 'active', createdAt: createdAt }
      });
    }

    // ------------------------------------------------------------------------
    // USER LOGIN (Validate salted hash)
    // ------------------------------------------------------------------------
    if (action === 'loginUser') {
      var loginEmail = (data.email || '').toLowerCase().trim();
      var loginPass = data.password || '';

      var uSheetLogin = ss.getSheetByName('Users');
      if (!uSheetLogin) throw new Error('Users sheet not found');
      var allUsers = getSheetRecords(uSheetLogin);
      var matched = null;

      for (var j = 0; j < allUsers.length; j++) {
        if (String(allUsers[j].email).toLowerCase() === loginEmail) {
          matched = allUsers[j];
          break;
        }
      }

      if (!matched) {
        return jsonResponse({ status: 'error', message: 'Invalid email or password' });
      }
      if (String(matched.status).toLowerCase() === 'suspended') {
        return jsonResponse({ status: 'error', message: 'Account is suspended' });
      }

      var calculatedHash = hashPassword(loginPass, matched.salt);
      if (calculatedHash !== matched.password_hash) {
        return jsonResponse({ status: 'error', message: 'Invalid email or password' });
      }

      return jsonResponse({
        status: 'ok',
        success: true,
        message: 'Login authenticated successfully',
        user: {
          id: matched.id,
          email: matched.email,
          name: matched.name,
          role: matched.role,
          status: matched.status,
          createdAt: matched.created_at
        }
      });
    }

    // ------------------------------------------------------------------------
    // BUS CRUD OPERATIONS
    // ------------------------------------------------------------------------
    if (action === 'addBus' || action === 'syncBus') {
      var bSheet = ss.getSheetByName('Buses');
      if (!bSheet) throw new Error('Buses sheet not found');
      var busId = data.id || ('bus_' + Utilities.getUuid().substring(0, 8));
      var existingRow = findRowById(bSheet, busId);

      var busRowData = [
        busId,
        data.busNumber || data.bus_number,
        data.routeId || data.route_id,
        data.routeName || data.route_name,
        data.routeNumber || data.route_number,
        data.capacity || 50,
        data.currentPassengers || data.current_passengers || 0,
        data.crowdPercentage || data.crowd_percentage || 0,
        data.crowdCategory || data.crowd_category || 'LOW',
        data.latitude || 0,
        data.longitude || 0,
        data.speedKmh || data.speed_kmh || 0,
        data.status || 'active',
        data.locationSource || data.location_source || 'SIMULATED',
        new Date().toISOString(),
        data.nextStopName || data.next_stop_name || '',
        data.etaNextStopMin || data.eta_next_stop_min || 0
      ];

      if (existingRow > 1) {
        bSheet.getRange(existingRow, 1, 1, busRowData.length).setValues([busRowData]);
      } else {
        bSheet.appendRow(busRowData);
      }
      return jsonResponse({ status: 'ok', success: true, message: 'Bus synchronized successfully', busId: busId });
    }

    if (action === 'deleteBus') {
      var bSheetDel = ss.getSheetByName('Buses');
      if (!bSheetDel) throw new Error('Buses sheet not found');
      var delRow = findRowById(bSheetDel, data.id);
      if (delRow > 1) {
        bSheetDel.deleteRow(delRow);
        return jsonResponse({ status: 'ok', success: true, message: 'Bus deleted from sheet' });
      }
      return jsonResponse({ status: 'error', message: 'Bus ID not found' });
    }

    // ------------------------------------------------------------------------
    // ROUTE CRUD OPERATIONS
    // ------------------------------------------------------------------------
    if (action === 'addRoute' || action === 'updateRoute') {
      var rSheet = ss.getSheetByName('Routes');
      if (!rSheet) throw new Error('Routes sheet not found');
      var routeId = data.id || ('rt_' + Utilities.getUuid().substring(0, 6));
      var rRow = findRowById(rSheet, routeId);

      var routeData = [
        routeId,
        data.routeNumber || data.route_number,
        data.routeName || data.route_name,
        data.startPoint || data.start_point,
        data.endPoint || data.end_point,
        data.distanceKm || data.distance_km || 0,
        data.estimatedDurationMin || data.estimated_duration_min || 0,
        data.city || 'Chennai'
      ];

      if (rRow > 1) {
        rSheet.getRange(rRow, 1, 1, routeData.length).setValues([routeData]);
      } else {
        rSheet.appendRow(routeData);
      }
      return jsonResponse({ status: 'ok', success: true, routeId: routeId });
    }

    if (action === 'deleteRoute') {
      var rSheetDel = ss.getSheetByName('Routes');
      if (!rSheetDel) throw new Error('Routes sheet not found');
      var delRouteRow = findRowById(rSheetDel, data.id);
      if (delRouteRow > 1) {
        rSheetDel.deleteRow(delRouteRow);
        return jsonResponse({ status: 'ok', success: true, message: 'Route deleted' });
      }
      return jsonResponse({ status: 'error', message: 'Route ID not found' });
    }

    // ------------------------------------------------------------------------
    // STOP CRUD OPERATIONS
    // ------------------------------------------------------------------------
    if (action === 'addStop' || action === 'updateStop') {
      var sSheet = ss.getSheetByName('Stops');
      if (!sSheet) throw new Error('Stops sheet not found');
      var stopId = data.id || ('stp_' + Utilities.getUuid().substring(0, 6));
      var sRow = findRowById(sSheet, stopId);

      var stopData = [
        stopId,
        data.code || '',
        data.name || '',
        data.latitude || 0,
        data.longitude || 0,
        data.city || '',
        data.address || '',
        data.shelterAvailable !== undefined ? data.shelterAvailable : true
      ];

      if (sRow > 1) {
        sSheet.getRange(sRow, 1, 1, stopData.length).setValues([stopData]);
      } else {
        sSheet.appendRow(stopData);
      }
      return jsonResponse({ status: 'ok', success: true, stopId: stopId });
    }

    // ------------------------------------------------------------------------
    // GPS LOGGING & AUDIT TRAIL
    // ------------------------------------------------------------------------
    if (action === 'logGPS') {
      var gpsSheet = ss.getSheetByName('GPS_Logs');
      if (gpsSheet) {
        gpsSheet.appendRow([
          data.id || ('gps_' + Utilities.getUuid().substring(0, 8)),
          data.busId || data.bus_id,
          data.latitude || 0,
          data.longitude || 0,
          data.speedKmh || data.speed_kmh || 0,
          data.locationSource || data.location_source || 'SIMULATED',
          data.timestamp || new Date().toISOString()
        ]);
      }
      return jsonResponse({ status: 'ok', success: true });
    }

    // ------------------------------------------------------------------------
    // CROWD ESTIMATES (AI Vision Results)
    // ------------------------------------------------------------------------
    if (action === 'logCrowdEstimate') {
      var crwSheet = ss.getSheetByName('Crowd_Estimates');
      if (crwSheet) {
        crwSheet.appendRow([
          data.id || ('crw_' + Utilities.getUuid().substring(0, 8)),
          data.busId || data.bus_id,
          data.passengerCount || data.passenger_count || 0,
          data.crowdPercentage || data.crowd_percentage || 0,
          data.crowdCategory || data.crowd_category || 'LOW',
          data.detectionSource || data.detection_source || 'AI_CAMERA',
          data.timestamp || new Date().toISOString()
        ]);
      }
      return jsonResponse({ status: 'ok', success: true });
    }

    // ------------------------------------------------------------------------
    // BUS ARRIVALS & PREDICTIONS
    // ------------------------------------------------------------------------
    if (action === 'saveBusArrival') {
      var arrSheet = ss.getSheetByName('Bus_Arrivals');
      if (arrSheet) {
        arrSheet.appendRow([
          data.id || ('arr_' + Utilities.getUuid().substring(0, 8)),
          data.stopId || data.stop_id,
          data.busId || data.bus_id,
          data.estimatedArrivalMin || data.estimated_arrival_min || 0,
          data.scheduledTime || data.scheduled_time || '',
          data.crowdCategory || data.crowd_category || 'LOW',
          data.status || 'on_time'
        ]);
      }
      return jsonResponse({ status: 'ok', success: true });
    }

    // ------------------------------------------------------------------------
    // PASSENGER CROWD REPORTS
    // ------------------------------------------------------------------------
    if (action === 'reportCrowd') {
      var repSheet = ss.getSheetByName('Crowd_Reports');
      if (repSheet) {
        repSheet.appendRow([
          data.id || ('rep_' + Utilities.getUuid().substring(0, 8)),
          data.busId || data.bus_id,
          data.reportedBy || data.reported_by || 'passenger',
          data.crowdLevel || data.crowd_level || 'MEDIUM',
          data.comment || '',
          new Date().toISOString(),
          false
        ]);
      }
      return jsonResponse({ status: 'ok', success: true, message: 'Crowd report stored' });
    }

    // ------------------------------------------------------------------------
    // TEST WRITE
    // ------------------------------------------------------------------------
    if (action === 'testWrite') {
      var setSheet = ss.getSheetByName('Settings');
      if (!setSheet) throw new Error('Settings tab not found');
      setSheet.appendRow(['test_write_ping', 'Success at ' + new Date().toISOString(), new Date().toISOString()]);
      return jsonResponse({ status: 'ok', success: true, message: 'Write verified on Settings sheet' });
    }

    return jsonResponse({ status: 'error', message: 'Invalid or unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', success: false, message: err.toString() });
  }
}
`;

export async function testSheetsConnection(url: string): Promise<SheetsTestResult> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return {
      success: false,
      message: 'No Google Sheets API URL provided. Please enter your deployed Web App URL.',
    };
  }

  const start = performance.now();
  try {
    const adminToken = getAdminToken();
    const res = await fetch('/api/sheets/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      },
      body: JSON.stringify({ url: trimmed }),
    });

    const elapsed = Math.round(performance.now() - start);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        message: errData.error || `HTTP ${res.status}: Failed to reach Google Sheets API URL`,
        latencyMs: elapsed,
      };
    }

    const data = await res.json();
    return {
      success: true,
      message: data.message || 'Google Sheets Web App connected successfully!',
      latencyMs: elapsed,
      availableSheets: data.availableSheets || [],
      version: data.version || '1.2.0',
      timestamp: data.timestamp || new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Network error while contacting Google Sheets Web App',
      latencyMs: Math.round(performance.now() - start),
    };
  }
}

export async function verifyReadWrite(url: string): Promise<SheetsTestResult> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return {
      success: false,
      message: 'No Google Sheets API URL provided.',
    };
  }

  const start = performance.now();
  try {
    const adminToken = getAdminToken();
    const res = await fetch('/api/sheets/verify-read-write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      },
      body: JSON.stringify({ url: trimmed }),
    });

    const elapsed = Math.round(performance.now() - start);
    const data = await res.json();

    if (!res.ok || !data.success) {
      return {
        success: false,
        message: data.error || data.message || `Failed to verify read/write operations`,
        latencyMs: elapsed,
      };
    }

    return {
      success: true,
      message: data.message || 'Both Read and Write operations verified successfully!',
      readVerified: true,
      writeVerified: true,
      latencyMs: elapsed,
      availableSheets: data.availableSheets || [],
    };
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Failed to verify read/write on sheet',
      latencyMs: Math.round(performance.now() - start),
    };
  }
}

export interface SheetFetchResponse {
  records: any[];
  ok: boolean;
  error?: string;
}

/**
 * Fetch raw records from a specific Google Sheets tab via Web App API
 * with diagnostic error details (never masks Apps Script failures as empty data).
 */
export async function fetchSheetDataSafe(url: string, sheetName: string): Promise<SheetFetchResponse> {
  const trimmed = url?.trim();
  if (!trimmed) {
    return { records: [], ok: false, error: 'Missing Google Sheets Apps Script URL' };
  }
  try {
    const targetUrl = trimmed.includes('?')
      ? `${trimmed}&action=getData&sheet=${encodeURIComponent(sheetName)}`
      : `${trimmed}?action=getData&sheet=${encodeURIComponent(sheetName)}`;

    const res = await fetch('/api/sheets/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, method: 'GET' }),
    });

    const result = await res.json().catch(() => null);
    if (!res.ok || !result) {
      return {
        records: [],
        ok: false,
        error: result?.error || result?.message || `HTTP ${res.status} fetching sheet '${sheetName}'`,
      };
    }

    if (Array.isArray(result)) {
      return { records: result, ok: true };
    }
    if (result.status === 'error' || result.success === false) {
      return {
        records: [],
        ok: false,
        error: result.message || result.error || `Sheet '${sheetName}' error`,
      };
    }
    if (Array.isArray(result.data)) {
      return { records: result.data, ok: true };
    }
    if (Array.isArray(result.records)) {
      return { records: result.records, ok: true };
    }
    return { records: [], ok: true };
  } catch (err: any) {
    console.warn(`Failed to fetch sheet ${sheetName}:`, err);
    return { records: [], ok: false, error: err?.message || `Failed to fetch sheet ${sheetName}` };
  }
}

/**
 * Fetch raw records from a specific Google Sheets tab via Web App API
 * Supported sheets: Routes, Route_Stops, Stops, Buses, etc.
 */
export async function fetchSheetData(url: string, sheetName: string): Promise<any[]> {
  const res = await fetchSheetDataSafe(url, sheetName);
  if (!res.ok && res.error) {
    console.warn(`Sheets tab '${sheetName}':`, res.error);
  }
  return res.records;
}

