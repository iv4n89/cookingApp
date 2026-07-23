// Una clave de idempotencia identifica una intención de usuario. No es un secreto: evita que
// un reintento de red aplique dos veces el mismo comando transaccional.
export function createIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = character === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}
