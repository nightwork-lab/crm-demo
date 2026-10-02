'use server'

import { createSupabaseSessionClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData): Promise<void> {
  const email    = (formData.get('email')    as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''

  if (!email || !password) {
    redirect('/login?error=empty')
  }

  const supabase = await createSupabaseSessionClient()
  if (!supabase) {
    redirect('/login?error=config')
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    redirect('/login?error=invalid')
  }

  redirect('/')
}
