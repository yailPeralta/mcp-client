# MCP Client

## Descripción

El MCP Client es una aplicación cliente implementada con NestJS que utiliza el protocolo MCP (Model Context Protocol) para interactuar con un servidor MCP. Actúa como intermediario entre usuarios finales y modelos de lenguaje (LLMs) como OpenAI GPT y Anthropic Claude, proporcionando acceso a recursos y herramientas externas a través del protocolo MCP.

La aplicación permite resolver problemas técnicos automáticamente consultando una base de conocimiento de problemas conocidos y gestionando tickets en Trello según la resolución encontrada.

## Arquitectura

### Tecnologías Principales
- **NestJS**: Framework de Node.js para aplicaciones backend escalables
- **@modelcontextprotocol/sdk**: SDK oficial para implementar clientes MCP
- **OpenAI SDK**: Integración con modelos GPT de OpenAI
- **Anthropic SDK**: Integración con modelos Claude de Anthropic
- **@toon-format/toon**: Librería para codificación/decodificación de datos en formato Toon

### Estructura del Proyecto

```
mcp_client/
├── src/
│   ├── app.module.ts              # Módulo principal de la aplicación
│   ├── main.ts                    # Punto de entrada de la aplicación
│   ├── modules/
│   │   └── problema/              # Módulo de resolución de problemas
│   │       ├── problema.controller.ts    # Controlador REST API
│   │       ├── problema.service.ts       # Servicio de lógica de negocio
│   │       └── problema.module.ts        # Módulo del problema
│   ├── services/
│   │   ├── mcp-client.service.ts         # Cliente MCP
│   │   └── llms/                         # Servicios de LLMs
│   │       ├── openai.service.ts         # Servicio OpenAI
│   │       └── anthropic.service.ts      # Servicio Anthropic
│   └── common/config/             # Configuración de la aplicación
```

### Componentes Principales

#### 1. Servicio MCP Client
Gestiona la conexión con el servidor MCP usando transporte HTTP Streamable. Proporciona una interfaz unificada para acceder a recursos y ejecutar herramientas del servidor MCP.

#### 2. Servicios de LLMs
Dos implementaciones principales:

- **OpenAI Service**: Utiliza GPT-4 para resolver problemas con function calling
- **Anthropic Service**: Utiliza Claude Sonnet con herramientas nativas de Anthropic

Los servicios siguen el mismo flujo de trabajo pero con diferentes APIs de LLMs. El orden de prioridad se configura mediante la variable LLM_PRIORITY.

#### 3. Módulo de Problemas
- **Controller**: Expone endpoint REST `/problema` para recibir problemas a resolver
- **Service**: Coordina la resolución usando el LLM configurado según la prioridad definida en LLM_PRIORITY

### Flujo de Trabajo

1. **Recepción del Problema**: El cliente recibe un problema técnico vía API REST
2. **Consulta de Recursos**: El LLM consulta los recursos MCP disponibles:
   - Lista de listas de Trello
   - Base de conocimiento de problemas resueltos
3. **Análisis y Decisión**: Basado en la información obtenida, el LLM decide:
   - Si el problema existe en la base de conocimiento → Crear ticket en "Problemas resueltos anteriormente"
   - Si el problema es nuevo → Crear ticket en "Problemas Nuevos"
4. **Ejecución de Acciones**: Usa herramientas MCP para crear tickets en Trello
5. **Respuesta**: Devuelve el resultado del proceso al usuario

## Configuración

### Variables de Entorno Requeridas
```env
PORT=3000
MCP_SERVER_URI=http://localhost:3000/mcp-server
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
LLM_PRIORITY=openai,anthropic
```

### Configuración del Servidor MCP
- **MCP_SERVER_URI**: URL completa del servidor MCP (incluyendo el prefijo `/mcp-server`)

### Configuración de LLMs
- **OPENAI_API_KEY**: API Key de OpenAI (requerida para el servicio OpenAI)
- **ANTHROPIC_API_KEY**: API Key de Anthropic (requerida para el servicio Anthropic)
- **LLM_PRIORITY**: Orden de prioridad de los servicios LLM separados por coma (ejemplo: openai,anthropic,ollama)

## Instalación y Ejecución

### Prerrequisitos
- Node.js (versión 18 o superior)
- Servidor MCP ejecutándose y accesible
- API Keys de OpenAI y/o Anthropic

### Instalación
```bash
cd mcp_client
pnpm install
```

### Configuración
1. Copia el archivo `.env.example` a `.env`
2. Completa todas las variables de entorno requeridas

