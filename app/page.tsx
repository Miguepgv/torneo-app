export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-center text-4xl font-extrabold text-violet-800">
          MARATON COFRADE 2026
        </h1>
        <p className="text-center text-slate-600">
          Aplicacion del torneo: resultados, clasificacion y panel de gestion.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white hover:bg-violet-700" href="/clasificaciones">
            Clasificaciones
          </a>
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white hover:bg-violet-700" href="/resultados">
            Resultados
          </a>
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white hover:bg-violet-700" href="/equipos">
            Equipos
          </a>
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white hover:bg-violet-700" href="/goleadores">
            Goleadores
          </a>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <a className="rounded-lg border border-violet-300 px-4 py-2 font-semibold text-violet-700 hover:bg-violet-50" href="/login">
            Login organizacion
          </a>
          <a className="rounded-lg border border-violet-300 px-4 py-2 font-semibold text-violet-700 hover:bg-violet-50" href="/admin/equipos">
            Panel Admin - Equipos
          </a>
        </div>
      </div>
    </main>
  );
}
