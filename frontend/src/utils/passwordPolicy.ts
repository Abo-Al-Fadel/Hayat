// src/utils/passwordPolicy.ts
/**
 * Mirrors the ASP.NET Core Identity password options configured in Program.cs.
 *
 * These used to disagree: the Admin "add user" form accepted 6 characters while the
 * server required 8 plus complexity, so the user got "Password must be at least 6
 * characters" from the form and "at least 8" from the API for the same password.
 *
 * Keep this in sync with `options.Password.*` in Backend/Program.cs.
 */

export const PASSWORD_POLICY = {
  requiredLength: 8,
  requireDigit: true,
  requireLowercase: true,
  requireUppercase: true,
  requireNonAlphanumeric: true,
} as const;

/** Human-readable summary for hint text under a password field. */
export const PASSWORD_HINT =
  "At least 8 characters, including an uppercase letter, a lowercase letter, a number and a symbol.";

/**
 * Validates against the same rules the server enforces.
 * Returns every unmet requirement so the user can fix them in one go rather than
 * discovering them one rejection at a time.
 */
export function validatePassword(password: string): string[] {
  const problems: string[] = [];
  const value = password ?? "";

  if (value.length < PASSWORD_POLICY.requiredLength) {
    problems.push(`be at least ${PASSWORD_POLICY.requiredLength} characters`);
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(value)) {
    problems.push("contain an uppercase letter");
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(value)) {
    problems.push("contain a lowercase letter");
  }
  if (PASSWORD_POLICY.requireDigit && !/[0-9]/.test(value)) {
    problems.push("contain a number");
  }
  if (PASSWORD_POLICY.requireNonAlphanumeric && !/[^a-zA-Z0-9]/.test(value)) {
    problems.push("contain a symbol");
  }

  return problems;
}

/** A single sentence listing everything wrong, or null when the password is acceptable. */
export function describePasswordProblems(password: string): string | null {
  const problems = validatePassword(password);
  if (problems.length === 0) return null;
  if (problems.length === 1) return `Password must ${problems[0]}.`;

  const last = problems[problems.length - 1];
  return `Password must ${problems.slice(0, -1).join(", ")} and ${last}.`;
}
