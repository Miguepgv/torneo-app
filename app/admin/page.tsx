"use client";

export default function AdminHomePage() {
  return (
    <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold text-violet-900">Panel Admin</h1>
        <div className="grid gap-3 sm:grid-cols-4">
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/equipos">
            Equipos
          </a>
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/configuracion">
            Configuracion torneo
          </a>
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/calendario">
            Calendario
          </a>
          <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/directo">
            Directo
          </a>
        </div>
      </div>
    </main>
  );
}
