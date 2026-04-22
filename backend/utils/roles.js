export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isUserRole(role) {
  return normalizeRole(role) === "user";
}

export function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === "admin" || r === "super_admin";
}

export function isOrganizationAdminRole(role) {
  return normalizeRole(role) === "admin";
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === "super_admin";
}

export function canPublish(role) {
  return isAdminRole(role);
}

export function hasGlobalManagementScope(role) {
  return isSuperAdminRole(role);
}
