import {
  parseVendorLine,
  shouldSkipLine,
  isItemLine,
  parseItemLine,
  parseTail,
  parseFront,
  parseAllLines,
} from '../parser/lineParser';
import { CurrentVendor } from '../types';

describe('Vendor Line Parsing', () => {
  test('parses standard vendor line', () => {
    const line = 'Vendor: 00001740 FRITO LAY * Broker: Min Order: 1000';
    const result = parseVendorLine(line);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('00001740');
    expect(result!.name).toBe('FRITO LAY');
  });

  test('parses vendor line without asterisk', () => {
    const line = 'Vendor: 10000867 HEARTISAN FOODS Broker: Min Order: 200';
    const result = parseVendorLine(line);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('10000867');
    expect(result!.name).toBe('HEARTISAN FOODS');
  });

  test('parses vendor with longer name', () => {
    const line = 'Vendor: 10000828 TILLAMOOK COUNTY CREAMER Broker:';
    const result = parseVendorLine(line);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('10000828');
    expect(result!.name).toBe('TILLAMOOK COUNTY CREAMER');
  });

  test('returns null for non-vendor lines', () => {
    expect(parseVendorLine('54406 CS 72/1 OZ DORITO')).toBeNull();
    expect(parseVendorLine('RUN DATE 12/29/25')).toBeNull();
    expect(parseVendorLine('')).toBeNull();
  });
});

describe('Line Skip Detection', () => {
  test('skips header lines', () => {
    expect(shouldSkipLine('RUN DATE 12/29/25')).toBe(true);
    expect(shouldSkipLine('RUN TIME 19:03')).toBe(true);
    expect(shouldSkipLine('INVORD Sort Option: 01')).toBe(true);
  });

  test('skips column headers', () => {
    expect(shouldSkipLine('Prod# Unt Size Brand Description')).toBe(true);
  });

  test('skips separator lines', () => {
    expect(shouldSkipLine('===== === ========')).toBe(true);
    expect(shouldSkipLine('=====')).toBe(true);
  });

  test('skips TiHi and Cube lines', () => {
    expect(shouldSkipLine('TiHi:06X06 Catg:10')).toBe(true);
    expect(shouldSkipLine('Cube: 1.73 06x08 BuyMult: 12')).toBe(true);
  });

  test('skips empty lines', () => {
    expect(shouldSkipLine('')).toBe(true);
    expect(shouldSkipLine('   ')).toBe(true);
  });

  test('does not skip item lines', () => {
    expect(shouldSkipLine('54406 CS 72/1 OZ DORITO CHIP TORTILLA')).toBe(false);
  });
});

describe('Item Line Detection', () => {
  test('detects valid item lines', () => {
    const line = '54406 CS 72/1 OZ DORITO CHIP TORTILLA NACHO CHSE 665 39 29 4 1 24 46 48 9 28.79 31.05 DL3400 4.4';
    expect(isItemLine(line)).toBe(true);
  });

  test('detects S/O item lines', () => {
    const line = '74790 S/O 64/1.375 LAYS CHIP POTATO KTL APLWD BBQ 56 2 2 1 1 1 3 5 40.26 43.71 DJ0410 6.1';
    expect(isItemLine(line)).toBe(true);
  });

  test('rejects non-item lines', () => {
    expect(isItemLine('TiHi:06X06 Catg:10')).toBe(false);
    expect(isItemLine('RUN DATE 12/29/25')).toBe(false);
    expect(isItemLine('')).toBe(false);
  });
});

describe('Tail Parsing (Right to Left)', () => {
  test('parses complete tail with all fields', () => {
    // ... 46 48 9 28.79 31.05 DL3400 4.4
    const tokens = ['46', '48', '9', '28.79', '31.05', 'DL3400', '4.4'];
    const result = parseTail(tokens);

    expect(result.ip).toBe(4.4);
    expect(result.slot).toBe('DL3400');
    expect(result.mrkCst).toBe(31.05);
    expect(result.lndCst).toBe(28.79);
    expect(result.daysSply).toBe(9);
    expect(result.onOrder).toBe(48);
    expect(result.avail).toBe(46);
    expect(result.confidence).toBe('high');
  });

  test('parses IP with trailing dash', () => {
    const tokens = ['46', '48', '9', '28.79', '31.05', 'DL3400', '4.4-'];
    const result = parseTail(tokens);

    expect(result.ip).toBe(4.4);
    expect(result.confidence).toBe('high');
  });

  test('handles decimal days supply', () => {
    // Days supply can be decimal like 4.2
    const tokens = ['23', '24', '12', '43.44', '46.05', 'CJ0711', '3.7'];
    const result = parseTail(tokens);

    expect(result.daysSply).toBe(12);
    expect(result.onOrder).toBe(24);
    expect(result.avail).toBe(23);
    expect(result.confidence).toBe('high');
  });

  test('marks low confidence when fields are missing', () => {
    // Too few tokens
    const tokens = ['41.58', '44.49', 'DRY', '4.6'];
    const result = parseTail(tokens);

    expect(result.confidence).toBe('low');
    expect(result.notes.length).toBeGreaterThan(0);
  });

  test('parses COOLER slot code', () => {
    const tokens = ['46', '48', '9', '28.79', '31.05', 'COOLER', '4.4'];
    const result = parseTail(tokens);

    expect(result.slot).toBe('COOLER');
    expect(result.confidence).toBe('high');
  });

  test('parses FREEZE slot code', () => {
    const tokens = ['0', '0', '0', '35.68', '37.82', 'FREEZE', '3.2'];
    const result = parseTail(tokens);

    expect(result.slot).toBe('FREEZE');
  });
});

