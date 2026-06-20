import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AcessoBloqueadoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-card">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mx-auto">
          <span className="text-red-600 text-2xl">🔒</span>
        </div>
        <h1 className="text-2xl font-bold text-fonti-primary">Acesso bloqueado</h1>
        <p className="text-gray-500">
          Sua conta foi desativada. Entre em contato com o administrador da sua empresa para
          reativar o acesso.
        </p>
        <Link href="/login">
          <Button variant="outline">Voltar ao login</Button>
        </Link>
      </div>
    </div>
  )
}