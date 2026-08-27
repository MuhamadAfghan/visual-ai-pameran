const CHECK_LABELS: Record<string, string> = {
  person_count:        "Kepadatan Orang",
  red_zone_count:      "Intrusi Zona Terlarang",
  helmet_count:        "Pemakaian Helm Keselamatan",
  vest_count:          "Pemakaian Rompi Safety",
  mask_count:          "Pemakaian Masker",
  fall_detected_count: "Indikasi Jatuh",
  goggles_count:       "Pemakaian Kacamata Safety",
  gloves_count:        "Pemakaian Sarung Tangan",
  ladder_count:        "Penggunaan Tangga",
  safety_cone_count:   "Keberadaan Safety Cone",
};

export function toLabel(check: string): string {
  return CHECK_LABELS[check] ?? check.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
