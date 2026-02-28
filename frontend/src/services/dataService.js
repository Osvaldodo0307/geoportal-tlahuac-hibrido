import { DATA_FILES } from "../config";

async function loadGeoJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url}`);
  }
  return response.json();
}

export async function loadAllData() {
  const [
    tlahuacLimite,
    tlahuacCp,
    escuelas,
    metroParadas,
    rtpParadas,
    metroRutas,
    rtpRutas,
    camionesRutas
  ] = await Promise.all([
    loadGeoJson(DATA_FILES.tlahuacLimite),
    loadGeoJson(DATA_FILES.tlahuacCp),
    loadGeoJson(DATA_FILES.escuelas),
    loadGeoJson(DATA_FILES.metroParadas),
    loadGeoJson(DATA_FILES.rtpParadas),
    loadGeoJson(DATA_FILES.metroRutas),
    loadGeoJson(DATA_FILES.rtpRutas),
    loadGeoJson(DATA_FILES.camionesRutas)
  ]);

  return {
    tlahuacLimite,
    tlahuacCp,
    escuelas,
    metroParadas,
    rtpParadas,
    metroRutas,
    rtpRutas,
    camionesRutas
  };
}
