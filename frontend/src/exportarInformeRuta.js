// Informe de una ruta en PDF, para mandarle al capitan o al jefe de
// operaciones sin que tengan que entrar al sistema.
//
// Se dibuja a mano con jsPDF en vez de capturar la pantalla: una captura de
// una tarjeta de HTML sale pixelada al imprimirla y arrastra el layout de la
// app (botones de editar, lapices) que en un informe no pintan nada. Asi el
// PDF tiene su propia jerarquia: primero el veredicto en una frase, despues
// los numeros, y al final el detalle estacion por estacion.
// jsPDF y la tipografia de marca se importan dinamico y no arriba: son ~400 kB
// que solo hacen falta cuando alguien aprieta "Exportar informe". Estaticos, se
// los come todo el mundo en la carga inicial de la app para una funcion que se
// usa de vez en cuando; asi Vite los saca a un chunk aparte que se baja recien
// al primer click y despues queda cacheado.
import { fechaDeCalculo, fechaHoraDeCalculo, resumenDeRuta } from "./resumenRuta.js";

// Los colores de la marca, los mismos de :root en index.css. Van duplicados
// como constantes porque el PDF se dibuja fuera del documento y ahi las
// variables CSS no resuelven (mismo motivo que en exportarGrafico.js).
const MARCA = "#0b3252";
const MARCA_TEXTO_SUAVE = "#bcd8e8";
const ACENTO = "#1d6fa5";
const ACENTO_CLARO = "#4fb3d9";
const CHIP_FONDO = "#eaf6fb";
const TEXTO = "#17242e";
const TEXTO_SUAVE = "#5c6b76";
const BORDE = "#e4e1d8";
const FONDO = "#f6f4ef";
const VERDE = "#2e8f56";
const AMBAR = "#b8790b";
const ROJO = "#c0392b";
const GRIS = "#6e7781";

const COLOR_VEREDICTO = {
  viable: VERDE,
  limitada: AMBAR,
  sin_carga: ROJO,
  inviable: ROJO,
  sin_embarcacion: GRIS,
  sin_ficha: GRIS,
  sin_datos: GRIS,
};

const ETIQUETA_VEREDICTO = {
  viable: "CARGA COMPLETA",
  limitada: "CARGA LIMITADA POR EL RÍO",
  sin_carga: "NO PUEDE CARGAR",
  inviable: "NO PASA",
  sin_embarcacion: "SIN EMBARCACIÓN",
  sin_ficha: "FICHA INCOMPLETA",
  sin_datos: "SIN DATOS",
};

const ETIQUETA_ESTADO_ESTACION = {
  critico: "CRÍTICO",
  ajustado: "Ajustado",
  ok: "OK",
  sin_datos: "Sin dato",
};

const ANCHO = 210;
const ALTO = 297;
const MARGEN = 14;
const ANCHO_UTIL = ANCHO - MARGEN * 2;

// Las fuentes estandar del PDF (Helvetica) solo cubren Latin-1: cualquier
// glifo fuera de ese rango no se dibuja mal, rompe el espaciado de todo el
// renglon. El unico que llega del backend es la flecha de los nombres de
// tramo ("Océano ➔ Gran Rosario"), pero se filtra todo por las dudas.
const FUERA_DE_LATIN1 = /[^\u0020-\u00FF]/g;

