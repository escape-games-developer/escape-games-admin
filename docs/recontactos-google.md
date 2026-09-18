# Integración Google para Recontactos

## Google Cloud

1. Crear o seleccionar un proyecto.
2. Configurar OAuth consent screen y agregar los administradores como usuarios de prueba mientras la app esté en Testing.
3. Habilitar **Google Sheets API**, **Google Drive API** y **Google Picker API**.
4. Crear un OAuth Client ID de tipo **Web application**.
5. Crear una API key para Picker y restringirla por origen HTTP y a Google Picker API.

Scopes solicitados: `openid`, `email`, `drive.file` y `spreadsheets`. `drive.file` limita Drive a archivos que el usuario selecciona/autoriza; `spreadsheets` permite la futura escritura sobre esas planillas.

## URLs de OAuth

Para producción:

- Authorized JavaScript origin: el origen exacto del administrador, por ejemplo `https://admin.example.com`.
- Authorized redirect URI: `https://PROJECT_REF.supabase.co/functions/v1/google-oauth/callback`.

Para desarrollo, agregar además `http://localhost:5173` como JavaScript origin. El callback sigue siendo la URL de la Edge Function desplegada.

## Secrets de Supabase Edge Functions

Configurar con `supabase secrets set` (nunca usar prefijo `VITE_`):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_PICKER_API_KEY`
- `GOOGLE_CLOUD_PROJECT_NUMBER`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: secreto aleatorio largo, estable y exclusivo de este entorno.
- `APP_ORIGIN`: origen exacto del administrador, sin `/` final.

Supabase provee automáticamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a las Edge Functions.

## Despliegue

Aplicar `20260902010000_recontactos_config.sql` y desplegar las funciones `google-oauth` y `recontactos-api`. Luego entrar como Admin General a Ajustes → Recontactos, vincular Google, seleccionar una planilla por sucursal, indicar la pestaña y usar **Probar conexión**.

Los encabezados mínimos son `Nombre` y `WhatsApp`. El mapper reconoce además las variantes documentadas en el requerimiento, independientemente del orden físico de las columnas.