### Ejecución
```bash
# Desarrollo
pnpm run start:dev

# Producción
pnpm run start:prod
```

## API Endpoints

### POST /mcp-client/problema
Resuelve un problema técnico usando LLMs con acceso a recursos MCP.

**Request Body:**
```json
{
  "problema": "Descripción del problema técnico a resolver"
}
```

**Response:**
```json
{
  "result": "Descripción del resultado del proceso de resolución"
}
```

**Ejemplo de uso:**
```bash
curl -X POST http://localhost:3000/mcp-client/problema \
  -H "Content-Type: application/json" \
  -d '{"problema": "Los proveedores no cumplen con las fechas de entrega"}'
```

## Integración con MCP Server

### Recursos Utilizados
- **Known Problems** (`mcp://known-problems`): Base de conocimiento de problemas resueltos
- **Trello Lists** (`mcp://trello/lists`): Lista de listas disponibles en Trello

### Herramientas Utilizadas
- **trello-create-ticket-tool**: Crea tickets en Trello
- **trello-move-ticket-tool**: Mueve tickets entre listas (disponible pero no usado en el flujo actual)

### Conexión MCP
El cliente se conecta al servidor MCP usando `StreamableHTTPClientTransport`:

```typescript
const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URI));
const client = new Client({
  name: 'mcp-client',
  version: '1.0.0'
}, {
  capabilities: {}
});
await client.connect(transport);
```

## Servicios de LLMs

### Anthropic Service (Principal)
- **Modelo**: Claude Sonnet 4.5
- **Características**:
  - Uso de herramientas nativas de Anthropic
  - Procesamiento de respuestas con tool calls
  - Decodificación automática de datos en formato Toon
  - Manejo de múltiples rondas de tool calls

### OpenAI Service (Alternativo)
- **Modelo**: GPT-4
- **Características**:
  - Function calling de OpenAI
  - Compatibilidad con formato de herramientas OpenAI
  - Procesamiento secuencial de function calls

### Prompt Engineering
Ambos servicios usan prompts similares que guían al LLM para:
1. Consultar listas de Trello disponibles
2. Buscar problemas similares en la base de conocimiento
3. Crear tickets apropiados según el tipo de problema
4. Usar herramientas MCP para ejecutar acciones

## Desarrollo

### Scripts Disponibles
```bash
pnpm run build        # Compilar el proyecto
pnpm run format       # Formatear código con Prettier
pnpm run lint         # Ejecutar ESLint
pnpm run test         # Ejecutar tests unitarios
pnpm run test:e2e     # Ejecutar tests end-to-end
pnpm run test:cov     # Ejecutar tests con cobertura
```

### Estructura de Respuestas MCP

#### Recursos
Los recursos MCP devuelven datos en formato Toon (codificado):
```typescript
interface MCPResourceResponse {
  contents: Array<{
    mimeType: string;
    uri: string;
    text: string; // Datos en formato Toon
  }>;
}
```

#### Herramientas
Las herramientas MCP aceptan parámetros validados con Zod:
```typescript
// Ejemplo: Crear ticket en Trello
{
  name: 'trello-create-ticket-tool',
  arguments: {
    listId: string,
    name: string,
    description?: string
  }
}
```

## Casos de Uso

### 1. Problema Conocido
**Input:** "Los proveedores no cumplen con las fechas de entrega"
**Proceso:**
1. Consulta base de conocimiento → Encuentra problema similar
2. Obtiene ID de lista "Problemas resueltos anteriormente"
3. Crea ticket con solución existente

### 2. Problema Nuevo
**Input:** "El sistema se congela al procesar pedidos grandes"
**Proceso:**
1. Consulta base de conocimiento → No encuentra problema similar
2. Obtiene ID de lista "Problemas Nuevos"
3. Crea ticket con descripción del problema y solución propuesta

## Monitoreo y Debugging

### Logs
La aplicación genera logs detallados para:
- Conexión MCP
- Llamadas a herramientas
- Respuestas de LLMs
- Errores de procesamiento

### Manejo de Errores
- Validación de configuración al inicio
- Reintentos automáticos en llamadas MCP fallidas
- Mensajes de error descriptivos para debugging

## Escalabilidad

### Rendimiento
- Conexión persistente al servidor MCP
- Procesamiento asíncrono de requests
- Optimización de llamadas a LLMs

### Extensibilidad
- Fácil adición de nuevos servicios LLM
- Modularidad para agregar nuevos tipos de problemas
- Configuración flexible de recursos MCP

## Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT.
