import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeLegalName } from '@/lib/account/legal-name';

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  }
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Inicia sesión para actualizar tu perfil.' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const legalName = normalizeLegalName(body?.legalName);
    if (!legalName) return NextResponse.json({ error: 'Escribe tu nombre legal completo (2–120 caracteres), sin símbolos ni saltos de línea.' }, { status: 400 });
    // Session-scoped update: no client-supplied user ID and no artistic-name changes.
    const { error } = await supabase.auth.updateUser({ data: { legal_name: legalName } });
    if (error) return NextResponse.json({ error: 'No pudimos guardar el nombre. Inténtalo de nuevo.' }, { status: 503 });
    return NextResponse.json({ legalName }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No pudimos guardar el nombre. Inténtalo de nuevo.' }, { status: 503 });
  }
}
