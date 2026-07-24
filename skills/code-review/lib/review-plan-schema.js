/**
 * Validate a review-plan.json object against the schema documented in
 * docs/plans/2026-07-24-dynamic-code-review-design.md (Section 1).
 *
 * Returns { valid: bool, errors: string[] }.
 *
 * The validator is intentionally hand-written (not a JSON-schema library) so
 * the error messages are actionable for the planner agent — when the planner
 * emits malformed output, the user reading the checkpoint sees clear errors.
 */
function validateReviewPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['review-plan must be an object'] };
  }

  if (typeof plan.proceed !== 'boolean') {
    errors.push('field "proceed" (boolean) is required');
  }
  if (typeof plan.summary !== 'string' || plan.summary.trim().length === 0) {
    errors.push('field "summary" (non-empty string) is required');
  }
  const validChangeTypes = ['code', 'doc', 'mixed', 'config', 'test', 'trivial'];
  if (!validChangeTypes.includes(plan.changeType)) {
    errors.push(`field "changeType" must be one of: ${validChangeTypes.join(', ')}`);
  }
  if (!Array.isArray(plan.riskAreas)) {
    errors.push('field "riskAreas" must be an array of strings');
  }

  const rp = plan.reviewPlan;
  if (!rp || typeof rp !== 'object') {
    errors.push('field "reviewPlan" (object) is required');
    return { valid: false, errors };
  }
  if (!Array.isArray(rp.agents)) {
    errors.push('field "reviewPlan.agents" must be an array');
  } else {
    rp.agents.forEach((a, i) => {
      const prefix = `reviewPlan.agents[${i}]`;
      if (typeof a.name !== 'string' || !a.name.trim()) errors.push(`${prefix}.name is required`);
      if (typeof a.model !== 'string' || !a.name.trim()) errors.push(`${prefix}.model is required`);
      if (!Array.isArray(a.focusAreas)) errors.push(`${prefix}.focusAreas must be an array`);
      if (!Array.isArray(a.injectKnownBugs)) errors.push(`${prefix}.injectKnownBugs must be an array`);
      if (typeof a.rationale !== 'string' || !a.rationale.trim()) errors.push(`${prefix}.rationale is required`);
    });
  }
  if (!Array.isArray(rp.nonAgentTasks)) {
    errors.push('field "reviewPlan.nonAgentTasks" must be an array');
  } else {
    rp.nonAgentTasks.forEach((t, i) => {
      const prefix = `reviewPlan.nonAgentTasks[${i}]`;
      if (typeof t.type !== 'string' || !t.type.trim()) errors.push(`${prefix}.type is required`);
      if (typeof t.rationale !== 'string' || !t.rationale.trim()) errors.push(`${prefix}.rationale is required`);
    });
  }
  if (!Array.isArray(rp.skippedAgents)) {
    errors.push('field "reviewPlan.skippedAgents" must be an array');
  } else {
    rp.skippedAgents.forEach((s, i) => {
      const prefix = `reviewPlan.skippedAgents[${i}]`;
      if (typeof s.name !== 'string' || !s.name.trim()) errors.push(`${prefix}.name is required`);
      if (typeof s.reason !== 'string' || !s.reason.trim()) errors.push(`${prefix}.reason is required`);
    });
  }

  if (rp && Array.isArray(rp.agents) && Array.isArray(rp.nonAgentTasks)) {
    if (rp.agents.length === 0 && rp.nonAgentTasks.length === 0) {
      errors.push('reviewPlan must contain at least one agent or nonAgentTask (if the PR needs no review, set proceed: false instead)');
    }
  }

  if (!Array.isArray(plan.knownBugRelevance)) {
    errors.push('field "knownBugRelevance" must be an array');
  } else {
    plan.knownBugRelevance.forEach((k, i) => {
      const prefix = `knownBugRelevance[${i}]`;
      if (typeof k.file !== 'string' || !k.file.trim()) errors.push(`${prefix}.file is required`);
      if (typeof k.relevant !== 'boolean') errors.push(`${prefix}.relevant (boolean) is required`);
      if (typeof k.reason !== 'string' || !k.reason.trim()) errors.push(`${prefix}.reason is required`);
    });
  }
  if (typeof plan.confidence !== 'number' || plan.confidence < 0 || plan.confidence > 100) {
    errors.push('field "confidence" must be a number in [0, 100]');
  }
  if (!Array.isArray(plan.openQuestions)) {
    errors.push('field "openQuestions" must be an array (can be empty)');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateReviewPlan };
