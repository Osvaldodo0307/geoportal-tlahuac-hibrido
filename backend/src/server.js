import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "geoportal-backend",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/route", async (req, res) => {
  try {
    const profile = req.query.profile || "driving";
    const start = req.query.start;
    const end = req.query.end;
    if (!start || !end) {
      return res.status(400).json({
        error: "Faltan parametros start o end. Formato: lng,lat"
      });
    }

    const allowedProfiles = new Set(["driving", "walking", "cycling"]);
    const safeProfile = allowedProfiles.has(profile) ? profile : "driving";

    const url = `https://router.project-osrm.org/route/v1/${safeProfile}/${start};${end}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "Fallo el proveedor de ruteo." });
    }
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) {
      return res.status(404).json({ error: "No se encontro ruta." });
    }
    return res.json({
      provider: "osrm",
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      geometry: route.geometry
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Error interno" });
  }
});

app.post("/api/nearest-stops", (req, res) => {
  // Endpoint reservado para mover analisis al backend sin romper el frontend.
  res.status(501).json({ error: "Pendiente de implementar en backend (fase PostGIS)." });
});

app.post("/api/nearest-lines", (req, res) => {
  // Endpoint reservado para mover analisis al backend sin romper el frontend.
  res.status(501).json({ error: "Pendiente de implementar en backend (fase PostGIS)." });
});

app.listen(port, () => {
  console.log(`Geoportal backend escuchando en puerto ${port}`);
});
