# berifica

Verificador de números de billetes de serie B para Bolivia.

Librería JavaScript para verificar si un billete de la **Serie B** (Bs 10, Bs 20 o Bs 50) se encuentra dentro de los rangos invalidados por el Banco Central de Bolivia (BCB) tras el accidente aéreo del 27 de febrero de 2026.

## Uso

```js
import { validate } from "./src/index.js";

// Verificar un billete de Bs 10, Serie B, número 80000000
const result = validate("10", "80000000", "B");

console.log(result.valid);       // false
console.log(result.invalidated); // true
console.log(result.message);     // "Este billete se encuentra en la lista de billetes invalidados por el BCB."
```

### Parámetros de `validate(denomination, serialNumber, seriesLetter)`

| Parámetro      | Tipo            | Descripción                                                   |
| -------------- | --------------- | ------------------------------------------------------------- |
| `denomination` | `string\|number` | Denominación del billete: `"10"`, `"20"` o `"50"`            |
| `serialNumber` | `string\|number` | Número de serie (solo dígitos, sin el prefijo `"B"`)          |
| `seriesLetter` | `string`         | Letra de serie impresa en el billete (por defecto: `"B"`)    |

### Resultado

```js
{
  valid: boolean,        // true si el billete es válido (no está invalidado)
  invalidated: boolean,  // true si el billete está en la lista de invalidados
  message: string,       // Mensaje descriptivo del resultado
  denomination: string,  // Denominación normalizada
  serial: string,        // Número de serie normalizado (solo dígitos)
  series: string         // Letra de serie en mayúsculas
}
```

## Tests

```bash
npm test
```

## Fuente de datos

Los rangos de invalidación provienen de la publicación oficial del BCB:
**"NÚMEROS DE SERIE DE LOS BILLETES DE LA SERIE B QUE NO TIENEN VALOR LEGAL"**
<https://www.bcb.gob.bo>

## Licencia

Apache 2.0
