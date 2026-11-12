/** The owners' change log (Admin → Activity): each audit action as it reads. */
export const ACTION_LABELS: Record<string, string> = {
  'user.created': 'User created',
  'user.updated': 'User updated',
  'user.password_reset': 'Password reset',
  'user.signed_out_everywhere': 'Signed out of other devices',
  'calendar_feeds.rotated': 'Calendar links reset',
  'user.owner_granted': 'Owner access granted',
  'user.owner_removed': 'Owner access removed',
  'membership.added': 'Role added',
  'membership.changed': 'Role changed',
  'membership.removed': 'Role removed',
  // D33 shared devices
  'device.created': 'Shared device created',
  'device.updated': 'Shared device updated',
  'device.deactivated': 'Shared device deactivated',
  'device.reactivated': 'Shared device reactivated',
  'device.deleted': 'Shared device deleted',
  'device.pairing_code': 'Pairing code issued',
  'device.paired': 'Tablet paired',
  'device.revoked': 'Tablet revoked',
  'device.signed_out': 'Tablet signed out',
  // D58 §3.13 (4118 item 7): D37 staff codes
  'staff_code.set': 'Staff code set',
  'staff_code.remove': 'Staff code removed',
  'staff_code.reveal': 'Staff code shown',
}

/** An action's label, or the action itself when there's none. */
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action
