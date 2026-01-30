/**
 * See the README.md-file in this folder for more information.
 */
// The value of this variable will be replaced at build-time with the proper environment-value.
const API_URL = `NG_URL_API_SERVICE`;

const redirectToLogin = () => {
  window.location.assign('/en-GB/login?' + Date.now());
};

window.setTimeout(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();

  await window
    .fetch(`${API_URL}/users/logout`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-IBF-interface': 'portal', // See: services/api-service/src/shared/enum/interface-names.enum.ts
      },
      method: 'POST',
      mode: 'cors',
    })
    .finally(() => {
      redirectToLogin();
    });
}, 16);
