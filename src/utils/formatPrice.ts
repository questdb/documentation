export const formatPrice = (
  num: number,
  options?: Intl.NumberFormatOptions,
) => {
  return num.toLocaleString("en-us", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    ...options,
  })
}

export const pricePerMonth = (rate: number, conversionFactor = 730) =>
  formatPrice(rate * conversionFactor, { maximumFractionDigits: 0 })

export const pricePerHour = (rate: number) =>
  formatPrice(rate, { minimumFractionDigits: 3 })
