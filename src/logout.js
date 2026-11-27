import { signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import { writeAudit } from "./auditLog.js";
import { END_REASON, endMyBreakGlass } from "./accessSettings.js";

/**
 * Signs out of Firebase for every role (admin, staff and manning agency), so a
 * refresh after logging out opens the sign-in page instead of the old account.
 *
 * For clinic staff, any break-glass access still open is ended first, and each
 * one is written to the audit log while the user is still signed in.
 * `how`: END_REASON.signedOut (pressed Log out) or END_REASON.timedOut (inactivity).
 */
export async function logoutUser(dispatch, state, how = END_REASON.signedOut) {
  const session = state?.session;
  try {
    if (session?.role === "staff") {
      try {
        const ended = await endMyBreakGlass(how);
        await Promise.all(ended.map((ref) => writeAudit({
          who: session.name,
          role: "Clinic Staff",
          actorType: "clinic",
          action: "Ended break-glass",
          ref,
          note: how,
          network: state.insideNetwork ? "Inside clinic network" : "Outside clinic network",
        })));
      } catch (error) {
        // Never keep someone signed in because of this; the access still ends at its time limit.
        console.error("Unable to end break-glass access:", error);
      }
    }
    await signOut(auth);
    dispatch({ type: "logout" });
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    return false;
  }
}
