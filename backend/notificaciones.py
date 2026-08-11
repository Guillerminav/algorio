"""Alertas por mail cuando un activo de "Mi flota" cruza su umbral.

Dos alertas distintas, no dos niveles de la misma (mismo criterio que
backend/datos.py: estado_de_activo): el nivel llego al minimo o menos
(bajante, no se puede operar) o llego al maximo o mas (crecida).

Cuando se manda, y cuando NO:

    hoy \\ ultimo aviso |  (ninguno)  |   minimo    |   maximo
    -------------------+-------------+-------------+------------
    normal             |     --      |   rearma    |   rearma
    minimo             |   manda     |     --      |   manda
    maximo             |   manda     |   manda     |     --

O sea: se manda cuando la severidad cambia, no todos los dias que dure la
bajante. Cuando el activo vuelve a normal se borra el registro ("rearma") y
el proximo cruce vuelve a avisar. Sin esto, una bajante de tres semanas
serian 21 mails identicos y el usuario terminaria filtrando el remitente.

Corre despues del pipeline diario (ver .github/workflows/pipeline_diario.yml):
    python -m backend.notificaciones
"""
import os
from html import escape
from typing import Optional

import httpx

from backend import datos
from db import conexion, inicializar_db

# Mismo remitente y misma API (Resend) que los mensajes del boton "Ayuda", ver
# backend/ayuda.py. OJO: sin un dominio propio verificado en Resend, el
# dominio de prueba onboarding@resend.dev solo entrega al mail de la cuenta
# que creo la API key. Hasta verificar un dominio, las alertas a los mails de
# otros usuarios se van a rechazar (el error queda guardado en
# alertas_notificadas.error_envio).
REMITENTE = os.environ.get("MAIL_REMITENTE", "AlgoRio <onboarding@resend.dev>")
URL_API_RESEND = "https://api.resend.com/emails"

# Los colores de la marca, los mismos de :root en frontend/src/index.css. Van
# duplicados porque un mail no puede usar variables CSS ni una hoja de estilos
# externa: los clientes de correo solo respetan estilos en linea.
MARCA = "#0b3252"
MARCA_TEXTO_SUAVE = "#bcd8e8"
ACENTO = "#1d6fa5"
CHIP_FONDO = "#eaf6fb"
TEXTO = "#17242e"
TEXTO_SUAVE = "#5c6b76"
BORDE = "#e4e1d8"
FONDO = "#f6f4ef"
BAJADA = "#c0392b"
ALERTA = "#b8790b"

ETIQUETAS_TIPO = {
    "embarcacion": "Embarcación", "draga": "Draga", "muelle": "Muelle", "tramo": "Tramo",
}

TITULO_SEVERIDAD = {
    "minimo": "Nivel por debajo del mínimo",
    "maximo": "Nivel por encima del máximo",
}

COLOR_SEVERIDAD = {"minimo": BAJADA, "maximo": ALERTA}

EXPLICACION_SEVERIDAD = {
    "minimo": (
        "El río bajó hasta el umbral mínimo que definiste: por debajo de ese nivel "
        "no se puede operar con normalidad."
    ),
    "maximo": (
        "El río subió hasta el umbral máximo: es una crecida que puede restringir "
        "la operación."
    ),
}


def _formatear(valor: Optional[float], sufijo: str = " m") -> str:
    return f"{valor:.2f}{sufijo}" if isinstance(valor, (int, float)) else "—"


def _fila_dato(etiqueta: str, valor: str, destacado: bool = False) -> str:
    peso = "600" if destacado else "400"
    return (
        f'<tr>'
        f'<td style="padding:8px 0;color:{TEXTO_SUAVE};font-size:13px;">{escape(etiqueta)}</td>'
        f'<td style="padding:8px 0;color:{TEXTO};font-size:13px;font-weight:{peso};'
        f'text-align:right;">{escape(valor)}</td>'
        f'</tr>'
    )


