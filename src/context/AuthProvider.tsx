import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'
import { getDeviceSessionId, markEvicted } from '../lib/session'

// Claim this account's single active session for THIS device (best-effort).
// A later login elsewhere overwrites it; see the profile watcher below.
async function claimSession() {
  try {
    await supabase.rpc('claim_session', { p_session_id: getDeviceSessionId() })
  } catch {
    /* best-effort — don't block login on this */
  }
}

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

  async function loadProfile(userId: string): Promise<Profile | null> {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const p = (data as Profile) ?? null
    setProfile(p)
    return p
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id)
  }

  useEffect(() => {
    // Initial session check. On reopen we DON'T steal the session back: if a
    // more recent login on another device holds it, sign out here; otherwise
    // (we're still the active device, or none is claimed yet) adopt it.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        const p = await loadProfile(data.session.user.id)
        const mine = getDeviceSessionId()
        if (p?.active_session_id && p.active_session_id !== mine) {
          markEvicted()
          await supabase.auth.signOut() // superseded — don't touch driver state (other device owns it)
        } else {
          void claimSession()
        }
      }
      setLoading(false)
    })

    // React to login/logout for the lifetime of the app. A fresh login always
    // claims the session for this device (last login wins).
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession)
      if (newSession?.user) {
        await loadProfile(newSession.user.id)
        if (event === 'SIGNED_IN') void claimSession()
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
        async (payload) => {
          const next = payload.new as Profile
          setProfile(next)
          // Single session: if another device claimed this account, sign out here.
          if (next.active_session_id && next.active_session_id !== getDeviceSessionId()) {
            markEvicted()
            if (next.role === 'driver') {
              try {
                await supabase.rpc('driver_go_offline')
              } catch {
                /* best-effort */
              }
            }
            await supabase.auth.signOut()
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  // A backgrounded tab gets its realtime socket dropped, so it can MISS the
  // profile UPDATE that should evict it when the account logs in elsewhere
  // (postgres_changes never replays missed events) — which left a superseded
  // device still signed in. Re-check the account's active session whenever this
  // tab regains focus / visibility, so it signs itself out the moment the user
  // looks at it again. This NEVER re-claims (last login wins); it only validates.
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return
    async function revalidate() {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
      const p = (data as Profile) ?? null
      if (!p) return
      setProfile(p)
      // Superseded by a login elsewhere → sign out. Don't touch driver state:
      // it's keyed by account, so the now-active device owns it.
      if (p.active_session_id && p.active_session_id !== getDeviceSessionId()) {
        markEvicted()
        await supabase.auth.signOut()
      }
    }
    document.addEventListener('visibilitychange', revalidate)
    window.addEventListener('focus', revalidate)
    return () => {
      document.removeEventListener('visibilitychange', revalidate)
      window.removeEventListener('focus', revalidate)
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
