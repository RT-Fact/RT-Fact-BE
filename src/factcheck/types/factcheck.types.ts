export interface AuthenticatedUser {
  userId: string;
  email: string;
  isGuest: false;
}

export interface GuestUser {
  ip: string;
  isGuest: true;
}

export type RequestUser = AuthenticatedUser | GuestUser;

export interface RequestWithUser {
  user: RequestUser;
}
