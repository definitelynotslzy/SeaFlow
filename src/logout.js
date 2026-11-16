import { signOut } from "firebase/auth";
import { auth } from "./firebase.js";

export async function logoutUser(dispatch, role) {
  try {
    if (role === "admin" || role === "staff") {
      await signOut(auth);
      console.log("Firebase user after logout:", auth.currentUser);
    }

    dispatch({ type: "logout" });
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    return false;
  }
}