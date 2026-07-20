// La plataforma ya verifica la firma del JWT (verify_jwt); aquí solo leemos
// claims del payload (rol, sub) para autorización de aplicación.
function jwtPayload(authHeader: string | null): Record<string, unknown> | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const parts = authHeader.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

// Solo un usuario con sesión (no la anon key pública) puede pasar.
export function isAuthenticatedUser(req: Request): boolean {
  return jwtPayload(req.headers.get('Authorization'))?.role === 'authenticated';
}

export function getUserId(req: Request): string | null {
  const sub = jwtPayload(req.headers.get('Authorization'))?.sub;
  return typeof sub === 'string' ? sub : null;
}

// Comparación en tiempo constante para no filtrar el secreto por timing.
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Endpoints internos: exige un secreto compartido que solo conoce el backend.
export function hasInternalSecret(req: Request): boolean {
  const expected = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const provided = req.headers.get('x-internal-secret');
  return !!expected && !!provided && timingSafeEqual(provided, expected);
}
