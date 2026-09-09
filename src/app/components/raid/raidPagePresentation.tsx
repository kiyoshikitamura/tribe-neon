"use client";
import "./raidPagePresentation.css";
import { useEffect, useState, type CSSProperties } from "react";
import { preloadAssetManifest, type AssetRequest, type AssetResult } from "@/app/lib/screenAssets";
import { getCharacterPresentationMetadata } from "../character/characterPresentationMetadata";
export const RAID_PERSON_FALLBACK="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect width='128' height='128' fill='%23151d2a'/%3E%3Ccircle cx='64' cy='40' r='18' fill='%23697482'/%3E%3Cpath d='M24 128V100a40 40 0 0 1 80 0v28' fill='%23697482'/%3E%3C/svg%3E";
export const RAID_BACKGROUND_FALLBACK="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cpath fill='%23151d2a' d='M0 0h128v128H0z'/%3E%3C/svg%3E";
export function useRaidPageAssets(manifest: AssetRequest[]) {
 const key=JSON.stringify(manifest); const [result,setResult]=useState<{key:string;items:AssetResult[]}|null>(null);const [revision,setRevision]=useState(0);
 useEffect(()=>{let cancelled=false;void preloadAssetManifest(JSON.parse(key)).then(items=>{if(!cancelled)setResult({key,items});});return()=>{cancelled=true;};},[key,revision]);
 return {ready:result?.key===key,failed:result?.items.some(item=>item.status==='failed')??false,resolve:(src:string)=>result?.items.find(item=>item.requestedSrc===src)?.resolvedSrc??RAID_PERSON_FALLBACK,retry:()=>{setResult(null);setRevision(value=>value+1);}};
}
export function RaidPagePortrait({src,name=""}:{src:string;name?:string}) {const crop=getCharacterPresentationMetadata(src);const style={"--raid-page-scale":src.startsWith('data:')?1:crop.thumbnailScale,"--raid-page-x":`${crop.thumbnailX}%`,"--raid-page-y":`${crop.thumbnailY}%`} as CSSProperties;return <img className="raid-page-portrait" style={style} src={src} alt={name}/>;}
export function RaidPageSpinner(){return <div className="raid-page-wait" role="status" aria-label="通信中"><span className="spinner" aria-hidden="true"/></div>;}