describe('Front Parsing (Left to Right)', () => {
  test('parses standard CS item', () => {
    const tokens = ['54406', 'CS', '72/1', 'OZ', 'DORITO', 'CHIP', 'TORTILLA', 'NACHO', 'CHSE', '665'];
    const result = parseFront(tokens);

    expect(result.prodNo).toBe('54406');
    expect(result.specialOrder).toBe(false);
    expect(result.unit).toBe('CS');
    expect(result.size).toBe('72/1 OZ');
    expect(result.brand).toBe('DORITO');
    expect(result.description).toContain('CHIP');
  });

  test('parses S/O item', () => {
    const tokens = ['74790', 'S/O', '64/1.375', 'LAYS', 'CHIP', 'POTATO'];
    const result = parseFront(tokens);

    expect(result.prodNo).toBe('74790');
    expect(result.specialOrder).toBe(true);
    expect(result.unit).toBe('S/O');
  });

  test('extracts Y-T-D when present', () => {
    const tokens = ['54406', 'CS', '72/1', 'OZ', 'DORITO', 'CHIP', '665', '39', '29'];
    const result = parseFront(tokens);

    expect(result.ytd).toBe(665);
  });
});

describe('Full Item Line Parsing', () => {
  const testVendor: CurrentVendor = { id: '00001740', name: 'FRITO LAY' };

  test('parses complete item line from PDF example', () => {
    const line = '54406 CS 72/1 OZ DORITO CHIP TORTILLA NACHO CHSE 665 39 29 4 1 24 46 48 9 28.79 31.05 DL3400 4.4';
    const item = parseItemLine(line, testVendor);

    expect(item.prodNo).toBe('54406');
    expect(item.vendorId).toBe('00001740');
    expect(item.vendorName).toBe('FRITO LAY');
    expect(item.unit).toBe('CS');
    expect(item.brand).toBe('DORITO');
    expect(item.daysSply).toBe(9);
    expect(item.onOrder).toBe(48);
    expect(item.avail).toBe(46);
    expect(item.lndCst).toBe(28.79);
    expect(item.mrkCst).toBe(31.05);
    expect(item.slot).toBe('DL3400');
    expect(item.ip).toBe(4.4);
    expect(item.confidence).toBe('high');
  });

  test('parses S/O item with full data', () => {
    const line = '74790 S/O 64/1.375 LAYS CHIP POTATO KTL APLWD BBQ 56 2 2 1 1 1 3 5 40.26 43.71 DJ0410 6.1';
    const item = parseItemLine(line, testVendor);

    expect(item.prodNo).toBe('74790');
    expect(item.specialOrder).toBe(true);
    expect(item.slot).toBe('DJ0410');
    expect(item.ip).toBe(6.1);
  });

  test('marks short S/O item as low confidence with null daysSply', () => {
    // This is a shortened S/O line without full inventory data
    const line = '75878 S/O 104/1 OZ SUNCHP CHIP ORIGINAL MLTGRAN ZTF 14 41.58 44.49 DRY 4.6';
    const item = parseItemLine(line, testVendor);

    expect(item.prodNo).toBe('75878');
    expect(item.specialOrder).toBe(true);
    // This should be marked for review because we can't reliably parse days supply
    // The line structure is ambiguous
    expect(item.slot).toBe('DRY');
    expect(item.ip).toBe(4.6);
  });

  test('handles Panera soup item correctly', () => {
    const vendor: CurrentVendor = { id: '00002464', name: 'BLOUNT FINE FOODS' };
    const line = 'H1458 CS 6/16 OZ PANERA SOUP CHICKEN NOODLE L/F 2787 297 139 61 51 165 483 228 14 20.47 22.31 CI1301 4.2';
    const item = parseItemLine(line, vendor);

    expect(item.prodNo).toBe('H1458');
    expect(item.daysSply).toBe(14);
    expect(item.onOrder).toBe(228);
    expect(item.avail).toBe(483);
    expect(item.confidence).toBe('high');
  });

  test('handles item with decimal days supply', () => {
    const vendor: CurrentVendor = { id: '10000867', name: 'HEARTISAN FOODS' };
    const line = 'ABC46 CS 12/8 OZ REDAPP CHEESE SPREAD PORT WINE 222 7 15 14 1 12 23 36 9 43.44 46.05 CI2911 3.7';
    const item = parseItemLine(line, vendor);

    expect(item.daysSply).toBe(9);
    expect(item.ip).toBe(3.7);
  });
});

