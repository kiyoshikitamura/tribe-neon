"use client";
import React from 'react';
import { useGame } from '../../context/GameContext';
import OutlawButton from '../ui/OutlawButton';
export default function RaidRescueLink({ rescueId, onOpen }: { rescueId: unknown; onOpen?: () => void }) {
  const { openRaidRescue } = useGame();
  if (process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED !== 'true' || typeof rescueId !== 'string' || !rescueId.trim()) return null;
  return <OutlawButton loadingLabel="" aria-label="救援先を開く" onClick={() => { openRaidRescue(rescueId); onOpen?.(); }}>救援先を開く</OutlawButton>;
}
