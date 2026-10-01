// Faixa fixa no topo quando o app está ligado ao banco de TESTE (projeto Supabase
// credifon-crm-staging) — Preview da Vercel e `npm run dev:teste`. Evita alguém
// achar que está mexendo na produção (ou o contrário).
const REF_SUPABASE_TESTE = 'cjsvineuakhzkqbazsmi'

export function AvisoAmbienteTeste() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(REF_SUPABASE_TESTE)) return null
  return (
    <div className="sticky top-0 z-[9999] bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-amber-950">
      AMBIENTE DE TESTE: dados fictícios, WhatsApp/e-mail/Clicksign desligados
    </div>
  )
}
