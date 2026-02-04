import { User } from '~/domains/user/user.model';

export const LOCAL_STORAGE_AUTH_USER_KEY = 'logged-in-user-portal';
const LOCAL_STORAGE_RETURN_URL = 'return-url-portal';

export type LocalStorageUser = Pick<User, 'expires' | 'isAdmin' | 'username'>;

export const setUserInLocalStorage = (user: Omit<User, 'id'>): void => {
  const userToStore: LocalStorageUser = {
    username: user.username,
    isAdmin: user.isAdmin,
    expires: user.expires,
  };

  localStorage.setItem(
    LOCAL_STORAGE_AUTH_USER_KEY,
    JSON.stringify(userToStore),
  );
};

export const getUserFromLocalStorage = (): LocalStorageUser | null => {
  const rawUser = localStorage.getItem(LOCAL_STORAGE_AUTH_USER_KEY);

  if (!rawUser) {
    return null;
  }

  let user: LocalStorageUser;

  try {
    user = JSON.parse(rawUser) as LocalStorageUser;
  } catch {
    console.warn('AuthService: Invalid token');
    return null;
  }

  return user;
};

export const setReturnUrlInLocalStorage = (returnUrl: string): void => {
  localStorage.setItem(LOCAL_STORAGE_RETURN_URL, returnUrl);
};

export const getReturnUrlFromLocalStorage = (): null | string =>
  localStorage.getItem(LOCAL_STORAGE_RETURN_URL);
