// La plataforma ya verifica la firma del JWT (verify_jwt); aquí solo leemos el rol
// del payload para distinguir un usuario autenticado de la anon key (rol 'anon').
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const payload = JSON.parse(atob(b64 + pad));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

// Solo un usuario con sesión (no la anon key pública) puede pasar.
export function isAuthenticatedUser(req: Request): boolean {
  return jwtRole(req.headers.get('Authorization')) === 'authenticated';
}

// Endpoints internos: exige un secreto compartido que solo conoce el backend.
export function hasInternalSecret(req: Request): boolean {
  const expected = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  return !!expected && req.headers.get('x-internal-secret') === expected;
}
