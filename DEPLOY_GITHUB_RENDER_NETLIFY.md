# Despliegue: GitHub + Render + Netlify

## 1) Subir a GitHub

Desde la carpeta `GeoportalHibrido`:

```bash
git init
git add .
git commit -m "feat: geoportal hibrido escuelas movilidad"
git branch -M main
git remote add origin <TU_REPO_GITHUB_URL>
git push -u origin main
```

## 2) Backend en Render

1. En Render, crear servicio `Web Service` conectado al repo.
2. Opcion rapida: usar `render.yaml` (Blueprint).
3. Configuracion:
   - Root directory: `backend`
   - Build command: `npm install`
   - Start command: `npm run start`
4. Variable opcional:
   - `PORT` (Render la inyecta automaticamente)

Prueba:

`https://<tu-backend>.onrender.com/api/health`

## 3) Frontend en Netlify

1. Crear sitio desde GitHub.
2. Config:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `frontend/dist`
3. Variable de entorno:
   - `VITE_API_BASE=https://<tu-backend>.onrender.com`

## 4) Redireccion API en Netlify

Archivo ya incluido: `netlify.toml`

Actualiza:

- `https://geoportal-tlahuac-backend.onrender.com`

por el dominio real de tu backend Render.

## 5) Verificacion final

- El mapa carga capas de escuelas y transporte.
- Geolocalizacion funciona en HTTPS.
- Al seleccionar escuela, se muestran paradas/lineas cercanas.
- Origen-destino dibuja ruta correctamente.
