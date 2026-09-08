export const GLASSES = '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l2-5h3m15 5-2-5h-3M10 13h4"/><rect x="2" y="11" width="8" height="6" rx="2"/><rect x="14" y="11" width="8" height="6" rx="2"/></g>';
export const MOTORCYCLE = '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="16" r="3.5"/><circle cx="19" cy="16" r="3.5"/><path d="m5 16 5-7 4 7H5m8-10h3l3 10M8 9H5m5 0h7m-5 4 3-4"/></g>';
export function pinSvg(kind, selected = false) {
  const fill = kind === "dealership" ? "#20201e" : "#f15a22";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 41S1 26 1 16a15 15 0 0 1 30 0c0 10-15 25-15 25Z" fill="${fill}" stroke="${selected ? "#fff" : "#111"}" stroke-width="2"/><g transform="translate(4 3)" color="${kind === "dealership" ? "#fff" : "#111"}">${kind === "dealership" ? MOTORCYCLE : GLASSES}</g></svg>`;
}
