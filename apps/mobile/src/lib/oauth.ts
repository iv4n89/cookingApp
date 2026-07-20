import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

// Cierra la pestaña del navegador al volver (web/popup).
WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'facebook' | 'apple';

// Deep link de vuelta a la app tras autenticar (esquema "recetas" en app.json).
const redirectTo = Linking.createURL('/');

// Intercambia el "code" del redirect (flujo PKCE) por una sesión.
async function completeSession(url: string) {
  const { queryParams } = Linking.parse(url);
  const code = queryParams?.code;
  if (typeof code !== 'string') return;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

// Login social por navegador: abre el proveedor y vuelve a la app con la sesión.
export async function signInWithProvider(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'success') await completeSession(result.url);
}