const texto = (valor) =>
  String(valor ?? "")
    .replace(/[➔→⇒]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(FUERA_DE_LATIN1, "");

const miles = (valor) =>
  typeof valor === "number" ? valor.toLocaleString("es-AR", { maximumFractionDigits: 0 }) : "—";

const pies = (valor) => (typeof valor === "number" ? `${valor.toFixed(1)} ft` : "—");

const metros = (valor) => (typeof valor === "number" ? `${valor.toFixed(2)} m` : "—");

// La tipografia de marca, cargada bajo demanda junto con jsPDF. Queda en el
// modulo porque la usan varias funciones de dibujo y pasarla por parametro a
// todas solo para el logotipo seria ruido.
let marca = null;

// El wordmark va sin tilde ("AlgoRio"), igual que en la app, la landing y los
// mails: Glock Grotesque no trae vocales acentuadas, y con la tilde la "í"
// salia de otra tipografia — una letra prestada en el medio del logo.
const WORDMARK = "AlgoRio";

function dibujarLogotipo(doc, x, y, tamano, color) {
  doc.setFontSize(tamano);
  doc.setDrawColor(color);
  doc.setLineWidth(tamano * 0.008);
  doc.setFont(marca.NOMBRE_FUENTE_MARCA, "normal");
  // El wordmark va en peso 800 y de Glock Grotesque solo existe la Medium, asi
  // que en la app el navegador lo engrosa sintetizando la negrita. jsPDF no
  // hace eso con una fuente embebida, pero contornear el texto ademas de
  // rellenarlo da el mismo efecto.
  doc.text(WORDMARK, x, y, { renderingMode: "fillThenStroke" });
}

// El encabezado de marca: banda azul con el isotipo de ondas y la palabra
// AlgoRío. Es el mismo motivo del panel de login (HeroAutenticacion.jsx),
// redibujado en coordenadas del PDF.
function dibujarEncabezado(doc, subtitulo) {
  doc.setFillColor(MARCA);
  doc.rect(0, 0, ANCHO, 30, "F");

  doc.setDrawColor(ACENTO_CLARO);
  doc.setLineWidth(1.6);
  [12, 20, 28].forEach((y, indice) => {
    doc.setDrawColor(indice === 2 ? ACENTO_CLARO : "#1c4f77");
    doc.lines(
      [[18, -5], [18, 5], [18, -5], [18, 5], [18, -5]],
      ANCHO - 108,
      y,
      [1, 1],
      "S",
    );
  });

  doc.setTextColor("#ffffff");
  dibujarLogotipo(doc, MARGEN, 15, 21, "#ffffff");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MARCA_TEXTO_SUAVE);
  doc.text(subtitulo, MARGEN, 22);
}

function dibujarPie(doc, pagina, totalPaginas) {
  doc.setDrawColor(BORDE);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, ALTO - 16, ANCHO - MARGEN, ALTO - 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(TEXTO_SUAVE);
  doc.text(
    "Niveles de INA y Prefectura Naval. Las profundidades garantizadas son valores de referencia, " +
      "no una carta náutica oficial: verificá las condiciones del tramo antes de operar.",
    MARGEN,
    ALTO - 11,
    { maxWidth: ANCHO_UTIL - 25 },
  );
  doc.text(`${pagina}/${totalPaginas}`, ANCHO - MARGEN, ALTO - 11, { align: "right" });
}

