// ============================================================================
// BOBY CREATOR STUDIO 2.0 — FIREBASE REALTIME ENGINE & AUTHENTICATION MODULE
// File: firebase.js
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Konfigurasi Resmi Firebase Proyek: boby-creator-studio
const firebaseConfig = {
  apiKey: "AIzaSyBts_aqGp_1EosViZfHink-eJDpV9QAijw",
  authDomain: "boby-creator-studio.firebaseapp.com",
  projectId: "boby-creator-studio",
  storageBucket: "boby-creator-studio.firebasestorage.app",
  messagingSenderId: "133686903556",
  appId: "1:133686903556:web:ff7cf35c3b02fb95860651",
  measurementId: "G-YDEGTXNBT"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const dbFirestore = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Daftar koleksi resmi di dalam Workspace 2.0
export const COLLECTIONS = [
  "clients",
  "accounts",
  "contents",
  "analytics",
  "affiliates",
  "tasks",
  "transactions",
  "assets",
  "competitors"
];

// Penyimpanan listener aktif agar bisa dihentikan saat logout (hemat kuota baca)
let activeUnsubscribers = [];
let currentWorkspaceId = null;

// ============================================================================
// 1. MANAJEMEN AUTENTIKASI (LOGIN, REGISTER, GOOGLE LOGIN, LOGOUT)
// ============================================================================

export function subscribeToAuthChanges(onUserAuthenticated, onUserLoggedOut) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentWorkspaceId = `ws_${user.uid}`;
      await ensureUserAndWorkspaceProfile(user);
      onUserAuthenticated(user, currentWorkspaceId);
    } else {
      stopAllRealtimeListeners();
      currentWorkspaceId = null;
      onUserLoggedOut();
    }
  });
}

