/**
 * 公历 → 农历转换工具（1900–2100）。
 *
 * 算法来自经典实现：lunarInfo 里每个整数以位的方式编码一个农历年的月份长度与闰月信息。
 *   bit 16..4  12 位 月份长度（1=大月 30 天，0=小月 29 天）
 *   bit 3..0   4 位  闰月月号（0 表示无闰月）
 *   bit 17     闰月长度（1=30 天，0=29 天）
 *   高位       春节对应公历月日（部分实现会包含）
 *
 * 这里只导出应用里实际会用到的 API：
 *   solar2lunar(date) → { lunarMonth, lunarDay, monthText, dayText, isLeap, zodiac, ganzhi }
 */

// 1900–2100 农历数据（共 201 项）
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
];

const NUMBER_CN = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function lYearDays(y: number): number {
  let sum = 348; // 12 * 29
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  }
  return sum + leapDays(y);
}

function leapMonth(y: number): number {
  return LUNAR_INFO[y - 1900] & 0xf;
}

function leapDays(y: number): number {
  if (leapMonth(y)) {
    return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
  }
  return 0;
}

function monthDays(y: number, m: number): number {
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}

/**
 * 农历 → 公历。给定农历年/月/日（可指定闰月），返回对应公历日期的 YYYY-MM-DD。
 * 用于算春节 / 端午 / 中秋等农历节日落在哪一天。
 */
export function lunar2solar(
  lYear: number,
  lMonth: number,
  lDay: number,
  isLeap = false,
): string | null {
  if (lYear < 1900 || lYear > 2100) return null;

  let offsetDays = 0;
  for (let y = 1900; y < lYear; y++) offsetDays += lYearDays(y);

  const leap = leapMonth(lYear);
  // 一直累加到目标月前
  for (let m = 1; m < lMonth; m++) {
    offsetDays += monthDays(lYear, m);
    // 当月之后如果紧跟闰月，把闰月天数也加进来
    if (m === leap) offsetDays += leapDays(lYear);
  }
  // 如果要求的是本月的闰版本，那还要再加一个本月的天数（跳过常规月）
  if (isLeap && lMonth === leap) offsetDays += monthDays(lYear, lMonth);

  offsetDays += lDay - 1;

  const ms = Date.UTC(1900, 0, 31) + offsetDays * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function formatLunarDay(day: number): string {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  if (day < 10) return '初' + NUMBER_CN[day];
  if (day < 20) return '十' + NUMBER_CN[day - 10];
  if (day < 30) return '廿' + NUMBER_CN[day - 20];
  return '';
}

function formatLunarMonth(month: number, isLeap: boolean): string {
  const m = MONTH_CN[month - 1] ?? '';
  return (isLeap ? '闰' : '') + m + '月';
}

export interface LunarDate {
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeap: boolean;
  monthText: string;
  dayText: string;
  zodiac: string;
  ganzhi: string;
  /** 每个农历月的第一天显示月份，其余日子显示 dayText，便于直接展示 */
  label: string;
}

export function solar2lunar(date: Date): LunarDate | null {
  const y = date.getFullYear();
  if (y < 1900 || y > 2100) return null;

  const baseDate = new Date(1900, 0, 31); // 1900-01-31 = 农历 1900/1/1
  const diff = Math.floor(
    (Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(1900, 0, 31)) / 86400000
  );

  let offset = diff;
  let lunarYear = 1900;
  let temp = 0;
  for (; lunarYear < 2101 && offset > 0; lunarYear++) {
    temp = lYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    lunarYear--;
  }

  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  for (; lunarMonth < 13 && offset > 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === leap + 1 && !isLeap) {
      --lunarMonth;
      isLeap = true;
      temp = leapDays(lunarYear);
    } else {
      temp = monthDays(lunarYear, lunarMonth);
    }
    if (isLeap && lunarMonth === leap + 1) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) {
      isLeap = false;
    } else {
      isLeap = true;
      --lunarMonth;
    }
  }
  if (offset < 0) {
    offset += temp;
    --lunarMonth;
  }
  const lunarDay = offset + 1;

  const ganzhiIndex = (lunarYear - 4) % 60;
  const ganzhi = GAN[ganzhiIndex % 10] + ZHI[ganzhiIndex % 12];
  const zodiac = ZODIAC[(lunarYear - 4) % 12];

  const monthText = formatLunarMonth(lunarMonth, isLeap);
  const dayText = formatLunarDay(lunarDay);
  const label = lunarDay === 1 ? monthText : dayText;

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeap,
    monthText,
    dayText,
    zodiac,
    ganzhi,
    label,
  };
}

/** 24 节气数据（1900–2100 每年每个节气的"日"），用公历月 × 日为粒度近似标注。*/
const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

// 每年节气日期（近似，取 2000–2030 平均值，误差 ±1 天）
const TERM_DAYS: Record<number, number[]> = {
  0: [6, 20], 1: [4, 19], 2: [6, 21], 3: [5, 20], 4: [5, 21], 5: [6, 21],
  6: [7, 23], 7: [8, 23], 8: [8, 23], 9: [8, 23], 10: [7, 22], 11: [7, 22],
};

export function getSolarTerm(date: Date): string | null {
  const m = date.getMonth();
  const d = date.getDate();
  const days = TERM_DAYS[m];
  if (!days) return null;
  if (d === days[0]) return SOLAR_TERMS[m * 2];
  if (d === days[1]) return SOLAR_TERMS[m * 2 + 1];
  return null;
}
