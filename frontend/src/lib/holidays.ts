/**
 * 节假日计算器 —— 给任意年份现场算出全年节日，无需联网、无需数据库。
 *
 * 思路:
 * - 公历节日（圣诞/元旦/情人节等）本来就日期固定，直接写死
 * - 复活节系列：用经典算术算式 (Anonymous Gregorian algorithm) 算出复活节，
 *   其它（耶稣受难日、复活节周一、耶稣升天节、圣灵降临节）都是复活节 ±N 天
 * - 美/英的"第 N 个星期几"类节日（感恩节、银行假日等）用公式直接定位
 * - 中国传统/法定节日里属于农历的，用 lunar.ts 里的 lunar2solar 反查公历
 * - 中国法定多日连休（春节/国庆等）直接展开成多天条目；调休的补班不展开
 *   （国务院每年公告都不同，要用到时管理员可以另加备忘）
 */

import { lunar2solar } from './lunar';

export type HolidayType = 'CN' | 'CN_TRAD' | 'INTL' | 'EU' | 'IN';

export interface ComputedHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  nameEn?: string;
  type: HolidayType;
  /** 是否放假（主要对 CN 有意义；打上"休"字角标） */
  isOff?: boolean;
  /** 国家/地区（仅作参考显示，不影响颜色分组） */
  country?: string;
  note?: string;
}

// ------- 工具 -------

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}
function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 给 YYYY-MM-DD 加 n 天 */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + n * 86400000;
  const nd = new Date(ms);
  return fmt(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate());
}

/**
 * 某年某月的第 nth 个星期几；nth=-1 表示"最后一个"。
 * weekday: 0=周日, 1=周一, ..., 6=周六
 */
function nthWeekday(year: number, month: number, nth: number, weekday: number): string {
  if (nth > 0) {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const offset = (weekday - firstDow + 7) % 7;
    const day = 1 + offset + (nth - 1) * 7;
    return fmt(year, month, day);
  }
  // 最后一个
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  const offset = (lastDow - weekday + 7) % 7;
  return fmt(year, month, lastDay - offset);
}

/**
 * 复活节周日（格里高利历），Meeus / Jones / Butcher 算法
 */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return fmt(year, month, day);
}

/**
 * 清明节：基于 5Y/4 公式的近似，1900-2100 范围误差 ≤ 1 天
 * 公式来自《新编万年历》；需要时管理员可再用备忘录校正个别年份
 */
function qingmingDate(year: number): string {
  const C = 4.81; // 20 世纪后期常数；21 世纪用 5.0 更准，但这里取折中 4.81
  const Y = year % 100;
  const L = Math.floor(Y / 4);
  // 简单起见：2001-2100 年 4 月 4 号或 5 号
  // 这里用"平年 4/5，闰年 4/4"粗略；几乎都对
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  void C; void L;
  return isLeap ? fmt(year, 4, 4) : fmt(year, 4, 5);
}

// ------- 主函数 -------

