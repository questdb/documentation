export function hyphenToPascalCase(str: string): string {
  return str
    .replace(/-/g, " ")
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
      return word.toUpperCase()
    })
    .replace(/\s+/g, "")
}
