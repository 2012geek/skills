/**
 * Validate a review-plan.json object against the 3-phase RBT-style schema
 * documented in agents/planner.md.
 *
 * Returns { valid: bool, errors: string[] }.
 *
 * The validator is hand-written so error messages are actionable for the
 * planner agent — when the planner emits malformed output, the user reading
 * the checkpoint sees clear, specific errors.
 *
 * Key invariants enforced:
 * - Every risk in `risks[]` must appear in `riskCoverage[]` exactly once
 *   (no orphan risks, no coverage without a risk)
 * - `riskCoverage[].focus` must be substantive (>40 chars) — prevents
 *   "verify X" hand-waving
 * - `skippedAgents[].reason` must be substantive (>50 chars) — prevents
 *   "redundant with X" without file-level justification
 * - `nonAgentTasks[].rationale` must be substantive
 */
function validateReviewPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['review-plan must be an object'] };
  }

  // Phase 1: Understand
  if (typeof plan.proceed !== 'boolean') {
    errors.push('field "proceed" (boolean) is required');
  }
  if (typeof plan.summary !== 'string' || plan.summary.trim().length === 0) {
    errors.push('field "summary" (non-empty string) is required');
  } else if (plan.summary.trim().length < 20) {
    errors.push('field "summary" should be 1-3 sentences with intent — current is too short');
  }
  const validChangeTypes = ['code', 'doc', 'mixed', 'config', 'test', 'trivial'];
  if (!validChangeTypes.includes(plan.changeType)) {
    errors.push(`field "changeType" must be one of: ${validChangeTypes.join(', ')}`);
  }

  // Phase 2: Recognize risks
  if (!Array.isArray(plan.risks)) {
    errors.push('field "risks" must be an array of strings (one risk per entry)');
  } else {
    plan.risks.forEach((r, i) => {
      if (typeof r !== 'string' || r.trim().length < 10) {
        errors.push(`risks[${i}] must be a substantive one-sentence risk description (>=10 chars)`);
      }
    });
  }

  // Phase 3: Risk-agent mapping
  if (!Array.isArray(plan.riskCoverage)) {
    errors.push('field "riskCoverage" must be an array');
  } else {
    plan.riskCoverage.forEach((rc, i) => {
      const prefix = `riskCoverage[${i}]`;
      if (!rc || typeof rc !== 'object') {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof rc.risk !== 'string' || rc.risk.trim().length < 10) {
        errors.push(`${prefix}.risk is required (must match a risks[] entry)`);
      }
      if (typeof rc.agent !== 'string' || rc.agent.trim().length < 2) {
        errors.push(`${prefix}.agent is required (template name or custom name)`);
      }
      if (typeof rc.focus !== 'string' || rc.focus.trim().length < 40) {
        errors.push(`${prefix}.focus must be substantive through/fail criteria (>=40 chars). "verify X" is not enough — write what the agent would find if the risk is real, with concrete test scenario.`);
      }
    });

    // Every risk in risks[] must appear in riskCoverage[] exactly once
    if (Array.isArray(plan.risks)) {
      const riskToCoverage = new Map();
      for (const rc of plan.riskCoverage) {
        if (rc && typeof rc.risk === 'string') {
          const key = rc.risk.trim();
          riskToCoverage.set(key, (riskToCoverage.get(key) || 0) + 1);
        }
      }
      for (let i = 0; i < plan.risks.length; i++) {
        const key = (plan.risks[i] || '').trim();
        const count = riskToCoverage.get(key) || 0;
        if (count === 0) {
          errors.push(`risks[${i}] has no coverage in riskCoverage[] — every risk MUST be covered (gap rule). If no template agent fits, create a Class C custom agent.`);
        } else if (count > 1) {
          errors.push(`risks[${i}] is covered ${count} times in riskCoverage[] — each risk should be covered exactly once`);
        }
      }
    }
  }

  // Non-agent tasks (optional but if present must have substantive rationale)
  if (!Array.isArray(plan.nonAgentTasks)) {
    errors.push('field "nonAgentTasks" must be an array (can be empty)');
  } else {
    plan.nonAgentTasks.forEach((t, i) => {
      const prefix = `nonAgentTasks[${i}]`;
      if (typeof t.type !== 'string' || !t.type.trim()) errors.push(`${prefix}.type is required`);
      if (typeof t.command !== 'string' || !t.command.trim()) errors.push(`${prefix}.command is required`);
      if (typeof t.rationale !== 'string' || t.rationale.trim().length < 10) errors.push(`${prefix}.rationale must be substantive`);
    });
  }

  // Skipped agents — reason must be substantive (forces file-level rationale, forbids "redundant with X")
  if (!Array.isArray(plan.skippedAgents)) {
    errors.push('field "skippedAgents" must be an array (can be empty)');
  } else {
    plan.skippedAgents.forEach((s, i) => {
      const prefix = `skippedAgents[${i}]`;
      if (typeof s.name !== 'string' || !s.name.trim()) errors.push(`${prefix}.name is required`);
      if (typeof s.reason !== 'string' || s.reason.trim().length < 50) {
        errors.push(`${prefix}.reason must be substantive (>=50 chars) — cite which files/risks this agent would have covered and which other agent covers them. "redundant with X" is not a valid reason.`);
      }
    });
  }

  // Must have at least one risk+coverage (proceed=true) or proceed=false
  if (plan.proceed === true) {
    if (Array.isArray(plan.risks) && plan.risks.length === 0) {
      errors.push('proceed=true but risks[] is empty — if PR needs no review, set proceed=false; otherwise identify at least one risk');
    }
  }

  // Known-bug relevance — keep the existing working structure
  if (!Array.isArray(plan.knownBugRelevance)) {
    errors.push('field "knownBugRelevance" must be an array');
  } else {
    plan.knownBugRelevance.forEach((k, i) => {
      const prefix = `knownBugRelevance[${i}]`;
      if (typeof k.file !== 'string' || !k.file.trim()) errors.push(`${prefix}.file is required`);
      if (typeof k.relevant !== 'boolean') errors.push(`${prefix}.relevant (boolean) is required`);
      if (typeof k.reason !== 'string' || k.reason.trim().length < 10) errors.push(`${prefix}.reason must be substantive`);
    });
  }

  // openQuestions — only for PR-intent ambiguity
  if (!Array.isArray(plan.openQuestions)) {
    errors.push('field "openQuestions" must be an array (can be empty)');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateReviewPlan };
