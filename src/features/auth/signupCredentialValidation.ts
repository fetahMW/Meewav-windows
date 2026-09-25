export const SIGNUP_PASSWORD_MIN_LENGTH = 6;
export const SIGNUP_USERNAME_MAX_LENGTH = 20;

export type SignupCredentialDraft = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim());
}

export function validateSignupCredentials({
  username,
  email,
  password,
  confirmPassword,
}: SignupCredentialDraft): string | null {
  if (!username.trim()) {
    return "Choisis un nom d'utilisateur.";
  }

  if (Array.from(username.trim()).length > SIGNUP_USERNAME_MAX_LENGTH) {
    return `Le nom d'utilisateur ne peut pas dépasser ${SIGNUP_USERNAME_MAX_LENGTH} caractères.`;
  }

  if (!isValidEmail(email)) {
    return "Saisis une adresse e-mail valide.";
  }

  if (password !== confirmPassword) {
    return "Les mots de passe ne correspondent pas.";
  }

  if (password.length < SIGNUP_PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${SIGNUP_PASSWORD_MIN_LENGTH} caractères.`;
  }

  return null;
}
