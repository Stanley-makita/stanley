import { type Acao } from '@/types/auth'

export interface AcaoModuloDef {
  acao: Acao
  label: string
  /** default true; false = checkbox desabilitado na tela de Perfis de Acesso */
  configuravel?: boolean
  /** exibido junto ao checkbox quando configuravel=false */
  motivoBloqueio?: string
  /**
   * Documentação de onde a regra é aplicada de fato:
   * 'ui'       — controlado só pela interface (Sidebar/RouteGuard/botões) nesta versão.
   * 'servidor' — autorização em API ou RLS/trigger, consultando
   *              usuario_atual_pode() (SQL) ou podeServidor() (rotas com
   *              service-role) — a configuração feita nesta tela chega de
   *              verdade até o banco. Só instancias.gerenciar continua com
   *              regra fixa não alcançada pela configuração (configuravel: false),
   *              decisão deliberada por lidar com credencial de integração.
   * 'misto'    — tem controle visual e também uma regra própria no servidor, que pode divergir.
   */
  tipoControle?: 'ui' | 'servidor' | 'misto'
}

export interface ModuloDef {
  key: string
  label: string
  /** Prefixos de rota cobertos por este módulo (ex.: Negócios cobre /negocios e /processos) */
  rotas: string[]
  acaoVer: Acao
  acoes: AcaoModuloDef[]
  /** true só para 'dashboard' — sempre visível, sem checkbox editável na tela */
  travado?: boolean
}

const MOTIVO_SOMENTE_ADMIN = 'Disponível somente para Administrador — regra fixa do servidor.'

