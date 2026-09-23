"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

let emulatorConnected = false;

function portalAuth() {
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
  const auth = getAuth(app);
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;

  if (emulatorHost && !emulatorConnected) {
    connectAuthEmulator(auth, `http://${emulatorHost}`, {
      disableWarnings: true,
    });
    emulatorConnected = true;
  }

  return auth;
}

export async function signInWithPortalIdentity(
  email: string,
  password: string,
) {
  const credential = await signInWithEmailAndPassword(
    portalAuth(),
    email,
    password,
  );

  return credential.user.getIdToken(true);
}

export async function signOutPortalIdentity() {
  await signOut(portalAuth());
}

export async function createPortalIdentityForInvitation(
  email: string,
  password: string,
  continueUrl: string,
) {
  const credential = await createUserWithEmailAndPassword(
    portalAuth(),
    email,
    password,
  );

  await sendEmailVerification(credential.user, { url: continueUrl });
}

export async function signInForInvitation(
  email: string,
  password: string,
  continueUrl: string,
) {
  const credential = await signInWithEmailAndPassword(
    portalAuth(),
    email,
    password,
  );

  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user, { url: continueUrl });
    return { emailVerified: false, idToken: "" };
  }

  return {
    emailVerified: true,
    idToken: await credential.user.getIdToken(true),
  };
}
