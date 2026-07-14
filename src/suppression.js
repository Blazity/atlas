import { findingCodeSeverity, isSuppressibleFindingCode } from "./findings.js";

export function applySuppression(findings, config) {
  const suppressedCodes = Array.isArray(config.doctor?.suppress)
    ? [...new Set(config.doctor.suppress)]
    : [];
  const validationFindings = suppressionValidationFindings(suppressedCodes);
  const suppressibleCodes = new Set(suppressedCodes.filter(isSuppressibleFindingCode));
  const visible = [];
  const suppressed = [];

  for (const finding of findings) {
    if (suppressibleCodes.has(finding.code) && finding.severity !== "manual") {
      suppressed.push(finding);
    } else {
      visible.push(finding);
    }
  }

  return { findings: [...validationFindings, ...visible], suppressed };
}

function suppressionValidationFindings(codes) {
  const findings = [];
  for (const code of codes) {
    const severity = findingCodeSeverity(code);
    if (severity === null) {
      findings.push(manualFinding("invalid-suppression", `doctor.suppress contains unknown finding code ${code}`));
    } else if (severity === "manual") {
      findings.push(manualFinding("invalid-suppression", `doctor.suppress cannot include manual finding code ${code}`));
    }
  }
  return findings;
}

function manualFinding(code, message) {
  return { code, message, severity: "manual", fixable: false };
}
