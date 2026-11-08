// User-facing messages for the error codes thrown by authorize() in src/lib/auth.js.
// Kept in its own file so the client login form doesn't import server-only code.
export const AUTH_ERRORS = {
  MISSING: "Enter your username and password.",
  INVALID_CREDENTIALS: "Wrong username or password.",
  ACCOUNT_INACTIVE: "This account is deactivated. Please contact the owner.",
  TOO_MANY_ATTEMPTS: "Too many failed attempts. Try again in 15 minutes.",
};
