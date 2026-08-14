/* =====================================================================
   Novarea Canteen — CORE LOGIC (pure, dependency-free, fully testable)
   ---------------------------------------------------------------------
   Everything security- or money-sensitive lives here as pure functions so
   it can be unit-tested in isolation (see assets/tests.js). Attached to
   window.CanteenCore in the browser; also exported for Node if ever needed.
   ===================================================================== */
(function (root) {
  'use strict';

  // ---- Enumerations --------------------------------------------------
  var CATEGORY = { AGENT: 'Agent', ANPE: 'ANPE', STAFF: 'Staff', PSIE: 'PSIE' };
  var ACCESS = { AUTO: 'AUTO', ALLOWED: 'ALLOWED', BLOCKED: 'BLOCKED' };
  var STATUS = { ACTIVE: 'Active', INACTIVE: 'Inactive', EXITED: 'Exited' };
  var SCAN_METHOD = { QR: 'QR', MANUAL: 'MANUAL_ID' };
  var MEAL_STATUS = { VALID: 'VALID', CANCELLED: 'CANCELLED' };

  // ---- Eligibility reason codes -> human readable --------------------
  var REASON_TEXT = {
    ELIGIBLE_AGENT: 'Eligible — Agent, active',
    ALLOWED_OVERRIDE: 'Eligible — manually allowed',
    NOT_AGENT: 'Not eligible — category is not Agent',
    EMPLOYEE_INACTIVE: 'Not eligible — employee is inactive',
    EMPLOYEE_EXITED: 'Not eligible — employee has left the company',
    ACCESS_BLOCKED: 'Not eligible — access manually blocked',
    INVALID_EMPLOYEE_RECORD: 'Not eligible — incomplete employee record'
  };

  function result(eligible, code) {
    return { eligible: eligible, reasonCode: code, reason: REASON_TEXT[code] || code };
  }

  /**
   * Eligibility engine — the single source of truth.
   * emp: { sourceCategory, employmentStatus, accessOverride, valid, archived }
   */
  function computeEligibility(emp) {
    emp = emp || {};
    var cat = (emp.sourceCategory || '').trim();
    var status = (emp.employmentStatus || STATUS.ACTIVE).trim();
    var override = (emp.accessOverride || ACCESS.AUTO).toString().toUpperCase();
    var exited = status === STATUS.EXITED || emp.archived === true;
    var active = status === STATUS.ACTIVE;

    if (emp.valid === false) return result(false, 'INVALID_EMPLOYEE_RECORD');
    if (override === ACCESS.BLOCKED) return result(false, 'ACCESS_BLOCKED');
    if (exited) return result(false, 'EMPLOYEE_EXITED');
    if (override === ACCESS.ALLOWED) return result(true, 'ALLOWED_OVERRIDE');
    // AUTO path: eligibility follows the Agent category + active status.
    if (cat !== CATEGORY.AGENT) return result(false, 'NOT_AGENT');
    if (!active) return result(false, 'EMPLOYEE_INACTIVE');
    return result(true, 'ELIGIBLE_AGENT');
  }

  /**
   * One-meal-per-employee-per-service-per-day rule.
   * existing: array of meal records already stored (any employee).
   * Returns { allowed, reasonCode, firstRecord }.
   * A CANCELLED record does NOT block a new meal (the slot is free again).
   */
  function canServeMeal(existing, employeeId, mealDate, mealServiceId) {
    var prior = (existing || []).filter(function (m) {
      return String(m.employeeId) === String(employeeId) &&
             m.mealDate === mealDate &&
             String(m.mealServiceId) === String(mealServiceId) &&
             m.status !== MEAL_STATUS.CANCELLED;
    });
    if (prior.length > 0) {
      // earliest passage first
      prior.sort(function (a, b) { return (a.scannedAt || '').localeCompare(b.scannedAt || ''); });
      return { allowed: false, reasonCode: 'ALREADY_SERVED', firstRecord: prior[0] };
    }
    return { allowed: true, reasonCode: 'OK', firstRecord: null };
  }

  /** Billable amount = sum of unit prices of VALID (non-cancelled) meals. */
  function billableSum(records) {
    return (records || []).reduce(function (sum, m) {
      if (m.status === MEAL_STATUS.CANCELLED) return sum;
      return sum + (Number(m.unitPrice) || 0);
    }, 0);
  }

  /** Utilization rate = served eligible / total eligible * 100 (rounded 0.1). */
  function utilizationRate(eligibleCount, servedEligibleCount) {
    if (!eligibleCount) return 0;
    return Math.round((servedEligibleCount / eligibleCount) * 1000) / 10;
  }

  // ---- Excel header mapping (tolerant) -------------------------------
  function normalizeHeader(s) {
    return (s == null ? '' : String(s))
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9]/g, '');                        // strip spaces/punct
  }

  // canonical field -> list of accepted header variants (normalized on compare)
  var HEADER_ALIASES = {
    employeeId: ['employeeid', 'employeeidno', 'empid', 'matricule', 'idemploye', 'staffid'],
    fullName: ['fullname', 'name', 'nomcomplet', 'employeename'],
    lastName: ['lastname', 'nom', 'surname'],
    firstName: ['firstname', 'prenom', 'prenoms'],
    sourceCategory: ['staffanpepsie', 'category1', 'staffanpe', 'anpepsie', 'catégorie', 'staffanpepsiecategory'],
    department: ['department', 'departement', 'dept', 'service'],
    position: ['position', 'poste', 'jobtitle', 'fonction'],
    gender: ['gender', 'sexe', 'genre'],
    joiningDate: ['joiningdate', 'datejoining', 'dateembauche', 'hiredate', 'datedentree'],
    contractType: ['contrattype', 'contracttype', 'typecontrat'],
    contractStart: ['contractstart', 'debutcontrat', 'probationend'],
    contractEnd: ['contractend', 'contratend', 'fincontrat', 'contratendtracker'],
    grade: ['grade'],
    email: ['emailadress', 'email', 'emailaddress', 'mail']
  };

  /** Build { field: 0-based column index } from a header row array. */
  function buildColumnMap(headerRow) {
    var map = {};
    var normed = (headerRow || []).map(normalizeHeader);
    Object.keys(HEADER_ALIASES).forEach(function (field) {
      var variants = HEADER_ALIASES[field];
      for (var i = 0; i < normed.length; i++) {
        if (variants.indexOf(normed[i]) !== -1) { map[field] = i; break; }
      }
      // fallback: substring match for a couple of forgiving fields
      if (map[field] === undefined && (field === 'employeeId' || field === 'sourceCategory')) {
        for (var j = 0; j < normed.length; j++) {
          if (variants.some(function (v) { return normed[j].indexOf(v) !== -1; })) { map[field] = j; break; }
        }
      }
    });
    return map;
  }

  /** A sheet is the staff sheet if its header row maps both employeeId and sourceCategory. */
  function isStaffHeader(headerRow) {
    var m = buildColumnMap(headerRow);
    return m.employeeId !== undefined && m.sourceCategory !== undefined;
  }

  /**
   * Pick the staff sheet from a list of { name, headerRow }.
   * Returns { name, headerRow, colMap } or null.
   */
  function detectStaffSheet(sheets) {
    for (var i = 0; i < (sheets || []).length; i++) {
      if (isStaffHeader(sheets[i].headerRow)) {
        return { name: sheets[i].name, headerRow: sheets[i].headerRow, colMap: buildColumnMap(sheets[i].headerRow) };
      }
    }
    return null;
  }

  // ---- Excel date serial -> ISO (YYYY-MM-DD) -------------------------
  function excelSerialToISO(serial) {
    if (serial == null || serial === '') return null;
    if (typeof serial === 'string') {
      // already a date-ish string? return trimmed
      var t = serial.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
      var n = Number(t);
      if (isNaN(n)) return t; // leave as-is (e.g. free text)
      serial = n;
    }
    if (typeof serial !== 'number' || !isFinite(serial)) return null;
    // Excel epoch 1899-12-30 (accounts for the 1900 leap-year bug)
    var ms = Math.round((serial - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + mm + '-' + dd;
  }

  /**
   * Map a raw row (array of cell values) to a normalized employee object.
   * Marks valid=false when the Employee ID is missing (invalid record).
   */
  function parseEmployeeRow(rowValues, colMap) {
    function get(field) {
      var idx = colMap[field];
      if (idx === undefined) return '';
      var v = rowValues[idx];
      return v == null ? '' : v;
    }
    var empId = String(get('employeeId')).trim();
    var last = String(get('lastName')).trim();
    var first = String(get('firstName')).trim();
    var full = String(get('fullName')).trim() || (last + ' ' + first).trim();
    var cat = String(get('sourceCategory')).trim();
    var emp = {
      employeeId: empId,
      fullName: full,
      sourceCategory: cat,
      department: String(get('department')).trim(),
      position: String(get('position')).trim(),
      gender: String(get('gender')).trim(),
      joiningDate: excelSerialToISO(get('joiningDate')),
      contractType: String(get('contractType')).trim(),
      contractStart: excelSerialToISO(get('contractStart')),
      contractEnd: excelSerialToISO(get('contractEnd')),
      email: String(get('email')).trim(),
      employmentStatus: STATUS.ACTIVE,
      accessOverride: ACCESS.AUTO,
      valid: empId !== '' && full !== ''
    };
    return emp;
  }

  /**
   * Import preview diff. existing/incoming are arrays of employee objects.
   * exitedIds: set/array of Employee IDs found on Exit sheets (marked Exited).
   * Returns preview stats + the reconciled rows (not yet persisted).
   */
  function diffImport(existing, incoming, exitedIds) {
    existing = existing || [];
    incoming = incoming || [];
    var exited = {};
    (exitedIds || []).forEach(function (id) { exited[String(id).trim()] = true; });

    var byId = {};
    existing.forEach(function (e) { byId[String(e.employeeId).trim()] = e; });

    var seen = {};
    var stats = {
      totalRows: incoming.length,
      newEmployees: 0, updated: 0, unchanged: 0,
      eligibleAgents: 0, newlyEligible: 0, lostEligibility: 0,
      duplicatesInFile: 0, invalidRows: 0, warnings: []
    };
    var duplicateIds = [];
    var invalidRows = [];
    var rows = [];
    var incomingIds = {};

    incoming.forEach(function (emp, i) {
      if (!emp.valid) {
        stats.invalidRows++;
        invalidRows.push({ index: i, employeeId: emp.employeeId, fullName: emp.fullName });
        return;
      }
      var id = String(emp.employeeId).trim();
      if (seen[id]) {
        stats.duplicatesInFile++;
        duplicateIds.push(id);
        return; // keep the first occurrence only
      }
      seen[id] = true;
      incomingIds[id] = true;

      // apply exit status from Exit sheets
      if (exited[id]) emp.employmentStatus = STATUS.EXITED;

      var prev = byId[id];
      var wasEligible = prev ? computeEligibility(prev).eligible : false;
      // carry over the manual override & status from the existing record
      if (prev) {
        emp.accessOverride = prev.accessOverride || ACCESS.AUTO;
        if (!exited[id] && prev.employmentStatus) emp.employmentStatus = prev.employmentStatus === STATUS.EXITED ? STATUS.ACTIVE : prev.employmentStatus;
      }
      var elig = computeEligibility(emp);
      if (elig.eligible) stats.eligibleAgents += (emp.sourceCategory === CATEGORY.AGENT ? 1 : 0);

      var kind;
      if (!prev) { stats.newEmployees++; kind = 'new'; }
      else {
        var changed = ['fullName', 'sourceCategory', 'department', 'position', 'employmentStatus', 'contractEnd']
          .some(function (f) { return String(prev[f] || '') !== String(emp[f] || ''); });
        if (changed) { stats.updated++; kind = 'updated'; } else { stats.unchanged++; kind = 'unchanged'; }
      }
      if (elig.eligible && !wasEligible) stats.newlyEligible++;
      if (!elig.eligible && wasEligible) stats.lostEligibility++;

      rows.push({ kind: kind, employee: emp, eligibility: elig });
    });

    // employees present before but absent now -> missing from latest import
    var missing = existing.filter(function (e) {
      return !incomingIds[String(e.employeeId).trim()] && !e.archivedAt;
    }).map(function (e) { return e.employeeId; });
    stats.missingFromImport = missing.length;

    return {
      stats: stats,
      rows: rows,
      duplicateIds: duplicateIds,
      invalidRows: invalidRows,
      missingIds: missing
    };
  }

  // ---- Opaque QR token ----------------------------------------------
  function randToken4() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
    var out = '';
    var arr;
    if (root.crypto && root.crypto.getRandomValues) {
      arr = new Uint32Array(4);
      root.crypto.getRandomValues(arr);
    } else {
      arr = [0, 0, 0, 0].map(function () { return Math.floor(Math.random() * 4294967296); });
    }
    for (var i = 0; i < 4; i++) out += alphabet[arr[i] % alphabet.length];
    return out;
  }
  function genQrToken() {
    return 'NTB-CAN-' + randToken4() + '-' + randToken4() + '-' + randToken4();
  }

  // A short, non-reversible reference of a token for display/audit (not the token).
  function tokenReference(token) {
    if (!token) return '';
    var parts = String(token).split('-');
    return parts.length >= 5 ? (parts[0] + '-' + parts[1] + '-••••-••••-' + parts[parts.length - 1]) : token;
  }

  var api = {
    CATEGORY: CATEGORY, ACCESS: ACCESS, STATUS: STATUS,
    SCAN_METHOD: SCAN_METHOD, MEAL_STATUS: MEAL_STATUS, REASON_TEXT: REASON_TEXT,
    computeEligibility: computeEligibility,
    canServeMeal: canServeMeal,
    billableSum: billableSum,
    utilizationRate: utilizationRate,
    normalizeHeader: normalizeHeader,
    buildColumnMap: buildColumnMap,
    isStaffHeader: isStaffHeader,
    detectStaffSheet: detectStaffSheet,
    excelSerialToISO: excelSerialToISO,
    parseEmployeeRow: parseEmployeeRow,
    diffImport: diffImport,
    genQrToken: genQrToken,
    tokenReference: tokenReference
  };

  root.CanteenCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