// Caja de un numero grande con su etiqueta arriba y la aclaracion abajo.
function dibujarKpi(doc, x, y, ancho, etiqueta, valor, sub) {
  doc.setFillColor(FONDO);
  doc.roundedRect(x, y, ancho, 20, 1.5, 1.5, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(TEXTO_SUAVE);
  doc.text(etiqueta.toUpperCase(), x + 3, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(TEXTO);
  doc.text(valor, x + 3, y + 12, { maxWidth: ancho - 6 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(TEXTO_SUAVE);
  doc.text(sub, x + 3, y + 16.5, { maxWidth: ancho - 6 });
}

function dibujarTituloSeccion(doc, texto, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(ACENTO);
  doc.text(texto.toUpperCase(), MARGEN, y);
  doc.setDrawColor(BORDE);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, y + 1.5, ANCHO - MARGEN, y + 1.5);
  return y + 7;
}

export async function descargarInformeRuta(ruta) {
  const [{ jsPDF }, fuenteMarca] = await Promise.all([
    import("jspdf"),
    import("./fuenteMarca.js"),
  ]);
  marca = fuenteMarca;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS(marca.ARCHIVO_FUENTE_MARCA, marca.FUENTE_MARCA_BASE64);
  doc.addFont(marca.ARCHIVO_FUENTE_MARCA, marca.NOMBRE_FUENTE_MARCA, "normal");
  // La fecha del informe es la del analisis guardado, no la del dia en que se
  // exporta: si no, un PDF bajado el jueves de una ruta calculada el lunes
  // llevaria la fecha del jueves sobre los niveles del lunes.
  const fecha = fechaDeCalculo(ruta);
  const colorVeredicto = COLOR_VEREDICTO[ruta.veredicto] ?? GRIS;

  dibujarEncabezado(doc, "Informe de ruta");

  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(fecha, ANCHO - MARGEN, 15, { align: "right" });
  doc.setFontSize(7);
  doc.setTextColor(MARCA_TEXTO_SUAVE);
  doc.text(
    texto(`Calculado el ${fechaHoraDeCalculo(ruta)} h`),
    ANCHO - MARGEN, 21, { align: "right" },
  );

  let y = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(TEXTO);
  doc.text(texto(ruta.nombre), MARGEN, y, { maxWidth: ANCHO_UTIL });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(TEXTO_SUAVE);
  const estaciones = ruta.estaciones ?? [];
  doc.text(
    texto(
      `${estaciones[0] ?? "?"} a ${estaciones[estaciones.length - 1] ?? "?"} · ` +
        `${estaciones.length} estaciones · ${ruta.sentido === "ascendente" ? "subiendo" : "bajando"} · ` +
        (ruta.embarcacion
          ? `${ruta.embarcacion.nombre}${ruta.embarcacion.cantidad_barcazas ? ` (${ruta.embarcacion.cantidad_barcazas} barcazas)` : ""}`
          : "sin embarcación"),
    ),
    MARGEN,
    y,
    { maxWidth: ANCHO_UTIL },
  );

  // El veredicto en una frase, que es lo unico que va a leer el que lo recibe
  // por telefono: banda de color con la barra del veredicto a la izquierda.
  y += 6;
  // El tamaño de fuente se fija ANTES de cortar en lineas: splitTextToSize
  // mide con el que este activo en ese momento, y midiendo con uno mas chico
  // que el del dibujo el ultimo renglon se sale de la banda.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const resumen = texto(resumenDeRuta(ruta, fecha));
  const lineasResumen = doc.splitTextToSize(resumen, ANCHO_UTIL - 12);
  const altoBanda = Math.max(18, lineasResumen.length * 4.6 + 11);

  doc.setFillColor(CHIP_FONDO);
  doc.rect(MARGEN, y, ANCHO_UTIL, altoBanda, "F");
  doc.setFillColor(colorVeredicto);
  doc.rect(MARGEN, y, 2.5, altoBanda, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(colorVeredicto);
  doc.text(ETIQUETA_VEREDICTO[ruta.veredicto] ?? "—", MARGEN + 6, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(TEXTO);
  doc.text(lineasResumen, MARGEN + 6, y + 12);

  y += altoBanda + 8;

  const anchoKpi = (ANCHO_UTIL - 9) / 4;
  dibujarKpi(
    doc, MARGEN, y, anchoKpi, "Calado admisible",
    pies(ruta.calado_operativo_pies ?? ruta.calado_ruta_pies),
    ruta.limitado_por === "embarcacion" ? "lo limita el buque"
      : ruta.limitado_por === "rio" ? "lo limita el río" : "según el río",
  );
  dibujarKpi(
    doc, MARGEN + anchoKpi + 3, y, anchoKpi, "Punto crítico",
    texto(ruta.punto_critico?.estacion ?? "—"),
    ruta.punto_critico
      ? `${metros(ruta.punto_critico.nivel_actual_m)} · ${pies(ruta.punto_critico.calado_disponible_pies)}`
      : "sin datos",
  );
  dibujarKpi(
    doc, MARGEN + (anchoKpi + 3) * 2, y, anchoKpi, "Carga estimada",
    ruta.carga_max_t != null ? `${miles(ruta.carga_max_t)} t` : "—",
    ruta.aprovechamiento_pct != null
      ? `${ruta.aprovechamiento_pct}% de ${miles(ruta.dwt_max_t)} t`
      : "necesita embarcación",
  );
  dibujarKpi(
    doc, MARGEN + (anchoKpi + 3) * 3, y, anchoKpi, "Sensibilidad",
    ruta.toneladas_por_cm != null ? `${miles(ruta.toneladas_por_cm)} t` : "—",
    "por cada cm de río",
  );

  y += 28;

  if (ruta.advertencias?.length) {
    y = dibujarTituloSeccion(doc, "Advertencias", y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(AMBAR);
    ruta.advertencias.forEach((advertencia) => {
      const lineas = doc.splitTextToSize(texto(`• ${advertencia}`), ANCHO_UTIL);
      doc.text(lineas, MARGEN, y);
      y += lineas.length * 4 + 1.5;
    });
    y += 4;
  }

  if (ruta.tramos_usados?.length) {
    y = dibujarTituloSeccion(doc, "Profundidad garantizada por tramo", y);
    doc.setFontSize(8);
    ruta.tramos_usados.forEach((tramo) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TEXTO_SUAVE);
      doc.text(texto(tramo.nombre), MARGEN, y, { maxWidth: ANCHO_UTIL - 55 });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TEXTO);
      doc.text(
        `${tramo.profundidad_pies != null ? `${tramo.profundidad_pies} ft` : "sin dato"}` +
          `${tramo.es_propia ? "  (corregida)" : "  (sugerida)"}`,
        ANCHO - MARGEN,
        y,
        { align: "right" },
      );
      y += 5;
    });
    y += 4;
  }

  // Tabla del trayecto. Se pagina a mano: si no entra una fila mas, se cierra
  // la pagina y se vuelve a dibujar el encabezado de columnas arriba.
  y = dibujarTituloSeccion(doc, `Trayecto (${ruta.estaciones_detalle?.length ?? 0} estaciones)`, y);

  const columnas = [
    { titulo: "#", x: MARGEN, ancho: 7 },
    { titulo: "Estación", x: MARGEN + 7, ancho: 42 },
    { titulo: "Río", x: MARGEN + 49, ancho: 28 },
    { titulo: "Nivel", x: MARGEN + 77, ancho: 22, derecha: true },
    { titulo: "Tramo", x: MARGEN + 99, ancho: 20, derecha: true },
    { titulo: "Disponible", x: MARGEN + 119, ancho: 26, derecha: true },
    { titulo: "Margen", x: MARGEN + 145, ancho: 20, derecha: true },
    { titulo: "Estado", x: MARGEN + 165, ancho: 17, derecha: true },
  ];

  const dibujarEncabezadoTabla = (yTabla) => {
    doc.setFillColor(MARCA);
    doc.rect(MARGEN, yTabla - 4, ANCHO_UTIL, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor("#ffffff");
    columnas.forEach((c) => {
      const x = c.derecha ? c.x + c.ancho - 1.5 : c.x + 1.5;
      doc.text(c.titulo, x, yTabla, c.derecha ? { align: "right" } : undefined);
    });
    return yTabla + 6;
  };

  y = dibujarEncabezadoTabla(y);

  (ruta.estaciones_detalle ?? []).forEach((d, indice) => {
    if (y > ALTO - 24) {
      doc.addPage();
      dibujarEncabezado(doc, texto(`Informe de ruta · ${ruta.nombre}`));
      y = dibujarEncabezadoTabla(42);
    }

    const esCritico = d.veredicto === "critico";
    if (esCritico) {
      doc.setFillColor("#fdf3f1");
      doc.rect(MARGEN, y - 4, ANCHO_UTIL, 5.5, "F");
    } else if (indice % 2 === 1) {
      doc.setFillColor(FONDO);
      doc.rect(MARGEN, y - 4, ANCHO_UTIL, 5.5, "F");
    }

    const valores = [
      String(indice + 1),
      texto(d.estacion),
      texto(d.rio ?? "—"),
      metros(d.nivel_actual_m),
      d.profundidad_garantizada_pies != null ? `${d.profundidad_garantizada_pies} ft` : "—",
      pies(d.calado_disponible_pies),
      d.margen_sobre_critico_m != null ? metros(d.margen_sobre_critico_m) : "—",
      ETIQUETA_ESTADO_ESTACION[d.veredicto] ?? d.veredicto,
    ];

    doc.setFontSize(7);
    columnas.forEach((c, columna) => {
      const esColumnaEstado = columna === columnas.length - 1;
      doc.setFont("helvetica", esCritico || esColumnaEstado ? "bold" : "normal");
      doc.setTextColor(
        esColumnaEstado
          ? { critico: ROJO, ajustado: AMBAR, ok: VERDE, sin_datos: GRIS }[d.veredicto] ?? TEXTO
          : esCritico ? ROJO : TEXTO,
      );
      const x = c.derecha ? c.x + c.ancho - 1.5 : c.x + 1.5;
      doc.text(valores[columna], x, y, {
        align: c.derecha ? "right" : undefined,
        maxWidth: c.ancho - 3,
      });
    });

    y += 5.5;
  });

  const totalPaginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    dibujarPie(doc, pagina, totalPaginas);
  }

  const nombreArchivo = `AlgoRio-${ruta.nombre}-${fecha.replace(/\//g, "-")}.pdf`
    .replace(/[^\w\-.áéíóúñÁÉÍÓÚÑ ]/g, "")
    .replace(/\s+/g, "-");
  doc.save(nombreArchivo);
}
