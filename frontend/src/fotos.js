// Las fotos de un comercio: cómo se preparan antes de subirlas y qué pasa con
// las que quedaron cargadas como link.
//
// Antes había un campo para pegar una URL, con el texto "pegá el link de una
// foto tuya ya publicada (Instagram, Drive, tu web)". Eso mandaba a la gente
// derecho al pozo: un link de Instagram es una PÁGINA, no un archivo. El <img>
// recibía HTML, Instagram redirigía al muro de login y el navegador cortaba
// con ERR_TOO_MANY_REDIRECTS — y el onError escondía la imagen, así que el
// comerciante se iba convencido de que su foto estaba publicada.
//
// Ese campo ya no existe: la foto se sube como archivo. Lo que queda acá es
// preparar el archivo antes de mandarlo y reconocer las URLs viejas que nunca
// van a cargar, para marcarlas en vez de esconderlas.

// Plataformas que sirven sus imágenes desde un CDN con URLs firmadas que
// vencen y bloquean el hotlinking a propósito. No hay forma de mostrarlas
// desde otro sitio sin su API de embebido y un token.
const DOMINIOS_SIN_HOTLINK = [
  "instagram.com",
  "instagr.am",
  "facebook.com",
  "fb.com",
  "fb.watch",
  "tiktok.com",
  "twitter.com",
  "x.com",
];

/**
 * Si ese hostname pertenece a ese dominio (o es un subdominio suyo).
 *
 * Se compara por partes y no con un `includes`: "x.com" aparece dentro de
 * "dropbo**x.com**", y con una comparación de texto los links de Dropbox
 * quedaban marcados como si fueran de Twitter.
 */
const esDominio = (hostname, dominio) =>
  hostname === dominio || hostname.endsWith(`.${dominio}`);

/** Una URL guardada de antes que sabemos que nunca va a poder mostrarse. */
export function fotoImposible(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return DOMINIOS_SIN_HOTLINK.some((d) => esDominio(host, d));
}

export const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];

// A qué se reduce la foto antes de subirla.
//
// 1600 px de lado mayor es más que suficiente para la ficha y para el carrusel
// del mapa; nadie hace zoom sobre la foto de un parador. La calidad 0,82 en
// JPEG es el punto donde el archivo baja mucho y el ojo no lo nota.
const LADO_MAXIMO = 1600;
const CALIDAD = 0.82;

/**
 * Achica la foto en el navegador antes de subirla.
 *
 * Esto no es una optimización, es lo que hace que la función exista: una foto
 * de celular son 4 a 8 MB, y subir eso desde un muelle —con la señal que hay
 * ahí y contra un backend que puede estar despertando— no termina nunca. Al
 * achicarla queda en 200-400 KB, que sube en un par de segundos.
 *
 * Se hace acá y no en el servidor por la misma razón: lo caro es el viaje, y
 * el viaje ocurre antes de que el servidor vea nada.
 */
export function redimensionar(archivo) {
  return new Promise((resolver, rechazar) => {
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      rechazar(new Error("Solo aceptamos imágenes JPG, PNG o WebP."));
      return;
    }

    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("No pudimos leer el archivo."));
    lector.onload = () => {
      const imagen = new Image();
      imagen.onerror = () => rechazar(new Error("Ese archivo no parece una imagen."));
      imagen.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(imagen.width * escala);
        lienzo.height = Math.round(imagen.height * escala);

        const cx = lienzo.getContext("2d");
        // Fondo blanco: un PNG con transparencia pasado a JPEG deja los huecos
        // en negro, y una foto de un parador con manchas negras se ve rota
        // aunque técnicamente esté bien.
        cx.fillStyle = "#fff";
        cx.fillRect(0, 0, lienzo.width, lienzo.height);
        cx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

        lienzo.toBlob(
          (blob) => {
            if (!blob) {
              rechazar(new Error("No pudimos procesar la imagen."));
              return;
            }
            resolver(blob);
          },
          "image/jpeg",
          CALIDAD,
        );
      };
      imagen.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

export const enKB = (bytes) => `${Math.round(bytes / 1024)} KB`;
