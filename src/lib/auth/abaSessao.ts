// Cookie de sessão é compartilhado por todo o navegador, não por aba — ver
// uso em AuthContext.tsx. Toda tela que autentica o usuário (login, link de
// recuperação de senha) precisa marcar a aba como ativa ANTES de navegar
// pra área protegida, porque o AuthProvider (que também tenta marcar via
// onAuthStateChange) só existe dentro do layout protegido: o evento
// SIGNED_IN do supabase-js dispara na tela de login, antes desse provider
// montar, e se perde.
export const ABA_ATIVA_KEY = 'credifon_aba_ativa'

export function marcarAbaAtiva() {
  sessionStorage.setItem(ABA_ATIVA_KEY, '1')
}
