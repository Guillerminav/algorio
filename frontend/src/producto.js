// Qué producto sirve este dominio.
//
// AlgoRío se parte en dos webs sobre el MISMO backend y la MISMA base:
//
//   app.algorio.com.ar → AlgoRío      (recreativo + comercio)
//   pro.algorio.com.ar → AlgoRío Pro  (naviera)
//
// Lo que se separa es la interfaz, no la identidad: sigue habiendo una sola
// tabla `usuarios`, una sola de `suscripciones` y un solo pipeline de datos
// hidrológicos, que los dos productos consultan (`/api/nivel-rio` lo usa tanto
// el kayakista como el dashboard de la naviera).
//
// La resolución es por HOSTNAME y no por variable de build a propósito: así
// funciona igual si los dos dominios apuntan al mismo proyecto de Vercel o si
// son dos proyectos distintos. Si algún día son dos proyectos y se quiere
// podar más el bundle, alcanza con definir VITE_PRODUCTO en cada uno: la
// variable le gana al hostname (ver abajo).

export const PRODUCTOS = {
  rio: {
    id: "rio",
    nombre: "AlgoRío",
    // Sin sufijo: el wordmark es uno solo para los dos productos y lo que
    // cambia es la etiqueta que tiene al lado.
    sufijo: null,
    url: "https://app.algorio.com.ar",
    roles: ["recreativo", "comercio"],
    titulo: "El río, en el bolsillo",
    bajada:
      "Si está picado para tu embarcación, los paradores y lanchas-taxi del río, y lo que otros vieron recién en el agua.",
    para: "Para salir a navegar y para los comercios de la costa",
  },
  pro: {
    id: "pro",
    nombre: "AlgoRío Pro",
    sufijo: "Pro",
    url: "https://pro.algorio.com.ar",
    roles: ["naviera"],
    titulo: "Monitoreo y alertas hidrológicas de la Hidrovía",
    bajada:
      "Niveles, caudal y tendencias del Paraná y el Paraguay, unificados desde INA, Prefectura Naval y Yacyretá, con el calado admisible de cada ruta.",
    para: "Para navieras, terminales y servicios fluviales",
  },
};

const POR_DEFECTO = "rio";

/**
 * Cuál de los dos es este.
 *
 * El orden de precedencia importa:
 *
 * 1. `VITE_PRODUCTO`, para poder buildear un dominio explícitamente y para
 *    levantar el otro producto en local sin tocar el /etc/hosts.
 * 2. `?producto=pro` en la URL, SOLO en desarrollo. Es lo que permite mirar
 *    las dos webs contra el mismo `npm run dev` sin reiniciarlo. En producción
 *    se ignora: no queremos que un link con querystring cambie de producto.
 * 3. El hostname. `pro.` es Pro; cualquier otro host (incluidos `app.`,
 *    `localhost` y los previews `*.vercel.app`) es el de río.
 */
function resolver() {
  const porEntorno = import.meta.env.VITE_PRODUCTO;
  if (porEntorno && PRODUCTOS[porEntorno]) return PRODUCTOS[porEntorno];

  if (typeof window !== "undefined") {
    if (import.meta.env.DEV) {
      const pedido = new URLSearchParams(window.location.search).get("producto");
      if (pedido && PRODUCTOS[pedido]) return PRODUCTOS[pedido];
    }
    if (window.location.hostname.startsWith("pro.")) return PRODUCTOS.pro;
  }

  return PRODUCTOS[POR_DEFECTO];
}

export const PRODUCTO = resolver();
export const ES_PRO = PRODUCTO.id === "pro";
export const OTRO_PRODUCTO = ES_PRO ? PRODUCTOS.rio : PRODUCTOS.pro;

/** El producto al que pertenece un rol. `null` si el rol no existe. */
export function productoDeRol(rol) {
  return Object.values(PRODUCTOS).find((p) => p.roles.includes(rol)) ?? null;
}

/** Si esa cuenta se puede usar en ESTE dominio. */
export function rolEsDeEsteProducto(rol) {
  return PRODUCTO.roles.includes(rol);
}

/**
 * A dónde mandar a alguien que entró por el dominio equivocado, conservando
 * el destino. No se le pasa la sesión: la cookie es host-only (el backend monta
 * SessionMiddleware sin `domain`), así que cada dominio tiene la suya y del
 * otro lado hay que volver a entrar. Es deliberado — son dos públicos que no
 * se solapan — pero si algún día se quiere una sola sesión, el cambio es
 * agregarle `domain=".algorio.com.ar"` a ese middleware.
 */
export function urlDelProductoDe(rol) {
  return (productoDeRol(rol) ?? OTRO_PRODUCTO).url;
}
