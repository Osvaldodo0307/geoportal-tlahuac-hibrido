import { API_BASE } from "../config";

function profileToBackend(profile) {
  if (profile === "walking") {
    return "walking";
  }
  if (profile === "cycling") {
    return "cycling";
  }
  return "driving";
}

export async function calculateRoute({ origin, destination, profile }) {
  const normalizedProfile = profileToBackend(profile);
  const params = new URLSearchParams({
    profile: normalizedProfile,
    start: `${origin.lng},${origin.lat}`,
    end: `${destination.lng},${destination.lat}`
  });

  if (API_BASE) {
    const response = await fetch(`${API_BASE}/api/route?${params.toString()}`);
    if (!response.ok) {
      throw new Error("No se pudo calcular ruta desde backend.");
    }
    return response.json();
  }

  // Fallback directo si no hay backend configurado.
  const response = await fetch(`https://router.project-osrm.org/route/v1/${normalizedProfile}/${params.get("start")};${params.get("end")}?overview=full&geometries=geojson&steps=false`);
  if (!response.ok) {
    throw new Error("No se pudo calcular ruta (fallback OSRM).");
  }
  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) {
    throw new Error("No se encontraron rutas disponibles.");
  }
  return {
    provider: "osrm-fallback",
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    geometry: route.geometry
  };
}
