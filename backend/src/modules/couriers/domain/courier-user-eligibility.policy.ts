/**
 * Política: solo un usuario ACTIVO puede ser vinculado como repartidor.
 * Usuarios INACTIVE o SUSPENDED no son elegibles.
 */
export function isUserEligibleForCourier(userStatus: string): boolean {
  return userStatus === 'ACTIVE';
}
