import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

// Centro por defecto: Corrientes/Resistencia, sobre el Paraná. Es donde se
// abre el mapa mientras no hay permiso o todavia no llego la posicion, para
// que la primera pantalla no sea un oceano gris.
export const CENTRO_POR_DEFECTO = { latitude: -27.47, longitude: -58.83 };

/**
 * Ubicacion del usuario, con el permiso pedido una sola vez al arrancar.
 *
 * Nunca falla hacia afuera: la app tiene que funcionar igual sin permiso (se
 * ven los lugares, no la distancia a ellos), asi que negarlo no es un error
 * sino un modo de uso.
 *
 * Devuelve ademas `pedirUbicacion` para reintentar a pedido. Hace falta porque
 * el primer intento puede fallar por mil razones —el usuario todavia no habia
 * decidido, estaba bajo techo, se le fue la señal— y sin una forma de
 * reintentar la unica salida era cerrar y volver a abrir la app.
 */
export function useUbicacion() {
  const [posicion, setPosicion] = useState(null);
  const [permitido, setPermitido] = useState(null);
  const [buscando, setBuscando] = useState(true);

  const pedirUbicacion = useCallback(async () => {
    setBuscando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermitido(false);
        return null;
      }
      setPermitido(true);

      // Balanced y no High: para saber que parador tenes cerca alcanzan
      // ~100 m, y la precision alta enciende el GPS y come bateria, que es
      // justo lo que no sobra en una salida de todo un dia.
      const lectura = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nueva = {
        latitude: lectura.coords.latitude,
        longitude: lectura.coords.longitude,
      };
      setPosicion(nueva);
      return nueva;
    } catch {
      setPermitido(false);
      return null;
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    pedirUbicacion().then(() => {
      if (cancelado) return;
    });
    return () => {
      cancelado = true;
    };
  }, [pedirUbicacion]);

  return {
    posicion,
    permitido,
    buscando,
    centro: posicion ?? CENTRO_POR_DEFECTO,
    pedirUbicacion,
  };
}
