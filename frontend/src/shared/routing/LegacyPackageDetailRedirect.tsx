import { Navigate, useParams } from "react-router"

/**
 * Redirects the legacy `/empresa/paquetes/:packageId` URL to the real
 * authenticated app, preserving the package identifier.
 */
export function LegacyPackageDetailRedirect() {
  const { packageId } = useParams<{ packageId: string }>()

  if (!packageId) {
    return <Navigate to="/app/paquetes" replace />
  }

  return <Navigate to={`/app/paquetes/${encodeURIComponent(packageId)}`} replace />
}
