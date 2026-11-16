
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase.js";

export function useAgencyRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "agencyRequests"),
      (snapshot) => {
        const items = snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            name: data.agencyName || "",
            address: data.address || "",
            username: data.username || "",
            authorized: data.authorized || {},
            billing: data.billing || {},
            status: data.status || "Pending",
            statusReason: data.statusReason || null,
            requestedMs:
              data.createdAt?.toMillis?.() || Date.now()
          };
        });

        setRequests(items);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Unable to load agency requests:", err);
        setError("Unable to load agency requests.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { requests, loading, error };
}
