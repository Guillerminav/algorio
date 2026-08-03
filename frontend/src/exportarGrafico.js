// Exporta a PNG el <svg> que renderiza Recharts, sin librerias extra: se
// serializa el SVG, se dibuja en un <canvas> y se baja el resultado.

// El grafico recibe los colores como var(--x) para seguir el tema de la app.
// Eso funciona mientras el SVG vive en el documento, pero al serializarlo y
// dibujarlo en un canvas queda fuera de todo contexto CSS y las variables no
// resuelven (las lineas saldrian negras o transparentes): hay que reemplazar
// cada var(--x) por su valor calculado antes de exportar.
function resolverVariablesCSS(markup, estilos) {
  return markup.replace(/var\(\s*(--[\w-]+)\s*\)/g, (coincidencia, nombre) => {
    const valor = estilos.getPropertyValue(nombre).trim();
    return valor || coincidencia;
  });
}

export async function descargarGraficoComoPNG(contenedor, nombreArchivo) {
  const svg = contenedor?.querySelector("svg");
  if (!svg) throw new Error("No se encontró el gráfico para exportar.");

  const estilos = getComputedStyle(document.documentElement);
  const { width, height } = svg.getBoundingClientRect();

  const clon = svg.cloneNode(true);
  clon.setAttribute("width", width);
  clon.setAttribute("height", height);
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = resolverVariablesCSS(new XMLSerializer().serializeToString(clon), estilos);

  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const imagen = new Image();
    await new Promise((resolver, rechazar) => {
      imagen.onload = resolver;
      imagen.onerror = () => rechazar(new Error("No se pudo generar la imagen del gráfico."));
      imagen.src = url;
    });

    // Se dibuja al doble (o al ratio de la pantalla) para que no salga borroso.
    const escala = Math.max(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = width * escala;
    canvas.height = height * escala;

    const ctx = canvas.getContext("2d");
    ctx.scale(escala, escala);
    // El canvas arranca transparente; sin esto el PNG queda con fondo negro
    // en cualquier visor que no respete el alfa.
    ctx.fillStyle = estilos.getPropertyValue("--superficie").trim() || "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(imagen, 0, 0, width, height);

    const blob = await new Promise((resolver) => canvas.toBlob(resolver, "image/png"));
    if (!blob) throw new Error("No se pudo generar la imagen del gráfico.");

    const urlPng = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = urlPng;
    enlace.download = nombreArchivo.endsWith(".png") ? nombreArchivo : `${nombreArchivo}.png`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(urlPng);
  } finally {
    URL.revokeObjectURL(url);
  }
}
