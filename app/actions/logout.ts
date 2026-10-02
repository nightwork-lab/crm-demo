'use server'

import { createSupabaseSessionClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseSessionClient()
  if (supabase) await supabase.auth.signOut()
  redirect('/login')
}
