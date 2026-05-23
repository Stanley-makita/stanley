export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string
          nome: string
          cnpj: string | null
          telefone: string | null
          email: string | null
          email_contato: string | null
          site: string | null
          logo_url: string | null
          logo_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['empresas']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>
      }
      usuarios: {
        Row: {
          id: string
          empresa_id: string
          auth_user_id: string | null
          nome: string
          email: string
          perfil: Database['public']['Enums']['usuario_perfil']
          funcao: string | null
          ativo: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['usuarios']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['usuarios']['Insert']>
      }
      fases: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          cor: string | null
          ordem: number
          prazo_dias: number | null
          modulo: string
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['fases']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['fases']['Insert']>
      }
      bancos: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          cor: string | null
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['bancos']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['bancos']['Insert']>
      }
      produtos: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          descricao: string | null
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['produtos']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['produtos']['Insert']>
      }
      conversas: {
        Row: {
          id: string
          empresa_id: string
          canal: 'whatsapp' | 'site' | 'instagram' | 'outros'
          contato_telefone: string | null
          contato_nome: string | null
          lead_id: string | null
          status: 'ativo' | 'qualificado' | 'encerrado' | 'humano'
          bot_ativo: boolean
          bot_estado: 'INICIO' | 'COLETANDO_DADOS' | 'CONFIRMANDO' | 'CONCLUIDO'
          bot_dados: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['conversas']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['conversas']['Insert']>
      }
      mensagens: {
        Row: {
          id: string
          conversa_id: string
          origem: 'cliente' | 'bot' | 'humano'
          conteudo: string
          metadata: Json | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['mensagens']['Row'], 'id' | 'created_at'> & { id?: string }
        Update: Partial<Database['public']['Tables']['mensagens']['Insert']>
      }
    }
    Enums: {
      usuario_perfil: 'admin' | 'gestor' | 'comercial' | 'operacional' | 'juridico' | 'apoio' | 'gerente' | 'analista' | 'consultor' | 'cliente'
    }
  }
}
