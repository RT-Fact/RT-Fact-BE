export interface AuthenticatedUser {
  userId: string;
  email: string;
  isGuest: false;
}

export interface GuestUser {
  ip: string;
  isGuest: true;
}

export interface RequestWithUser {
  user: AuthenticatedUser | GuestUser;
}
