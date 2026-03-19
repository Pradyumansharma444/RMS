"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface CollegeProfile {
  id: string;
  firebase_uid: string;
  name: string;
  email: string | null;
  address: string | null;
  university: string | null;
  banner_url: string | null;
  logo_url: string | null;
  principal_signature_url: string | null;
  hod_signature_url: string | null;
  university_stamp_url: string | null;
  created_at: string;
  updated_at: string | null;
}

interface AuthContextType {
  user: User | null;
  college: CollegeProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshCollege: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [college, setCollege] = useState<CollegeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCollege = async (uid: string) => {
    try {
      const res = await fetch(`/api/college/profile?uid=${uid}`);
      if (res.ok) {
        const data = await res.json();
        setCollege(data.college);
      } else {
        setCollege(null);
      }
    } catch {
      setCollege(null);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await fetchCollege(u.uid);
      } else {
        setCollege(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Register/fetch college profile
    await fetch("/api/college/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: cred.user.uid, email: cred.user.email }),
    });
    await fetchCollege(cred.user.uid);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setCollege(null);
  };

  const refreshCollege = async () => {
    if (user) await fetchCollege(user.uid);
  };

  return (
    <AuthContext.Provider value={{ user, college, loading, signIn, signOut, refreshCollege }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
