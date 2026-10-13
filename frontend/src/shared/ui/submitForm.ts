import type { FormEvent } from "react"

export function submitForm(
  event: FormEvent<HTMLFormElement>,
  setter: (value: boolean) => void,
) {
  event.preventDefault()
  setter(true)
}
