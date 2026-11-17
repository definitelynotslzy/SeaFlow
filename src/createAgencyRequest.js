import {
  initializeApp,
  getApps,
  getApp,
  deleteApp
} from "firebase/app";

import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut
} from "firebase/auth";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";

import {
  agencyRequestErrors,
  clean,
  normalizeEmail,
  normalizeMobile,
  normalizeUsername,
  friendlyError
} from "./validators.js";

export async function createAgencyRequest(form) {
  const username = normalizeUsername(form.username);

  // Checked again here, so nothing is saved unless it passes the same rules as the form.
  const problems = Object.values(agencyRequestErrors(form));

  if (problems.length) {
    throw new Error(`Some details are not valid. ${problems[0]}`);
  }

  const email = `${username}@seaflow.example.com`;

  // Secondary app: keeps the current Admin/Staff session unchanged.
  const primaryApp = getApp();

  const secondaryApp = initializeApp(
    primaryApp.options,
    `agency-registration-${Date.now()}`
  );

  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);

  let createdUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      form.password
    );

    createdUser = credential.user;

    const request = {
      agencyName: clean(form.agencyName),
      address: clean(form.address),

      authorized: {
        name: clean(form.authName),
        position: clean(form.authPosition),
        contact: normalizeMobile(form.authContact),
        email: normalizeEmail(form.authEmail)
      },

      billing: {
        name: clean(form.billName),
        position: clean(form.billPosition),
        contact: normalizeMobile(form.billContact),
        email: normalizeEmail(form.billEmail)
      },

      username,
      status: "Pending",
      createdAt: serverTimestamp()
    };

console.log("Registration UID:", createdUser.uid);
console.log("Registration Auth UID:", secondaryAuth.currentUser?.uid);
console.log("Registration document:", request);

try {
  await createdUser.getIdToken(true);

  const testRef = doc(
    secondaryDb,
    "agencyRequests",
    createdUser.uid
  );

  const testSnapshot = await getDoc(testRef);

  console.log("Firestore READ test: SUCCESS");
  console.log("Document exists:", testSnapshot.exists());

} catch (error) {
  console.error("Firestore READ test: FAILED", {
    code: error.code,
    message: error.message
  });
}

try {
  await setDoc(
    doc(secondaryDb, "agencyRequests", createdUser.uid),
    request
  );

  console.log("Agency request saved successfully.");

} catch (error) {
  console.error("Firestore registration error:", {
    code: error.code,
    message: error.message,
    uid: createdUser.uid,
    authUid: secondaryAuth.currentUser?.uid
  });

  throw error;
}

    return createdUser.uid;

  } catch (error) {
    // Avoid leaving an unused Auth account if Firestore fails.
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (cleanupError) {
        console.error(
          "Unable to clean up Agency Auth account:",
          cleanupError
        );
      }
    }

    if (error.code === "auth/email-already-in-use") {
      throw new Error("That username is already taken. Choose another one.");
    }

    throw new Error(
      friendlyError(error, "Unable to submit your registration. Please try again.")
    );

  } finally {
    try {
      await signOut(secondaryAuth);
    } catch {
      // The user may already have been deleted during cleanup.
    }

    await deleteApp(secondaryApp);
  }
}
