// テーマ→関連キーワード（トピックページのタグ表示用）。
// ※ config/targets.yaml の arxiv_keywords をミラーした静的マップ。
//   yaml を更新したらこちらも合わせて更新すること（二重管理）。

export const THEME_KEYWORDS: Record<string, string[]> = {
  advanced_semiconductor: ["GPU accelerator", "AI chip"],
  generative_ai: ["large language model", "generative model"],
  cloud_infra: ["cloud computing", "datacenter scheduling"],
  cooling_power_infra: ["data center cooling", "power grid optimization"],
  edge_ai_robotics: ["edge inference", "robot learning"],
  bioinformatics: ["computational biology", "protein structure prediction"],
  entertainment_content: ["game ai", "procedural content generation"],
  quantum_computing: ["quantum computing", "quantum error correction"],
  space_infra: ["satellite communication", "low earth orbit"],
  nextgen_energy: ["small modular reactor", "nuclear fusion", "plasma confinement", "grid scale energy storage"],
  synthetic_biology: ["synthetic biology", "genome design", "directed evolution"],
  hydrogen_fuelcell: ["hydrogen fuel cell", "water electrolysis", "green hydrogen"],
  solid_state_battery: ["solid-state battery", "lithium metal anode", "battery electrolyte"],
  cybersecurity: ["network security", "intrusion detection", "malware detection"],
  data_center: ["data center networking", "datacenter energy", "server consolidation"],
};

// テーマID→日本語表示名（マルチ事業企業のタグ表示などに使用）。yaml とミラー。
export const THEME_NAMES: Record<string, string> = {
  advanced_semiconductor: "先端半導体",
  generative_ai: "生成AI",
  cloud_infra: "クラウド",
  cooling_power_infra: "冷却・電力",
  edge_ai_robotics: "エッジAI・ロボ",
  bioinformatics: "バイオインフォ",
  entertainment_content: "エンタメ",
  quantum_computing: "量子",
  space_infra: "宇宙",
  nextgen_energy: "次世代エネルギー",
  synthetic_biology: "合成生物学",
  hydrogen_fuelcell: "水素",
  solid_state_battery: "固体電池",
  cybersecurity: "サイバーセキュリティ",
  data_center: "データセンター",
};
export const themeLabel = (id: string) => THEME_NAMES[id] ?? id;
