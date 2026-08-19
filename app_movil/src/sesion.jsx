// Sesion de la app: token en el almacenamiento seguro del sistema
// (Keychain en iOS, Keystore en Android) y perfil en memoria.
//
// El token dura 90 dias (ver backend/tokens.py). Se guarda en SecureStore y no
// en AsyncStorage porque es una credencial: AsyncStorage es texto plano al que
// llega cualquier backup del telefono.

import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { pedirJSON } from "./api.js";

const CLAVE_TOKEN = "algorio_token";

const ContextoSesion = createContext(null);

export function ProveedorSesion({ children }) {
  const [token, setToken] = useState(null);
  const [usuario, setUsuario] = useState(null);
  // Arranca en true: hasta leer el token del disco no se sabe si hay sesion,
  // y montar el login mientras tanto haria parpadear la pantalla en cada
  // arranque de alguien que ya estaba logueado.
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const guardado = await SecureStore.getItemAsync(CLAVE_TOKEN);
        if (!guardado) return;
        // Se valida contra el backend en vez de confiar en que existe: el
        // token puede haber vencido o la cuenta haberse borrado, y en ese caso
        // conviene mandar al login ahora y no en el primer toque del mapa.
        const perfil = await pedirJSON("/api/perfil", { token: guardado });
        if (cancelado) return;
        setToken(guardado);
        setUsuario(perfil);
      } catch (e) {
        // Un 401 es token vencido: se descarta. Un fallo de red no, porque
        // el token puede seguir siendo bueno y borrarlo obligaria a
        // reloguearse cada vez que se abre la app sin señal.
        if (e.status === 401) await SecureStore.deleteItemAsync(CLAVE_TOKEN);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const guardarSesion = useCallback(async (respuesta) => {
    const { token: nuevoToken, ...perfil } = respuesta;
    await SecureStore.setItemAsync(CLAVE_TOKEN, nuevoToken);
    setToken(nuevoToken);
    setUsuario(perfil);
    return perfil;
  }, []);

  const ingresar = useCallback(
    async (usuarioTexto, password) =>
      guardarSesion(
        await pedirJSON("/api/login", {
          method: "POST",
          body: JSON.stringify({ usuario: usuarioTexto, password }),
        }),
      ),
    [guardarSesion],
  );

  // El rol se elige en la pantalla de registro y por defecto es 'recreativo',
  // que es la enorme mayoria. La app sirve a los dos perfiles de rio; el de
  // naviera no se puede crear desde acá porque su producto es solo web.
  const registrarse = useCallback(
    async ({ usuario: usuarioTexto, email, password, rol = "recreativo" }) =>
      guardarSesion(
        await pedirJSON("/api/registro", {
          method: "POST",
          body: JSON.stringify({
            usuario: usuarioTexto,
            email,
            password,
            rol: rol === "comercio" ? "comercio" : "recreativo",
          }),
        }),
      ),
    [guardarSesion],
  );

  const salir = useCallback(async () => {
    await SecureStore.deleteItemAsync(CLAVE_TOKEN);
    setToken(null);
    setUsuario(null);
  }, []);

  const actualizarPerfil = useCallback(
    async (cambios) => {
      const perfil = await pedirJSON("/api/perfil", {
        method: "PUT",
        token,
        body: JSON.stringify(cambios),
      });
      setUsuario(perfil);
      return perfil;
    },
    [token],
  );

  // Atajo para las pantallas: `api("/api/pois")` ya sale firmado.
  const api = useCallback(
    (ruta, opciones = {}) => pedirJSON(ruta, { ...opciones, token }),
    [token],
  );

  const valor = useMemo(
    () => ({ token, usuario, cargando, ingresar, registrarse, salir, actualizarPerfil, api }),
    [token, usuario, cargando, ingresar, registrarse, salir, actualizarPerfil, api],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion() {
  const contexto = useContext(ContextoSesion);
  if (!contexto) throw new Error("useSesion() debe usarse dentro de <ProveedorSesion>.");
  return contexto;
}
