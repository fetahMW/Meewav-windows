import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SIGNUP_PASSWORD_MIN_LENGTH,
  SIGNUP_USERNAME_MAX_LENGTH,
  validateSignupCredentials,
} from "../../src/features/auth/signupCredentialValidation.ts";

const validDraft = {
  username: "NouveauProfil",
  email: "nouveau.profil@example.com",
  password: "secret42",
  confirmPassword: "secret42",
};

test("signup credential validation accepts a complete matching draft", () => {
  assert.equal(validateSignupCredentials(validDraft), null);
  assert.equal(SIGNUP_PASSWORD_MIN_LENGTH, 6);
  assert.equal(SIGNUP_USERNAME_MAX_LENGTH, 20);
});

test("signup credential validation caps usernames without rejecting the boundary", () => {
  assert.equal(
    validateSignupCredentials({
      ...validDraft,
      username: "a".repeat(SIGNUP_USERNAME_MAX_LENGTH),
    }),
    null,
  );
  assert.equal(
    validateSignupCredentials({
      ...validDraft,
      username: "a".repeat(SIGNUP_USERNAME_MAX_LENGTH + 1),
    }),
    "Le nom d'utilisateur ne peut pas dépasser 20 caractères.",
  );
});

test("signup credential validation rejects two different passwords", () => {
  assert.equal(
    validateSignupCredentials({ ...validDraft, confirmPassword: "different42" }),
    "Les mots de passe ne correspondent pas.",
  );
});

test("signup credential validation rejects incomplete or weak credentials", async (t) => {
  const cases = [
    {
      name: "blank username",
      draft: { ...validDraft, username: "   " },
      expected: "Choisis un nom d'utilisateur.",
    },
    {
      name: "invalid email",
      draft: { ...validDraft, email: "email-invalide" },
      expected: "Saisis une adresse e-mail valide.",
    },
    {
      name: "short password",
      draft: { ...validDraft, password: "12345", confirmPassword: "12345" },
      expected: "Le mot de passe doit contenir au moins 6 caractères.",
    },
  ];

  for (const { name, draft, expected } of cases) {
    await t.test(name, () => {
      assert.equal(validateSignupCredentials(draft), expected);
    });
  }
});

test("AuthPage enforces a fresh authenticated owner before entering the globe", async () => {
  const source = await readFile(new URL("../../src/pages/AuthPage.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("bypassValidation"), false);
  assert.ok(
    source.match(/validateSignupCredentials\s*\(\s*\{/gu)?.length >= 3,
    "credentials must be checked for button state, step 2 and final submit",
  );
  assert.match(
    source,
    /handleSignupTransition[\s\S]*?supabase\.auth\.signOut\(\{ scope: "local" \}\)[\s\S]*?clearMusicSceneOnboardingPreview\(\)[\s\S]*?resetSignupDraft\(\)/u,
  );
  assert.match(source, /const \{ data: sessionData, error: sessionError \} = await supabase\.auth\.getSession\(\)/u);
  assert.match(source, /activeSession\.user\.id !== data\.user\.id/u);
  assert.match(source, /createOnboardingPayload\(data\.user\.id\)/u);
  assert.match(source, /\.rpc\("is_profile_username_available"/u);
  assert.match(source, /maxLength=\{SIGNUP_USERNAME_MAX_LENGTH\}/u);
  assert.equal(source.includes('.from("profiles")\n        .select("email")'), false);
});
