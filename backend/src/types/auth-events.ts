export enum AuthEventAction {
  registration = 'registration',
  login = 'login',
  logout = 'logout',
  refresh_rotate = 'refresh_rotate',
  session_revoke = 'session_revoke',
  token_expired = 'token_expired',
  token_rejected = 'token_rejected',
  token_reuse = 'token_reuse',
}

export enum ActorType {
  owner = 'owner',
  admin = 'admin',
  system = 'system',
}
