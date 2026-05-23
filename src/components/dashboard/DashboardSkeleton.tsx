export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Saudação */}
      <div className="h-7 bg-gray-100 rounded w-64" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl h-28" />
        ))}
      </div>

      {/* Gráfico + Atividade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-gray-100 rounded-xl h-64" />
        <div className="bg-gray-100 rounded-xl h-64" />
      </div>

      {/* Metas */}
      <div className="bg-gray-100 rounded-xl h-40" />
    </div>
  )
}