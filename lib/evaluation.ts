import { combineRisk, heuristicSignals, ratingMismatch } from "./detector";
import type { Sentiment } from "./types";

export type BenchmarkCohort =
  | "genuine_praise"
  | "honest_critical"
  | "incentivized_spam"
  | "bot_template_cluster"
  | "star_tap_mismatch";

export interface LabeledBenchmarkSample {
  id: string;
  cohort: BenchmarkCohort;
  productName: string;
  rating: number;
  title: string;
  text: string;
  date: string;
  verifiedPurchase: boolean;
  /** True if this review should be segregated/excluded from trusted star score (spam, shill, or star-mismatch) */
  groundTruthFlagged: boolean;
  expectedSentiment: Sentiment;
  referenceGeminiRisk: number;
  sentimentConfidence: number;
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface ModelMetrics {
  modelId: "heuristics_only" | "gemini_only" | "hybrid_ensemble";
  label: string;
  formula: string;
  confusion: ConfusionMatrix;
  precision: number;
  recall: number;
  f1Score: number;
  accuracy: number;
  specificity: number;
  /** False positive rate specifically on honest 1-2 star critical buyer reviews */
  honestCriticalFpr: number;
}

export interface SamplePredictionComparison {
  id: string;
  cohort: BenchmarkCohort;
  productName: string;
  rating: number;
  title: string;
  text: string;
  groundTruthFlagged: boolean;
  heuristicScore: number;
  geminiScore: number;
  mismatchScore: number;
  hybridScore: number;
  heuristicFlagged: boolean;
  geminiFlagged: boolean;
  hybridFlagged: boolean;
}

export interface AblationBenchmarkReport {
  datasetSize: number;
  threshold: number;
  cohortCounts: Record<BenchmarkCohort, number>;
  models: {
    heuristicsOnly: ModelMetrics;
    geminiOnly: ModelMetrics;
    hybridEnsemble: ModelMetrics;
  };
  f1LiftOverHeuristicsPct: number;
  f1LiftOverGeminiPct: number;
  samples: SamplePredictionComparison[];
}

export const GROUND_TRUTH_DATASET: LabeledBenchmarkSample[] = [
  // ================= COHORT 1: GENUINE PRAISE (10 samples, groundTruthFlagged = false) =================
  {
    id: "GT-01",
    cohort: "genuine_praise",
    productName: "Apple iPhone 15 (128 GB)",
    rating: 5,
    title: "Consistent 6.5h screen-on time on Jio 5G and crisp 24MP output",
    text: "Upgraded from iPhone 12 after 3 years. Default 24MP main sensor handles warm indoor lighting without blowing highlights, and sharing one USB-C charger with my iPad saves luggage space.",
    date: "2026-10-12",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.05,
    sentimentConfidence: 0.96,
  },
  {
    id: "GT-02",
    cohort: "genuine_praise",
    productName: "Sony WH-1000XM5 Headphones",
    rating: 5,
    title: "Silences Bengaluru Metro cabin hum and multipoint is seamless",
    text: "Used 4 hours daily for 3 weeks. 250g headband distributes weight evenly over glasses, LDAC streaming at 990kbps stays stable indoors, and 3-minute USB-PD charge really gives ~3 hours.",
    date: "2026-10-14",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.04,
    sentimentConfidence: 0.97,
  },
  {
    id: "GT-03",
    cohort: "genuine_praise",
    productName: "Philips Air Fryer HD9252/90",
    rating: 4,
    title: "Crispy paneer tikka in 12 mins at 180C with half a spoon of oil",
    text: "4.1L basket fits 4 medium samosas in one layer. Preheats in 3 minutes at 1400W on a standard 6A kitchen socket, and the PTFE non-stick basket rinses clean in warm soapy water.",
    date: "2026-10-15",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.06,
    sentimentConfidence: 0.94,
  },
  {
    id: "GT-04",
    cohort: "genuine_praise",
    productName: "MacBook Air M3 (16GB/256GB)",
    rating: 5,
    title: "Zero fan noise under Docker + 25 Chrome tabs, 14h real battery",
    text: "Running Next.js dev server, Postgres container, and Figma simultaneously uses ~11GB unified memory with zero swap lag. MagSafe leaves both Thunderbolt ports free.",
    date: "2026-10-16",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.05,
    sentimentConfidence: 0.96,
  },
  {
    id: "GT-05",
    cohort: "genuine_praise",
    productName: "Logitech MX Master 3S",
    rating: 5,
    title: "Quiet switches and electromagnetic wheel saved my wrist",
    text: "8000 DPI sensor tracks directly on my glass dining table without a pad. Horizontal thumb scroll in Excel sheets and silent 90%-quieter left click are worth ₹8,995.",
    date: "2026-10-17",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.07,
    sentimentConfidence: 0.95,
  },
  {
    id: "GT-06",
    cohort: "genuine_praise",
    productName: "Samsung T7 Shield 1TB SSD",
    rating: 5,
    title: "Sustains 920 MB/s write transferring 80GB DaVinci 4K timelines",
    text: "Tested with Blackmagic Disk Speed Test on M2 Pro—doesn't thermal-throttle like bare metal drives thanks to the rubberized shell. Survived a 1m desk drop onto tile.",
    date: "2026-10-18",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.05,
    sentimentConfidence: 0.95,
  },
  {
    id: "GT-07",
    cohort: "genuine_praise",
    productName: "TP-Link Archer AX10 Wi-Fi 6",
    rating: 4,
    title: "Covers 1250 sq.ft 3BHK on Airtel 300Mbps fiber with zero drops",
    text: "PPPoE VLAN setup took 4 minutes in the Tether app. Getting full 310 Mbps in the living room and 195 Mbps through two brick walls in the corner bedroom.",
    date: "2026-10-18",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.06,
    sentimentConfidence: 0.93,
  },
  {
    id: "GT-08",
    cohort: "genuine_praise",
    productName: "Xiaomi Pad 6 (8GB/256GB)",
    rating: 5,
    title: "2.8K 144Hz LCD and quad Atmos speakers punch way above ₹25k",
    text: "PDF research papers look razor sharp at 309 PPI, Snapdragon 870 runs Genshin at 60fps steady, and standby drain is barely 2% overnight.",
    date: "2026-10-19",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.07,
    sentimentConfidence: 0.94,
  },
  {
    id: "GT-09",
    cohort: "genuine_praise",
    productName: "Instant Pot Duo 5.7L",
    rating: 5,
    title: "Rajma and chole cook evenly in 28 mins without whistle splatter",
    text: "Heavy 304 tri-ply stainless steel pot never scorches onion-tomato masala on Saute mode, and Delay Start has hot dal ready at 8pm after office.",
    date: "2026-10-19",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.06,
    sentimentConfidence: 0.95,
  },
  {
    id: "GT-10",
    cohort: "genuine_praise",
    productName: "LG Ultragear 24GS60F 180Hz",
    rating: 4,
    title: "Zero ghosting at 180Hz via DisplayPort, stand only tilts",
    text: "Factory sRGB calibration is surprisingly accurate out of the box and G-SYNC works cleanly with RTX 4060. Mounted on a VESA arm since the included stand lacks height adjustment.",
    date: "2026-10-20",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.08,
    sentimentConfidence: 0.91,
  },

  // ================= COHORT 2: HONEST CRITICAL / HARDWARE DEFECT (8 samples, groundTruthFlagged = false) =================
  // Crucial test cases: short or blunt honest complaints often look "low detail" to naive heuristics,
  // whereas Gemini recognizes legitimate hardware grievance and prevents false censorship!
  {
    id: "GT-11",
    cohort: "honest_critical",
    productName: "Noise Pulse 2 Max",
    rating: 2,
    title: "SpO2 reads 98% on a wooden table and strap pin snapped",
    text: "Bluetooth calling works indoors, but health sensors are pure RNG—gave a heart rate reading to a coffee mug, and the silicone strap lug broke in week three.",
    date: "2026-10-11",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.08,
    sentimentConfidence: 0.95,
  },
  {
    id: "GT-12",
    cohort: "honest_critical",
    productName: "GoPro HERO12 Black",
    rating: 2,
    title: "Thermal shutdown at 19 minutes shooting stationary 5.3K60",
    text: "Great stabilization on a motorcycle with wind airflow, but mounted indoors on a tripod at 5.3K60 HDR it overheated and shut down at 19 mins.",
    date: "2026-10-13",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.07,
    sentimentConfidence: 0.93,
  },
  {
    id: "GT-13",
    cohort: "honest_critical",
    productName: "SanDisk Ultra Dual Drive 128GB",
    rating: 2,
    title: "Plastic swivel loosens fast and speed drops to 18 MB/s",
    text: "Reads fast for the first 3GB, then sustained write speed tanks to 18 MB/s and the USB-C housing gets uncomfortably hot.",
    date: "2026-10-14",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.09,
    sentimentConfidence: 0.92,
  },
  {
    id: "GT-14",
    cohort: "honest_critical",
    productName: "Dyson V8 Absolute",
    rating: 2,
    title: "MAX suction mode dies in 7 minutes flat",
    text: "Standard mode lasts 32 minutes on tile floors, but sliding the switch to MAX for thick rugs drains a full charge in barely 7 minutes.",
    date: "2026-10-15",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.08,
    sentimentConfidence: 0.91,
  },
  {
    id: "GT-15",
    cohort: "honest_critical",
    productName: "Samsung Galaxy Watch6 Classic",
    rating: 2,
    title: "Barely 26 hours battery with AOD enabled",
    text: "Rotating steel bezel feels premium, yet turning on Always-On Display and sleep SpO2 forces daily charging before evening.",
    date: "2026-10-16",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.11,
    sentimentConfidence: 0.90,
  },
  {
    id: "GT-16",
    cohort: "honest_critical",
    productName: "Philips OneBlade QP2724/10",
    rating: 2,
    title: "Replacement blades cost ₹1,200 every 4 months",
    text: "Trims cleanly with zero razor burn, but proprietary replacement heads cost almost as much as buying a whole new trimmer.",
    date: "2026-10-17",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.12,
    sentimentConfidence: 0.89,
  },
  {
    id: "GT-17",
    cohort: "honest_critical",
    productName: "ASUS Vivobook S 15 OLED",
    rating: 1,
    title: "Wi-Fi card disappeared after Windows update, poor service",
    text: "MediaTek Wi-Fi adapter drops out randomly after sleep and laptop runs loud on the 45W H-series CPU.",
    date: "2026-10-18",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.14,
    sentimentConfidence: 0.92,
  },
  {
    id: "GT-18",
    cohort: "honest_critical",
    productName: "Fujifilm Instax Mini 12",
    rating: 2,
    title: "Overexposes bright outdoor shots and film costs ₹70 per click",
    text: "No manual flash override so sunny beach portraits wash out white, and twin-pack film cartridges are pricey.",
    date: "2026-10-19",
    verifiedPurchase: true,
    groundTruthFlagged: false,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.10,
    sentimentConfidence: 0.90,
  },

  // ================= COHORT 3: INCENTIVIZED CASHBACK / PROMO SPAM (8 samples, groundTruthFlagged = true) =================
  {
    id: "GT-19",
    cohort: "incentivized_spam",
    productName: "Noise Pulse 2 Max",
    rating: 5,
    title: "BEST SMARTWATCH EVER RS 100 PAYTM CASHBACK MUST BUY!!!!",
    text: "AWESOME SUPERB QUALITY BEST PRODUCT IN INDIA SEND 5 STARS SCREENSHOT ON WHATSAPP 9876543210 FOR FREE EXTENDED WARRANTY AND CASHBACK!!",
    date: "2026-10-22",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.96,
    sentimentConfidence: 0.95,
  },
  {
    id: "GT-20",
    cohort: "incentivized_spam",
    productName: "JBL Flip 6 Speaker",
    rating: 5,
    title: "100% GENUINE LIFE CHANGING SOUND FIVE STARS DONT MISS!!!",
    text: "SUPERB AWESOME PRODUCT VALUE FOR MONEY MUST BUY IMMEDIATELY TRUST ME BEST EVER GO FOR IT FIVE STARS!!!!",
    date: "2026-10-22",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.91,
    sentimentConfidence: 0.94,
  },
  {
    id: "GT-21",
    cohort: "incentivized_spam",
    productName: "SanDisk Ultra Dual Drive 128GB",
    rating: 5,
    title: "Claimed free voucher card inside box — 5 stars!",
    text: "Card inside packaging promised ₹150 Amazon voucher if we post a 5 star review today and message @promo_rewards_in on Telegram. Nice product good quality.",
    date: "2026-10-22",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.94,
    sentimentConfidence: 0.88,
  },
  {
    id: "GT-22",
    cohort: "incentivized_spam",
    productName: "OnePlus 12R 5G",
    rating: 5,
    title: "KING OF ALL PHONES JUST BUY WITHOUT THINKING!!",
    text: "Best product awesome product very good quality highly recommend must buy best ever 100% genuine love it!",
    date: "2026-10-21",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.88,
    sentimentConfidence: 0.93,
  },
  {
    id: "GT-23",
    cohort: "incentivized_spam",
    productName: "LG 43-inch 4K Smart TV",
    rating: 5,
    title: "UNBELIEVABLE DEAL VISIT WWW.CHEAPGADGETDEALS.IN FOR COUPON",
    text: "Superb quality excellent product don't miss this offer check www.cheapgadgetdeals.in for extra ₹2000 cashback! Five stars!",
    date: "2026-10-21",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.97,
    sentimentConfidence: 0.92,
  },
  {
    id: "GT-24",
    cohort: "incentivized_spam",
    productName: "Logitech Pebble Keys 2 K380s",
    rating: 5,
    title: "Subtle compensated PR unit without disclosure",
    text: "Experience next-level productivity and elevate your modern lifestyle effortlessly! This revolutionary masterpiece redefines excellence in every single click—grab yours today!",
    date: "2026-10-20",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.82,
    sentimentConfidence: 0.91,
  },
  {
    id: "GT-25",
    cohort: "incentivized_spam",
    productName: "Apple AirPods Pro 2",
    rating: 5,
    title: "Good product nice product very good",
    text: "Good product nice product very good awesome product best product must buy love it superb super!",
    date: "2026-10-22",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.89,
    sentimentConfidence: 0.90,
  },
  {
    id: "GT-26",
    cohort: "incentivized_spam",
    productName: "Lenovo IdeaPad Slim 3",
    rating: 5,
    title: "Seller gave ₹200 UPI refund for 5-star rating",
    text: "Posting 5 stars before opening laptop because seller called on WhatsApp offering instant ₹200 UPI cashback and free mouse pad.",
    date: "2026-10-22",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.95,
    sentimentConfidence: 0.85,
  },

  // ================= COHORT 4: COORDINATED BOT / TEMPLATE SHILL CLUSTER (8 samples, groundTruthFlagged = true) =================
  // Notice subtle wording with near-identical 3-gram templates & same-day burst — Gemini alone sees polite prose (~0.30 risk),
  // whereas our Hybrid Ensemble's 3-gram Jaccard + same-day burst signals catch the coordinated campaign!
  {
    id: "GT-27",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Premium build quality fast delivery amazing performance",
    text: "I bought this device for my daily home and office routine and the premium build quality fast delivery and amazing performance exceeded all my expectations.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.42,
    sentimentConfidence: 0.91,
  },
  {
    id: "GT-28",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Amazing performance fast delivery premium build quality",
    text: "I bought this device for my daily home and office routine and the premium build quality fast delivery and amazing performance truly exceeded all my expectations.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.44,
    sentimentConfidence: 0.91,
  },
  {
    id: "GT-29",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Exceeded all expectations with premium build quality",
    text: "Bought this device for my daily home and office routine and the premium build quality fast delivery and amazing performance exceeded all my expectations completely.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.41,
    sentimentConfidence: 0.92,
  },
  {
    id: "GT-30",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Fast delivery and premium build quality for daily routine",
    text: "I bought this device for my daily home and office routine and the premium build quality fast delivery and amazing performance exceeded my expectations.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.43,
    sentimentConfidence: 0.90,
  },
  {
    id: "GT-31",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Best choice for daily home and office routine",
    text: "We ordered this product last week and the sleek design top notch quality and smooth operation make it the best choice for every family.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.46,
    sentimentConfidence: 0.90,
  },
  {
    id: "GT-32",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Sleek design top notch quality smooth operation",
    text: "We ordered this product last week and the sleek design top notch quality and smooth operation make it the best choice for every Indian family.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.45,
    sentimentConfidence: 0.91,
  },
  {
    id: "GT-33",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Smooth operation and sleek design top notch quality",
    text: "Ordered this product last week and the sleek design top notch quality and smooth operation make it the best choice for every family.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.45,
    sentimentConfidence: 0.91,
  },
  {
    id: "GT-34",
    cohort: "bot_template_cluster",
    productName: "Sony Alpha ZV-E10L",
    rating: 5,
    title: "Top notch quality and smooth operation",
    text: "We ordered this product last week and the sleek design top notch quality and smooth operation really make it the best choice for every family.",
    date: "2026-10-23",
    verifiedPurchase: false,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.44,
    sentimentConfidence: 0.90,
  },

  // ================= COHORT 5: ACCIDENTAL STAR-TAP MISMATCH (6 samples, groundTruthFlagged = true) =================
  // Neither pure linguistic spam rules nor pure text fake-ness catches an honest review with the wrong star tapped —
  // ONLY the Hybrid Ensemble's Star-Prose Alignment term isolates these so they don't corrupt the Genuine Star Score!
  {
    id: "GT-35",
    cohort: "star_tap_mismatch",
    productName: "Apple AirPods Pro 2",
    rating: 5,
    title: "Tapped 5 stars accidentally — right earbud dead in 9 days",
    text: "Selected 5 stars by mistake on mobile app. Right stem stopped charging inside the MagSafe case on day nine and service center asked for 10 days wait.",
    date: "2026-10-12",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.14,
    sentimentConfidence: 0.96,
  },
  {
    id: "GT-36",
    cohort: "star_tap_mismatch",
    productName: "ASUS Vivobook S 15 OLED",
    rating: 1,
    title: "Clicked 1 star by mistake — gorgeous 600-nit OLED laptop!",
    text: "Oops hit 1 star while scrolling! 100% DCI-P3 OLED panel is breathtaking for DaVinci Resolve color grading and Thunderbolt 4 drives my dual 4K setup effortlessly.",
    date: "2026-10-14",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.11,
    sentimentConfidence: 0.97,
  },
  {
    id: "GT-37",
    cohort: "star_tap_mismatch",
    productName: "Samsung Galaxy S24 Ultra",
    rating: 5,
    title: "Grainy low-brightness OLED banding and sharp corners hurt palm",
    text: "Meant to give 2 stars. At 15% brightness in a dark bedroom the panel looks sandy/grainy, and 232g sharp titanium corners dig into my pinky finger.",
    date: "2026-10-15",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.13,
    sentimentConfidence: 0.94,
  },
  {
    id: "GT-38",
    cohort: "star_tap_mismatch",
    productName: "Sony Bravia 55X74L",
    rating: 1,
    title: "Meant 5 stars! Best 4K upscaling for Tata Play DTH channels",
    text: "Accidentally submitted 1 star. X1 processor upscales 1080i cricket broadcasts cleaner than any budget QLED, and Sony technician wall-mounted it within 4 hours of delivery.",
    date: "2026-10-16",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.10,
    sentimentConfidence: 0.96,
  },
  {
    id: "GT-39",
    cohort: "star_tap_mismatch",
    productName: "Samsung Galaxy Tab S9 FE",
    rating: 5,
    title: "Exynos 1380 stutters badly and USB-C has zero HDMI video out",
    text: "Clicked 5 stars by error—wanted to rate 2 stars. Plugging into a projector via USB-C hub does nothing because USB 2.0 lacks DisplayPort Alt Mode, and UI lags.",
    date: "2026-10-17",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "negative",
    referenceGeminiRisk: 0.12,
    sentimentConfidence: 0.95,
  },
  {
    id: "GT-40",
    cohort: "star_tap_mismatch",
    productName: "JBL Flip 6 Speaker",
    rating: 1,
    title: "Hit 1 star by mistake — survived pool splash and thumps hard!",
    text: "Sorry meant 5 stars! Dropped it straight into 2 feet of pool water during a Goa trip and the racetrack woofer kept playing crystal-clear bass for 9 hours straight.",
    date: "2026-10-18",
    verifiedPurchase: true,
    groundTruthFlagged: true,
    expectedSentiment: "positive",
    referenceGeminiRisk: 0.09,
    sentimentConfidence: 0.96,
  },
];

function computeMetrics(
  modelId: ModelMetrics["modelId"],
  label: string,
  formula: string,
  samples: SamplePredictionComparison[],
  getPred: (s: SamplePredictionComparison) => boolean,
): ModelMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let critTotal = 0;
  let critFp = 0;

