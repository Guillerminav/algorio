import React, { useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";

export default function ModalPerfil({ onCerrar }) {
  const { usuario, actualizarPerfil } = useAuth();
  const [nombreCompleto, setNombreCompleto] = useState(usuario?.nombre_completo ?? "");
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [unidadNivel, setUnidadNivel] = useState(usuario?.unidad_nivel ?? "m");
  const [unidadCaudal, setUnidadCaudal] = useState(usuario?.unidad_caudal ?? "m3s");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError("");
    setOk("");
    try {
      await actualizarPerfil({
        nombre_completo: nombreCompleto,
        password_actual: passwordActual || null,
        password_nueva: passwordNueva || null,
        unidad_nivel: unidadNivel,
        unidad_caudal: unidadCaudal,
      });
      setOk("Perfil actualizado.");
      setPasswordActual("");
      setPasswordNueva("");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="modal-fondo">
      <form className="modal-tarjeta" onSubmit={manejarSubmit}>
        <h2>Editar perfil</h2>
        <label>
          Nombre completo
          <input type="text" value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} />
        </label>
        <label>
          Contraseña actual
          <input
            type="password"
            autoComplete="current-password"
            value={passwordActual}
            onChange={(e) => setPasswordActual(e.target.value)}
          />
        </label>
        <label>
          Contraseña nueva (opcional)
          <input
            type="password"
            autoComplete="new-password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
          />
        </label>
        <label>
          Unidad de nivel
          <select value={unidadNivel} onChange={(e) => setUnidadNivel(e.target.value)}>
            <option value="m">Metros (m)</option>
            <option value="ft">Pies (ft)</option>
          </select>
        </label>
        <label>
          Unidad de caudal
          <select value={unidadCaudal} onChange={(e) => setUnidadCaudal(e.target.value)}>
            <option value="m3s">Metros cúbicos por segundo (m³/s)</option>
            <option value="ft3s">Pies cúbicos por segundo (ft³/s)</option>
          </select>
        </label>
        <div className="mensaje-error">{error}</div>
        <div className="mensaje-ok">{ok}</div>
        <div className="modal-botones">
          <button type="button" onClick={onCerrar}>Cancelar</button>
          <button type="submit">Guardar</button>
        </div>
      </form>
    </div>
  );
}
