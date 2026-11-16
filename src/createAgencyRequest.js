
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

export async function createAgencyRequest(form) {
  const username = form.username.trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error(
      "Username must be 3–50 characters and contain only letters, numbers, dots, underscores, or hyphens."
    );
  }

  if (!form.password || form.password.length < 8) {
    throw new Error("Password must contain at least 8 characters.");
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
      agencyName: form.agencyName.trim(),
      address: form.address.trim(),

      authorized: {
        name: form.authName.trim(),
        position: form.authPosition.trim(),
        contact: form.authContact.trim(),
        email: form.authEmail.trim()
      },

      billing: {
        name: form.billName.trim(),
        position: form.billPosition.trim(),
        contact: form.billContact.trim(),
        email: form.billEmail.trim()
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
      throw new Error("That username is already registered.");
    }

    throw error;

  } finally {
    try {
      await signOut(secondaryAuth);
    } catch {
      // The user may already have been deleted during cleanup.
    }

    await deleteApp(secondaryApp);
  }
}
