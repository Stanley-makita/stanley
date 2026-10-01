import { rotasLinhaNegocio } from '@/lib/participantes/rotasNegocio'

// POST /api/processos/[id]/vendedores — inclui (V2 B2c-C1c, serviço único escritaNegocio.ts).
export const { POST } = rotasLinhaNegocio('vendedores')
