import { signOut } from "firebase/auth";
import { auth } from "./firebase.js";

// Signs out of Firebase for every role (admin, staff and manning agency), so a
// refresh after logging out opens the sign-in page instead of the old account.
export async function logoutUser(dispatch) {
  try {
    await signOut(auth);
    dispatch({ type: "logout" });
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    return false;
  }
}
