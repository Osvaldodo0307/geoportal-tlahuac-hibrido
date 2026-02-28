export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "";

export const DEFAULT_CENTER = [19.2867, -99.0056];
export const DEFAULT_ZOOM = 12;

export const DATA_FILES = {
  tlahuacLimite: "/data/tlahuac_limite.geojson",
  tlahuacCp: "/data/tlahuac_cp.geojson",
  escuelas: "/data/secundarias.geojson",
  metroParadas: "/data/metro_paradas.geojson",
  rtpParadas: "/data/rtp_paradas.geojson",
  metroRutas: "/data/metro_rutas.geojson",
  rtpRutas: "/data/rtp_rutas.geojson",
  camionesRutas: "/data/camiones_rutas.geojson"
};
