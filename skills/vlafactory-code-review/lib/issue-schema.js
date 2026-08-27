'use strict';

// Issue schema validator — used by step5_ValidateIssues to reject issues missing
// required fields *before* dedup/threshold filtering. Without this gate, agents
// that omit `confidence` or `line` get silently dropped by `step6_FilterIssues`
// (`undefined >= 80` is false; `file:undefined:type` collides in dedup keys),
// so 5 valid findings can become "0 issues" with no signal.
//
// Design: fail loud. Missing field = reject with a named reason, not silent drop.
// The threshold filter (step6) is a *separate* concern from schema validity.

const REQUIRED_STRING_FIELDS = ['file', 'type', 'severity', 'title', 'description'];
const REQUIRED_FIX_SUBFIELDS = ['code', 'explanation'];
const VALID_SEVERITIES = ['critical', 'error', 'warning'];

function isString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isInteger(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateIssue(issue) {
  const errors = [];

  if (!isObject(issue)) {
    return { valid: false, errors: ['issue must be an object'], issue: null };
  }

  // Required string fields
  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isString(issue[field])) {
      errors.push(`missing or non-string: ${field}`);
    }
  }

  // line: required integer >= 1
  if (!isInteger(issue.line)) {
    if (issue.line === undefined || issue.line === null) {
      errors.push('missing: line');
    } else {
      errors.push(`non-integer line: ${JSON.stringify(issue.line)}`);
    }
  } else if (issue.line < 1) {
    errors.push(`line must be >= 1, got ${issue.line}`);
  }

  // confidence: required integer 0-100
  if (!isInteger(issue.confidence)) {
    if (issue.confidence === undefined || issue.confidence === null) {
      errors.push('missing: confidence');
    } else {
      errors.push(`non-integer confidence: ${JSON.stringify(issue.confidence)}`);
    }
  } else if (issue.confidence < 0 || issue.confidence > 100) {
    errors.push(`confidence out of [0,100]: ${issue.confidence}`);
  }

  // severity: must be in known set
  if (isString(issue.severity) && !VALID_SEVERITIES.includes(issue.severity)) {
    errors.push(`unknown severity "${issue.severity}" (expected one of ${VALID_SEVERITIES.join(', ')})`);
  }

  // contextCode and fix are optional presentation aids. Requiring the model to
  // synthesize them for every finding wastes review budget and encourages
  // invented patches. When present they still must be well formed.
  if (issue.contextCode !== undefined && !isString(issue.contextCode)) {
    errors.push('contextCode must be a non-empty string when provided');
  }

  if (issue.fix !== undefined && issue.fix !== null) {
    if (!isObject(issue.fix)) {
      errors.push('fix must be an object');
    } else {
      for (const sub of REQUIRED_FIX_SUBFIELDS) {
        if (!isString(issue.fix[sub])) {
          errors.push(`fix missing or non-string: ${sub}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    issue: errors.length === 0 ? issue : null,
  };
}

// Validate an array of issues, splitting into accepted and rejected buckets.
// Each rejected entry carries the original issue + errors so the preview can
// surface "agent X omitted confidence" instead of silently losing findings.
function validateIssues(issues) {
  const accepted = [];
  const rejectedInvalid = [];

  if (!Array.isArray(issues)) {
    return { accepted: [], rejectedInvalid: [{ issue: null, errors: ['issues is not an array'] }] };
  }

  for (const issue of issues) {
    const result = validateIssue(issue);
    if (result.valid) {
      accepted.push(issue);
    } else {
      rejectedInvalid.push({ issue, errors: result.errors });
    }
  }

  return { accepted, rejectedInvalid };
}

module.exports = { validateIssue, validateIssues, REQUIRED_STRING_FIELDS, VALID_SEVERITIES };
