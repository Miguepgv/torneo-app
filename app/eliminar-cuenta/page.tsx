import Link from "next/link";

export default function EliminarCuentaPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 sm:p-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-violet-900 sm:text-3xl">
            Eliminacion de cuenta y datos
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
            Si quieres eliminar tu cuenta o tus datos de <strong>Maraton Cofrade</strong>,
            puedes solicitarlo por correo.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">Como solicitar la eliminacion</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Envia un email a{" "}
              <a className="font-semibold text-violet-700 underline" href="mailto:mgomezlavado85@gmail.com">
                mgomezlavado85@gmail.com
              </a>
              .
            </li>
            <li>Indica en el asunto: "Eliminar cuenta Maraton Cofrade".</li>
            <li>
              Incluye el correo con el que te registraste y, si aplica, nombre del equipo o
              alias para localizar tu cuenta.
            </li>
          </ol>

          <h2 className="text-lg font-semibold text-slate-900">Plazo de respuesta</h2>
          <p>
            Procesamos solicitudes en un plazo aproximado de 30 dias naturales desde la
            verificacion de identidad.
          </p>

          <h2 className="text-lg font-semibold text-slate-900">Que datos se eliminan</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Datos de acceso y perfil asociados a tu cuenta.</li>
            <li>Datos de contacto personales no necesarios para obligaciones legales.</li>
          </ul>

          <h2 className="text-lg font-semibold text-slate-900">Datos que pueden conservarse</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Registros tecnicos minimos y datos obligatorios por cumplimiento legal o
              seguridad.
            </li>
            <li>
              Datos estadisticos anonimizados del torneo, sin identificacion personal directa.
            </li>
          </ul>

          <p>
            Para mas informacion, revisa la{" "}
            <Link className="font-semibold text-violet-700 underline" href="/privacidad">
              politica de privacidad
            </Link>
            .
          </p>

          <p className="pt-2 text-xs text-slate-500">Ultima actualizacion: mayo de 2026.</p>
        </div>
      </div>
    </main>
  );
}
