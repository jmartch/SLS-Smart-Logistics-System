import { RouterProvider } from "react-router"
import { router } from "./routes"
import { AuthProvider } from "./auth"
import ThemeToggle from "./ThemeToggle"

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <ThemeToggle />
    </AuthProvider>
  )
}