async function ensureUserAndWorkspaceProfile(user) {
  try {
    const userRef = doc(dbFirestore, "users", user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "Boby Anggara",
      lastLoginAt: serverTimestamp()
    }, { merge: true });

    const wsRef = doc(dbFirestore, "workspaces", `ws_${user.uid}`);
    await setDoc(wsRef, {
      workspaceId: `ws_${user.uid}`,
      ownerUid: user.uid,
      ownerEmail: user.email || "",
      appName: "BOBY CREATOR STUDIO 2.0",
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Gagal memperbarui metadata profil awal:", err);
  }
}

export async function loginWithEmail(email, password) {
  return await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function registerWithEmail(fullName, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (fullName) {
    await updateProfile(cred.user, { displayName: fullName.trim() });
  }
  return cred;
}

export async function loginWithGoogle() {
  return await signInWithPopup(auth, googleProvider);
}

export async function logoutUser() {
  stopAllRealtimeListeners();
  return await signOut(auth);
}

// ============================================================================
// 2. REALTIME DATABASE LISTENER (onSnapshot) ANTAR PERANGKAT
// ============================================================================

export function startRealtimeListeners(workspaceId, onCollectionUpdate, onSyncStatusChange) {
  stopAllRealtimeListeners();

  if (!navigator.onLine) {
    onSyncStatusChange("offline", "Mode Offline — Menunggu Koneksi Internet");
  } else {
    onSyncStatusChange("syncing", "Menghubungkan ke Cloud Firestore...");
  }

  let initializedCount = 0;

  COLLECTIONS.forEach((colName) => {
    const colRef = collection(dbFirestore, "workspaces", workspaceId, colName);

    const unsubscribe = onSnapshot(
      colRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Urutkan terbaru di atas berdasarkan createdAt atau tanggal
        items.sort((a, b) => {
          const timeA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const timeB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        onCollectionUpdate(colName, items);

        // Periksa status sinkronisasi nyata dari metadata Firestore
        const hasPending = snapshot.metadata.hasPendingWrites;
        const fromCache = snapshot.metadata.fromCache;

        initializedCount++;
        if (!navigator.onLine) {
          onSyncStatusChange("offline", "Offline — Perubahan disimpan di antrean lokal");
        } else if (hasPending) {
          onSyncStatusChange("saving", "Menyimpan perubahan ke Cloud...");
        } else if (fromCache && initializedCount < COLLECTIONS.length) {
          onSyncStatusChange("syncing", "Memuat data dari Cloud...");
        } else {
          onSyncStatusChange("saved", "Cloud Terhubung & Tersinkronisasi Realtime");
        }
      },
      (error) => {
        console.error(`Error Realtime Listener pada koleksi [${colName}]:`, error);
        onSyncStatusChange("error", `Gagal sinkronisasi (${error.code || "Error"})`);
      }
    );

    activeUnsubscribers.push(unsubscribe);
  });
}

export function stopAllRealtimeListeners() {
  activeUnsubscribers.forEach((unsub) => {
    try {
      unsub();
    } catch (e) {
      console.warn("Gagal menghentikan listener:", e);
    }
  });
  activeUnsubscribers = [];
}

// ============================================================================
// 3. OPERASI CRUD PER DOKUMEN (CREATE, UPDATE, DELETE) DENGAN TIMESTAMP SERVER
// ============================================================================

export async function saveDocument(colName, docData, onSyncStatusChange) {
  if (!currentWorkspaceId) throw new Error("Pengguna belum login.");
  if (!COLLECTIONS.includes(colName)) throw new Error(`Koleksi ${colName} tidak valid.`);

  const docId = docData.id || `doc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const docRef = doc(dbFirestore, "workspaces", currentWorkspaceId, colName, docId);

  if (onSyncStatusChange) {
    onSyncStatusChange(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Menyimpan ke Cloud..." : "Disimpan di antrean offline");
  }

  const cleanPayload = {
    ...docData,
    id: docId,
    workspaceId: currentWorkspaceId,
    updatedAt: serverTimestamp()
  };

  if (!docData.createdAt) {
    cleanPayload.createdAt = serverTimestamp();
  }

  await setDoc(docRef, cleanPayload, { merge: true });

  if (onSyncStatusChange && navigator.onLine) {
    onSyncStatusChange("saved", "Tersimpan di Cloud Firestore");
  }
  return docId;
}

export async function deleteDocument(colName, docId, onSyncStatusChange) {
  if (!currentWorkspaceId) throw new Error("Pengguna belum login.");
  const docRef = doc(dbFirestore, "workspaces", currentWorkspaceId, colName, docId);

  if (onSyncStatusChange) {
    onSyncStatusChange("saving", "Menghapus dokumen...");
  }

  await deleteDoc(docRef);

  if (onSyncStatusChange && navigator.onLine) {
    onSyncStatusChange("saved", "Dokumen dihapus dari Cloud");
  }
}

// ============================================================================
// 4. MIGRASI DATA LAMA (VERSI 1.0) & BACKUP / RESTORE JSON
// ============================================================================

export async function migrateLegacyDataIfAvailable(onSyncStatusChange) {
  if (!currentWorkspaceId) return { migrated: false, count: 0 };

  let legacyData = null;

  // Cek apakah ada data di dokumen lama bobyStudioWorkspace/mainData
  try {
    const legacySnap = await getDoc(doc(dbFirestore, "bobyStudioWorkspace", "mainData"));
    if (legacySnap.exists() && legacySnap.data().payload) {
      legacyData = JSON.parse(legacySnap.data().payload);
    }
  } catch (e) {
    console.warn("Tidak dapat membaca dokumen legacy mainData:", e);
  }

  // Jika tidak ada di cloud lama, cek LocalStorage lama (V1 atau V2)
  if (!legacyData) {
    const rawV2 = localStorage.getItem("BOBY_CREATOR_STUDIO_DB_V2");
    const rawV1 = localStorage.getItem("BOBY_CREATOR_STUDIO_DB_V1");
    const raw = rawV2 || rawV1;
    if (raw) {
      try {
        legacyData = JSON.parse(raw);
      } catch (e) {
        console.warn("LocalStorage lama tidak valid.");
      }
    }
  }

  if (!legacyData || typeof legacyData !== "object") {
    return { migrated: false, count: 0 };
  }

  return await restoreWorkspaceFromObject(legacyData, onSyncStatusChange);
}

export async function restoreWorkspaceFromObject(dataObj, onSyncStatusChange) {
  if (!currentWorkspaceId) throw new Error("Pengguna belum login.");
  if (onSyncStatusChange) onSyncStatusChange("saving", "Memulihkan seluruh data ke Cloud...");

  const batch = writeBatch(dbFirestore);
  let totalCount = 0;

  COLLECTIONS.forEach((colName) => {
    const arr = Array.isArray(dataObj[colName]) ? dataObj[colName] : [];
    arr.forEach((item) => {
      if (item && typeof item === "object") {
        const docId = item.id || `doc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
        const ref = doc(dbFirestore, "workspaces", currentWorkspaceId, colName, docId);
        batch.set(ref, {
          ...item,
          id: docId,
          workspaceId: currentWorkspaceId,
          updatedAt: serverTimestamp()
        }, { merge: true });
        totalCount++;
      }
    });
  });

  if (totalCount > 0) {
    await batch.commit();
  }

  if (onSyncStatusChange) onSyncStatusChange("saved", `Berhasil memulihkan ${totalCount} data ke Cloud`);
  return { migrated: true, count: totalCount };
}
