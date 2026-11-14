import { BilingualText } from './types';

export interface AvatarOption {
  id: string;
  label: BilingualText;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'investor', label: { th: 'นักลงทุน', en: 'Investor' } },
  { id: 'tycoon', label: { th: 'มหาเศรษฐี', en: 'Tycoon' } },
  { id: 'rocket', label: { th: 'สตาร์ทอัพ', en: 'Venture' } },
  { id: 'diamond', label: { th: 'นักสะสม', en: 'Collector' } },
  { id: 'compass', label: { th: 'นักสำรวจ', en: 'Explorer' } },
  { id: 'shield', label: { th: 'ผู้พิทักษ์', en: 'Guardian' } },
  { id: 'flame', label: { th: 'นักล่าดีล', en: 'Dealmaker' } },
  { id: 'grad', label: { th: 'นักวางแผน', en: 'Strategist' } },
];

export const PLAYER_COLOR_OPTIONS: { hex: string; label: BilingualText }[] = [
  { hex: '#10b981', label: { th: 'เขียวมรกต', en: 'Emerald' } },
  { hex: '#f97316', label: { th: 'ส้มสดใส', en: 'Orange' } },
  { hex: '#0ea5e9', label: { th: 'ฟ้าสกาย', en: 'Sky Blue' } },
  { hex: '#8b5cf6', label: { th: 'ม่วงไวโอเลต', en: 'Violet' } },
  { hex: '#ec4899', label: { th: 'ชมพูสด', en: 'Pink' } },
  { hex: '#f59e0b', label: { th: 'เหลืองอำพัน', en: 'Amber' } },
];
