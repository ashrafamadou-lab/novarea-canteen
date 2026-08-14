/* =====================================================================
   Novarea Canteen — TEST SUITE (runs in the browser, real assertions)
   Open the app, go to the "Tests" page (HR Admin), click "Run tests".
   window.CanteenTests.run() returns { total, passed, failed, results }.
   ===================================================================== */
(function (root) {
  'use strict';
  var C = root.CanteenCore;

  function run() {
    var results = [];
    function ok(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || '' }); }
    function eq(name, a, b) { ok(name, a === b, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

    // ---- 19.2 Eligibility matrix ----
    var E = function (o) { return C.computeEligibility(o).eligible; };
    var RC = function (o) { return C.computeEligibility(o).reasonCode; };
    ok('Agent + Active + AUTO = Eligible', E({ sourceCategory: 'Agent', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }));
    ok('ANPE + Active + AUTO = Not Eligible', !E({ sourceCategory: 'ANPE', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }));
    ok('Staff + Active + AUTO = Not Eligible', !E({ sourceCategory: 'Staff', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }));
    ok('PSIE + Active + AUTO = Not Eligible', !E({ sourceCategory: 'PSIE', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }));
    ok('Agent + Exited = Not Eligible', !E({ sourceCategory: 'Agent', employmentStatus: 'Exited', accessOverride: 'AUTO', valid: true }));
    ok('Agent + BLOCKED = Not Eligible', !E({ sourceCategory: 'Agent', employmentStatus: 'Active', accessOverride: 'BLOCKED', valid: true }));
    ok('Non-Agent + ALLOWED + Active = Eligible', E({ sourceCategory: 'ANPE', employmentStatus: 'Active', accessOverride: 'ALLOWED', valid: true }));
    ok('ALLOWED but Exited = Not Eligible', !E({ sourceCategory: 'Agent', employmentStatus: 'Exited', accessOverride: 'ALLOWED', valid: true }));
    ok('Invalid record = Not Eligible', !E({ sourceCategory: 'Agent', employmentStatus: 'Active', accessOverride: 'AUTO', valid: false }));
    eq('Reason code for Agent active', RC({ sourceCategory: 'Agent', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }), 'ELIGIBLE_AGENT');
    eq('Reason code for ANPE', RC({ sourceCategory: 'ANPE', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }), 'NOT_AGENT');
    eq('Reason code for blocked', RC({ sourceCategory: 'Agent', employmentStatus: 'Active', accessOverride: 'BLOCKED', valid: true }), 'ACCESS_BLOCKED');

    // ---- 19.3 Scan / one-meal rule ----
    var svc = 'lunch';
    var day = '2026-08-06';
    var recs = [];
    var r1 = C.canServeMeal(recs, '250015', day, svc);
    ok('First scan of eligible Agent accepted', r1.allowed);
    recs.push({ employeeId: '250015', mealDate: day, mealServiceId: svc, scannedAt: '2026-08-06T12:01:00Z', status: 'VALID', unitPrice: 1000 });
    var r2 = C.canServeMeal(recs, '250015', day, svc);
    ok('Second scan same day/service refused', !r2.allowed);
    ok('Refusal exposes first passage time', r2.firstRecord && r2.firstRecord.scannedAt === '2026-08-06T12:01:00Z');
    var r3 = C.canServeMeal(recs, '250015', day, 'dinner');
    ok('Same employee allowed for a different service', r3.allowed);
    var r4 = C.canServeMeal(recs, '250015', '2026-08-07', svc);
    ok('Same employee allowed the next day', r4.allowed);
    var recsCancelled = [{ employeeId: '250015', mealDate: day, mealServiceId: svc, scannedAt: '2026-08-06T12:01:00Z', status: 'CANCELLED', unitPrice: 1000 }];
    ok('Cancelled meal frees the slot again', C.canServeMeal(recsCancelled, '250015', day, svc).allowed);

    // ---- 19.5 Reports / billing ----
    var billRecs = [
      { status: 'VALID', unitPrice: 1000 },
      { status: 'VALID', unitPrice: 1000 },
      { status: 'CANCELLED', unitPrice: 1000 },
      { status: 'VALID', unitPrice: 1200 } // price changed later; historical price preserved
    ];
    eq('Billable excludes cancelled & keeps historical price', C.billableSum(billRecs), 3200);
    eq('Utilization rate 30/60 = 50%', C.utilizationRate(60, 30), 50);
    eq('Utilization rate guards div-by-zero', C.utilizationRate(0, 0), 0);

    // ---- Import: header detection & mapping ----
    var header = ['SN', 'Employee ID', 'Staff/ANPE/PSIE', 'National/Expat', 'Last Name', 'First Name', 'Full Name', 'Gender', 'Grade', 'Category', 'Birth Date', 'Nationality', 'Civil Statuts', 'ID Numbers', 'Expiry date', 'Phone numbers', 'Position', 'Department', 'Reporting manager', 'Joining Date', 'Contrat Type', 'Prob months', 'Probation end', 'Contract duration(Year)', 'Contract end'];
    ok('Staff header is detected', C.isStaffHeader(header));
    var cmap = C.buildColumnMap(header);
    eq('Employee ID column mapped', cmap.employeeId, 1);
    eq('Staff/ANPE/PSIE column mapped', cmap.sourceCategory, 2);
    eq('Department column mapped', cmap.department, 17);
    ok('detectStaffSheet picks the right sheet', C.detectStaffSheet([
      { name: 'Dashboard HR', headerRow: ['KPI', 'Value'] },
      { name: 'Staff list', headerRow: header }
    ]).name === 'Staff list');

    // ---- Import: row parsing rejects missing Employee ID ----
    var goodRow = []; goodRow[1] = '250015'; goodRow[2] = 'Agent'; goodRow[6] = 'DOE John'; goodRow[17] = 'Weaving';
    var emp = C.parseEmployeeRow(goodRow, cmap);
    ok('Valid row parses as valid', emp.valid && emp.employeeId === '250015' && emp.sourceCategory === 'Agent');
    var badRow = []; badRow[2] = 'Agent'; badRow[6] = 'NO ID';
    ok('Row without Employee ID is invalid', C.parseEmployeeRow(badRow, cmap).valid === false);

    // ---- Import: dedup + newly-eligible on category change (ANPE -> Agent) ----
    var existing = [{ employeeId: '250015', fullName: 'DOE John', sourceCategory: 'ANPE', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }];
    var incoming = [
      C.parseEmployeeRow((function () { var r = []; r[1] = '250015'; r[2] = 'Agent'; r[6] = 'DOE John'; r[17] = 'Weaving'; return r; })(), cmap),
      C.parseEmployeeRow((function () { var r = []; r[1] = '250016'; r[2] = 'Agent'; r[6] = 'ROE Jane'; r[17] = 'Dyeing'; return r; })(), cmap),
      C.parseEmployeeRow((function () { var r = []; r[1] = '250016'; r[2] = 'Agent'; r[6] = 'ROE Jane DUP'; r[17] = 'Dyeing'; return r; })(), cmap)
    ];
    var diff = C.diffImport(existing, incoming, []);
    eq('Duplicate Employee ID detected in file', diff.stats.duplicatesInFile, 1);
    eq('One new employee', diff.stats.newEmployees, 1);
    ok('ANPE->Agent becomes newly eligible', diff.stats.newlyEligible >= 1);

    // ---- Import: Exit sheet marks employee exited (loses eligibility) ----
    var diff2 = C.diffImport(
      [{ employeeId: '250015', fullName: 'DOE John', sourceCategory: 'Agent', employmentStatus: 'Active', accessOverride: 'AUTO', valid: true }],
      [C.parseEmployeeRow((function () { var r = []; r[1] = '250015'; r[2] = 'Agent'; r[6] = 'DOE John'; r[17] = 'Weaving'; return r; })(), cmap)],
      ['250015']
    );
    ok('Employee on Exit sheet loses eligibility', diff2.stats.lostEligibility >= 1);

    // ---- Excel serial date conversion ----
    eq('Excel serial 45608 -> 2024-11-12', C.excelSerialToISO(45608), '2024-11-12');
    eq('ISO passthrough', C.excelSerialToISO('2026-08-06'), '2026-08-06');
    ok('Empty date -> null', C.excelSerialToISO('') === null);

    // ---- QR token shape ----
    var tok = C.genQrToken();
    ok('QR token has NTB-CAN prefix & 5 groups', /^NTB-CAN-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(tok));
    ok('Two tokens differ', C.genQrToken() !== C.genQrToken());
    ok('Token reference hides the middle', C.tokenReference(tok).indexOf('••••') !== -1);

    var passed = results.filter(function (r) { return r.pass; }).length;
    return { total: results.length, passed: passed, failed: results.length - passed, results: results };
  }

  root.CanteenTests = { run: run };
})(typeof self !== 'undefined' ? self : this);