export const MODULOS: ModuloDef[] = [
  {
    key: 'dashboard', label: 'Dashboard', rotas: ['/dashboard'], acaoVer: 'dashboard.ver', travado: true,
    acoes: [{ acao: 'dashboard.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'leads', label: 'Captação', rotas: ['/leads'], acaoVer: 'leads.ver',
    acoes: [
      { acao: 'leads.ver', label: 'Ver', tipoControle: 'misto' },
      { acao: 'leads.criar', label: 'Criar', tipoControle: 'servidor' },
      { acao: 'leads.editar', label: 'Editar', tipoControle: 'ui' },
      { acao: 'leads.excluir', label: 'Excluir', tipoControle: 'ui' },
      { acao: 'leads.ver_todas', label: 'Ver todos os leads', tipoControle: 'servidor' },
      { acao: 'leads.redistribuir', label: 'Redistribuir leads', tipoControle: 'servidor' },
    ],
  },
  {
    key: 'pessoas', label: 'Pessoas', rotas: ['/pessoas'], acaoVer: 'pessoas.ver',
    acoes: [
      { acao: 'pessoas.ver', label: 'Ver', tipoControle: 'servidor' },
      { acao: 'pessoas.editar', label: 'Editar', tipoControle: 'servidor' },
      { acao: 'pessoas.merge', label: 'Mesclar', tipoControle: 'servidor' },
      { acao: 'pessoas.excluir', label: 'Excluir', tipoControle: 'servidor' },
    ],
  },
  {
    key: 'imoveis', label: 'Imóveis', rotas: ['/imoveis'], acaoVer: 'imoveis.ver',
    acoes: [{ acao: 'imoveis.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'negocios', label: 'Negócios', rotas: ['/negocios', '/processos'], acaoVer: 'processos.ver',
    acoes: [
      { acao: 'processos.ver', label: 'Ver', tipoControle: 'misto' },
      { acao: 'processos.criar', label: 'Criar', tipoControle: 'servidor' },
      { acao: 'processos.editar', label: 'Editar', tipoControle: 'servidor' },
      { acao: 'processos.retroceder_fase', label: 'Retroceder fase do processo', tipoControle: 'servidor' },
      { acao: 'processos.reabrir', label: 'Reabrir processo concluído', tipoControle: 'servidor' },
    ],
  },
  {
    key: 'conversas', label: 'Conversas', rotas: ['/conversas'], acaoVer: 'conversas.ver',
    acoes: [
      { acao: 'conversas.ver', label: 'Ver', tipoControle: 'ui' },
      { acao: 'conversas.ver_todas', label: 'Ver todas as conversas', tipoControle: 'ui' },
      { acao: 'conversas.transferir', label: 'Transferir', tipoControle: 'ui' },
    ],
  },
  {
    key: 'operacional', label: 'Solicitações', rotas: ['/operacional'], acaoVer: 'operacional.ver',
    acoes: [{ acao: 'operacional.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'simuladores', label: 'Simuladores', rotas: ['/simuladores'], acaoVer: 'simuladores.ver',
    acoes: [{ acao: 'simuladores.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'relatorios', label: 'Relatórios', rotas: ['/relatorios'], acaoVer: 'relatorios.ver',
    acoes: [{ acao: 'relatorios.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'notificacoes', label: 'Notificações', rotas: ['/notificacoes'], acaoVer: 'notificacoes.ver',
    acoes: [{ acao: 'notificacoes.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'agenda', label: 'Agenda', rotas: ['/agenda'], acaoVer: 'agenda.ver',
    acoes: [{ acao: 'agenda.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'biblioteca', label: 'Biblioteca', rotas: ['/base-conhecimento'], acaoVer: 'biblioteca.ver',
    acoes: [
      { acao: 'biblioteca.ver', label: 'Ver', tipoControle: 'ui' },
      { acao: 'biblioteca.publicar', label: 'Publicar', tipoControle: 'servidor' },
      { acao: 'biblioteca.excluir', label: 'Excluir', tipoControle: 'servidor' },
    ],
  },
  {
    key: 'rh', label: 'RH', rotas: ['/rh'], acaoVer: 'rh.ver',
    acoes: [
      { acao: 'rh.ver', label: 'Ver', tipoControle: 'misto' },
      { acao: 'rh.editar', label: 'Editar', tipoControle: 'servidor' },
    ],
  },
  {
    key: 'financeiro', label: 'Financeiro', rotas: ['/financeiro'], acaoVer: 'financeiro.ver',
    acoes: [
      { acao: 'financeiro.ver', label: 'Ver', tipoControle: 'ui' },
      { acao: 'financeiro.editar', label: 'Editar', tipoControle: 'servidor' },
    ],
  },
  {
    key: 'gestao', label: 'Painel de Gestão', rotas: ['/gestao'], acaoVer: 'gestao.ver',
    acoes: [{ acao: 'gestao.ver', label: 'Ver', tipoControle: 'ui' }],
  },
  {
    key: 'configuracoes', label: 'Configurações', rotas: ['/configuracoes'], acaoVer: 'configuracoes.ver',
    acoes: [
      { acao: 'configuracoes.ver', label: 'Ver', tipoControle: 'ui' },
      { acao: 'configuracoes.editar', label: 'Editar', tipoControle: 'ui' },
      { acao: 'usuarios.convidar', label: 'Convidar usuário', tipoControle: 'servidor' },
      { acao: 'usuarios.desativar', label: 'Desativar usuário', tipoControle: 'servidor' },
      // instancias.gerenciar continua travada de propósito: dá acesso ao
      // token de integração WhatsApp (Uazapi) — decisão deliberada de manter
      // só admin, não faz parte desta rodada de configurabilidade (ver
      // migration 20260730_219, que acabou de fechar o buraco de segurança
      // que existia aqui).
      { acao: 'instancias.gerenciar', label: 'Gerenciar instâncias WhatsApp', configuravel: false, motivoBloqueio: MOTIVO_SOMENTE_ADMIN, tipoControle: 'servidor' },
    ],
  },
]

export function encontrarModuloPorRota(pathname: string): ModuloDef | undefined {
  return MODULOS.find((m) => m.rotas.some((r) => pathname === r || pathname.startsWith(`${r}/`)))
}

/**
 * Ações com regra fixa no servidor (RLS/API) nesta versão — um override
 * salvo em perfil_permissoes para qualquer uma delas nunca tem efeito real,
 * porque o servidor não consulta a tabela de overrides para essas ações
 * (só a matriz estática PERMISSOES_PADRAO). Usado por resolverPermissao
 * para ignorar overrides "fantasma" (salvos antes desta ação virar fixa,
 * ou por engano) em vez de deixar a interface prometer algo que o banco
 * recusa.
 */
export const ACOES_NAO_CONFIGURAVEIS: Set<Acao> = new Set(
  MODULOS.flatMap((m) => m.acoes.filter((a) => a.configuravel === false).map((a) => a.acao))
)
