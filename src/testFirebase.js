
import { auth, db } from "./firebase.js";

export function testFirebase() {
  console.log("Firebase initialized successfully!");
  console.log("Firebase project:", auth.app.options.projectId);
  console.log("Firestore instance:", db.app.name);
}