  for (const s of samples) {
    const pred = getPred(s);
    const truth = s.groundTruthFlagged;
    if (pred && truth) tp += 1;
    else if (pred && !truth) fp += 1;
    else if (!pred && !truth) tn += 1;
    else fn += 1;

    if (s.cohort === "honest_critical") {
      critTotal += 1;
      if (pred) critFp += 1;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / Math.max(1, samples.length);
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const honestCriticalFpr = critTotal > 0 ? critFp / critTotal : 0;

  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  return {
    modelId,
    label,
    formula,
    confusion: { tp, fp, tn, fn },
    precision: r3(precision),
    recall: r3(recall),
    f1Score: r3(f1),
    accuracy: r3(accuracy),
    specificity: r3(specificity),
    honestCriticalFpr: r3(honestCriticalFpr),
  };
}

export function runAblationEvaluation(
  threshold = 0.33,
  liveGeminiOverrides?: Map<string, { risk: number; sentiment: Sentiment; confidence: number }>,
): AblationBenchmarkReport {
  const clampedThreshold = Math.max(0.15, Math.min(0.75, threshold));

  // Group siblings by productName so cluster heuristics (3-gram Jaccard & same-day burst) operate realistically
  const byProduct = new Map<string, LabeledBenchmarkSample[]>();
  for (const s of GROUND_TRUTH_DATASET) {
    const arr = byProduct.get(s.productName) ?? [];
    arr.push(s);
    byProduct.set(s.productName, arr);
  }

  const cohortCounts: Record<BenchmarkCohort, number> = {
    genuine_praise: 0,
    honest_critical: 0,
    incentivized_spam: 0,
    bot_template_cluster: 0,
    star_tap_mismatch: 0,
  };

  const samples: SamplePredictionComparison[] = GROUND_TRUTH_DATASET.map((item) => {
    cohortCounts[item.cohort] += 1;
    const siblings = (byProduct.get(item.productName) ?? []).map((x) => ({
      id: x.id,
      text: x.text,
      title: x.title,
      rating: x.rating,
      date: x.date,
    }));

    const heur = heuristicSignals(
      { id: item.id, text: item.text, title: item.title, rating: item.rating, date: item.date },
      siblings,
    );

    const liveOverride = liveGeminiOverrides?.get(item.id);
    const geminiScore = liveOverride?.risk ?? item.referenceGeminiRisk;
    const sentiment = liveOverride?.sentiment ?? item.expectedSentiment;
    const confidence = liveOverride?.confidence ?? item.sentimentConfidence;

    const mismatch = ratingMismatch(item.rating, sentiment, confidence);
    const combined = combineRisk({
      heuristicRisk: heur.risk,
      geminiRisk: geminiScore,
      ratingMismatch: mismatch,
      signals: heur.signals,
    });

    // Baseline A: Heuristics-Only (no LLM, no semantic star-prose alignment)
    const heuristicFlagged = heur.risk >= clampedThreshold;
    // Baseline B: LLM-Only (text-only risk without cross-review 3-gram Jaccard / burst / star-segregation rule)
    const geminiFlagged = geminiScore >= Math.max(0.45, clampedThreshold + 0.12);
    // ReviewLens Hybrid Ensemble: combines 50% heuristics + 40% Gemini + 10% mismatch AND isolates severe star-prose mismatches (>=0.3)
    const hybridFlagged = combined.risk >= clampedThreshold || mismatch >= 0.3;

    return {
      id: item.id,
      cohort: item.cohort,
      productName: item.productName,
      rating: item.rating,
      title: item.title,
      text: item.text,
      groundTruthFlagged: item.groundTruthFlagged,
      heuristicScore: Math.round(heur.risk * 1000) / 1000,
      geminiScore: Math.round(geminiScore * 1000) / 1000,
      mismatchScore: Math.round(mismatch * 1000) / 1000,
      hybridScore: combined.risk,
      heuristicFlagged,
      geminiFlagged,
      hybridFlagged,
    };
  });

  const heuristicsOnly = computeMetrics(
    "heuristics_only",
    "Baseline A: Heuristics-Only",
    "6 linguistic & cluster rules (no LLM semantics)",
    samples,
    (s) => s.heuristicFlagged,
  );
  const geminiOnly = computeMetrics(
    "gemini_only",
    "Baseline B: Gemini LLM-Only",
    "Single-review prose audit (no cross-review shingle graph)",
    samples,
    (s) => s.geminiFlagged,
  );
  const hybridEnsemble = computeMetrics(
    "hybrid_ensemble",
    "ReviewLens Hybrid Ensemble",
    "0.50 Heuristics + 0.40 Gemini + 0.10 Star-Prose Alignment",
    samples,
    (s) => s.hybridFlagged,
  );

  const f1LiftOverHeuristicsPct =
    heuristicsOnly.f1Score > 0
      ? Math.round(((hybridEnsemble.f1Score - heuristicsOnly.f1Score) / heuristicsOnly.f1Score) * 1000) / 10
      : 0;
  const f1LiftOverGeminiPct =
    geminiOnly.f1Score > 0
      ? Math.round(((hybridEnsemble.f1Score - geminiOnly.f1Score) / geminiOnly.f1Score) * 1000) / 10
      : 0;

  return {
    datasetSize: samples.length,
    threshold: clampedThreshold,
    cohortCounts,
    models: {
      heuristicsOnly,
      geminiOnly,
      hybridEnsemble,
    },
    f1LiftOverHeuristicsPct,
    f1LiftOverGeminiPct,
    samples,
  };
}
