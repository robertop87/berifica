# Berifica (PWA)

Aplicación para verificar números de serie de billetes bolivianos de la serie B (de montos de 50, 20 y 10).

Ahora funciona como Progressive Web App (PWA): puede instalarse en dispositivos compatibles y cargar la interfaz en modo offline.

Desarrollado por alenasoft.com.

## Sitio web

https://b-erifica.web.app

## Requisitos
- Node.js 18+

## Instalación
1. Ejecutar `npm install`.
2. Ejecutar `npm run dev` para desarrollo local.

## Build
Ejecutar `npm run build` para generar la carpeta `dist`.

## PWA (instalación y modo offline)
- En producción, el navegador mostrará la opción para instalar la app.
- El Service Worker cachea el shell de la aplicación y assets estáticos para permitir apertura offline.
- Para validar localmente el comportamiento PWA, usar `npm run build && npm run preview` (el modo `dev` no representa el ciclo completo de producción).

## Fuente de datos
Banco Central de Bolivia: https://www.bcb.gob.bo/?q=content/verificador-de-n%C3%BAmero-de-serie
