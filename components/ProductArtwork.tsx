"use client";

import React, { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import {
  Smartphone,
  Laptop,
  Headphones,
  Watch,
  Tablet,
  Utensils,
  Mouse,
  HardDrive,
  Camera,
  Tv,
} from "lucide-react";

import heroShowcaseImg from "@/src/assets/images/hero_electronics_showcase_1792856739200.jpg";
import smartphoneImg from "@/src/assets/images/product_smartphone_studio_1792856739883.jpg";
import laptopImg from "@/src/assets/images/product_laptop_studio_1792856741314.jpg";
import audioImg from "@/src/assets/images/product_audio_studio_1792856741646.jpg";
import applianceImg from "@/src/assets/images/product_home_appliance_1792856742981.jpg";
import wearableImg from "@/src/assets/images/product_wearable_smartwatch_1792938775463.jpg";
import tabletImg from "@/src/assets/images/product_tablet_stylus_1792938777064.jpg";
import cameraImg from "@/src/assets/images/product_camera_mirrorless_1792938777479.jpg";
import accessoriesImg from "@/src/assets/images/product_accessories_desk_1792938779222.jpg";
import smartTvImg from "@/src/assets/images/product_smart_tv_display_1792938779198.jpg";

export { heroShowcaseImg };

const CATEGORY_STUDIO_PHOTO: Record<string, StaticImageData> = {
  Smartphones: smartphoneImg,
  Laptops: laptopImg,
  Audio: audioImg,
  Wearables: wearableImg,
  Tablets: tabletImg,
  Appliances: applianceImg,
  Accessories: accessoriesImg,
  "Storage & Wi-Fi": accessoriesImg,
  Cameras: cameraImg,
  "TV & Lifestyle": smartTvImg,
};

function CategoryIcon({ category, className }: { category: string | null; className?: string }) {
  switch (category) {
    case "Smartphones":
      return <Smartphone className={className} />;
    case "Laptops":
      return <Laptop className={className} />;
    case "Audio":
      return <Headphones className={className} />;
    case "Wearables":
      return <Watch className={className} />;
    case "Tablets":
      return <Tablet className={className} />;
    case "Appliances":
      return <Utensils className={className} />;
    case "Accessories":
      return <Mouse className={className} />;
    case "Storage & Wi-Fi":
      return <HardDrive className={className} />;
    case "Cameras":
      return <Camera className={className} />;
    case "TV & Lifestyle":
    default:
      return <Tv className={className} />;
  }
}

interface ProductArtworkProps {
  imageUrl?: string | null;
  remoteImageUrl?: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  deviceType: string | null;
  productName: string;
  specs?: Record<string, string | number | boolean>;
}

const ALLOWED_REMOTE_IMAGE_HOSTS = new Set([
  "m.media-amazon.com",
  "images-eu.ssl-images-amazon.com",
  "rukminim2.flixcart.com",
]);

function isConfiguredNextImageSrc(src?: string | null): src is string {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  try {
    const parsed = new URL(src);
    return parsed.protocol === "https:" && ALLOWED_REMOTE_IMAGE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const ProductArtwork: React.FC<ProductArtworkProps> = ({
  imageUrl,
  remoteImageUrl,
  category,
  brand,
  model,
  deviceType,
  productName,
  specs,
}) => {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [remoteBackupFailed, setRemoteBackupFailed] = useState(false);
  const [studioFailed, setStudioFailed] = useState(false);

  useEffect(() => {
    setPrimaryFailed(false);
    setRemoteBackupFailed(false);
    setStudioFailed(false);
  }, [imageUrl, remoteImageUrl]);

  const studioImg = (category && CATEGORY_STUDIO_PHOTO[category]) || smartphoneImg;
  const specEntries = Object.entries(specs ?? {}).slice(0, 2);
  const safePrimarySrc = isConfiguredNextImageSrc(imageUrl) ? imageUrl : null;
  const safeBackupSrc = isConfiguredNextImageSrc(remoteImageUrl) ? remoteImageUrl : null;

  // Stage 1: Verified local /products/<ASIN>.jpg or configured marketplace CDN
  if (safePrimarySrc && !primaryFailed) {
    return (
      <div className="relative w-full h-full bg-white overflow-hidden select-none">
        <Image
          src={safePrimarySrc}
          alt={productName}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]"
          referrerPolicy="no-referrer"
          onError={() => setPrimaryFailed(true)}
        />
      </div>
    );
  }

  // Stage 2: Verified remote Amazon/Flipkart CDN backup URL (if distinct from primary)
  if (safeBackupSrc && safeBackupSrc !== safePrimarySrc && !remoteBackupFailed) {
    return (
      <div className="relative w-full h-full bg-white overflow-hidden select-none">
        <Image
          src={safeBackupSrc}
          alt={productName}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]"
          referrerPolicy="no-referrer"
          onError={() => setRemoteBackupFailed(true)}
        />
      </div>
    );
  }

  // Stage 3: High-resolution studio photography for all 10 hardware departments
  if (studioImg && !studioFailed) {
    return (
      <div className="relative w-full h-full bg-zinc-100 dark:bg-slate-800 overflow-hidden select-none">
        <Image
          src={studioImg}
          alt={productName}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          referrerPolicy="no-referrer"
          onError={() => setStudioFailed(true)}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 py-2 flex items-end justify-between text-[11px] text-white">
          <span className="font-semibold truncate">{brand ?? "Verified"}</span>
          {model && <span className="font-mono text-white/80 truncate ml-2">{model}</span>}
        </div>
      </div>
    );
  }

  // Stage 4: Hardware specification card
  return (
    <div className="relative w-full h-full bg-gradient-to-br from-zinc-100 via-slate-100 to-zinc-200/80 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col items-center justify-center p-5 text-center select-none overflow-hidden">
      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200/90 dark:border-slate-700 shadow-xs flex items-center justify-center text-slate-700 dark:text-slate-200 mb-3 transition-transform duration-200 group-hover:scale-105">
        <CategoryIcon category={category} className="w-8 h-8 stroke-[1.6]" />
      </div>
      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate max-w-full">
        {brand ? `${brand}${model ? ` · ${model}` : ""}` : productName}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full mt-0.5">
        {deviceType ?? category ?? "Electronics"}
      </div>
      {specEntries.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-full">
          {specEntries.map(([, v]) => String(v)).join(" · ")}
        </div>
      )}
    </div>
  );
};
