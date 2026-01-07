export interface AuthenticatedUser {
  userId: string;
  email: string;
  isGuest: false;
}

export interface GuestUser {
  ip: string;
  isGuest: true;
}
