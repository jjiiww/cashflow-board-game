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
  { hex: '#dc2626', label: { th: 'สีแดง', en: 'Red' } },
  { hex: '#1e40af', label: { th: 'สีน้ำเงิน', en: 'Blue' } },
  { hex: '#16a34a', label: { th: 'สีเขียว', en: 'Green' } },
  { hex: '#fa8f48', label: { th: 'สีส้ม', en: 'Orange' } },
  { hex: '#9a6af2', label: { th: 'สีม่วง', en: 'Purple' } },
  { hex: '#111827', label: { th: 'สีดำ', en: 'Black' } },
];