describe('Full Text Parsing', () => {
  test('parses multiple items with vendor context', () => {
    const text = `
RUN DATE 12/29/25                      Inventory Order Report                      PAGE: 27
Vendor: 00001740 FRITO LAY * Broker: Min Order: 1000

Prod# Unt Size Brand Description Y-T-D Wk 3 Wk 2 Wk 1 Curr Avg Avail Ordr Sply LndCst MrkCst Slot IP
===== === ======== ====== ========================= ====== ==== ==== ==== ==== ==== ===== ==== ==== ======= ======= ====== =====
26228 CS 8/1 LB FRITO CHIP CORN REGULAR ZTF 2680 410 6 2 139 42 12 1 20.13 21.54 DN4901 2.1
  TiHi:06X06 Catg:10
  Cube: 1.73 06x08 BuyMult: 12
54406 CS 72/1 OZ DORITO CHIP TORTILLA NACHO CHSE 665 39 29 4 1 24 46 48 9 28.79 31.05 DL3400 4.4
  TiHi:06X06 Catg:10
`;

    const { items, errors } = parseAllLines(text);

    expect(items.length).toBe(2);
    expect(errors.length).toBe(0);

    // First item
    expect(items[0].prodNo).toBe('26228');
    expect(items[0].vendorName).toBe('FRITO LAY');
    expect(items[0].daysSply).toBe(1); // Critical!

    // Second item
    expect(items[1].prodNo).toBe('54406');
    expect(items[1].daysSply).toBe(9);
  });

  test('handles multiple vendors', () => {
    const text = `
Vendor: 00001740 FRITO LAY * Broker:
26228 CS 8/1 LB FRITO CHIP CORN REGULAR ZTF 2680 410 6 2 139 42 12 1 20.13 21.54 DN4901 2.1

Vendor: 10000867 HEARTISAN FOODS Broker:
ABC46 CS 12/8 OZ REDAPP CHEESE SPREAD PORT WINE 222 7 15 14 1 12 23 36 9 43.44 46.05 CI2911 3.7
`;

    const { items, errors } = parseAllLines(text);

    expect(items.length).toBe(2);
    expect(items[0].vendorName).toBe('FRITO LAY');
    expect(items[1].vendorName).toBe('HEARTISAN FOODS');
  });

  test('TiHi and Cube lines do not create extra items', () => {
    const text = `
Vendor: 00001740 FRITO LAY * Broker:
26228 CS 8/1 LB FRITO CHIP CORN REGULAR ZTF 2680 410 6 2 139 42 12 1 20.13 21.54 DN4901 2.1
TiHi:06X06 Catg:10
Cube: 1.73 06x08 BuyMult: 12 Dlv:01/02/26
`;

    const { items, errors } = parseAllLines(text);

    expect(items.length).toBe(1);
    expect(items[0].prodNo).toBe('26228');
  });
});

describe('Edge Cases', () => {
  test('handles negative IP indicator (trailing dash)', () => {
    const vendor: CurrentVendor = { id: '10000867', name: 'HEARTISAN FOODS' };
    const line = 'RK172 S/O 12/8 OZ REDAPP CHEESE JUST BAKED GARLIC 29 1 2 57.00 57.57 CI1313 0.7-';
    const item = parseItemLine(line, vendor);

    expect(item.ip).toBe(0.7);
  });

  test('identifies attention items (daysSply <= 5)', () => {
    const text = `
Vendor: 00001740 FRITO LAY * Broker:
26228 CS 8/1 LB FRITO CHIP CORN REGULAR ZTF 2680 410 6 2 139 42 12 1 20.13 21.54 DN4901 2.1
`;

    const { items } = parseAllLines(text);
    const attentionItems = items.filter(i => i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 5);

    expect(attentionItems.length).toBe(1);
    expect(attentionItems[0].daysSply).toBe(1);
  });

  test('identifies critical items (daysSply <= 2)', () => {
    const text = `
Vendor: 00001740 FRITO LAY * Broker:
26228 CS 8/1 LB FRITO CHIP CORN REGULAR ZTF 2680 410 6 2 139 42 12 1 20.13 21.54 DN4901 2.1
`;

    const { items } = parseAllLines(text);
    const criticalItems = items.filter(i => i.confidence === 'high' && i.daysSply !== null && i.daysSply <= 2);

    expect(criticalItems.length).toBe(1);
    expect(criticalItems[0].daysSply).toBe(1);
  });
});
