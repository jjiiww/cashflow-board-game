import { formatStockSymbol } from '../../shared/cards';
import { Asset, Language } from '../../shared/types';

export function getAssetTypeLabel(asset: Asset, lang: Language): string {
  switch (asset.tag) {
    case 'rental_house':
      return lang === 'th' ? 'บ้านเช่า' : 'Rental House';
    case 'condo':
      return lang === 'th' ? 'คอนโด' : 'Condo';
    case 'tuktaw':
      return lang === 'th' ? 'ตึกแถว' : 'Row House';
    case 'apartment':
      return lang === 'th' ? 'อพาร์ตเม้นท์' : 'Apartment';
    case 'software':
      return lang === 'th' ? 'บริษัทซอฟต์แวร์' : 'Software Co.';
    case 'semiconductor':
      return lang === 'th' ? 'บริษัทตัวนำไฟฟ้า' : 'Semiconductor Co.';
    case 'land_10rai':
    case 'land_100sqw':
      return lang === 'th' ? 'ที่ดิน' : 'Land';
    case 'gold':
      return asset.name.th.includes('เหรียญ')
        ? lang === 'th'
          ? 'เหรียญทองคำ'
          : 'Gold Coin'
        : lang === 'th'
        ? 'ทองคำ'
        : 'Gold';
    case 'guesthouse':
      return lang === 'th' ? 'เกสต์เฮ้าส์' : 'Guesthouse';
    case 'carwash':
    case 'carwash_no_buyer':
      return lang === 'th' ? 'กิจการล้างรถ' : 'Car Wash';
    case 'vending_no_buyer':
      return lang === 'th' ? 'กิจการตู้ขายเครื่องดื่ม' : 'Vending Business';
    case 'arcade_no_buyer':
      return lang === 'th' ? 'กิจการตู้เกม' : 'Arcade Business';
    case 'lp':
      return lang === 'th' ? 'หุ้นส่วนร่วมลงทุน' : 'Limited Partnership';
    case 'brother_loan':
      return lang === 'th' ? 'เงินให้กู้ยืม' : 'Personal Loan';
    default:
      break;
  }

  if (asset.category === 'stock' || asset.category === 'fund') {
    const sym = asset.symbol || asset.tag;
    if (sym === 'กองทุนรวม') {
      return lang === 'th' ? 'กองทุนรวม' : 'Mutual Fund';
    }
    return lang === 'th' ? `หุ้น ${sym}` : formatStockSymbol(sym, 'en');
  }
  if (asset.category === 'land') {
    return lang === 'th' ? 'ที่ดิน' : 'Land';
  }
  if (asset.category === 'gold') {
    return lang === 'th' ? 'ทองคำ' : 'Gold';
  }
  if (asset.category === 'cd') {
    return lang === 'th' ? 'เงินฝากประจำ' : 'CD';
  }
  return asset.name[lang];
}

export function getAssetDetailLines(asset: Asset, lang: Language): string[] {
  if (asset.category === 'stock' || asset.category === 'fund') {
    const shares = asset.shares || 0;
    const pricePerShare = shares > 0 ? Math.round(asset.cost / shares) : asset.pricePerShare || 0;
    return lang === 'th'
      ? [
          `จำนวนหุ้น: ${shares.toLocaleString()}`,
          `ราคาต่อหุ้น: ${pricePerShare.toLocaleString()} ฿`,
        ]
      : [
          `Shares: ${shares.toLocaleString()}`,
          `Price/Share: ${pricePerShare.toLocaleString()} ฿`,
        ];
  }

  if (asset.category === 'real_estate' || asset.mortgage > 0) {
    return lang === 'th'
      ? [
          `ราคาทรัพย์สิน: ${asset.cost.toLocaleString()} ฿`,
          `จดจำนอง: ${asset.mortgage.toLocaleString()} ฿`,
        ]
      : [
          `Cost: ${asset.cost.toLocaleString()} ฿`,
          `Mortgage: ${asset.mortgage.toLocaleString()} ฿`,
        ];
  }

  return [
    lang === 'th'
      ? `ราคาทรัพย์สิน: ${asset.cost.toLocaleString()} ฿`
      : `Cost: ${asset.cost.toLocaleString()} ฿`,
  ];
}

export function getAssetDetailLine(asset: Asset, lang: Language): string {
  return getAssetDetailLines(asset, lang).join(' · ');
}
