/** The states of the login of the person. Only states worth going on from. */
export const UserLoginState = {
  UNDEFINED: 'undefined',
  SERVER_URL_IDENTIFIED: 'server_url_identified',
  ACCESS_TOKEN_RECEIVED: 'access_token_received',
  USER_PROFILE_RECEIVED: 'user_profile_received',
  ACCESS_TOKEN_REMEMBERED: 'access_token_remembered',
} as const;

export type UserLoginStateValue = (typeof UserLoginState)[keyof typeof UserLoginState];
