// The signed-in user's own account, shown on /account. Profile fields stay administrator-managed.
export interface AccountRole { role: string; identifier: string | null }
export interface AccountProfile {
  id: string; name: string; email: string; createdAt: string;
  roles: AccountRole[]; activeSessions: number;
}
export interface PasswordChangeResult { sessionsRevoked: number }
