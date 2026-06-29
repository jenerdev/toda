import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile((data as Profile) ?? null)
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id)
  }

  useEffect(() => {
    // Initial session check.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    // React to login/logout for the lifetime of the app.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession?.user) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // Keep the profile live — subscription_until changes server-side when a
  // renewal is approved. Requires Realtime enabled on `profiles`.
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return
    const channel = supabase
      .channel(`profile_${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        (payload) => setProfile(payload.new as Profile),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  async function signOut() {
    // Leave the queue before logging out so a signed-out driver can't be
    // offered rides. The RPC safely no-ops if the driver is mid-trip.
    if (profile?.role === 'driver') {
      try {
        await supabase.rpc('driver_go_offline')
      } catch {
        /* best-effort; don't block sign-out on this */
      }
    }
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
