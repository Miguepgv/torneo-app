import Link from "next/link";

export default function PoliticaPrivacidadPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 sm:p-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-violet-900 sm:text-3xl">
            Politica de privacidad
          </h1>
          <Link
            href="/"
            className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700"
          >
            Inicio
          </Link>
        </div>

        <div className="space-y-4 text-sm leading-6 text-slate-700 sm:text-base">
          <p>
            En <strong>Maraton Cofrade</strong> tratamos datos personales para gestionar
            equipos, jugadores, resultados y funcionamiento general del torneo.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">Datos que podemos tratar</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Datos de cuenta (correo, identificador de usuario y credenciales de acceso).</li>
            <li>Datos de perfil y torneo (nombre, alias, equipo, foto de perfil).</li>
            <li>Datos de uso tecnico necesarios para operar la aplicacion.</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-900">Finalidad</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Permitir el acceso de usuarios autorizados.</li>
            <li>Gestionar partidos, clasificaciones y estadisticas.</li>
            <li>Mejorar seguridad y estabilidad de la plataforma.</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-900">Base legal</h2>
          <p>
            Tratamos los datos por ejecucion del servicio y, en su caso, por consentimiento
            del usuario para funcionalidades concretas.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">Conservacion</h2>
          <p>
            Conservamos los datos mientras exista relacion con el torneo o hasta que se
            solicite su eliminacion, salvo obligaciones legales de conservacion.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">Derechos</h2>
          <p>
            Puedes solicitar acceso, rectificacion o eliminacion de tus datos escribiendo a{" "}
            <a className="font-semibold text-violet-700 underline" href="mailto:mgomezlavado85@gmail.com">
              mgomezlavado85@gmail.com
            </a>
            .
          </p>

          <h2 className="text-lg font-semibold text-slate-900">Eliminacion de cuenta y datos</h2>
          <p>
            Consulta el procedimiento detallado en{" "}
            <Link className="font-semibold text-violet-700 underline" href="/eliminar-cuenta">
              /eliminar-cuenta
            </Link>
            .
          </p>

          <p className="pt-2 text-xs text-slate-500">Ultima actualizacion: mayo de 2026.</p>
        </div>
      </div>
    </main>
  );
}