def construir_html(activo: dict) -> str:
    """El mail en HTML. Tablas y estilos en linea a proposito: Outlook y
    Gmail ignoran flexbox, grid y las hojas de estilo, asi que el layout de
    mail sigue siendo el de 2005 aunque la app use grid."""
    severidad = activo["severidad"]
    color = COLOR_SEVERIDAD[severidad]
    umbral = (
        activo["umbral_minimo_efectivo_m"] if severidad == "minimo"
        else activo["umbral_maximo_efectivo_m"]
    )
    # El maximo puede venir del umbral oficial de Prefectura Naval si el
    # usuario no cargo uno propio; el minimo siempre es propio.
    origen_umbral = (
        "propio" if (severidad == "minimo" or activo.get("umbral_maximo_m") is not None)
        else "oficial de Prefectura Naval"
    )
    diferencia = None
    if activo["nivel_actual_m"] is not None and umbral is not None:
        diferencia = abs(activo["nivel_actual_m"] - umbral)

    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{FONDO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:{FONDO};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid {BORDE};border-radius:12px;overflow:hidden;
                    font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

        <tr><td style="background:{MARCA};padding:22px 26px;">
          <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">AlgoR&iacute;o</div>
          <div style="font-size:12px;color:{MARCA_TEXTO_SUAVE};margin-top:4px;">
            Alerta de nivel &middot; Mi flota
          </div>
        </td></tr>

        <tr><td style="padding:0;">
          <div style="background:{CHIP_FONDO};border-left:4px solid {color};padding:16px 22px;">
            <div style="font-size:11px;font-weight:700;color:{color};letter-spacing:0.5px;text-transform:uppercase;">
              {escape(TITULO_SEVERIDAD[severidad])}
            </div>
            <div style="font-size:16px;font-weight:700;color:{TEXTO};margin-top:6px;line-height:1.4;">
              {escape(activo['nombre'])} &mdash; {escape(activo['estacion_referencia'])}
              marca {escape(_formatear(activo['nivel_actual_m']))}
            </div>
          </div>
        </td></tr>

        <tr><td style="padding:20px 26px 4px;">
          <p style="margin:0 0 16px;font-size:13px;color:{TEXTO_SUAVE};line-height:1.55;">
            {escape(EXPLICACION_SEVERIDAD[severidad])}
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="border-top:1px solid {BORDE};">
            {_fila_dato('Activo', activo['nombre'], destacado=True)}
            {_fila_dato('Tipo', ETIQUETAS_TIPO.get(activo['tipo'], activo['tipo']))}
            {_fila_dato('Estación', activo['estacion_referencia'])}
            {_fila_dato('Río', activo.get('rio') or '—')}
            {_fila_dato('Nivel actual', _formatear(activo['nivel_actual_m']), destacado=True)}
            {_fila_dato(
                'Umbral ' + ('mínimo' if severidad == 'minimo' else 'máximo'),
                f"{_formatear(umbral)} ({origen_umbral})",
            )}
            {_fila_dato(
                'Diferencia',
                ('—' if diferencia is None else
                 f"{diferencia * 100:.0f} cm {'por debajo' if severidad == 'minimo' else 'por encima'}"),
                destacado=True,
            )}
            {_fila_dato('Fecha del parte', activo.get('fecha_boletin') or '—')}
          </table>
        </td></tr>

        <tr><td style="padding:18px 26px 24px;">
          <p style="margin:0;font-size:12px;color:{TEXTO_SUAVE};line-height:1.55;">
            Nivel promediado entre los partes de INA y Prefectura Naval.
            Este aviso se manda una sola vez por cruce de umbral: mientras el nivel
            siga del mismo lado no vas a recibir otro, y si vuelve a la normalidad
            el aviso se rearma solo.
          </p>
        </td></tr>

        <tr><td style="background:{FONDO};border-top:1px solid {BORDE};padding:14px 26px;">
          <div style="font-size:11px;color:{TEXTO_SUAVE};">
            Recibís este mail porque activaste las alertas de este activo en
            <span style="color:{ACENTO};font-weight:600;">Mi flota</span>.
            Podés desactivarlas desde esa misma pantalla.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def construir_texto(activo: dict) -> str:
    """Version en texto plano del mismo aviso. Va siempre junto al HTML: es lo
    que muestran los clientes que no renderizan HTML y lo que leen los
    filtros de spam para decidir que el mail no es sospechoso."""
    severidad = activo["severidad"]
    umbral = (
        activo["umbral_minimo_efectivo_m"] if severidad == "minimo"
        else activo["umbral_maximo_efectivo_m"]
    )
    rio = f" ({activo['rio']})" if activo.get("rio") else ""
    return (
        f"AlgoRio - {TITULO_SEVERIDAD[severidad]}\n\n"
        f"{activo['nombre']} ({ETIQUETAS_TIPO.get(activo['tipo'], activo['tipo'])})\n"
        f"Estacion: {activo['estacion_referencia']}{rio}\n"
        f"Nivel actual: {_formatear(activo['nivel_actual_m'])}\n"
        f"Umbral {'minimo' if severidad == 'minimo' else 'maximo'}: {_formatear(umbral)}\n"
        f"Fecha del parte: {activo.get('fecha_boletin') or '-'}\n\n"
        f"{EXPLICACION_SEVERIDAD[severidad]}\n"
    )


def _asunto(activo: dict) -> str:
    flecha = "▼" if activo["severidad"] == "minimo" else "▲"
    return (
        f"{flecha} AlgoRío: {activo['nombre']} en {activo['estacion_referencia']} "
        f"({_formatear(activo['nivel_actual_m'])})"
    )


def _enviar(destinatario: str, activo: dict) -> None:
    """Manda el aviso por Resend. Lanza excepcion si no se pudo enviar."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("Falta configurar RESEND_API_KEY en el entorno.")

    respuesta = httpx.post(
        URL_API_RESEND,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": REMITENTE,
            "to": [destinatario],
            "subject": _asunto(activo),
            "html": construir_html(activo),
            "text": construir_texto(activo),
        },
        timeout=20,
    )
    # raise_for_status() solo dice "403 Forbidden", que no alcanza para saber
    # que hacer: Resend explica el motivo real en el cuerpo de la respuesta
    # (dominio sin verificar, destinatario no permitido, key invalida). Sin
    # esto, el error que queda guardado en alertas_notificadas no sirve para
    # diagnosticar nada.
    if respuesta.is_error:
        try:
            detalle = respuesta.json().get("message") or respuesta.text
        except ValueError:
            detalle = respuesta.text
        raise RuntimeError(
            f"Resend respondio {respuesta.status_code} al mandar a {destinatario}: {detalle}"
        )


def _activos_con_alertas() -> list[dict]:
    """Los activos con el aviso activado, con el mail del dueño al lado."""
    inicializar_db()
    with conexion() as con:
        filas = con.execute(
            """
            -- Un intento fallido NO cuenta como avisado: si el mail no salio,
            -- el usuario no se entero, asi que la severidad guardada solo
            -- silencia los avisos siguientes cuando el envio funciono. Sin
            -- este CASE, un 403 de Resend dejaba la alerta enterrada para
            -- siempre (la corrida siguiente veia la misma severidad guardada
            -- y la salteaba), y arreglar Resend despues no la revivia.
            SELECT a.*, u.email,
                   CASE WHEN n.error_envio IS NULL THEN n.severidad END AS severidad_avisada
            FROM activos a
            JOIN usuarios u ON u.usuario = a.usuario
            LEFT JOIN alertas_notificadas n ON n.activo_id = a.id
            WHERE a.alertas_email IS TRUE
            ORDER BY a.id
            """
        ).fetchall()
    return [dict(f) for f in filas]


def _registrar(activo_id: int, estado: dict, error: Optional[str]) -> None:
    with conexion() as con:
        con.execute(
            """
            INSERT INTO alertas_notificadas (activo_id, severidad, nivel_m, fecha_boletin, error_envio)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (activo_id) DO UPDATE SET
                severidad = EXCLUDED.severidad,
                nivel_m = EXCLUDED.nivel_m,
                fecha_boletin = EXCLUDED.fecha_boletin,
                enviado_en = now(),
                error_envio = EXCLUDED.error_envio
            """,
            (activo_id, estado["severidad"], estado["nivel_actual_m"],
             estado.get("fecha_boletin"), error),
        )


def _rearmar(activo_id: int) -> None:
    with conexion() as con:
        con.execute("DELETE FROM alertas_notificadas WHERE activo_id = %s", (activo_id,))


def evaluar_y_notificar() -> dict:
    """Recorre los activos con alertas activadas y manda los que correspondan.

    Devuelve un resumen contable (revisados/enviados/fallidos/rearmados) para
    que la corrida de CI deje registro de lo que hizo.
    """
    pendientes = _activos_con_alertas()
    resumen = {"revisados": len(pendientes), "enviados": 0, "fallidos": 0,
               "rearmados": 0, "sin_email": 0}
    if not pendientes:
        print("No hay activos con alertas por mail activadas.")
        return resumen

    # mapa_estado_estaciones() recorre el dataset completo: se calcula una vez
    # para todos los activos, igual que en el listado de rutas.
    mapa_estado = datos.mapa_estado_estaciones()

    for activo in pendientes:
        estado = datos.estado_de_activo(activo, mapa_estado)
        severidad = estado["severidad"]
        avisada = activo["severidad_avisada"]

        if severidad is None:
            if avisada is not None:
                _rearmar(activo["id"])
                resumen["rearmados"] += 1
                print(f"[{activo['nombre']}] volvio a normal, se rearma el aviso.")
            continue

        if severidad == avisada:
            print(f"[{activo['nombre']}] sigue en '{severidad}', ya se aviso: no se repite.")
            continue

        if not activo.get("email"):
            resumen["sin_email"] += 1
            print(f"[{activo['nombre']}] el usuario {activo['usuario']} no tiene mail cargado.")
            continue

        try:
            _enviar(activo["email"], estado)
            _registrar(activo["id"], estado, None)
            resumen["enviados"] += 1
            print(f"[{activo['nombre']}] aviso '{severidad}' enviado a {activo['email']}.")
        except Exception as e:  # httpx.HTTPError, RuntimeError, etc.
            # Se registra con el error para dejar rastro de que se intento y
            # por que fallo. La fila queda con error_envio cargado, y el
            # CASE de _activos_con_alertas() hace que eso NO cuente como
            # avisado: la proxima corrida lo reintenta.
            _registrar(activo["id"], estado, str(e))
            resumen["fallidos"] += 1
            print(f"[{activo['nombre']}] fallo el envio: {e}")

    print(
        f"Resumen: {resumen['revisados']} revisados, {resumen['enviados']} enviados, "
        f"{resumen['fallidos']} fallidos, {resumen['rearmados']} rearmados, "
        f"{resumen['sin_email']} sin mail."
    )
    return resumen


if __name__ == "__main__":
    evaluar_y_notificar()