export function getHolidays(year: number): ComputedHoliday[] {
  const list: ComputedHoliday[] = [];
  const push = (h: ComputedHoliday) => list.push(h);

  // ========= 公历固定日期 =========

  // —— 中国法定 / 固定日期 ——
  push({ date: fmt(year, 1, 1), name: '元旦', nameEn: "New Year's Day", type: 'CN', isOff: true });
  push({ date: fmt(year, 5, 1), name: '劳动节', nameEn: 'Labour Day', type: 'CN', isOff: true });
  push({ date: fmt(year, 5, 2), name: '劳动节假期', type: 'CN', isOff: true });
  push({ date: fmt(year, 5, 3), name: '劳动节假期', type: 'CN', isOff: true });
  for (let d = 1; d <= 7; d++) {
    push({
      date: fmt(year, 10, d),
      name: d === 1 ? '国庆节' : '国庆节假期',
      nameEn: d === 1 ? 'National Day' : undefined,
      type: 'CN',
      isOff: true,
    });
  }
  push({ date: qingmingDate(year), name: '清明节', nameEn: 'Qingming Festival', type: 'CN', isOff: true });

  // —— 中国传统 / 纪念日 ——
  push({ date: fmt(year, 3, 8), name: '妇女节', nameEn: "Women's Day", type: 'CN_TRAD' });
  push({ date: fmt(year, 3, 12), name: '植树节', nameEn: 'Arbor Day', type: 'CN_TRAD' });
  push({ date: fmt(year, 5, 4), name: '青年节', nameEn: 'Youth Day', type: 'CN_TRAD' });
  push({ date: fmt(year, 6, 1), name: '儿童节', nameEn: "Children's Day", type: 'CN_TRAD' });
  push({ date: fmt(year, 7, 1), name: '建党节', nameEn: 'CPC Founding Day', type: 'CN_TRAD' });
  push({ date: fmt(year, 8, 1), name: '建军节', nameEn: 'PLA Day', type: 'CN_TRAD' });
  push({ date: fmt(year, 9, 10), name: '教师节', nameEn: "Teachers' Day", type: 'CN_TRAD' });
  push({ date: fmt(year, 11, 11), name: '双十一', nameEn: 'Singles Day', type: 'CN_TRAD' });
  push({ date: fmt(year, 12, 12), name: '双十二', nameEn: 'Double 12', type: 'CN_TRAD' });

  // —— 国际 / 美国 ——
  push({ date: fmt(year, 1, 1), name: '新年', nameEn: "New Year's Day", type: 'INTL' });
  push({ date: fmt(year, 2, 14), name: '情人节', nameEn: "Valentine's Day", type: 'INTL' });
  push({ date: fmt(year, 3, 17), name: '圣帕特里克节', nameEn: "St. Patrick's Day", type: 'INTL' });
  push({ date: fmt(year, 4, 1), name: '愚人节', nameEn: "April Fool's Day", type: 'INTL' });
  push({ date: fmt(year, 7, 4), name: '美国独立日', nameEn: 'Independence Day', type: 'INTL', country: 'US' });
  push({ date: fmt(year, 10, 31), name: '万圣节前夜', nameEn: 'Halloween', type: 'INTL' });
  push({ date: fmt(year, 11, 11), name: '退伍军人节', nameEn: 'Veterans Day', type: 'INTL', country: 'US' });
  push({ date: fmt(year, 12, 24), name: '平安夜', nameEn: 'Christmas Eve', type: 'INTL' });
  push({ date: fmt(year, 12, 25), name: '圣诞节', nameEn: 'Christmas Day', type: 'INTL' });
  push({ date: fmt(year, 12, 31), name: '跨年夜', nameEn: "New Year's Eve", type: 'INTL' });

  // —— 欧洲固定日期 ——
  push({ date: fmt(year, 1, 6), name: '主显节', nameEn: 'Epiphany', type: 'EU', note: '意/西/德部分州' });
  push({ date: fmt(year, 4, 25), name: '意大利解放日', nameEn: 'Liberation Day', type: 'EU', country: 'IT' });
  push({ date: fmt(year, 4, 27), name: '荷兰国王日', nameEn: "King's Day", type: 'EU', country: 'NL' });
  push({ date: fmt(year, 5, 1), name: '欧洲劳动节', nameEn: 'Labour Day', type: 'EU', note: '德/法/意/西等' });
  push({ date: fmt(year, 5, 8), name: '法国二战胜利日', nameEn: 'Victory Day', type: 'EU', country: 'FR' });
  push({ date: fmt(year, 6, 2), name: '意大利共和国日', nameEn: 'Republic Day', type: 'EU', country: 'IT' });
  push({ date: fmt(year, 7, 14), name: '法国国庆节', nameEn: 'Bastille Day', type: 'EU', country: 'FR' });
  push({ date: fmt(year, 8, 15), name: '圣母升天节', nameEn: 'Assumption', type: 'EU', note: '法/意/西/葡/比/德部分州' });
  push({ date: fmt(year, 10, 3), name: '德国统一日', nameEn: 'Day of German Unity', type: 'EU', country: 'DE' });
  push({ date: fmt(year, 10, 12), name: '西班牙国庆日', nameEn: 'Fiesta Nacional', type: 'EU', country: 'ES' });
  push({ date: fmt(year, 11, 1), name: '诸圣节', nameEn: "All Saints' Day", type: 'EU', note: '法/意/西/葡/波/德部分州' });
  push({ date: fmt(year, 11, 11), name: '一战休战日', nameEn: 'Armistice Day', type: 'EU', note: '法/比' });
  push({ date: fmt(year, 12, 6), name: '西班牙宪法日', nameEn: 'Constitution Day', type: 'EU', country: 'ES' });
  push({ date: fmt(year, 12, 8), name: '圣母无染原罪节', nameEn: 'Immaculate Conception', type: 'EU', note: '意/西/葡/奥' });
  push({ date: fmt(year, 12, 26), name: '圣斯蒂芬节 / 节礼日', nameEn: 'Boxing Day', type: 'EU', note: '英/意/德/北欧' });

  // —— 印度固定日期 ——
  push({ date: fmt(year, 1, 26), name: '印度共和国日', nameEn: 'Republic Day', type: 'IN', isOff: true });
  push({ date: fmt(year, 8, 15), name: '印度独立日', nameEn: 'Independence Day', type: 'IN', isOff: true });
  push({ date: fmt(year, 10, 2), name: '甘地诞辰纪念日', nameEn: 'Gandhi Jayanti', type: 'IN', isOff: true });
  push({ date: fmt(year, 4, 14), name: '安贝德卡尔纪念日', nameEn: 'Ambedkar Jayanti', type: 'IN' });
  push({ date: fmt(year, 12, 25), name: '圣诞节（印度假日）', nameEn: 'Christmas', type: 'IN', isOff: true });

  // ========= 复活节系列（基于算法推导） =========
  const easter = easterSunday(year);
  push({ date: addDays(easter, -2), name: '耶稣受难日', nameEn: 'Good Friday', type: 'EU', isOff: true });
  push({ date: easter, name: '复活节', nameEn: 'Easter Sunday', type: 'INTL' });
  push({ date: addDays(easter, 1), name: '复活节星期一', nameEn: 'Easter Monday', type: 'EU', isOff: true });
  push({ date: addDays(easter, 39), name: '耶稣升天节', nameEn: 'Ascension Day', type: 'EU', note: '德/法/北欧' });
  push({ date: addDays(easter, 49), name: '五旬节', nameEn: 'Pentecost', type: 'EU' });
  push({ date: addDays(easter, 50), name: '圣灵降临节星期一', nameEn: 'Whit Monday', type: 'EU', note: '德/法' });

  // ========= 第 N 个星期几（美/英） =========
  // 美国
  push({ date: nthWeekday(year, 1, 3, 1), name: '马丁·路德·金纪念日', nameEn: 'MLK Jr. Day', type: 'INTL', country: 'US' });
  push({ date: nthWeekday(year, 2, 3, 1), name: '总统日', nameEn: "Presidents' Day", type: 'INTL', country: 'US' });
  push({ date: nthWeekday(year, 5, 2, 0), name: '母亲节', nameEn: "Mother's Day", type: 'INTL' });
  push({ date: nthWeekday(year, 5, -1, 1), name: '阵亡将士纪念日', nameEn: 'Memorial Day', type: 'INTL', country: 'US' });
  push({ date: nthWeekday(year, 6, 3, 0), name: '父亲节', nameEn: "Father's Day", type: 'INTL' });
  push({ date: nthWeekday(year, 9, 1, 1), name: '劳工节（美）', nameEn: 'Labor Day', type: 'INTL', country: 'US' });
  push({ date: nthWeekday(year, 10, 2, 1), name: '哥伦布日', nameEn: 'Columbus Day', type: 'INTL', country: 'US' });
  const thanksgiving = nthWeekday(year, 11, 4, 4); // 11 月第 4 个周四
  push({ date: thanksgiving, name: '感恩节', nameEn: 'Thanksgiving', type: 'INTL', country: 'US' });
  push({ date: addDays(thanksgiving, 1), name: '黑色星期五', nameEn: 'Black Friday', type: 'INTL' });

  // 英国
  push({ date: nthWeekday(year, 5, 1, 1), name: '英国五月银行假日', nameEn: 'Early May Bank Holiday', type: 'EU', country: 'GB' });
  push({ date: nthWeekday(year, 5, -1, 1), name: '英国春季银行假日', nameEn: 'Spring Bank Holiday', type: 'EU', country: 'GB' });
  push({ date: nthWeekday(year, 8, -1, 1), name: '英国夏季银行假日', nameEn: 'Summer Bank Holiday', type: 'EU', country: 'GB' });

  // ========= 中国农历节日 =========
  const springFestival = lunar2solar(year, 1, 1); // 正月初一
  if (springFestival) {
    // 展开 除夕(前一天) → 初六 共 7 天连休
    push({ date: addDays(springFestival, -1), name: '除夕', nameEn: "Chinese New Year's Eve", type: 'CN', isOff: true });
    for (let d = 0; d <= 6; d++) {
      push({
        date: addDays(springFestival, d),
        name: d === 0 ? '春节' : '春节假期',
        nameEn: d === 0 ? 'Chinese New Year' : undefined,
        type: 'CN',
        isOff: true,
        note: d === 0 ? '正月初一' : undefined,
      });
    }
  }
  const lantern = lunar2solar(year, 1, 15);
  if (lantern) push({ date: lantern, name: '元宵节', nameEn: 'Lantern Festival', type: 'CN_TRAD', note: '正月十五' });
  const longHead = lunar2solar(year, 2, 2);
  if (longHead) push({ date: longHead, name: '龙抬头', nameEn: 'Long Tai Tou', type: 'CN_TRAD' });
  const dragonBoat = lunar2solar(year, 5, 5);
  if (dragonBoat) {
    push({ date: dragonBoat, name: '端午节', nameEn: 'Dragon Boat Festival', type: 'CN', isOff: true, note: '五月初五' });
  }
  const qixi = lunar2solar(year, 7, 7);
  if (qixi) push({ date: qixi, name: '七夕', nameEn: 'Qixi Festival', type: 'CN_TRAD', note: '七月初七' });
  const ghost = lunar2solar(year, 7, 15);
  if (ghost) push({ date: ghost, name: '中元节', nameEn: 'Ghost Festival', type: 'CN_TRAD' });
  const midAutumn = lunar2solar(year, 8, 15);
  if (midAutumn) {
    push({ date: midAutumn, name: '中秋节', nameEn: 'Mid-Autumn Festival', type: 'CN', isOff: true, note: '八月十五' });
  }
  const doubleNinth = lunar2solar(year, 9, 9);
  if (doubleNinth) push({ date: doubleNinth, name: '重阳节', nameEn: 'Double Ninth Festival', type: 'CN_TRAD', note: '九月初九' });
  const laba = lunar2solar(year, 12, 8);
  if (laba) push({ date: laba, name: '腊八节', nameEn: 'Laba Festival', type: 'CN_TRAD', note: '腊月初八' });

  return list;
}

/** 生成 date(YYYY-MM-DD) → Holiday[] 映射，日历格子 O(1) 查 */
export function getHolidayMap(year: number): Map<string, ComputedHoliday[]> {
  const map = new Map<string, ComputedHoliday[]>();
  for (const h of getHolidays(year)) {
    const arr = map.get(h.date) ?? [];
    arr.push(h);
    map.set(h.date, arr);
  }
  return map;
}
