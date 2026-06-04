export function isDevSpaceStaff(role?: string | null) {
  return role === 'devspace_admin' || role === 'devspace_member'
}

export function isDevSpaceAdmin(role?: string | null) {
  return role === 'devspace_admin'
}

export function canAccessAdmin(role?: string | null) {
  return isDevSpaceStaff(role)
}

export function canAccessPortal(role?: string | null) {
  return Boolean(role)
}