export interface UserData {
  id: number;
  username?: string;
  isAdmin?: boolean;
  expires?: Date;
  displayName?: string;
}

export interface UserRO {
  user: UserData;
}

export interface UserRequestData {
  id: number;
  username: string | null;
  exp: number;
  admin: boolean;
}
