// La frase que resume una ruta calculada en un renglon: es lo que se lee
// arriba de la tarjeta y lo que encabeza el informe en PDF. Vive aca y no en
// cada uno para que el informe que se manda por WhatsApp diga exactamente lo
// mismo que la pantalla desde la que se exporto.

// La fecha del analisis es la de la foto guardada (`calculado_en`), no la de
// hoy: una ruta es una evaluacion fechada, y si el informe dijera "hoy" con
// datos de hace tres dias estaria mintiendo. Cae a la fecha actual solo para
// una ruta sin foto todavia.
export function fechaDeCalculo(ruta) {
  const momento = ruta?.calculado_en ? new Date(ruta.calculado_en) : new Date();
  return momento.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function fechaHoraDeCalculo(ruta) {
  const momento = ruta?.calculado_en ? new Date(ruta.calculado_en) : new Date();
  return momento.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trayecto(ruta) {
  const estaciones = ruta.estaciones ?? [];
  return `${estaciones[0] ?? "?"}–${estaciones[estaciones.length - 1] ?? "?"}`;
}

// "faltan 15 cm" es lo primero que pregunta el que recibe el aviso, pero la
// pregunta cambia segun el caso: para salir cargado del todo, para poder
// levantar algo de carga, o para pasar. El backend manda las dos cosas
// (cuanto y para que) en faltante_cm / faltante_para.
const PARA_QUE = {
  calado_pleno: "para calado pleno",
  cargar: "para poder cargar",
  pasar: "para pasar",
};

function faltante(ruta) {
  if (ruta.faltante_cm == null || ruta.faltante_cm <= 0) return "";
  return ` (faltan ${ruta.faltante_cm} cm ${PARA_QUE[ruta.faltante_para] ?? ""})`.replace(/ \)$/, ")");
}

function cuelloDeBotella(ruta) {
  if (!ruta.punto_critico) return "";
  return ` Cuello de botella en ${ruta.punto_critico.estacion}${faltante(ruta)}.`;
}

// "al {fecha}" y no "hoy": el analisis quedo congelado en el momento en que
// se calculo, asi que un informe generado tres dias despues seguiria diciendo
// "hoy" sobre datos viejos.
export function resumenDeRuta(ruta, fecha = fechaDeCalculo(ruta)) {
  const nombre = `Ruta ${trayecto(ruta)}`;
  const barco = ruta.embarcacion?.nombre;

  switch (ruta.veredicto) {
    case "viable":
      return (
        `${nombre} navegable a calado pleno al ${fecha} para ${barco}. ` +
        `El límite lo pone el calado de diseño del buque, no el río.`
      );
    case "limitada":
      return (
        `${nombre} navegable con carga reducida al ${fecha} para ${barco}: ` +
        `${(ruta.carga_max_t ?? 0).toLocaleString("es-AR")} t contra ` +
        `${(ruta.dwt_max_t ?? 0).toLocaleString("es-AR")} t de capacidad.` +
        cuelloDeBotella(ruta)
      );
    case "sin_carga":
      return `${nombre} inviable al ${fecha} para ${barco}: no puede levantar carga.${cuelloDeBotella(ruta)}`;
    case "inviable":
      return `${nombre} inviable al ${fecha} para ${barco}: no hay agua ni para pasar en lastre.${cuelloDeBotella(ruta)}`;
    case "sin_embarcacion":
      return (
        `${nombre} sin embarcación asociada (${fecha}). Paso más restrictivo: ` +
        `${ruta.punto_critico?.estacion ?? "sin datos"}` +
        `${ruta.punto_critico ? ` con ${ruta.punto_critico.calado_disponible_pies} ft disponibles` : ""}.`
      );
    case "sin_ficha":
      return (
        `${nombre} (${fecha}): falta completar la ficha de ${barco} para calcular la carga. ` +
        `El río da ${ruta.calado_ruta_pies ?? "—"} ft en el paso más restrictivo.`
      );
    default:
      return `${nombre} (${fecha}): ninguna estación del trayecto aporta un calado disponible.`;
  }
}
