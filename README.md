# Geoportal Hibrido Tlahuac

Geoportal funcional con prioridad en escuelas secundarias, movilidad y analisis de cercania.

## Incluye

- Frontend Leaflet con capas:
  - Escuelas (prioridad visual superior)
  - Paradas Metro y RTP
  - Rutas Metro, RTP y Camiones
- Geolocalizacion en tiempo real (`watchPosition`)
- Analisis al seleccionar escuela:
  - Paradas cercanas (radio configurable)
  - Lineas cercanas (radio configurable)
- Calculo origen-destino (auto/caminando/bici)
- Backend base para Render con endpoint de ruteo y estructura para migrar analisis a servidor.

## Estructura

- `frontend/` app web (Vite + Leaflet + Turf)
- `backend/` API Express para proxy de ruteo
- `render.yaml` despliegue backend en Render
- `netlify.toml` despliegue frontend en Netlify

## Ejecutar en local

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Backend: `http://localhost:3000/api/health`

### 2) Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

## Analisis implementado

Al hacer clic en una escuela:

- Calcula paradas cercanas usando distancia punto-punto.
- Calcula lineas cercanas usando distancia punto-linea.
- Resalta resultados en el mapa y muestra panel con detalle por tipo de transporte.

## Endpoints backend

- `GET /api/health`
- `GET /api/route?profile=driving|walking|cycling&start=lng,lat&end=lng,lat`
- `POST /api/nearest-stops` (reservado fase PostGIS)
- `POST /api/nearest-lines` (reservado fase PostGIS)

## Notas de despliegue

- Frontend Netlify puede redirigir `/api/*` al backend Render.
- En `netlify.toml` cambia el dominio de Render cuando tengas tu servicio creado.
- Si no configuras backend, el frontend usa fallback directo a OSRM para ruteo.

## Siguiente fase recomendada

- Migrar analisis espacial a PostGIS (backend) para mayor escalabilidad.
- Agregar autenticacion opcional y cache para rutas frecuentes.
- Versionar datasets y pipeline de actualizacion.
