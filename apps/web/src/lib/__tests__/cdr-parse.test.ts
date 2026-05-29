import { describe, expect, it } from 'vitest';
import { parseCsvLine, rowFromCols } from '../cdr';

describe('parseCsvLine', () => {
  it('splits simple double-quoted comma-separated fields', () => {
    expect(parseCsvLine('"a","b","c"')).toEqual(['a', 'b', 'c']);
  });

  it('handles unquoted fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles an escaped double-quote ("") inside a quoted field', () => {
    expect(parseCsvLine('"a","he said ""hi""","c"')).toEqual(['a', 'he said "hi"', 'c']);
  });

  it('keeps commas that appear inside a quoted field', () => {
    expect(parseCsvLine('"a,b","c"')).toEqual(['a,b', 'c']);
  });

  it('returns empty strings for empty fields', () => {
    expect(parseCsvLine('"","x",""')).toEqual(['', 'x', '']);
  });
});

describe('rowFromCols', () => {
  // FIELDS_18: accountcode,src,dst,dcontext,clid,channel,dstchannel,lastapp,lastdata,
  //            start,answer,end,duration,billsec,disposition,amaflag,userfield,uniqueid
  function cols18(): string[] {
    return [
      '', '1001', '9001', 'internal', '"Reception" <1001>',
      'PJSIP/1001-0001', 'PJSIP/9001-0002', 'Dial', 'PJSIP/9001,30',
      '2026-05-20 10:00:00', '2026-05-20 10:00:05', '2026-05-20 10:01:00',
      '60', '55', 'ANSWERED', 'DOCUMENTATION', 'tag-x', '1747731600.1',
    ];
  }

  it('maps an 18-field row, taking the last column as uniqueid and slot 16 as userfield', () => {
    const row = rowFromCols(cols18());
    expect(row).not.toBeNull();
    expect(row!.uniqueid).toBe('1747731600.1');
    expect(row!.userfield).toBe('tag-x');
    expect(row!.src).toBe('1001');
    expect(row!.dst).toBe('9001');
    expect(row!.disposition).toBe('ANSWERED');
    expect(row!.billsec).toBe('55');
  });

  it('maps a 17-field row (no userfield), uniqueid in the last slot, userfield defaulting to empty', () => {
    const cols = cols18();
    cols.splice(16, 1); // remove userfield -> 17 columns, uniqueid now last
    const row = rowFromCols(cols);
    expect(row).not.toBeNull();
    expect(row!.uniqueid).toBe('1747731600.1');
    expect(row!.userfield).toBe('');
    expect(row!.disposition).toBe('ANSWERED');
  });

  it('returns null when there are fewer than 17 columns', () => {
    expect(rowFromCols(['a', 'b', 'c'])).toBeNull();
  });

  it('round-trips a full Asterisk CSV line through parseCsvLine + rowFromCols', () => {
    const line =
      '"","1001","9001","internal","""Reception"" <1001>","PJSIP/1001-0001",' +
      '"PJSIP/9001-0002","Dial","PJSIP/9001,30","2026-05-20 10:00:00",' +
      '"2026-05-20 10:00:05","2026-05-20 10:01:00","60","55","ANSWERED",' +
      '"DOCUMENTATION","","1747731600.1"';
    const row = rowFromCols(parseCsvLine(line));
    expect(row!.uniqueid).toBe('1747731600.1');
    expect(row!.clid).toBe('"Reception" <1001>');
    expect(row!.userfield).toBe('');
  });
});
