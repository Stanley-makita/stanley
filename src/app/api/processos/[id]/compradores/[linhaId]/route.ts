import { rotasLinhaNegocio } from '@/lib/participantes/rotasNegocio'

// PATCH/DELETE /api/processos/[id]/compradores/[linhaId] — edita/remove (V2 B2c-C1c, serviço único escritaNegocio.ts).
export const { PATCH, DELETE } = rotasLinhaNegocio('compradores')
